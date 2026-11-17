"use client";

import { Search, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuditChange, AuditEvent } from "../../lib/audit-engine";
import {recoverableUnverifiedAuditEvents} from "../../lib/audit-engine";
import {auditRecoveryArchive} from "../../lib/audit-recovery";
import { useAudit } from "../../lib/audit-context";
import type { WorkspaceData } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate } from "../ui";

const toneFor=(action:string)=>action==="Deleted"?"danger" as const:action==="Created"?"success" as const:"info" as const;
const moduleNames:Record<string,string>={Workspace:"Core records",CRM:"CRM & sales",Commerce:"Orders & billing",Inventory:"Inventory",Delivery:"Delivery","Brand Ambassador":"Brand Ambassadors","Field tracking":"Field tracking",HCM:"Human Resources",Payroll:"Payroll",Finance:"Finance",Accounting:"Accounting",Performance:"Performance & reports",Marketing:"Marketing","Period locks":"Period controls",Identity:"Identity & onboarding"};
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
function eventSummary(event:AuditEvent,data:WorkspaceData):string{const changes=readableChanges(event.changes,data);if(event.action==="Created"){const detail=event.changes.find((change)=>change.field==="detail")?.after;return detail&&detail!=="null"&&detail!=="undefined"?detail:`${event.label} was created.`}if(event.action==="Deleted")return `${event.label} was removed.`;if(changes.length===0)return `${event.label} was updated.`;if(changes.length===1)return `${changes[0].label} changed from ${changes[0].before} to ${changes[0].after}.`;return `${changes.length} details were updated.`;}

