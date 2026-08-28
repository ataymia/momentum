"use client";

import { AlertTriangle, BellRing, Check, Cloud, CreditCard, Database, HardDrive, KeyRound, LockKeyhole, Mail, RefreshCcw, SearchCheck, ShieldCheck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { AUDIT_STORAGE_KEY } from "../../lib/audit-engine";
import { NOTIFICATION_STORAGE_KEY } from "../../lib/notification-engine";
import { PERIOD_LOCK_STORAGE_KEY } from "../../lib/period-lock-engine";
import { useRuntimeMode } from "../../lib/runtime-mode";
import { useWorkspace } from "../../lib/workspace-context";
import { PlatformControls } from "../settings/platform-controls";
import { Avatar, Button, Modal, PageHeader, Section, StatusPill } from "../ui";

const integrations = [
  { name:"Identity & access", provider:"Firebase Authentication", icon:KeyRound, boundary:"Sign-in, MFA, sessions, role claims", status:"Configuration required", tone:"warning" as const },
  { name:"Operational records", provider:"Cloud Firestore", icon:Database, boundary:"CRM, inventory, HR, payroll, finance, marketing, approvals and audit events", status:"Configuration required", tone:"warning" as const },
  { name:"Files & evidence", provider:"Firebase Storage", icon:HardDrive, boundary:"Receipts, employee documents, training evidence, photos and proof documents", status:"Configuration required", tone:"warning" as const },
  { name:"Hosting", provider:"Cloudflare", icon:Cloud, boundary:"Production hosting, edge delivery, DNS and environment controls", status:"Integration remaining", tone:"warning" as const },
  { name:"Payments", provider:"External tokenized money rail", icon:CreditCard, boundary:"Processor moves money; Momentum owns orders, invoices, settlement state, refunds, reconciliation and audit", status:"Rail not selected", tone:"warning" as const },
  { name:"Payroll", provider:"Native Momentum payroll engine", icon:WalletCards, boundary:"Time, earnings, monthly bonuses, deductions, approvals, pay runs, statements, liabilities and disbursement instructions", status:"Product layer built", tone:"success" as const },
  { name:"Notifications", provider:"Native rules + external email/SMS transport", icon:Mail, boundary:"Momentum owns rules, recipients, escalation, preferences and delivery records; transport provider only sends", status:"Rules built; transport later", tone:"gold" as const },
];

const resetKeys = [
  "momentum-demo-workspace-v5",
  "momentum-crm-v1",
  "momentum-hcm-v4",
  "momentum-performance-v1",
  "momentum-commerce-v1",
  "momentum-inventory-ledger-v1",
  "momentum-finance-v3",
  "momentum-accounting-v1",
  "momentum-marketing-v1",
  "momentum-payroll-v5",
  AUDIT_STORAGE_KEY,
  NOTIFICATION_STORAGE_KEY,
  PERIOD_LOCK_STORAGE_KEY,
];

export function SettingsPage() {
  const { data } = useWorkspace();
  const runtime = useRuntimeMode();
  const [resetOpen,setResetOpen]=useState(false);
  const [resetDone,setResetDone]=useState(false);
  const health = useMemo(() => {
    const today=new Date().toISOString().slice(0,10);
    const customerIds=new Set((data.customers??[]).map((customer)=>customer.id));
    const missingHierarchy=data.accounts.filter((location)=>!location.customerId||!customerIds.has(location.customerId)||!location.locationName);
    const unassigned=data.appointments.filter((appointment)=>appointment.status==="Scheduled"&&!appointment.ownerId&&appointment.date<=today);
    const overdueApprovals=data.approvals.filter((approval)=>approval.status==="Pending"&&approval.dueAt<new Date().toISOString());
    const staleActions=data.accounts.filter((location)=>location.nextActionDate<today);
    const qualityHolds=data.inventory.filter((lot)=>lot.status==="Quality hold");
    const paidWithoutDate=data.orders.filter((order)=>order.paymentStatus==="Paid"&&!order.paidAt);
    const issues=[
      {label:"Hierarchy exceptions",count:missingHierarchy.length,detail:"Locations missing a valid parent customer or location label"},
      {label:"Unassigned due work",count:unassigned.length,detail:"Scheduled work due today or earlier with no assignee"},
      {label:"Overdue approvals",count:overdueApprovals.length,detail:"Pending decisions past their due timestamp"},
      {label:"Overdue next actions",count:staleActions.length,detail:"Locations whose promised next-action date has passed"},
      {label:"Quality holds",count:qualityHolds.length,detail:"Inventory unavailable pending disposition"},
      {label:"Paid records missing settlement date",count:paidWithoutDate.length,detail:"Records marked paid without a settlement date"},
    ];
    return {issues,total:issues.reduce((sum,item)=>sum+item.count,0)};
  },[data]);

  const performReset=()=>{
    if(!runtime.isDemo)return;
    resetKeys.forEach((key)=>window.localStorage.removeItem(key));
    setResetOpen(false);setResetDone(true);
    window.setTimeout(()=>window.location.reload(),120);
  };

  return <div className="page page--settings">
    <PageHeader eyebrow="Administration" title="Administration" description="Runtime mode, permissions, audit, notification rules, period locks, production architecture, and data health." actions={<StatusPill tone={runtime.isDemo?"gold":"success"}>{runtime.isDemo?"Demo mode":"Production mode"}</StatusPill>}/>
    <div className="settings-security-banner"><span><ShieldCheck size={22}/></span><div><strong>{runtime.isDemo?"Product-complete demo layer":"Production-mode standalone test"}</strong><p>Core workflows are native Momentum logic. Live employee, customer, payment, notification, and file data still requires the remaining Firebase, Cloudflare, payment-rail, and email/SMS integrations.</p></div><StatusPill tone={runtime.isDemo?"warning":"success"}>{runtime.isDemo?"Demo persistence":"Reset disabled"}</StatusPill></div>

    <PlatformControls/>

    <div className="settings-grid">
      <Section title="Production architecture" description="Infrastructure plugs into Momentum without becoming a second business system" className="integration-panel"><div className="integration-list">{integrations.map((integration)=>{const Icon=integration.icon;return <article key={integration.name}><span><Icon size={19}/></span><div><strong>{integration.name}</strong><p>{integration.provider}</p><small>{integration.boundary}</small></div><StatusPill tone={integration.tone} dot={false}>{integration.status}</StatusPill></article>;})}</div><div className="integration-rule"><Cloud size={18}/><p>Every connector must fail visibly, retry safely, reconcile to a Momentum source record, and never create a hidden second source of truth.</p></div></Section>
      <Section title={runtime.isDemo?"Demo users":"Test identities"} description="Switch roles from the profile menu to verify permissions" className="settings-users">{data.users.map((user)=><article key={user.id}><Avatar initials={user.initials} color={user.accent}/><div><strong>{user.name}</strong><p>{user.title}</p><small>{user.email}</small></div><StatusPill tone={user.role==="Administrator"?"gold":"neutral"} dot={false}>{user.role}</StatusPill></article>)}</Section>
    </div>

    <Section title="Data health" description="Operational truth should fail loudly when required links, dates, owners, or controls are missing" action={<StatusPill tone={health.total?"warning":"success"}>{health.total} open signal{health.total===1?"":"s"}</StatusPill>}>
      <div className="accounting-rule-list">{health.issues.map((issue)=><article key={issue.label}><span>{issue.count?<AlertTriangle size={17}/>:<SearchCheck size={17}/>}</span><div><strong>{issue.label}</strong><p>{issue.detail}</p></div><StatusPill tone={issue.count?"warning":"success"}>{issue.count}</StatusPill></article>)}</div><div className="form-callout"><SearchCheck size={17}/><p>This is a diagnostic surface, not an auto-fix button. Material data exceptions must be corrected at their source record so the audit history stays intact.</p></div>
    </Section>

    <Section title="Role & permission model" description="Navigation, record queries and actions enforce scope; Firebase rules must repeat these boundaries server-side" className="permission-panel"><div className="permission-table permission-table--head"><span>Capability</span><span>Administrator</span><span>Manager</span><span>Sales rep</span><span>Operations</span><span>Customer</span></div>{[["Company and team reporting","All","Managed team","Own","Assigned",false],["Customer/location CRM","All","Managed team","Responsible",false,"Linked locations"],["Dispatch and closeout","All","Managed team","Assigned work","Delivery work",false],["Orders & billing","Create / approve","Team approval","Create / own","Fulfill","Create / own"],["Inventory custody & holds","All",false,false,"Manage",false],["Human Resources","All","Team approvals + own","Own","Own",false],["Payroll","Company process + own","Own","Own","Own",false],["Finance / reimbursements","Company + own","Team review + own","Own","Own",false],["Marketing","Manage + request","Request / view","Request / view","Request / view",false],["Audit history","All","Managed scope","Relevant operational","Relevant operational",false],["Notifications","Policy + own","Own","Own","Own","Customer events"],["Users, roles, integrations","All",false,false,false,false]].map(([capability,admin,manager,rep,operations,customer])=><div className="permission-table" key={capability as string}><span><strong>{capability as string}</strong></span>{[admin,manager,rep,operations,customer].map((value,index)=><span key={index}>{value===true?<i className="permission-check"><Check size={14}/></i>:value===false?<i className="permission-none">—</i>:<small>{value as string}</small>}</span>)}</div>)}</Section>

    <div className="settings-bottom-grid"><Section title="Security baseline" description="Required before live customer, employee, inventory, payroll or financial records" className="security-checklist">{[[LockKeyhole,"Firebase-enforced authorization","Every record and mutation"],[ShieldCheck,"Server-immutable audit storage","Native audit engine is built; production storage must make it tamper-resistant"],[BellRing,"Server-side notification delivery","Native rules are built; provider delivery, retries and background escalation remain"],[RefreshCcw,"Backup and restore tests","Demonstrated recovery, not assumptions"]].map(([Icon,title,detail])=>{const ItemIcon=Icon as typeof ShieldCheck;return <div key={title as string}><span><ItemIcon size={17}/></span><div><strong>{title as string}</strong><p>{detail as string}</p></div><StatusPill tone="warning" dot={false}>Integration gate</StatusPill></div>;})}</Section>{runtime.isDemo?<Section title="Demo data" description="Reset all browser-local engines together" className="demo-settings"><Database size={30}/><h3>Reset the interactive tour</h3><p>Clears CRM, HCM, performance, order-to-cash, inventory custody, Finance, accounting, Marketing, payroll, audit, notifications, period locks, and the core workspace.</p><Button variant="danger" icon={<RefreshCcw size={16}/>} onClick={()=>setResetOpen(true)}>Reset entire demo</Button></Section>:<Section title="Production data protection" description="There is intentionally no production reset action" className="demo-settings"><ShieldCheck size={30}/><h3>Reset is unavailable</h3><p>Production mode never renders a reset button. Corrections must happen through source-record workflows and remain auditable.</p><StatusPill tone="success">Protected</StatusPill></Section>}</div>

    {runtime.isDemo&&<Modal open={resetOpen} title="Reset the entire demo workspace?" description="Every local demo engine will be cleared and rebuilt from the current sample scenario." onClose={()=>setResetOpen(false)} footer={<><Button variant="ghost" onClick={()=>setResetOpen(false)}>Keep my changes</Button><Button variant="danger" onClick={performReset}>Reset all demo data</Button></>}><div className="reset-confirmation"><RefreshCcw size={24}/><p>Only local fictional data is affected. No Firebase tenancy or money rail is connected.</p></div></Modal>}
    {resetDone&&<StatusPill tone="success">Resetting…</StatusPill>}
  </div>;
}
