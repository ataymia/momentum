import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import * as helper from "../functions/src/commercial-email-policy";

const m=(helper as unknown as {default?:typeof helper}).default??helper;
const at="2026-10-18T22:20:00.000Z";

test("order emails require confirmed approval and prior confirmation for cancel",()=>{
 const awaiting={id:"o",status:"Awaiting approval"};
 const approved={...awaiting,status:"Approved"};
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/orders",awaiting,approved),
  ["order.confirmed.customer"]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/orders",undefined,approved),[]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/orders",awaiting,{
   ...awaiting,status:"Cancelled",cancelledAt:at,
  }),[]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/orders",approved,{
   ...approved,status:"Cancelled",cancelledAt:at,
  }),["order.cancelled.customer","order.cancelled.rep"]);
});

test("approval return requires real Pending to Returned transition",()=>{
 const previous={id:"approval",type:"Order",status:"Pending"};
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/approvals",
  previous,{...previous,status:"Returned"}),
  ["order.returned_for_correction"]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/approvals",
  previous,{...previous,status:"Approved"}),[]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commercial/fields/approvals",
  previous,{...previous,status:"Approved",decidedBy:"admin-uid",decidedAt:at}),
  ["order.confirmed.customer"]);
 assert.deepEqual(m.transitionPolicies(
  "domains/workspace/fields/approvals",
  previous,{...previous,status:"Approved",decidedBy:"admin-uid",decidedAt:at}),
  ["order.confirmed.customer"]);
});

test("dispatch only alerts after loaded task actually departs",()=>{
 const task={id:"d",status:"Loaded",loadedAt:at};
 assert.deepEqual(m.transitionPolicies(
  "domains/delivery/fields/tasks",task,{
   ...task,status:"In transit",departedAt:at,
  }),["delivery.out_for_delivery.customer"]);
 assert.deepEqual(m.transitionPolicies(
  "domains/delivery/fields/tasks",task,{
   ...task,status:"In transit",
  }),[]);
});

test("payments distinguish settled, failed and reversed from mere Pending",()=>{
 const payment={id:"p",status:"Pending"};
 const path="domains/commerce/fields/payments";
 assert.deepEqual(m.transitionPolicies(path,payment,{
   ...payment,status:"Cleared",settledAt:at,settledBy:"admin",
 }),["payment.received.customer"]);
 assert.deepEqual(m.transitionPolicies(path,payment,{
   ...payment,status:"Failed",failedAt:at,failureReason:"Declined",
 }),["payment.failed.customer"]);
 assert.deepEqual(m.transitionPolicies(path,{
   ...payment,status:"Cleared",
 },{
   ...payment,status:"Reversed",reversedAt:at,
   reversalReason:"Confirmed reversal",
 }),["payment.refunded.customer","payment.refunded.rep"]);
 assert.deepEqual(m.transitionPolicies(path,payment,{
   ...payment,status:"Cleared",
 }),[]);
 assert.deepEqual(m.transitionPolicies(
  "domains/commerce/fields/refunds",{
   id:"r",status:"Sent",
  },{
   id:"r",status:"Settled",settledAt:at,sentReference:"ref-1",
  }),["payment.refunded.customer","payment.refunded.rep"]);
});

test("status routing and employee separation enforce approval",()=>{
 assert.equal(m.statusRecipient(
  {email:"store@example.com"},
  {accountsPayableEmail:"ap@example.com",billingEmail:"bill@example.com"}),
  "ap@example.com");
 assert.equal(m.statusRecipient(
  {email:"store@example.com"},
  {billingEmail:"bill@example.com"}),
  "bill@example.com");
 assert.equal(m.staffRecipient({
  role:"Sales Representative",accountState:"Separated",email:"rep@example.com",
 },"Sales Representative"),"");
 assert.equal(m.staffRecipient({
  role:"Sales Representative",accountState:"Active",email:"rep@example.com",
 },"Sales Representative"),"rep@example.com");
 assert.equal(m.authorizedActor("admin",{
  role:"Administrator",accountState:"Active",
 },["Administrator"]),true);
 assert.equal(m.authorizedActor("",{
  role:"Administrator",accountState:"Active",
 },["Administrator"]),false);
});

