"use client";

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { BrandMark, Button } from "./ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function LoginScreen() {
  const { data, login, ready } = useWorkspace();
  const [email, setEmail] = useState("mia@momentum.demo");
  const [password, setPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); const result = login(email, password); if (!result.ok) setError(result.message ?? "Could not sign in."); };
  if (!ready) return <main className="login-loading"><BrandMark /><span className="loading-line" /></main>;

  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__glow login-hero__glow--one" /><div className="login-hero__glow login-hero__glow--two" />
      <div className="login-hero__top"><BrandMark /><span className="demo-chip">Interactive platform demo</span></div>
      <div className="login-hero__content"><img className="login-official-logo" src={`${basePath}/momentum-golden-eagle.webp`} alt="Momentum Distribution Inc. Golden Eagle Energy Drink" /><p className="login-kicker">One operating system. One source of truth.</p><h1>Run the market.<br /><span>Keep the momentum.</span></h1><p className="login-hero__copy">From the first buyer conversation to placement, reorder, delivery, payment, and payroll, every handoff stays connected.</p><div className="operating-chain" aria-label="Operating workflow">{[["01", "Sell", "Accounts & pipeline"], ["02", "Execute", "Dispatch & placement"], ["03", "Deliver", "Orders & inventory"], ["04", "Control", "Approvals & payroll"]].map(([number, title, description]) => <div className="operating-chain__item" key={number}><span>{number}</span><div><strong>{title}</strong><small>{description}</small></div></div>)}</div></div>
      <footer className="login-hero__footer"><ShieldCheck size={17} /><span>Local demo data only · Firebase and payment rails are not connected</span></footer>
    </section>
    <section className="login-panel"><div className="login-panel__inner"><div className="login-panel__heading"><span className="login-panel__icon"><LockKeyhole size={20} /></span><div><p>Momentum Distribution</p><h2>Welcome back</h2></div></div><p className="login-panel__intro">Sign in to tour the connected business platform.</p><form className="login-form" onSubmit={submit}><label><span>Work email</span><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" /></label><label><span>Password</span><div className="password-input"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" size="lg" icon={<ArrowRight size={18} />}>Enter workspace</Button></form><div className="demo-access"><div className="demo-access__title"><span>Tour another role</span><small>Password: <b>admin</b></small></div><div className="demo-access__users">{data.users.map((user) => <button key={user.id} onClick={() => { setEmail(user.email); setPassword("admin"); setError(""); }} className={email === user.email ? "is-selected" : ""}><span style={{ background: user.accent }}>{user.initials}</span><div><strong>{user.firstName}</strong><small>{user.role}</small></div>{email === user.email && <Check size={16} />}</button>)}</div></div><p className="login-disclaimer">This tour uses fictional contacts and sample records. No live customer, employee, inventory, payroll, or financial data is present.</p></div></section>
  </main>;
}
