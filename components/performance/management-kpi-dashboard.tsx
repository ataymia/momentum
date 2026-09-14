"use client";

import { BarChart3, Database, Download, List, MapPin, ShieldCheck, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import {
  MANAGEMENT_KPI_DEFINITIONS,
  calculateManagementKpi,
  formatKpiValue,
  kpiPresetPeriod,
  kpiSeries,
  managementKpiCsv,
  managementKpiDefinition,
  managementKpiRows,
  type KpiPersonRow,
  type ManagementKpiKey,
} from "../../lib/management-kpi";
import { useFieldTracking } from "../../lib/location-tracking-context";
import type { WorkspaceUser } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Section, StatusPill } from "../ui";

type PeriodPreset = "7d" | "30d" | "month" | "90d";
type ViewMode = "graph" | "list";

const dashboardKeys: ManagementKpiKey[] = [
  "collected_revenue",
  "paid_cases",
  "completed_demos",
  "demo_completion_rate",
  "new_business_close_rate",
  "new_paid_accounts",
  "reorder_accounts",
  "closeout_completeness_rate",
  "arrival_verification_rate",
];

const presetLabels: Record<PeriodPreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  "90d": "Last 90 days",
};

function commercialContributors(users: WorkspaceUser[], permittedIds?: Set<string>) {
  return users.filter((user) => {
    if (user.role === "Customer" || user.role === "Warehouse" || user.role === "Operations") return false;
    if (permittedIds && !permittedIds.has(user.id)) return false;
    return user.role === "Administrator" || user.role === "Sales Manager" || user.role === "Sales Representative";
  });
}

