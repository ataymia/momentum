"use client";

import { History } from "lucide-react";
import { useAudit } from "../../lib/audit-context";
import { formatDate } from "../ui";

export function RecordHistory({ accountId, entityType, entityId, limit = 6 }: { accountId?: string; entityType?: string; entityId?: string; limit?: number }) {
  const { eventsForAccount, eventsForRecord } = useAudit();
  const events = (accountId ? eventsForAccount(accountId) : entityType && entityId ? eventsForRecord(entityType, entityId) : []).slice(0, limit);
  return <section className="detail-section"><div className="detail-section__heading"><h3>History</h3><span>{events.length} recent change{events.length===1?"":"s"}</span></div><div className="mini-timeline">{events.map((event)=><article key={event.id}><i/><div><strong>{event.action}: {event.label}</strong><p>{event.summary}</p><small>{formatDate(event.at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</small></div></article>)}{events.length===0&&<div className="record-history-empty"><History size={16}/><span>No recorded changes in this session yet.</span></div>}</div></section>;
}
