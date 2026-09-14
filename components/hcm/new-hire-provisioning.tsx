"use client";

import { CheckCircle2, Copy, KeyRound, MailCheck, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { generateTemporaryPassword, validateTemporaryPassword } from "../../lib/firebase-admin-provisioning";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { useHcm } from "../../lib/hcm-context";
import type { PayBasis, WorkerClassification } from "../../lib/hcm-engine";
import { useIdentityProvisioning, type NewProvisioningDraftInput } from "../../lib/identity-provisioning-context";
import type { ProvisionableRole, ProvisioningDraft } from "../../lib/identity-provisioning";
import { isFailClosedPlaceholder } from "../../lib/identity-provisioning";
import { buildProvisionedWorkspaceUser, managerOptionsForProvisioning, validateInternalUserProvisioning } from "../../lib/workspace-user-provisioning";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section, StatusPill, formatMoney } from "../ui";

type WorkerType = "Employee" | "Contractor";
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
  workerType: WorkerType;
  payBasis: PayBasis;
  payRate: string;
  payGroup: string;
  standardWeeklyHours: string;
  startDate: string;
  courseIds: string[];
};

const teamForRole = (role: ProvisionableRole): "Sales" | "Operations" => ["Sales Manager", "Sales Representative"].includes(role) ? "Sales" : "Operations";
const roleOptions: ProvisionableRole[] = ["Sales Representative", "Sales Manager", "Operations", "Warehouse"];
const payBasisOptions: PayBasis[] = ["Hourly", "Salary per pay period", "Not configured"];
const classificationFor = (workerType: WorkerType, payBasis: PayBasis): WorkerClassification => workerType === "Contractor" ? "Contractor" : payBasis === "Hourly" ? "Hourly" : payBasis === "Salary per pay period" ? "Salary" : "Not configured";

