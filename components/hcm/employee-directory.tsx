"use client";

import { BarChart3, BriefcaseBusiness, Building2, CalendarClock, Clock3, Mail, MapPin, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useAudit } from "../../lib/audit-context";
import {
  appointmentPunctualityEvidence,
  averageRecordedVariance,
  canViewEmployeeManagementDetail,
  currentOrNextShift,
  employeePresence,
  lastRecordedEmployeeActivity,
  shiftClockInEvidence,
} from "../../lib/employee-profile";
import { useFieldTracking } from "../../lib/location-tracking-context";
import { calculateManagementKpi, formatKpiValue, kpiPresetPeriod, managementKpiDefinition, type ManagementKpiKey } from "../../lib/management-kpi";
import { useHcm } from "../../lib/hcm-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Section, StatusPill, formatDate, hoursBetween } from "../ui";

const managerSalesMetrics: ManagementKpiKey[] = [
  "collected_revenue",
  "paid_cases",
  "completed_demos",
  "new_business_close_rate",
  "reorder_accounts",
  "closeout_completeness_rate",
  "arrival_verification_rate",
];
const varianceLabel = (value: number | undefined) => value === undefined ? "No comparable records" : value === 0 ? "0 min" : `${value > 0 ? "+" : ""}${value.toFixed(1)} min`;
const presenceTone = (status: string) => status === "In field appointment" || status === "On the clock" ? "success" as const : status === "Off clock" ? "neutral" as const : "warning" as const;

