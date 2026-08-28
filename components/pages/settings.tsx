"use client";

import { BellRing, Check, Cloud, CreditCard, Database, HardDrive, KeyRound, LockKeyhole, Mail, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Modal, PageHeader, Section, StatusPill } from "../ui";

const integrations = [
  { name: "Identity & access", provider: "Firebase Authentication", icon: KeyRound, boundary: "Sign-in, MFA, sessions, role claims", status: "Planned", tone: "info" as const },
  { name: "Operational records", provider: "Cloud Firestore", icon: Database, boundary: "CRM, inventory, HR, payroll, finance, marketing, approvals and audit events", status: "Planned", tone: "info" as const },
  { name: "Files & evidence", provider: "Firebase Storage", icon: HardDrive, boundary: "Receipts, employee documents, training evidence, photos and proof documents", status: "Planned", tone: "info" as const },
  { name: "Hosting", provider: "Cloudflare or GoDaddy deployment", icon: Cloud, boundary: "Final host selected after deployment fit review", status: "Decision pending", tone: "warning" as const },
  { name: "Payments", provider: "External money rail, Momentum-controlled workflow", icon: CreditCard, boundary: "Tokenized payment method, settlement, refunds and disputes; Momentum keeps the business records", status: "Not selected", tone: "warning" as const },
  { name: "Payroll disbursement", provider: "Momentum payroll engine → selected bank/payment rail", icon: WalletCards, boundary: "Momentum calculates, approves, records and reconciles payroll; the rail only moves funds", status: "Engine in build", tone: "gold" as const },
  { name: "Email & SMS", provider: "Future approved messaging connector", icon: Mail, boundary: "Delivery, replies, consent and audit", status: "Later", tone: "neutral" as const },
];

const departmentDemoKeys = ["momentum-marketing-v2", "momentum-finance-v2", "momentum-payroll-v2", "momentum-hr-v2"];

export function SettingsPage() {
  const { data, resetDemo } = useWorkspace();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const performReset = () => {
    departmentDemoKeys.forEach((key) => window.localStorage.removeItem(key));
    resetDemo();
    setResetOpen(false);
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2500);
  };

  return <div className="page page--settings">
    <PageHeader eyebrow="Administration" title="Workspace settings" description="Production architecture, roles, security posture, and demo controls." actions={resetDone ? <StatusPill tone="success"><Check size={14} /> Demo reset</StatusPill> : undefined}/>
    <div className="settings-security-banner"><span><ShieldCheck size={22} /></span><div><strong>Interactive frontend tour</strong><p>The `admin` password and browser-local persistence exist only so the workflow can be tested before Firebase is connected.</p></div><StatusPill tone="warning">Local demo</StatusPill></div>
    <div className="settings-grid">
      <Section title="Production architecture" description="Momentum owns the business logic and records; outside services are infrastructure or money-movement rails" className="integration-panel"><div className="integration-list">{integrations.map((integration) => { const Icon = integration.icon; return <article key={integration.name}><span><Icon size={19} /></span><div><strong>{integration.name}</strong><p>{integration.provider}</p><small>{integration.boundary}</small></div><StatusPill tone={integration.tone} dot={false}>{integration.status}</StatusPill></article>; })}</div><div className="integration-rule"><Cloud size={18} /><p>Every connector must fail visibly, retry safely, reconcile to source records, and never create a second hidden business truth.</p></div></Section>
      <Section title="Demo users" description="Switch roles from the profile menu to verify permissions" className="settings-users">{data.users.map((user) => <article key={user.id}><Avatar initials={user.initials} color={user.accent} /><div><strong>{user.name}</strong><p>{user.title}</p><small>{user.email}</small></div><StatusPill tone={user.role === "Administrator" ? "gold" : "neutral"} dot={false}>{user.role}</StatusPill></article>)}</Section>
    </div>
    <Section title="Role & permission model" description="These scopes are enforced in navigation, record queries, search and actions; Firebase rules must repeat the same authority server-side" className="permission-panel"><div className="permission-table permission-table--head"><span>Capability</span><span>Administrator</span><span>Manager</span><span>Sales rep</span><span>Operations</span><span>Customer</span></div>{[["Company and team reporting", "All", "Managed team", "Own", "Assigned", false],["Account, pricing and incentive records", "All", "Managed team", "Responsible", false, "Linked account pricing"],["Schedule, dispatch and closeout", "All", "Managed team", "Assigned work", "Assigned work", false],["Orders", "Create / approve", "Team approval", "Create / own", "Fulfill", "Create / own"],["Inventory movements and holds", "All", false, false, "Manage", false],["People, time and HR self-service", "All", "Team approvals + own", "Own", "Own", false],["Payroll", "Company process + own", "Own", "Own", "Own", false],["Finance / reimbursements", "Company + own", "Team review + own", "Own", "Own", false],["Marketing", "Manage + request", "Request / view", "Request / view", "Request / view", false],["Dashboard bulletins", "Company / any team", "Managed team", "View assigned", "View assigned", false],["Users, roles, integrations", "All", false, false, false, false]].map(([capability, admin, manager, rep, operations, customer]) => <div className="permission-table" key={capability as string}><span><strong>{capability as string}</strong></span>{[admin, manager, rep, operations, customer].map((value, index) => <span key={index}>{value === true ? <i className="permission-check"><Check size={14} /></i> : value === false ? <i className="permission-none">—</i> : <small>{value as string}</small>}</span>)}</div>)}</Section>
    <div className="settings-bottom-grid"><Section title="Security baseline" description="Required before any live customer, employee, inventory, payroll or financial record" className="security-checklist">{[[LockKeyhole, "Firebase-enforced authorization", "Every record and action"],[ShieldCheck, "Immutable material audit trail", "Actor, before/after, reason and time"],[BellRing, "Incident and exception alerts", "Owners, deadlines and escalation"],[RefreshCcw, "Backup and restore tests", "Evidence, not assumptions"]].map(([Icon, title, detail]) => { const ItemIcon = Icon as typeof ShieldCheck; return <div key={title as string}><span><ItemIcon size={17} /></span><div><strong>{title as string}</strong><p>{detail as string}</p></div><StatusPill tone="warning" dot={false}>Required</StatusPill></div>; })}</Section><Section title="Demo data" description="Browser-local records are versioned so old demo data cannot mask a new build" className="demo-settings"><Database size={30} /><h3>Reset the interactive tour</h3><p>Restore the current fictional accounts, orders, placements, approvals, timecards, HR, payroll, Finance, and Marketing demo records together.</p><Button variant="danger" icon={<RefreshCcw size={16} />} onClick={() => setResetOpen(true)}>Reset demo workspace</Button></Section></div>
    <Modal open={resetOpen} title="Reset the demo workspace?" description="This replaces locally changed core and department demo records with the current sample scenario." onClose={() => setResetOpen(false)} footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Keep my changes</Button><Button variant="danger" onClick={performReset}>Reset demo</Button></>}><div className="reset-confirmation"><RefreshCcw size={24} /><p>Only local fictional data is affected. No live Firebase project or payment processor is connected.</p></div></Modal>
  </div>;
}