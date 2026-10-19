/* eslint-disable max-len, comma-spacing, space-before-blocks, keyword-spacing, key-spacing, brace-style, indent, curly */
import {createHash} from "node:crypto";
import {safeMail} from "./resend-mail-policy";

export type Row=Record<string,unknown>;
export const row=(value:unknown):value is Row=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
export const text=(value:unknown)=>typeof value==="string"?value.trim():"";
export const items=(value:unknown):Row[]=>
  row(value)&&Array.isArray(value.items)?value.items.filter(row):[];
export const number=(value:unknown)=>
  typeof value==="number"&&Number.isFinite(value)?value:0;
export const validTime=(value:unknown)=>
  Boolean(text(value)&&Number.isFinite(Date.parse(text(value))));
export const byId=(rows:Row[],id:string)=>
  rows.find((record)=>text(record.id)===id);
export const changedTo=(before:Row|undefined,after:Row,status:string)=>
  Boolean(before&&text(before.status)!==status&&text(after.status)===status);
export const freshTransition=(previous:Row|undefined,current:Row|undefined)=>
  Boolean(previous&&current&&text(previous.status)!==text(current.status));
export const occurredAfter=(eventTime:string,cutoff:string)=>
  validTime(eventTime)&&validTime(cutoff)&&Date.parse(eventTime)>=Date.parse(cutoff);

export type MailIntent={
  policyId:string;
  kind:string;
  scopeId:string;
  sourcePath:string;
  sourceRecordId:string;
  recipient:string;
  recipientUid?:string;
  subject:string;
  body:string;
  eventId:string;
  version?:number;
};

/**
 * Resolve general status recipient without using invoice-only routing.
 * @param {Row|undefined} account Selling location.
 * @param {Row|undefined} customer Billing parent.
 * @return {string} Safe, approved status recipient or an empty string.
 */
export function statusRecipient(account?:Row,customer?:Row):string{
  const value=[customer?.accountsPayableEmail,customer?.billingEmail,account?.email]
    .map(text).find((item)=>safeMail(item));
  return value?.toLowerCase()??"";
}

/**
 * Restrict delivery email to an actual authenticated principal and active role.
 * @param {string|undefined} authId Firebase auth context principal UID.
 * @param {Row|undefined} access Server-read access record.
 * @param {string[]} allowedRoles Allowed originator roles.
 * @return {boolean} Whether source transition has authorized authorship.
 */
export function authorizedActor(
  authId:string|undefined,access:Row|undefined,allowedRoles:string[],
):boolean{
  return Boolean(authId&&access?.accountState==="Active"&&
    allowedRoles.includes(text(access.role)));
}

/**
 * Resolve an active staff email only for the intended role and UID.
 * @param {Row|undefined} access Server-read staff access.
 * @param {string} role Required role.
 * @return {string} Staff email or an empty string.
 */
export function staffRecipient(access:Row|undefined,role:string):string{
  if(!authorizedActor("lookup",access,[role]))return "";
  const email=text(access?.email);
  return safeMail(email)?email.toLowerCase():"";
}

/**
 * Build deterministic, template-versioned mail identity.
 * @param {MailIntent} intent Fully validated notification intent.
 * @return {string} Unique outbox key for one event/recipient/version.
 */
export function mailId(intent:MailIntent):string{
  const digest=createHash("sha256").update(JSON.stringify([
    intent.policyId,intent.scopeId,intent.sourceRecordId,
    intent.recipient.toLowerCase(),intent.version??1,
  ])).digest("hex");
  return "commercial-mail-"+digest;
}

/**
 * Apply the approved failed-payment limits to persisted timestamps.
 * @param {number[]} sentAt Historic send timestamps.
 * @param {number} now Current trusted time.
 * @return {boolean} True if 30 minute and rolling daily limits permit send.
 */
export function maySendFailedPayment(sentAt:number[],now:number):boolean{
  const relevant=sentAt.filter((time)=>Number.isFinite(time)&&
    time<=now&&time>now-24*60*60*1000);
  return relevant.length<2&&
    !relevant.some((time)=>time>now-30*60*1000);
}

