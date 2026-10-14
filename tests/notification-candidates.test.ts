import assert from "node:assert/strict";
import test from "node:test";
import * as imported from "../functions/src/notification-candidates";
const moduleRef=imported as typeof imported & {default?:typeof imported};
const {notificationCandidates}=moduleRef.default??moduleRef;
const at="2026-10-14T19:00:00.000Z";
const path="domains/commercial/fields/orders";
const before={items:[{id:"order-1",status:"Pending approval"}]};
const after={items:[{id:"order-1",status:"Approved"}]};

test("persisted transitions create deterministic review-only candidates",()=>{
  const first=notificationCandidates(path,before,after,"event-1",at);
  assert.equal(first.length,1);
  assert.equal(first[0].status,"Review required");
  assert.equal(first[0].transportEnabled,false);
  assert.deepEqual(first,notificationCandidates(path,before,after,"event-1",at));
  assert.notEqual(first[0].id,notificationCandidates(path,before,after,"event-2",at)[0].id);
});
test("initial imports, unchanged records, audit ledgers and deleted sources never replay",()=>{
  for(const [source,old,next] of [[path,undefined,after],[path,after,after],[path,before,undefined],["domains/notificationRules/fields/deliveries",before,after]] as const){
    assert.deepEqual(notificationCandidates(source,old,next,"event-1",at),[]);
  }
});
test("payment and delivery evidence stay separate",()=>{
  assert.deepEqual(notificationCandidates(path,before,{items:[{id:"order-1",status:"Paid"}]},"e",at),[]);
  const payments="domains/commerce/fields/payments";
  assert.deepEqual(notificationCandidates(payments,{items:[]},{items:[{id:"p",status:"Pending",amount:240}]},"e",at),[]);
  const cleared={items:[{id:"p",status:"Cleared",amount:240,settledAt:at,settledBy:"admin"}]};
  assert.equal(notificationCandidates(payments,{items:[]},cleared,"e",at)[0].kind,"payment_received");
  assert.deepEqual(notificationCandidates(payments,cleared,cleared,"e",at),[]);
  assert.deepEqual(notificationCandidates("domains/delivery/fields/tasks",{items:[{id:"t",status:"In transit"}]},{items:[{id:"t",status:"Delivered"}]},"e",at),[]);
});
test("candidate payload excludes recipient and source private details",()=>{
  const result=notificationCandidates(path,before,{items:[{id:"order-1",status:"Approved",email:"private@example.com",amount:999,notes:"private"}]},"e",at);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("999"));
});
