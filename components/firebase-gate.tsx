"use client";

import { AlertTriangle, KeyRound, LockKeyhole, MailCheck, RefreshCcw, ShieldCheck } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { useFirebaseSession } from "../lib/firebase-session-context";
import { LoginForm } from "./login-screen";
import { BrandMark, Button, StatusPill } from "./ui";

function Loading() {
  return <main className="login-loading"><BrandMark /><span className="loading-line" /></main>;
}

function Unconfigured() {
  return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><AlertTriangle size={28} /></span><StatusPill tone="warning">Configuration required</StatusPill><h1>Firebase is not configured</h1><p>This production build has no Firebase web app configuration. Set the <code>NEXT_PUBLIC_FIREBASE_*</code> variables at build time (see docs/FIREBASE_PRODUCTION_SETUP.md). Local test mode remains available from a developer workstation.</p></section></main>;
}

function Failure({ error, retry, signOut }: { error?: string; retry: () => Promise<void>; signOut: () => Promise<void> }) {
  return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center"><span className="onboarding-hero-icon"><AlertTriangle size={28} /></span><StatusPill tone="danger">Connection problem</StatusPill><h1>Momentum could not reach Firebase</h1><p>{error ?? "The workspace could not be loaded."}</p><div className="access-gate-actions"><Button icon={<RefreshCcw size={16} />} onClick={() => void retry()}>Try again</Button><Button variant="ghost" onClick={() => void signOut()}>Sign out</Button></div></section></main>;
}

/** Signed in, but no `userAccess/{uid}` record exists. Offers the rules-controlled Administrator bootstrap. */
function NoAccess() {
  const firebase = useFirebaseSession();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Owner");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true); setError(""); setNotice("");
    const result = await action();
    setBusy(false);
    if (result.ok) setNotice(result.message ?? ""); else setError(result.message ?? "Request failed.");
  };

  const claim = (event: FormEvent) => { event.preventDefault(); void run(() => firebase.claimAdministrator({ name, title })); };

  return <main className="onboarding-shell"><section className="onboarding-card onboarding-card--center">
    <span className="onboarding-hero-icon"><LockKeyhole size={28} /></span>
    <StatusPill tone="warning">No Momentum access record</StatusPill>
    <h1>Signed in, awaiting access</h1>
    <p className="access-gate-meta">Signed in as <code>{firebase.session?.email}</code>. This Firebase identity has no Momentum role yet. An Administrator must provision your account from Human Resources → New hire setup.</p>
    <div className="onboarding-security-note"><ShieldCheck size={18} /><span>If you are the company owner or the founding Administrator, claim the Administrator role below. Security Rules only allow this for a verified e-mail on the bootstrap allow-list before an Administrator exists.</span></div>
    {!firebase.emailVerified && <div className="access-gate-actions"><Button variant="secondary" disabled={busy} icon={<MailCheck size={16} />} onClick={() => void run(firebase.sendVerificationEmail)}>Send verification e-mail</Button><Button variant="ghost" disabled={busy} icon={<RefreshCcw size={16} />} onClick={() => void run(async () => (await firebase.refreshVerification()) ? { ok: true, message: "E-mail verified." } : { ok: false, message: "E-mail is not verified yet. Open the verification link first." })}>I have verified</Button></div>}
    {firebase.emailVerified && <form className="access-gate-form" onSubmit={claim}>
      <label><span>Your full name</span><input required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
      <label><span>Title</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <Button type="submit" disabled={busy} icon={<KeyRound size={16} />}>Claim Administrator access</Button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <button className="onboarding-signout" onClick={() => void firebase.signOut()}>Sign out</button>
  </section></main>;
}

/** Production entry: resolves Firebase session → access record → primed Firestore cache before mounting the engines. */
export function FirebaseGate({ children }: { children: ReactNode }) {
  const firebase = useFirebaseSession();
  switch (firebase.status) {
    case "unconfigured": return <Unconfigured />;
    case "initializing":
    case "loading-workspace": return <Loading />;
    case "signed-out": return <LoginForm login={firebase.signIn} createAccount={firebase.createFounderAccount} ready requestPasswordReset={firebase.sendPasswordReset} subtitle={`Momentum work account · ${firebase.projectId ?? "Firebase"}`} />;
    case "no-access": return <NoAccess />;
    case "error": return <Failure error={firebase.error} retry={firebase.retry} signOut={firebase.signOut} />;
    case "ready": return <>{children}</>;
  }
}
