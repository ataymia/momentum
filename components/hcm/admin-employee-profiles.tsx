"use client";

import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Route,
  Search,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAudit } from "../../lib/audit-context";
import { useCrm } from "../../lib/crm-context";
import { addCalendarDays, arizonaDateKey } from "../../lib/date-time";
import { useDelivery } from "../../lib/delivery-context";
import {
  applyCompensationCorrection,
  employeeOriginatedAccounts,
  employeePhysicalVisits,
  employeeResponsibleAccounts,
  employeeVisitLabel,
} from "../../lib/employee-admin";
import { activeCompensation, appendAudit, type PayBasis } from "../../lib/hcm-engine";
import { useHcm } from "../../lib/hcm-context";
import { useFieldTracking } from "../../lib/location-tracking-context";
import { timeEntryHours } from "../../lib/payroll-engine";
import { usePayroll } from "../../lib/payroll-context";
import type { TimeEntry, WorkspaceUser } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Field, Section, StatusPill, formatDate, formatMoney } from "../ui";

type ProfileTab = "overview" | "timePay" | "tripsSales" | "hr";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function newestEntry(entries: TimeEntry[]) {
  return [...entries].sort((a, b) => `${b.date}T${b.clockIn}`.localeCompare(`${a.date}T${a.clockIn}`))[0];
}

function currentClock(entries: TimeEntry[]) {
  return newestEntry(entries.filter((entry) => !entry.clockOut));
}

function clockLabel(entry?: TimeEntry) {
  if (!entry) return "Clocked out";
  const exact = entry.clockInAt ? formatDate(entry.clockInAt, { hour:"numeric", minute:"2-digit" }) : entry.clockIn;
  return `Clocked in at ${exact}`;
}

function hours(entries: TimeEntry[]) {
  return entries.reduce((sum, entry) => sum + timeEntryHours(entry), 0);
}

function activityDate(value: string) {
  try { return arizonaDateKey(value); } catch { return value.slice(0, 10); }
}

function employeeStatus(employmentStatus: string | undefined, open?: TimeEntry) {
  if (employmentStatus === "Separated") return { label:"Separated", tone:"danger" as const };
  if (employmentStatus === "Leave") return { label:"On leave", tone:"warning" as const };
  if (open) return { label:"Clocked in", tone:"success" as const };
  return { label:"Clocked out", tone:"neutral" as const };
}

