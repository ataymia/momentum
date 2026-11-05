/**
 * REVIEW ONLY: session-bound, read-only HR historical audit adapter.
 * The only success label remains "versions-matched-unattested".
 * No endpoint, production Auth/Firestore, audit write, or migration.
 *
 * The injected verifyIdToken MUST be trusted Firebase Admin Auth.verifyIdToken
 * with checkRevoked=true. Neither an asserted inventory nor an injected
 * verifier independently authenticates historical provenance.
 */
import {
  createHrAuditPinnedReaderReview,
  type HrPinnedReviewFirestore,
  type HrPinnedReviewInventory,
  type HrPinnedReviewResult,
} from "./hr-audit-pinned-reader-review";
import {
  executeHrAuditReviewerGateReview,
  type HrAuditReviewerCommand,
  type HrAuditReviewerFirestore,
} from "./hr-audit-reviewer-session-review";

const quarantine = (): HrPinnedReviewResult => ({
  status: "quarantined",
  reason: "unauthorized",
  safeToAppend: false,
  safeToReplayWithoutWrite: false,
  independentlyAuthenticated: false,
  sameHistoricalSnapshotVerified: false,
});

export type HrSessionPinnedReviewOptions = {
  projectId: string;
  emulatorHost: string;
  firestore: HrPinnedReviewFirestore & HrAuditReviewerFirestore;
  inventory: HrPinnedReviewInventory;
  command: HrAuditReviewerCommand;
  rawToken: unknown;
  /** Trusted server Firebase Admin Auth verifier; never accept from browser. */
  verifyIdToken: (token: string, checkRevoked: true) => Promise<unknown>;
  nowSeconds?: () => number;
};

/**
 * Two independently verified reviewer gates surround the pinned Firestore
 * read. Each gate checks Admin Auth revocation and fresh server-owned
 * authority/session documents. The inner reader remains read-only.
 *
 * The second gate rejects revocation occurring while the pinned read runs.
 * It is not a globally atomic Auth + Firestore snapshot, and does not grant
 * permission for a later write. A revocation after the last check remains
 * possible; future write executors must reauthorize transactionally.
 */
export function createHrAuditSessionPinnedReaderReview(
  options: HrSessionPinnedReviewOptions,
  enabled = false,
): (() => Promise<HrPinnedReviewResult>) | null {
  if (!enabled || !options ||
      options.projectId !== "momentum-hr-admin-sdk-review" ||
      options.emulatorHost !== "127.0.0.1:8080" ||
      process.env.FIRESTORE_EMULATOR_HOST !== options.emulatorHost ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099" ||
      process.env.GCLOUD_PROJECT !== options.projectId ||
      !options.firestore ||
      options.firestore.projectId !== options.projectId ||
      typeof options.verifyIdToken !== "function" ||
      !options.command || !options.inventory ||
      options.command.actorUid !== options.inventory.actorUid ||
      options.command.reviewerUid !== options.inventory.reviewerUid) return null;

  // Capture a private copy so a caller cannot replace the expected inventory
  // while asynchronous authentication and snapshot reads are in progress.
  let inventory: HrPinnedReviewInventory;
  try {
    inventory = structuredClone(options.inventory);
  } catch {
    return null;
  }
  const command = { ...options.command };
  const rawToken = options.rawToken;
  const firestore = options.firestore;
  const gateDeps = {
    projectId: options.projectId,
    emulatorHost: options.emulatorHost,
    firestore,
    verifyIdToken: options.verifyIdToken,
    nowSeconds: options.nowSeconds,
  };

  return async (): Promise<HrPinnedReviewResult> => {
    try {
      const first = await executeHrAuditReviewerGateReview(
        command, rawToken, gateDeps, true,
      );
      if (!first.ok || first.reviewerUid !== inventory.reviewerUid ||
          first.sessionEpoch !== command.expectedSessionEpoch)
        return quarantine();

      // This callback is deliberately NOT a caller-provided authorization
      // oracle. The enclosing server-side gates verify the actual session.
      const reader = createHrAuditPinnedReaderReview({
        projectId: options.projectId,
        emulatorHost: options.emulatorHost,
        firestore,
        inventory,
        authorizeReviewer: async (uid) => uid === first.reviewerUid,
      }, true);
      if (!reader) return quarantine();
      const snapshot = await reader();

      const last = await executeHrAuditReviewerGateReview(
        command, rawToken, gateDeps, true,
      );
      if (!last.ok || last.reviewerUid !== first.reviewerUid ||
          last.sessionEpoch !== first.sessionEpoch) return quarantine();
      return snapshot;
    } catch {
      // No private data, SDK details, token, IDs or paths escape.
      return quarantine();
    }
  };
}
