/** Select the oldest eligible Firestore domain without retrying blocked writes. */
export function nextFlushableKey(pending:readonly string[],blocked:{has(key:string):boolean}){
  return pending.find((key)=>!blocked.has(key));
}
/** A cloud write may clear the recovery journal only for its exact local revision. */
export function mayDiscardJournal(captured:number,current:number){return captured===current;}

/** Keep the earliest queued save deadline; repeated GPS/UI updates cannot postpone it. */
export function shouldScheduleSooner(existingDueAt:number|undefined,proposedDueAt:number){
  return existingDueAt===undefined || proposedDueAt<existingDueAt;
}

/** Do not fan out an outage, timeout, or rate limit into N individual writes. */
export function isTransientFirestoreFailure(failure:{ok:boolean;status?:number;code?:string}){
  if(failure.ok)return false;
  return failure.status===408||failure.status===429||(failure.status??0)>=500||
    ["UNAVAILABLE","RESOURCE_EXHAUSTED","DEADLINE_EXCEEDED","INTERNAL","UNKNOWN"].includes(failure.code??"");
}
