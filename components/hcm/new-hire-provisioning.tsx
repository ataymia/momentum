"use client";

import { CheckCircle2, Copy, FileCheck2, KeyRound, LifeBuoy, MailCheck, ShieldAlert, ShieldCheck, UserPlus, UsersRound, Wrench } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { generateTemporaryPassword, validateTemporaryPassword } from "../../lib/firebase-admin-provisioning";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { useHcm } from "../../lib/hcm-context";
import { appendAudit, type PayBasis, type WorkerClassification } from "../../lib/hcm-engine";
import { useIdentityProvisioning, type NewProvisioningDraftInput } from "../../lib/identity-provisioning-context";
import type { ProvisionableRole, ProvisioningDraft } from "../../lib/identity-provisioning";
import { isFailClosedPlaceholder } from "../../lib/identity-provisioning";
import { onboardingReadiness, requiredOnboardingDocumentTemplates, type OnboardingRescueAction, type OnboardingRescueEntry } from "../../lib/onboarding-engine";
import { useTrainingLibrary } from "../../lib/training-library-context";
import { coursesForRoleAudience } from "../../lib/training-library-engine";
import { buildProvisionedWorkspaceUser, managerOptionsForProvisioning, validateInternalUserProvisioning } from "../../lib/workspace-user-provisioning";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatMoney } from "../ui";

type WorkerType = "Employee" | "Contractor";
type NewHireView = "create" | "queue";
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

const teamForRole = (role: ProvisionableRole): "Sales" | "Operations" => ["Sales Manager", "Sales Representative", "Brand Ambassador"].includes(role) ? "Sales" : "Operations";
const roleOptions: ProvisionableRole[] = ["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse"];
const defaultTitles = new Set<string>(["Sales Representative", "Sales Manager", "Brand Ambassador", "Operations", "Warehouse"]);
const payBasisOptions: PayBasis[] = ["Hourly", "Salary per pay period"];
const classificationFor = (workerType: WorkerType, payBasis: PayBasis): WorkerClassification => workerType === "Contractor" ? "Contractor" : payBasis === "Hourly" ? "Hourly" : payBasis === "Salary per pay period" ? "Salary" : "Not configured";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RESCUE_LABELS: Record<OnboardingRescueAction, string> = {
  repairIdentityRecord: "Repair identity record",
  repairOnboardingPackage: "Rebuild onboarding package",
  attestPasswordChange: "Attest password change",
  moveToOnboarding: "Move back to onboarding",
  advanceToReview: "Move to pending approval",
  returnForCorrections: "Return for corrections",
  activate: "Activate access",
  overrideAndActivate: "Override and force activation",
};
const RESCUE_HINTS: Record<OnboardingRescueAction, string> = {
  repairIdentityRecord: "Rebuilds the trusted provisioning record from the Firebase identity, the access record, and the saved new-hire setup.",
  repairOnboardingPackage: "Recreates any missing employment record, required documents, training assignments, or approved compensation.",
  attestPasswordChange: "Records that Firebase Authentication already holds a rotated password when Momentum missed the local evidence.",
  moveToOnboarding: "Reopens onboarding so the employee can finish the steps they control.",
  advanceToReview: "Sends a completed onboarding to the Administrator approval queue on the employee's behalf.",
  returnForCorrections: "Sends the employee back to onboarding with a correction note.",
  activate: "Normal activation. Available only when every readiness control is complete.",
  overrideAndActivate: "Operations override. Grants Active access now and records the reason. Unfinished documents, training, and forms stay truthfully incomplete.",
};
/** Actions that change access without the employee finishing their own steps. */
const RESCUE_DESTRUCTIVE = new Set<OnboardingRescueAction>(["overrideAndActivate"]);
const RESCUE_NEEDS_REASON = new Set<OnboardingRescueAction>(["repairIdentityRecord", "attestPasswordChange", "moveToOnboarding", "advanceToReview", "returnForCorrections", "overrideAndActivate"]);

