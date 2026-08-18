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
  Eye,
  FileText,
  RotateCcw,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useMemo, useState } from "react";
import { canReviewApproval } from "../../lib/access";
import type { Approval, PageKey } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Modal, PageHeader, Section, StatusPill, formatDate, formatMoney, hoursBetween } from "../ui";

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
  const { data, scope, currentUser, decideApproval, decideTimecard, navigate } = useWorkspace();
  const [tab, setTab] = useState<"approvals" | "exceptions" | "completed">("approvals");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const pending = scope.approvals.filter((approval) => approval.status === "Pending");
  const completed = scope.approvals.filter((approval) => approval.status !== "Pending");
  const dueToday = pending.filter((item) => new Date(item.dueAt).toDateString() === new Date().toDateString()).length;
  const reviewApproval = scope.approvals.find((approval) => approval.id === reviewId) ?? null;

  const reviewOrder = reviewApproval?.type === "Order"
    ? scope.orders.find((order) => order.id === reviewApproval.recordId) ?? null
    : null;
  const reviewAccount = reviewOrder ? scope.accounts.find((account) => account.id === reviewOrder.accountId) ?? null : null;
  const reviewTimecard = reviewApproval?.type === "Timecard"
    ? data.timecards.find((card) => card.id === reviewApproval.recordId) ?? null
    : null;
  const reviewEmployee = reviewTimecard ? data.users.find((user) => user.id === reviewTimecard.userId) ?? null : null;
  const reviewEntries = useMemo(() => {
    if (!reviewTimecard) return [];
    return data.timeEntries
      .filter((entry) => entry.userId === reviewTimecard.userId && entry.date >= reviewTimecard.weekStart && entry.date <= reviewTimecard.weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.timeEntries, reviewTimecard]);
  const reviewHours = reviewEntries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);

  const canDecideReview = Boolean(
    reviewApproval &&
    canReviewApproval(data, currentUser, reviewApproval) &&
    (reviewApproval.type !== "Timecard" || reviewTimecard?.userId !== currentUser?.id),
  );

  const decide = (approval: Approval, decision: "Approved" | "Returned") => {
    if (approval.type === "Timecard") {
      const timecard = data.timecards.find((card) => card.id === approval.recordId && card.status === "Submitted");
      if (timecard) {
        decideTimecard(timecard.id, decision === "Approved" ? "Manager approved" : "Returned");
        setReviewId(null);
        return;
      }
    }
    decideApproval(approval.id, decision);
    setReviewId(null);
  };

  const openFullRecord = () => {
    if (!reviewApproval) return;
    if (reviewApproval.type === "Order" && reviewOrder) {
      window.sessionStorage.setItem("momentum-focus-record", reviewOrder.id);
      setReviewId(null);
      navigate("orders");
      return;
    }
    if (reviewApproval.type === "Timecard") {
      setReviewId(null);
      navigate("people");
    }
  };

  const detailFor = (approval: Approval) => {
    if (approval.type === "Timecard") {
      const card = data.timecards.find((item) => item.id === approval.recordId);
      if (!card) return approval.detail;
      const entries = data.timeEntries.filter((entry) => entry.userId === card.userId && entry.date >= card.weekStart && entry.date <= card.weekEnd);
      const hours = entries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);
      return `${hours.toFixed(2)} recorded hours · ${entries.length} daily record${entries.length === 1 ? "" : "s"} · ${card.attested ? "employee attested" : "attestation missing"}`;
    }
    if (approval.type === "Order") {
      const order = scope.orders.find((item) => item.id === approval.recordId);
      const account = scope.accounts.find((item) => item.id === order?.accountId);
      return order ? `${order.cases} cases · ${formatMoney(order.amount)} · ${account?.name ?? "Linked account"}` : approval.detail;
    }
    return approval.detail;
  };

  const approvalCard = (approval: Approval) => {
    const Icon = iconForApproval(approval.type);
    const requester = data.users.find((user) => user.id === approval.requesterId) ?? data.users.find((user) => user.name === approval.requestedBy);
    const canDecide = canReviewApproval(data, currentUser, approval);
    return (
      <article className="approval-card" key={approval.id}>
        <div className={`approval-card__icon approval-card__icon--${approval.priority.toLowerCase()}`}><Icon size={20} /></div>
        <div className="approval-card__main">
          <div className="approval-card__heading"><span>{approval.type}</span><StatusPill tone={priorityTone(approval.priority)} dot={false}>{approval.priority}</StatusPill></div>
          <h3>{approval.title}</h3>
          <p>{detailFor(approval)}</p>
          <div className="approval-card__meta">
            {requester && <Avatar initials={requester.initials} color={requester.accent} size="sm" />}
            <span>Requested by {approval.requestedBy}</span><i /><span>{formatDate(approval.submittedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
        </div>
        <div className="approval-card__actions approval-card__actions--review">
          <Button size="sm" variant={canDecide ? "primary" : "secondary"} icon={<Eye size={15} />} onClick={() => setReviewId(approval.id)}>Review record</Button>
          {!canDecide && <span className="approval-card__waiting"><Clock3 size={15}/><span>Waiting for an authorized reviewer</span></span>}
        </div>
      </article>
    );
  };

  const exceptionRecords: Array<{ icon: typeof AlertTriangle; tone: string; title: string; detail: string; action: string; page: PageKey }> = [
    ...scope.inventory.filter((lot) => lot.status === "Quality hold").map((lot) => ({ icon: Boxes, tone: "danger", title: `${lot.lotCode} is on quality hold`, detail: `${lot.onHand} cases at ${lot.location} are unavailable until the hold is resolved.`, action: "Review inventory", page: "inventory" as PageKey })),
    ...scope.placements.filter((placement) => placement.status !== "Healthy").map((placement) => {
      const account = scope.accounts.find((item) => item.id === placement.accountId);
      return { icon: Store, tone: placement.status === "Out of stock" ? "danger" : "warning", title: `${account?.name ?? "Placement"}: ${placement.status}`, detail: `${placement.observedStock} units observed, ${placement.facings} facings, ${placement.cold ? "cold" : "not cold"}.`, action: "Review placement", page: "retail" as PageKey };
    }),
    ...scope.timecards.filter((card) => card.status === "Returned").map((card) => {
      const employee = data.users.find((user) => user.id === card.userId);
      return { icon: Clock3, tone: "warning", title: `${employee?.name ?? "Employee"} timecard was returned`, detail: `The week ending ${formatDate(card.weekEnd)} requires correction and resubmission.`, action: "Open timecard", page: "people" as PageKey };
    }),
  ];

  return (
    <div className="page page--work">
      <PageHeader
        eyebrow="Universal work queue"
        title="My work"
        description="Every decision opens the source record first. Approval cards are a queue, not a substitute for review."
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
        <Section title="Ready for review" description="Inspect the linked order, timecard, or exception before any decision" className="approval-list-panel">
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
          {completed.length === 0 && <div className="review-empty"><p>No completed decisions yet. Review a pending record to take action.</p></div>}
        </Section>
      )}

      <Modal
        open={Boolean(reviewApproval)}
        title={reviewApproval?.title ?? "Review record"}
        description={reviewApproval ? `${reviewApproval.type} · submitted ${formatDate(reviewApproval.submittedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : undefined}
        onClose={() => setReviewId(null)}
        wide
        footer={reviewApproval ? <>
          <Button variant="ghost" onClick={() => setReviewId(null)}>Close</Button>
          {(reviewOrder || reviewTimecard) && <Button variant="secondary" icon={<FileText size={15}/>} onClick={openFullRecord}>Open full record</Button>}
          {canDecideReview && <Button variant="secondary" icon={<RotateCcw size={15}/>} onClick={() => decide(reviewApproval, "Returned")}>Return for correction</Button>}
          {canDecideReview && <Button icon={<Check size={15}/>} onClick={() => decide(reviewApproval, "Approved")}>Approve</Button>}
        </> : undefined}
      >
        {reviewApproval && <div className="record-review">
          <div className="record-review__banner">
            <ShieldCheck size={20}/>
            <div><strong>Decision gate</strong><p>Review the source facts below. Approve only if the underlying record supports the requested action.</p></div>
            <StatusPill tone={priorityTone(reviewApproval.priority)} dot={false}>{reviewApproval.priority}</StatusPill>
          </div>

          {reviewOrder && <div className="record-review__section">
            <div className="record-review__heading"><h3>Order facts</h3><StatusPill tone="warning" dot={false}>{reviewOrder.priceBasis}</StatusPill></div>
            <div className="record-review__facts">
              <div><span>Customer</span><strong>{reviewAccount?.name ?? "Linked account"}</strong></div>
              <div><span>Order</span><strong>{reviewOrder.number}</strong></div>
              <div><span>Quantity</span><strong>{reviewOrder.cases} cases</strong></div>
              <div><span>Price / case</span><strong>{formatMoney(reviewOrder.pricePerCase)}</strong></div>
              <div><span>Total</span><strong>{formatMoney(reviewOrder.amount)}</strong></div>
              <div><span>Payment state</span><strong>{reviewOrder.paymentStatus}</strong></div>
              <div><span>Requested by</span><strong>{reviewApproval.requestedBy}</strong></div>
              <div><span>Current status</span><strong>{reviewOrder.status}</strong></div>
            </div>
            <div className="record-review__consequence"><AlertTriangle size={17}/><p>Approving moves this order to Approved and makes it eligible for the controlled fulfillment sequence. Returning sends it back to Draft for correction.</p></div>
          </div>}

          {reviewTimecard && <div className="record-review__section">
            <div className="record-review__heading"><h3>Timecard facts</h3><StatusPill tone={reviewTimecard.attested ? "success" : "danger"} dot={false}>{reviewTimecard.attested ? "Employee attested" : "Attestation missing"}</StatusPill></div>
            <div className="record-review__facts record-review__facts--compact">
              <div><span>Employee</span><strong>{reviewEmployee?.name ?? "Employee"}</strong></div>
              <div><span>Pay period</span><strong>{formatDate(reviewTimecard.weekStart, { month: "short", day: "numeric" })} – {formatDate(reviewTimecard.weekEnd, { month: "short", day: "numeric" })}</strong></div>
              <div><span>Recorded hours</span><strong>{reviewHours.toFixed(2)}</strong></div>
              <div><span>Daily records</span><strong>{reviewEntries.length}</strong></div>
            </div>
            <div className="record-review__table-wrap">
              <div className="record-review__time-table record-review__time-table--head"><span>Date</span><span>Clock in</span><span>Meal start</span><span>Meal end</span><span>Clock out</span><span>Paid hours</span><span>Source / note</span></div>
              {reviewEntries.map((entry) => <div className="record-review__time-table" key={entry.id}>
                <span>{formatDate(entry.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span>{entry.clockIn}</span><span>{entry.mealStart ?? `${entry.breakMinutes} min recorded`}</span><span>{entry.mealEnd ?? "—"}</span><span>{entry.clockOut ?? "Open"}</span>
                <span><strong>{hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes).toFixed(2)}</strong></span>
                <span><strong>{entry.source}</strong>{entry.note && <small>{entry.note}</small>}</span>
              </div>)}
            </div>
            <div className="record-review__consequence"><AlertTriangle size={17}/><p>Manager approval verifies the submitted time record for the next payroll control step. It does not silently change punches or calculate taxes, wages, or deductions.</p></div>
          </div>}

          {!reviewOrder && !reviewTimecard && <div className="record-review__section">
            <h3>Request details</h3><p>{reviewApproval.detail}</p><dl><div><dt>Requested by</dt><dd>{reviewApproval.requestedBy}</dd></div><div><dt>Due</dt><dd>{formatDate(reviewApproval.dueAt)}</dd></div></dl>
          </div>}

          {!canDecideReview && <div className="record-review__readonly"><Clock3 size={17}/><p>You can inspect this record, but the current role is not allowed to decide it.</p></div>}
        </div>}
      </Modal>
    </div>
  );
}
