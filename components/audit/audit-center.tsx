"use client";

import { Search, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuditChange, AuditEvent } from "../../lib/audit-engine";
import { useAudit } from "../../lib/audit-context";
import type { WorkspaceData } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate } from "../ui";

const toneFor=(action:string)=>action==="Deleted"?"danger" as const:action==="Created"?"success" as const:"info" as const;
const moduleNames:Record<string,string>={Workspace:"Core records",CRM:"CRM & sales",Commerce:"Orders & billing",Inventory:"Inventory",HCM:"Human Resources",Payroll:"Payroll",Finance:"Finance",Accounting:"Accounting",Performance:"Performance & reports",Marketing:"Marketing","Period locks":"Period controls"};
const fieldNames:Record<string,string>={ownerId:"Responsible rep",accountManagerId:"Account manager",originatorId:"Opening rep",closerId:"Closer",creditedRepId:"Credited rep",pricingTier:"Pricing tier",pricingUpdatedAt:"Pricing change date",pricingUpdatedBy:"Pricing changed by",premiseType:"Premise",businessType:"Business type",categoryReviewDate:"Category review date",nextAction:"Next action",nextActionDate:"Next action date",paymentStatus:"Payment status",paidAt:"Payment date",pricePerCase:"Price per case",contactName:"Primary contact",contactRole:"Contact role",streetAddress:"Street address",locationName:"Location name",reorderCount:"Reorders",lifetimeCases:"Lifetime cases",status:"Status",stage:"Stage",cases:"Cases",facings:"Facings",observedStock:"Observed stock",cold:"Cold availability",shelfPrice:"Shelf price",managerId:"Manager",employeeId:"Employee",userId:"Employee",requesterId:"Requested by",assignedBy:"Assigned by",assignedAt:"Assigned date"};
const hiddenFields=new Set(["id","version","updatedAt","createdAt","accountId","locationId","customerId"]);
const humanField=(field:string):string=>fieldNames[field]??field.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").replace(/^./,(letter)=>letter.toUpperCase());

function humanValue(value:string|undefined,data:WorkspaceData):string{
  if(value===undefined||value===""||value==="null"||value==="undefined")return "Not set";
  if(value==="true")return "Yes";
  if(value==="false")return "No";
  const user=data.users.find((item)=>item.id===value);if(user)return user.name;
  const account=data.accounts.find((item)=>item.id===value);if(account)return account.locationName??account.name;
  const order=data.orders.find((item)=>item.id===value);if(order)return order.number;
  const appointment=data.appointments.find((item)=>item.id===value);if(appointment)return `${appointment.type} on ${formatDate(appointment.date,{month:"short",day:"numeric",year:"numeric"})}`;
  const lot=data.inventory.find((item)=>item.id===value);if(lot)return lot.lotCode;
  if(/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)){try{return formatDate(value,{month:"short",day:"numeric",year:"numeric",hour:value.includes("T")?"numeric":undefined,minute:value.includes("T")?"2-digit":undefined})}catch{return value}}
  if(value.startsWith("[")||value.startsWith("{")){try{const parsed:unknown=JSON.parse(value);if(Array.isArray(parsed))return parsed.map((item:unknown):string=>humanValue(String(item),data)).join(", ")||"None";return "Details updated"}catch{return value}}
  return value;
}
function readableChanges(changes:AuditChange[],data:WorkspaceData):Array<{label:string;before:string;after:string}>{return changes.filter((change)=>!hiddenFields.has(change.field)).slice(0,8).map((change)=>({label:humanField(change.field),before:humanValue(change.before,data),after:humanValue(change.after,data)}));}
function eventSummary(event:AuditEvent,data:WorkspaceData):string{const changes=readableChanges(event.changes,data);if(event.action==="Created")return `${event.label} was created.`;if(event.action==="Deleted")return `${event.label} was removed.`;if(changes.length===0)return `${event.label} was updated.`;if(changes.length===1)return `${changes[0].label} changed from ${changes[0].before} to ${changes[0].after}.`;return `${changes.length} details were updated.`;}

export function AuditCenter(){
  const {visibleEvents}=useAudit();
  const {currentUser,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [module,setModule]=useState("All");
  const modules=useMemo(()=>["All",...Array.from(new Set(visibleEvents.map((event)=>event.module))).sort()],[visibleEvents]);
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return visibleEvents.filter((event)=>{if(module!=="All"&&event.module!==module)return false;if(!needle)return true;const actor=data.users.find((user)=>user.id===event.actorId)?.name??event.actorId;return[event.label,event.summary,moduleNames[event.module]??event.module,actor,...event.changes.map((change)=>`${humanField(change.field)} ${change.before??""} ${change.after??""}`)].join(" ").toLowerCase().includes(needle)}).slice(0,250)},[visibleEvents,query,module,data.users]);
  if(!currentUser||currentUser.role==="Customer")return null;
  return <Section title="Record history" action={<StatusPill tone="neutral">{visibleEvents.length} events</StatusPill>}>
    <div className="audit-toolbar"><label className="table-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search history…"/></label><select value={module} onChange={(event)=>setModule(event.target.value)}>{modules.map((item)=><option key={item} value={item}>{item==="All"?"All areas":moduleNames[item]??item}</option>)}</select></div>
    <div className="audit-list">{filtered.map((event)=>{const actor=data.users.find((user)=>user.id===event.actorId);const changes=readableChanges(event.changes,data);return <article key={event.id} className="audit-item audit-item--readable"><span className="audit-item__icon"><ShieldCheck size={17}/></span><div className="audit-item__body"><div className="audit-item__head"><strong>{event.label}</strong><StatusPill tone={toneFor(event.action)} dot={false}>{event.action}</StatusPill></div><p>{eventSummary(event,data)}</p>{event.action==="Updated"&&changes.length>1&&<ul className="audit-readable-changes">{changes.map((change)=><li key={`${event.id}-${change.label}`}><span>{change.label}</span><b>{change.before}</b><em>to</em><b>{change.after}</b></li>)}</ul>}<small>{moduleNames[event.module]??event.module}</small></div><div className="audit-item__actor"><UserRound size={15}/><span>{actor?.name??"System"}<small>{formatDate(event.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</small></span></div></article>})}{filtered.length===0&&<div className="review-empty"><ShieldCheck size={26}/><h3>No matching history</h3><p>No recorded events match this search.</p></div>}</div>
  </Section>;
}
