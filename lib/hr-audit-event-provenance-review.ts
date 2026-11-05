/**
 * REVIEW ONLY: per-event CONTENT comparison across distinct audit domains.
 * Caller-supplied mapping/evidence is NOT independently authenticated.
 * Equal digests are not proof of shared origin, completeness outside the
 * declared inventories, or authorization to read, replay or migrate.
 */
import { assessHrAuditCrossDomainBoundaryReview } from "./hr-audit-cross-domain-boundary-review";
import { fingerprintHrAuditEvent } from "./hr-actor-audit-reconciliation-review";

type BoundaryInput = Parameters<typeof assessHrAuditCrossDomainBoundaryReview>[0];
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export type HrAuditEventProvenanceClaim = {
  eventId: string;
  chunkDigest: string;
  legacyDigest: string;
  chunkSourceVersion: string;
  legacySourceVersion: string;
  reviewerUid: string;
  evidenceRef: string;
};

export type HrAuditEventProvenanceResult = {
  status: "content-matched-unattested" | "quarantined";
  reason: "none" | "invalid-claim" | "source-or-receipt-quarantined" |
    "incomplete-mapping" | "duplicate-event" | "event-content-conflict";
  safeToAppend: false;
  safeToReplayWithoutWrite: false;
  independentlyAuthenticated: false;
  sameHistoricalSnapshotVerified: false;
};

const report = (reason: HrAuditEventProvenanceResult["reason"]):
HrAuditEventProvenanceResult => ({
  status: reason === "none" ? "content-matched-unattested" : "quarantined",
  reason,
  safeToAppend: false,
  safeToReplayWithoutWrite: false,
  independentlyAuthenticated: false,
  sameHistoricalSnapshotVerified: false,
});

/** No private event bytes, employee IDs, source paths or evidence in output. */
export function assessHrAuditEventProvenanceReview(input: BoundaryInput & {
  claims: readonly HrAuditEventProvenanceClaim[];
}): HrAuditEventProvenanceResult {
  if (!row(input) || !Array.isArray(input.claims) ||
      !row(input.chunk) || !row(input.receipts))
    return report("invalid-claim");

  const boundary = assessHrAuditCrossDomainBoundaryReview(input);
  if (boundary.status !== "separate-sources-reviewed")
    return report("source-or-receipt-quarantined");

  const { chunk, receipts, claims } = input;
  const count = chunk.inventory.expectedCount;
  if (claims.length !== count || receipts.pairs.length !== count)
    return report("incomplete-mapping");

  const chunkEvents = new Map<string, unknown>();
  for (const shard of chunk.shardSnapshots) {
    if (!row(shard.data) || !Array.isArray(shard.data.items))
      return report("source-or-receipt-quarantined");
    for (const event of shard.data.items) {
      if (!row(event) || !identifier(event.id) ||
          chunkEvents.has(event.id)) return report("duplicate-event");
      chunkEvents.set(event.id, event);
    }
  }
  const receiptsById = new Map<string, (typeof receipts.pairs)[number]>();
  for (const pair of receipts.pairs) {
    if (!row(pair) || !row(pair.expected) ||
        !identifier(pair.expected.eventId) ||
        receiptsById.has(pair.expected.eventId))
      return report("duplicate-event");
    receiptsById.set(pair.expected.eventId, pair);
  }
  const seen = new Set<string>();
  for (const claim of claims) {
    if (!row(claim) || !identifier(claim.eventId) ||
        !digest(claim.chunkDigest) || !digest(claim.legacyDigest) ||
        claim.chunkSourceVersion !== chunk.inventory.sourceVersion ||
        claim.legacySourceVersion !== receipts.inventory.sourceVersion ||
        claim.reviewerUid !== chunk.inventory.reviewerUid ||
        claim.evidenceRef !== chunk.inventory.evidenceRef)
      return report("invalid-claim");
    if (seen.has(claim.eventId)) return report("duplicate-event");
    seen.add(claim.eventId);
    const source = chunkEvents.get(claim.eventId);
    const pair = receiptsById.get(claim.eventId);
    if (!row(source) || !pair || !row(pair.subjectEvent) ||
        !row(pair.subjectEvent.data) ||
        !row(pair.subjectEvent.data.event))
      return report("incomplete-mapping");
    try {
      const sourceDigest = fingerprintHrAuditEvent(source);
      const legacyDigest = fingerprintHrAuditEvent(pair.subjectEvent.data.event);
      if (sourceDigest !== claim.chunkDigest ||
          legacyDigest !== claim.legacyDigest ||
          claim.chunkDigest !== claim.legacyDigest ||
          pair.expected.eventDigest !== legacyDigest)
        return report("event-content-conflict");
    } catch {
      return report("event-content-conflict");
    }
  }
  if (seen.size !== count || chunkEvents.size !== count ||
      receiptsById.size !== count) return report("incomplete-mapping");
  // Content equality alone cannot attest a common historical origin.
  return report("none");
}
