import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {transitionPolicies,staffRecipient,mailId} from "../functions/src/commercial-email-policy";
test("D18 notify reps only on genuine confirmed and departed transitions",()=>{
 assert.deepEqual(transitionPolicies("domains/commercial/fields/orders",
  {id:"o",status:"Awaiting approval"},{id:"o",status:"Approved"}),
  ["order.confirmed.customer","order.confirmed.rep"]);
 assert.deepEqual(transitionPolicies("domains/delivery/fields/tasks",
  {id:"t",status:"Loaded"},{id:"t",status:"In transit",loadedAt:"2026-11-06T17:00:00Z",departedAt:"2026-11-06T17:01:00Z"}),
  ["delivery.out_for_delivery.customer","delivery.out_for_delivery.rep"]);
 assert.deepEqual(transitionPolicies("domains/commercial/fields/orders",undefined,{id:"o",status:"Approved"}),[]);
});
test("D18 staff notifications require active employee and verified current email",()=>{
 assert.equal(staffRecipient({role:"Sales Representative",accountState:"Separated",email:"rep@example.com"},"Sales Representative"),"");
 assert.equal(staffRecipient({role:"Sales Manager",accountState:"Active",email:"rep@example.com"},"Sales Representative"),"");
 assert.equal(staffRecipient({role:"Sales Representative",accountState:"Active",email:"rep@example.com"},"Sales Representative"),"rep@example.com");
});
test("D18 producer and transport include trusted rep policy, never client-selected recipients",()=>{
 const p=readFileSync("functions/src/commercial-email-producers.ts","utf8");
 const t=readFileSync("functions/src/resend-transport.ts","utf8");
 assert.match(p,/order\.confirmed\.rep/);assert.match(p,/delivery\.out_for_delivery\.rep/);
 assert.match(p,/await activeUser\(uid\)/);
 assert.match(p,/staffRecipient\(access,"Sales Representative"\)/);
 assert.match(t,/"order_confirmed_rep":"order\.confirmed\.rep"/);
 assert.match(t,/"order_out_for_delivery_rep":"delivery\.out_for_delivery\.rep"/);
 assert.doesNotMatch(t,/"order_paid_rep"/);
});
test("D18 repeat event cannot create duplicate outbox mail",()=>{
 const p={policyId:"order.confirmed.rep",kind:"order_confirmed_rep",scopeId:"a",sourcePath:"domains/commercial/fields/orders",sourceRecordId:"o",recipient:"REP@EXAMPLE.COM",subject:"Approved",body:"Follow-up",eventId:"e1"};
 assert.equal(mailId(p),mailId({...p,eventId:"e2",recipient:"rep@example.com"}));
});
