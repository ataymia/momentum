import { accountIsVisible } from "./access";
import { isValidCalendarDateKey } from "./date-time";
import type { WorkspaceData, WorkspaceUser } from "./types";
import { customerForLocation } from "./crm-hierarchy";

export const CRM_STORAGE_KEY="momentum-crm-v1";
export type ContactScope="Customer"|"Location";
export type CrmContact={id:string;scope:ContactScope;customerId:string;locationId?:string;name:string;role:string;email?:string;phone?:string;decisionRole:"Decision maker"|"Influencer"|"Billing"|"Operations"|"Other";primary:boolean;active:boolean;createdAt:string;createdBy:string};
export type CrmInteraction={id:string;locationId:string;userId:string;type:"Call"|"Email"|"Text"|"Visit"|"Sample"|"Note";occurredAt:string;summary:string;outcome?:string;nextAction?:string;nextActionDate?:string;contactId?:string};
export type OpportunityStage="Prospecting"|"Qualified"|"Sample / evaluation"|"Commercial review"|"Order pending"|"Won"|"Lost";
export type Opportunity={id:string;customerId:string;locationId:string;name:string;stage:OpportunityStage;ownerId:string;estimatedCases?:number;expectedCloseDate?:string;nextAction:string;nextActionDate:string;status:"Open"|"Won"|"Lost";lossReason?:string;createdAt:string;createdBy:string;updatedAt:string};
export type OpportunityUpdate=Partial<Pick<Opportunity,"name"|"stage"|"estimatedCases"|"expectedCloseDate"|"nextAction"|"nextActionDate"|"status"|"lossReason">>;
export type OpportunityTransitionResult={ok:boolean;opportunity?:Opportunity;message?:string};
export type ResponsibilityEvent={id:string;locationId:string;fromUserId?:string;toUserId:string;effectiveAt:string;reason:string;changedBy:string;acceptedAt?:string};
export type CrmState={version:1;contacts:CrmContact[];interactions:CrmInteraction[];opportunities:Opportunity[];responsibilityHistory:ResponsibilityEvent[]};

const now=()=>new Date().toISOString();
const validDateKey=(value:string)=>isValidCalendarDateKey(value);
const validTimestamp=(value?:string)=>Boolean(value&&!Number.isNaN(new Date(value).getTime()));
const terminalStage=(stage:OpportunityStage)=>stage==="Won"||stage==="Lost";
const contactScopes=new Set<ContactScope>(["Customer","Location"]);
const decisionRoles=new Set<CrmContact["decisionRole"]>(["Decision maker","Influencer","Billing","Operations","Other"]);
const interactionTypes=new Set<CrmInteraction["type"]>(["Call","Email","Text","Visit","Sample","Note"]);
const opportunityStages=new Set<OpportunityStage>(["Prospecting","Qualified","Sample / evaluation","Commercial review","Order pending","Won","Lost"]);
const opportunityStatuses=new Set<Opportunity["status"]>(["Open","Won","Lost"]);
const uniqueById=<T extends {id:string}>(records:T[])=>{const seen=new Set<string>();return records.filter((record)=>Boolean(record?.id)&&!seen.has(record.id)&&(seen.add(record.id),true));};

export function createCrmSeed(data:WorkspaceData):CrmState{
  const contacts:CrmContact[]=data.accounts.filter((location)=>location.contactName).map((location)=>{const customer=customerForLocation(data,location);return{id:`contact-${location.id}-primary`,scope:"Location",customerId:customer.id,locationId:location.id,name:location.contactName,role:location.contactRole||"Contact",email:location.email||undefined,phone:location.phone||undefined,decisionRole:"Decision maker",primary:true,active:true,createdAt:now(),createdBy:"system"};});
  const responsibilityHistory:ResponsibilityEvent[]=data.accounts.map((location)=>({id:`responsibility-${location.id}-initial`,locationId:location.id,toUserId:location.ownerId,effectiveAt:location.responsibilityStartedAt??now(),reason:"Initial location responsibility",changedBy:location.originatorId??location.ownerId,acceptedAt:location.responsibilityStartedAt??now()}));
  const interactions:CrmInteraction[]=data.activities.filter((activity)=>activity.accountId).map((activity)=>({id:`crm-${activity.id}`,locationId:activity.accountId!,userId:activity.userId,type:activity.type==="call"?"Call":activity.type==="visit"?"Visit":activity.type==="sample"?"Sample":"Note",occurredAt:activity.at,summary:activity.title,outcome:activity.detail}));
  return{version:1,contacts,interactions,opportunities:[],responsibilityHistory};
}

