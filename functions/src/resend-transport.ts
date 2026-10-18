/* eslint-disable max-len, comma-spacing, no-control-regex, space-before-blocks, indent, keyword-spacing, curly, switch-colon-spacing, key-spacing, brace-style, semi-spacing */
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {resendAdminNotification} from "./admin-notification-events";
import {
  emailHash,nextMailStatus,safeMail,validMailToSend,verifyResendWebhook,
  type ServerMail,
} from "./resend-mail-policy";

const apiKey=defineSecret("RESEND_API_KEY");
const webhookSecret=defineSecret("RESEND_WEBHOOK_SECRET");
type AnyRow=Record<string,unknown>;
const row=(value:unknown):value is AnyRow=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const text=(value:unknown)=>typeof value==="string"?value:"";
const enabled=()=>process.env.RESEND_LIVE_EMAIL_ENABLED==="true";
const fromName=()=>process.env.RESEND_FROM_NAME??"";
const fromEmail=()=>process.env.RESEND_FROM_EMAIL??"";
const from=()=>fromName().trim()?`${fromName().trim()} <${fromEmail().trim()}>`:fromEmail().trim();
const replyTo=()=>process.env.RESEND_REPLY_TO??"";
const cutoff=()=>process.env.RESEND_ACTIVATION_CUTOFF??"";
const writeAdminNotification=async (
  db:ReturnType<typeof getFirestore>,
  input:ReturnType<typeof resendAdminNotification>,
)=>{
  if(!input)return;
  await db.doc(`notificationAdminEvents/${input.id}`).set(input);
};

/**
 * Production send pipeline. No client can create notificationOutbox records.
 * Deployment is inert until the owner verifies sender, recipient policy,
 * API key, fresh activation cutoff, and explicitly enables transport.
 * No historic notification candidates are replayed.
 */