test("failure throttle has 30 minute and rolling 24-hour gates",()=>{
 const now=Date.parse(at);
 assert.equal(m.maySendFailedPayment([],now),true);
 assert.equal(m.maySendFailedPayment([now-10*60*1000],now),false);
 assert.equal(m.maySendFailedPayment([
  now-31*60*1000,now-2*60*60*1000,
 ],now),false);
 assert.equal(m.maySendFailedPayment([
  now-25*60*60*1000,
 ],now),true);
});

test("outbox identity is stable across Firestore duplicate event deliveries",()=>{
 const data={
  policyId:"payment.failed.customer",kind:"payment_failed",
  scopeId:"account-1",sourcePath:"domains/commerce/fields/payments",
  sourceRecordId:"pay-1",recipient:"AP@EXAMPLE.COM",
  subject:"Payment unsuccessful",body:"Please review payment.",
  eventId:"event-1",
 };
 assert.equal(m.mailId(data),m.mailId({
  ...data,eventId:"event-2",recipient:"ap@example.com",
 }));
 assert.notEqual(m.mailId(data),m.mailId({
  ...data,sourceRecordId:"pay-2",
 }));
});

test("email observer and Resend transport retain trusted policy gates",()=>{
 const producer=readFileSync(
  "functions/src/commercial-email-producers.ts","utf8");
 const mail=readFileSync("functions/src/resend-transport.ts","utf8");
 assert.match(producer,/onDocumentWrittenWithAuthContext/);
 assert.match(producer,/authorizedActor/);
 assert.match(producer,/notificationFailureThrottle/);
 assert.match(mail,/trustedKinds/);
 assert.match(mail,/system:commercial-policy/);
 assert.doesNotMatch(producer,/invoice_issued/);
});

test("approved order emails use the decision source and canonical order identity",()=>{
  const source=readFileSync("functions/src/commercial-email-producers.ts","utf8");
  assert.match(source,/decidedBy\)!==originUid/);
  assert.match(source,/policies\.includes\("order\.confirmed\.customer"\)/);
  assert.match(source,/path,text\(linkedOrder\.id\)/);
  assert.match(source,/onDocumentWrittenWithAuthContext/);
});

test("dispatch email accepts a signed delivery that overtook an async departure event",()=>{
 const time="2026-10-18T22:05:00.000Z";
 const departed={
  id:"task-a",orderId:"order-a",driverId:"driver-a",
  status:"In transit",loadedAt:"2026-10-18T22:00:00.000Z",
  departedAt:time,
 };
 const latest={
  ...departed,status:"Delivered",
  deliveredAt:"2026-10-18T22:08:00.000Z",
  history:[{id:"departure-event",type:"Departed",
   actorId:"driver-a",at:time}],
 };
 assert.equal(m.departureStillVerified(departed,latest,"driver-a"),true);
 assert.equal(m.departureStillVerified(departed,{
  ...latest,departedAt:"2026-10-18T22:06:00.000Z",
 },"driver-a"),false);
 assert.equal(m.departureStillVerified(departed,{
  ...latest,status:"Cancelled",
 },"driver-a"),false);
 assert.equal(m.departureStillVerified(departed,latest,"unauthorized"),false);
});
test("authorized Operations departure does not require Operations to be delivery driver",()=>{
 const time="2026-10-18T22:05:00.000Z";
 const departed={
  id:"task-b",orderId:"order-b",driverId:"driver-b",
  status:"In transit",loadedAt:"2026-10-18T22:00:00.000Z",
  departedAt:time,
 };
 const latest={...departed,status:"In transit",
  history:[{type:"Departed",actorId:"operations-a",at:time}]};
 assert.equal(m.departureStillVerified(departed,latest,"operations-a"),true);
 assert.equal(m.departureStillVerified(departed,latest,"driver-b"),false);
});
test("the commercial mail throttle applies only to failed payments",()=>{
 const source=readFileSync("functions/src/commercial-email-producers.ts","utf8");
 assert.match(source,/const failed=intent\.policyId==="payment\.failed\.customer"/);
 assert.match(source,/failed\?\[ref,throttleRef\]:\[ref\]/);
 assert.match(source,/if\(failed\)\{/);
 assert.match(source,/departureStillVerified\(current,latest,actorUid\)/);
});
