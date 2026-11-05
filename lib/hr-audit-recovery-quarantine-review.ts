/**
 * REVIEW ONLY. Classifies a versioned subject-audit event/receipt pair.
 * Never repairs, writes, deletes, or reveals the underlying HR event.
 * Caller must independently inventory both documents with a trusted server.
 */
import { fingerprintHrAuditEvent } from "./hr-actor-audit-reconciliation-review";

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Row, expected: readonly string[]) =>
  Object.keys(value).sort().join(",") === [...expected].sort().join(",");
const uid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const evidence = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_:/.-]{1,256}$/.test(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const version = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value);

export type HrAuditRecoverySnapshot = {
  /** A missing document must be positively observed, never inferred. */
  exists: boolean;
  version: string | null;
  data: unknown;
};
export type HrAuditRecoveryExpected = {
  actorUid: string;
  subjectUid: string;
  reviewerUid: string;
  eventId: string;
  sourcePath: string;
  sourceVersion: string;
  eventDigest: string;
  reviewedAt: string;
  evidenceRef: string;
};
export type HrAuditRecoveryResult = {
  status: "not-migrated" | "verified-pair" | "quarantined";
  reason: "none" | "invalid-context" | "invalid-inventory" |
    "missing-receipt" | "orphan-receipt" |
    "event-conflict" | "receipt-conflict";
  /** Metadata only. No employee names, event fields or private values. */
  safeToAppend: boolean;
  safeToReplayWithoutWrite: boolean;
};

const result = (status: HrAuditRecoveryResult["status"],
  reason: HrAuditRecoveryResult["reason"]): HrAuditRecoveryResult => ({
  status, reason,
  safeToAppend: status === "not-migrated",
  safeToReplayWithoutWrite: status === "verified-pair",
});
const snapshotValid = (value: unknown): value is HrAuditRecoverySnapshot =>
  row(value) && typeof value.exists === "boolean" &&
  (value.exists
    ? version(value.version) && row(value.data)
    : value.version === null && value.data === null);

/**
 * This classification is only one gate. "not-migrated" is NOT authorization
 * to write: trusted identity, source version, human decision, all-inventory
 * completeness and transaction preconditions must still pass independently.
 * A quarantined pair requires manual investigation and cannot be auto-healed.
 */
export function assessHrAuditReceiptRecoveryReview(input: {
  expected: HrAuditRecoveryExpected;
  subjectEvent: HrAuditRecoverySnapshot;
  metadataReceipt: HrAuditRecoverySnapshot;
}): HrAuditRecoveryResult {
  const { expected, subjectEvent, metadataReceipt } = input ?? {};
  if (!expected || !uid(expected.actorUid) || !uid(expected.subjectUid) ||
      !uid(expected.reviewerUid) || !uid(expected.eventId) ||
      expected.actorUid === expected.reviewerUid ||
      expected.sourcePath !== `userDomains/${expected.actorUid}/hcm/audit` ||
      !version(expected.sourceVersion) || !digest(expected.eventDigest) ||
      !timestamp(expected.reviewedAt) || !evidence(expected.evidenceRef)) {
    return result("quarantined", "invalid-context");
  }
  if (!snapshotValid(subjectEvent) || !snapshotValid(metadataReceipt)) {
    return result("quarantined", "invalid-inventory");
  }
  if (!subjectEvent.exists && !metadataReceipt.exists) {
    return result("not-migrated", "none");
  }
  if (subjectEvent.exists && !metadataReceipt.exists) {
    return result("quarantined", "missing-receipt");
  }
  if (!subjectEvent.exists && metadataReceipt.exists) {
    return result("quarantined", "orphan-receipt");
  }

  const destinationPath = `hrAuditReview/${expected.subjectUid}/events/${expected.eventId}`;
  const target = subjectEvent.data as Row;
  if (!keys(target, ["event", "provenance"]) ||
      !row(target.event) || !row(target.provenance) ||
      !keys(target.provenance, [
        "sourcePath", "sourceVersion", "eventDigest", "subjectUid",
        "reviewerUid", "reviewedAt", "evidenceRef",
      ]) ||
      target.event.id !== expected.eventId ||
      target.event.actorId !== expected.actorUid ||
      fingerprintHrAuditEvent(target.event) !== expected.eventDigest ||
      target.provenance.sourcePath !== expected.sourcePath ||
      target.provenance.sourceVersion !== expected.sourceVersion ||
      target.provenance.eventDigest !== expected.eventDigest ||
      target.provenance.subjectUid !== expected.subjectUid ||
      target.provenance.reviewerUid !== expected.reviewerUid ||
      target.provenance.reviewedAt !== expected.reviewedAt ||
      target.provenance.evidenceRef !== expected.evidenceRef) {
    return result("quarantined", "event-conflict");
  }
  const receipt = metadataReceipt.data as Row;
  if (!keys(receipt, [
    "sourcePath", "destinationPath", "sourceVersion", "eventDigest",
    "subjectUid", "reviewerUid",
  ]) ||
      receipt.sourcePath !== expected.sourcePath ||
      receipt.destinationPath !== destinationPath ||
      receipt.sourceVersion !== expected.sourceVersion ||
      receipt.eventDigest !== expected.eventDigest ||
      receipt.subjectUid !== expected.subjectUid ||
      receipt.reviewerUid !== expected.reviewerUid) {
    return result("quarantined", "receipt-conflict");
  }
  return result("verified-pair", "none");
}