export const deliverApprovedNotification=onDocumentCreated({
  document:"notificationOutbox/{id}",region:"us-central1",
  secrets:[apiKey],maxInstances:2,
},async (event)=>{
  if(!enabled()||!safeMail(fromEmail())||!safeMail(replyTo())||!cutoff()||!apiKey.value())return;
  if(!event.data)return;
  const db=getFirestore();
  const mailRef=event.data.ref;
  const snapshot=await db.runTransaction(async (tx)=>{
    const state=await tx.get(mailRef);
    if(!state.exists)return null;
    const mail=state.data() as ServerMail;
    if(!mail||mail.id!==mailRef.id||validMailToSend(mail,cutoff()))return null;
    const trustedKinds:Record<string,string>={
      "order_confirmed":"order.confirmed.customer",
      "order_cancelled":"order.cancelled.customer",
      "order_cancelled_rep":"order.cancelled.rep",
      "order_returned":"order.returned_for_correction",
      "order_out_for_delivery":"delivery.out_for_delivery.customer",
      "payment_received":"payment.received.customer",
      "payment_failed":"payment.failed.customer",
      "payment_refunded":"payment.refunded.customer",
      "payment_refunded_rep":"payment.refunded.rep",
      "pricing_warning_customer":"program_pricing.expiring_30d.customer",
      "pricing_warning_rep":"program_pricing.expiring_30d.rep",
      "inventory_reorder":"inventory.reorder_threshold",
    };
    const trustedSystem=
      mail.authorizationType==="Trusted system"&&(
        (mail.policyId==="delivery.delivered.customer"&&
         mail.kind==="delivered_invoice"&&
         mail.approvedBy==="system:delivery-invoice")||
        (mail.approvedBy==="system:commercial-policy"&&
         trustedKinds[mail.kind]===mail.policyId));
    const references=[
      ...(!trustedSystem?[db.doc(`userAccess/${mail.approvedBy}`)]:[]),
      ...(mail.recipientUid?[db.doc(`userAccess/${mail.recipientUid}`)]:[]),
      db.doc(`notificationSuppressions/${emailHash(mail.to)}`),
    ];
    const found=await Promise.all(references.map((ref)=>tx.get(ref)));
    let index=0;
    const approver=trustedSystem?null:found[index++];
    const recipient=mail.recipientUid?found[index++]:null;
    const suppression=found[index];
    if((approver&&(approver.data()?.accountState!=="Active"||
       approver.data()?.role!=="Administrator"))||
       (recipient&&recipient.data()?.accountState!=="Active")||
       suppression?.exists){
      tx.update(mailRef,{status:"Suppressed",lastError:"Access or suppression policy rejected this recipient."});
      return null;
    }
    const start=new Date().toISOString();
    tx.update(mailRef,{status:"Attempting",firstAttemptAt:start,attemptCount:1});
    return mail;
  });
  if(!snapshot)return;
  // A provider request with an unknown response must not be blindly retried
  // after Resend's 24-hour idempotency window.
  try{
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${apiKey.value()}`,
        "Content-Type":"application/json",
        "Idempotency-Key":snapshot.idempotencyKey,
      },
      body:JSON.stringify({
        from:from(),to:[snapshot.to],
        reply_to:replyTo(),subject:snapshot.subject,text:snapshot.text,
        ...(snapshot.attachments?.length?{
          attachments:snapshot.attachments.map((attachment)=>({
            filename:attachment.filename,
            content:attachment.content,
            content_type:attachment.contentType,
          })),
        }:{}),
      }),
    });
    const payload=await response.json() as unknown;
    const data=row(payload)?payload:{};
    const providerId=text(data.id);
    if(response.ok&&/^[A-Za-z0-9_-]{8,128}$/.test(providerId)){
      await db.runTransaction(async (tx)=>{
        const index=db.doc(`notificationProviderIndex/${providerId}`);
        const current=await tx.get(mailRef);
        if(current.data()?.status!=="Attempting")return;
        tx.create(index,{outboxId:snapshot.id,createdAt:new Date().toISOString()});
        tx.update(mailRef,{
          status:"Provider accepted",providerId,providerAcceptedAt:new Date().toISOString(),
        });
      });
    }else{
      const createdAt=new Date().toISOString();
      const lastError=`Resend returned status ${response.status}. Inspect provider console before retry.`;
      await Promise.all([
        mailRef.update({status:"Review required",lastError}),
        writeAdminNotification(db,resendAdminNotification({
          eventId:`send-${snapshot.id}`,
          status:"Review required",
          mail:snapshot,
          createdAt,
          errorDetail:lastError,
        })),
      ]);
    }
  }catch{
    const createdAt=new Date().toISOString();
    const lastError="Provider response unknown. Reconcile by idempotency key; do not blind retry.";
    await Promise.all([
      mailRef.update({status:"Review required",lastError}),
      writeAdminNotification(db,resendAdminNotification({
        eventId:`send-${snapshot.id}`,
        status:"Review required",
        mail:snapshot,
        createdAt,
        errorDetail:lastError,
      })),
    ]);
  }
});

/** Signed Resend events are the only way a provider delivery status changes. */
export const receiveResendWebhook=onRequest({
  region:"us-central1",secrets:[webhookSecret],maxInstances:2,
},async (request,response)=>{
  if(request.method!=="POST"){response.status(405).send("Method not allowed");return;}
  const raw=request.rawBody?.toString("utf8")??"";
  if(!verifyResendWebhook(raw,
    text(request.get("svix-id")),text(request.get("svix-timestamp")),
    text(request.get("svix-signature")),webhookSecret.value()??"")){
    response.status(401).send("Unauthorized");return;
  }
  let decoded:unknown;
  try{decoded=JSON.parse(raw);}catch{response.status(400).send("Invalid");return;}
  if(!row(decoded)||!row(decoded.data)){
    response.status(400).send("Invalid");return;
  }
  const eventType=text(decoded.type);
  const providerId=text(decoded.data.email_id);
  const eventId=text(request.get("svix-id"));
  const next=nextMailStatus("Provider accepted",eventType);
  if(!next){response.status(200).send("Ignored");return;}
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(providerId)||
      !/^[A-Za-z0-9_-]{8,200}$/.test(eventId)){
    response.status(400).send("Invalid");return;
  }
  const db=getFirestore();
  const indexRef=db.doc(`notificationProviderIndex/${providerId}`);
  try{
    const found=await indexRef.get();
    if(!found.exists){response.status(503).send("Not yet indexed");return;}
    const outboxId=text(found.data()?.outboxId);
    const outboxRef=db.doc(`notificationOutbox/${outboxId}`);
    const eventRef=db.doc(`notificationWebhookEvents/${eventId}`);
    await db.runTransaction(async (tx)=>{
      const [outbox,priorEvent]=await Promise.all([
        tx.get(outboxRef),tx.get(eventRef),
      ]);
      if(priorEvent.exists||!outbox.exists)return;
      const current=outbox.data() as ServerMail;
      const status=nextMailStatus(current.status,eventType);
      tx.create(eventRef,{
        outboxId,providerId,type:eventType,receivedAt:new Date().toISOString(),
      });
      if(status){
        const createdAt=new Date().toISOString();
        tx.update(outboxRef,{status,updatedAt:createdAt});
        if(["Bounced","Complained","Suppressed"].includes(status)){
          tx.set(db.doc(`notificationSuppressions/${emailHash(current.to)}`),{
            reason:status,providerId,createdAt,
          });
        }
        const adminEvent=resendAdminNotification({
          eventId,
          status,
          mail:current,
          createdAt,
        });
        if(adminEvent){
          tx.set(db.doc(`notificationAdminEvents/${adminEvent.id}`),adminEvent);
        }
      }
    });
    response.status(200).send("OK");
  }catch{
    response.status(503).send("Retry later");
  }
});