export function reconcileResponsibilityHistory(history:ResponsibilityEvent[],data:WorkspaceData){
  const events=[...history];
  for(const location of data.accounts){
    const locationEvents=events.filter((event)=>event.locationId===location.id).sort((a,b)=>a.effectiveAt.localeCompare(b.effectiveAt));
    const latest=locationEvents.at(-1);
    if(!latest){
      events.push({id:`responsibility-${location.id}-initial`,locationId:location.id,toUserId:location.ownerId,effectiveAt:location.responsibilityStartedAt??now(),reason:"Initial location responsibility",changedBy:location.originatorId??location.ownerId,acceptedAt:location.responsibilityStartedAt??now()});
      continue;
    }
    if(latest.toUserId===location.ownerId)continue;
    const transferActivity=data.activities.filter((activity)=>activity.accountId===location.id&&activity.title==="Sales responsibility transferred").sort((a,b)=>b.at.localeCompare(a.at))[0];
    const effectiveAt=location.responsibilityStartedAt??transferActivity?.at??now();
    const eventId=`responsibility-${location.id}-${effectiveAt}`;
    if(events.some((event)=>event.id===eventId))continue;
    events.push({
      id:eventId,
      locationId:location.id,
      fromUserId:latest.toUserId,
      toUserId:location.ownerId,
      effectiveAt,
      reason:transferActivity?.detail||"Account responsibility changed in the canonical account record.",
      changedBy:transferActivity?.userId??location.ownerId,
    });
  }
  return events;
}

