import {
  commitFirestoreWrites,
  getFirestoreSnapshots,
  isFirestoreConflict,
  type FirestoreWrite,
} from "./firebase-firestore-rest";
import {mergeReadReceipts,parseReadReceipts} from "./notification-receipts";

/**
 * An employee may acknowledge their own notifications, never another employee's.
 * Sixteen append-only documents bound writes and prevent last-writer-wins losses.
 * Firestore Security Rules are the authoritative owner and append-only checks.
 */
export const RECEIPT_BUCKETS="0123456789abcdef".split("");
export const MAX_RECEIPTS_PER_BUCKET=800;
export const MAX_RECEIPT_SYNC_ATTEMPTS=4;

export function receiptBucket(id:string):string{
  let hash=2166136261;
  for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
  return RECEIPT_BUCKETS[(hash>>>0)%RECEIPT_BUCKETS.length];
}

export function receiptBucketPath(uid:string,bucket:string):string{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!RECEIPT_BUCKETS.includes(bucket))throw new Error("Invalid notification receipt scope.");
  return `notificationReadReceipts/${uid}/buckets/${bucket}`;
}

type ReceiptBucketDocument={userId:string;bucket:string;ids:string[]};

export function receiptIdsByBucket(ids:ReadonlySet<string>):Map<string,Set<string>>{
  const grouped=new Map(RECEIPT_BUCKETS.map(bucket=>[bucket,new Set<string>()]));
  for(const id of ids){
    if(typeof id!=="string"||!id||id.length>500)continue;
    grouped.get(receiptBucket(id))!.add(id);
  }
  return grouped;
}

export function mergeReceiptBucket(
  uid:string,
  bucket:string,
  existing:ReceiptBucketDocument|null,
  requested:ReadonlySet<string>,
):ReceiptBucketDocument{
  if(existing&&(existing.userId!==uid||existing.bucket!==bucket))throw new Error("Notification receipt ownership mismatch.");
  const old=existing?parseReadReceipts(existing.ids):new Set<string>();
  // A corrupted or mixed-bucket document cannot be silently reinterpreted.
  if([...old].some(id=>receiptBucket(id)!==bucket))throw new Error("Notification receipt bucket mismatch.");
  const candidate=mergeReadReceipts(old,requested);
  if(candidate.size>MAX_RECEIPTS_PER_BUCKET)throw new Error("Notification receipt bucket capacity reached. Preserve existing receipts.");
  return{userId:uid,bucket,ids:[...candidate]};
}

/** Compare-and-swap all affected buckets atomically. Concurrent devices retry
 * against current source values, so neither can undo the other's reads.
 */
export async function reconcileCloudReadReceipts(uid:string,local:ReadonlySet<string>):Promise<Set<string>>{
  const paths=RECEIPT_BUCKETS.map(bucket=>receiptBucketPath(uid,bucket));
  const wanted=receiptIdsByBucket(local);
  for(let attempt=0;attempt<MAX_RECEIPT_SYNC_ATTEMPTS;attempt++){
    const snapshots=await getFirestoreSnapshots<ReceiptBucketDocument>(paths);
    const byPath=new Map(snapshots.map(snapshot=>[snapshot.path,snapshot]));
    const writes:FirestoreWrite[]=[];
    const combined=new Set<string>();
    for(const bucket of RECEIPT_BUCKETS){
      const path=receiptBucketPath(uid,bucket);
      const snap=byPath.get(path);
      if(!snap)throw new Error("Incomplete notification receipt snapshot.");
      const raw=snap.exists?snap.data:null;
      if(snap.exists&&!raw)throw new Error("Unreadable notification receipt shard.");
      const merged=mergeReceiptBucket(uid,bucket,raw,wanted.get(bucket)!);
      for(const id of merged.ids)combined.add(id);
      if(raw&&merged.ids.length===raw.ids.length&&merged.ids.every((id,i)=>id===raw.ids[i]))continue;
      if(!merged.ids.length)continue;
      writes.push({kind:"set",path,data:merged,create:!snap.exists,updateTime:snap.updateTime});
    }
    if(!writes.length)return mergeReadReceipts(combined);
    const committed=await commitFirestoreWrites(writes);
    if(committed.ok)return mergeReadReceipts(combined);
    if(isFirestoreConflict(committed))continue;
    throw new Error(`Notification receipt sync failed: ${committed.code}.`);
  }
  throw new Error("Notification receipt sync conflicted repeatedly; local receipts were retained.");
}
