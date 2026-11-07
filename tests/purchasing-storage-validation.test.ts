import assert from "node:assert/strict";
import test from "node:test";
import {applyPurchaseAction,emptyPurchasingState,normalizePurchasingDemoState} from "../lib/purchasing-review";

const admin={id:"test-admin",role:"Administrator" as const};
const now="2026-11-07T15:00:00Z";
test("restored demo rejects malformed vendors or missing activity records",()=>{
  const result=applyPurchaseAction(emptyPurchasingState(),admin,{kind:"vendor.add",name:"Demo Supplier",contact:"Internal QA"},now);
  assert(result.ok);
  const state=result.state;
  assert.equal(normalizePurchasingDemoState(state).vendors.length,1);
  assert.equal(normalizePurchasingDemoState({...state,vendors:[null]}).vendors.length,0);
  assert.equal(normalizePurchasingDemoState({...state,audit:[]}).vendors.length,0);
  assert.equal(normalizePurchasingDemoState({...state,vendors:[...state.vendors,...state.vendors]}).vendors.length,0);
});
test("restored demo refuses unsupported inventory and settlement assertions",()=>{
  const result=applyPurchaseAction(emptyPurchasingState(),admin,{kind:"vendor.add",name:"Demo Supplier",contact:"Internal QA"},now);
  const state=result.state;
  assert.equal(normalizePurchasingDemoState({...state,receipts:[{id:"r1",poId:"unknown",cases:1,lotCode:"Q",bestBy:"2027-11-07",warehouse:"QA",recordedAt:now,recordedBy:"qa",inventoryPosted:true}]}).receipts.length,0);
  assert.equal(normalizePurchasingDemoState({...state,payments:[{id:"p1",billId:"unknown",reference:"QA",amountCents:100,recordedAt:now,recordedBy:"qa",externalSettlementVerified:true}]}).payments.length,0);
});
