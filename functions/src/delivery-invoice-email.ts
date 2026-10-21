/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, curly, key-spacing, brace-style, semi-spacing */
import {createHash} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {onDocumentCreated,onDocumentWritten} from "firebase-functions/v2/firestore";
import {buildSignedInvoicePdf,type InvoicePdfSignature} from "./signed-invoice-pdf";
import {safeMail} from "./resend-mail-policy";

type Row=Record<string,unknown>;

const row=(value:unknown):value is Row=>
  Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:0;
const items=(value:unknown):Row[]=>
  row(value)&&Array.isArray(value.items)?value.items.filter(row):[];
const validInstant=(value:unknown)=>typeof value==="string"&&
  Number.isFinite(Date.parse(value));

const findById=(rows:Row[],id:string)=>rows.find((item)=>text(item.id)===id);

const adminEvent=async (
  message:string,
  sourceRecordId:string,
  eventId:string,
)=>{
  const db=getFirestore();
  const id="delivery-invoice-"+createHash("sha256")
    .update(eventId+"|"+sourceRecordId+"|"+message).digest("hex").slice(0,32);
  await db.doc(`notificationAdminEvents/${id}`).set({
    id,
    policyId:"system.email_failed",
    title:"Signed invoice email needs review",
    detail:message.slice(0,600),
    createdAt:new Date().toISOString(),
    sourceId:eventId,
    sourceRecordId,
    outboxId:"",
    status:"Open",
  });
};

const signatureFrom=(value:unknown,history?:unknown):InvoicePdfSignature|undefined=>{
  if(!row(value)||!validInstant(value.signedAt)||!text(value.capturedBy))return undefined;
  // The browser converts nested signature strokes to strokesJson for Firestore.
  let rawStrokes=value.strokes;
  if(!Array.isArray(rawStrokes)&&typeof value.strokesJson==="string"&&
     value.strokesJson.length<=250_000){
    try{rawStrokes=JSON.parse(value.strokesJson);}catch{return undefined;}
  }
  if(!Array.isArray(rawStrokes))return undefined;
  // Capture time and Delivered-history timestamp come from separate calls.
  const attested=Array.isArray(history)&&history.some((entry)=>
    row(entry)&&text(entry.type)==="Delivered"&&
    text(entry.actorId)===text(value.capturedBy)&&
    validInstant(entry.at)&&
    Math.abs(Date.parse(text(entry.at))-
      Date.parse(text(value.signedAt)))<=60_000);
  if(!attested)return undefined;
  const strokes:Array<Array<[number,number]>>=[];
  for(const rawStroke of rawStrokes.slice(0,80)){
    if(!Array.isArray(rawStroke))continue;
    const stroke:Array<[number,number]>=rawStroke
      .filter((point):point is [number,number]=>
        Array.isArray(point)&&point.length===2&&
        point.every((coordinate)=>typeof coordinate==="number"&&
          Number.isFinite(coordinate)))
      .slice(0,300);
    if(stroke.length>=2)strokes.push(stroke);
  }
  if(!strokes.length)return undefined;
  return {
    strokes,
    recipientName:text(value.recipientName)||undefined,
    signedAt:text(value.signedAt),
  };
};

const orderLines=(order:Row)=>{
  if(Array.isArray(order.lines)){
    const lines=order.lines.filter(row).map((item)=>({
      product:text(item.product)||"Golden Eagle Energy Drink",
      cases:number(item.cases),
      pricePerCase:number(item.pricePerCase),
      amount:number(item.amount),
    })).filter((item)=>item.cases>0&&item.amount>=0);
    if(lines.length)return lines;
  }
  return [{
    product:text(order.product)||"Golden Eagle Energy Drink",
    cases:number(order.cases),
    pricePerCase:number(order.pricePerCase),
    amount:number(order.amount),
  }];
};

const activeAdministrator=async ()=>{
  const db=getFirestore();
  const snapshot=await db.collection("userAccess").get();
  return snapshot.docs.map((doc)=>({
    uid:doc.id,
    data:doc.data() as Row,
  }))
    .filter((item)=>
      text(item.data.role)==="Administrator"&&
      text(item.data.accountState)==="Active")
    .sort((left,right)=>left.uid.localeCompare(right.uid))[0];
};

