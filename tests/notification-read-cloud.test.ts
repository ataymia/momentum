import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECEIPTS_PER_BUCKET,
  RECEIPT_BUCKETS,
  mergeReceiptBucket,
  receiptBucket,
  receiptBucketPath,
  receiptIdsByBucket,
} from "../lib/notification-read-cloud";

test("G02: stable partitioning and strict owner-UID path validation",()=>{
  for(const id of ["derived-action:approval:abc","derived-intent:order:abc","a/b/c","long".repeat(100)]){
    assert.ok(RECEIPT_BUCKETS.includes(receiptBucket(id)));
    assert.equal(receiptBucket(id),receiptBucket(id));
    assert.match(receiptBucketPath("uid-rep",receiptBucket(id)),/^notificationReadReceipts\/uid-rep\/buckets\/[0-9a-f]$/);
  }
  assert.throws(()=>receiptBucketPath("../uid-victim","a"));
  assert.throws(()=>receiptBucketPath("uid","z"));
});

test("G02: concurrent device read states union without ever removing existing receipts",()=>{
  const first="derived-action:approval:a";
  const second="derived-intent:payment:b";
  const bucket=receiptBucket(first);
  const existing={userId:"uid-rep",bucket,ids:[first]};
  const merged=mergeReceiptBucket("uid-rep",bucket,existing,new Set([first,second].filter(id=>receiptBucket(id)===bucket)));
  assert.ok(merged.ids.includes(first));
  if(receiptBucket(second)===bucket)assert.ok(merged.ids.includes(second));
  assert.deepEqual(mergeReceiptBucket("uid-rep",bucket,merged,new Set()).ids,merged.ids);
});

test("G02: reject unreadable shard ownership, mixed partitions and overflow",()=>{
  const bucket=receiptBucket("alpha");
  assert.throws(()=>mergeReceiptBucket("uid-owner",bucket,{userId:"uid-other",bucket,ids:["alpha"]},new Set()));
  const foreign="suffixes".split("").find(x=>receiptBucket(x)!==bucket);
  assert.ok(foreign);
  assert.throws(()=>mergeReceiptBucket("uid-owner",bucket,{userId:"uid-owner",bucket,ids:[foreign!]},new Set()));
  const docs=new Set<string>();
  for(let i=0;docs.size<=MAX_RECEIPTS_PER_BUCKET;i++){
    const candidate="receipt-"+i;
    if(receiptBucket(candidate)===bucket)docs.add(candidate);
  }
  assert.throws(()=>mergeReceiptBucket("uid-owner",bucket,null,docs),/capacity/);
});

test("G02: mark-all preserves every ID in its deterministic bucket",()=>{
  const ids=new Set(Array.from({length:88},(_,i)=>"derived-action:approval:"+i));
  const groups=receiptIdsByBucket(ids);
  assert.equal([...groups.values()].reduce((sum,group)=>sum+group.size,0),88);
  for(const [bucket,group] of groups)for(const id of group)assert.equal(receiptBucket(id),bucket);
});
