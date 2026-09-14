"use client";

import { CheckCircle2, FileCheck2, KeyRound, LockKeyhole, ShieldCheck, UserRoundCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { useHcm } from "../../lib/hcm-context";
import { appendAudit } from "../../lib/hcm-engine";
import { useIdentityProvisioning } from "../../lib/identity-provisioning-context";
import { onboardingReadiness } from "../../lib/onboarding-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, StatusPill } from "../ui";

/** First-login password rotation. Firebase Authentication holds the credential; Momentum only records that it happened. */
function PasswordChangeForm({ onComplete }: { onComplete: (evidence: string) => boolean }) {
  const firebase = useFirebaseSessionOptional();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!firebase) return <Button disabled title="Firebase Authentication integration required">Change password securely</Button>;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { setError("Use at least 10 characters with upper-case, lower-case, and a digit."); return; }
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    const result = await firebase.changePassword(password);
    setBusy(false);
    if (!result.ok) { setError(result.message ?? "Password change failed."); return; }
    onComplete(`Firebase Authentication password rotated at ${new Date().toISOString()}`);
  };

  return <form className="access-gate-form" onSubmit={submit}>
    <label><span>New password</span><input type="password" required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy} icon={<KeyRound size={16} />}>{busy ? "Updating…" : "Change password securely"}</Button>
  </form>;
}

