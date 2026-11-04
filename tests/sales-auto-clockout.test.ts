import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {CRM_AUTO_CLOCKOUT_MS,hasSalesTimedOut,lastSalesActivityAt}=require("../functions/src/sales-inactivity-core.ts") as typeof import("../functions/src/sales-inactivity-core");

const start=Date.parse("2026-11-04T15:00:00.000Z");
const at=(mins:number)=>new Date(start+mins*60_000).toISOString();
test("clock-out fires at exactly sixty minutes of CRM inactivity",()=>{
  assert.equal(hasSalesTimedOut(start,start+CRM_AUTO_CLOCKOUT_MS-1),false);
  assert.equal(hasSalesTimedOut(start,start+CRM_AUTO_CLOCKOUT_MS),true);
});
test("CRM visit resets the inactivity clock",()=>{
  const latest=lastSalesActivityAt("ryan",start,0,[{userId:"ryan",occurredAt:at(50)}],[],start+70*60_000);
  assert.equal(latest,start+50*60_000);
  assert.equal(hasSalesTimedOut(latest,start+70*60_000),false);
});
test("fresh sign-in counts as activity while merely opening the tablet does not",()=>{
  const latest=lastSalesActivityAt("ryan",start,start+45*60_000,[],[],start+70*60_000);
  assert.equal(latest,start+45*60_000);
  assert.equal(hasSalesTimedOut(latest,start+70*60_000),false);
  assert.equal(hasSalesTimedOut(start,start+70*60_000),true);
});
test("a different employee's activities do not count",()=>{
  const latest=lastSalesActivityAt("ryan",start,0,[{userId:"matt",occurredAt:at(59)}],[],start+70*60_000);
  assert.equal(latest,start);
});
test("future and pre-shift events cannot reset the clock",()=>{
  const latest=lastSalesActivityAt("ryan",start,0,[
    {userId:"ryan",occurredAt:at(-5)},
    {userId:"ryan",occurredAt:at(90)},
    {userId:"ryan",occurredAt:"invalid"},
  ],[],start+70*60_000);
  assert.equal(latest,start);
});
test("workspace activity counts, but GPS is not a source of activity in this policy",()=>{
  const latest=lastSalesActivityAt("ryan",start,0,[],[{userId:"ryan",at:at(58)}],start+72*60_000);
  assert.equal(latest,start+58*60_000);
  assert.equal(hasSalesTimedOut(latest,start+72*60_000),false);
});
