import {manualConsolidationCandidate} from "./account-consolidation-review";
import type {WorkspaceData} from "./types";

/**
 * C20: A shared billing parent is not a single selling location. Distinct
 * physical locations may earn their own acquisition milestones; duplicate
 * physical-location identities cannot receive a second automatic award.
 *
 * This is a conservative payroll HOLD, never a permanent clawback, mutation
 * of historical earnings, or an inference of legal common ownership.
 */
export type AcquisitionBonusHold={
  parentId:string;
  accountIds:[string,string];
  reason:"Duplicate physical address"|"Duplicate order identity";
  evidence:string;
};

export function acquisitionBonusConsolidationHolds(data:WorkspaceData):AcquisitionBonusHold[]{
  const parents=new Map<string,string[]>();
  for(const account of data.accounts){
    if(!account.customerId)continue;
    const ids=parents.get(account.customerId)??[];
    ids.push(account.id);
    parents.set(account.customerId,ids);
  }
  const holds:AcquisitionBonusHold[]=[];
  const seen=new Set<string>();
  const append=(parentId:string,a:string,b:string,reason:AcquisitionBonusHold["reason"],evidence:string)=>{
    if(a===b)return;
    const pair=[a,b].sort() as [string,string];
    const key=[parentId,...pair,reason].join("|");
    if(seen.has(key))return;
    seen.add(key);
    holds.push({parentId,accountIds:pair,reason,evidence});
  };
  for(const [parentId,accountIds] of parents){
    if(accountIds.length<2)continue;
    const proposed=manualConsolidationCandidate(data.accounts,accountIds);
    if(proposed)for(const [a,b] of proposed.sameAddressPairs){
      const location=data.accounts.find(account=>account.id===a);
      append(parentId,a,b,"Duplicate physical address",
        `${location?.streetAddress??"Address unverified"} · ${location?.postalCode??"ZIP unverified"}`);
    }
    // Duplicate order identifiers across two locations of one billing parent
    // indicate possible repeated ingestion. Do not treat a cloned order as
    // proof of two different acquisition events.
    const firstByOrderId=new Map<string,string>();
    const firstByNumber=new Map<string,string>();
    for(const order of data.orders){
      if(!accountIds.includes(order.accountId)||order.testOnly||order.status==="Cancelled")continue;
      const id=order.id.trim();
      const number=order.number.trim().toLowerCase();
      const before=id?firstByOrderId.get(id):undefined;
      if(before&&before!==order.accountId)append(parentId,before,order.accountId,"Duplicate order identity","Order ID "+id);
      else if(id&&!before)firstByOrderId.set(id,order.accountId);
      const previous=number?firstByNumber.get(number):undefined;
      if(previous&&previous!==order.accountId)append(parentId,previous,order.accountId,"Duplicate order identity","Order number "+order.number);
      else if(number&&!previous)firstByNumber.set(number,order.accountId);
    }
  }
  return holds.sort((a,b)=>a.parentId.localeCompare(b.parentId)||
    a.accountIds[0].localeCompare(b.accountIds[0])||a.accountIds[1].localeCompare(b.accountIds[1])||
    a.reason.localeCompare(b.reason));
}

export function acquisitionBonusHeldAccountIds(data:WorkspaceData):ReadonlySet<string>{
  return new Set(acquisitionBonusConsolidationHolds(data).flatMap(hold=>hold.accountIds));
}