export function normalizeCrmState(input:unknown,data:WorkspaceData):CrmState{
  const seed=createCrmSeed(data);
  if(!input||typeof input!=="object")return seed;
  const state=input as Partial<CrmState>;
  const customerIds=new Set((data.customers??[]).map((customer)=>customer.id));
  const locationById=new Map(data.accounts.map((location)=>[location.id,location]));
  const employeeIds=new Set(data.users.filter((user)=>user.role!=="Customer").map((user)=>user.id));
  const responsibilityUsers=new Set(data.users.filter((user)=>["Administrator","Sales Manager","Sales Representative"].includes(user.role)).map((user)=>user.id));

  const seedContactIds=new Set(seed.contacts.map((contact)=>contact.id));
  const extraContacts=uniqueById((Array.isArray(state.contacts)?state.contacts:[]).filter((contact):contact is CrmContact=>{
    if(!contact?.id||seedContactIds.has(contact.id)||!contactScopes.has(contact.scope)||!customerIds.has(contact.customerId)||!contact.name?.trim()||!contact.role?.trim()||!decisionRoles.has(contact.decisionRole)||typeof contact.primary!=="boolean"||typeof contact.active!=="boolean"||!validTimestamp(contact.createdAt)||!(contact.createdBy==="system"||employeeIds.has(contact.createdBy)))return false;
    if(contact.scope==="Location"){const location=contact.locationId?locationById.get(contact.locationId):undefined;if(!location||location.customerId!==contact.customerId)return false;}
    if(contact.scope==="Customer"&&contact.locationId)return false;
    return true;
  }));
  const contacts=[...seed.contacts,...extraContacts];
  const primarySeen=new Set<string>();
  const normalizedContacts=contacts.map((contact)=>{if(!contact.primary)return contact;const key=`${contact.scope}:${contact.customerId}:${contact.locationId??"customer"}`;if(primarySeen.has(key))return{...contact,primary:false};primarySeen.add(key);return contact;});
  const contactById=new Map(normalizedContacts.map((contact)=>[contact.id,contact]));

  const seedInteractionIds=new Set(seed.interactions.map((interaction)=>interaction.id));
  const extraInteractions=uniqueById((Array.isArray(state.interactions)?state.interactions:[]).filter((interaction):interaction is CrmInteraction=>{
    const location=interaction&&locationById.get(interaction.locationId);
    if(!interaction?.id||seedInteractionIds.has(interaction.id)||!location||!employeeIds.has(interaction.userId)||!interactionTypes.has(interaction.type)||!validTimestamp(interaction.occurredAt)||!interaction.summary?.trim())return false;
    if(Boolean(interaction.nextAction?.trim())!==Boolean(interaction.nextActionDate))return false;
    if(interaction.nextActionDate&&!validDateKey(interaction.nextActionDate))return false;
    if(interaction.contactId){const contact=contactById.get(interaction.contactId);if(!contact||!contact.active||!(contact.scope==="Location"?contact.locationId===location.id&&contact.customerId===location.customerId:contact.customerId===location.customerId))return false;}
    return true;
  }));
  const interactions=[...seed.interactions,...extraInteractions];

  const opportunities=uniqueById((Array.isArray(state.opportunities)?state.opportunities:[]).filter((opportunity):opportunity is Opportunity=>{
    const location=opportunity&&locationById.get(opportunity.locationId);
    if(!opportunity?.id||!location||location.customerId!==opportunity.customerId||!opportunity.name?.trim()||!opportunityStages.has(opportunity.stage)||!opportunityStatuses.has(opportunity.status)||!responsibilityUsers.has(opportunity.ownerId)||!employeeIds.has(opportunity.createdBy)||!validTimestamp(opportunity.createdAt)||!validTimestamp(opportunity.updatedAt))return false;
    if(opportunity.estimatedCases!==undefined&&(!Number.isFinite(opportunity.estimatedCases)||opportunity.estimatedCases<0))return false;
    if(opportunity.expectedCloseDate&&!validDateKey(opportunity.expectedCloseDate))return false;
    if(opportunity.status==="Open"&&(!opportunity.nextAction?.trim()||!validDateKey(opportunity.nextActionDate)||terminalStage(opportunity.stage)))return false;
    if(opportunity.status==="Won"&&opportunity.stage!=="Won")return false;
    if(opportunity.status==="Lost"&&(opportunity.stage!=="Lost"||!opportunity.lossReason?.trim()))return false;
    return true;
  }));

  const storedResponsibility=uniqueById((Array.isArray(state.responsibilityHistory)?state.responsibilityHistory:[]).filter((event):event is ResponsibilityEvent=>Boolean(event?.id&&locationById.has(event.locationId)&&responsibilityUsers.has(event.toUserId)&&(!event.fromUserId||responsibilityUsers.has(event.fromUserId))&&event.fromUserId!==event.toUserId&&validTimestamp(event.effectiveAt)&&event.reason?.trim()&&(event.changedBy==="system"||employeeIds.has(event.changedBy))&&(!event.acceptedAt||validTimestamp(event.acceptedAt)))));
  const responsibilityBase=[...seed.responsibilityHistory];
  for(const storedEvent of storedResponsibility){
    const existingIndex=responsibilityBase.findIndex((event)=>event.id===storedEvent.id);
    if(existingIndex<0){responsibilityBase.push(storedEvent);continue;}
    if(storedEvent.effectiveAt<=responsibilityBase[existingIndex].effectiveAt)responsibilityBase[existingIndex]=storedEvent;
  }
  const responsibilityHistory=reconcileResponsibilityHistory(responsibilityBase,data);
  return{version:1,contacts:normalizedContacts,interactions,opportunities,responsibilityHistory};
}

export function crmRecordVisible(actor:WorkspaceUser|null|undefined,locationId:string,data:WorkspaceData){
  if(!actor||actor.role==="Warehouse")return false;
  const location=data.accounts.find((item)=>item.id===locationId);
  if(!location)return false;
  if(actor.role==="Operations")return true;
  return accountIsVisible(data,actor,location);
}

