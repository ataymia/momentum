import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeReadReceipts,parseReadReceipts,recentRecordedStatus,
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
