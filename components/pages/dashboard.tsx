"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageSearch,
  RefreshCcw,
  Route,
  ShieldAlert,
  Sparkles,
  Store,
  Target,
} from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import {
  Avatar,
  Button,
  MetricCard,
  PageHeader,
  Section,
  StatusPill,
  TextButton,
  formatDate,
  formatMoney,
} from "../ui";

const stageOrder = ["Prospect", "Qualified", "Sampled", "Opening order", "Placed", "Reordered"];

export function DashboardPage() {
  const { data, currentUser, navigate } = useWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = data.appointments
    .filter((appointment) => appointment.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const activeAccounts = data.accounts.filter((account) =>
    ["Placed", "Reordered"].includes(account.stage),
  );
  const reorderedAccounts = data.accounts.filter((account) => account.reorderCount > 0).length;
  const reorderRate = activeAccounts.length
    ? Math.round((reorderedAccounts / activeAccounts.length) * 100)
    : 0;
  const pendingOrderValue = data.orders
    .filter((order) => ["Draft", "Awaiting approval", "Approved"].includes(order.status))
    .reduce((total, order) => total + order.amount, 0);
  const pendingApprovals = data.approvals.filter((approval) => approval.status === "Pending");

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="page page--dashboard">
      <PageHeader
        eyebrow={`${formatDate(today, { weekday: "long", month: "long", day: "numeric" })} · Arizona market`}
        title={`${greeting}, ${currentUser?.firstName}.`}
        description="Here’s the operational picture—and what needs a decision next."
        actions={
          <Button variant="secondary" icon={<Sparkles size={17} />} onClick={() => navigate("work")}>
            Review my work
          </Button>
        }
      />

      <div className="truth-alert">
        <span className="truth-alert__icon"><ShieldAlert size={20} /></span>
        <div>
          <strong>Foundation gate: product truth is not approved.</strong>
          <p>Package size, formula, claims, UPC, case configuration, importer roles, and landed cost remain unverified.</p>
        </div>
        <button onClick={() => navigate("inventory")}>Open product control <ArrowRight size={15} /></button>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="Active placements"
          value={`${activeAccounts.length}`}
          detail="Sample scenario"
          trend={`${data.placements.filter((item) => item.cold).length} cold`}
          tone="blue"
          onClick={() => navigate("retail")}
        />
        <MetricCard
          label="Reorder rate"
          value={`${reorderRate}%`}
          detail="Demo active accounts"
          trend={`${reorderedAccounts} reordered`}
          tone="green"
          onClick={() => navigate("reports")}
        />
        <MetricCard
          label="Today’s field work"
          value={`${todayAppointments.length}`}
          detail="Scheduled appointments"
          trend={`${todayAppointments.filter((item) => item.status !== "Scheduled").length} moving`}
          tone="gold"
          onClick={() => navigate("dispatch")}
        />
        <MetricCard
          label="Orders in approval"
          value={formatMoney(pendingOrderValue)}
          detail="Proposed demo value"
          trend={`${pendingApprovals.length} approvals`}
          tone="red"
          onClick={() => navigate("work")}
        />
      </div>

      <div className="dashboard-main-grid">
        <Section
          title="Today’s operating plan"
          description="Appointments, objectives, and live field status"
          action={<TextButton onClick={() => navigate("dispatch")}>Full dispatch board</TextButton>}
          className="dashboard-schedule"
        >
          <div className="schedule-list">
            {todayAppointments.map((appointment) => {
              const account = data.accounts.find((item) => item.id === appointment.accountId);
              const owner = data.users.find((item) => item.id === appointment.ownerId);
              const active = ["Dispatched", "En route", "Arrived"].includes(appointment.status);
              return (
                <article key={appointment.id}>
                  <div className="schedule-time">
                    <strong>{appointment.startTime}</strong>
                    <span>{appointment.duration} min</span>
                  </div>
                  <div className={`schedule-marker ${active ? "is-live" : ""}`}><i /></div>
                  <div className="schedule-info">
                    <div className="schedule-info__top">
                      <div><strong>{account?.name}</strong><span>{appointment.type}</span></div>
                      <StatusPill tone={active ? "info" : "neutral"}>{appointment.status}</StatusPill>
                    </div>
                    <p>{appointment.objective}</p>
                    <div className="schedule-meta">
                      {owner && <><Avatar initials={owner.initials} color={owner.accent} size="sm" /><span>{owner.name}</span></>}
                      <i />
                      <span>{appointment.location}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          title="Decisions & exceptions"
          description="Sorted by business risk"
          action={<TextButton onClick={() => navigate("work")}>Open queue</TextButton>}
          className="decision-panel"
        >
          <div className="decision-list">
            <button onClick={() => navigate("inventory")}>
              <span className="decision-icon decision-icon--danger"><PackageSearch size={18} /></span>
              <div>
                <strong>Approve the actual sellable SKU</strong>
                <p>Artwork and source documents contain conflicting product representations.</p>
              </div>
              <StatusPill tone="danger" dot={false}>Blocking</StatusPill>
            </button>
            <button onClick={() => navigate("work")}>
              <span className="decision-icon decision-icon--warning"><CircleDollarSign size={18} /></span>
              <div>
                <strong>Review proposed order terms</strong>
                <p>{pendingApprovals.filter((item) => item.type === "Order").length} order awaits controlled approval.</p>
              </div>
              <StatusPill tone="warning" dot={false}>Today</StatusPill>
            </button>
            <button onClick={() => navigate("people")}>
              <span className="decision-icon decision-icon--blue"><Clock3 size={18} /></span>
              <div>
                <strong>Lock the weekly payroll calendar</strong>
                <p>Workweek, cutoffs, approvers, and payroll provider are still configurable.</p>
              </div>
              <StatusPill tone="info" dot={false}>Open</StatusPill>
            </button>
          </div>
        </Section>
      </div>

      <div className="dashboard-secondary-grid">
        <Section
          title="Commercial flow"
          description="Every stage represents a different fact"
          action={<StatusPill tone="gold">Sample data</StatusPill>}
          className="pipeline-panel"
        >
          <div className="pipeline-bars">
            {stageOrder.map((stage, index) => {
              const count = data.accounts.filter((account) => account.stage === stage).length;
              const width = Math.max(14, (count / Math.max(data.accounts.length, 1)) * 100);
              return (
                <div className="pipeline-row" key={stage}>
                  <span>{stage}</span>
                  <div><i style={{ width: `${width}%`, opacity: 1 - index * 0.08 }} /></div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
          <div className="pipeline-footnote">
            <RefreshCcw size={16} />
            <span>A sale is not treated as success until placement and reorder are separately recorded.</span>
          </div>
        </Section>

        <Section
          title="Launch target"
          description="The goal exists; the definition does not"
          className="goal-panel"
        >
          <div className="goal-ring">
            <div><Target size={26} /><strong>Pending</strong><span>definition</span></div>
          </div>
          <div className="goal-panel__copy">
            <StatusPill tone="warning">Not measurable yet</StatusPill>
            <h3>“One container per month”</h3>
            <p>Quantity, economics, timing, and whether “sold” means ordered, paid, delivered, placed, or consumed must be approved before progress can be shown.</p>
          </div>
        </Section>

        <Section
          title="Recent operating activity"
          description="Linked to the record that created it"
          className="activity-panel"
        >
          <div className="activity-list">
            {data.activities.slice(0, 4).map((activity) => {
              const account = data.accounts.find((item) => item.id === activity.accountId);
              const icon = activity.type === "order" ? CheckCircle2 : activity.type === "placement" ? Store : activity.type === "visit" ? Route : AlertTriangle;
              const ActivityIcon = icon;
              return (
                <article key={activity.id}>
                  <span><ActivityIcon size={16} /></span>
                  <div><strong>{activity.title}</strong><p>{account?.name ?? "Workspace"} · {activity.detail}</p></div>
                  <small>{formatDate(activity.at, { hour: "numeric", minute: "2-digit" })}</small>
                </article>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="control-strip">
        <div><CalendarClock size={19} /><span><strong>Next review</strong><small>Owner decision agenda · proposed</small></span></div>
        <i />
        <div><Route size={19} /><span><strong>Critical path</strong><small>Product truth → economics → workflows → integrations</small></span></div>
        <i />
        <div><Store size={19} /><span><strong>Commercial objective</strong><small>Active placements that reorder</small></span></div>
      </div>
    </div>
  );
}