function RescueCard({ entry }: { entry: OnboardingRescueEntry }) {
  const { data } = useWorkspace();
  const provisioning = useIdentityProvisioning();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<OnboardingRescueAction | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [armed, setArmed] = useState(false);
  const manager = data.users.find((user) => user.id === entry.user.managerId);
  const trimmed = reason.trim();

  const run = async (action: OnboardingRescueAction) => {
    if (busy) return;
    if (RESCUE_NEEDS_REASON.has(action) && trimmed.length < 5) { setResult({ tone: "bad", text: "Type the operational reason (at least 5 characters) before running this control." }); return; }
    setBusy(action);
    setResult(null);
    const userId = entry.user.id;
    const ok = action === "repairIdentityRecord" ? await provisioning.administratorRepairIdentityRecord(userId, trimmed)
      : action === "repairOnboardingPackage" ? provisioning.repairOnboardingPackage(userId)
      : action === "attestPasswordChange" ? await provisioning.administratorVerifyPasswordStep(userId, trimmed)
      : action === "moveToOnboarding" ? await provisioning.administratorMoveToOnboarding(userId, trimmed)
      : action === "advanceToReview" ? await provisioning.administratorAdvanceToReview(userId, trimmed)
      : action === "returnForCorrections" ? provisioning.returnForCorrections(userId, trimmed)
      : action === "activate" ? await provisioning.activateUser(userId)
      : await provisioning.administratorBypassAndActivate(userId, trimmed);
    setBusy(null);
    setArmed(false);
    setResult(ok
      ? { tone: "ok", text: `${RESCUE_LABELS[action]} completed for ${entry.user.name}. The action is recorded in the HCM audit trail.` }
      : { tone: "bad", text: `${RESCUE_LABELS[action]} was refused. The employee is not in a state this control can change, or the access record could not be written.` });
    if (ok) setReason("");
  };

  return <article className="onboarding-review-card onboarding-rescue-card">
    <span className="provisioning-avatar"><LifeBuoy size={18}/></span>
    <div className="onboarding-review-body">
      <strong>{entry.user.name}</strong>
      <p>{entry.user.title} · {entry.user.role} · {entry.user.team} · reports to {manager?.name ?? "Unresolved manager"}</p>
      <small>{entry.user.email}</small>
      <p className="onboarding-rescue-diagnosis">{entry.diagnosis}</p>
      {entry.missingTrustedRecord && <small className="onboarding-rescue-flag"><ShieldAlert size={13}/> No trusted identity provisioning record</small>}
      {entry.packageIncomplete && <small className="onboarding-rescue-flag"><Wrench size={13}/> Onboarding package incomplete</small>}
      {entry.passwordEvidenceMissing && <small className="onboarding-rescue-flag"><KeyRound size={13}/> Password-change evidence missing</small>}
      {entry.readiness.blockers.length > 0 && <ul className="onboarding-activation-blockers">{entry.readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
      <Field label="Reason (recorded in the audit trail)"><input value={reason} onChange={(event) => { setReason(event.target.value); setArmed(false); }} placeholder="Why this account is being changed"/></Field>
      <div className="provisioning-row-actions">{entry.actions.filter((action) => !RESCUE_DESTRUCTIVE.has(action)).map((action) =>
        <Button key={action} size="sm" variant={action === "activate" ? "primary" : "secondary"} disabled={busy !== null} title={RESCUE_HINTS[action]} onClick={() => void run(action)}>{busy === action ? "Working…" : RESCUE_LABELS[action]}</Button>)}</div>
      <div className="onboarding-rescue-override">
        <p><ShieldAlert size={14}/> {RESCUE_HINTS.overrideAndActivate}</p>
        {armed
          ? <div className="provisioning-row-actions"><Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void run("overrideAndActivate")}>{busy === "overrideAndActivate" ? "Activating…" : `Confirm forced activation of ${entry.user.name}`}</Button><Button size="sm" variant="ghost" onClick={() => setArmed(false)}>Cancel</Button></div>
          : <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => { if (trimmed.length < 5) { setResult({ tone: "bad", text: "Type the operational reason before overriding onboarding." }); return; } setResult(null); setArmed(true); }}>{RESCUE_LABELS.overrideAndActivate}</Button>}
      </div>
      {result && <p className={result.tone === "ok" ? "form-notice" : "form-error"} role={result.tone === "ok" ? "status" : "alert"}>{result.text}</p>}
    </div>
    <StatusPill tone={entry.state === "Active" ? "success" : entry.state === "Pending approval" ? "info" : entry.state === "Onboarding" ? "warning" : "danger"}>{entry.state}</StatusPill>
  </article>;
}

