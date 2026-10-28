/* eslint-disable max-len, comma-spacing, space-before-blocks, indent, keyword-spacing, key-spacing, brace-style, semi-spacing */
import {createHash} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {onDocumentWrittenWithAuthContext} from "firebase-functions/v2/firestore";
import {
  authorizedActor,byId,departureStillVerified,items,mailId,maySendFailedPayment,
  row,staffRecipient,statusRecipient,text,transitionPolicies,
  type MailIntent,type Row,
} from "./commercial-email-policy";

const docs={
  accounts:"domains/workspace/fields/accounts",
  customers:"domains/workspace/fields/customers",
  commercialOrders:"domains/commercial/fields/orders",
  workspaceOrders:"domains/workspace/fields/orders",
  invoices:"domains/commerce/fields/invoices",
  payments:"domains/commerce/fields/payments",
  allocations:"domains/commerce/fields/allocations",
  refunds:"domains/commerce/fields/refunds",
  approvals:"domains/commercial/fields/approvals",
  workspaceApprovals:"domains/workspace/fields/approvals",
};

type Context={
  accounts:Row[];
  customers:Row[];
  orders:Row[];
  invoices:Row[];
  payments:Row[];
  allocations:Row[];
};

const activeUser=async (uid:string):Promise<Row|undefined>=>{
  if(!uid||uid.length>150||uid.includes("/"))return undefined;
  const snapshot=await getFirestore().doc("userAccess/"+uid).get();
  return snapshot.data() as Row|undefined;
};

const context=async ():Promise<Context>=>{
  const db=getFirestore();
  const paths=[
    docs.accounts,docs.customers,docs.commercialOrders,
    docs.workspaceOrders,docs.invoices,docs.payments,docs.allocations,
    "domains/commercial/fields/_root",
  ];
  const snapshots=await db.getAll(...paths.map((path)=>db.doc(path)));
  const payload=snapshots.map((snap)=>items(snap.data()));
  const root=snapshots[7].data()?.data as Row|undefined;
  const accountPatches=row(root?.accountPatches)?root.accountPatches:{};
  const customerPatches=row(root?.customerPatches)?root.customerPatches:{};
  const merge=(records:Row[],patches:Row)=>records.map((record)=>{
    const patch=patches[text(record.id)];
    return row(patch)?{...record,...patch}:record;
  });
  return {
    accounts:merge(payload[0],accountPatches),
    customers:merge(payload[1],customerPatches),
    orders:[...payload[2],...payload[3]].filter((order,index,all)=>
      all.findIndex((item)=>text(item.id)===text(order.id))===index),
    invoices:payload[4],payments:payload[5],allocations:payload[6],
  };
};

const accountFor=(state:Context,accountId:string)=>{
  const account=byId(state.accounts,accountId);
  const customer=account?
    byId(state.customers,text(account.customerId)):undefined;
  return {account,customer};
};

const orderForPayment=(state:Context,paymentId:string)=>{
  const allocation=state.allocations.find((item)=>
    text(item.paymentId)===paymentId);
  const invoice=allocation?
    byId(state.invoices,text(allocation.invoiceId)):undefined;
  return invoice?byId(state.orders,text(invoice.orderId)):undefined;
};

const nameFor=(value:Row|undefined)=>
  text(value?.locationName)||text(value?.name)||"your business";

const freshSource=(source:string,sourceId:string,current:Row,actorUid:string)=>{
  const db=getFirestore();
  return db.doc(source).get().then((snapshot)=>{
    const latest=byId(items(snapshot.data()),sourceId);
    if(source==="domains/delivery/fields/tasks"&&
       text(current.status)==="In transit"){
      // A signed delivery may land before this async observer gets scheduled.
      // Check immutable departure evidence, not only latest status.
      return departureStillVerified(current,latest,actorUid);
    }
    return Boolean(latest&&text(latest.status)===text(current.status));
  });
};

const adminReview=async (
  eventId:string,recordId:string,detail:string,
)=>{
  const db=getFirestore();
  const digest=createHash("sha256")
    .update(eventId+"|"+recordId+"|"+detail).digest("hex").slice(0,32);
  const id="commercial-email-"+digest;
  await db.doc("notificationAdminEvents/"+id).set({
    id,policyId:"system.email_failed",
    title:"Commercial email needs review",
    detail:detail.slice(0,500),
    createdAt:new Date().toISOString(),
    sourceId:eventId,sourceRecordId:recordId,
    outboxId:"",status:"Open",
  });
};

const make=(input:Omit<MailIntent,"version">):MailIntent=>({
  ...input,version:1,
});

