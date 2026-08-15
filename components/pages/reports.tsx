"use client";
import { CircleAlert, Database } from "lucide-react";
import { useMemo, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatMoney } from "../ui";

export function ReportsPage() {
  const { scope: records } = useWorkspace();
  const [reportScope,setReportScope] = useState<"commercial"|"operations"|"people">("commercial");
  const paid = records.orders.filter(order => order.paymentStatus === "Paid").reduce((sum,order) => sum + order.amount,0);
  const delivered = records.orders.filter(order => ["Delivered","Paid"].includes(order.status)).reduce((sum,order) => sum + order.cases,0);
  const available = records.inventory.reduce((sum,lot) => sum + lot.available,0); const onHand = records.inventory.reduce((sum,lot) => sum + lot.onHand,0);
  const reordered = records.accounts.filter(account => account.reorderCount > 0).length;
  const metrics = useMemo(() => {
    if (reportScope === "commercial") return [["Collected order value",formatMoney(paid),"Orders marked paid"],["Delivered cases",String(delivered),"Orders marked delivered or paid"],["Active placements",String(records.placements.length),"Locations with placement records"],["Reordered accounts",String(reordered),"Accounts with at least one reorder"]];
    if (reportScope === "operations") return [["On-hand inventory",`${onHand} cs`,"All recorded lots"],["Available inventory",`${available} cs`,"Excludes reserved and held cases"],["Open field work",String(records.appointments.filter(item => item.status !== "Completed").length),"Appointments not completed"],["Placement issues",String(records.placements.filter(item => item.status !== "Healthy").length),"Checks requiring action"]];
    return [["Open timecards",String(records.timecards.filter(card => card.status === "Open").length),"Current employee records"],["Submitted",String(records.timecards.filter(card => card.status === "Submitted").length),"Waiting for manager review"],["Manager approved",String(records.timecards.filter(card => card.status === "Manager approved").length),"Waiting for payroll handoff"],["Returned",String(records.timecards.filter(card => card.status === "Returned").length),"Employee correction required"]];
  },[available,delivered,onHand,paid,records.appointments,records.placements,records.timecards,reordered,reportScope]);
  return <div className="page page--reports"><PageHeader eyebrow="Operational reporting" title="Reports" description="Counts and totals derived from records within your permitted scope." actions={<StatusPill tone="gold">Sample data</StatusPill>}/>
    <div className="report-integrity-banner"><Database size={20}/><div><strong>No live source systems are connected.</strong><p>These totals describe the fictional browser records used for this product tour.</p></div></div>
    <div className="report-scope-tabs">{(["commercial","operations","people"] as const).map(item => <button key={item} className={reportScope === item ? "is-active" : ""} onClick={() => setReportScope(item)}>{item}</button>)}</div>
    <div className="report-metric-grid">{metrics.map(([label,value,detail]) => <article key={label}><div><span>{label}</span></div><strong>{value}</strong><p>{detail}</p></article>)}</div>
    {reportScope === "commercial" && <Section title="Commercial record flow" description="Each milestone is reported separately" className="reality-panel"><div className="reality-flow">{[["Orders",records.orders.length,"Entered"],["Paid",records.orders.filter(item => item.paymentStatus === "Paid").length,"Collected"],["Delivered",records.orders.filter(item => ["Delivered","Paid"].includes(item.status)).length,"Received"],["Placed",records.placements.length,"Observed"],["Reordered",reordered,"Bought again"]].map(([title,value,detail],index) => <div key={title as string}><span>{index+1}</span><div><small>{title as string}</small><strong>{value as number}</strong><p>{detail as string}</p></div></div>)}</div><div className="reality-note"><CircleAlert size={17}/><p>No POS or distributor-depletion feed is connected, so consumer sell-through is not reported.</p></div></Section>}
  </div>;
}
