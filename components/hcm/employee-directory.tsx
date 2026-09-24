"use client";

import { BarChart3, BriefcaseBusiness, Building2, CalendarClock, Clock3, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useAudit } from "../../lib/audit-context";
import { useDelivery } from "../../lib/delivery-context";
import {
  appointmentPunctualityEvidence,
  averageRecordedVariance,
  canViewEmployeeManagementDetail,
  currentOrNextShift,
  employeePresence,
  lastRecordedEmployeeActivity,
  shiftClockInEvidence,
} from "../../lib/employee-profile";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { appendAudit, type ProfileChangeRequest } from "../../lib/hcm-engine";
import { useHcm } from "../../lib/hcm-context";
import { useFieldTracking } from "../../lib/location-tracking-context";
import { calculateManagementKpi, formatKpiValue, kpiPresetPeriod, managementKpiDefinition, type ManagementKpiKey } from "../../lib/management-kpi";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Field, Section, StatusPill, formatDate, hoursBetween } from "../ui";

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
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

export function EmployeeDirectory() {
  const { data, currentUser, navigate } = useWorkspace();
  const firebase = useFirebaseSessionOptional();
  const { hcm, setHcm } = useHcm();
  const delivery = useDelivery().state;
  const tracking = useFieldTracking();
  const { audit } = useAudit();
  const [query, setQuery] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const focusId = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null;
  const focusedEmployee = focusId ? data.users.find((user) => user.id === focusId && user.role !== "Customer") : undefined;
  const [selectedId, setSelectedId] = useState(focusedEmployee?.id ?? currentUser?.id ?? "");

  const employees = useMemo(() => data.users.filter((user) => user.role !== "Customer").sort((a, b) => a.name.localeCompare(b.name)), [data.users]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((user) => [user.name, user.title, user.team, user.email, user.phone ?? ""].some((value) => value.toLowerCase().includes(needle)));
  }, [employees, query]);

  const selected = employees.find((user) => user.id === selectedId) ?? employees[0];
  if (!currentUser || !selected) return null;

  const employment = hcm.employees.find((record) => record.userId === selected.id);
  const manager = data.users.find((user) => user.id === (employment?.managerId ?? selected.managerId));
  const presence = employeePresence(data, selected.id);
  const ordinaryActivity = lastRecordedEmployeeActivity(data, tracking.state, audit.events, selected.id);
  const deliveryActivity = delivery.tasks
    .filter((task) => task.driverId === selected.id)
    .flatMap((task) => task.history.map((event) => ({ at: event.at, label: `Delivery ${event.type.toLowerCase()}` })))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  const lastActivity = [ordinaryActivity, deliveryActivity].filter(Boolean).sort((a, b) => new Date(b!.at).getTime() - new Date(a!.at).getTime())[0];
  const nextShift = currentOrNextShift(hcm, selected.id);
  const managementDetail = canViewEmployeeManagementDetail(currentUser, selected, data);
  const adminPrivate = currentUser.role === "Administrator";
  const selfSelected = currentUser.id === selected.id;
  const period = kpiPresetPeriod("30d");
  const appointmentEvidence = appointmentPunctualityEvidence(data, tracking.state, selected.id, period.start, period.end);
  const shiftEvidence = shiftClockInEvidence(data, hcm, selected.id, period.start, period.end);
  const arrivalVariance = averageRecordedVariance(appointmentEvidence);
  const clockVariance = averageRecordedVariance(shiftEvidence);
  const currentWeekEntries = data.timeEntries.filter((entry) => entry.userId === selected.id && entry.date >= kpiPresetPeriod("7d").start);
  const currentWeekHours = currentWeekEntries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);
  const openAppointments = data.appointments.filter((appointment) => appointment.ownerId === selected.id && appointment.status !== "Completed").length;
  const ownedAccounts = data.accounts.filter((account) => account.ownerId === selected.id).length;
  const openTraining = adminPrivate ? hcm.training.filter((assignment) => assignment.userId === selected.id && assignment.status !== "Complete").length : 0;
  const missingDocuments = adminPrivate ? hcm.documents.filter((document) => document.userId === selected.id && ["Missing", "Acknowledgment required"].includes(document.status)).length : 0;
  const isSales = selected.role === "Sales Representative" || selected.role === "Sales Manager";
  const privateProfile = hcm.privateProfiles.find((profile) => profile.userId === selected.id);
  const pendingContactRequest = hcm.profileChangeRequests.find((request) => request.userId === selected.id && request.status === "Submitted" && ["phone", "address", "emergencyContact"].includes(request.field));

  const submitAdminEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firebase || !adminPrivate) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim() || selected.title;
    const phone = String(form.get("phone") ?? "").trim();
    const department = String(form.get("department") ?? "").trim() || employment?.department || selected.team;
    const location = String(form.get("location") ?? "").trim();
    const managerId = String(form.get("managerId") ?? "").trim() || undefined;
    const hoursRaw = String(form.get("standardWeeklyHours") ?? "").trim();
    const standardWeeklyHours = hoursRaw ? Number(hoursRaw) : undefined;
    if (standardWeeklyHours !== undefined && (!Number.isFinite(standardWeeklyHours) || standardWeeklyHours < 0 || standardWeeklyHours > 168)) {
      setEditMessage("Weekly hours must be between 0 and 168.");
      return;
    }

    const accessResult = await firebase.updateUserAccess(selected.id, { title, phone, managerId });
    if (!accessResult.ok) {
      setEditMessage(accessResult.message ?? "Employee access profile could not be updated.");
      return;
    }

    if (employment) {
      const at = now();
      setHcm((state) => appendAudit({
        ...state,
        employees: state.employees.map((record) => record.userId === selected.id ? {
          ...record,
          jobTitle: title,
          department,
          location,
          managerId,
          standardWeeklyHours,
          updatedAt: at,
        } : record),
      }, {
        actorId: currentUser.id,
        action: "Employee profile updated",
        entityType: "EmploymentRecord",
        entityId: selected.id,
        reason: "Administrator directory edit",
      }));
      setEditMessage("Employee profile updated.");
    } else {
      setEditMessage("Directory access details were updated. This employee does not yet have an HR employment record for department, location, or weekly hours.");
    }
  };

  const submitContactRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selfSelected) return;
    const form = new FormData(event.currentTarget);
    const requests: ProfileChangeRequest[] = [];
    const submittedAt = now();
    const fields: Array<{ key: ProfileChangeRequest["field"]; value: string; current?: string }> = [
      { key: "phone", value: String(form.get("phone") ?? "").trim(), current: privateProfile?.phone ?? selected.phone },
      { key: "address", value: String(form.get("address") ?? "").trim(), current: privateProfile?.address },
      { key: "emergencyContact", value: String(form.get("emergencyContact") ?? "").trim(), current: privateProfile?.emergencyContact },
    ];
    fields.forEach(({ key, value, current }) => {
      if (!value || value === (current ?? "")) return;
      requests.push({
        id: uid("profile-change"),
        userId: currentUser.id,
        field: key,
        currentValue: current,
        requestedValue: value,
        reason: "Employee profile update",
        submittedAt,
        status: "Submitted",
      });
    });
    if (!requests.length) {
      setContactMessage("Enter a new value before submitting.");
      return;
    }
    setHcm((state) => requests.reduce((next, request) => appendAudit({ ...next, profileChangeRequests: [request, ...next.profileChangeRequests] }, {
      actorId: currentUser.id,
      action: "Contact information update submitted",
      entityType: "ProfileChangeRequest",
      entityId: request.id,
      reason: request.field,
    }), state));
    setContactMessage("Contact information sent for review.");
  };

  return <section className="employee-directory-shell" aria-label="Employee directory and profiles">
    <div className="employee-directory-heading">
      <div><span><UsersRound size={20}/></span><div><small>Company directory</small><h2>Employee profiles</h2><p>Find coworkers by name, position, department, manager, and work setup.</p></div></div>
      <StatusPill tone="info">{employees.length} employee{employees.length === 1 ? "" : "s"}</StatusPill>
    </div>

    <div className="employee-directory-layout">
      <aside className="employee-directory-list">
        <label className="employee-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, title, department…"/></label>
        <div>{filtered.map((user) => {
          const record = hcm.employees.find((item) => item.userId === user.id);
          const status = employeePresence(data, user.id);
          return <button key={user.id} className={selected.id === user.id ? "is-selected" : ""} onClick={() => { setSelectedId(user.id); setEditMessage(""); setContactMessage(""); }}>
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
          <article><Phone size={17}/><div><small>Work phone</small><strong>{selected.phone ?? "Not configured"}</strong></div></article>
          <article><Building2 size={17}/><div><small>Department</small><strong>{employment?.department ?? selected.team}</strong></div></article>
          <article><BriefcaseBusiness size={17}/><div><small>Manager</small><strong>{manager?.name ?? "Not configured"}</strong></div></article>
          <article><MapPin size={17}/><div><small>Work location</small><strong>{employment?.location || "Not configured"}</strong></div></article>
          <article><CalendarClock size={17}/><div><small>Work hours</small><strong>{employment?.standardWeeklyHours !== undefined ? `${employment.standardWeeklyHours} hrs / week` : nextShift ? `${nextShift.startTime}–${nextShift.endTime} next shift` : "Not configured"}</strong></div></article>
          <article><Clock3 size={17}/><div><small>Last recorded activity</small><strong>{lastActivity ? formatDate(lastActivity.at, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "No recorded activity"}</strong><span>{lastActivity?.label ?? "No recorded work activity yet."}</span></div></article>
        </div>

        {!managementDetail && <div className="employee-profile-public-note"><UserRound size={17}/><p>Private HR, pay, training, documents, location trails, and performance records are not shown in the coworker directory.</p></div>}

        {selfSelected && !adminPrivate && <Section title="My contact information" description="Submit changes to your phone, address, or emergency contact. HR/Admin review keeps the employee record controlled.">
          <form className="form-grid employee-profile-edit-form" onSubmit={submitContactRequest}>
            <Field label="Phone"><input name="phone" defaultValue={privateProfile?.phone ?? selected.phone ?? ""} placeholder="602-555-0000"/></Field>
            <Field label="Address"><input name="address" defaultValue={privateProfile?.address ?? ""} placeholder="Street, city, state, ZIP"/></Field>
            <Field label="Emergency contact"><input name="emergencyContact" defaultValue={privateProfile?.emergencyContact ?? ""} placeholder="Name and phone"/></Field>
            <div className="field--full employee-profile-edit-actions"><Button type="submit" size="sm">Submit contact update</Button>{pendingContactRequest && <StatusPill tone="warning">Update pending review</StatusPill>}{contactMessage && <p>{contactMessage}</p>}</div>
          </form>
        </Section>}

        {adminPrivate && firebase && <Section title="Edit employee profile" description="Administrators can maintain the employee's operational profile. Role and account-state controls remain in Administration.">
          <form key={`${selected.id}-${employment?.updatedAt ?? "directory"}`} className="form-grid employee-profile-edit-form" onSubmit={submitAdminEdit}>
            <Field label="Job title"><input name="title" defaultValue={employment?.jobTitle ?? selected.title}/></Field>
            <Field label="Work phone"><input name="phone" defaultValue={selected.phone ?? ""} placeholder="602-555-0000"/></Field>
            <Field label="Department"><input name="department" defaultValue={employment?.department ?? selected.team}/></Field>
            <Field label="Manager"><select name="managerId" defaultValue={employment?.managerId ?? selected.managerId ?? ""}><option value="">Not assigned</option>{employees.filter((user) => user.id !== selected.id && ["Administrator", "Sales Manager"].includes(user.role)).map((user) => <option value={user.id} key={user.id}>{user.name} · {user.title}</option>)}</select></Field>
            <Field label="Work location"><input name="location" defaultValue={employment?.location ?? ""} placeholder="Phoenix office, field, warehouse…"/></Field>
            <Field label="Standard weekly hours"><input name="standardWeeklyHours" type="number" min="0" max="168" step="0.25" defaultValue={employment?.standardWeeklyHours ?? ""}/></Field>
            <div className="field--full employee-profile-edit-actions"><Button type="submit" size="sm">Save employee profile</Button>{editMessage && <p>{editMessage}</p>}</div>
          </form>
        </Section>}

        {managementDetail && <>
          <div className="employee-manager-banner"><ShieldCheck size={18}/><div><strong>{adminPrivate ? "Administrator view" : "Manager view"}</strong><p>Operational detail is source-linked. Private HR and pay records remain Administrator-only.</p></div><StatusPill tone="gold">Last 30 days</StatusPill></div>

          <div className="employee-manager-summary">
            <article><small>Recent hours recorded</small><strong>{currentWeekHours.toFixed(2)}</strong><span>Last 7 calendar days</span></article>
            <article><small>Open appointments</small><strong>{openAppointments}</strong><span>Assigned work not completed</span></article>
            <article><small>Responsible accounts</small><strong>{ownedAccounts}</strong><span>Current CRM responsibility</span></article>
            {adminPrivate && <article><small>Private HR action items</small><strong>{openTraining + missingDocuments}</strong><span>{openTraining} training · {missingDocuments} documents</span></article>}
          </div>

          {isSales && <Section title="Source-linked sales KPIs" description="Management reference data only. Scorecard weighting and final performance judgment remain a manager responsibility." className="employee-profile-kpis">
            <div className="employee-profile-kpi-grid">{managerSalesMetrics.map((key) => {
              const definition = managementKpiDefinition(key);
              const result = calculateManagementKpi(key, data, period, [selected.id], tracking.state);
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