const writeIntent=async (intent:MailIntent)=>{
  const db=getFirestore();
  const id=mailId(intent);
  const ref=db.doc("notificationOutbox/"+id);
  const createdAt=new Date().toISOString();
  const mail={
    id,kind:intent.kind,policyId:intent.policyId,
    authorizationType:"Trusted system",
    approvedBy:"system:commercial-policy",
    approvedAt:createdAt,
    sourcePath:intent.sourcePath,
    sourceRecordId:intent.sourceRecordId,
    eventId:intent.eventId,
    templateVersion:intent.version??1,
    to:intent.recipient.toLowerCase(),
    ...(intent.recipientUid?{recipientUid:intent.recipientUid}:{}),
    subject:intent.subject,text:intent.body,
    idempotencyKey:"momentum-email-v1-"+id,
    createdAt,status:"Approved",
  };
  const failed=intent.policyId==="payment.failed.customer";
  const throttleKey=createHash("sha256").update(
    intent.scopeId+"|"+intent.recipient.toLowerCase(),
  ).digest("hex");
  const throttleRef=db.doc("notificationFailureThrottle/"+throttleKey);
  await db.runTransaction(async (tx)=>{
    const references=failed?[ref,throttleRef]:[ref];
    const [existing,throttle]=await Promise.all(
      references.map((r)=>tx.get(r)),
    );
    if(existing.exists)return;
    if(failed){
      const now=Date.parse(createdAt);
      const history=Array.isArray(throttle?.data()?.times)?
        (throttle.data()?.times as unknown[])
          .filter((value):value is number=>
            typeof value==="number"&&Number.isFinite(value)):[];
      if(!maySendFailedPayment(history,now)){
        tx.set(db.doc("notificationEmailDecisions/"+id),{
          id,policyId:intent.policyId,
          sourceRecordId:intent.sourceRecordId,
          scopeId:intent.scopeId,
          outcome:"Suppressed by rate limit",
          at:createdAt,
        });
        return;
      }
      const active=history.filter((timestamp)=>
        timestamp>now-24*60*60*1000&&timestamp<=now);
      tx.set(throttleRef,{
        accountId:intent.scopeId,
        recipientHash:throttleKey,
        times:[...active,now],updatedAt:createdAt,
      });
    }
    tx.create(ref,mail);
  });
};

const customerMail=async (
  state:Context,accountId:string,eventId:string,
  policyId:string,kind:string,sourcePath:string,sourceRecordId:string,
  subject:string,body:string,
)=>{
  const {account,customer}=accountFor(state,accountId);
  const recipient=statusRecipient(account,customer);
  if(!recipient){
    await adminReview(eventId,sourceRecordId,
      "No verified A/P, billing, or location status email for "+
      nameFor(account)+"; "+kind+" not sent.");
    return;
  }
  await writeIntent(make({
    policyId,kind,scopeId:accountId,
    sourcePath,sourceRecordId,recipient,eventId,subject,body,
  }));
};

const repMail=async (
  uid:string,accountId:string,eventId:string,
  policyId:string,kind:string,sourcePath:string,sourceRecordId:string,
  subject:string,body:string,
)=>{
  const access=await activeUser(uid);
  const recipient=staffRecipient(access,"Sales Representative");
  if(!recipient)return;
  await writeIntent(make({
    policyId,kind,scopeId:accountId,
    sourcePath,sourceRecordId,recipient,recipientUid:uid,
    eventId,subject,body,
  }));
};

/**
 * Handle authenticated commercial lifecycle transitions without old-email replay.
 * @param {string} path Exact Firestore shard to observe.
 * @param {string[]} originRoles Roles permitted to perform this transition.
 * @return {Function} Firestore event handler.
 */
