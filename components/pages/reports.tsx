"use client";

import {
  CheckCircle2,
  CircleAlert,
  Database,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatMoney } from "../ui";

const definitions = [
  { metric: "Qualified active account", formula: "Paid opening order + active placement + qualifying reorder within policy window", source: "Orders + placement + payments", owner: "Sales Ops", status: "Definition review" },
  { metric: "Net collected sales", formula: "Cash collected − returns − credits − approved exclusions", source: "Payment provider + accounting", owner: "Finance", status: "Source disconnected" },
  { metric: "Reorder rate", formula: "Active accounts with qualifying reorder ÷ eligible active accounts", source: "Orders", owner: "Sales Ops", status: "Demo ready" },
  { metric: "On-time appointment", formula: "Arrived within approved window ÷ completed scheduled appointments", source: "Dispatch events", owner: "Operations", status: "Policy pending" },
  { metric: "Inventory availability", formula: "Available cases ÷ total on-hand cases", source: "Inventory movements", owner: "Operations", status: "Demo ready" },
];

export function ReportsPage() {
  const { data } = useWorkspace();
  const [scope, setScope] = useState<"commercial" | "operations" | "people">("commercial");
  const active = data.accounts.filter((account) => ["Placed", "Reordered"].includes(account.stage)).length;
  const reordered = data.accounts.filter((account) => account.reorderCount > 0).length;
  const paidRevenue = data.orders.filter((order) => order.paymentStatus === "Paid").reduce((sum, order) => sum + order.amount, 0);
  const deliveredCases = data.orders.filter((order) => ["Delivered", "Paid"].includes(order.status)).reduce((sum, order) => sum + order.cases, 0);
  const available = data.inventory.reduce((sum, lot) => sum + lot.available, 0);
  const onHand = data.inventory.reduce((sum, lot) => sum + lot.onHand, 0);

  const metrics = useMemo(() => {
    if (scope === "commercial") return [
      ["Collected sell-in", formatMoney(paidRevenue), "Demo payments only", 34],
      ["Active placements", String(active), "Separate from opened accounts", 52],
      ["Reordered accounts", String(reordered), "Commercial objective", 41],
      ["Delivered cases", String(deliveredCases), "Does not prove sell-through", 63],
    ];
    if (scope === "operations") return [
      ["Available inventory", `${available} cs`, "Demo lot records", 76],
      ["Inventory availability", `${onHand ? Math.round((available / onHand) * 100) : 0}%`, "Available ÷ on hand", 82],
      ["Cold placements", String(data.placements.filter((item) => item.cold).length), "Physical observation", 58],
      ["Appointments complete", String(data.appointments.filter((item) => item.status === "Completed").length), "Today’s demo board", 28],
    ];
    return [
      ["Timecards submitted", String(data.timecards.filter((card) => card.status === "Submitted").length), "Current demo week", 50],
      ["Manager approved", String(data.timecards.filter((card) => card.status === "Manager approved").length), "Current demo week", 15],
      ["Open timecards", String(data.timecards.filter((card) => card.status === "Open").length), "Current demo week", 67],
      ["Payroll ready", String(data.timecards.filter((card) => card.status === "Payroll ready").length), "Provider disconnected", 5],
    ];
  }, [active, available, data.appointments, data.placements, data.timecards, deliveredCases, onHand, paidRevenue, reordered, scope]);

  return (
    <div className="page page--reports">
      <PageHeader
        eyebrow="Decision intelligence"
        title="Reports"
        description="Metrics are only displayed when their definition, source, and business meaning are explicit."
        actions={<StatusPill tone="gold">Sample scenario</StatusPill>}
      />

      <div className="report-integrity-banner">
        <Database size={20} />
        <div><strong>No live source systems are connected.</strong><p>Every number on this page is derived from the fictional records in this browser—not Golden Eagle’s actual performance.</p></div>
      </div>

      <div className="report-scope-tabs">
        {(["commercial", "operations", "people"] as const).map((item) => <button key={item} className={scope === item ? "is-active" : ""} onClick={() => setScope(item)}>{item}</button>)}
      </div>

      <div className="report-metric-grid">
        {metrics.map(([label, value, detail, score]) => (
          <article key={label as string}>
            <div><span>{label as string}</span><TrendingUp size={16} /></div>
            <strong>{value as string}</strong>
            <p>{detail as string}</p>
            <span className="report-bar"><i style={{ width: `${score}%` }} /></span>
          </article>
        ))}
      </div>

      <div className="reports-grid">
        <Section title="Commercial reality check" description="Do not collapse these records into a generic sales total" className="reality-panel">
          <div className="reality-flow">
            {[
              ["Sell-in", data.orders.length, "Orders entered"],
              ["Collected", data.orders.filter((item) => item.paymentStatus === "Paid").length, "Orders paid"],
              ["Delivered", data.orders.filter((item) => ["Delivered", "Paid"].includes(item.status)).length, "Orders received"],
              ["Placed", data.placements.length, "Locations observed"],
              ["Reordered", reordered, "Accounts buying again"],
            ].map(([title, value, detail], index) => (
              <div key={title as string}><span>{index + 1}</span><div><small>{title as string}</small><strong>{value as number}</strong><p>{detail as string}</p></div></div>
            ))}
          </div>
          <div className="reality-note"><CircleAlert size={17} /><p>There is no verified POS or distributor-depletion feed. Consumer sell-through is intentionally absent.</p></div>
        </Section>

        <Section title="Data confidence" description="What can safely drive a decision today" className="confidence-panel">
          {[
            ["Demo account workflow", "High", "success"],
            ["Demo dispatch events", "High", "success"],
            ["Proposed price model", "Low", "danger"],
            ["Product and packaging", "Low", "danger"],
            ["Actual market performance", "None", "warning"],
          ].map(([label, value, tone]) => <div key={label}><span>{tone === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}{label}</span><StatusPill tone={tone as "success" | "danger" | "warning"} dot={false}>{value}</StatusPill></div>)}
        </Section>
      </div>

      <Section title="Metric dictionary" description="Definition, source, and owner are part of the metric—not footnotes" className="metric-dictionary">
        <div className="metric-definition-table metric-definition-table--head"><span>Metric</span><span>Formula / rule</span><span>Source</span><span>Owner</span><span>Status</span></div>
        {definitions.map((item) => (
          <div className="metric-definition-table" key={item.metric}><span><strong>{item.metric}</strong></span><span>{item.formula}</span><span>{item.source}</span><span>{item.owner}</span><span><StatusPill tone={item.status === "Demo ready" ? "success" : item.status.includes("disconnected") ? "danger" : "warning"} dot={false}>{item.status}</StatusPill></span></div>
        ))}
        <div className="metric-dictionary__foot"><ShieldCheck size={17} /><span>Future KPI records will also store frequency, lag, audit method, intended behavior, gaming risk, and action triggered.</span></div>
      </Section>
    </div>
  );
}
