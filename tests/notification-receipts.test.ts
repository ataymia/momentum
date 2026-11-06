import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeReadReceipts,parseReadReceipts,recentRecordedStatus,shouldSurfaceBellIntent,
  MAX_READ_RECEIPTS,
} from "../lib/notification-receipts";

test("read receipts reject malformed persisted content and remain user-scoped inputs",()=>{
  assert.deepEqual([...parseReadReceipts({ids:["x"]})],[]);
  assert.deepEqual([...parseReadReceipts(["a","a",null,"",42,"b"])],["a","b"]);
});
test("read receipts use additive set union so stale tabs cannot resurrect clears",()=>{
  const tabOne=new Set(["cleared-a","cleared-b"]);
  const tabTwo=new Set(["cleared-a","cleared-c"]);
  assert.deepEqual([...mergeReadReceipts(tabOne,tabTwo)],["cleared-b","cleared-a","cleared-c"]);
  const many=new Set(Array.from({length:MAX_READ_RECEIPTS+10},(_,i)=>"id-"+i));
  assert.equal(mergeReadReceipts(many).size,MAX_READ_RECEIPTS);
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