/**
 * Confirm that a dispatch event remains authentic after rapid progression.
 * A delivery may be signed before the asynchronous In transit handler runs.
 * @param {Row} departed The persisted In transit transition snapshot.
 * @param {Row|undefined} latest Most recently stored task.
 * @param {string} actorUid Authenticated principal who initiated departure.
 * @return {boolean} Whether the departure is still supported by evidence.
 */
export function departureStillVerified(
  departed:Row,latest:Row|undefined,actorUid:string,
):boolean{
  if(!actorUid||!latest||!["In transit","Delivered"].includes(text(latest.status))||
    text(latest.id)!==text(departed.id)||
    text(latest.orderId)!==text(departed.orderId)||
    text(latest.driverId)!==text(departed.driverId)||
    !validTime(departed.departedAt)||
    text(latest.departedAt)!==text(departed.departedAt)||
    text(latest.loadedAt)!==text(departed.loadedAt))return false;
  const departedAt=Date.parse(text(departed.departedAt));
  return Array.isArray(latest.history)&&latest.history.some((event)=>
    row(event)&&text(event.type)==="Departed"&&
    text(event.actorId)===actorUid&&
    validTime(event.at)&&
    Math.abs(Date.parse(text(event.at))-departedAt)<=60_000);
}

/**
 * Return only approved transitions for the named trusted ledger.
 * @param {string} sourcePath Known Firestore document path.
 * @param {Row|undefined} previous Old status-bearing record.
 * @param {Row} current New status-bearing record.
 * @return {string[]} Canonical policy IDs authorized by transition shape.
 */
export function transitionPolicies(
  sourcePath:string,previous:Row|undefined,current:Row,
):string[]{
  if(!previous)return [];
  if(sourcePath==="domains/commercial/fields/orders"){
    if(changedTo(previous,current,"Approved")&&
      text(previous.status)==="Awaiting approval")
      return ["order.confirmed.customer"];
    if(changedTo(previous,current,"Cancelled")&&
      ["Approved","Allocated","Out for delivery","Delivered","Paid"]
        .includes(text(previous.status))&&validTime(current.cancelledAt))
      return ["order.cancelled.customer","order.cancelled.rep"];
  }
  if(sourcePath==="domains/commercial/fields/approvals"||
     sourcePath==="domains/workspace/fields/approvals"){
    if(changedTo(previous,current,"Approved")&&
      text(previous.status)==="Pending"&&
      ["Order","Low stock sale"].includes(text(current.type))&&
      validTime(current.decidedAt)&&text(current.decidedBy))
      return ["order.confirmed.customer"];
    if(changedTo(previous,current,"Returned")&&
      text(previous.status)==="Pending"&&
      ["Order","Low stock sale"].includes(text(current.type)))
      return ["order.returned_for_correction"];
  }
  if(sourcePath==="domains/delivery/fields/tasks"){
    if(changedTo(previous,current,"In transit")&&
      text(previous.status)==="Loaded"&&validTime(current.departedAt)&&
      validTime(current.loadedAt))
      return ["delivery.out_for_delivery.customer"];
  }
  if(sourcePath==="domains/commerce/fields/payments"){
    if(changedTo(previous,current,"Cleared")&&
      validTime(current.settledAt)&&text(current.settledBy))
      return ["payment.received.customer"];
    if(changedTo(previous,current,"Failed")&&
      validTime(current.failedAt)&&text(current.failureReason))
      return ["payment.failed.customer"];
    if(changedTo(previous,current,"Reversed")&&
      validTime(current.reversedAt)&&text(current.reversalReason))
      return ["payment.refunded.customer","payment.refunded.rep"];
  }
  if(sourcePath==="domains/commerce/fields/refunds"&&
     changedTo(previous,current,"Settled")&&
     validTime(current.settledAt)&&text(current.sentReference))
    return ["payment.refunded.customer","payment.refunded.rep"];
  return [];
}
