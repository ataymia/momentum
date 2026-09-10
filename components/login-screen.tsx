"use client";

import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { BrandMark, Button } from "./ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function LoginScreen() {
  const { login, ready } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); const result = login(email, password); if (!result.ok) setError(result.message ?? "Could not sign in."); };
  if (!ready) return <main className="login-loading"><BrandMark /><span className="loading-line" /></main>;

  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__glow login-hero__glow--one" /><div className="login-hero__glow login-hero__glow--two" />
      <div className="login-hero__top"><BrandMark /></div>
      <div className="login-hero__content"><Image className="login-official-logo" src={`${basePath}/momentum-golden-eagle.webp`} alt="Momentum Distribution Inc. Golden Eagle Energy Drink" width={720} height={360} priority unoptimized /></div>
      <footer className="login-hero__footer"><span>Authorized access only</span></footer>
    </section>
    <section className="login-panel"><div className="login-panel__inner"><div className="login-panel__heading"><span className="login-panel__icon"><LockKeyhole size={20} /></span><div><h2>Sign in</h2><p>Use your Momentum work account.</p></div></div><form className="login-form" onSubmit={submit}><label><span>Work email</span><input type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" /></label><label><span>Password</span><div className="password-input"><input type={showPassword ? "text" : "password"} required value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" size="lg" icon={<ArrowRight size={18} />}>Sign in</Button></form></div></section>
  </main>;
}
