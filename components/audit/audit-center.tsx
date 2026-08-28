"use client";

import { Search, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useAudit } from "../../lib/audit-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate } from "../ui";

const toneFor = (action: string) => action === "Deleted" ? "danger" as const : action === "Created" ? "success" as const : "info" as const;

export function AuditCenter() {
  const { visibleEvents } = useAudit();
  const { currentUser, data } = useWorkspace();
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("All");
  const modules = useMemo(() => ["All", ...Array.from(new Set(visibleEvents.map((event) => event.module))).sort()], [visibleEvents]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleEvents.filter((event) => {
      if (module !== "All" && event.module !== module) return false;
      if (!needle) return true;
      const actor = data.users.find((user) => user.id === event.actorId)?.name ?? event.actorId;
      return [event.label, event.summary, event.entityType, event.entityId, actor, ...event.changes.map((change) => `${change.field} ${change.before ?? ""} ${change.after ?? ""}`)].join(" ").toLowerCase().includes(needle);
    }).slice(0, 250);
  }, [visibleEvents, query, module, data.users]);
  if (!currentUser || currentUser.role === "Customer") return null;
  const restricted = currentUser.role !== "Administrator";
  return <Section title="Record history & audit" description={restricted ? "History is scoped to records and changes your role is allowed to inspect." : "Append-only browser audit history for every tracked record mutation in this standalone build."} action={<StatusPill tone="neutral">{visibleEvents.length} visible events</StatusPill>}>
    <div className="audit-toolbar">
      <label className="table-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search record, person, field, ID, or change…"/></label>
      <select value={module} onChange={(event)=>setModule(event.target.value)}>{modules.map((item)=><option key={item}>{item}</option>)}</select>
    </div>
    <div className="audit-list">{filtered.map((event)=>{const actor=data.users.find((user)=>user.id===event.actorId);return <article key={event.id} className="audit-item"><span className="audit-item__icon"><ShieldCheck size={17}/></span><div className="audit-item__body"><div className="audit-item__head"><strong>{event.label}</strong><StatusPill tone={toneFor(event.action)} dot={false}>{event.action}</StatusPill></div><p>{event.summary}</p><small>{event.entityType} · {event.entityId}</small>{event.changes.length>0&&<div className="audit-change-list">{event.changes.map((change)=><span key={change.field}><b>{change.field}</b>{change.before!==undefined&&<em>{change.before}</em>}<i>→</i>{change.after!==undefined&&<em>{change.after}</em>}</span>)}</div>}</div><div className="audit-item__actor"><UserRound size={15}/><span>{actor?.name??event.actorId}<small>{formatDate(event.at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</small></span></div></article>;})}{filtered.length===0&&<div className="review-empty"><ShieldCheck size={26}/><h3>No matching audit events</h3><p>Changes will appear here as source records are created, edited, approved, moved, settled, or closed.</p></div>}</div>
  </Section>;
}