const queueDeliveredInvoice=async (
  orderId:string,
  deliveredAt:string,
  eventId:string,
  signature?:InvoicePdfSignature,
  adminOverride=false,
)=>{
  const db=getFirestore();
  const refs=[
    db.doc("domains/commercial/fields/orders"),
    db.doc("domains/workspace/fields/orders"),
    db.doc("domains/workspace/fields/accounts"),
    db.doc("domains/workspace/fields/customers"),
    db.doc("domains/commerce/fields/invoices"),
    db.doc("domains/commerce/fields/payments"),
    db.doc("domains/commerce/fields/allocations"),
    db.doc("domains/commerce/fields/credits"),
    db.doc("domains/commerce/fields/refunds"),
    db.doc("domains/workspace/fields/users"),
    db.doc("domains/commercial/fields/_root"),
  ];
  const [
    commercial,workspace,accountsDoc,customersDoc,invoicesDoc,
    paymentsDoc,allocationsDoc,creditsDoc,refundsDoc,usersDoc,rootDoc,
  ]=await db.getAll(...refs);
  const root=row(rootDoc.data()?.data)?rootDoc.data()?.data as Row:{};
  const accountPatches=row(root.accountPatches)?root.accountPatches:{};
  const customerPatches=row(root.customerPatches)?root.customerPatches:{};
  const withPatch=(record:Row|undefined,patches:Row):Row|undefined=>{
    if(!record)return undefined;
    const patch=patches[text(record.id)];
    return row(patch)?{...record,...patch}:record;
  };
  const order=findById(items(commercial.data()),orderId)||
    findById(items(workspace.data()),orderId);
  if(!order){
    await adminEvent("Delivered order "+orderId+
      " could not be found, so its signed invoice was not emailed.",
      orderId,eventId);
    return;
  }
  const invoice=items(invoicesDoc.data())
    .find((item)=>text(item.orderId)===orderId&&text(item.status)!=="Void");
  if(!invoice){
    await adminEvent("Order "+text(order.number)+
      " was delivered but no active invoice record exists. No email was sent.",
      orderId,eventId);
    return;
  }
  const account=withPatch(
    findById(items(accountsDoc.data()),text(order.accountId)),
    accountPatches,
  );
  const customer=account?withPatch(
    findById(items(customersDoc.data()),text(account.customerId)),
    customerPatches,
  ):undefined;
  // Customer invoices are billing-email only. A/P or location is not a fallback.
  const billingEmail=text(customer?.billingEmail);
  if(!safeMail(billingEmail)){
    await adminEvent("Order "+text(order.number)+
      " was delivered but the customer has no valid billing email. "+
      "Invoice "+text(invoice.number)+" was not sent.",
      orderId,eventId);
    return;
  }

  const administrator=await activeAdministrator();
  if(!administrator){
    throw new Error("No active Administrator is available for invoice email.");
  }

  // Match the CRM invoice balance rather than sending a fabricated
  // full-balance reminder after cleared payments, applied credits or refunds.
  const settledPayments=items(paymentsDoc.data())
    .filter((payment)=>text(payment.status)==="Cleared"&&number(payment.amount)>0);
  const settledIds=new Set(settledPayments.map((payment)=>text(payment.id)));
  const invoiceAllocations=items(allocationsDoc.data())
    .filter((allocation)=>text(allocation.invoiceId)===text(invoice.id)&&
      settledIds.has(text(allocation.paymentId))&&number(allocation.amount)>0);
  const allocated=invoiceAllocations.reduce(
    (sum,allocation)=>sum+number(allocation.amount),0);
  const relevantPayments=new Set(invoiceAllocations.map(
    (allocation)=>text(allocation.paymentId)));
  const settledRefunds=items(refundsDoc.data())
    .filter((refund)=>text(refund.status)==="Settled"&&
      relevantPayments.has(text(refund.paymentId))&&number(refund.amount)>0)
    .reduce((sum,refund)=>sum+number(refund.amount),0);
  const paid=Math.max(0,allocated-settledRefunds);
  const credited=items(creditsDoc.data())
    .filter((credit)=>text(credit.invoiceId)===text(invoice.id)&&
      text(credit.status)==="Applied"&&number(credit.amount)>0)
    .reduce((sum,credit)=>sum+number(credit.amount),0);
  const total=number(invoice.total);
  const balance=Math.max(0,total-paid-credited);
  const computedStatus=balance<=0?"Paid":
    balance<total?"Partially paid":
      text(invoice.status)==="Draft"?"Draft":"Open";
  const owner=findById(items(usersDoc.data()),text(order.ownerId));
  const apExtension=text(customer?.accountsPayableExtension);
  const apPhone=text(customer?.accountsPayablePhone)||
    text(customer?.billingPhone);
  const locationContact=[text(account?.contactName),text(account?.contactRole)]
    .filter(Boolean).join(" | ");
  const pdf=buildSignedInvoicePdf({
    invoiceNumber:text(invoice.number),
    orderNumber:text(order.number),
    invoiceDate:text(invoice.issuedAt),
    customerName:text(customer?.name)||text(account?.name)||"Customer",
    billingEmail,
    billingContact:text(customer?.accountsPayableContactName)||
      text(customer?.billingContactName)||undefined,
    billingPhone:apPhone?
      apPhone+(apExtension?" ext. "+apExtension:""):undefined,

    billToAddress:text(invoice.billToAddressSnapshot),
    shipToName:text(account?.locationName)||text(account?.name)||
      "Customer location",
    shipToAddress:text(invoice.shipToAddressSnapshot),
    shipToContact:locationContact||undefined,
    shipToPhone:text(account?.phone)||undefined,
    placedBy:text(owner?.name)||text(order.ownerId)||"Not recorded",
    deliveredAt,
    terms:text(invoice.terms)||"COD",
    dueDate:text(invoice.dueDate)||undefined,
    status:computedStatus,
    total,
    paymentsReceived:paid,
    creditsApplied:credited,
    balanceDue:balance,
    lines:orderLines(order),
    signature,
  });

  const digest=createHash("sha256")
    .update("delivered-invoice|"+orderId+"|"+text(invoice.id))
    .digest("hex");
  const outboxId="delivered-invoice-"+digest;
  const outbox=db.doc(`notificationOutbox/${outboxId}`);
  const createdAt=new Date().toISOString();
  await db.runTransaction(async (tx)=>{
    const existing=await tx.get(outbox);
    if(existing.exists)return;
    tx.create(outbox,{
      id:outboxId,
      kind:"delivered_invoice",
      policyId:"delivery.delivered.customer",
      authorizationType:"Trusted system",
      sourcePath:adminOverride?
        `adminDeliveryOverrides/${orderId}`:
        "domains/delivery/fields/tasks",
      sourceRecordId:orderId,
      eventId,
      templateVersion:1,
      approvedBy:"system:delivery-invoice",
      approvedAt:createdAt,
      to:billingEmail.toLowerCase(),
      subject:"Momentum invoice "+text(invoice.number)+" — delivery confirmed",
      text:[
        "Hello "+(text(customer?.billingContactName)||text(customer?.name)||"there")+",",
        "",
        "Delivery for order "+text(order.number)+" has been confirmed.",
        (signature?
          "Your signed invoice ":
          "Your invoice ")+text(invoice.number)+" is attached as a PDF.",
        "",
        "Please retain this invoice for your records.",
        "",
        "Momentum Distribution Inc.",
      ].join("\n"),
      attachments:[{
        filename:(text(invoice.number)||"Momentum-Invoice")+".pdf",
        content:pdf.toString("base64"),
        contentType:"application/pdf",
      }],
      idempotencyKey:"momentum-email-v1-"+digest,
      status:"Approved",
      createdAt,
    });
  });
};

