"use client";

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../lib/workspace-context";
import { BrandMark, Button } from "./ui";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const tourIds = ["usr-flo", "usr-mia", "usr-avery", "usr-jordan", "usr-customer"] as const;
const tourCopy: Record<(typeof tourIds)[number], string> = {
  "usr-flo": "Full company view",
  "usr-mia": "Cross-functional operations",
  "usr-avery": "Team workflow and approvals",
  "usr-jordan": "Assigned sales work",
  "usr-customer": "Business account and ordering",
};

export function LoginScreen() {
  const { data, login, ready } = useWorkspace();
  const [email, setEmail] = useState("director@momentum.demo");
  const [password, setPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); const result = login(email, password); if (!result.ok) setError(result.message ?? "Could not sign in."); };
  const tourUsers = tourIds.map((id) => data.users.find((user) => user.id === id)).filter((user): user is NonNullable<typeof user> => Boolean(user));
  if (!ready) return <main className="login-loading"><BrandMark /><span className="loading-line" /></main>;

  return <main className="login-page">
    <section className="login-hero">
      <div className="login-hero__glow login-hero__glow--one" /><div className="login-hero__glow login-hero__glow--two" />
      <div className="login-hero__top"><BrandMark /><span className="demo-chip">Platform walkthrough</span></div>
      <div className="login-hero__content"><img className="login-official-logo" src={`${basePath}/momentum-golden-eagle.webp`} alt="Momentum Distribution Inc. Golden Eagle Energy Drink" /><p className="login-kicker">Momentum Distribution business platform</p><h1>Sales, operations, people, and finance in one workspace.</h1><p className="login-hero__copy">This demo follows the work from customer setup and field activity through orders, fulfillment, payment, payroll, reporting, and audit history.</p><div className="operating-chain" aria-label="Operating workflow">{[["01", "Sales", "Accounts and pipeline"], ["02", "Field work", "Dispatch and placement"], ["03", "Fulfillment", "Orders and inventory"], ["04", "Controls", "Approvals, payroll, and reporting"]].map(([number, title, description]) => <div className="operating-chain__item" key={number}><span>{number}</span><div><strong>{title}</strong><small>{description}</small></div></div>)}</div></div>
      <footer className="login-hero__footer"><ShieldCheck size={17} /><span>Demo records only. Firebase, payment rails, and outbound notifications are not connected yet.</span></footer>
    </section>
    <section className="login-panel"><div className="login-panel__inner"><div className="login-panel__heading"><span className="login-panel__icon"><LockKeyhole size={20} /></span><div><p>Momentum Distribution</p><h2>Sign in</h2></div></div><p className="login-panel__intro">Choose a role to show the platform from that user&apos;s point of view.</p><form className="login-form" onSubmit={submit}><label><span>Work email</span><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" /></label><label><span>Password</span><div className="password-input"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" size="lg" icon={<ArrowRight size={18} />}>Enter workspace</Button></form><div className="demo-access"><div className="demo-access__title"><span>Presentation roles</span><small>Password: <b>admin</b></small></div><div className="demo-access__users">{tourUsers.map((user) => <button key={user.id} onClick={() => { setEmail(user.email); setPassword("admin"); setError(""); }} className={email === user.email ? "is-selected" : ""}><span style={{ background: user.accent }}>{user.initials}</span><div><strong>{user.firstName}</strong><small>{tourCopy[user.id as (typeof tourIds)[number]]}</small></div>{email === user.email && <Check size={16} />}</button>)}</div></div><p className="login-disclaimer">The walkthrough uses fictional contacts and sample records. No live customer, employee, inventory, payroll, or financial data is included.</p></div></section>
  </main>;
}
