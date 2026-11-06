import type {WorkspaceUser} from "./types";
export const SUPPORT_CASE_KEY="momentum-support-cases-isolated-demo-v1";
export type CaseStatus="Open"|"Investigating"|"Waiting"|"Resolved"|"Closed";
export type CasePriority="Low"|"Normal"|"High"|"Critical";
export type CaseCategory="Delivery"|"Billing"|"Product"|"Account"|"Other";
export type CaseEvent={id:string;at:string;actorId:string;action:"Created"|"Note"|"Status"|"Owner";detail:string};
export type SupportCase={id:string;title:string;description:string;accountId?:string;orderId?:string;category:CaseCategory;priority:CasePriority;status:CaseStatus;createdBy:string;ownerId:string;createdAt:string;updatedAt:string;history:CaseEvent[]};
export type CaseDraft=Pick<SupportCase,"title"|"description"|"category"|"priority"> & {accountId?:string;orderId?:string};
const statuses:Record<CaseStatus,CaseStatus[]>={Open:["Investigating"],Investigating:["Waiting","Resolved"],Waiting:["Investigating"],Resolved:["Closed","Investigating"],Closed:["Investigating"]};
export const supportRole=(u:WorkspaceUser|null|undefined)=>Boolean(u&&["Administrator","Operations","Sales Manager","Sales Representative"].includes(u.role));
export const visibleCase=(u:WorkspaceUser|null|undefined,accounts:ReadonlySet<string>,c:SupportCase)=>Boolean(supportRole(u)&&u&&(u.role==="Administrator"||(c.accountId?accounts.has(c.accountId):c.createdBy===u.id||c.ownerId===u.id)));
export const managerCase=(u:WorkspaceUser|null|undefined,accounts:ReadonlySet<string>,c:SupportCase)=>Boolean(u&&visibleCase(u,accounts,c)&&(["Administrator","Operations"].includes(u.role)||(u.role==="Sales Manager"&&c.ownerId===u.id)));
export const validCaseDraft=(d:CaseDraft,accounts:ReadonlySet<string>,orders:ReadonlyMap<string,string>)=>
 d.title.trim().length>=4&&d.description.trim().length>=12&&["Low","Normal","High","Critical"].includes(d.priority)&&["Delivery","Billing","Product","Account","Other"].includes(d.category)&&
 (!d.accountId||accounts.has(d.accountId))&&(!d.orderId||Boolean(d.accountId&&orders.get(d.orderId)===d.accountId));
export function createCase(d:CaseDraft,u:WorkspaceUser|null|undefined,accounts:ReadonlySet<string>,orders:ReadonlyMap<string,string>,id:string,at:string):SupportCase|null{
 if(!u||!supportRole(u)||!validCaseDraft(d,accounts,orders)||!id||!Number.isFinite(Date.parse(at))||(u.role==="Sales Representative"&&!d.accountId))return null;
 return {id,title:d.title.trim(),description:d.description.trim(),accountId:d.accountId||undefined,orderId:d.orderId||undefined,category:d.category,priority:d.priority,status:"Open",createdBy:u.id,ownerId:u.id,createdAt:at,updatedAt:at,history:[{id:"event-"+id,at,actorId:u.id,action:"Created",detail:"Issue entered and assigned to creator"}]};
}
export function changeCase(c:SupportCase,u:WorkspaceUser|null|undefined,accounts:ReadonlySet<string>,action:"Note"|"Status"|"Owner",value:string,reason:string,staff:ReadonlyMap<string,WorkspaceUser>,eventId:string,at:string):SupportCase|null{
 if(!u||!visibleCase(u,accounts,c)||!eventId||c.history.some(e=>e.id===eventId)||!Number.isFinite(Date.parse(at)))return null;
 if(action==="Note"&&value.trim().length>=4)return {...c,updatedAt:at,history:[...c.history,{id:eventId,at,actorId:u.id,action,detail:value.trim()}]};
 if(!managerCase(u,accounts,c))return null;
 if(action==="Status"){
   const next=value as CaseStatus;
   if(!statuses[c.status].includes(next)||reason.trim().length<5)return null;
   return {...c,status:next,updatedAt:at,history:[...c.history,{id:eventId,at,actorId:u.id,action,detail:c.status+" to "+next+": "+reason.trim()}]};
 }
 if(action==="Owner"){
   const target=staff.get(value);
   if(!target||!["Administrator","Operations"].includes(u.role)||!["Administrator","Operations","Sales Manager","Sales Representative"].includes(target.role)||(u.role==="Operations"&&target.role!=="Operations")||target.id===c.ownerId)return null;
   return {...c,ownerId:target.id,updatedAt:at,history:[...c.history,{id:eventId,at,actorId:u.id,action,detail:"Assigned to "+target.name}]};
 }
 return null;
}
export function restoreDemoCases(input:unknown,users:ReadonlySet<string>):SupportCase[]{
 if(!Array.isArray(input))return [];
 const seen=new Set<string>();
 return input.filter((c):c is SupportCase=>{
   if(!c||typeof c!=="object"||typeof c.id!=="string"||seen.has(c.id)||!users.has(c.createdBy)||!users.has(c.ownerId)||!["Open","Investigating","Waiting","Resolved","Closed"].includes(c.status)||!Array.isArray(c.history)||!Number.isFinite(Date.parse(c.createdAt))||!Number.isFinite(Date.parse(c.updatedAt)))return false;
   seen.add(c.id);return true;
 });
}
