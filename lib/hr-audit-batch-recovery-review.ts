/**
 * REVIEW ONLY: all-or-nothing, read-only audit recovery batch classifier.
 * The inventory and reviewer evidence MUST come from an independently trusted
 * server. This function does not authenticate, verify a signature, read
 * Firestore, migrate, repair, or authorize writes.
 */
import {
  assessHrAuditReceiptRecoveryReview,
  type HrAuditRecoveryExpected,
  type HrAuditRecoverySnapshot,
} from "./hr-audit-recovery-quarantine-review";

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const version = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value);
const evidence = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_:/.-]{1,256}$/.test(value);
const utc = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export type HrAuditBatchInventoryReview = {
  actorUid: string;
  sourcePath: string;
  sourceVersion: string;
  inventoryVersion: string;
  reviewerUid: string;
  reviewedAt: string;
  evidenceRef: string;
  /** This assertion is NOT verified by this pure function. */
  independentlyVerified: true;
  /** Complete, independently inventoried event IDs, not a sampled page. */
  expectedEventIds: readonly string[];
  expectedCount: number;
};
export type HrAuditBatchPairReview = {
  expected: HrAuditRecoveryExpected;
  subjectEvent: HrAuditRecoverySnapshot;
  metadataReceipt: HrAuditRecoverySnapshot;
};
export type HrAuditBatchRecoveryResult = {
  status: "consistent-read-only" | "quarantined";
  reason: "none" | "invalid-inventory" | "incomplete-inventory" |
    "duplicate-event-id" | "unexpected-event-id" |
    "pair-incomplete" | "pair-conflict";
  /** NEVER true. An external, independently authorized write gate is required. */
  safeToAppend: false;
  /** Consistency is not authentication, migration approval or legal evidence. */
  safeToReplayWithoutWrite: boolean;
};

const result = (reason: HrAuditBatchRecoveryResult["reason"]):
HrAuditBatchRecoveryResult => ({
  status: reason === "none" ? "consistent-read-only" : "quarantined",
  reason,
  safeToAppend: false,
  safeToReplayWithoutWrite: reason === "none",
});

/**
 * Fail closed on incomplete/duplicated inventories and on ANY pair failure.
 * No partial successes, record IDs, confidential event values, or evidence
 * references are returned. No side effects or repair path exist.
 */
export function assessHrAuditBatchRecoveryReview(input: {
  inventory: HrAuditBatchInventoryReview;
  pairs: readonly HrAuditBatchPairReview[];
}): HrAuditBatchRecoveryResult {
  if (!row(input) || !row(input.inventory) ||
      !Array.isArray(input.pairs)) return result("invalid-inventory");
  const { inventory, pairs } = input;
  if (!id(inventory.actorUid) || !id(inventory.reviewerUid) ||
      inventory.reviewerUid === inventory.actorUid ||
      inventory.sourcePath !== `userDomains/${inventory.actorUid}/hcm/audit` ||
      !version(inventory.sourceVersion) ||
      !version(inventory.inventoryVersion) ||
      !utc(inventory.reviewedAt) ||
      !evidence(inventory.evidenceRef) ||
      inventory.independentlyVerified !== true ||
      !Array.isArray(inventory.expectedEventIds) ||
      !Number.isSafeInteger(inventory.expectedCount) ||
      inventory.expectedCount < 1 || inventory.expectedCount > 1000 ||
      inventory.expectedEventIds.length !== inventory.expectedCount ||
      inventory.expectedEventIds.some((eventId) => !id(eventId))) {
    return result("invalid-inventory");
  }
  const expectedIds = new Set(inventory.expectedEventIds);
  if (expectedIds.size !== inventory.expectedCount) {
    return result("duplicate-event-id");
  }
  const seen = new Set<string>();
  for (const pair of pairs) {
    if (!row(pair) || !row(pair.expected) ||
        !id(pair.expected.eventId)) return result("invalid-inventory");
    if (seen.has(pair.expected.eventId)) return result("duplicate-event-id");
    seen.add(pair.expected.eventId);
    if (!expectedIds.has(pair.expected.eventId)) {
      return result("unexpected-event-id");
    }
  }
  if (pairs.length !== inventory.expectedCount) {
    return result("incomplete-inventory");
  }
  for (const pair of pairs) {
    const expected = pair.expected;
    if (expected.actorUid !== inventory.actorUid ||
        expected.sourcePath !== inventory.sourcePath ||
        expected.sourceVersion !== inventory.sourceVersion ||
        expected.reviewerUid !== inventory.reviewerUid) {
      return result("pair-conflict");
    }
    const assessment = assessHrAuditReceiptRecoveryReview(pair);
    if (assessment.status === "not-migrated" ||
        assessment.reason === "missing-receipt" ||
        assessment.reason === "orphan-receipt" ||
        assessment.reason === "invalid-inventory") {
      return result("pair-incomplete");
    }
    if (assessment.status !== "verified-pair") {
      return result("pair-conflict");
    }
  }
  return result("none");
}