export function NewHireProvisioning() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const provisioning = useIdentityProvisioning();
  const firebase = useFirebaseSessionOptional();
  const [notice, setNotice] = useState("");
  const [identityDraft, setIdentityDraft] = useState<{ draftId: string; password: string; busy: boolean; error: string } | null>(null);
  const [issued, setIssued] = useState<{ draftId: string; email: string; password: string; name: string } | null>(null);
  const [pendingLink, setPendingLink] = useState<{ draftId: string; uid: string } | null>(null);
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
    workerType: "Employee",
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

  // Once the new identity reaches the directory, link the draft and open onboarding.
  useEffect(() => {
    if (!pendingLink) return;
    const user = data.users.find((item) => item.id === pendingLink.uid);
    if (!user) return;
    const handle = window.setTimeout(() => {
      const linked = provisioning.beginOnboarding({ userId: user.id, draftId: pendingLink.draftId });
      setNotice(linked
        ? `${user.name} now has a Firebase identity and is ready to begin onboarding.`
        : "The identity exists but onboarding could not be opened. Use “Link & start onboarding” on this hire.");
      setPendingLink(null);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data.users, pendingLink, provisioning]);

  if (currentUser?.role !== "Administrator") return null;

  const startIdentityCreation = (draft: ProvisioningDraft) => { setIssued(null); setIdentityDraft({ draftId: draft.id, password: generateTemporaryPassword(), busy: false, error: "" }); };

  const createIdentity = async (draft: ProvisioningDraft) => {
    if (!firebase || !identityDraft || identityDraft.busy) return;
    const invalid = validateTemporaryPassword(identityDraft.password);
    if (invalid) { setIdentityDraft({ ...identityDraft, error: invalid }); return; }
    const input = { name: draft.legalName, email: draft.workEmail, title: draft.jobTitle, role: draft.role, team: draft.team, managerId: draft.managerId };
    const validation = validateInternalUserProvisioning(data, input);
    if (validation) { setIdentityDraft({ ...identityDraft, error: validation }); return; }
    setIdentityDraft({ ...identityDraft, busy: true, error: "" });
    const user = buildProvisionedWorkspaceUser(data, input, "pending-firebase-uid");
    const result = await firebase.createEmployeeAccount({ user, temporaryPassword: identityDraft.password });
    if (!result.ok || !result.uid) {
      // Naming the failing stage matters: a Firestore rejection means recover the hire, never recreate it.
      const guidance = result.stage === "firestore-access"
        ? " The Firebase identity survived — reopen this hire here to finish it instead of creating it again."
        : result.stage === "authorization" ? " Ask an active Administrator to provision this account." : "";
      setIdentityDraft({ ...identityDraft, busy: false, error: `${result.message ?? "Identity creation failed."}${guidance}` });
      return;
    }
    if (draft.status === "Ready to invite") provisioning.markDraftInviteSent(draft.id);
    setIssued({ draftId: draft.id, email: draft.workEmail, password: identityDraft.password, name: draft.legalName });
    if (result.outcome === "recovered") setNotice(`An unfinished Firebase identity for ${draft.workEmail} was recovered rather than duplicated. Its password has been reset to the temporary password below.`);
    if (result.outcome === "already-provisioned") setNotice(`${draft.workEmail} already had a complete Momentum account. Nothing was changed.`);
    setPendingLink({ draftId: draft.id, uid: result.uid });
    setIdentityDraft(null);
  };

  const copyPassword = async () => { if (issued && typeof navigator !== "undefined" && navigator.clipboard) { await navigator.clipboard.writeText(issued.password).catch(() => undefined); setNotice("Temporary password copied. Share it through a secure channel only."); } };
  const sendResetInstead = async () => { if (!firebase || !issued) return; const result = await firebase.sendPasswordReset(issued.email); setNotice(result.message ?? (result.ok ? "Password setup e-mail sent." : "Could not send the e-mail.")); };

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
    if (!match) {
      setForm((current) => ({ ...current, source: "Direct hire", offerId: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      source: "Accepted offer",
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
      classification: classificationFor(form.workerType, form.payBasis),
      payBasis: form.payBasis,
      payRate,
      payGroup: form.payGroup,
      standardWeeklyHours: hours,
      startDate: form.startDate,
      courseIds: form.courseIds,
    };
    const id = provisioning.saveDraft(input);
    setNotice(id ? "New-hire setup saved. Ready for identity provisioning." : "Setup was not saved. Check the required fields, reporting line, pay setup, dates, and duplicate email.");
  };

  const startExistingOnboarding = (draft: ProvisioningDraft) => {
    const matchingUser = data.users.find((user) => user.email.toLowerCase() === draft.workEmail.toLowerCase() && user.role !== "Administrator" && user.role !== "Customer");
    if (!matchingUser) { setNotice("No linked identity exists yet. Create the Firebase identity for this hire first."); return; }
    if (!provisioning.beginOnboarding({ userId: matchingUser.id, draftId: draft.id })) {
      const record = provisioning.state.records.find((item) => item.userId === matchingUser.id);
      const started = record && !isFailClosedPlaceholder(record) && record.state !== "Password change required";
      setNotice(started
        ? `${matchingUser.name} is already past the password change (${record!.state}). Nothing to restart.`
        : "The identity could not be linked to this onboarding setup. Confirm the work e-mail matches the Firebase account.");
      return;
    }
    setNotice(`${matchingUser.name} is ready to begin onboarding.`);
  };

  return <div className="new-hire-provisioning">
    <Section title="New hire account setup" description="Configure the employee before credentials are issued." action={<StatusPill tone="gold"><ShieldCheck size={14}/> Admin controlled</StatusPill>}>
      <div className="provisioning-banner"><KeyRound size={22}/><div><strong>Administrator accounts are bootstrap-only</strong><p>Normal employee setup cannot create an Administrator account.</p></div></div>
      <form className="provisioning-form" onSubmit={save}>
        <div className="provisioning-section"><h3>1. Identity</h3><div className="form-grid">
          {acceptedOffers.length > 0 && <Field label="Prefill from accepted offer (optional)"><select value={form.offerId} onChange={(event) => selectOffer(event.target.value)}><option value="">Enter manually</option>{acceptedOffers.map(({ offer, candidate }) => <option key={offer.id} value={offer.id}>{candidate!.name} · {offer.title}</option>)}</select></Field>}
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
          <Field label="Standard weekly hours"><input type="number" min="0" max="168" step="0.25" value={form.standardWeeklyHours} onChange={(event) => setForm((current) => ({ ...current, standardWeeklyHours: event.target.value }))} placeholder="If applicable"/></Field>
        </div></div>

        <div className="provisioning-section"><h3>3. Pay and tax setup</h3><div className="form-grid">
          <Field label="Worker type (tax forms)"><select value={form.workerType} onChange={(event) => setForm((current) => ({ ...current, workerType: event.target.value as WorkerType }))}><option>Employee</option><option>Contractor</option></select></Field>
          <Field label="Pay basis"><select value={form.payBasis} onChange={(event) => setForm((current) => ({ ...current, payBasis: event.target.value as PayBasis, payRate: event.target.value === "Not configured" ? "" : current.payRate }))}>{payBasisOptions.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label={form.payBasis === "Hourly" ? "Hourly rate" : form.payBasis === "Salary per pay period" ? "Salary per pay period" : "Pay rate"}><input type="number" min="0" step="0.01" disabled={form.payBasis === "Not configured"} required={form.payBasis !== "Not configured"} value={form.payRate} onChange={(event) => setForm((current) => ({ ...current, payRate: event.target.value }))}/></Field>
          <Field label="Pay group"><input required value={form.payGroup} onChange={(event) => setForm((current) => ({ ...current, payGroup: event.target.value }))} placeholder="Weekly, biweekly, etc."/></Field>
        </div></div>

        <div className="provisioning-section"><h3>4. Required training</h3><p className="provisioning-help">Choose the courses this employee needs. Training deadlines can be added after company policy is confirmed.</p><div className="training-picker">{activeCourses.map((course) => <label key={course.id}><input type="checkbox" checked={form.courseIds.includes(course.id)} onChange={() => toggleCourse(course.id)}/><span><strong>{course.title}</strong><small>{course.description}</small></span></label>)}</div></div>
        {notice && <div className="form-callout"><p>{notice}</p></div>}
        <div className="provisioning-actions"><Button type="submit" icon={<UserPlus size={16}/>}>Save new-hire setup</Button></div>
      </form>
    </Section>

    <Section title="Provisioning queue" description={firebase ? "Prepared employee accounts. Create the Firebase identity here; the employee signs in with a temporary password and must change it before onboarding." : "Prepared employee accounts waiting for identity or onboarding steps."} action={<StatusPill tone="neutral">{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length} setup{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length === 1 ? "" : "s"}</StatusPill>}>
      {issued && <div className="temp-password" role="status"><strong>{issued.name} · {issued.email}</strong><span>Temporary password (shown once). The employee must change it at first sign-in.</span><code>{issued.password}</code><div className="provisioning-row-actions"><Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={() => void copyPassword()}>Copy</Button><Button size="sm" variant="ghost" icon={<MailCheck size={14}/>} onClick={() => void sendResetInstead()}>E-mail a password setup link instead</Button><Button size="sm" variant="ghost" onClick={() => setIssued(null)}>Dismiss</Button></div></div>}
      <div className="provisioning-queue">{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").map((draft) => {
        const manager = data.users.find((user) => user.id === draft.managerId);
        const matchingUser = data.users.find((user) => user.email.toLowerCase() === draft.workEmail.toLowerCase() && user.role !== "Administrator" && user.role !== "Customer");
        const creating = identityDraft?.draftId === draft.id;
        return <article key={draft.id}><span className="provisioning-avatar"><UsersRound size={18}/></span><div><strong>{draft.legalName}</strong><p>{draft.jobTitle} · {draft.team} · reports to {manager?.name ?? "Unresolved manager"}</p><small>{draft.workEmail} · starts {draft.startDate}{draft.payRate ? ` · ${draft.payBasis} ${formatMoney(draft.payRate)}` : " · compensation pending"}</small>{creating && identityDraft && <form className="access-gate-form" onSubmit={(event) => { event.preventDefault(); void createIdentity(draft); }}><label><span>Temporary password</span><input value={identityDraft.password} onChange={(event) => setIdentityDraft({ ...identityDraft, password: event.target.value, error: "" })} autoComplete="off"/></label>{identityDraft.error && <p className="form-error" role="alert">{identityDraft.error}</p>}<div className="provisioning-row-actions"><Button size="sm" type="submit" disabled={identityDraft.busy} icon={<KeyRound size={14}/>}>{identityDraft.busy ? "Creating…" : "Create identity & access record"}</Button><Button size="sm" variant="ghost" type="button" onClick={() => setIdentityDraft(null)}>Cancel</Button></div></form>}</div><StatusPill tone={draft.status === "Auth linked" ? "success" : draft.status === "Invite sent" ? "info" : "warning"}>{draft.status}</StatusPill><div className="provisioning-row-actions">{matchingUser ? <Button size="sm" variant="secondary" onClick={() => startExistingOnboarding(draft)}>Link & start onboarding</Button> : firebase ? <Button size="sm" variant="secondary" disabled={creating} icon={<KeyRound size={14}/>} onClick={() => startIdentityCreation(draft)}>Create Firebase identity</Button> : <Button size="sm" variant="secondary" disabled title="Available in production mode with Firebase connected">Firebase identity required</Button>}<Button size="sm" variant="ghost" onClick={() => provisioning.cancelDraft(draft.id)}>Cancel</Button></div></article>;
      })}{provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled").length === 0 && <div className="review-empty"><UserPlus size={24}/><h3>No new-hire setups yet</h3><p>Create an employee setup before issuing credentials.</p></div>}</div>
    </Section>

    {pendingApprovals.length > 0 && <Section title="Onboarding approval queue" description="Review completed onboarding before activating access."><div className="provisioning-queue">{pendingApprovals.map((record) => { const user = data.users.find((item) => item.id === record.userId); return <article key={record.id}><span className="provisioning-avatar"><CheckCircle2 size={18}/></span><div><strong>{user?.name ?? record.userId}</strong><p>Onboarding submitted for final review.</p></div><StatusPill tone="warning">Pending approval</StatusPill><Button size="sm" onClick={() => provisioning.activateUser(record.userId)}>Verify & activate</Button></article>; })}</div></Section>}
  </div>;
}
