/** Authoritative CRM inactivity calculation. GPS, page views, and device access are never inputs. */
export const CRM_AUTO_CLOCKOUT_MS=60*60_000;
export type SavedCRMEvent={userId?:unknown;occurredAt?:unknown;at?:unknown};
const epoch=(value:unknown):number=>{
  if(typeof value!=="string")return 0;
  const time=Date.parse(value);
  return Number.isFinite(time)?time:0;
};
export function lastSalesActivityAt(userId:string,clockInMs:number,signInMs:number,
  crmEvents:SavedCRMEvent[],workEvents:SavedCRMEvent[],nowMs:number):number{
  let latest=clockInMs;
  if(signInMs>=clockInMs&&signInMs<=nowMs)latest=signInMs;
  for(const event of [...crmEvents,...workEvents]){
    if(event.userId!==userId)continue;
    const timestamp=epoch(event.occurredAt??event.at);
    if(timestamp>=clockInMs&&timestamp<=nowMs&&timestamp>latest)latest=timestamp;
  }
  return latest;
}
export const hasSalesTimedOut=(lastActivityMs:number,nowMs:number):boolean=>
  Number.isFinite(lastActivityMs)&&Number.isFinite(nowMs)&&nowMs-lastActivityMs>=CRM_AUTO_CLOCKOUT_MS;
