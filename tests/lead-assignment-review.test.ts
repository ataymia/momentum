import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const ui=readFileSync(new URL("../components/prototype/operations-hub.tsx",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../lib/workspace-context.tsx",import.meta.url),"utf8");
const record=ui.slice(ui.indexOf("function LeadRecord("),ui.indexOf("function LeadFollowupScheduler("));

test("lead handoff is restricted to demo administrators and sales managers",()=>{
  assert.match(record,/canHandoff=isDemo&&!!currentUser&&\["Administrator","Sales Manager"\]\.includes\(currentUser\.role\)/);
  assert.match(record,/\{canHandoff&&<form/);
  assert.match(record,/eligibleReps=data\.users\.filter\(u=>u\.role==="Sales Representative"/);
});
test("handoff requires eligible target and reason and delegates to existing authority",()=>{
  assert.match(record,/eligibleReps\.some\(u=>u\.id===newOwner\)/);
  assert.match(record,/handoffReason\.trim\(\)\.length<3/);
  assert.match(record,/transferAccountResponsibility\(account\.id,newOwner,handoffReason\.trim\(\)\)/);
  assert.match(workspace,/canTransferSalesResponsibility\(data, currentUser, account, toUserId\)/);
  assert.match(workspace,/title: "Sales responsibility transferred"/);
  assert.match(workspace,/Historical order attribution remains unchanged/);
});
test("failed authority check cannot display successful handoff",()=>{
  assert.match(record,/if\(!accepted\)\{setHandoffFeedback\("Assignment rejected/);
  assert.match(record,/setHandoffFeedback\("Responsibility updated in this demonstration workspace/);
});
