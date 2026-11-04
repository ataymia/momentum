import { planHrRequestDecision, type HrRequestKind } from "./hr-request-review";
import type { HCMState } from "./hcm-engine";
import type { UserAccessRecord } from "./firebase-access";
import type { WorkspaceData, WorkspaceUser } from "./types";

/**
 * SERVER-ONLY DESIGN CONTRACT. No callable Function, Firestore write, or
 * browser mutation is registered here. A future trusted handler must read
 * all snapshot fields within ONE transaction, verify Firebase Auth server-side,
 * and atomically commit HCM changes plus the immutable receipt.
 *
 * Never accept actorAccess, targetAccess, directory, HCM state or revision from
 * the caller. The caller may supply only the command fields.
 */
export type HrDecisionCommand = {
  commandId: string;
  kind: HrRequestKind;
  requestId: string;
  decision: "Approved" | "Returned";
  note: string;
  expectedRevision: number;
  decidedAt: string;
};
export type HrDecisionReceipt = {
  commandId: string;
  requestKey: string;
  actorUid: string;
  targetUid: string;
  decision: "Approved" | "Returned";
  previousRevision: number;
  nextRevision: number;
  decidedAt: string;
};
export type TrustedHrDecisionSnapshot = {
  authenticatedUid: string | null;
  actorAccess: UserAccessRecord | null;
  targetAccess: UserAccessRecord | null;
  directory: readonly WorkspaceUser[];
  hcm: HCMState;
  revision: number;
  /** A receipt read transactionally by request key, not supplied by browser. */
  existingReceipt?: HrDecisionReceipt | null;
};
export type HrServerDecisionResult =
  | { ok: true; state: HCMState; receipt: HrDecisionReceipt; nextRevision: number }
  | { ok: false; reason: string };
const deny = (reason: string): HrServerDecisionResult => ({ ok: false, reason });
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const iso = (value: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/**
 * Pure transaction-body validator. It has no IO, no privileged credentials,
 * and deliberately does not authorize any write. A trusted service must
 * re-read every dependency at commit time, use transaction retries/CAS, and
 * enforce server-only collection rules before enabling this in staging.
 */
export function evaluateHrDecisionCommand(
  command: HrDecisionCommand, snapshot: TrustedHrDecisionSnapshot,
): HrServerDecisionResult {
  if (!safeId(command.commandId) || !safeId(command.requestId) ||
      !["leave", "workflow"].includes(command.kind) ||
      !["Approved", "Returned"].includes(command.decision) ||
      typeof command.note !== "string" || command.note.length > 2000 ||
      !iso(command.decidedAt)) return deny("Invalid command.");
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision !== snapshot.revision) return deny("Stale HCM revision.");
  const key = command.kind + ":" + command.requestId;
  if (snapshot.existingReceipt?.requestKey === key ||
      snapshot.existingReceipt?.commandId === command.commandId) return deny("Request already decided.");
  if (snapshot.hcm.audit.some((event) => event.id === "hr-decision-" + command.commandId)) {
    return deny("Decision command already recorded.");
  }

  const uid = snapshot.authenticatedUid;
  const actor = snapshot.actorAccess;
  if (!uid || !actor || actor.uid !== uid ||
      actor.role !== "Administrator" || actor.accountState !== "Active") {
    return deny("Active Administrator authority required.");
  }
  const actorDirectory = snapshot.directory.find((person) => person.id === uid);
  if (!actorDirectory || actorDirectory.role !== actor.role ||
      actorDirectory.employmentStatus === "Separated") return deny("Actor directory mismatch.");

  const matching = command.kind === "leave"
    ? snapshot.hcm.leaveRequests.filter((record) => record.id === command.requestId)
    : snapshot.hcm.workflows.filter((record) => record.id === command.requestId);
  if (matching.length !== 1 || matching[0].status !== "Submitted") {
    return deny("Missing, ambiguous or already decided request.");
  }
  const targetUid = matching[0].userId;
  const target = snapshot.targetAccess;
  const targetDirectory = snapshot.directory.find((person) => person.id === targetUid);
  const employment = snapshot.hcm.employees.find((person) => person.userId === targetUid);
  if (!target || target.uid !== targetUid || target.accountState !== "Active" ||
      target.role === "Customer" || !targetDirectory ||
      targetDirectory.role !== target.role || targetDirectory.employmentStatus === "Separated" ||
      !employment || !["Active", "Leave"].includes(employment.status) || uid === targetUid) {
    return deny("Target employee authorization failed.");
  }

  // Canonical HCM invariants, audit and PTO accounting remain authoritative.
  const viewer: WorkspaceUser = { ...actorDirectory, role: actor.role };
  const data = { users: [...snapshot.directory] } as WorkspaceData;
  const planned = planHrRequestDecision({
    viewer, users: snapshot.directory, data, hcm: snapshot.hcm,
    accessRecords: { [uid]: { accountState: actor.accountState },
      [targetUid]: { accountState: target.accountState } },
    kind: command.kind, requestId: command.requestId, decision: command.decision,
    note: command.note, decidedAt: command.decidedAt,
  });
  if (!planned.ok) return deny(planned.error);
  const nextRevision = snapshot.revision + 1;
  if (!Number.isSafeInteger(nextRevision)) return deny("Revision overflow.");
  const audit = planned.state.audit;
  if (audit.length !== snapshot.hcm.audit.length + 1) return deny("Missing decision audit.");
  return {
    ok: true,
    state: { ...planned.state, audit: [
      { ...audit[0], id: "hr-decision-" + command.commandId, at: command.decidedAt },
      ...audit.slice(1),
    ] },
    nextRevision,
    receipt: {
      commandId: command.commandId, requestKey: key, actorUid: uid,
      targetUid, decision: command.decision,
      previousRevision: snapshot.revision, nextRevision, decidedAt: command.decidedAt,
    },
  };
}
