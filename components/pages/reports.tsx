"use client";

import { CircleAlert, Database, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { canManageUser } from "../../lib/access";
import { arizonaDateKey } from "../../lib/date-time";
import { useHcm } from "../../lib/hcm-context";
import { nodeLotBalance, warehouseAvailable, warehouseNodeId } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { useWorkspace } from "../../lib/workspace-context";
import { ManagementKpiDashboard } from "../performance/management-kpi-dashboard";
import { PageHeader, Section, StatusPill, formatMoney } from "../ui";

type ReportScope = "commercial" | "operations" | "people";

export function ReportsPage() {
  const { scope: records, data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const { ledger } = useInventoryLedger();
  const [reportScope, setReportScope] = useState<ReportScope>("commercial");
  const today = arizonaDateKey();

  const paid = records.orders.filter((order) => order.paymentStatus === "Paid").reduce((sum, order) => sum + order.amount, 0);
  const delivered = records.orders.filter((order) => ["Delivered", "Paid"].includes(order.status)).reduce((sum, order) => sum + order.cases, 0);
  const available = records.inventory.reduce((sum, lot) => sum + warehouseAvailable(ledger, lot.id), 0);
  const onHand = records.inventory.reduce((sum, lot) => sum + Math.max(0, nodeLotBalance(ledger, warehouseNodeId, lot.id)), 0);
  const reordered = records.accounts.filter((account) => account.reorderCount > 0).length;
  const visibleEmployeeIds = new Set(hcm.employees.filter((employee) => canManageUser(data, currentUser, employee.userId, true)).map((employee) => employee.userId));
  const people = {
    active: hcm.employees.filter((employee) => visibleEmployeeIds.has(employee.userId) && employee.status === "Active").length,
    pendingLeave: hcm.leaveRequests.filter((request) => visibleEmployeeIds.has(request.userId) && request.status === "Submitted").length,
    missingDocs: hcm.documents.filter((document) => visibleEmployeeIds.has(document.userId) && document.status === "Missing").length,
    overdueTraining: hcm.training.filter((assignment) => visibleEmployeeIds.has(assignment.userId) && assignment.status !== "Complete" && Boolean(assignment.dueDate) && assignment.dueDate! < today).length,
    openReviews: hcm.reviews.filter((review) => visibleEmployeeIds.has(review.userId) && review.status !== "Acknowledged").length,
    openRecruiting: hcm.requisitions.filter((requisition) => requisition.status === "Open" && (currentUser?.role === "Administrator" || requisition.hiringManagerId === currentUser?.id)).length,
  };
  const reportScopes: ReportScope[] = currentUser?.role === "Administrator" ? ["commercial", "operations", "people"] : ["commercial", "people"];
  const effectiveScope = reportScopes.includes(reportScope) ? reportScope : "commercial";

  const metrics = effectiveScope === "commercial"
    ? [
        ["Collected order value", formatMoney(paid), "Formula: sum order amount where paymentStatus = Paid"],
        ["Delivered cases", String(delivered), "Formula: sum cases where fulfillment status = Delivered or legacy Paid"],
        ["Active placements", String(records.placements.length), "Count of placement records in permitted scope"],
        ["Reordered accounts", String(reordered), "Count of account/location records where reorderCount > 0"],
      ]
    : effectiveScope === "operations"
      ? [
          ["Warehouse on hand", `${onHand} cs`, "Formula: custody ledger balance at the warehouse node"],
          ["Warehouse available", `${available} cs`, "Formula: warehouse custody balance less active order reservations"],
          ["Open field work", String(records.appointments.filter((item) => item.status !== "Completed").length), "Appointments whose status is not Completed"],
          ["Placement issues", String(records.placements.filter((item) => item.status !== "Healthy").length), "Placement records whose status is not Healthy"],
        ]
      : [
          ["Active employees", String(people.active), "Active employment records inside permitted people scope"],
          ["Pending time off", String(people.pendingLeave), "Leave requests with status Submitted"],
          ["Missing documents", String(people.missingDocs), "Employee document requirements with status Missing"],
          ["Overdue training", String(people.overdueTraining), "Incomplete assignments whose configured due date is before today"],
          ["Open reviews", String(people.openReviews), "Performance reviews not yet acknowledged"],
          ["Open requisitions", String(people.openRecruiting), "Open recruiting records owned by permitted hiring scope"],
        ];

  return <div className="page page--reports">
    <PageHeader eyebrow="Operational reporting" title="Reports" description="Counts and totals derived from defined source records within your permitted scope." actions={<StatusPill tone="gold">Sample data</StatusPill>}/>

    <ManagementKpiDashboard/>

    <div className="report-integrity-banner"><Database size={20}/><div><strong>No live source systems are connected.</strong><p>These totals describe the fictional browser records used for this product tour. Each displayed KPI names its source rule instead of presenting ambiguous progress.</p></div></div>

    <div className="report-scope-tabs">{reportScopes.map((item) => <button key={item} className={effectiveScope === item ? "is-active" : ""} onClick={() => setReportScope(item)}>{item}</button>)}</div>
    <div className="report-metric-grid">{metrics.map(([label, value, detail]) => <article key={label}><div><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>)}</div>

    {effectiveScope === "commercial" && <Section title="Commercial record flow" description="Each milestone is reported separately" className="reality-panel">
      <div className="reality-flow">{[
        ["Orders", records.orders.length, "Entered"],
        ["Paid", records.orders.filter((item) => item.paymentStatus === "Paid").length, "Collected"],
        ["Delivered", records.orders.filter((item) => ["Delivered", "Paid"].includes(item.status)).length, "Received"],
        ["Placed", records.placements.length, "Observed"],
        ["Reordered", reordered, "Bought again"],
      ].map(([title, value, detail], index) => <div key={title as string}><span>{index + 1}</span><div><small>{title as string}</small><strong>{value as number}</strong><p>{detail as string}</p></div></div>)}</div>
      <div className="reality-note"><CircleAlert size={17}/><p>No POS or distributor-depletion feed is connected, so consumer sell-through is not reported.</p></div>
    </Section>}

    {effectiveScope === "people" && <Section title="Human Resources metric controls" description="Current formulas and privacy boundary">
      <div className="accounting-rule-list">
        <article><span><ShieldCheck size={17}/></span><div><strong>Scope</strong><p>Administrators see company workforce records. Managers see only employees inside their permitted management scope. Individual employees see only their own people metrics.</p></div></article>
        <article><span><Database size={17}/></span><div><strong>Source of truth</strong><p>Employment, leave, documents, training, review and requisition ledgers use the shared Human Resources state. No second browser copy is loaded for reporting.</p></div></article>
        <article><span><CircleAlert size={17}/></span><div><strong>Action</strong><p>Exceptions belong in Human Resources workflows; this page reports them but does not mutate the source records.</p></div></article>
      </div>
    </Section>}
  </div>;
}
