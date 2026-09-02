"use client";

import { History } from "lucide-react";
import type { AuditChange } from "../../lib/audit-engine";
import { useAudit } from "../../lib/audit-context";
import type { WorkspaceData } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { formatDate } from "../ui";

const fieldNames:Record<string,string>={
  ownerId:"Responsible rep",accountManagerId:"Account manager",originatorId:"Opening rep",closerId:"Closer",creditedRepId:"Credited rep",
  pricingTier:"Pricing tier",pricingUpdatedAt:"Pricing change date",pricingUpdatedBy:"Pricing changed by",premiseType:"Premise",businessType:"Business type",categoryReviewDate:"Category review date",
  nextAction:"Next action",nextActionDate:"Next action date",lastActivity:"Last activity",paymentStatus:"Payment status",paidAt:"Payment date",pricePerCase:"Price per case",
  contactName:"Primary contact",contactRole:"Contact role",streetAddress:"Street address",locationName:"Location name",reorderCount:"Reorders",lifetimeCases:"Lifetime cases",
  status:"Status",stage:"Stage",cases:"Cases",facings:"Facings",observedStock:"Observed stock",cold:"Cold availability",shelfPrice:"Shelf price",
  managerId:"Manager",employeeId:"Employee",userId:"Employee",requesterId:"Requested by",assignedBy:"Assigned by",assignedAt:"Assigned date"
};
const hiddenFields=new Set(["id","version","updatedAt","createdAt","accountId","locationId","customerId"]);

const humanField=(field:string)=>fieldNames[field]??field.replace(/([a-z0-9])([A-Z])/g,"$1 $2").replace(/[_-]+/g," ").replace(/^./,(letter)=>letter.toUpperCase());

function humanValue(value:string|undefined,data:WorkspaceData){
  if(value===undefined||value===""||value==="null"||value==="undefined")return "Not set";
  if(value==="true")return "Yes";
  if(value==="false")return "No";
  const user=data.users.find((item)=>item.id===value);if(user)return user.name;
  const account=data.accounts.find((item)=>item.id===value);if(account)return account.locationName??account.name;
  const order=data.orders.find((item)=>item.id===value);if(order)return order.number;
  const appointment=data.appointments.find((item)=>item.id===value);if(appointment)return `${appointment.type} on ${formatDate(appointment.date,{month:"short",day:"numeric",year:"numeric"})}`;
  const lot=data.inventory.find((item)=>item.id===value);if(lot)return lot.lotCode;
  if(/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)){try{return formatDate(value,{month:"short",day:"numeric",year:"numeric",hour:value.includes("T")?"numeric":undefined,minute:value.includes("T")?"2-digit":undefined})}catch{return value}}
  if(value.startsWith("[")||value.startsWith("{")){try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map((item)=>humanValue(String(item),data)).join(", ")||"None";return "Details updated"}catch{return value}}
  return value;
}

function readableChanges(changes:AuditChange[],data:WorkspaceData){return changes.filter((change)=>!hiddenFields.has(change.field)).slice(0,8).map((change)=>({label:humanField(change.field),before:humanValue(change.before,data),after:humanValue(change.after,data)}));}

export function RecordHistory({ accountId, entityType, entityId, limit = 12 }: { accountId?: string; entityType?: string; entityId?: string; limit?: number }) {
  const { eventsForAccount, eventsForRecord } = useAudit();
  const { data } = useWorkspace();
  const events = (accountId ? eventsForAccount(accountId) : entityType && entityId ? eventsForRecord(entityType, entityId) : []).slice(0, limit);
  return <section className="detail-section record-history"><div className="detail-section__heading"><h3>History</h3><span>{events.length} recent event{events.length===1?"":"s"}</span></div><div className="history-event-list">{events.map((event)=>{const actor=data.users.find((user)=>user.id===event.actorId);const changes=readableChanges(event.changes,data);const summary=event.action==="Created"?`${event.label} was created.`:event.action==="Deleted"?`${event.label} was removed.`:changes.length===0?`${event.label} was updated.`:changes.length===1?`${changes[0].label} changed from ${changes[0].before} to ${changes[0].after}.`:`${changes.length} details were updated.`;return <article key={event.id} className="history-event"><i/><div><strong>{event.label}</strong><p>{summary}</p>{event.action==="Updated"&&changes.length>1&&<ul>{changes.map((change)=><li key={`${event.id}-${change.label}`}><span>{change.label}</span><b>{change.before}</b><em>to</em><b>{change.after}</b></li>)}</ul>}<small>{formatDate(event.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})} · {actor?.name??"System"}</small></div></article>})}{events.length===0&&<div className="record-history-empty"><History size={16}/><span>No recorded changes yet.</span></div>}</div></section>;
}
