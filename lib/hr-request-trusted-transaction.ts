import {
  evaluateHrDecisionCommand, type HrDecisionCommand, type HrDecisionReceipt,
  type TrustedHrDecisionSnapshot,
} from "./hr-request-server-contract";
import type { HCMState } from "./hcm-engine";
import type { UserAccessRecord } from "./firebase-access";
import type { WorkspaceUser } from "./types";

/**
 * REVIEW-ONLY transaction boundary. No Firebase Admin SDK, callable Function,
 * collection mapping or enabled production flag is registered by this module.
 * The implementing server must verify Firebase identity and own every read.
 */
export type HrDecisionIntent = Omit<HrDecisionCommand, "decidedAt">;
export type HrDecisionStoreRecord = { revision: number; hcm: HCMState };

export interface HrDecisionTransaction {
  readAccess(uid: string): Promise<UserAccessRecord | null>;
  readDirectory(): Promise<readonly WorkspaceUser[]>;
  readHcm(): Promise<HrDecisionStoreRecord | null>;
  readReceipt(requestKey: string): Promise<HrDecisionReceipt | null>;
  /** Replace canonical HCM, including PTO ledger and audit, in this transaction. */
  replaceHcm(record: HrDecisionStoreRecord): void;
  /** Create-only by canonical request key, never overwrite an existing receipt. */
  createReceipt(requestKey: string, receipt: HrDecisionReceipt): void;
}
export interface HrDecisionTransactionRunner {
  /** Serializable, retryable transaction. Callback MUST rerun on conflicts. */
  run<T>(callback: (transaction: HrDecisionTransaction) => Promise<T>): Promise<T>;
}
export type HrDecisionExecutionResult =
  | { ok: true; receipt: HrDecisionReceipt }
  | { ok: false; reason: string };

type TrustedDecisionDependencies = {
  /** Explicit review-only opt-in for synthetic tests; defaults to denied. */
  enabled?: boolean;
  /** Implemented by trusted server-side Firebase token/revocation verification. */
  verifiedUid: () => Promise<string | null>;
  /** Trusted server clock; the browser never supplies the decision timestamp. */
  serverNow: () => string;
  runner: HrDecisionTransactionRunner;
};
const denied = (reason: string): HrDecisionExecutionResult => ({ ok: false, reason });

/**
 * Every transaction attempt re-reads actor access, directory, canonical HCM,
 * target access and canonical request receipt. No data supplied by the browser
 * is accepted as authority. No actual storage adapter or endpoint exists.
 */
export async function executeHrDecisionReview(
  intent: HrDecisionIntent,
  dependencies: TrustedDecisionDependencies,
): Promise<HrDecisionExecutionResult> {
  if (dependencies.enabled !== true) return denied("HR connected decisions are disabled.");
  const uid = await dependencies.verifiedUid();
  if (!uid) return denied("Verified server identity required.");
  const decidedAt = dependencies.serverNow();
  const command: HrDecisionCommand = { ...intent, decidedAt };
  const requestKey = command.kind + ":" + command.requestId;

  return dependencies.runner.run(async (tx) => {
    const actorAccess = await tx.readAccess(uid);
    // Deny before reading confidential HCM if the actor is not currently allowed.
    if (!actorAccess || actorAccess.uid !== uid ||
        actorAccess.accountState !== "Active" || actorAccess.role !== "Administrator") {
      return denied("Active Administrator authority required.");
    }
    const directory = await tx.readDirectory();
    const actor = directory.find((person) => person.id === uid);
    if (!actor || actor.role !== "Administrator" ||
        actor.employmentStatus === "Separated") return denied("Actor directory mismatch.");

    const stored = await tx.readHcm();
    if (!stored) return denied("Canonical HR state unavailable.");
    const matching = command.kind === "leave"
      ? stored.hcm.leaveRequests.filter((record) => record.id === command.requestId)
      : command.kind === "workflow"
        ? stored.hcm.workflows.filter((record) => record.id === command.requestId)
        : [];
    if (matching.length !== 1) return denied("Missing or ambiguous HR request.");
    const targetAccess = await tx.readAccess(matching[0].userId);
    const existingReceipt = await tx.readReceipt(requestKey);
    const snapshot: TrustedHrDecisionSnapshot = {
      authenticatedUid: uid, actorAccess, targetAccess, directory,
      hcm: stored.hcm, revision: stored.revision, existingReceipt,
    };
    const result = evaluateHrDecisionCommand(command, snapshot);
    if (!result.ok) return denied(result.reason);

    // One serializable commit must contain all four effects:
    // request status, PTO ledger, immutable audit, and replay receipt/revision.
    tx.replaceHcm({ revision: result.nextRevision, hcm: result.state });
    tx.createReceipt(requestKey, result.receipt);
    return { ok: true, receipt: result.receipt };
  });
}
