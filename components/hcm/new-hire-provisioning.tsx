"use client";

import { CheckCircle2, KeyRound, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { useHcm } from "../../lib/hcm-context";
import type { PayBasis, WorkerClassification } from "../../lib/hcm-engine";
import { useIdentityProvisioning, type NewProvisioningDraftInput } from "../../lib/identity-provisioning-context";
import type { ProvisionableRole, ProvisioningDraft } from "../../lib/identity-provisioning";
import { managerOptionsForProvisioning } from "../../lib/workspace-user-provisioning";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section, StatusPill, formatMoney } from "../ui";

type FormState = {
  source: ProvisioningDraft["source"];
  offerId: string;
  legalName: string;
  preferredName: string;
  workEmail: string;
  jobTitle: string;
  role: ProvisionableRole;
  managerId: string;
  workLocation: string;
  classification: WorkerClassification;
  payBasis: PayBasis;
  payRate: string;
  payGroup: string;
  standardWeeklyHours: string;
  startDate: string;
  courseIds: string[];
};

const teamForRole = (role: ProvisionableRole): "Sales" | "Operations" => ["Sales Manager", "Sales Representative"].includes(role) ? "Sales" : "Operations";
const roleOptions: ProvisionableRole[] = ["Sales Representative", "Sales Manager", "Operations", "Warehouse"];
const classificationOptions: WorkerClassification[] = ["Hourly", "Salary", "Contractor", "Not configured"];
const payBasisOptions: PayBasis[] = ["Hourly", "Salary per pay period", "Not configured"];

