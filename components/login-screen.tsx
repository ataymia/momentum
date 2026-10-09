"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, MailQuestion } from "lucide-react";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { BrandMark, Button } from "./ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type LoginResult = { ok: boolean; message?: string };
export type LoginFormProps = {
  /** Accepts a username or an e-mail address. Both resolve to the same Firebase identity. */
  login: (identifier: string, password: string) => LoginResult | Promise<LoginResult>;
  ready: boolean;
  /** Present only when Firebase Authentication is connected. Accepts a username or an e-mail. */
  requestPasswordReset?: (identifier: string) => Promise<LoginResult>;
  /** Present only when Firebase Authentication is connected. Takes the employee's recovery e-mail. */
  recoverUsername?: (email: string) => Promise<LoginResult>;
};

type RecoveryPane = "none" | "password" | "username";

export function LoginForm({ login, ready, requestPasswordReset, recoverUsername }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [pane, setPane] = useState<RecoveryPane>("none");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await login(username, password);
      if (!result.ok) setError(result.message ?? "Incorrect sign-in details.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Incorrect sign-in details.");
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<LoginResult>, fallback: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await action();
      if (result.ok) { setNotice(result.message ?? fallback); setPane("none"); }
      else setError(result.message ?? fallback);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!requestPasswordReset || busy) return;
    if (!username.trim()) { setError("Enter your username or e-mail address, then send the reset link."); return; }
    void run(() => requestPasswordReset(username), "Password reset requested.");
  };

  const remindUsername = (event: FormEvent) => {
    event.preventDefault();
    if (!recoverUsername || busy) return;
    if (!recoveryEmail.includes("@")) { setError("Enter the e-mail address on your Momentum account."); return; }
    void run(() => recoverUsername(recoveryEmail), "Request submitted.");
  };

  const openPane = (next: RecoveryPane) => { setPane(next); setError(""); setNotice(""); };

  if (!ready) return <main className="login-loading"><BrandMark onDark /><span className="loading-line" /></main>;

  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__glow login-hero__glow--one" /><div className="login-hero__glow login-hero__glow--two" />
      <div className="login-hero__content">
        <div className="login-hero__wordmark"><strong>Momentum Distribution</strong></div>
      </div>
    </section>
    <section className="login-panel"><div className="login-panel__inner">
      <div className="login-panel__brand"><Image src={`${basePath}/momentum-invoice-brand.jpg`} alt="Momentum Distribution Inc. Golden Eagle Energy Drink" width={1536} height={1024} priority unoptimized /></div>
      <div className="login-panel__heading"><span className="login-panel__icon"><LockKeyhole size={20} /></span><div><h2>Sign in</h2></div></div>

      {pane === "none" && <form className="login-form" onSubmit={submit}>
        <label><span>Username or work email</span><input required autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" placeholder="jsmith or name@company.com" /></label>
        <label><span>Password</span><div className="password-input"><input type={showPassword ? "text" : "password"} required value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <Button type="submit" size="lg" disabled={busy} icon={<ArrowRight size={18} />}>{busy ? "Signing in…" : "Sign in"}</Button>
        {requestPasswordReset && <button type="button" className="login-link" onClick={() => openPane("password")} disabled={busy}>Forgot password?</button>}
        {recoverUsername && <button type="button" className="login-link" onClick={() => openPane("username")} disabled={busy}>Forgot username?</button>}
      </form>}

      {pane === "password" && <form className="login-form" onSubmit={resetPassword}>
        <label><span>Username or work email</span><input required autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} autoComplete="username" placeholder="jsmith or name@company.com" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <Button type="submit" size="lg" disabled={busy} icon={<MailQuestion size={18} />}>{busy ? "Sending…" : "Send reset link"}</Button>
        <button type="button" className="login-link" onClick={() => openPane("none")} disabled={busy}>Back to sign in</button>
      </form>}

      {pane === "username" && <form className="login-form" onSubmit={remindUsername}>
        <label><span>Work e-mail</span><input type="email" required value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setError(""); }} autoComplete="email" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <Button type="submit" size="lg" disabled={busy} icon={<MailQuestion size={18} />}>{busy ? "Sending…" : "Request my username"}</Button>
        <button type="button" className="login-link" onClick={() => openPane("none")} disabled={busy}>Back to sign in</button>
      </form>}

      {pane === "none" && notice && <p className="form-notice" role="status">{notice}</p>}
    </div></section>
  </main>;
}

/** Local demo sign-in backed by the workspace provider. Production uses `FirebaseGate`, which renders `LoginForm` directly. */
export function LoginScreen() {
  const { login, ready } = useWorkspace();
  return <LoginForm login={login} ready={ready} />;
}
