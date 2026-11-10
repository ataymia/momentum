/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,indent */
/**
 * Authenticated support-case request policy. This module has no Firestore or
 * browser dependencies and rejects client-owned actor, history and timestamps.
 */
export type CaseRole="Administrator"|"Operations"|"Sales Manager"|"Sales Representative";
export type CaseAccess={uid:string;role:CaseRole;accountState:string;managedTeams?:string[]};
export type CaseAccount={id:string;ownerId?:string;stage?:string};
export type CaseOwnerAccess={uid:string;role:string;accountState:string;team?:string;managerId?:string};
export type CaseStatus="Open"|"Investigating"|"Waiting"|"Resolved"|"Closed";
export type CasePriority="Low"|"Normal"|"High"|"Critical";
export type CaseCategory="Delivery"|"Billing"|"Product"|"Account"|"Other";
export type CaseInput={title:string;description:string;accountId?:string;orderId?:string;category:CaseCategory;priority:CasePriority};
export type CaseEvent={id:string;at:string;actorId:string;action:"Created"|"Note"|"Status"|"Owner";detail:string};
export type CaseRecord={
 id:string;title:string;description:string;accountId?:string;orderId?:string;
 category:CaseCategory;priority:CasePriority;status:CaseStatus;
 createdBy:string;ownerId:string;createdAt:string;updatedAt:string;
 revision:number;history:CaseEvent[];
};
export type CaseCommand={kind:"create";draft:CaseInput}|
 {kind:"note"|"status"|"assign";caseId:string;value:string;reason?:string;revision:number};
export type Validation={ok:true;command:CaseCommand}|{ok:false;message:string};
const row=(x:unknown):x is Record<string,unknown>=>Boolean(x&&typeof x==="object"&&!Array.isArray(x));
const txt=(x:unknown)=>typeof x==="string"?x.trim():"";
const id=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,130}$/.test(x);
const valid=(x:unknown,allowed:readonly string[])=>row(x)&&Object.keys(x).every(k=>allowed.includes(k));
const categories=["Delivery","Billing","Product","Account","Other"];
const priorities=["Low","Normal","High","Critical"];
const transitions:Record<CaseStatus,readonly CaseStatus[]>={
 Open:["Investigating"],Investigating:["Waiting","Resolved"],
 Waiting:["Investigating"],Resolved:["Closed","Investigating"],Closed:["Investigating"],
};
/**
 * @param {unknown} key Idempotency token.
 * @return {boolean} Bounded key.
 */
export function validSupportRequestId(key:unknown):key is string{
 return typeof key==="string"&&/^[A-Za-z0-9_-]{16,80}$/.test(key);
}
/**
 * @param {unknown} raw Untrusted command.
 * @return {Validation} Sanitized command, never browser-owned actor/event data.
 */
export function validateCaseCommand(raw:unknown):Validation{
 if(!row(raw)||typeof raw.kind!=="string")return{ok:false,message:"Case action is required."};
 if(raw.kind==="create"){
  if(!valid(raw,["kind","draft"])||!valid(raw.draft,["title","description","accountId","orderId","priority","category"]))
   return{ok:false,message:"Case request contains unauthorized fields."};
  const d=raw.draft as Record<string,unknown>;
  const title=txt(d.title),description=txt(d.description),accountId=txt(d.accountId)||undefined;
  const orderId=txt(d.orderId)||undefined;
  if(title.length<4||title.length>160||description.length<12||description.length>4000)
   return{ok:false,message:"Provide a title and issue detail within the allowed lengths."};
  if(!priorities.includes(txt(d.priority))||!categories.includes(txt(d.category))||
    (accountId&&!id(accountId))||(orderId&&!id(orderId))||(orderId&&!accountId))
   return{ok:false,message:"Choose a valid category, priority, customer and matching order."};
  return{ok:true,command:{kind:"create",draft:{title,description,accountId,orderId,
   priority:txt(d.priority) as CasePriority,category:txt(d.category) as CaseCategory}}};
 }
 if(!["note","status","assign"].includes(raw.kind)||
   !valid(raw,["kind","caseId","value","reason","revision"])||
   !id(raw.caseId)||typeof raw.revision!=="number"||!Number.isSafeInteger(raw.revision)||raw.revision<1)
   return{ok:false,message:"Invalid case action or revision."};
 const value=txt(raw.value),reason=txt(raw.reason);
 if(raw.kind==="note"&&(value.length<4||value.length>4000)||
   raw.kind==="status"&&(!Object.keys(transitions).includes(value)||reason.length<5||reason.length>1000)||
   raw.kind==="assign"&&(!id(value)||reason.length<5||reason.length>1000))
   return{ok:false,message:"Case action needs valid details and a decision reason."};
 return{ok:true,command:{kind:raw.kind as "note"|"status"|"assign",
  caseId:raw.caseId as string,value,reason,revision:raw.revision}};
}
/**
 * @param {CaseAccess} actor Verified live userAccess role.
 * @param {CaseAccount|undefined} account Existing canonical account.
 * @param {CaseOwnerAccess|undefined} owner Verified live owner identity.
 * @return {boolean} Whether actor may act on that account.
 */
