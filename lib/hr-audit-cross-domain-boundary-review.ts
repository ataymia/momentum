/**
 * REVIEW ONLY. The chunked audit/events source and historical hcm/audit
 * actor source are distinct domains. Never infer that two successful
 * classifiers describe one historical snapshot or authorize replay.
 * This adapter checks coordination of caller-declared inventories, not
 * independent reviewer evidence, cryptographic linkage, or transactionality.
 */
import {
  assessHrAuditChunkInventoryReview,
} from "./hr-audit-chunk-inventory-review";
import {
  assessHrAuditBatchRecoveryReview,
} from "./hr-audit-batch-recovery-review";

type ChunkInput = Parameters<typeof assessHrAuditChunkInventoryReview>[0];
type BatchInput = Parameters<typeof assessHrAuditBatchRecoveryReview>[0];

export type HrAuditCrossDomainReviewResult = {
  status: "separate-sources-reviewed" | "quarantined";
  reason: "distinct-sources-not-linked" | "invalid-input" |
    "chunk-source-quarantined" | "receipt-batch-quarantined" |
    "inventory-link-conflict";
  safeToAppend: false;
  safeToReplayWithoutWrite: false;
  sameHistoricalSnapshotVerified: false;
};

const report = (
  reason: HrAuditCrossDomainReviewResult["reason"],
): HrAuditCrossDomainReviewResult => ({
  status: reason === "distinct-sources-not-linked"
    ? "separate-sources-reviewed" : "quarantined",
  reason,
  safeToAppend: false,
  safeToReplayWithoutWrite: false,
  sameHistoricalSnapshotVerified: false,
});

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Even when both sources independently pass, their different paths/versions
 * do NOT constitute a single pinned snapshot. This deliberately cannot
 * return an authorized or replayable result. Do not expose private IDs.
 */
export function assessHrAuditCrossDomainBoundaryReview(input: {
  chunk: ChunkInput;
  receipts: BatchInput;
}): HrAuditCrossDomainReviewResult {
  if (!record(input) || !record(input.chunk) ||
      !record(input.receipts) || !record(input.chunk.inventory) ||
      !record(input.receipts.inventory)) return report("invalid-input");

  const chunk = assessHrAuditChunkInventoryReview(input.chunk);
  if (chunk.status !== "consistent-source-only")
    return report("chunk-source-quarantined");

  const receipts = assessHrAuditBatchRecoveryReview(input.receipts);
  if (receipts.status !== "consistent-read-only")
    return report("receipt-batch-quarantined");

  const a = input.chunk.inventory;
  const b = input.receipts.inventory;
  if (a.actorUid !== b.actorUid ||
      a.reviewerUid !== b.reviewerUid ||
      a.inventoryVersion !== b.inventoryVersion ||
      a.reviewedAt !== b.reviewedAt ||
      a.evidenceRef !== b.evidenceRef ||
      a.expectedCount !== b.expectedCount ||
      a.sourcePath === b.sourcePath ||
      !Array.isArray(a.expectedEventIds) ||
      !Array.isArray(b.expectedEventIds)) {
    return report("inventory-link-conflict");
  }

  const sourceIds = new Set(a.expectedEventIds);
  if (sourceIds.size !== a.expectedCount ||
      b.expectedEventIds.some((eventId) => !sourceIds.has(eventId))) {
    return report("inventory-link-conflict");
  }

  // Equal event IDs and metadata are caller assertions, not authenticated
  // cross-domain event identity or a shared Firestore read timestamp.
  return report("distinct-sources-not-linked");
}
