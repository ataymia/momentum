"use client";

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  RotateCcw,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useState } from "react";
import type { Approval, PageKey } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, PageHeader, Section, StatusPill, formatDate } from "../ui";

const iconForApproval = (type: Approval["type"]) => {
  if (type === "Timecard") return Clock3;
  if (type === "Order") return ClipboardCheck;
  if (type === "Inventory adjustment") return Boxes;
  return ShieldCheck;
};

const priorityTone = (priority: Approval["priority"]) => {
  if (priority === "Urgent") return "danger" as const;
  if (priority === "High") return "warning" as const;
  return "neutral" as const;
};

export function WorkPage() {
  const { data, decideApproval, decideTimecard, navigate } = useWorkspace();
  const [tab, setTab] = useState<"approvals" | "exceptions" | "completed">("approvals");
  const pending = data.approvals.filter((approval) => approval.status === "Pending");
  const completed = data.approvals.filter((approval) => approval.status !== "Pending");
  const dueToday = pending.filter((item) => new Date(item.dueAt).toDateString() === new Date().toDateString()).length;

  const decide = (approval: Approval, decision: "Approved" | "Returned") => {
    if (approval.type === "Timecard") {
      const employee = data.users.find((user) => approval.title.includes(user.name));
      const timecard = data.timecards.find((card) => card.userId === employee?.id && card.status === "Submitted");
      if (timecard) {
        decideTimecard(timecard.id, decision === "Approved" ? "Manager approved" : "Returned");
        return;
      }
    }
    decideApproval(approval.id, decision);
  };

  const approvalCard = (approval: Approval) => {
    const Icon = iconForApproval(approval.type);
    const requester = data.users.find((user) => user.name === approval.requestedBy || user.firstName === approval.requestedBy);
    return (
      <article className="approval-card" key={approval.id}>
        <div className={`approval-card__icon approval-card__icon--${approval.priority.toLowerCase()}`}><Icon size={20} /></div>
        <div className="approval-card__main">
          <div className="approval-card__heading"><span>{approval.type}</span><StatusPill tone={priorityTone(approval.priority)} dot={false}>{approval.priority}</StatusPill></div>
          <h3>{approval.title}</h3>
          <p>{approval.detail}</p>
          <div className="approval-card__meta">
            {requester && <Avatar initials={requester.initials} color={requester.accent} size="sm" />}
            <span>Requested by {approval.requestedBy}</span><i /><span>{formatDate(approval.submittedAt, { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        </div>
        <div className="approval-card__actions">
          <Button size="sm" variant="secondary" icon={<RotateCcw size={15} />} onClick={() => decide(approval, "Returned")}>Return</Button>
          <Button size="sm" icon={<Check size={15} />} onClick={() => decide(approval, "Approved")}>Approve</Button>
        </div>
      </article>
    );
  };

  const exceptionRecords: Array<{ icon: typeof AlertTriangle; tone: string; title: string; detail: string; action: string; page: PageKey }> = [
    ...data.inventory.filter((lot) => lot.status === "Quality hold").map((lot) => ({ icon: Boxes, tone: "danger", title: `${lot.lotCode} is on quality hold`, detail: `${lot.onHand} cases at ${lot.location} are unavailable until the hold is resolved.`, action: "Review inventory", page: "inventory" as PageKey })),
    ...data.placements.filter((placement) => placement.status !== "Healthy").map((placement) => {
      const account = data.accounts.find((item) => item.id === placement.accountId);
      return { icon: Store, tone: placement.status === "Out of stock" ? "danger" : "warning", title: `${account?.name ?? "Placement"}: ${placement.status}`, detail: `${placement.observedStock} units observed, ${placement.facings} facings, ${placement.cold ? "cold" : "not cold"}.`, action: "Review placement", page: "retail" as PageKey };
    }),
    ...data.timecards.filter((card) => card.status === "Returned").map((card) => {
      const employee = data.users.find((user) => user.id === card.userId);
      return { icon: Clock3, tone: "warning", title: `${employee?.name ?? "Employee"} timecard was returned`, detail: `The week ending ${formatDate(card.weekEnd)} requires correction and resubmission.`, action: "Open timecard", page: "people" as PageKey };
    }),
  ];

  return (
    <div className="page page--work">
      <PageHeader
        eyebrow="Universal work queue"
        title="My work"
        description="Review approval requests and record-driven exceptions in one accountable place."
        actions={<StatusPill tone={pending.some((item) => item.priority === "Urgent") ? "danger" : "info"}>{pending.length} pending</StatusPill>}
      />

      <div className="work-summary">
        <div><span><ClipboardCheck size={19} /></span><div><small>Pending approval</small><strong>{pending.length}</strong></div></div>
        <div><span><AlertOctagon size={19} /></span><div><small>Exceptions</small><strong>{exceptionRecords.length}</strong></div></div>
        <div><span><Clock3 size={19} /></span><div><small>Due today</small><strong>{dueToday}</strong></div></div>
        <div><span><CheckCircle2 size={19} /></span><div><small>Completed</small><strong>{completed.length}</strong></div></div>
      </div>

      <div className="work-tabs">
        <button className={tab === "approvals" ? "is-active" : ""} onClick={() => setTab("approvals")}>Approvals <i>{pending.length}</i></button>
        <button className={tab === "exceptions" ? "is-active" : ""} onClick={() => setTab("exceptions")}>Exceptions <i>{exceptionRecords.length}</i></button>
        <button className={tab === "completed" ? "is-active" : ""} onClick={() => setTab("completed")}>Completed</button>
      </div>

      {tab === "approvals" && (
        <Section title="Ready for review" description="Open the underlying record before approving or returning it" className="approval-list-panel">
          <div className="approval-list">{pending.map(approvalCard)}</div>
          {pending.length === 0 && <div className="review-empty"><CheckCircle2 size={27} /><h3>Approval queue clear</h3><p>No records are waiting for a decision.</p></div>}
        </Section>
      )}

      {tab === "exceptions" && (
        <Section title="Exceptions requiring ownership" description="Flags create review work; they do not silently change records" className="exception-list-panel">
          <div className="exception-list">
            {exceptionRecords.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <span className={`exception-icon exception-icon--${item.tone}`}><Icon size={20} /></span>
                  <div><StatusPill tone={item.tone as "danger" | "warning" | "info"} dot={false}>{item.tone === "danger" ? "Blocking" : "Needs review"}</StatusPill><h3>{item.title}</h3><p>{item.detail}</p></div>
                  <Button variant="secondary" size="sm" icon={<ArrowRight size={15} />} onClick={() => navigate(item.page)}>{item.action}</Button>
                </article>
              );
            })}
          </div>
        </Section>
      )}

      {tab === "completed" && (
        <Section title="Decision history" description="Completed approval outcomes in this workspace" className="completed-list-panel">
          {completed.map((approval) => (
            <article className="completed-item" key={approval.id}>
              <span><CheckCircle2 size={18} /></span><div><strong>{approval.title}</strong><p>{approval.type} · {approval.requestedBy}</p></div><StatusPill tone={approval.status === "Approved" ? "success" : "danger"}>{approval.status}</StatusPill>
            </article>
          ))}
          {completed.length === 0 && <div className="review-empty"><p>No completed decisions yet. Approve or return a demo item to see it here.</p></div>}
        </Section>
      )}
    </div>
  );
}