export function NewHireProvisioning({ view }: { view: NewHireView }) {
  const { data, currentUser, navigate } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const provisioning = useIdentityProvisioning();
  const trainingLibrary = useTrainingLibrary();
  const firebase = useFirebaseSessionOptional();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [identityDraft, setIdentityDraft] = useState<{ draftId: string; password: string; busy: boolean; error: string } | null>(null);
  const [issued, setIssued] = useState<{ draftId: string; email: string; password: string; name: string } | null>(null);
  const [pendingLink, setPendingLink] = useState<{ draftId: string; uid: string } | null>(null);
  const [activationBusy,setActivationBusy]=useState<string|null>(null);
  const coursesForRole = (role: ProvisionableRole, team: "Sales" | "Operations") => coursesForRoleAudience(hcm.courses, trainingLibrary.state.audiences, role, team).map((course) => course.id);
  const defaultCourses = coursesForRole("Sales Representative", "Sales");
  const emptyForm = (): FormState => ({
    source: "Direct hire",
    offerId: "",
    legalName: "",
    preferredName: "",
    workEmail: "",
    jobTitle: "Sales Representative",
    role: "Sales Representative",
    managerId: "",
    workLocation: "",
    workerType: "Employee",
    payBasis: "Not configured",
    payRate: "",
    payGroup: "",
    standardWeeklyHours: "",
    startDate: arizonaDateKey(),
    courseIds: defaultCourses,
  });
  const [form, setForm] = useState<FormState>(emptyForm);

  const acceptedOffers = useMemo(() => hcm.offers.filter((offer) => offer.status === "Accepted").map((offer) => ({ offer, candidate: hcm.candidates.find((candidate) => candidate.id === offer.candidateId) })).filter((item) => item.candidate), [hcm.candidates, hcm.offers]);
  const team = teamForRole(form.role);
  const managers = managerOptionsForProvisioning(data, form.role);
  const activeCourses = hcm.courses.filter((course) => course.active);
  const activeDrafts = provisioning.state.drafts.filter((draft) => draft.status !== "Cancelled");
  const pendingApprovals = provisioning.state.records.filter((record) => record.state === "Pending approval");
  const rescueQueue = provisioning.rescueQueue;

  // Once the new identity reaches the directory, link the draft and open onboarding.
  useEffect(() => {
    if (!pendingLink) return;
    const user = data.users.find((item) => item.id === pendingLink.uid);
    if (!user) return;
    const handle = window.setTimeout(() => {
      // One call: linking and opening onboarding must happen in a single state transition, or the
      // second half reads a draft status the first half has only queued.
      const started = provisioning.beginOnboarding({ userId: user.id, draftId: pendingLink.draftId });
      setNotice(started
        ? `${user.name} is ready for first sign-in and onboarding.`
        : "The Firebase account exists, but Momentum could not finish the onboarding link. Review the queue before trying again.");
      setPendingLink(null);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data.users, pendingLink, provisioning]);

  if (currentUser?.role !== "Administrator") return null;

  const validateStep = (targetStep: number) => {
    if (targetStep >= 1) {
      if (form.legalName.trim().length < 2) return "Enter the employee's legal name.";
      if (!emailPattern.test(form.workEmail.trim())) return "Enter a valid work email address.";
      const normalized = form.workEmail.trim().toLowerCase();
      const existingDraft = activeDrafts.find((draft) => draft.workEmail.toLowerCase() === normalized);
      if (data.users.some((user) => user.email.toLowerCase() === normalized)) return "That work email already belongs to a Momentum account.";
      if (existingDraft) return "That work email already has an open new-hire setup. Use the onboarding queue instead of creating another one.";
      if (!form.startDate) return "Choose a start date.";
    }
    if (targetStep >= 2) {
      const input = { name: form.legalName, email: form.workEmail, title: form.jobTitle, role: form.role, team, managerId: form.managerId };
      const validation = validateInternalUserProvisioning(data, input);
      if (validation) return validation;
      if (form.workLocation.trim().length < 2) return "Enter the work location.";
    }
    if (targetStep >= 3) {
      if (form.payBasis === "Not configured") return "Choose the approved pay basis before issuing credentials.";
      const payRate = Number(form.payRate);
      if (!Number.isFinite(payRate) || payRate <= 0) return "Enter the approved pay rate before issuing credentials.";
      if (form.payGroup.trim().length < 2 || form.payGroup.trim().toLowerCase() === "not configured") return "Choose the actual pay group before issuing credentials.";
      if (form.standardWeeklyHours.trim()) {
        const hours = Number(form.standardWeeklyHours);
        if (!Number.isFinite(hours) || hours < 0 || hours > 168) return "Standard weekly hours must be between 0 and 168.";
      }
    }
    if (targetStep >= 4) {
      if (!form.courseIds.length) return "Assign at least one active onboarding course before issuing credentials.";
      if (form.courseIds.some((id) => !activeCourses.some((course) => course.id === id))) return "One or more selected training courses are no longer active.";
    }
    return null;
  };

  const nextStep = () => {
    const validation = validateStep(step);
    if (validation) { setError(validation); return; }
    setError("");
    setStep((current) => Math.min(4, current + 1));
  };

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
        ? " The Firebase identity survived on purpose — reopen this hire here to finish it. Do not create the account again."
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
  const sendResetInstead = async () => { if (!firebase || !issued) return; const result = await firebase.sendPasswordReset(issued.email); setNotice(result.message ?? (result.ok ? "Password setup email sent." : "Could not send the email.")); };

  const setRole = (role: ProvisionableRole) => {
    const nextTeam = teamForRole(role);
    const nextManagers = managerOptionsForProvisioning(data, role);
    setForm((current) => ({
      ...current,
      role,
      jobTitle: defaultTitles.has(current.jobTitle) ? role : current.jobTitle,
      managerId: nextManagers.some((manager) => manager.id === current.managerId) ? current.managerId : "",
      courseIds: coursesForRole(role, nextTeam),
    }));
  };

  const selectOffer = (offerId: string) => {
    const match = acceptedOffers.find((item) => item.offer.id === offerId);
    if (!match) { setForm((current) => ({ ...current, source: "Direct hire", offerId: "" })); return; }
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
    const validation = validateStep(4);
    if (validation) { setError(validation); return; }
    const payRate = Number(form.payRate);
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
    if (!id) { setError("Momentum did not save this setup. Check for a duplicate email, invalid reporting line, inactive training, or incomplete pay information."); return; }
    setError("");
    setNotice("New-hire setup saved. The employee is now waiting in the onboarding queue for account creation.");
    setForm(emptyForm());
    setStep(1);
  };

  const startExistingOnboarding = (draft: ProvisioningDraft) => {
    const matchingUser = data.users.find((user) => user.email.toLowerCase() === draft.workEmail.toLowerCase() && user.role !== "Administrator" && user.role !== "Customer");
    if (!matchingUser) { setNotice("No linked Momentum identity exists yet. Create the Firebase account from this queue first."); return; }
    if (!provisioning.beginOnboarding({ userId: matchingUser.id, draftId: draft.id })) {
      const record = provisioning.state.records.find((item) => item.userId === matchingUser.id);
      const started = record && !isFailClosedPlaceholder(record) && record.state !== "Password change required";
      setNotice(started
        ? `${matchingUser.name} is already past the password change (${record!.state}). Nothing to restart.`
        : "The identity could not be linked to this onboarding setup. Confirm the work e-mail, role, team and manager still match the draft.");
      return;
    }
    setNotice(`${matchingUser.name} is ready to begin onboarding.`);
  };

  const verifyDocumentExternally = (documentId: string) => {
    const document = hcm.documents.find((item) => item.id === documentId);
    if (!document || document.status === "Available") return;
    const at = new Date().toISOString();
    setHcm((state) => appendAudit({ ...state, documents: state.documents.map((item) => item.id === documentId ? { ...item, status: "Available", fileName: "Verified externally (manual attestation)", uploadedAt: at, uploadedBy: currentUser.id } : item) }, { actorId: currentUser.id, action: "Verified onboarding document outside Momentum", entityType: "EmployeeDocument", entityId: documentId, before: document.status, after: "Available", reason: "Manual Administrator attestation while secure file/e-sign transport is not connected" }));
    setNotice(`${document.title} marked verified externally. No file was stored in Momentum.`);
  };

  const activatePendingUser=async(userId:string,name:string)=>{
    if(activationBusy)return;
    setActivationBusy(userId);
    const ok=await provisioning.activateUser(userId);
    setActivationBusy(null);
    setNotice(ok?`${name} activated.`:"Activation could not be persisted. Access remains blocked; recheck the listed controls and Firestore access before retrying.");
  };

  if (view === "create") return <div className="page page--new-hire">
    <PageHeader eyebrow="Human Resources" title="Create new hire" description="Create one complete employee setup before any login credentials are issued." actions={<Button variant="secondary" onClick={() => navigate("onboarding")}>Open onboarding queue</Button>}/>
    <div className="new-hire-stepper" aria-label="New hire setup steps">{["Identity","Position","Pay","Training & review"].map((label,index)=><button type="button" key={label} className={step===index+1?"is-active":step>index+1?"is-complete":""} onClick={()=>{if(index+1<step)setStep(index+1)}}><span>{index+1}</span><strong>{label}</strong></button>)}</div>
    <Section title={`Step ${step} of 4`} description={step===1?"Who is joining and when?":step===2?"What job are they doing and who owns their work?":step===3?"Confirm classification and approved pay before access exists.":"Assign required training and review the setup before moving it to the queue."} action={<StatusPill tone="gold"><ShieldCheck size={14}/> Administrator only</StatusPill>}>
      <form className="provisioning-form new-hire-wizard" onSubmit={save}>
        {step===1&&<div className="provisioning-section"><div className="form-grid">
          {acceptedOffers.length>0&&<Field label="Prefill from accepted offer (optional)"><select value={form.offerId} onChange={(event)=>selectOffer(event.target.value)}><option value="">Enter manually</option>{acceptedOffers.map(({offer,candidate})=><option key={offer.id} value={offer.id}>{candidate!.name} · {offer.title}</option>)}</select></Field>}
          <Field label="Legal name"><input required value={form.legalName} onChange={(event)=>setForm((current)=>({...current,legalName:event.target.value}))}/></Field>
          <Field label="Preferred name"><input value={form.preferredName} onChange={(event)=>setForm((current)=>({...current,preferredName:event.target.value}))}/></Field>
          <Field label="Work email"><input type="email" required value={form.workEmail} onChange={(event)=>setForm((current)=>({...current,workEmail:event.target.value}))}/></Field>
          <Field label="Start date"><input type="date" required value={form.startDate} onChange={(event)=>setForm((current)=>({...current,startDate:event.target.value}))}/></Field>
        </div></div>}
        {step===2&&<div className="provisioning-section"><div className="form-grid">
          <Field label="Platform role"><select value={form.role} onChange={(event)=>setRole(event.target.value as ProvisionableRole)}>{roleOptions.map((role)=><option key={role}>{role}</option>)}</select></Field>
          <Field label="Department"><input value={team} readOnly aria-readonly="true"/></Field>
          <Field label="Position title"><input required value={form.jobTitle} onChange={(event)=>setForm((current)=>({...current,jobTitle:event.target.value}))}/></Field>
          <Field label="Reports to"><select required value={form.managerId} onChange={(event)=>setForm((current)=>({...current,managerId:event.target.value}))}><option value="">Choose manager</option>{managers.map((manager)=><option key={manager.id} value={manager.id}>{manager.name} · {manager.title}</option>)}</select></Field>
          <Field label="Work location"><input required value={form.workLocation} onChange={(event)=>setForm((current)=>({...current,workLocation:event.target.value}))} placeholder="Enter the actual work location"/></Field>
          <Field label="Standard weekly hours"><input type="number" min="0" max="168" step="0.25" value={form.standardWeeklyHours} onChange={(event)=>setForm((current)=>({...current,standardWeeklyHours:event.target.value}))} placeholder="If applicable"/></Field>
        </div></div>}
        {step===3&&<div className="provisioning-section"><div className="form-grid">
          <Field label="Worker type"><select value={form.workerType} onChange={(event)=>setForm((current)=>({...current,workerType:event.target.value as WorkerType}))}><option>Employee</option><option>Contractor</option></select></Field>
          <Field label="Pay basis"><select value={form.payBasis} onChange={(event)=>setForm((current)=>({...current,payBasis:event.target.value as PayBasis}))}><option value="Not configured" disabled>Choose pay basis</option>{payBasisOptions.map((item)=><option key={item}>{item}</option>)}</select></Field>
          <Field label={form.payBasis==="Hourly"?"Hourly rate":form.payBasis==="Salary per pay period"?"Salary per pay period":"Pay rate"}><input type="number" min="0.01" step="0.01" required value={form.payRate} onChange={(event)=>setForm((current)=>({...current,payRate:event.target.value}))}/></Field>
          <Field label="Pay group"><input required value={form.payGroup} onChange={(event)=>setForm((current)=>({...current,payGroup:event.target.value}))} placeholder="Weekly, biweekly, etc."/></Field>
        </div><div className="provisioning-banner"><ShieldCheck size={20}/><div><strong>Credentials wait until the employment setup is real.</strong><p>Momentum will not create a login with placeholder compensation, an unresolved manager, or an unconfigured pay group.</p></div></div></div>}
        {step===4&&<div className="provisioning-section"><div className="training-picker">{activeCourses.map((course)=><label key={course.id}><input type="checkbox" checked={form.courseIds.includes(course.id)} onChange={()=>toggleCourse(course.id)}/><span><strong>{course.title}</strong><small>{course.description}</small></span></label>)}</div><div className="new-hire-review-grid"><div><small>Employee</small><strong>{form.legalName}</strong><span>{form.workEmail}</span></div><div><small>Position</small><strong>{form.jobTitle}</strong><span>{form.role} · {team}</span></div><div><small>Manager</small><strong>{data.users.find((user)=>user.id===form.managerId)?.name??"Not selected"}</strong><span>{form.workLocation||"Work location missing"}</span></div><div><small>Pay</small><strong>{form.payRate?formatMoney(Number(form.payRate)):"Missing"}</strong><span>{form.payBasis} · {form.payGroup||"pay group missing"}</span></div><div><small>Start</small><strong>{form.startDate}</strong><span>{form.courseIds.length} training assignment{form.courseIds.length===1?"":"s"}</span></div></div></div>}
        {error&&<p className="form-error" role="alert">{error}</p>}
        {notice&&<div className="form-callout"><p>{notice}</p><Button type="button" size="sm" variant="secondary" onClick={()=>navigate("onboarding")}>Continue to onboarding queue</Button></div>}
        <div className="provisioning-actions new-hire-wizard-actions">{step>1&&<Button type="button" variant="ghost" onClick={()=>{setError("");setStep((current)=>Math.max(1,current-1))}}>Back</Button>}{step<4?<Button type="button" onClick={nextStep}>Continue</Button>:<Button type="submit" icon={<UserPlus size={16}/>}>Save new-hire setup</Button>}</div>
      </form>
    </Section>
  </div>;

  return <div className="page page--onboarding-queue">
    <PageHeader eyebrow="Human Resources" title="Onboarding queue" description="Create employee login credentials only from an approved setup, monitor first-login onboarding, verify external documents, and activate access when controls are complete." actions={<Button variant="secondary" icon={<UserPlus size={16}/>} onClick={()=>navigate("newHire")}>Create new hire</Button>}/>
    <Section title="Account provisioning" description={firebase?"Prepared hires waiting for a Firebase identity, first sign-in, or onboarding progression.":"Prepared hires waiting for identity provisioning."} action={<StatusPill tone="neutral">{activeDrafts.length} setup{activeDrafts.length===1?"":"s"}</StatusPill>}>
      {issued&&<div className="temp-password" role="status"><strong>{issued.name} · {issued.email}</strong><span>Temporary password shown once. The employee must replace it at first sign-in.</span><code>{issued.password}</code><div className="provisioning-row-actions"><Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>void copyPassword()}>Copy</Button><Button size="sm" variant="ghost" icon={<MailCheck size={14}/>} onClick={()=>void sendResetInstead()}>Email password setup link</Button><Button size="sm" variant="ghost" onClick={()=>setIssued(null)}>Dismiss</Button></div></div>}
      {notice&&<div className="form-callout"><p>{notice}</p></div>}
      <div className="provisioning-queue">{activeDrafts.map((draft)=>{
        const manager=data.users.find((user)=>user.id===draft.managerId);
        const matchingUser=data.users.find((user)=>user.email.toLowerCase()===draft.workEmail.toLowerCase()&&user.role!=="Administrator"&&user.role!=="Customer");
        const creating=identityDraft?.draftId===draft.id;
        const record=matchingUser?provisioning.state.records.find((item)=>item.userId===matchingUser.id):undefined;
        return <article key={draft.id}><span className="provisioning-avatar"><UsersRound size={18}/></span><div><strong>{draft.legalName}</strong><p>{draft.jobTitle} · {draft.team} · reports to {manager?.name??"Unresolved manager"}</p><small>{draft.workEmail} · starts {draft.startDate} · {draft.payBasis} {draft.payRate?formatMoney(draft.payRate):"missing pay"}</small>{record&&<small>Access: {record.state}</small>}{creating&&identityDraft&&<form className="access-gate-form" onSubmit={(event)=>{event.preventDefault();void createIdentity(draft)}}><label><span>Temporary password</span><input value={identityDraft.password} onChange={(event)=>setIdentityDraft({...identityDraft,password:event.target.value,error:""})} autoComplete="off"/></label>{identityDraft.error&&<p className="form-error" role="alert">{identityDraft.error}</p>}<div className="provisioning-row-actions"><Button size="sm" type="submit" disabled={identityDraft.busy} icon={<KeyRound size={14}/>}>{identityDraft.busy?"Creating…":"Create account"}</Button><Button size="sm" variant="ghost" type="button" onClick={()=>setIdentityDraft(null)}>Cancel</Button></div></form>}</div><StatusPill tone={draft.status==="Auth linked"?"success":draft.status==="Invite sent"?"info":"warning"}>{draft.status}</StatusPill><div className="provisioning-row-actions">{matchingUser&&!record?<Button size="sm" variant="secondary" onClick={()=>startExistingOnboarding(draft)}>Link & start onboarding</Button>:!matchingUser&&firebase?<Button size="sm" variant="secondary" disabled={creating} icon={<KeyRound size={14}/>} onClick={()=>startIdentityCreation(draft)}>Create Firebase account</Button>:!firebase?<Button size="sm" variant="secondary" disabled title="Firebase Authentication is required">Firebase required</Button>:null}{draft.status!=="Auth linked"&&!record&&<Button size="sm" variant="ghost" onClick={()=>provisioning.cancelDraft(draft.id)}>Cancel setup</Button>}</div></article>;
      })}{activeDrafts.length===0&&<div className="review-empty"><UserPlus size={24}/><h3>No hires waiting for account creation</h3><p>Create a new-hire setup first.</p></div>}</div>
    </Section>

    <Section title="Final onboarding review" description="Employees may submit after completing the work they control. Administrators verify required paperwork before activating production access." action={<StatusPill tone={pendingApprovals.length?"warning":"success"}>{pendingApprovals.length} pending</StatusPill>}>
      <div className="provisioning-queue onboarding-approval-list">{pendingApprovals.map((record)=>{
        const user=data.users.find((item)=>item.id===record.userId);
        const readiness=onboardingReadiness(hcm,record,record.userId);
        const employee=hcm.employees.find((item)=>item.userId===record.userId);
        const requiredTitles=new Set(requiredOnboardingDocumentTemplates(employee?.classification??"Not configured").map((item)=>item.title.toLowerCase()));
        const documents=hcm.documents.filter((item)=>item.userId===record.userId&&requiredTitles.has(item.title.toLowerCase()));
        return <article key={record.id} className="onboarding-review-card"><span className="provisioning-avatar"><CheckCircle2 size={18}/></span><div className="onboarding-review-body"><strong>{user?.name??record.userId}</strong><p>{readiness.readyForActivation?"All activation controls are complete.":`${readiness.activationBlockers.length} activation blocker${readiness.activationBlockers.length===1?"":"s"} remain.`}</p><div className="onboarding-doc-review">{documents.map((document)=><div key={document.id}><span><FileCheck2 size={15}/><span><strong>{document.title}</strong><small>{document.status==="Available"?document.fileName??"Verified":"Awaiting Administrator verification"}</small></span></span>{document.status==="Available"?<StatusPill tone="success">Verified</StatusPill>:<Button size="sm" variant="secondary" onClick={()=>verifyDocumentExternally(document.id)}>Verify externally</Button>}</div>)}</div>{readiness.activationBlockers.length>0&&<ul className="onboarding-activation-blockers">{readiness.activationBlockers.map((blocker)=><li key={blocker}>{blocker}</li>)}</ul>}</div><StatusPill tone={readiness.readyForActivation?"success":"warning"}>{readiness.readyForActivation?"Ready":"Review"}</StatusPill><Button size="sm" disabled={!readiness.readyForActivation||activationBusy===record.userId} onClick={()=>void activatePendingUser(record.userId,user?.name??"Employee")}>{activationBusy===record.userId?"Activating…":"Activate access"}</Button></article>;
      })}{pendingApprovals.length===0&&<div className="review-empty"><CheckCircle2 size={24}/><h3>No onboarding approvals waiting</h3><p>Employees appear here after they complete and submit their onboarding work.</p></div>}</div>
    </Section>

    <Section title="Stuck employees & Administrator rescue" description="Every employee who is not Active yet, including anyone stranded before Pending approval by an incomplete provisioning record. Each control writes the real access record and an HCM audit event; none of them mark unfinished documents, training, or forms as complete." action={<StatusPill tone={rescueQueue.length?"warning":"success"}><LifeBuoy size={14}/> {rescueQueue.length} to rescue</StatusPill>}>
      <div className="provisioning-queue onboarding-approval-list">{rescueQueue.map((entry)=><RescueCard key={entry.user.id} entry={entry}/>)}{rescueQueue.length===0&&<div className="review-empty"><ShieldCheck size={24}/><h3>No employee is stuck</h3><p>Every provisioned employee has an active Momentum account.</p></div>}</div>
    </Section>
  </div>;
}