export function AuditCenter(){
  const {audit,visibleEvents,auditWriteBlocked}=useAudit();
  const {currentUser,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [module,setModule]=useState("All");
  const [actionFilter,setActionFilter]=useState("All");
  const [actorFilter,setActorFilter]=useState("All");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const unverifiedCount=useMemo(()=>currentUser?.role==="Administrator"?
    recoverableUnverifiedAuditEvents(audit).length:0,[currentUser?.role,audit]);
  const downloadRecovery=()=>{
    if(currentUser?.role!=="Administrator"||unverifiedCount===0||typeof document==="undefined")return;
    const archive=auditRecoveryArchive(audit,new Date().toISOString());
    const url=URL.createObjectURL(new Blob([JSON.stringify(archive,null,2)],{type:"application/json"}));
    const link=document.createElement("a");
    link.href=url;
    link.download="momentum-unverified-audit-recovery.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const modules=useMemo(()=>["All",...Array.from(new Set(visibleEvents.map((event)=>event.module))).sort()],[visibleEvents]);
  const actors=useMemo(()=>[...new Set(visibleEvents.map(event=>event.actorId))].map(id=>({
    id,name:data.users.find(user=>user.id===id)?.name??(id==="system"?"Momentum system":"Actor "+id)
  })).sort((a,b)=>a.name.localeCompare(b.name)),[visibleEvents,data.users]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    return visibleEvents.filter(event=>{
      if(module!=="All"&&event.module!==module)return false;
      if(actionFilter!=="All"&&event.action!==actionFilter)return false;
      if(actorFilter!=="All"&&event.actorId!==actorFilter)return false;
      if(startDate&&event.at.slice(0,10)<startDate)return false;
      if(endDate&&event.at.slice(0,10)>endDate)return false;
      if(!needle)return true;
      const actor=data.users.find(user=>user.id===event.actorId)?.name??event.actorId;
      return [event.label,event.summary,event.entityId,moduleNames[event.module]??event.module,actor,
       ...event.changes.map(c=>humanField(c.field)+" "+(c.before??"")+" "+(c.after??""))]
        .join(" ").toLowerCase().includes(needle);
    }).slice(0,250);
  },[visibleEvents,query,module,actionFilter,actorFilter,startDate,endDate,data.users]);
  if(!currentUser||currentUser.role==="Customer")return null;
  return <div className="prototype-domain prototype-domain--administration">
   <header className="prototype-heading"><h1>Audit Center</h1>
     <p>Investigate who changed what, when, and in which department. Recorded source metadata must not be confused with independently verified actor attribution.</p></header>
   <div className="prototype-domain-statbar">
     <article><small>Visible source events</small><strong>{visibleEvents.length}</strong></article>
     <article><small>Distinct recorded actors</small><strong>{actors.length}</strong></article>
     <article><small>Matching events</small><strong>{filtered.length}</strong></article>
   </div>
   <Section title="Recorded activity" action={<StatusPill tone="neutral">{visibleEvents.length} visible events</StatusPill>}>
    {auditWriteBlocked&&<div className="audit-recovery-review" role="alert">
      <p>Audit source protection is active: stored history contains records that cannot be preserved safely by automatic normalization. Saving new audit events is blocked, and the existing Firebase history has not been overwritten. An Administrator must reconcile the original records before resuming writes.</p>
    </div>}
    {currentUser.role==="Administrator"&&unverifiedCount>0&&<div className="audit-recovery-review" role="note">
      <p>{unverifiedCount} legacy audit record{unverifiedCount===1?"":"s"} preserved separately because the originating user action or time cannot be verified. These are not shown as proven employee activity.</p>
      <button type="button" onClick={downloadRecovery}>Export unverified history for source reconciliation</button>
    </div>}
    <p className="audit-source-note">Actor and time are recorded source metadata. Independent attribution requires authenticated server evidence; unverified legacy observations are excluded.</p>
    <div className="audit-toolbar prototype-controls" aria-label="Audit history filters">
     <label className="table-search">Find an event <Search size={16}/><input type="search" aria-label="Search audit history" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, action, account, field or detail"/></label>
     <label>Department <select aria-label="Filter record history by area" value={module} onChange={e=>setModule(e.target.value)}>{modules.map(item=><option key={item} value={item}>{item==="All"?"All areas":moduleNames[item]??item}</option>)}</select></label>
     <label>Action <select aria-label="Filter audit action" value={actionFilter} onChange={e=>setActionFilter(e.target.value)}><option value="All">All</option><option>Created</option><option>Updated</option><option>Deleted</option></select></label>
     <label>Actor <select aria-label="Filter audit actor" value={actorFilter} onChange={e=>setActorFilter(e.target.value)}><option value="All">All recorded actors</option>{actors.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
     <label>From <input aria-label="Audit start date" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
     <label>Through <input aria-label="Audit end date" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
     <button type="button" onClick={()=>{setQuery("");setModule("All");setActionFilter("All");setActorFilter("All");setStartDate("");setEndDate("");}}>Clear filters</button>
    </div>
    <p className="prototype-note" role="status">Showing {filtered.length} matching events out of {visibleEvents.length} records in your access scope. This view is limited to 250 events; narrow the dates to review older activity. Unverified legacy records require independent recovery review.</p>
    <div className="audit-list">{filtered.map((event)=>{const actor=data.users.find((user)=>user.id===event.actorId);const changes=readableChanges(event.changes,data);return <article key={event.id} className="audit-item audit-item--readable"><span className="audit-item__icon"><ShieldCheck size={17}/></span><div className="audit-item__body"><div className="audit-item__head"><strong>{event.label}</strong><StatusPill tone={toneFor(event.action)} dot={false}>{event.action}</StatusPill></div><p>{eventSummary(event,data)}</p>{event.action==="Updated"&&changes.length>1&&<ul className="audit-readable-changes">{changes.map((change)=><li key={`${event.id}-${change.label}`}><span>{change.label}</span><b>{change.before}</b><em>to</em><b>{change.after}</b></li>)}</ul>}<small>{moduleNames[event.module]??event.module}{event.provenanceStatus==="source-reported"?" · Source-reported attribution":""}</small></div><div className="audit-item__actor"><UserRound size={15}/><span>{actor?.name??(event.actorId==="system"?"Momentum system":`${event.actorRole} · ${event.actorId}`)}<small>{formatDate(event.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</small></span></div></article>})}{filtered.length===0&&<div className="review-empty"><ShieldCheck size={26}/><h3>No matching history</h3><p>No recorded events match this search.</p></div>}</div>
  </Section>
 </div>;
}
