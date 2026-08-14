"use client";

import { CircleAlert, Database } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatMoney } from "../ui";

export function ReportsPage() {
  const { data } = useWorkspace();
  const [scope, setScope] = useState<"commercial" | "operations" | "people">("commercial");
  const paidRevenue = data.orders.filter((order) => order.paymentStatus === "Paid").reduce((sum, order) => sum + order.amount, 0);
  const deliveredCases = data.orders.filter((order) => ["Delivered", "Paid"].includes(order.status)).reduce((sum, order) => sum + order.cases, 0);
  const available = data.inventory.reduce((sum, lot) => sum + lot.available, 0);
  const onHand = data.inventory.reduce((sum, lot) => sum + lot.onHand, 0);
  const reordered = data.accounts.filter((account) => account.reorderCount > 0).length;

  const metrics = useMemo(() => {
    if (scope === "commercial") return [
      ["Collected order value", formatMoney(paidRevenue), "Orders marked paid"],
      ["Delivered cases", String(deliveredCases), "Orders marked delivered or paid"],
      ["Active placements", String(data.placements.length), "Locations with placement records"],
      ["Reordered accounts", String(reordered), "Accounts with at least one reorder"],
    ];
    if (scope === "operations") return [
      ["On-hand inventory", `${onHand} cs`, "All recorded lots"],
      ["Available inventory", `${available} cs`, "Excludes reserved and held cases"],
      ["Open field work", String(data.appointments.filter((item) => item.status !== "Completed").length), "Appointments not completed"],
      ["Placement issues", String(data.placements.filter((item) => item.status !== "Healthy").length), "Checks requiring action"],
    ];
    return [
      ["Open timecards", String(data.timecards.filter((card) => card.status === "Open").length), "Current employee records"],
      ["Submitted", String(data.timecards.filter((card) => card.status === "Submitted").length), "Waiting for manager review"],
      ["Manager approved", String(data.timecards.filter((card) => card.status === "Manager approved").length), "Waiting for payroll handoff"],
      ["Returned", String(data.timecards.filter((card) => card.status === "Returned").length), "Employee correction required"],
    ];
  }, [available, data.appointments, data.placements, data.timecards, deliveredCases, onHand, paidRevenue, reordered, scope]);

  return (
    <div className="page page--reports">
      <PageHeader eyebrow="Operational reporting" title="Reports" description="Counts and totals derived from the records currently stored in this workspace." actions={<StatusPill tone="gold">Sample data</StatusPill>} />
      <div className="report-integrity-banner"><Database size={20} /><div><strong>No live source systems are connected.</strong><p>These totals describe the fictional browser records used for this product tour.</p></div></div>
      <div className="report-scope-tabs">{(["commercial", "operations", "people"] as const).map((item) => <button key={item} className={scope === item ? "is-active" : ""} onClick={() => setScope(item)}>{item}</button>)}</div>
      <div className="report-metric-grid">{metrics.map(([label, value, detail]) => <article key={label}><div><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>)}</div>
      {scope === "commercial" && <Section title="Commercial record flow" description="Each milestone is reported separately" className="reality-panel"><div className="reality-flow">{[
        ["Orders", data.orders.length, "Entered"],
        ["Paid", data.orders.filter((item) => item.paymentStatus === "Paid").length, "Collected"],
        ["Delivered", data.orders.filter((item) => ["Delivered", "Paid"].includes(item.status)).length, "Received"],
        ["Placed", data.placements.length, "Observed"],
        ["Reordered", reordered, "Bought again"],
      ].map(([title, value, detail], index) => <div key={title as string}><span>{index + 1}</span><div><small>{title as string}</small><strong>{value as number}</strong><p>{detail as string}</p></div></div>)}</div><div className="reality-note"><CircleAlert size={17} /><p>No POS or distributor-depletion feed is connected, so consumer sell-through is not reported.</p></div></Section>}
    </div>
  );
}
