"use client";

import { AlertTriangle, BellRing, Check, Cloud, CreditCard, Database, HardDrive, KeyRound, LockKeyhole, Mail, RefreshCcw, SearchCheck, ShieldCheck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { ACCOUNTING_STORAGE_KEY } from "../../lib/accounting-engine";
import { AUDIT_STORAGE_KEY } from "../../lib/audit-engine";
import { COMMERCE_STORAGE_KEY } from "../../lib/commerce-engine";
import { CRM_STORAGE_KEY } from "../../lib/crm-engine";
import { DOCUMENT_TEMPLATE_STORAGE_KEY } from "../../lib/document-template-engine";
import { arizonaDateKey } from "../../lib/date-time";
import { FINANCE_STORAGE_KEY } from "../../lib/finance-engine";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { HCM_STORAGE_KEY } from "../../lib/hcm-engine";
import { IDENTITY_PROVISIONING_STORAGE_KEY } from "../../lib/identity-provisioning";
import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";
import { FIELD_TRACKING_STORAGE_KEY } from "../../lib/location-tracking-engine";
import { MARKETING_STORAGE_KEY } from "../../lib/marketing-engine";
import { NOTIFICATION_STORAGE_KEY } from "../../lib/notification-engine";
import { PAYROLL_STORAGE_KEY } from "../../lib/payroll-engine";
import { PERFORMANCE_STORAGE_KEY } from "../../lib/performance-engine";
import { PERIOD_LOCK_STORAGE_KEY } from "../../lib/period-lock-engine";
import { useRuntimeMode } from "../../lib/runtime-mode";
import { useWorkspace } from "../../lib/workspace-context";
import { FirebaseAccessPanel } from "../settings/firebase-access-panel";
import { PerformanceHealthPanel } from "../settings/performance-health-panel";
import { PlatformControls } from "../settings/platform-controls";
import { AdminAuditBot } from "../audit/admin-audit-bot";
import { Avatar, Button, Modal, PageHeader, Section, StatusPill } from "../ui";

const integrations = [
  { name:"Identity & access", provider:"Firebase Authentication", icon:KeyRound, boundary:"Sign-in, password rotation, sessions; roles live in Firestore access records", status:"Configuration required", tone:"warning" as const, firebase:true },
  { name:"Operational records", provider:"Cloud Firestore", icon:Database, boundary:"CRM, inventory, HR, payroll, finance, marketing, approvals and audit events", status:"Configuration required", tone:"warning" as const, firebase:true },
  { name:"Files & evidence", provider:"Firebase Storage", icon:HardDrive, boundary:"Receipts, employee documents, training evidence, photos and proof documents", status:"Private upload/download and archive verification pending", tone:"warning" as const },
  { name:"Hosting", provider:"Hosting configuration", icon:Cloud, boundary:"Production hostname, deep-link fallback, DNS and environment controls require deployment acceptance", status:"Release verification pending", tone:"warning" as const },
  { name:"Payments", provider:"Processor approval pending", icon:CreditCard, boundary:"Compare approved tokenized ACH/card rails, hosted invoices, webhooks, refunds and reconciliation before activation", status:"No processor or live payment rail verified", tone:"warning" as const },
  { name:"Payroll", provider:"Internal payroll prototype", icon:WalletCards, boundary:"Simulated approvals, earnings, adjustments, liabilities and settlements only in isolated administrator demo. Not an approved tax processor.", status:"Production release blocked", tone:"warning" as const },
  { name:"Notifications", provider:"Native rules + external email/SMS transport", icon:Mail, boundary:"Event rules need verified delivery, retry, permissions and channel receipts in staging", status:"External delivery unverified", tone:"warning" as const },
];

const resetKeys = [
  "momentum-demo-workspace-v5",
  "momentum-commercial-controls-v1",
  "momentum-warehouse-session-v1",
  "momentum-managed-device-id-v1",
  CRM_STORAGE_KEY,
  HCM_STORAGE_KEY,
  IDENTITY_PROVISIONING_STORAGE_KEY,
  DOCUMENT_TEMPLATE_STORAGE_KEY,
  PERFORMANCE_STORAGE_KEY,
  COMMERCE_STORAGE_KEY,
  INVENTORY_LEDGER_STORAGE_KEY,
  FINANCE_STORAGE_KEY,
  ACCOUNTING_STORAGE_KEY,
  MARKETING_STORAGE_KEY,
  PAYROLL_STORAGE_KEY,
  FIELD_TRACKING_STORAGE_KEY,
  AUDIT_STORAGE_KEY,
  NOTIFICATION_STORAGE_KEY,
  PERIOD_LOCK_STORAGE_KEY,
];
const resetSessionKeys = [
  "momentum-focus-record",
  "momentum-order-intent",
  "momentum-order-product",
  "momentum-order-source-placement",
  "momentum-people-tab",
];

export function SettingsPage() {
  const { data } = useWorkspace();
  const runtime = useRuntimeMode();
  const firebase = useFirebaseSessionOptional();
  const [resetOpen,setResetOpen]=useState(false);
  const [resetDone,setResetDone]=useState(false);
  const health = useMemo(() => {
    const today=arizonaDateKey();
    const customerIds=new Set((data.customers??[]).map((customer)=>customer.id));
    const missingHierarchy=data.accounts.filter((location)=>!location.customerId||!customerIds.has(location.customerId)||!location.locationName);
    const unassigned=data.appointments.filter((appointment)=>appointment.status==="Scheduled"&&!appointment.ownerId&&appointment.date<=today);
    const overdueApprovals=data.approvals.filter((approval)=>approval.status==="Pending"&&approval.dueAt<new Date().toISOString());
    const qualityHolds=data.inventory.filter((lot)=>lot.status==="Quality hold");
    const paidWithoutDate=data.orders.filter((order)=>order.paymentStatus==="Paid"&&!order.paidAt);
    const issues=[
      {label:"Hierarchy exceptions",count:missingHierarchy.length,detail:"Locations missing a valid parent customer or location label"},
      {label:"Unassigned due work",count:unassigned.length,detail:"Scheduled work due today or earlier with no assignee"},
      {label:"Overdue approvals",count:overdueApprovals.length,detail:"Pending decisions past their due timestamp"},
      {label:"Quality holds",count:qualityHolds.length,detail:"Inventory unavailable pending disposition"},
      {label:"Paid records missing settlement date",count:paidWithoutDate.length,detail:"Records marked paid without a settlement date"},
    ];
    return {issues,total:issues.reduce((sum,item)=>sum+item.count,0)};
  },[data]);

  const performReset=()=>{
    if(!runtime.isDemo)return;
    resetKeys.forEach((key)=>window.localStorage.removeItem(key));
    resetSessionKeys.forEach((key)=>window.sessionStorage.removeItem(key));
    setResetOpen(false);setResetDone(true);
    window.setTimeout(()=>window.location.reload(),120);
  };

  return <div className="page page--settings">
    <PageHeader eyebrow="Administration" title="Administration" actions={<StatusPill tone="warning">{runtime.isDemo?"Isolated demo":"Connected-mode preview, release not accepted"}</StatusPill>}/>
    <div className="settings-security-banner"><span><ShieldCheck size={22}/></span><div><strong>{runtime.isDemo?"Working demo, not production-certified":firebase?`Authenticated session · Firebase project ${firebase.projectId}`:"Standalone mode · release unverified"}</strong><p>{firebase?"Firebase access is present. Employee confidentiality, payroll access, cross-role authorization, e-signatures, and transaction reconciliation still require real-user staging acceptance.":"Existing Momentum workflows need verified hosting, authentication, authorized storage, payment, payroll and notification integrations before release."}</p></div><StatusPill tone="warning">{runtime.isDemo?"Demo persistence":firebase?"Connected session; acceptance pending":"No release verification"}</StatusPill></div>

    {firebase&&<FirebaseAccessPanel/>}

    <PerformanceHealthPanel/>
    <PlatformControls/>
    <AdminAuditBot/>

    <div className="settings-grid">
      <Section title="Integration readiness" description="Runtime availability is not proof of production approval. Confirm credentials, authorization and a successful end-to-end test before marking connected." className="integration-panel"><div className="integration-list">{integrations.map((integration)=>{const Icon=integration.icon;const live=Boolean(firebase&&integration.firebase);return <article key={integration.name}><span><Icon size={19}/></span><div><strong>{integration.name}</strong><p>{integration.provider}</p><small>{integration.boundary}</small></div><StatusPill tone="warning" dot={false}>{live?"Session available; staging review pending":integration.status}</StatusPill></article>;})}</div><div className="integration-rule"><Cloud size={18}/><p>Every connector must fail visibly, retry safely, reconcile to a Momentum source record, and never create a hidden second source of truth.</p></div></Section>
      <Section title={runtime.isDemo?"Demo users":"Company identities"} description="Role visibility follows the authenticated account" className="settings-users">{data.users.map((user)=><article key={user.id}><Avatar initials={user.initials} color={user.accent}/><div><strong>{user.name}</strong><p>{user.title}</p><small>{user.email}</small></div><StatusPill tone={user.role==="Administrator"?"gold":"neutral"} dot={false}>{user.role}</StatusPill></article>)}</Section>
    </div>

    <Section title="Data health" action={<StatusPill tone={health.total?"warning":"success"}>{health.total} open signal{health.total===1?"":"s"}</StatusPill>}>
      <div className="accounting-rule-list">{health.issues.map((issue)=><article key={issue.label}><span>{issue.count?<AlertTriangle size={17}/>:<SearchCheck size={17}/>}</span><div><strong>{issue.label}</strong><p>{issue.detail}</p></div><StatusPill tone={issue.count?"warning":"success"}>{issue.count}</StatusPill></article>)}</div><div className="form-callout"><SearchCheck size={17}/><p>This is a diagnostic surface, not an auto-fix button. Material data exceptions must be corrected at their source record so the audit history stays intact.</p></div>
    </Section>

    <Section title="Role & permission model" description="Navigation, record queries and actions enforce scope; Firebase rules must repeat these boundaries server-side" className="permission-panel"><div className="permission-table permission-table--head"><span>Capability</span><span>Administrator</span><span>Manager</span><span>Sales rep</span><span>Operations</span><span>Customer</span></div>{[["Company and team reporting","All","Managed team","Own","Assigned",false],["Customer/location CRM","All","Managed team","Responsible",false,"Linked locations"],["Dispatch and closeout","All","Managed team","Assigned work","Delivery work",false],["Orders & billing","Create / approve","Team approval","Create / own","Fulfill","Create / own"],["Inventory custody & holds","All",false,false,"Manage",false],["Human Resources","All","Team approvals + own","Own","Own",false],["Payroll","Demo-only administration","Not released","Not released","Not released",false],["Finance / reimbursements","Company + own","Team review + own","Own","Own",false],["Marketing","Manage + request","Request / view","Request / view","Request / view",false],["Audit history","All","Managed scope","Relevant operational","Relevant operational",false],["Notifications","Policy + own","Own","Own","Own","Customer events"],["Users, roles, integrations","All",false,false,false,false]].map(([capability,admin,manager,rep,operations,customer])=><div className="permission-table" key={capability as string}><span><strong>{capability as string}</strong></span>{[admin,manager,rep,operations,customer].map((value,index)=><span key={index}>{value===true?<i className="permission-check"><Check size={14}/></i>:value===false?<i className="permission-none">—</i>:<small>{value as string}</small>}</span>)}</div>)}</Section>

    <div className="settings-bottom-grid"><Section title="Security baseline" description="Required before live customer, employee, inventory, payroll or financial records" className="security-checklist">{[[LockKeyhole,"Firebase-enforced authorization","Every record and mutation"],[ShieldCheck,"Server-immutable audit storage","Native audit engine is built; production storage must make it tamper-resistant"],[BellRing,"Server-side notification delivery","Native rules are built; provider delivery, retries and background escalation remain"],[RefreshCcw,"Backup and restore tests","Demonstrated recovery, not assumptions"]].map(([Icon,title,detail])=>{const ItemIcon=Icon as typeof ShieldCheck;return <div key={title as string}><span><ItemIcon size={17}/></span><div><strong>{title as string}</strong><p>{detail as string}</p></div><StatusPill tone="warning" dot={false}>Integration gate</StatusPill></div>;})}</Section>{runtime.isDemo?<Section title="Demo data" description="Reset all browser-local engines together" className="demo-settings"><Database size={30}/><h3>Reset the interactive tour</h3><p>Clears CRM, HCM, onboarding, performance, commercial controls, order-to-cash, inventory custody, field tracking, managed-device identity, Finance, accounting, Marketing, payroll, audit, notifications, period locks, and transient workflow intents.</p><Button variant="danger" icon={<RefreshCcw size={16}/>} onClick={()=>setResetOpen(true)}>Reset entire demo</Button></Section>:<Section title="Production data protection" description="There is intentionally no production reset action" className="demo-settings"><ShieldCheck size={30}/><h3>Reset is unavailable</h3><p>Production mode never renders a reset button. Corrections must happen through source-record workflows and remain auditable.</p><StatusPill tone="warning">Reset unavailable; release checks pending</StatusPill></Section>}</div>

    {runtime.isDemo&&<Modal open={resetOpen} title="Reset the entire demo workspace?" description="Every local demo engine will be cleared and rebuilt from the current sample scenario." onClose={()=>setResetOpen(false)} footer={<><Button variant="ghost" onClick={()=>setResetOpen(false)}>Keep my changes</Button><Button variant="danger" onClick={performReset}>Reset all demo data</Button></>}><div className="reset-confirmation"><RefreshCcw size={24}/><p>Only local fictional data is affected. No Firebase tenancy or money rail is connected.</p></div></Modal>}
    {resetDone&&<StatusPill tone="success">Resetting…</StatusPill>}
  </div>;
}