function sparkPoints(values: number[]) {
  if (!values.length) return "";
  const width = 720;
  const height = 220;
  const paddingX = 24;
  const paddingY = 24;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : paddingX + index / (values.length - 1) * (width - paddingX * 2);
    const y = height - paddingY - (value - min) / span * (height - paddingY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function KpiCard({ metricKey, value, numerator, denominator }: { metricKey: ManagementKpiKey; value: number; numerator: number; denominator?: number }) {
  const definition = managementKpiDefinition(metricKey);
  return <article className="management-kpi-card">
    <div><span>{definition.shortLabel}</span><small>{definition.group}</small></div>
    <strong>{formatKpiValue({ value }, definition.format)}</strong>
    <p>{denominator === undefined ? `${numerator.toLocaleString()} source result${numerator === 1 ? "" : "s"}` : `${numerator.toLocaleString()} / ${denominator.toLocaleString()} source records`}</p>
  </article>;
}

export function ManagementKpiDashboard() {
  const { data, scope, currentUser } = useWorkspace();
  const tracking = useFieldTracking();
  const [preset, setPreset] = useState<PeriodPreset>("30d");
  const [metricKey, setMetricKey] = useState<ManagementKpiKey>("new_business_close_rate");
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  const isManagement = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";
  const period = useMemo(() => kpiPresetPeriod(preset), [preset]);
  const permittedIds = useMemo(() => currentUser?.role === "Administrator" ? undefined : new Set(scope.users.map((user) => user.id)), [currentUser?.role, scope.users]);
  const people = useMemo(() => commercialContributors(data.users, permittedIds), [data.users, permittedIds]);
  const scopeUserIds = useMemo(() => currentUser?.role === "Administrator" ? undefined : people.map((user) => user.id), [currentUser?.role, people]);
  const selectedDefinition = managementKpiDefinition(metricKey);
  const selectedResult = useMemo(() => calculateManagementKpi(metricKey, data, period, scopeUserIds, tracking.state), [data, metricKey, period, scopeUserIds, tracking.state]);
  const rows = useMemo(() => managementKpiRows(metricKey, data, period, people, tracking.state), [data, metricKey, people, period, tracking.state]);
  const series = useMemo(() => kpiSeries(metricKey, data, period, scopeUserIds, tracking.state), [data, metricKey, period, scopeUserIds, tracking.state]);
  const cards = useMemo(() => dashboardKeys.map((key) => ({ key, result: calculateManagementKpi(key, data, period, scopeUserIds, tracking.state) })), [data, period, scopeUserIds, tracking.state]);
  const pointString = useMemo(() => sparkPoints(series.map((point) => point.value)), [series]);

  if (!isManagement) return null;

  const downloadCsv = () => {
    const totalRow: KpiPersonRow = { userId: "scope-total", name: currentUser?.role === "Administrator" ? "Company scope total" : "Managed scope total", role: currentUser?.role ?? "", team: currentUser?.team ?? "", result: selectedResult };
    const csv = managementKpiCsv(selectedDefinition, period, [totalRow, ...rows], new Date().toISOString());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `momentum-${metricKey}-${period.start}-to-${period.end}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return <div className="management-kpi-shell">
    <header className="management-kpi-heading">
      <div><span className="management-kpi-icon"><TrendingUp size={20}/></span><div><small>Management accountability</small><h2>Traceable KPI center</h2><p>Source-defined sales, retention, execution, and field-accountability metrics. Every number has a formula, owner, audit method, and exportable evidence trail.</p></div></div>
      <StatusPill tone="info">Management scope</StatusPill>
    </header>

    <div className="management-kpi-toolbar">
      <label>Period<select value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)}>{(Object.keys(presetLabels) as PeriodPreset[]).map((key) => <option value={key} key={key}>{presetLabels[key]}</option>)}</select></label>
      <label>Metric<select value={metricKey} onChange={(event) => setMetricKey(event.target.value as ManagementKpiKey)}>{MANAGEMENT_KPI_DEFINITIONS.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}</select></label>
      <div className="management-kpi-view-toggle" role="group" aria-label="KPI view"><button className={viewMode === "graph" ? "is-active" : ""} onClick={() => setViewMode("graph")}><BarChart3 size={16}/>Graph</button><button className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")}><List size={16}/>List</button></div>
      <Button size="sm" variant="secondary" icon={<Download size={15}/>} onClick={downloadCsv}>Export CSV</Button>
    </div>

    <div className="management-kpi-period"><strong>{period.start}</strong><span>through</span><strong>{period.end}</strong><i>{currentUser?.role === "Administrator" ? "Company commercial scope" : `${people.length} visible commercial contributor${people.length === 1 ? "" : "s"}`}</i></div>

    <div className="management-kpi-card-grid">{cards.map(({ key, result }) => <KpiCard key={key} metricKey={key} value={result.value} numerator={result.numerator} denominator={result.denominator}/>)}</div>

    <Section title={selectedDefinition.label} description={selectedDefinition.description} className="management-kpi-analysis">
      <div className="management-kpi-selected-summary"><div><small>Selected result</small><strong>{formatKpiValue(selectedResult, selectedDefinition.format)}</strong><span>{selectedResult.denominator === undefined ? `${selectedResult.sourceRecordIds.length} evidence record${selectedResult.sourceRecordIds.length === 1 ? "" : "s"}` : `${selectedResult.numerator} numerator / ${selectedResult.denominator} denominator`}</span></div><div><small>Reporting group</small><strong>{selectedDefinition.group}</strong><span>{presetLabels[preset]}</span></div></div>

      {viewMode === "graph" ? <div className="management-kpi-chart-wrap">
        <svg className="management-kpi-chart" viewBox="0 0 720 220" role="img" aria-label={`${selectedDefinition.label} trend for ${presetLabels[preset]}`}>
          <line x1="24" y1="196" x2="696" y2="196" className="management-kpi-axis"/>
          <polyline points={pointString} className="management-kpi-line" fill="none" vectorEffect="non-scaling-stroke"/>
          {series.map((point, index) => {
            const [x, y] = pointString.split(" ")[index]?.split(",").map(Number) ?? [0, 0];
            return <circle key={`${point.start}-${point.end}`} cx={x} cy={y} r="4" className="management-kpi-dot"><title>{point.label}: {formatKpiValue(point, selectedDefinition.format)}</title></circle>;
          })}
        </svg>
        <div className="management-kpi-chart-labels">{series.map((point, index) => <span key={`${point.start}-${index}`}><small>{point.label}</small><strong>{formatKpiValue(point, selectedDefinition.format)}</strong></span>)}</div>
      </div> : <div className="management-kpi-table-wrap"><table className="management-kpi-table"><thead><tr><th>Employee</th><th>Role</th><th>Result</th><th>Evidence</th></tr></thead><tbody><tr className="is-total"><td>{currentUser?.role === "Administrator" ? "Company scope" : "Managed scope"}</td><td>Aggregate</td><td>{formatKpiValue(selectedResult, selectedDefinition.format)}</td><td>{selectedResult.sourceRecordIds.length} records</td></tr>{rows.map((row) => <tr key={row.userId}><td><strong>{row.name}</strong><small>{row.team}</small></td><td>{row.role}</td><td>{formatKpiValue(row.result, selectedDefinition.format)}</td><td>{row.result.denominator === undefined ? `${row.result.sourceRecordIds.length} records` : `${row.result.numerator}/${row.result.denominator}`}</td></tr>)}</tbody></table></div>}
    </Section>

    <Section title="Metric definition & control" description="The formula is part of the product, not tribal knowledge" className="management-kpi-definition">
      <div className="management-kpi-definition-grid">
        <article><span><Database size={17}/></span><div><small>Formula</small><p>{selectedDefinition.formula}</p></div></article>
        <article><span><ShieldCheck size={17}/></span><div><small>Inclusion / exclusion</small><p><strong>Include:</strong> {selectedDefinition.inclusion}</p><p><strong>Exclude:</strong> {selectedDefinition.exclusion}</p></div></article>
        <article><span><TrendingUp size={17}/></span><div><small>Source & audit</small><p>{selectedDefinition.source}</p><p><strong>Audit:</strong> {selectedDefinition.auditMethod}</p></div></article>
        <article><span><MapPin size={17}/></span><div><small>Owner & action</small><p><strong>{selectedDefinition.owner}</strong> · {selectedDefinition.frequency}</p><p>{selectedDefinition.actionTriggered}</p></div></article>
      </div>
      <div className="management-kpi-guardrail"><strong>Gaming risk</strong><p>{selectedDefinition.gamingRisk}</p><span>Intended behavior: {selectedDefinition.intendedBehavior}</span></div>
    </Section>
  </div>;
}