const observe=(path:string,originRoles:string[])=>
  onDocumentWrittenWithAuthContext({
    document:path,region:"us-central1",
  },async (event)=>{
    if(!event.data?.before.exists||!event.data.after.exists)return;
    const originUid=event.authId??"";
    // An anonymous/unknown origin or server write without clear origin does
    // not authorize customer email from client-editable operational shards.
    const actor=await activeUser(originUid);
    if(!authorizedActor(originUid,actor,originRoles))return;
    const before=new Map(items(event.data.before.data())
      .map((entry)=>[text(entry.id),entry]));
    const after=items(event.data.after.data());
    const state=await context();
    const eventId=event.id;
    for(const current of after){
      const id=text(current.id);
      if(!id)continue;
      const previous=before.get(id);
      const policies=transitionPolicies(path,previous,current);
      if(!policies.length)continue;
      if(!(await freshSource(path,id,current,originUid)))continue;
      if(path===docs.commercialOrders){
        if(current.testOnly===true)continue;
        const orderNumber=text(current.number);
        const accountId=text(current.accountId);
        if(!byId(state.accounts,accountId))continue;
        if(policies.includes("order.confirmed.customer")){
          if(text(actor?.role)!=="Administrator")continue;
          await customerMail(state,accountId,eventId,
            "order.confirmed.customer","order_confirmed",path,id,
            "Order "+orderNumber+" confirmed",
            "Your order "+orderNumber+" is confirmed and is moving into fulfillment. "+
            "We will provide delivery updates as the order progresses.");
        }
        if(policies.includes("order.cancelled.customer")){
          if(text(actor?.role)==="Sales Representative"&&
             originUid!==text(current.ownerId)&&
             originUid!==text(current.creditedRepId))continue;
          await customerMail(state,accountId,eventId,
            "order.cancelled.customer","order_cancelled",path,id,
            "Order "+orderNumber+" cancelled",
            "Your previously confirmed order "+orderNumber+" has been cancelled.");
          await repMail(text(current.creditedRepId)||text(current.ownerId),
            accountId,eventId,"order.cancelled.rep","order_cancelled_rep",
            path,id,"Order "+orderNumber+" cancelled",
            "Previously confirmed order "+orderNumber+
            " has been cancelled. Review the order record.");
        }
      }else if(path===docs.approvals||path===docs.workspaceApprovals){
        const linkedOrder=byId(state.orders,text(current.recordId));
        if(!linkedOrder||linkedOrder.testOnly===true||text(linkedOrder.status)==="Cancelled")continue;
        if(policies.includes("order.confirmed.customer")){
          if(text(actor?.role)!=="Administrator"||
             text(current.decidedBy)!==originUid)continue;
          await customerMail(state,text(linkedOrder.accountId),eventId,
            "order.confirmed.customer","order_confirmed",
            path,text(linkedOrder.id),
            "Order "+text(linkedOrder.number)+" confirmed",
            "Your order "+text(linkedOrder.number)+
            " has been approved and is moving into fulfillment. "+
            "We will provide delivery updates as it progresses.");
          continue;
        }
        if(text(current.status)!=="Returned"||
           !policies.includes("order.returned_for_correction"))continue;
        const uid=text(current.requesterId);
        if(text(actor?.role)==="Sales Manager"){
          const directory=uid?
            await getFirestore().doc("employeeDirectory/"+uid).get():null;
          if(text(directory?.data()?.managerId)!==originUid)continue;
        }
        await repMail(uid,text(linkedOrder.accountId),eventId,
          "order.returned_for_correction","order_returned",path,id,
          "Order "+text(linkedOrder.number)+" needs correction",
          "Order "+text(linkedOrder.number)+
          " was returned for correction. Open Momentum to review and resubmit.");
      }else if(path==="domains/delivery/fields/tasks"){
        if(text(actor?.role)==="Delivery Driver"&&
           originUid!==text(current.driverId))continue;
        const order=byId(state.orders,text(current.orderId));
        if(!order||order.testOnly===true)continue;
        await customerMail(state,text(order.accountId),eventId,
          "delivery.out_for_delivery.customer","order_out_for_delivery",
          path,id,"Order "+text(order.number)+" is out for delivery",
          "Your order "+text(order.number)+
          " is out for delivery. Please be ready to receive it.");
      }else if(path===docs.payments||path===docs.refunds){
        if(text(actor?.role)!=="Administrator")continue;
        const payment=path===docs.payments?
          current:byId(state.payments,text(current.paymentId));
        if(!payment)continue;
        const accountId=text(payment.accountId);
        if(!byId(state.accounts,accountId))continue;
        const order=orderForPayment(state,text(payment.id));
        if(order?.testOnly===true)continue;
        if(policies.includes("payment.received.customer")){
          await customerMail(state,accountId,eventId,
            "payment.received.customer","payment_received",path,id,
            "Momentum payment received",
            "We have confirmed receipt of your payment"+
            (order?" for order "+text(order.number):"")+". "+
            "Your account has been updated.");
        }
        if(policies.includes("payment.failed.customer")){
          await customerMail(state,accountId,eventId,
            "payment.failed.customer","payment_failed",path,id,
            "Momentum payment unsuccessful",
            "A payment attempt on your Momentum account was unsuccessful. "+
            "Please review your payment details or contact our billing team.");
        }
        if(policies.includes("payment.refunded.customer")){
          await customerMail(state,accountId,eventId,
            "payment.refunded.customer","payment_refunded",path,id,
            "Momentum payment reversal or refund",
            "A payment reversal or refund was recorded on your account"+
            (order?" for order "+text(order.number):"")+". "+
            "Please review your account for details.");
          if(order){
            await repMail(text(order.creditedRepId)||text(order.ownerId),
              accountId,eventId,"payment.refunded.rep","payment_refunded_rep",
              path,id,"Payment reversal or refund",
              "A payment reversal or refund was recorded for order "+
              text(order.number)+". Review your account follow-up.");
          }
        }
      }
    }
  });

export const emailApprovedOrders=observe(
  docs.commercialOrders,["Administrator","Sales Representative"]);
export const emailReturnedOrders=observe(
  docs.approvals,["Administrator","Sales Manager"]);
export const emailReturnedWorkspaceOrders=observe(
  docs.workspaceApprovals,["Administrator","Sales Manager"]);
export const emailOrdersOutForDelivery=observe(
  "domains/delivery/fields/tasks",
  ["Administrator","Operations","Delivery Driver"]);
export const emailPaymentTransitions=observe(
  docs.payments,["Administrator"]);
export const emailRefundSettlements=observe(
  docs.refunds,["Administrator"]);

export {writeIntent,customerMail,repMail,context,adminReview};