/**
 * Queue a signed invoice only when a delivery task first becomes Delivered.
 */
export const queueSignedInvoiceOnDelivery=onDocumentWritten({
  document:"domains/delivery/fields/tasks",
  region:"us-central1",
},async (event)=>{
  if(!event.data)return;
  const before=new Map(items(event.data.before.data())
    .map((item)=>[text(item.id),item]));
  for(const task of items(event.data.after.data())){
    const id=text(task.id);
    const previous=before.get(id);
    if(text(task.status)!=="Delivered"||
       !validInstant(task.deliveredAt))continue;
    const cutoff=process.env.RESEND_ACTIVATION_CUTOFF??"";
    if(!validInstant(cutoff)||
       Date.parse(text(task.deliveredAt))<Date.parse(cutoff))continue;
    const signature=signatureFrom(task.signature,task.history);
    const previouslySigned=text(previous?.status)==="Delivered"&&
      Boolean(signatureFrom(previous?.signature,previous?.history));
    // A signature might finish syncing in a separate write after Delivered.
    // Do not lose the customer invoice because the status is unchanged.
    if(previouslySigned)continue;
    if(!signature){
      if(text(previous?.status)!=="Delivered"){
        await adminEvent("Delivery task "+id+
          " reached Delivered without a valid recipient signature. "+
          "The invoice was not emailed.",
          text(task.orderId),event.id);
      }
      continue;
    }
    await queueDeliveredInvoice(
      text(task.orderId),
      text(task.deliveredAt),
      event.id,
      signature,
      false,
    );
  }
});

