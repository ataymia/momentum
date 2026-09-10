"use client";

import { CheckCircle2, FileCheck2, KeyRound, LockKeyhole, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useHcm } from "../../lib/hcm-context";
import { appendAudit } from "../../lib/hcm-engine";
import { useIdentityProvisioning } from "../../lib/identity-provisioning-context";
import { onboardingReadiness } from "../../lib/onboarding-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, StatusPill } from "../ui";

export function OnboardingPortal() {
  const { currentUser, logout } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const provisioning = useIdentityProvisioning();
  const record = provisioning.currentRecord;
  if (!currentUser || currentUser.role === "Customer" || !record || record.state === "Active") return null;

  const employee = hcm.employees.find((item) => item.userId === currentUser.id);
  const profile = hcm.privateProfiles.find((item) => item.userId === currentUser.id);
  const assignments = hcm.training.filter((item) => item.userId === currentUser.id);
  const documents = hcm.documents.filter((item) => item.userId === currentUser.id && ["Employment", "Compensation", "Tax"].includes(item.category));
  const readiness = onboardingReadiness(hcm, record, currentUser.id);
  const manager = employee?.managerId ? hcm.employees.find((item) => item.userId === employee.managerId) : undefined;

  const completeTraining = (assignmentId: string) => {
    const assignment = hcm.training.find((item) => item.id === assignmentId && item.userId === currentUser.id && item.status !== "Complete");
    if (!assignment) return;
    const at = new Date().toISOString();
    setHcm((current) => appendAudit({ ...current, training: current.training.map((item) => item.id === assignment.id ? { ...item, status: "Complete", completedAt: at, evidence: "Employee attested completion in Momentum" } : item) }, { actorId: currentUser.id, action: "Completed assigned onboarding training", entityType: "TrainingAssignment", entityId: assignment.id, before: assignment.status, after: "Complete" }));
  };

  if (record.state === "Password change required") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><KeyRound size={28}/></span><StatusPill tone="warning">Security setup required</StatusPill><h1>Secure your Momentum account</h1><p>Your employee account has been prepared. Before onboarding opens, your temporary credential must be replaced through Firebase Authentication.</p><div className="onboarding-security-note"><LockKeyhole size={18}/><span>Momentum will not store or display your password. The password-change step will unlock when the Firebase authentication adapter is connected.</span></div><Button disabled title="Firebase Authentication integration required">Change password securely</Button><button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  if (record.state === "Pending approval") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><ShieldCheck size={28}/></span><StatusPill tone="info">Submitted</StatusPill><h1>Onboarding in progress</h1><p>Your onboarding has been submitted for final review. Check back later. Your role-based Momentum workspace will unlock after an Administrator verifies the required records and activates your account.</p>{record.onboardingSubmittedAt && <small>Submitted {new Date(record.onboardingSubmittedAt).toLocaleString()}</small>}<button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  if (record.state === "Suspended" || record.state === "Separated") return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><LockKeyhole size={28}/></span><StatusPill tone="danger">Access unavailable</StatusPill><h1>Momentum access is unavailable</h1><p>This account is not currently permitted to enter the operational workspace. Contact an Administrator if you believe the account status is incorrect.</p><button className="onboarding-signout" onClick={logout}>Sign out</button></section></main>;

  return <main className="onboarding-shell"><div className="onboarding-page">
    <header className="onboarding-header"><div><StatusPill tone="gold">New hire onboarding</StatusPill><h1>Welcome, {currentUser.firstName}</h1><p>Complete the required setup below. Operational CRM, inventory, finance, payroll, and customer data remain locked until onboarding is approved.</p></div><button className="onboarding-signout" onClick={logout}>Sign out</button></header>

    <section className="onboarding-progress"><div><strong>{readiness.completed} of {readiness.total} activation controls complete</strong><span>{Math.round((readiness.completed / Math.max(1, readiness.total)) * 100)}%</span></div><div className="onboarding-progress-track"><i style={{ width: `${Math.round((readiness.completed / Math.max(1, readiness.total)) * 100)}%` }}/></div></section>

    <div className="onboarding-grid">
      <section className="onboarding-panel"><header><UserRoundCheck size={19}/><div><h2>Your position</h2><p>Verify the employment setup prepared by the Administrator.</p></div></header><dl><div><dt>Position</dt><dd>{employee?.jobTitle || currentUser.title}</dd></div><div><dt>Department</dt><dd>{employee?.department || currentUser.team}</dd></div><div><dt>Manager</dt><dd>{manager ? hcm.employees.find((item) => item.userId === manager.userId)?.jobTitle : "Configured in employee record"}</dd></div><div><dt>Work location</dt><dd>{employee?.location || "Not configured"}</dd></div><div><dt>Start date</dt><dd>{employee?.hireDate || "Not configured"}</dd></div><div><dt>Worker classification</dt><dd>{employee?.classification || "Not configured"}</dd></div></dl></section>

      <section className="onboarding-panel"><header><ShieldCheck size={19}/><div><h2>Contact & emergency profile</h2><p>Required before final activation.</p></div></header><div className="onboarding-check-list"><div className={profile?.phone ? "is-complete" : ""}><CheckCircle2 size={17}/><span>Phone number</span><small>{profile?.phone ? "Recorded" : "Not completed"}</small></div><div className={profile?.address ? "is-complete" : ""}><CheckCircle2 size={17}/><span>Home address</span><small>{profile?.address ? "Recorded" : "Not completed"}</small></div><div className={profile?.emergencyContact ? "is-complete" : ""}><CheckCircle2 size={17}/><span>Emergency contact</span><small>{profile?.emergencyContact ? "Recorded" : "Not completed"}</small></div></div><div className="onboarding-integration-gate"><LockKeyhole size={17}/><p>Secure employee-profile entry will be enabled with the authenticated Firestore employee profile. Sensitive personal data is not collected into browser-local demo storage.</p></div></section>

      <section className="onboarding-panel onboarding-panel--wide"><header><FileCheck2 size={19}/><div><h2>Employment and tax documents</h2><p>Your required document set is based on worker classification.</p></div></header><div className="onboarding-document-list">{documents.map((document) => <article key={document.id}><div><strong>{document.title}</strong><small>{document.category}</small></div><StatusPill tone={document.status === "Available" ? "success" : document.status === "Acknowledgment required" ? "warning" : "neutral"}>{document.status}</StatusPill></article>)}{documents.length === 0 && <p>No required document package has been prepared yet.</p>}</div><div className="onboarding-integration-gate"><LockKeyhole size={17}/><p>Tax and employment form upload/e-sign remains locked until secure Firebase Storage or another approved document service is connected. Momentum will not fake completion or store these files in local browser data.</p></div></section>

      <section className="onboarding-panel onboarding-panel--wide"><header><CheckCircle2 size={19}/><div><h2>Assigned training</h2><p>Complete the courses assigned to your role. No training deadline is enforced until company policy is confirmed.</p></div></header><div className="onboarding-training-list">{assignments.map((assignment) => { const course = hcm.courses.find((item) => item.id === assignment.courseId); return <article key={assignment.id}><div><strong>{course?.title ?? "Assigned training"}</strong><small>{course?.description ?? "Required onboarding course"}</small></div>{assignment.status === "Complete" ? <StatusPill tone="success">Complete</StatusPill> : <Button size="sm" variant="secondary" onClick={() => completeTraining(assignment.id)}>Mark complete</Button>}</article>; })}{assignments.length === 0 && <p>No training assignments have been prepared yet.</p>}</div></section>
    </div>

    {record.returnReason && <section className="onboarding-return"><strong>Administrator returned onboarding for correction</strong><p>{record.returnReason}</p></section>}
    {readiness.blockers.length > 0 && <section className="onboarding-blockers"><h2>Still required</h2><ul>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></section>}
    <section className="onboarding-submit"><div><strong>Ready for review</strong><p>Submission becomes available only when every required activation control has evidence.</p></div><Button disabled={!readiness.readyForEmployeeSubmission} onClick={() => provisioning.submitOnboarding()}>Submit onboarding for approval</Button></section>
  </div></main>;
}
