import type {WorkspaceData,WorkspaceUser} from "./types";
import {accountIsVisible} from "./access";
export const SUPPORT_CASE_KEY="momentum-support-cases-isolated-demo-v1";
export type CaseStatus="Open"|"Investigating"|"Waiting"|"Resolved"|"Closed";
export type CasePriority="Low"|"Normal"|"High"|"Critical";
export type CaseCategory="Delivery"|"Billing"|"Product"|"Account"|"Other";
export type CaseEvent={id:string;at:string;actorId:string;action:"Created"|"Note"|"Status"|"Owner";detail:string};
export type SupportCase={id:string;title:string;description:string;accountId?:string;orderId?:string;category:CaseCategory;priority:CasePriority;status:CaseStatus;createdBy:string;ownerId:string;createdAt:string;updatedAt:string;history:CaseEvent[]};
export type CaseDraft=Pick<SupportCase,"title"|"description"|"category"|"priority"> & {accountId?:string;orderId?:string};
const statuses:Record<CaseStatus,CaseStatus[]>={Open:["Investigating"],Investigating:["Waiting","Resolved"],Waiting:["Investigating"],Resolved:["Closed","Investigating"],Closed:["Investigating"]};
/** Keep the UI state machine and server-validation candidate list in sync. */
export const caseNextStatuses=(status:CaseStatus):readonly CaseStatus[]=>statuses[status]??[];
export const caseStatusLabel=(status:CaseStatus)=>status==="Waiting"?"Waiting on customer":status;
/** Demo assignment picker only. Live assignment requires equivalent server-side ownership checks. */
export function caseAssignableStaff(data:WorkspaceData,actor:WorkspaceUser|null|undefined,item:SupportCase):WorkspaceUser[]{
 if(!actor||!["Administrator","Operations"].includes(actor.role))return [];
 const account=item.accountId?data.accounts.find(a=>a.id===item.accountId):undefined;
 if(item.accountId&&!account)return [];
 return data.users.filter(target=>{
  if(target.employmentStatus==="Separated"||!["Administrator","Operations","Sales Manager","Sales Representative"].includes(target.role))return false;
  if(actor.role==="Operations"&&target.role!=="Operations")return false;
  if(!account)return ["Administrator","Operations"].includes(target.role);
  if(target.role==="Sales Representative")return account.ownerId===target.id;
  return accountIsVisible(data,target,account);
 });
}
export const supportRole=(u:WorkspaceUser|null|undefined)=>Boolean(u&&["Administrator","Operations","Sales Manager","Sales Representative"].includes(u.role));
/** Sales reps may read cases they own or opened, never every case on a shared unassigned prospect.
 * Manager and operations personnel remain confined to account visibility; administrators see all. */
export function visibleCase(u:WorkspaceUser|null|undefined,accounts:ReadonlySet<string>,c:SupportCase):boolean{
 if(!u||!supportRole(u))return false;
 if(u.role==="Administrator")return true;
 if(u.role==="Sales Representative")return c.createdBy===u.id||c.ownerId===u.id;
 return c.accountId?accounts.has(c.accountId):c.createdBy===u.id||c.ownerId===u.id;
}
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
   if(!caseNextStatuses(c.status).includes(next)||reason.trim().length<5)return null;
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
 const seen=new Set<string>(),statusList=Object.keys(statuses);
 const priorities=["Low","Normal","High","Critical"],categories=["Delivery","Billing","Product","Account","Other"];
 const actions=["Created","Note","Status","Owner"];
 const validDate=(v:unknown)=>typeof v==="string"&&Number.isFinite(Date.parse(v));
 return input.filter((c):c is SupportCase=>{
   if(!c||typeof c!=="object"||typeof c.id!=="string"||!c.id.trim()||seen.has(c.id)||
     typeof c.title!=="string"||c.title.trim().length<4||typeof c.description!=="string"||c.description.trim().length<12||
     !categories.includes(c.category)||!priorities.includes(c.priority)||!statusList.includes(c.status)||
     !users.has(c.createdBy)||!users.has(c.ownerId)||!validDate(c.createdAt)||!validDate(c.updatedAt)||
     (c.accountId!==undefined&&typeof c.accountId!=="string")||(c.orderId!==undefined&&typeof c.orderId!=="string")||
     !Array.isArray(c.history)||!c.history.length||c.history[0]?.action!=="Created"||
     c.history[0]?.actorId!==c.createdBy)return false;
   const eventIds=new Set<string>();
   for(const event of c.history){
     if(!event||typeof event.id!=="string"||!event.id.trim()||eventIds.has(event.id)||
       typeof event.detail!=="string"||!event.detail.trim()||!validDate(event.at)||
       !users.has(event.actorId)||!actions.includes(event.action))return false;
     eventIds.add(event.id);
   }
   seen.add(c.id);return true;
 });
}
