import type {WorkspaceData,CustomerAccount,Account,Activity} from "./types";
import {manualConsolidationCandidate} from "./account-consolidation-review";

export type AccountAssociationRequest={
  accountIds:string[];
  parent:{kind:"new";name:string;id:string}|{kind:"existing";id:string};
  operatorId:string;
  recordedAt:string;
  operationId:string;
  reason:string;
  verifiedCommonBillingOwner:boolean;
};
export type AccountAssociationResult=
  |{ok:true;data:WorkspaceData;parentId:string;updatedAccountIds:string[]}
  |{ok:false;message:string};

/**
 * Pure and immutable association of verified locations under one customer.
 * DO NOT call this directly from production UI: backend authorization, audit,
 * reconciliation and historical bonus checks must be added before live writes.
 */
export function applyAccountAssociation(
  data:WorkspaceData, request:AccountAssociationRequest,
):AccountAssociationResult {
  const ids=[...new Set(request.accountIds.filter(Boolean))];
  if(ids.length<2)return {ok:false,message:"Select at least two distinct account records."};
  if(!request.operatorId.trim()||!request.operationId.trim()||!Number.isFinite(Date.parse(request.recordedAt)))
    return {ok:false,message:"Missing verified operator, event ID or audit timestamp."};
  if(!request.verifiedCommonBillingOwner)
    return {ok:false,message:"Verify that the selected locations belong to the same billing owner."};
  if(request.reason.trim().length<12)
    return {ok:false,message:"An auditable association reason of at least 12 characters is required."};
  const group=manualConsolidationCandidate(data.accounts,ids);
  if(!group)return {ok:false,message:"At least one selected account record no longer exists."};
  if(group.sameAddressPairs.length)
    return {ok:false,message:"The same physical address appears more than once. Resolve duplicate-location identity first."};
  if(group.existingCustomerIds.length>1)
    return {ok:false,message:"Accounts already belong to different parent customers. Resolve conflicting legal and financial identities before reassignment."};

  let parent:CustomerAccount|undefined;
  const oldParent=group.existingCustomerIds[0];
  if(request.parent.kind==="existing"){
    parent=(data.customers??[]).find(c=>c.id===request.parent.id);
    if(!parent)return {ok:false,message:"The selected existing parent customer is not recorded."};
    if(oldParent&&parent.id!==oldParent)return {ok:false,message:"Existing account parent conflicts with the chosen parent."};
  }else{
    if(oldParent)return {ok:false,message:"An account already has a parent. Select that parent or resolve its identity first."};
    const name=request.parent.name.trim();
    if(name.length<2)return {ok:false,message:"Enter the verified billing parent display name."};
    if(!request.parent.id||data.customers?.some(c=>c.id===request.parent.id))
      return {ok:false,message:"A new, unique parent record identifier is required."};
    parent={id:request.parent.id,name,accountType:"Other",createdAt:request.recordedAt,taxDocumentType:"Undetermined"};
  }
  if(group.locations.every(account=>account.customerId===parent.id))
    return {ok:false,message:"All selected accounts already belong to this parent."};
  const selected=new Set(ids);
  const updatedAccountIds=group.locations.filter(a=>a.customerId!==parent.id).map(a=>a.id);
  const accounts=data.accounts.map(a=>selected.has(a.id)&&a.customerId!==parent.id?{...a,customerId:parent.id}:a);
  const additions:Activity[]=group.locations.filter(a=>updatedAccountIds.includes(a.id)).map(a=>({
    id:"act-parent-"+request.operationId+"-"+a.id,
    accountId:a.id,
    type:"note",
    title:"Customer parent association confirmed",
    detail:"Associated location with billing parent "+parent.name+" ("+parent.id+"). Previous parent: "+(a.customerId??"unlinked")+". Reason: "+request.reason.trim()+". No historical order, rep or payment attribution was changed.",
    at:request.recordedAt,
    userId:request.operatorId,
  }));
  const customers=request.parent.kind==="new"?[parent,...(data.customers??[])]:data.customers;
  // Source records, including orders, appointments, payments (separate ledger)
  // and rep/bonus attribution, are intentionally left with their original IDs.
  const next:WorkspaceData={...data,customers,accounts,activities:[...additions,...data.activities]};
  return {ok:true,data:next,parentId:parent.id,updatedAccountIds};
}