export function OnboardingPortal() {
  const { data, currentUser, logout } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const firebase = useFirebaseSessionOptional();
  const provisioning = useIdentityProvisioning();
  const record = provisioning.currentRecord;
  const activeAdministrator = currentUser?.role === "Administrator" && firebase?.access?.role === "Administrator" && firebase.access.accountState === "Active";
  const employee = currentUser ? hcm.employees.find((item) => item.userId === currentUser.id) : undefined;
  const profile = currentUser ? hcm.privateProfiles.find((item) => item.userId === currentUser.id) : undefined;
  const [profileForm, setProfileForm] = useState(() => ({ phone: profile?.phone ?? "", address: profile?.address ?? "", emergencyContact: profile?.emergencyContact ?? "", preferredName: profile?.preferredName ?? "" }));
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");

  if (!currentUser || currentUser.role === "Customer" || !record || record.state === "Active" || activeAdministrator) return null;

  const assignments = hcm.training.filter((item) => item.userId === currentUser.id);
  const documents = hcm.documents.filter((item) => item.userId === currentUser.id && ["Employment", "Compensation", "Tax"].includes(item.category));
  const readiness = onboardingReadiness(hcm, record, currentUser.id);
  const manager = employee?.managerId ? data.users.find((item) => item.id === employee.managerId) : undefined;

  const completeTraining = (assignmentId: string) => {
    const assignment = hcm.training.find((item) => item.id === assignmentId && item.userId === currentUser.id && item.status !== "Complete");
    if (!assignment) return;
    const at = new Date().toISOString();
    setHcm((current) => appendAudit({ ...current, training: current.training.map((item) => item.id === assignment.id ? { ...item, status: "Complete", completedAt: at, evidence: "Employee attested completion in Momentum" } : item) }, { actorId: currentUser.id, action: "Completed assigned onboarding training", entityType: "TrainingAssignment", entityId: assignment.id, before: assignment.status, after: "Complete" }));
  };

  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    setProfileError("");
    setProfileNotice("");
    const phone = profileForm.phone.trim();
    const address = profileForm.address.trim();
    const emergencyContact = profileForm.emergencyContact.trim();
    const preferredName = profileForm.preferredName.trim();
    if (phone.length < 7 || address.length < 5 || emergencyContact.length < 3) { setProfileError("Phone, home address, and emergency contact are required before onboarding can be submitted."); return; }
    const at = new Date().toISOString();
    setHcm((current) => appendAudit({ ...current, privateProfiles: current.privateProfiles.map((item) => item.userId === currentUser.id ? { ...item, phone, address, emergencyContact, preferredName: preferredName || item.preferredName, updatedAt: at } : item) }, { actorId: currentUser.id, action: "Completed onboarding contact profile", entityType: "EmployeePrivateProfile", entityId: currentUser.id, reason: "Prehire self-service onboarding" }));
    setProfileNotice("Contact and emergency information saved.");
  };

  if (record.state === "Password change required") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><KeyRound size={28}/></span><StatusPill tone="warning">Security setup required</StatusPill><h1>Secure your Momentum account</h1><p>Change your temporary password before continuing.</p><div className="onboarding-security-note"><LockKeyhole size={18}/><span>Momentum never stores or displays your password.</span></div><PasswordChangeForm onComplete={provisioning.completePasswordChange}/><button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  if (record.state === "Pending approval") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><ShieldCheck size={28}/></span><StatusPill tone="info">Submitted</StatusPill><h1>Onboarding submitted</h1><p>Your part is complete. An Administrator is verifying required employment and tax paperwork before production access is activated.</p>{record.onboardingSubmittedAt && <small>Submitted {new Date(record.onboardingSubmittedAt).toLocaleString()}</small>}<button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  if (record.state === "Suspended" || record.state === "Separated") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><LockKeyhole size={28}/></span><StatusPill tone="danger">Access unavailable</StatusPill><h1>Momentum access is unavailable</h1><p>This account cannot enter the workspace right now. Contact an Administrator if you think this is incorrect.</p><button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  return <main className="onboarding-shell"><div className="onboarding-page">
    <header className="onboarding-header"><div><StatusPill tone="gold">New hire onboarding</StatusPill><h1>Welcome, {currentUser.firstName}</h1><p>Finish the items you control. HR verifies employment paperwork after you submit.</p></div><button className="onboarding-signout" onClick={logout}>Sign out</button></header>

    <section className="onboarding-progress"><div><strong>{readiness.completed} of {readiness.total} employee onboarding controls complete</strong><span>{Math.round((readiness.completed / Math.max(1, readiness.total)) * 100)}%</span></div><div className="onboarding-progress-track"><i style={{ width: `${Math.round((readiness.completed / Math.max(1, readiness.total)) * 100)}%` }}/></div></section>

    <div className="onboarding-grid">
      <section className="onboarding-panel"><header><UserRoundCheck size={19}/><div><h2>Your position</h2><p>Review the setup HR created for you.</p></div></header><dl><div><dt>Position</dt><dd>{employee?.jobTitle || currentUser.title}</dd></div><div><dt>Department</dt><dd>{employee?.department || currentUser.team}</dd></div><div><dt>Manager</dt><dd>{manager?.name ?? "Not configured"}</dd></div><div><dt>Work location</dt><dd>{employee?.location || "Not configured"}</dd></div><div><dt>Start date</dt><dd>{employee?.hireDate || "Not configured"}</dd></div></dl></section>

      <section className="onboarding-panel"><header><ShieldCheck size={19}/><div><h2>Contact & emergency profile</h2><p>Enter the information HR needs before activation.</p></div></header><form className="onboarding-profile-form" onSubmit={saveProfile}><Field label="Preferred name (optional)"><input value={profileForm.preferredName} onChange={(event)=>setProfileForm({...profileForm,preferredName:event.target.value})}/></Field><Field label="Phone number"><input required value={profileForm.phone} onChange={(event)=>setProfileForm({...profileForm,phone:event.target.value})}/></Field><Field label="Home address"><textarea required rows={2} value={profileForm.address} onChange={(event)=>setProfileForm({...profileForm,address:event.target.value})}/></Field><Field label="Emergency contact"><input required placeholder="Name and phone number" value={profileForm.emergencyContact} onChange={(event)=>setProfileForm({...profileForm,emergencyContact:event.target.value})}/></Field>{profileError&&<p className="form-error" role="alert">{profileError}</p>}{profileNotice&&<p className="form-notice" role="status">{profileNotice}</p>}<Button type="submit" size="sm" variant="secondary">Save profile</Button></form></section>

      <section className="onboarding-panel onboarding-panel--wide"><header><FileCheck2 size={19}/><div><h2>Employment and tax paperwork</h2><p>These records must be verified by HR before access is activated.</p></div></header><div className="onboarding-document-list">{documents.map((document) => <article key={document.id}><div><strong>{document.title}</strong><small>{document.status === "Available" ? document.fileName ?? "Verified by HR" : "Administrator verification required"}</small></div><StatusPill tone={document.status === "Available" ? "success" : "warning"}>{document.status === "Available" ? "Verified" : "Pending HR"}</StatusPill></article>)}{documents.length === 0 && <p>No required document package has been prepared yet. Contact HR.</p>}</div><div className="onboarding-security-note"><LockKeyhole size={17}/><span>Until secure file upload and e-sign are connected, HR verifies completed paperwork outside Momentum. The app records the verification, not a fake uploaded file.</span></div></section>

      <section className="onboarding-panel onboarding-panel--wide"><header><CheckCircle2 size={19}/><div><h2>Assigned training</h2><p>Complete every course assigned to your role.</p></div></header><div className="onboarding-training-list">{assignments.map((assignment) => { const course = hcm.courses.find((item) => item.id === assignment.courseId); return <article key={assignment.id}><div><strong>{course?.title ?? "Assigned training"}</strong><small>{course?.description ?? "Required onboarding course"}</small></div>{assignment.status === "Complete" ? <StatusPill tone="success">Complete</StatusPill> : <Button size="sm" variant="secondary" onClick={() => completeTraining(assignment.id)}>Mark complete</Button>}</article>; })}{assignments.length === 0 && <p>No training assignments have been prepared yet. Contact HR.</p>}</div></section>
    </div>

    {record.returnReason && <section className="onboarding-return"><strong>Returned for correction</strong><p>{record.returnReason}</p></section>}
    {readiness.blockers.length > 0 && <section className="onboarding-blockers"><h2>Still required from you or HR before submission</h2><ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section>}
    <section className="onboarding-submit"><div><strong>Submit to HR</strong><p>Your required paperwork may still be pending Administrator verification after you submit.</p></div><Button disabled={!readiness.readyForEmployeeSubmission} onClick={() => provisioning.submitOnboarding()}>Submit onboarding</Button></section>
  </div></main>;
}