export function NewHireProvisioning() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const provisioning = useIdentityProvisioning();
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<FormState>(() => ({
    source: "Direct hire",
    offerId: "",
    legalName: "",
    preferredName: "",
    workEmail: "",
    jobTitle: "Sales Representative",
    role: "Sales Representative",
    managerId: data.users.find((user) => user.role === "Sales Manager")?.id ?? data.users.find((user) => user.role === "Administrator")?.id ?? "",
    workLocation: "Phoenix, AZ",
    classification: "Not configured",
    payBasis: "Not configured",
    payRate: "",
    payGroup: "Not configured",
    standardWeeklyHours: "",
    startDate: arizonaDateKey(),
    courseIds: hcm.courses.filter((course) => course.active && course.requiredForTeams.includes("Sales")).map((course) => course.id),
  }));

  const acceptedOffers = useMemo(() => hcm.offers.filter((offer) => offer.status === "Accepted").map((offer) => ({ offer, candidate: hcm.candidates.find((candidate) => candidate.id === offer.candidateId) })).filter((item) => item.candidate), [hcm.candidates, hcm.offers]);
  const team = teamForRole(form.role);
  const managers = managerOptionsForProvisioning(data, form.role);
  const activeCourses = hcm.courses.filter((course) => course.active);
  const pendingApprovals = provisioning.state.records.filter((record) => record.state === "Pending approval");

  if (currentUser?.role !== "Administrator") return null;

  const setRole = (role: ProvisionableRole) => {
    const nextTeam = teamForRole(role);
    const nextManagers = managerOptionsForProvisioning(data, role);
    setForm((current) => ({
      ...current,
      role,
      jobTitle: current.jobTitle === "Sales Representative" || current.jobTitle === "Sales Manager" || current.jobTitle === "Operations" || current.jobTitle === "Warehouse" ? role : current.jobTitle,
      managerId: nextManagers.some((manager) => manager.id === current.managerId) ? current.managerId : nextManagers[0]?.id ?? "",
      courseIds: hcm.courses.filter((course) => course.active && course.requiredForTeams.includes(nextTeam)).map((course) => course.id),
    }));
  };

  const selectOffer = (offerId: string) => {
    const match = acceptedOffers.find((item) => item.offer.id === offerId);
    if (!match) { setForm((current) => ({ ...current, offerId })); return; }
    setForm((current) => ({
      ...current,
      offerId,
      legalName: match.candidate!.name,
      workEmail: match.candidate!.email,
      jobTitle: match.offer.title,
      payBasis: match.offer.basis,
      payRate: match.offer.rate > 0 ? String(match.offer.rate) : "",
      startDate: match.offer.startDate,
    }));
  };

  const toggleCourse = (courseId: string) => setForm((current) => ({ ...current, courseIds: current.courseIds.includes(courseId) ? current.courseIds.filter((id) => id !== courseId) : [...current.courseIds, courseId] }));

  const save = (event: FormEvent) => {
    event.preventDefault();
    const payRate = form.payRate.trim() ? Number(form.payRate) : undefined;
    const hours = form.standardWeeklyHours.trim() ? Number(form.standardWeeklyHours) : undefined;
    const input: NewProvisioningDraftInput = {
      source: form.source,
      candidateId: form.source === "Accepted offer" ? acceptedOffers.find((item) => item.offer.id === form.offerId)?.candidate?.id : undefined,
      offerId: form.source === "Accepted offer" ? form.offerId || undefined : undefined,
      legalName: form.legalName,
      preferredName: form.preferredName || undefined,
      workEmail: form.workEmail,
      jobTitle: form.jobTitle,
      role: form.role,
      team,
      managerId: form.managerId,
      workLocation: form.workLocation,
      classification: form.classification,
      payBasis: form.payBasis,
      payRate,
      payGroup: form.payGroup,
      standardWeeklyHours: hours,
      startDate: form.startDate,
      courseIds: form.courseIds,
    };
    const id = provisioning.saveDraft(input);
    setNotice(id ? "New-hire setup saved. The record is ready for Firebase identity provisioning." : "Setup was not saved. Check identity, reporting line, compensation, dates, and duplicate email." );
  };

  const startExistingDemoOnboarding = (draft: ProvisioningDraft) => {
    const matchingUser = data.users.find((user) => user.email.toLowerCase() === draft.workEmail.toLowerCase() && user.role !== "Administrator" && user.role !== "Customer");
    if (!matchingUser) { setNotice("No linked Firebase/workspace identity exists yet. Create the identity through the trusted Firebase admin service first."); return; }
    const linked = draft.status === "Auth linked" || provisioning.linkDraftToUser(draft.id, matchingUser.id);
    if (!linked || !provisioning.beginOnboarding({ userId: matchingUser.id, draftId: draft.id })) { setNotice("The identity could not be linked to this onboarding setup."); return; }
    setNotice(`${matchingUser.name} is now restricted to onboarding until every required item is complete and an Administrator activates access.`);
  };

  return <div className="new-hire-provisioning">
    <Section title="New hire account setup" description="Administrator-only provisioning. Configure the employee before Firebase credentials are issued." action={<StatusPill tone="gold"><ShieldCheck size={14}/> Admin controlled</StatusPill>}>
      <div className="provisioning-banner"><KeyRound size={22}/><div><strong>Owner accounts are bootstrap-only</strong><p>The normal employee flow can never create an Administrator. The two owner-level accounts must be pre-authorized during Firebase bootstrap, then bootstrap is sealed.</p></div></div>
      <form className="provisioning-form" onSubmit={save}>
        <div className="provisioning-section"><h3>1. Hiring source and identity</h3><div className="form-grid">
          <Field label="Hiring source"><select value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as ProvisioningDraft["source"], offerId: "" }))}><option>Direct hire</option><option>Accepted offer</option></select></Field>
          {form.source === "Accepted offer" && <Field label="Accepted offer"><select required value={form.offerId} onChange={(event) => selectOffer(event.target.value)}><option value="">Choose accepted offer</option>{acceptedOffers.map(({ offer, candidate }) => <option key={offer.id} value={offer.id}>{candidate!.name} · {offer.title}</option>)}</select></Field>}
          <Field label="Legal name"><input required value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}/></Field>
          <Field label="Preferred name"><input value={form.preferredName} onChange={(event) => setForm((current) => ({ ...current, preferredName: event.target.value }))}/></Field>
          <Field label="Work email"><input type="email" required value={form.workEmail} onChange={(event) => setForm((current) => ({ ...current, workEmail: event.target.value }))}/></Field>
          <Field label="Start date"><input type="date" required value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}/></Field>
        </div></div>

        <div className="provisioning-section"><h3>2. Position and chain of command</h3><div className="form-grid">
          <Field label="Platform role"><select value={form.role} onChange={(event) => setRole(event.target.value as ProvisionableRole)}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></Field>
          <Field label="Department"><input value={team} readOnly aria-readonly="true"/></Field>
          <Field label="Position title"><input required value={form.jobTitle} onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}/></Field>
          <Field label="Reports to"><select required value={form.managerId} onChange={(event) => setForm((current) => ({ ...current, managerId: event.target.value }))}><option value="">Choose manager</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.title}</option>)}</select></Field>
          <Field label="Work location"><input required value={form.workLocation} onChange={(event) => setForm((current) => ({ ...current, workLocation: event.target.value }))}/></Field>
          <Field label="Standard weekly hours"><input type="number" min="0" max="168" step="0.25" value={form.standardWeeklyHours} onChange={(event) => setForm((current) => ({ ...current, standardWeeklyHours: event.target.value }))} placeholder="Configure if applicable"/></Field>
        </div></div>

        <div className="provisioning-section"><h3>3. Employment and compensation setup</h3><div className="form-grid">
          <Field label="Worker classification"><select value={form.classification} onChange={(event) => setForm((current) => ({ ...current, classification: event.target.value as WorkerClassification }))}>{classificationOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Pay basis"><select value={form.payBasis} onChange={(event) => setForm((current) => ({ ...current, payBasis: event.target.value as PayBasis, payRate: event.target.value === "Not configured" ? "" : current.payRate }))}>{payBasisOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label={form.payBasis === "Hourly" ? "Hourly rate" : form.payBasis === "Salary per pay period" ? "Salary per pay period" : "Pay rate"}><input type="number" min="0" step="0.01" disabled={form.payBasis === "Not configured"} required={form.payBasis !== "Not configured"} value={form.payRate} onChange={(event) => setForm((current) => ({ ...current, payRate: event.target.value }))}/></Field>
          <Field label="Pay group"><input required value={form.payGroup} onChange={(event) => setForm((current) => ({ ...current, payGroup: event.target.value }))} placeholder="e.g. Weekly, biweekly"/></Field>
        </div></div>

        <div className="provisioning-section"><h3>4. Required training</h3><p className="provisioning-help">Assignments are selected now. No due date is created until company policy is confirmed.</p><div className="training-picker">{activeCourses.map((course) => <label key={course.id}><input type="checkbox" checked={form.courseIds.includes(course.id)} onChange={() => toggleCourse(course.id)}/><span><strong>{course.title}</strong><small>{course.description}</small></span></label>)}</div></div>
        {notice && <div className="form-callout"><p>{notice}</p></div>}
        <div className="provisioning-actions"><Button type="submit" icon={<UserPlus size={16}/>}>Save new-hire setup</Button></div>
      </form>
    </Section>

    <Section title="Provisioning queue" description="Identity creation stays separate from role assignment so no employee can self-elevate permissions." action={<StatusPill tone="neutral">{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length} setup{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length === 1 ? "" : "s"}</StatusPill>}>
      <div className="provisioning-queue">{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").map((draft) => {
        const manager = data.users.find((user) => user.id === draft.managerId);
        const matchingUser = data.users.find((user) => user.email.toLowerCase() === draft.workEmail.toLowerCase() && user.role !== "Administrator" && user.role !== "Customer");
        return <article key={draft.id}><span className="provisioning-avatar"><UsersRound size={18}/></span><div><strong>{draft.legalName}</strong><p>{draft.jobTitle} · {draft.team} · reports to {manager?.name ?? "Unresolved manager"}</p><small>{draft.workEmail} · starts {draft.startDate}{draft.payRate ? ` · ${draft.payBasis} ${formatMoney(draft.payRate)}` : " · compensation pending"}</small></div><StatusPill tone={draft.status === "Auth linked" ? "success" : draft.status === "Invite sent" ? "info" : "warning"}>{draft.status}</StatusPill><div className="provisioning-row-actions">{matchingUser ? <Button size="sm" variant="secondary" onClick={() => startExistingDemoOnboarding(draft)}>Link & start onboarding</Button> : <Button size="sm" variant="secondary" disabled title="Requires trusted Firebase Admin identity creation">Firebase identity required</Button>}<Button size="sm" variant="ghost" onClick={() => provisioning.cancelDraft(draft.id)}>Cancel</Button></div></article>;
      })}{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length === 0 && <div className="review-empty"><UserPlus size={24}/><h3>No new-hire setups yet</h3><p>Create the employment setup here before issuing credentials.</p></div>}</div>
    </Section>

    {pendingApprovals.length > 0 && <Section title="Onboarding approval queue" description="Only fully evidenced onboarding can unlock operational access."><div className="provisioning-queue">{pendingApprovals.map((record) => { const user = data.users.find((item) => item.id === record.userId); return <article key={record.id}><span className="provisioning-avatar"><CheckCircle2 size={18}/></span><div><strong>{user?.name ?? record.userId}</strong><p>Employee submitted onboarding for Administrator review.</p></div><StatusPill tone="warning">Pending approval</StatusPill><Button size="sm" onClick={() => provisioning.activateUser(record.userId)}>Verify & activate</Button></article>; })}</div></Section>}
  </div>;
}
