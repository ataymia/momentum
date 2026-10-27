/** Select the oldest eligible Firestore domain without retrying blocked writes. */
export function nextFlushableKey(pending:readonly string[],blocked:{has(key:string):boolean}){
  return pending.find((key)=>!blocked.has(key));
}
/** A cloud write may clear the recovery journal only for its exact local revision. */
export function mayDiscardJournal(captured:number,current:number){return captured===current;}
