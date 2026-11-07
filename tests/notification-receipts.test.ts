import assert from "node:assert/strict";
import test from "node:test";
import {expenseStatusIntents} from "../lib/notification-policy-v2";
import type {FinanceState} from "../lib/finance-engine";
import type {WorkspaceUser} from "../lib/types";
import {
  mergeReadReceipts,parseReadReceipts,recentRecordedStatus,shouldSurfaceBellIntent,
} from "../lib/notification-receipts";

test("read receipts reject malformed persisted content and remain user-scoped inputs",()=>{
  assert.deepEqual([...parseReadReceipts({ids:["x"]})],[]);
  assert.deepEqual([...parseReadReceipts(["a","a",null,"",42,"b"])],["a","b"]);
});
test("read receipts use additive set union so stale tabs cannot resurrect clears",()=>{
  const tabOne=new Set(["cleared-a","cleared-b"]);
  const tabTwo=new Set(["cleared-a","cleared-c"]);
  assert.deepEqual([...mergeReadReceipts(tabOne,tabTwo)],["cleared-b","cleared-a","cleared-c"]);
  // Read acknowledgments are not an expiring window. UI and cloud capacity
  // controls must never silently evict a previously marked-read ID.
  const many=new Set(Array.from({length:12810},(_,i)=>"id-"+i));
  assert.equal(mergeReadReceipts(many).size,many.size);
  assert.equal(parseReadReceipts([...many]).size,many.size);
  assert.equal(mergeReadReceipts(many,new Set(["new-one"])).has("id-0"),true);
});
test("the bell excludes historical and undated statuses but never invents a timestamp",()=>{
  const now=new Date("2026-11-06T19:00:00.000Z");
  assert.equal(recentRecordedStatus(undefined,now),false);
  assert.equal(recentRecordedStatus("unknown",now),false);
  assert.equal(recentRecordedStatus("2026-11-05",now),false);
  assert.equal(recentRecordedStatus("2026-11-05T09:00:00",now),false);
  assert.equal(recentRecordedStatus("2026-09-01T19:00:00.000Z",now),false);
  assert.equal(recentRecordedStatus("2026-11-01T19:00:00.000Z",now),true);
  assert.equal(recentRecordedStatus("2026-12-01T19:00:00.000Z",now),false);
});

test("G01: historical 66-item status backlog never becomes 66 unread actionable bell items",()=>{
  const now=new Date("2026-11-06T19:00:00.000Z");
  const legacy=Array.from({length:66},(_,i)=>({importance:"status" as const,occurredAt:"2026-08-01T12:00:00Z",id:"old-"+i}));
  const actionable=Array.from({length:3},(_,i)=>({importance:"action" as const,id:"active-"+i}));
  const recent=[{importance:"status" as const,occurredAt:"2026-11-06T17:00:00Z",id:"recent-status"}];
  const shown=[...legacy,...actionable,...recent].filter(intent=>shouldSurfaceBellIntent(intent,now));
  assert.deepEqual(shown.map(x=>x.id),["active-0","active-1","active-2","recent-status"]);
  assert.equal(shown.length,4);
});

test("G01/G03: finance approval uses the genuine decision time rather than inventing a render timestamp",()=>{
  const decisionAt="2026-11-06T18:35:00.000Z";
  const finance:FinanceState={version:3,expenses:[{
    id:"exp-1",requesterId:"employee-1",submittedAt:"2026-11-04T16:00:00.000Z",
    merchant:"Office supply",amount:80,category:"Supplies",businessPurpose:"Receipts",
    status:"Finance approved",managerReviewerId:"manager-1",
    managerDecisionAt:"2026-11-05T10:00:00.000Z",
    financeReviewerId:"admin-1",financeDecisionAt:decisionAt,
  }]};
  const user={id:"employee-1"} as WorkspaceUser;
  const [notice]=expenseStatusIntents(finance,user);
  assert.equal(notice.occurredAt,decisionAt);
  assert.equal(shouldSurfaceBellIntent(notice,new Date("2026-11-07T14:00:00.000Z")),true);
});
