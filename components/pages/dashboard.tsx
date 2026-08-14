"use client";

import { AlertTriangle, CheckCircle2, Clock3, PackageCheck, Route, Store } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, MetricCard, PageHeader, Section, StatusPill, TextButton, formatDate } from "../ui";

const stageOrder = ["Prospect", "Qualified", "Sampled", "Opening order", "Placed", "Reordered"];

export function DashboardPage() {
  const { data, currentUser, navigate } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = data.appointments.filter((item) => item.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const atRiskPlacements = data.placements.filter((item) => item.status !== "Healthy");
  const openOrders = data.orders.filter((item) => !["Delivered", "Paid"].includes(item.status));
  const pendingApprovals = data.approvals.filter((item) => item.status === "Pending");
  const availableCases = data.inventory.reduce((sum, lot) => sum + lot.available, 0);
  const heldCases = data.inventory.filter((lot) => lot.status === "Quality hold").reduce((sum, lot) => sum + lot.onHand, 0);
  const nextActions = data.accounts.filter((account) => account.nextAction && account.nextActionDate).sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate)).slice(0, 3);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="page page--dashboard">
      <PageHeader eyebrow={`${formatDate(today, { weekday: "long", month: "long", day: "numeric" })} · Arizona market`} title={`${greeting}, ${currentUser?.firstName}.`} description="Today’s workload, exceptions, and customer follow-ups in one place." actions={<Button variant="secondary" onClick={() => navigate("work")}>Review my work</Button>} />

      <div className="metric-grid">
        <MetricCard label="Today’s appointments" value={String(todayAppointments.length)} detail="Scheduled field work" trend={`${todayAppointments.filter((item) => item.status === "Completed").length} completed`} tone="blue" onClick={() => navigate("dispatch")} />
        <MetricCard label="Open orders" value={String(openOrders.length)} detail="Not delivered or paid" trend={`${pendingApprovals.filter((item) => item.type === "Order").length} awaiting review`} tone="gold" onClick={() => navigate("orders")} />
        <MetricCard label="Active placements" value={String(data.placements.length)} detail="Store locations tracked" trend={`${atRiskPlacements.length} need attention`} tone="green" onClick={() => navigate("retail")} />
        <MetricCard label="Available inventory" value={`${availableCases} cs`} detail="Across recorded lots" trend={`${heldCases} cs held`} tone="red" onClick={() => navigate("inventory")} />
      </div>

      <div className="dashboard-main-grid">
        <Section title="Today’s schedule" description="Appointments and current field status" action={<TextButton onClick={() => navigate("dispatch")}>Open dispatch board</TextButton>} className="dashboard-schedule">
          <div className="schedule-list">
            {todayAppointments.map((appointment) => {
              const account = data.accounts.find((item) => item.id === appointment.accountId);
              const owner = data.users.find((item) => item.id === appointment.ownerId);
              const active = ["Dispatched", "En route", "Arrived"].includes(appointment.status);
              return <article key={appointment.id}><div className="schedule-time"><strong>{appointment.startTime}</strong><span>{appointment.duration} min</span></div><div className={`schedule-marker ${active ? "is-live" : ""}`}><i /></div><div className="schedule-info"><div className="schedule-info__top"><div><strong>{account?.name}</strong><span>{appointment.type}</span></div><StatusPill tone={active ? "info" : appointment.status === "Completed" ? "success" : "neutral"}>{appointment.status}</StatusPill></div><p>{appointment.objective}</p><div className="schedule-meta">{owner && <><Avatar initials={owner.initials} color={owner.accent} size="sm" /><span>{owner.name}</span></>}<i /><span>{appointment.location}</span></div></div></article>;
            })}
            {todayAppointments.length === 0 && <div className="review-empty"><Clock3 size={25} /><h3>No appointments today</h3><p>Open the dispatch board to review another date.</p></div>}
          </div>
        </Section>

        <Section title="Attention needed" description="Exceptions created by current records" action={<TextButton onClick={() => navigate("work")}>Open work queue</TextButton>} className="decision-panel">
          <div className="decision-list">
            {pendingApprovals.length > 0 && <button onClick={() => navigate("work")}><span className="decision-icon decision-icon--warning"><PackageCheck size={18} /></span><div><strong>{pendingApprovals.length} approval{pendingApprovals.length === 1 ? "" : "s"} waiting</strong><p>Review the underlying record before approving or returning it.</p></div><StatusPill tone="warning" dot={false}>Review</StatusPill></button>}
            {atRiskPlacements.map((placement) => { const account = data.accounts.find((item) => item.id === placement.accountId); return <button key={placement.id} onClick={() => navigate("retail")}><span className="decision-icon decision-icon--danger"><Store size={18} /></span><div><strong>{account?.name}: {placement.status}</strong><p>{placement.observedStock} units observed · {placement.facings} facings · {placement.cold ? "cold" : "not cold"}</p></div><StatusPill tone="danger" dot={false}>Action</StatusPill></button>; })}
            {pendingApprovals.length === 0 && atRiskPlacements.length === 0 && <div className="review-empty"><CheckCircle2 size={25} /><h3>No open exceptions</h3><p>Current records do not require review.</p></div>}
          </div>
        </Section>
      </div>

      <div className="dashboard-secondary-grid">
        <Section title="Sales pipeline" description="Accounts by current stage" action={<TextButton onClick={() => navigate("accounts")}>Open accounts</TextButton>} className="pipeline-panel"><div className="pipeline-bars">{stageOrder.map((stage, index) => { const count = data.accounts.filter((account) => account.stage === stage).length; const width = Math.max(8, (count / Math.max(data.accounts.length, 1)) * 100); return <div className="pipeline-row" key={stage}><span>{stage}</span><div><i style={{ width: `${width}%`, opacity: 1 - index * 0.08 }} /></div><strong>{count}</strong></div>; })}</div></Section>
        <Section title="Upcoming account actions" description="Earliest due work across the pipeline" className="goal-panel"><div className="activity-list">{nextActions.map((account) => <article key={account.id}><span><Route size={16} /></span><div><strong>{account.nextAction}</strong><p>{account.name} · {account.location}</p></div><small>{formatDate(account.nextActionDate, { month: "short", day: "numeric" })}</small></article>)}</div></Section>
        <Section title="Recent activity" description="Latest changes recorded in the workspace" className="activity-panel"><div className="activity-list">{data.activities.slice(0, 4).map((activity) => { const account = data.accounts.find((item) => item.id === activity.accountId); const ActivityIcon = activity.type === "placement" ? Store : activity.type === "visit" ? Route : activity.type === "order" ? PackageCheck : AlertTriangle; return <article key={activity.id}><span><ActivityIcon size={16} /></span><div><strong>{activity.title}</strong><p>{account?.name ?? "Workspace"} · {activity.detail}</p></div><small>{formatDate(activity.at, { hour: "numeric", minute: "2-digit" })}</small></article>; })}</div></Section>
      </div>
    </div>
  );
}
