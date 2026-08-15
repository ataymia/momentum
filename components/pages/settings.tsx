"use client";

import {
  BellRing,
  Check,
  Cloud,
  CreditCard,
  Database,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Modal, PageHeader, Section, StatusPill } from "../ui";

const integrations = [
  { name: "Authentication", provider: "Firebase Auth or Cloudflare Access", icon: KeyRound, boundary: "Identity, MFA, sessions", status: "Disconnected" },
  { name: "Operational database", provider: "Cloudflare D1 / approved database", icon: Database, boundary: "Accounts, work, orders, audit", status: "Disconnected" },
  { name: "Files & evidence", provider: "Cloudflare R2 / approved storage", icon: HardDrive, boundary: "Photos, documents, receipts", status: "Disconnected" },
  { name: "Payments", provider: "Selected hosted payment provider", icon: CreditCard, boundary: "Checkout, settlement, disputes", status: "Not selected" },
  { name: "Payroll", provider: "Selected payroll provider", icon: WalletCards, boundary: "Calculation, tax, direct deposit", status: "Not selected" },
  { name: "Email & SMS", provider: "Approved messaging providers", icon: Mail, boundary: "Delivery, replies, consent", status: "Not selected" },
];

export function SettingsPage() {
  const { data, resetDemo } = useWorkspace();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const performReset = () => {
    resetDemo();
    setResetOpen(false);
    setResetDone(true);
    window.setTimeout(() => setResetDone(false), 2500);
  };

  return (
    <div className="page page--settings">
      <PageHeader
        eyebrow="Administration"
        title="Workspace settings"
        description="Integration boundaries, roles, security posture, and demo controls."
        actions={resetDone ? <StatusPill tone="success"><Check size={14} /> Demo reset</StatusPill> : undefined}
      />

      <div className="settings-security-banner">
        <span><ShieldCheck size={22} /></span><div><strong>Frontend tour only</strong><p>The placeholder password is intentionally insecure and must never survive production authentication work.</p></div><StatusPill tone="warning">Local demo</StatusPill>
      </div>

      <div className="settings-grid">
        <Section title="Integration status" description="Provider-neutral seams are ready; no external system is connected" className="integration-panel">
          <div className="integration-list">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              return (
                <article key={integration.name}>
                  <span><Icon size={19} /></span>
                  <div><strong>{integration.name}</strong><p>{integration.provider}</p><small>{integration.boundary}</small></div>
                  <StatusPill tone="neutral" dot={false}>{integration.status}</StatusPill>
                </article>
              );
            })}
          </div>
          <div className="integration-rule"><Cloud size={18} /><p>Connectors must fail visibly, retry safely, reconcile with their source, and never become a mystery side database.</p></div>
        </Section>

        <Section title="Demo users" description="Switch roles from the profile menu to tour permissions" className="settings-users">
          {data.users.map((user) => (
            <article key={user.id}><Avatar initials={user.initials} color={user.accent} /><div><strong>{user.name}</strong><p>{user.title}</p><small>{user.email}</small></div><StatusPill tone={user.role === "Administrator" ? "gold" : "neutral"} dot={false}>{user.role}</StatusPill></article>
          ))}
        </Section>
      </div>

      <Section title="Role & permission foundation" description="Visibility here is illustrative; production authorization belongs on every server request" className="permission-panel">
        <div className="permission-table permission-table--head"><span>Capability</span><span>Executive</span><span>Administrator</span><span>Sales rep</span><span>Operations</span></div>
        {[
          ["Company-wide reporting", true, true, false, false],
          ["Account and pipeline records", true, true, "Owned scope", "Read only"],
          ["Dispatch and reassignment", true, true, "Owned work", true],
          ["Order approval and price exceptions", true, true, false, false],
          ["Inventory movements and holds", "Read only", true, false, true],
          ["Timecard approval", true, true, false, "Assigned scope"],
          ["User, role, and integration settings", false, true, false, false],
        ].map(([capability, executive, admin, rep, operations]) => (
          <div className="permission-table" key={capability as string}>
            <span><strong>{capability as string}</strong></span>
            {[executive, admin, rep, operations].map((value, index) => <span key={index}>{value === true ? <i className="permission-check"><Check size={14} /></i> : value === false ? <i className="permission-none">—</i> : <small>{value as string}</small>}</span>)}
          </div>
        ))}
      </Section>

      <div className="settings-bottom-grid">
        <Section title="Security baseline" description="Required before any live customer or employee record" className="security-checklist">
          {[
            [LockKeyhole, "Server-enforced authorization", "Every record and action"],
            [ShieldCheck, "Immutable audit trail", "Actor, before/after, reason, time"],
            [BellRing, "Incident and exception alerts", "Owners, deadlines, escalation"],
            [RefreshCcw, "Backup and restore tests", "Evidence, not assumptions"],
          ].map(([Icon, title, detail]) => {
            const ItemIcon = Icon as typeof ShieldCheck;
            return <div key={title as string}><span><ItemIcon size={17} /></span><div><strong>{title as string}</strong><p>{detail as string}</p></div><StatusPill tone="warning" dot={false}>Required</StatusPill></div>;
          })}
        </Section>

        <Section title="Demo data" description="This browser is the only source of persistence right now" className="demo-settings">
          <Database size={30} />
          <h3>Reset the interactive tour</h3>
          <p>Restore the original fictional accounts, orders, placements, approvals, and timecards. Any changes made during this tour will be replaced.</p>
          <Button variant="danger" icon={<RefreshCcw size={16} />} onClick={() => setResetOpen(true)}>Reset demo workspace</Button>
        </Section>
      </div>

      <Modal
        open={resetOpen}
        title="Reset the demo workspace?"
        description="This replaces all locally changed demo records with the original sample scenario."
        onClose={() => setResetOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Keep my changes</Button><Button variant="danger" onClick={performReset}>Reset demo</Button></>}
      >
        <div className="reset-confirmation"><RefreshCcw size={24} /><p>Only local fictional data is affected. No connected system exists in V1.</p></div>
      </Modal>
    </div>
  );
}