export function contactMatchesLocation(state:CrmState,contactId:string,locationId:string,data:WorkspaceData){
  const contact=state.contacts.find((item)=>item.id===contactId);
  const location=data.accounts.find((item)=>item.id===locationId);
  if(!contact||!location||!contact.active)return false;
  if(contact.scope==="Location")return contact.locationId===locationId&&contact.customerId===location.customerId;
  return contact.scope==="Customer"&&contact.customerId===location.customerId;
}

export function opportunityOwnerForLocation(data:WorkspaceData,locationId:string){
  const location=data.accounts.find((item)=>item.id===locationId);
  if(!location)return undefined;
  const owner=data.users.find((user)=>user.id===location.ownerId);
  if(!owner||!["Sales Representative","Sales Manager","Administrator"].includes(owner.role))return undefined;
  return owner.id;
}

export function normalizeOpportunityTransition(existing:Opportunity,patch:OpportunityUpdate,updatedAt=now()):OpportunityTransitionResult{
  const next:Opportunity={...existing,updatedAt};
  if(patch.name!==undefined)next.name=patch.name;
  if(patch.stage!==undefined)next.stage=patch.stage;
  if(patch.estimatedCases!==undefined)next.estimatedCases=patch.estimatedCases;
  if(patch.expectedCloseDate!==undefined)next.expectedCloseDate=patch.expectedCloseDate;
  if(patch.nextAction!==undefined)next.nextAction=patch.nextAction;
  if(patch.nextActionDate!==undefined)next.nextActionDate=patch.nextActionDate;
  if(patch.status!==undefined)next.status=patch.status;
  if(patch.lossReason!==undefined)next.lossReason=patch.lossReason;
  next.name=next.name.trim();
  next.nextAction=next.nextAction.trim();
  next.lossReason=next.lossReason?.trim()||undefined;

  if(!next.name)return{ok:false,message:"Opportunity name is required."};
  if(!opportunityStages.has(next.stage)||!opportunityStatuses.has(next.status))return{ok:false,message:"Opportunity status or stage is invalid."};
  if(next.estimatedCases!==undefined&&(!Number.isFinite(next.estimatedCases)||next.estimatedCases<0))return{ok:false,message:"Estimated cases cannot be negative."};
  if(next.expectedCloseDate&&!validDateKey(next.expectedCloseDate))return{ok:false,message:"Expected close date is invalid."};
  if(next.nextActionDate&&!validDateKey(next.nextActionDate))return{ok:false,message:"Next-action date is invalid."};

  if(patch.stage==="Won"||patch.status==="Won"){next.stage="Won";next.status="Won";next.lossReason=undefined;}
  else if(patch.stage==="Lost"||patch.status==="Lost"){next.stage="Lost";next.status="Lost";if(!next.lossReason)return{ok:false,message:"A loss reason is required before closing an opportunity as lost."};}
  else if(patch.status==="Open"&&terminalStage(next.stage))return{ok:false,message:"A terminal opportunity must be reopened to a non-terminal stage."};
  else if(next.status==="Won"&&next.stage!=="Won")next.stage="Won";
  else if(next.status==="Lost"&&next.stage!=="Lost")next.stage="Lost";

  if(next.status==="Open"){
    if(terminalStage(next.stage))return{ok:false,message:"Open opportunities cannot use Won or Lost stage."};
    if(!next.nextAction)return{ok:false,message:"Open opportunities require a next action."};
    if(!next.nextActionDate||!validDateKey(next.nextActionDate))return{ok:false,message:"Open opportunities require a valid next-action date."};
    next.lossReason=undefined;
  }
  if(next.status==="Won"){next.stage="Won";next.lossReason=undefined;}
  if(next.status==="Lost"){next.stage="Lost";if(!next.lossReason)return{ok:false,message:"A loss reason is required before closing an opportunity as lost."};}

  return{ok:true,opportunity:next};
}

export function openOpportunities(state:CrmState,locationId?:string){return state.opportunities.filter((item)=>item.status==="Open"&&(!locationId||item.locationId===locationId));}