export function EmployeeDirectory() {
  const { data, currentUser, navigate } = useWorkspace();
  const { hcm } = useHcm();
  const tracking = useFieldTracking();
  const { audit } = useAudit();
  const [query, setQuery] = useState("");
  const focusId = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null;
  const focusedEmployee = focusId ? data.users.find((user) => user.id === focusId && user.role !== "Customer") : undefined;
  const [selectedId, setSelectedId] = useState(focusedEmployee?.id ?? currentUser?.id ?? "");
  const employees = useMemo(() => data.users.filter((user) => user.role !== "Customer").sort((a, b) => a.name.localeCompare(b.name)), [data.users]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((user) => [user.name, user.title, user.team, user.email].some((value) => value.toLowerCase().includes(needle)));
  }, [employees, query]);
  const selected = employees.find((user) => user.id === selectedId) ?? employees[0];
  if (!currentUser || !selected) return null;

  const employment = hcm.employees.find((record) => record.userId === selected.id);
  const manager = data.users.find((user) => user.id === (employment?.managerId ?? selected.managerId));
  const presence = employeePresence(data, selected.id);
  const lastActivity = lastRecordedEmployeeActivity(data, tracking.state, audit.events, selected.id);
  const nextShift = currentOrNextShift(hcm, selected.id);
  const managementDetail = canViewEmployeeManagementDetail(currentUser, selected, data);
  const period = kpiPresetPeriod("30d");
  const appointmentEvidence = appointmentPunctualityEvidence(data, tracking.state, selected.id, period.start, period.end);
  const shiftEvidence = shiftClockInEvidence(data, hcm, selected.id, period.start, period.end);
  const arrivalVariance = averageRecordedVariance(appointmentEvidence);
  const clockVariance = averageRecordedVariance(shiftEvidence);
  const currentWeekEntries = data.timeEntries.filter((entry) => entry.userId === selected.id && entry.date >= kpiPresetPeriod("7d").start);
  const currentWeekHours = currentWeekEntries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);
  const openAppointments = data.appointments.filter((appointment) => appointment.ownerId === selected.id && appointment.status !== "Completed").length;
  const ownedAccounts = data.accounts.filter((account) => account.ownerId === selected.id).length;
  const openTraining = hcm.training.filter((assignment) => assignment.userId === selected.id && assignment.status !== "Complete").length;
  const missingDocuments = hcm.documents.filter((document) => document.userId === selected.id && ["Missing", "Acknowledgment required"].includes(document.status)).length;
  const isSales = selected.role === "Sales Representative" || selected.role === "Sales Manager";

  return <section className="employee-directory-shell" aria-label="Employee directory and profiles">
    <div className="employee-directory-heading">
      <div><span><UsersRound size={20}/></span><div><small>Company directory</small><h2>Employee profiles</h2><p>Find coworkers quickly. Managers can open source-linked operational detail for employees inside their management scope.</p></div></div>
      <StatusPill tone="info">{employees.length} employee{employees.length === 1 ? "" : "s"}</StatusPill>
    </div>

    <div className="employee-directory-layout">
      <aside className="employee-directory-list">
        <label className="employee-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, title, department…"/></label>
        <div>{filtered.map((user) => {
          const record = hcm.employees.find((item) => item.userId === user.id);
          const status = employeePresence(data, user.id);
          return <button key={user.id} className={selected.id === user.id ? "is-selected" : ""} onClick={() => setSelectedId(user.id)}>
            <Avatar initials={user.initials} color={user.accent}/><span><strong>{user.name}</strong><small>{record?.jobTitle ?? user.title}</small><i>{record?.department ?? user.team}</i></span><b className={`employee-presence employee-presence--${presenceTone(status)}`}/>
          </button>;
        })}{filtered.length === 0 && <div className="employee-directory-empty">No employees match that search.</div>}</div>
      </aside>

      <div className="employee-profile-card">
        <header className="employee-profile-hero">
          <Avatar initials={selected.initials} color={selected.accent}/>
          <div><small>{employment?.department ?? selected.team}</small><h2>{selected.name}</h2><p>{employment?.jobTitle ?? selected.title}</p><div className="employee-profile-status"><StatusPill tone={presenceTone(presence)}>{presence}</StatusPill>{employment?.status && <StatusPill tone={employment.status === "Active" ? "success" : "warning"}>{employment.status}</StatusPill>}</div></div>
        </header>

        <div className="employee-profile-info-grid">
          <article><Mail size={17}/><div><small>Work email</small><strong>{selected.email}</strong></div></article>
          <article><Building2 size={17}/><div><small>Department</small><strong>{employment?.department ?? selected.team}</strong></div></article>
          <article><BriefcaseBusiness size={17}/><div><small>Manager</small><strong>{manager?.name ?? "Not configured"}</strong></div></article>
          <article><MapPin size={17}/><div><small>Work location</small><strong>{employment?.location || "Not configured"}</strong></div></article>
          <article><CalendarClock size={17}/><div><small>Work hours</small><strong>{employment?.standardWeeklyHours ? `${employment.standardWeeklyHours} hrs / week` : nextShift ? `${nextShift.startTime}–${nextShift.endTime} next shift` : "Not configured"}</strong></div></article>
          <article><Clock3 size={17}/><div><small>Last recorded activity</small><strong>{lastActivity ? formatDate(lastActivity.at, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "No recorded activity"}</strong><span>{lastActivity?.label ?? "Presence will use authenticated session events after backend integration."}</span></div></article>
        </div>

        {!managementDetail && <div className="employee-profile-public-note"><UserRound size={17}/><p>This is the coworker directory view. Personal HR records, performance details, location trails, and management records are not exposed to peers.</p></div>}

        {managementDetail && <>
          <div className="employee-manager-banner"><ShieldCheck size={18}/><div><strong>Manager view</strong><p>Operational detail below is source-linked. It is not an automatically calculated performance scorecard.</p></div><StatusPill tone="gold">Last 30 days</StatusPill></div>

          <div className="employee-manager-summary">
            <article><small>Recent hours recorded</small><strong>{currentWeekHours.toFixed(2)}</strong><span>Last 7 calendar days</span></article>
            <article><small>Open appointments</small><strong>{openAppointments}</strong><span>Assigned work not completed</span></article>
            <article><small>Responsible accounts</small><strong>{ownedAccounts}</strong><span>Current CRM responsibility</span></article>
            <article><small>HR action items</small><strong>{openTraining + missingDocuments}</strong><span>{openTraining} training · {missingDocuments} documents</span></article>
          </div>

          {isSales && <Section title="Source-linked sales KPIs" description="Management reference data only. Scorecard weighting and final performance judgment remain a manager responsibility." className="employee-profile-kpis">
            <div className="employee-profile-kpi-grid">{managerSalesMetrics.map((key) => {
              const definition = managementKpiDefinition(key); const result = calculateManagementKpi(key, data, period, [selected.id], tracking.state);
              return <article key={key}><small>{definition.shortLabel}</small><strong>{formatKpiValue(result, definition.format)}</strong><span>{result.denominator === undefined ? `${result.sourceRecordIds.length} evidence records` : `${result.numerator}/${result.denominator} source records`}</span></article>;
            })}</div>
            <Button size="sm" variant="secondary" icon={<BarChart3 size={15}/>} onClick={() => navigate("reports")}>Open Reports KPI center</Button>
          </Section>}

          <Section title="Attendance & punctuality evidence" description="Clock-in and appointment arrival timing are recorded as factual variances. Momentum does not invent a late threshold or scorecard weight." className="employee-punctuality">
            <div className="employee-punctuality-summary"><article><small>Average appointment arrival variance</small><strong>{varianceLabel(arrivalVariance)}</strong><span>{appointmentEvidence.filter((record) => record.varianceMinutes !== undefined).length}/{appointmentEvidence.length} comparable appointments</span></article><article><small>Average shift clock-in variance</small><strong>{varianceLabel(clockVariance)}</strong><span>{shiftEvidence.filter((record) => record.varianceMinutes !== undefined).length}/{shiftEvidence.length} comparable shifts</span></article></div>
            <div className="employee-evidence-table"><div className="employee-evidence-row employee-evidence-head"><span>Type</span><span>Date</span><span>Scheduled</span><span>Actual</span><span>Variance</span></div>{[...appointmentEvidence, ...shiftEvidence].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map((record)=><div className="employee-evidence-row" key={record.id}><span><strong>{record.kind}</strong><small>{record.note}</small></span><span>{record.date}</span><span>{record.scheduledTime}</span><span>{record.actualTime ?? "Missing evidence"}</span><span>{record.varianceMinutes === undefined ? "—" : `${record.varianceMinutes > 0 ? "+" : ""}${record.varianceMinutes} min`}</span></div>)}{appointmentEvidence.length + shiftEvidence.length === 0 && <div className="employee-directory-empty">No scheduled shift or appointment timing evidence exists for this period.</div>}</div>
          </Section>
        </>}
      </div>
    </div>
  </section>;
}