export function AdminEmployeeProfiles() {
  const { data, currentUser } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const { crm } = useCrm();
  const { payroll } = usePayroll();
  const delivery = useDelivery();
  const tracking = useFieldTracking();
  const { visibleEvents } = useAudit();
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [payBasis, setPayBasis] = useState<Exclude<PayBasis, "Not configured">>("Hourly");
  const [payRate, setPayRate] = useState("");
  const [payEffective, setPayEffective] = useState(arizonaDateKey());
  const [payReason, setPayReason] = useState("");
  const [payNotice, setPayNotice] = useState<{ tone:"success"|"danger"; text:string } | null>(null);

  const employees = useMemo(() => data.users
    .filter((user) => user.role !== "Customer")
    .sort((left, right) => left.name.localeCompare(right.name)), [data.users]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((user) => [user.name, user.title, user.email, user.role, user.team, user.username]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [employees, query]);

  useEffect(() => {
    if (!selectedId && employees.length) setSelectedId(employees[0].id);
  }, [employees, selectedId]);

  const selected = employees.find((user) => user.id === selectedId);
  const employment = selected ? hcm.employees.find((record) => record.userId === selected.id) : undefined;
  const privateProfile = selected ? hcm.privateProfiles.find((record) => record.userId === selected.id) : undefined;
  const compensation = selected ? activeCompensation(hcm, selected.id) : undefined;

  useEffect(() => {
    if (!selected) return;
    setPayBasis(compensation?.basis === "Salary per pay period" ? "Salary per pay period" : "Hourly");
    setPayRate(compensation ? String(compensation.rate) : "");
    setPayEffective(arizonaDateKey());
    setPayReason("");
    setPayNotice(null);
    setTab("overview");
  // Changing the compensation record after a save should not immediately erase the success notice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!currentUser || currentUser.role !== "Administrator") return null;

  if (!selected) {
    return <div className="review-empty"><UserRound size={24}/><h3>No employees available</h3><p>Create or activate an employee before opening a profile.</p></div>;
  }

  const entries = data.timeEntries
    .filter((entry) => entry.userId === selected.id)
    .sort((left, right) => `${right.date}T${right.clockIn}`.localeCompare(`${left.date}T${left.clockIn}`));
  const open = currentClock(entries);
  const status = employeeStatus(employment?.status, open);
  const today = arizonaDateKey();
  const sevenDaysAgo = addCalendarDays(today, -6);
  const thirtyDaysAgo = addCalendarDays(today, -29);
  const recentEntries = entries.filter((entry) => entry.date >= sevenDaysAgo);
  const timecards = data.timecards.filter((card) => card.userId === selected.id).sort((left, right) => right.weekStart.localeCompare(left.weekStart));
  const visits = employeePhysicalVisits(crm, selected.id);
  const visits30 = visits.filter((visit) => activityDate(visit.occurredAt) >= thirtyDaysAgo);
  const originated = employeeOriginatedAccounts(data, selected.id);
  const responsible = employeeResponsibleAccounts(data, selected.id);
  const appointments = data.appointments.filter((item) => item.ownerId === selected.id).sort((left, right) => `${right.date}T${right.startTime}`.localeCompare(`${left.date}T${left.startTime}`));
  const employeeDeliveries = delivery.state.tasks.filter((task) => task.driverId === selected.id).sort((left, right) => (right.deliveredAt ?? right.departedAt ?? right.acceptedAt).localeCompare(left.deliveredAt ?? left.departedAt ?? left.acceptedAt));
  const routeSessions = tracking.state.sessions.filter((session) => session.userId === selected.id).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const latestLocation = tracking.latestSampleForUser(selected.id);
  const payrollRuns = payroll.runs
    .flatMap((run) => {
      const line = run.lines.find((item) => item.employeeId === selected.id);
      return line ? [{ run, line }] : [];
    })
    .sort((left, right) => right.run.payDate.localeCompare(left.run.payDate));
  const compensationHistory = hcm.compensation.filter((record) => record.userId === selected.id).sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
  const documents = hcm.documents.filter((record) => record.userId === selected.id);
  const training = hcm.training.filter((record) => record.userId === selected.id);
  const employeeEvents = visibleEvents.filter((event) => event.actorId === selected.id || event.relatedUserId === selected.id).sort((left, right) => right.at.localeCompare(left.at));
  const lastEvent = employeeEvents[0];
  const manager = data.users.find((user) => user.id === (employment?.managerId ?? selected.managerId));
  const completedAppointments = appointments.filter((item) => item.status === "Completed").length;
  const deliveredCount = employeeDeliveries.filter((task) => task.status === "Delivered").length;
  const currentRateLabel = compensation
    ? `${formatMoney(compensation.rate)} · ${compensation.basis}`
    : "Not configured";

  const savePayCorrection = (event: FormEvent) => {
    event.preventDefault();
    const rate = Number(payRate);
    const createdAt = now();
    const result = applyCompensationCorrection(hcm, {
      recordId: uid("comp-admin"),
      userId: selected.id,
      basis: payBasis,
      rate,
      effectiveDate: payEffective,
      reason: payReason,
      approvedBy: currentUser.id,
      createdAt,
    });
    if (!result.ok) {
      setPayNotice({ tone:"danger", text:result.message });
      return;
    }
    const before = result.previous ? `${result.previous.basis} ${result.previous.rate}` : "Not configured";
    const after = `${result.record.basis} ${result.record.rate}`;
    setHcm(appendAudit(result.state, {
      actorId: currentUser.id,
      action: "Administrator compensation correction",
      entityType: "CompensationRecord",
      entityId: result.record.id,
      before,
      after,
      reason: payReason.trim(),
    }));
    setPayNotice({ tone:"success", text:"Pay record updated. Prior compensation history was preserved for audit." });
    setPayReason("");
  };

  return <div className="employee-directory-shell admin-employee-profiles">
    <div className="employee-directory-heading">
      <div><span><ShieldCheck size={20}/></span><div><small>Administrator only</small><h2>Employee profiles</h2><p>One source-linked view of each employee's identity, time, pay, field activity, accounts, delivery work, HR record, and recent system activity.</p></div></div>
      <StatusPill tone="gold">{employees.length} employee{employees.length === 1 ? "" : "s"}</StatusPill>
    </div>

    <div className="employee-directory-layout">
      <aside className="employee-directory-list">
        <label className="employee-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees..." /></label>
        <div>{filtered.map((user) => {
          const record = hcm.employees.find((item) => item.userId === user.id);
          const userEntries = data.timeEntries.filter((entry) => entry.userId === user.id);
          const live = currentClock(userEntries);
          const liveStatus = employeeStatus(record?.status, live);
          return <button type="button" key={user.id} className={selectedId === user.id ? "is-selected" : ""} onClick={() => setSelectedId(user.id)}>
            <i className={`employee-presence employee-presence--${liveStatus.tone === "success" ? "success" : liveStatus.tone === "warning" ? "warning" : "neutral"}`}/>
            <span><strong>{user.name}</strong><small>{user.title} · {liveStatus.label}</small></span>
            <i>{record?.employeeNumber ?? user.role}</i>
          </button>;
        })}{filtered.length === 0 && <div className="employee-directory-empty">No employees match this search.</div>}</div>
      </aside>

      <main className="employee-profile-card">
        <div className="employee-profile-hero">
          <Avatar initials={selected.initials} color={selected.accent}/>
          <div><small>{employment?.employeeNumber ?? selected.role}</small><h2>{selected.name}</h2><p>{employment?.jobTitle ?? selected.title} · {employment?.department ?? selected.team}</p>
            <div className="employee-profile-status"><StatusPill tone={status.tone}>{status.label}</StatusPill><StatusPill tone="neutral">{clockLabel(open)}</StatusPill><StatusPill tone={employment?.status === "Active" ? "success" : "neutral"}>{employment?.status ?? "Employment record pending"}</StatusPill></div>
          </div>
        </div>

        <div className="company-tabs admin-profile-tabs">
          <button type="button" className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" className={tab === "timePay" ? "is-active" : ""} onClick={() => setTab("timePay")}>Time & pay</button>
          <button type="button" className={tab === "tripsSales" ? "is-active" : ""} onClick={() => setTab("tripsSales")}>Trips & sales</button>
          <button type="button" className={tab === "hr" ? "is-active" : ""} onClick={() => setTab("hr")}>HR record</button>
        </div>

        {tab === "overview" && <>
          <div className="employee-profile-info-grid">
            <article><Mail size={16}/><div><small>E-mail</small><strong>{selected.email}</strong><span>Username: {selected.username ?? "Not set"}</span></div></article>
            <article><Phone size={16}/><div><small>Phone</small><strong>{privateProfile?.phone ?? selected.phone ?? "Not set"}</strong><span>Emergency: {privateProfile?.emergencyContact ?? "Not set"}</span></div></article>
            <article><UserRound size={16}/><div><small>Manager</small><strong>{manager?.name ?? "Not assigned"}</strong><span>{manager?.title ?? "No reporting line"}</span></div></article>
            <article><BriefcaseBusiness size={16}/><div><small>Employment</small><strong>{employment?.classification ?? "Not configured"}</strong><span>Hire date: {employment?.hireDate ? formatDate(employment.hireDate,{month:"short",day:"numeric",year:"numeric"}) : "Not set"}</span></div></article>
            <article><WalletCards size={16}/><div><small>Current pay</small><strong>{currentRateLabel}</strong><span>Effective {compensation?.effectiveDate ?? "not configured"}</span></div></article>
            <article><MapPin size={16}/><div><small>Work location</small><strong>{employment?.location ?? "Not configured"}</strong><span>{privateProfile?.address ?? "Home address not set"}</span></div></article>
          </div>

          <div className="employee-manager-summary">
            <article><small>Hours · last 7 days</small><strong>{hours(recentEntries).toFixed(1)}</strong><span>{recentEntries.length} punch record{recentEntries.length === 1 ? "" : "s"}</span></article>
            <article><small>Trips · last 30 days</small><strong>{visits30.length}</strong><span>{visits.length} physical visits all time</span></article>
            <article><small>Accounts opened</small><strong>{originated.length}</strong><span>{responsible.length} currently responsible</span></article>
            <article><small>Appointments completed</small><strong>{completedAppointments}</strong><span>{appointments.length} total assigned records</span></article>
            <article><small>Tracked field sessions</small><strong>{routeSessions.length}</strong><span>{latestLocation ? `Latest ping ${formatDate(latestLocation.at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}` : "No location evidence"}</span></article>
            <article><small>Deliveries completed</small><strong>{deliveredCount}</strong><span>{employeeDeliveries.length} assigned delivery records</span></article>
            <article><small>Training</small><strong>{training.filter((item) => item.status === "Complete").length}/{training.length}</strong><span>Required assignments completed</span></article>
            <article><small>Recent system activity</small><strong>{employeeEvents.length}</strong><span>{lastEvent ? `Latest ${formatDate(lastEvent.at,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}` : "No audit activity"}</span></article>
          </div>

          <Section title="Current activity" description="Immediate status from live source records, not a separate profile counter.">
            <div className="admin-profile-current-activity">
              <article><Clock3 size={17}/><div><small>Clock</small><strong>{clockLabel(open)}</strong><p>{open ? `${open.date} · ${open.source} · ${open.breakMinutes} break minutes` : "No open time entry."}</p></div></article>
              <article><CalendarDays size={17}/><div><small>Next assigned appointment</small><strong>{appointments.find((item) => item.status !== "Completed" && item.date >= today)?.date ?? "None scheduled"}</strong><p>{appointments.find((item) => item.status !== "Completed" && item.date >= today)?.status ?? "No upcoming appointment record."}</p></div></article>
              <article><Route size={17}/><div><small>Last physical visit</small><strong>{visits[0] ? employeeVisitLabel(visits[0], data) : "No visit recorded"}</strong><p>{visits[0] ? formatDate(visits[0].occurredAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}) : "Quick Visit history will appear here."}</p></div></article>
            </div>
          </Section>
        </>}

        {tab === "timePay" && <>
          <Section title="Compensation" description="Administrator corrections create a new effective-dated record and preserve the old record. Released payroll is never rewritten by this form.">
            <div className="employee-profile-kpi-grid">
              <article><small>Current rate</small><strong>{compensation ? formatMoney(compensation.rate) : "—"}</strong><span>{compensation?.basis ?? "Not configured"}</span></article>
              <article><small>Effective date</small><strong>{compensation?.effectiveDate ?? "—"}</strong><span>{compensation?.reason ?? "No active pay record"}</span></article>
              <article><small>Pay group</small><strong>{employment?.payGroup ?? "—"}</strong><span>{employment?.standardWeeklyHours ?? "—"} standard weekly hours</span></article>
              <article><small>Payroll periods</small><strong>{payrollRuns.length}</strong><span>Historical runs containing this employee</span></article>
            </div>
            <form className="form-grid employee-profile-edit-form admin-pay-correction" onSubmit={savePayCorrection}>
              <Field label="Pay basis"><select value={payBasis} onChange={(event) => setPayBasis(event.target.value as Exclude<PayBasis,"Not configured">)}><option>Hourly</option><option>Salary per pay period</option></select></Field>
              <Field label="Rate"><input type="number" min="0.01" step="0.01" required value={payRate} onChange={(event) => setPayRate(event.target.value)}/></Field>
              <Field label="Effective date"><input type="date" required value={payEffective} onChange={(event) => setPayEffective(event.target.value)}/></Field>
              <Field label="Correction reason" className="field--full"><input required value={payReason} onChange={(event) => setPayReason(event.target.value)} placeholder="Example: Correct initial rate entered during setup"/></Field>
              <div className="employee-profile-edit-actions field--full"><Button type="submit">Save pay correction</Button>{payNotice&&<StatusPill tone={payNotice.tone}>{payNotice.text}</StatusPill>}</div>
            </form>
          </Section>

          <Section title="Recent time entries" description="Clock-in, clock-out, source, breaks, and calculated worked time.">
            <div className="employee-evidence-table">
              <div className="employee-evidence-row employee-evidence-head"><span>Date</span><span>Clock in</span><span>Clock out</span><span>Break</span><span>Hours</span></div>
              {entries.slice(0,40).map((entry)=><div className="employee-evidence-row" key={entry.id}><span><strong>{entry.date}</strong><small>{entry.source}{entry.corrections?.length ? ` · ${entry.corrections.length} correction${entry.corrections.length === 1 ? "" : "s"}` : ""}</small></span><span>{entry.clockIn}</span><span>{entry.clockOut ?? "Open"}</span><span>{entry.breakMinutes} min</span><span>{timeEntryHours(entry).toFixed(2)}</span></div>)}
              {!entries.length&&<div className="employee-directory-empty">No time entries recorded.</div>}
            </div>
          </Section>

          <Section title="Timecards & pay periods" description="Weekly timecard status plus payroll history for the employee.">
            <div className="admin-profile-split-lists">
              <div><h4>Timecards</h4>{timecards.slice(0,20).map((card)=><article key={card.id}><div><strong>{card.weekStart} → {card.weekEnd}</strong><small>{card.attested ? "Employee attested" : "Not attested"}</small></div><StatusPill tone={["Manager approved","Payroll ready"].includes(card.status)?"success":card.status==="Returned"?"danger":"neutral"}>{card.status}</StatusPill></article>)}{!timecards.length&&<p>No timecards.</p>}</div>
              <div><h4>Payroll</h4>{payrollRuns.slice(0,20).map(({run,line})=><article key={run.id}><div><strong>{run.periodStart} → {run.periodEnd}</strong><small>Pay {run.payDate} · {line.regularHours.toFixed(1)} regular / {line.overtimeHours.toFixed(1)} OT hrs · Gross {formatMoney(line.grossPay)} · Net {formatMoney(line.netPay)}</small></div><StatusPill tone={run.status==="Released"?"success":run.status==="Voided"?"danger":"neutral"}>{run.status}</StatusPill></article>)}{!payrollRuns.length&&<p>No payroll runs.</p>}</div>
            </div>
          </Section>

          <Section title="Compensation history" description="Effective-dated pay records remain visible after corrections.">
            <div className="admin-profile-record-list">{compensationHistory.map((record)=><article key={record.id}><WalletCards size={16}/><div><strong>{formatMoney(record.rate)} · {record.basis}</strong><p>Effective {record.effectiveDate}{record.endDate ? ` through ${record.endDate}` : ""} · {record.reason}</p></div><StatusPill tone={record.status==="Active"?"success":record.status==="Future"?"warning":"neutral"}>{record.status}</StatusPill></article>)}{!compensationHistory.length&&<div className="employee-directory-empty">No compensation history recorded.</div>}</div>
          </Section>
        </>}

        {tab === "tripsSales" && <>
          <div className="employee-profile-kpi-grid">
            <article><small>Physical visits</small><strong>{visits.length}</strong><span>{visits30.length} in last 30 days</span></article>
            <article><small>Accounts originated</small><strong>{originated.length}</strong><span>Historical attribution</span></article>
            <article><small>Accounts responsible</small><strong>{responsible.length}</strong><span>Current ownership</span></article>
            <article><small>Field sessions</small><strong>{routeSessions.length}</strong><span>{tracking.state.samples.filter((sample)=>sample.userId===selected.id).length} saved route points</span></article>
          </div>

          <Section title="Trip / Quick Visit history" description="Every saved physical business stop for this employee. Freehand Quick Visits remain visible even when no account was created.">
            <div className="admin-profile-record-list admin-profile-visit-list">{visits.slice(0,75).map((visit)=><article key={visit.id}><Route size={16}/><div><strong>{employeeVisitLabel(visit,data)}</strong><p>{formatDate(visit.occurredAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})} · {visit.summary}{visit.outcome ? ` · ${visit.outcome}` : ""}</p><small>{visit.prospectRating ? `Score ${visit.prospectRating}/10 · ` : ""}{visit.visitUnsuccessful ? "Unsuccessful visit" : "Physical visit"}</small></div><StatusPill tone={visit.visitUnsuccessful?"warning":"success"}>{visit.visitUnsuccessful?"Unsuccessful":"Visited"}</StatusPill></article>)}{!visits.length&&<div className="employee-directory-empty">No physical visits recorded.</div>}</div>
          </Section>

          <Section title="Account work" description="Originated accounts stay separate from current responsibility so transfers do not rewrite history.">
            <div className="admin-profile-split-lists">
              <div><h4>Opened / originated</h4>{originated.slice(0,30).map((account)=><article key={account.id}><div><strong>{account.locationName ?? account.name}</strong><small>{account.stage} · {account.channel} · {account.reorderCount} reorder{account.reorderCount===1?"":"s"}</small></div><StatusPill tone={account.stage==="Reordered"?"success":"neutral"}>{account.health}</StatusPill></article>)}{!originated.length&&<p>No originated accounts.</p>}</div>
              <div><h4>Current responsibility</h4>{responsible.slice(0,30).map((account)=><article key={account.id}><div><strong>{account.locationName ?? account.name}</strong><small>{account.stage} · next {account.nextActionDate || "not scheduled"}</small></div><StatusPill tone={account.health==="Strong"?"success":account.health==="At risk"?"danger":"neutral"}>{account.health}</StatusPill></article>)}{!responsible.length&&<p>No accounts currently assigned.</p>}</div>
            </div>
          </Section>

          <Section title="Appointments & delivery activity" description="Role-specific operational records remain tied to the employee.">
            <div className="admin-profile-split-lists">
              <div><h4>Appointments</h4>{appointments.slice(0,25).map((item)=><article key={item.id}><div><strong>{item.date} · {item.startTime}</strong><small>{item.type} · {item.outcome ?? "No closeout outcome"}</small></div><StatusPill tone={item.status==="Completed"?"success":"neutral"}>{item.status}</StatusPill></article>)}{!appointments.length&&<p>No assigned appointments.</p>}</div>
              <div><h4>Deliveries</h4>{employeeDeliveries.slice(0,25).map((task)=><article key={task.id}><div><strong>Order {task.orderId}</strong><small>{task.deliveredAt ? `Delivered ${formatDate(task.deliveredAt,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}` : `Accepted ${formatDate(task.acceptedAt,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`}</small></div><StatusPill tone={task.status==="Delivered"?"success":task.status==="Cancelled"?"danger":"neutral"}>{task.status}</StatusPill></article>)}{!employeeDeliveries.length&&<p>No delivery assignments.</p>}</div>
            </div>
          </Section>
        </>}

        {tab === "hr" && <>
          <Section title="Employment record" description="Administrator-only employment and private profile details.">
            <div className="employee-profile-info-grid">
              <article><BriefcaseBusiness size={16}/><div><small>Position</small><strong>{employment?.jobTitle ?? selected.title}</strong><span>{employment?.department ?? selected.team}</span></div></article>
              <article><UserRound size={16}/><div><small>Classification</small><strong>{employment?.classification ?? "Not configured"}</strong><span>{employment?.payGroup ?? "No pay group"}</span></div></article>
              <article><Clock3 size={16}/><div><small>Standard hours</small><strong>{employment?.standardWeeklyHours ?? "Not set"}</strong><span>hours per week</span></div></article>
              <article><MapPin size={16}/><div><small>Address</small><strong>{privateProfile?.address ?? "Not set"}</strong><span>Private HR field</span></div></article>
              <article><Phone size={16}/><div><small>Emergency contact</small><strong>{privateProfile?.emergencyContact ?? "Not set"}</strong><span>Private HR field</span></div></article>
              <article><CalendarDays size={16}/><div><small>Employment dates</small><strong>{employment?.hireDate ?? "Hire date not set"}</strong><span>{employment?.separationDate ? `Separated ${employment.separationDate}` : "No separation date"}</span></div></article>
            </div>
          </Section>

          <Section title="Documents & training" description="Completion status only. Sensitive document content remains governed by its existing access rules.">
            <div className="admin-profile-split-lists">
              <div><h4><FileText size={15}/> Documents</h4>{documents.map((document)=><article key={document.id}><div><strong>{document.title}</strong><small>{document.category} · version {document.version}</small></div><StatusPill tone={document.status==="Available"?"success":document.status==="Missing"?"warning":"neutral"}>{document.status}</StatusPill></article>)}{!documents.length&&<p>No document records.</p>}</div>
              <div><h4><GraduationCap size={15}/> Training</h4>{training.map((assignment)=>{const course=hcm.courses.find((item)=>item.id===assignment.courseId);return <article key={assignment.id}><div><strong>{course?.title ?? assignment.courseId}</strong><small>Assigned {assignment.assignedAt}{assignment.dueDate ? ` · due ${assignment.dueDate}` : ""}</small></div><StatusPill tone={assignment.status==="Complete"?"success":assignment.status==="In progress"?"warning":"neutral"}>{assignment.status}</StatusPill></article>;})}{!training.length&&<p>No training assignments.</p>}</div>
            </div>
          </Section>

          <Section title="Recent employee audit activity" description="Latest system events where this employee acted or was the related employee.">
            <div className="admin-profile-record-list">{employeeEvents.slice(0,30).map((event)=><article key={event.id}><ShieldCheck size={16}/><div><strong>{event.summary || event.action}</strong><p>{event.module} · {event.collection} · {formatDate(event.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</p></div><StatusPill tone="neutral">{event.action}</StatusPill></article>)}{!employeeEvents.length&&<div className="employee-directory-empty">No employee-linked audit events yet.</div>}</div>
          </Section>
        </>}
      </main>
    </div>
  </div>;
}