/**
 * Queue an invoice for a trusted Administrator delivery override.
 */

/**
 * Recover recent signed deliveries when invoice or billing data arrives later.
 * No pre-activation imports or old deliveries may be emailed.
 */
const reconcileRecentSignedInvoices=async ()=>{
  const cutoff=process.env.RESEND_ACTIVATION_CUTOFF??"";
  if(process.env.RESEND_LIVE_EMAIL_ENABLED!=="true"||
     !validInstant(cutoff))return;
  const db=getFirestore();
  const snapshot=await db.doc("domains/delivery/fields/tasks").get();
  const current=Date.now();
  const minimum=Math.max(Date.parse(cutoff),current-7*24*60*60*1000);
  const eligible=items(snapshot.data())
    .filter((task)=>text(task.status)==="Delivered"&&
      validInstant(task.deliveredAt)&&
      Date.parse(text(task.deliveredAt))>=minimum&&
      Date.parse(text(task.deliveredAt))<=current+60_000&&
      text(task.orderId)&&
      Boolean(signatureFrom(task.signature,task.history)))
    .slice(0,100);
  for(const task of eligible){
    await queueDeliveredInvoice(
      text(task.orderId),text(task.deliveredAt),
      "recent-signed-delivery:"+text(task.orderId),
      signatureFrom(task.signature,task.history),false);
  }
};

/** Retry after a delayed invoice ledger write, with outbox idempotency. */
export const retrySignedInvoiceWhenInvoiceReady=onDocumentWritten({
  document:"domains/commerce/fields/invoices",
  region:"us-central1",
},async (event)=>{
  if(!event.data)return;
  await reconcileRecentSignedInvoices();
});

/** Retry only when the billing customer contact record changes. */
export const retrySignedInvoiceWhenCustomerUpdated=onDocumentWritten({
  document:"domains/workspace/fields/customers",
  region:"us-central1",
},async (event)=>{
  if(!event.data)return;
  await reconcileRecentSignedInvoices();
});

/** Retry on updated commercial customer billing patches, not unrelated edits. */
export const retrySignedInvoiceWhenBillingPatchUpdated=onDocumentWritten({
  document:"domains/commercial/fields/_root",
  region:"us-central1",
},async (event)=>{
  if(!event.data)return;
  const before=JSON.stringify(event.data.before.data()?.data?.customerPatches??{});
  const after=JSON.stringify(event.data.after.data()?.data?.customerPatches??{});
  if(before===after)return;
  await reconcileRecentSignedInvoices();
});

export const queueInvoiceOnAdminDeliveryOverride=onDocumentCreated({
  document:"adminDeliveryOverrides/{orderId}",
  region:"us-central1",
},async (event)=>{
  if(!event.data)return;
  const value=event.data.data();
  const orderId=text(value.orderId)||event.params.orderId;
  const deliveredAt=text(value.deliveredAt);
  if(!orderId||!validInstant(deliveredAt))return;
  await queueDeliveredInvoice(
    orderId,
    deliveredAt,
    event.id,
    undefined,
    true,
  );
});
