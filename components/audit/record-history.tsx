"use client";

import { History } from "lucide-react";
import { useAudit } from "../../lib/audit-context";
import { useWorkspace } from "../../lib/workspace-context";
import { formatDate } from "../ui";

export function RecordHistory({ accountId, entityType, entityId, limit = 12 }: { accountId?: string; entityType?: string; entityId?: string; limit?: number }) {
  const { eventsForAccount, eventsForRecord } = useAudit();
  const { data, currentUser } = useWorkspace();
  const events = (accountId ? eventsForAccount(accountId) : entityType && entityId ? eventsForRecord(entityType, entityId) : []).slice(0, limit);
  const detailed = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";
  return <section className="detail-section"><div className="detail-section__heading"><h3>History</h3><span>{events.length} recent change{events.length===1?"":"s"}</span></div><div className="mini-timeline">{events.map((event)=>{const actor=data.users.find((user)=>user.id===event.actorId);return <article key={event.id}><i/><div><strong>{event.action}: {event.label}</strong><p>{event.summary}</p>{detailed&&event.changes.length>0&&<div className="record-history-changes">{event.changes.map((change)=><small key={`${event.id}-${change.field}`}><b>{change.field}</b>{change.before!==undefined?` ${change.before} →`:""} {change.after??"removed"}</small>)}</div>}<small>{formatDate(event.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})} · {actor?.name??event.actorRole??"System"}</small></div></article>})}{events.length===0&&<div className="record-history-empty"><History size={16}/><span>No recorded changes yet.</span></div>}</div></section>;
}
