"use client";

import { Copy, KeyRound, MailCheck, RefreshCcw, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { generateTemporaryPassword, validateTemporaryPassword } from "../../lib/firebase-admin-provisioning";
import { useFirebaseSession } from "../../lib/firebase-session-context";
import { useSyncStatus } from "../../lib/persistence";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Section, StatusPill } from "../ui";

const initialsFor = (name: string) => { const parts = name.trim().split(/\s+/).filter(Boolean); return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : name.slice(0, 2)).toUpperCase(); };

export function SyncStatusPill() {
  const sync = useSyncStatus();
  if (sync.mode !== "firestore") return null;
  const tone = sync.lastError ? "error" : sync.pending || sync.flushing ? "pending" : "ok";
  const label = sync.lastError ? sync.lastError : sync.flushing ? "Saving to Firestore…" : sync.pending ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} pending` : sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : "Connected to Firestore";
  return <span className="sync-status-pill" data-tone={tone} title={sync.deniedDocuments.length ? `Rules denied: ${sync.deniedDocuments.join(", ")}` : undefined}><RefreshCcw size={12} />{label}</span>;
}

/** Administrator view of Firebase identities and access records. Rendered only in production mode. */
export function FirebaseAccessPanel() {
  const firebase = useFirebaseSession();
  const { currentUser } = useWorkspace();
  const sync = useSyncStatus();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: "", email: "", title: "Owner", password: generateTemporaryPassword() });
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  if (currentUser?.role !== "Administrator") return null;

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>, success: string) => {
    setBusy(true); setError(""); setNotice("");
    const result = await action();
    setBusy(false);
    if (result.ok) setNotice(result.message ?? success); else setError(result.message ?? "Request failed.");
  };

  const createAdministrator = (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateTemporaryPassword(adminForm.password);
    if (invalid) { setError(invalid); return; }
    const name = adminForm.name.trim();
    if (name.length < 2) { setError("Enter the Administrator's full name."); return; }
    void run(async () => {
      const result = await firebase.createEmployeeAccount({
        user: { name, firstName: name.split(/\s+/)[0], email: adminForm.email, initials: initialsFor(name), title: adminForm.title.trim() || "Administrator", role: "Administrator", team: "Leadership", accent: "#e49e13" },
        temporaryPassword: adminForm.password,
        activateImmediately: true,
      });
      if (result.ok) { setIssued({ email: adminForm.email.trim().toLowerCase(), password: adminForm.password }); setAdminForm({ name: "", email: "", title: "Owner", password: generateTemporaryPassword() }); }
      return result;
    }, "Administrator account created. Share the temporary password through a secure channel.");
  };

  const administrators = firebase.directory.filter((user) => user.role === "Administrator");

  return <>
    <Section className="firebase-access-section" title="Firebase identities & access" description="Authentication, roles, and account status for the production workspace." action={<StatusPill tone={sync.lastError ? "danger" : "success"}><ShieldCheck size={14} /> {firebase.projectId}</StatusPill>}>
      <div className="firebase-access-summary">
        <div><span>Signed in</span><strong>{currentUser.name}</strong><small>{firebase.session?.email}</small></div>
        <div><span>Administrators</span><strong>{administrators.length}</strong><small>{administrators.map((user) => user.name).join(" · ") || "None"}</small></div>
        <div><span>Firestore sync</span><strong>{sync.flushing ? "Saving…" : sync.pending ? `${sync.pending} pending` : "Synced"}</strong><small>{sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : "Connected"}{sync.conflicts ? ` · ${sync.conflicts} merged conflict${sync.conflicts === 1 ? "" : "s"}` : ""}</small></div>
        <div><span>Rules denials</span><strong>{sync.deniedDocuments.length ? sync.deniedDocuments.length : "None"}</strong><small>{sync.deniedDocuments.length ? sync.deniedDocuments.join(", ") : "No blocked writes detected"}</small></div>
      </div>
      {sync.lastError && <p className="form-error" role="alert">{sync.lastError}</p>}
      <div className="provisioning-queue firebase-admin-list">{firebase.directory.slice().sort((a, b) => a.name.localeCompare(b.name)).map((user) => {
        const access = firebase.accessRecords[user.id];
        return <article key={user.id}><span className="provisioning-avatar">{user.initials}</span><div className="firebase-admin-identity"><strong>{user.name}</strong><p>{user.title} · {user.role} · {user.team}</p><small>{user.email}{access ? ` · Updated ${new Date(access.updatedAt).toLocaleDateString()}` : " · Access record missing"}</small></div><StatusPill tone={access?.accountState === "Active" ? "success" : access?.accountState === "Suspended" || access?.accountState === "Separated" ? "danger" : "warning"}>{access?.accountState ?? "Unknown"}</StatusPill><div className="provisioning-row-actions">{user.role !== "Administrator" && access?.accountState === "Active" && <Button size="sm" variant="secondary" disabled={busy} icon={<KeyRound size={14} />} onClick={() => void run(() => firebase.grantAdministrator(user.id), `${user.name} is now an Administrator.`)}>Grant Administrator</Button>}<Button size="sm" variant="ghost" disabled={busy} icon={<MailCheck size={14} />} onClick={() => void run(() => firebase.sendPasswordReset(user.email), "Password reset e-mail sent.")}>Reset password</Button></div></article>;
      })}</div>
    </Section>

    <Section title="Create Administrator account" description="Use this only for the second founding Administrator. Regular employees belong in Human Resources → New hire setup.">
      {issued && <div className="temp-password" role="status"><strong>{issued.email}</strong><span>Temporary password (shown once). Ask them to change it after first sign-in.</span><code>{issued.password}</code><div className="provisioning-row-actions"><Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => void navigator.clipboard?.writeText(issued.password)}>Copy</Button><Button size="sm" variant="ghost" onClick={() => setIssued(null)}>Dismiss</Button></div></div>}
      <form className="provisioning-form" onSubmit={createAdministrator}>
        <div className="form-grid">
          <Field label="Full name"><input required value={adminForm.name} onChange={(event) => setAdminForm({ ...adminForm, name: event.target.value })} /></Field>
          <Field label="Work e-mail"><input type="email" required value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} /></Field>
          <Field label="Title"><input required value={adminForm.title} onChange={(event) => setAdminForm({ ...adminForm, title: event.target.value })} /></Field>
          <Field label="Temporary password"><input required value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} autoComplete="off" /></Field>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}
        <div className="provisioning-actions"><Button type="submit" disabled={busy} icon={<UserPlus size={16} />}>Create Administrator</Button></div>
      </form>
    </Section>
  </>;
}