export function canSeeAccount(actor:CaseAccess,account:CaseAccount|undefined,
 owner?:CaseOwnerAccess):boolean{
 if(actor.accountState!=="Active")return false;
 if(actor.role==="Administrator"||actor.role==="Operations")return true;
 if(!account)return false;
 if(account.ownerId===actor.uid)return true;
 if(actor.role==="Sales Representative")return false;
 return Boolean(owner&&owner.accountState==="Active"&&
   ["Sales Manager","Sales Representative"].includes(owner.role)&&
   (owner.managerId===actor.uid||
    Boolean(owner.team&&actor.managedTeams?.includes(owner.team))));
}
/**
 * @param {CaseAccess} actor Verified actor.
 * @param {CaseRecord} item Existing case.
 * @param {boolean} scopedAccount Account scope authorization.
 * @return {boolean} Whether actor may inspect or note the issue.
 */
export function canSeeSupportCase(actor:CaseAccess,item:CaseRecord,scopedAccount:boolean):boolean{
 if(actor.accountState!=="Active")return false;
 if(actor.role==="Administrator")return true;
 if(actor.role==="Operations")return item.accountId?scopedAccount:
   item.createdBy===actor.uid||item.ownerId===actor.uid;
 if(actor.role==="Sales Representative")return scopedAccount&&
   (item.createdBy===actor.uid||item.ownerId===actor.uid);
 return item.accountId?scopedAccount:item.createdBy===actor.uid||item.ownerId===actor.uid;
}
/**
 * @param {CaseRecord} item Current case.
 * @param {CaseCommand} command Validated update.
 * @param {CaseAccess} actor Server-verified role.
 * @param {string} eventId Server-owned event ID.
 * @param {string} at Server timestamp.
 * @param {string|undefined} assigneeLabel Verified directory display name.
 * @return {CaseRecord|null} Updated case or forbidden transition.
 */
export function applyCaseCommand(item:CaseRecord,command:CaseCommand,actor:CaseAccess,
 eventId:string,at:string,assigneeLabel?:string):CaseRecord|null{
 if(command.kind==="create"||command.revision!==item.revision||
   item.history.some(event=>event.id===eventId)||item.history.length>=200)return null;
 let status=item.status,ownerId=item.ownerId,detail="";
 if(command.kind==="note")detail=command.value;
 else{
  if(!["Administrator","Operations"].includes(actor.role)&&
    !(actor.role==="Sales Manager"&&item.ownerId===actor.uid&&command.kind==="status"))return null;
  if(command.kind==="status"){
   if(!transitions[item.status].includes(command.value as CaseStatus))return null;
   status=command.value as CaseStatus;
   detail=item.status+" to "+status+": "+command.reason;
  }else{
   if(!["Administrator","Operations"].includes(actor.role)||
     !assigneeLabel||item.ownerId===command.value)return null;
   ownerId=command.value;
   detail="Assigned to "+assigneeLabel+": "+command.reason;
  }
 }
 return{...item,status,ownerId,updatedAt:at,revision:item.revision+1,
   history:[...item.history,{id:eventId,at,actorId:actor.uid,action:
     command.kind==="note"?"Note":command.kind==="status"?"Status":"Owner",detail}]};
}
