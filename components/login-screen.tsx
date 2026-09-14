"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole, UserPlus } from "lucide-react";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { BrandMark, Button } from "./ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type LoginResult = { ok: boolean; message?: string };
export type LoginFormProps = {
  login: (email: string, password: string) => LoginResult | Promise<LoginResult>;
  ready: boolean;
  /** Present only when Firebase Authentication is connected. */
  requestPasswordReset?: (email: string) => Promise<LoginResult>;
  /** Temporary founding-account creation path. Remove after both founding Administrators are provisioned. */
  createAccount?: (email: string, password: string) => Promise<LoginResult>;
  subtitle?: string;
};

export function LoginForm({ login, ready, requestPasswordReset, createAccount, subtitle = "Use your Momentum work account." }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await login(email, password);
      if (!result.ok) setError(result.message ?? "Could not sign in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!createAccount || busy) return;
    if (!email.trim() || !password) { setError("Enter the founding work email and a password first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createAccount(email, password);
      if (!result.ok) setError(result.message ?? "Could not create the account.");
      else if (result.message) setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!requestPasswordReset || busy) return;
    if (!email.trim()) { setError("Enter your work email first, then choose “Forgot password”."); return; }
    setBusy(true); setError(""); setNotice("");
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (result.ok) setNotice(result.message ?? "Password reset e-mail sent."); else setError(result.message ?? "Could not send the reset e-mail.");
  };

  if (!ready) return <main className="login-loading"><BrandMark /><span className="loading-line" /></main>;

  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__glow login-hero__glow--one" /><div className="login-hero__glow login-hero__glow--two" />
      <div className="login-hero__top"><BrandMark /></div>
      <div className="login-hero__content"><Image className="login-official-logo" src={`${basePath}/momentum-golden-eagle.webp`} alt="Momentum Distribution Inc. Golden Eagle Energy Drink" width={720} height={360} priority unoptimized /></div>
      <footer className="login-hero__footer"><span>Authorized access only</span></footer>
    </section>
    <section className="login-panel"><div className="login-panel__inner"><div className="login-panel__heading"><span className="login-panel__icon"><LockKeyhole size={20} /></span><div><h2>Sign in</h2><p>{subtitle}</p></div></div><form className="login-form" onSubmit={submit}><label><span>Work email</span><input type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" /></label><label><span>Password</span><div className="password-input"><input type={showPassword ? "text" : "password"} required value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-notice" role="status">{notice}</p>}<Button type="submit" size="lg" disabled={busy} icon={<ArrowRight size={18} />}>{busy ? "Working…" : "Sign in"}</Button>{createAccount && <Button type="button" size="lg" variant="secondary" disabled={busy} icon={<UserPlus size={18} />} onClick={() => void create()}>{busy ? "Working…" : "Create founding account"}</Button>}{requestPasswordReset && <button type="button" className="login-link" onClick={reset} disabled={busy}>Forgot password?</button>}</form></div></section>
  </main>;
}

/** Local demo sign-in backed by the workspace provider. Production uses `FirebaseGate`, which renders `LoginForm` directly. */
export function LoginScreen() {
  const { login, ready } = useWorkspace();
  return <LoginForm login={login} ready={ready} />;
}
