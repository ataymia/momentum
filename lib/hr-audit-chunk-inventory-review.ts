/**
 * REVIEW ONLY: independently declared chunk-source inventory consistency.
 * This covers the separate chunked audit/events domain, NOT the historical
 * HCM actor-audit field. It cannot attest a reviewer, authorize a migration,
 * or prove that a Firestore read occurred in one transaction.
 */
import { DOMAIN_SPECS, userDocPath } from "./firestore-domains";
import { reviewChunkHydration } from "./chunk-hydration-review";
import type { FirestoreSnapshot } from "./firebase-firestore-rest";

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const evidence = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_:/.-]{1,256}$/.test(value);
const version = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value);
const utc = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const audit = DOMAIN_SPECS.find((spec) => spec.id === "audit")!;

export type HrAuditChunkInventoryReview = {
  actorUid: string;
  sourcePath: string;
  sourceVersion: string;
  inventoryVersion: string;
  reviewerUid: string;
  reviewedAt: string;
  evidenceRef: string;
  /** Caller assertion only; NOT cryptographic or independent verification. */
  independentlyVerified: true;
  expectedEventIds: readonly string[];
  expectedCount: number;
};
export type HrAuditChunkSnapshot = FirestoreSnapshot & {
  /** Must be pinned to the actual read snapshot by the trusted caller. */
  version: string | null;
  denied?: boolean;
};
export type HrAuditChunkInventoryResult = {
  status: "consistent-source-only" | "quarantined";
  reason: "none" | "invalid-inventory" | "missing-or-stale-source" |
    "invalid-shards" | "duplicate-event-id" | "event-set-conflict";
  safeToAppend: false;
  safeToReplayWithoutWrite: false;
};
const result = (reason: HrAuditChunkInventoryResult["reason"]):
HrAuditChunkInventoryResult => ({
  status: reason === "none" ? "consistent-source-only" : "quarantined",
  reason, safeToAppend: false, safeToReplayWithoutWrite: false,
});

/** Never return private payloads, IDs, shard paths, or reviewer evidence. */
export function assessHrAuditChunkInventoryReview(input: {
  inventory: HrAuditChunkInventoryReview;
  manifestSnapshot: HrAuditChunkSnapshot;
  shardSnapshots: readonly HrAuditChunkSnapshot[];
}): HrAuditChunkInventoryResult {
  if (!row(input) || !row(input.inventory) ||
      !row(input.manifestSnapshot) || !Array.isArray(input.shardSnapshots))
    return result("invalid-inventory");
  const { inventory, manifestSnapshot, shardSnapshots } = input;
  if (!id(inventory.actorUid) || !id(inventory.reviewerUid) ||
      inventory.actorUid === inventory.reviewerUid ||
      inventory.sourcePath !== userDocPath(inventory.actorUid, "audit", "events") ||
      !version(inventory.sourceVersion) ||
      !version(inventory.inventoryVersion) ||
      !utc(inventory.reviewedAt) || !evidence(inventory.evidenceRef) ||
      inventory.independentlyVerified !== true ||
      !Number.isSafeInteger(inventory.expectedCount) ||
      inventory.expectedCount < 1 || inventory.expectedCount > 1000 ||
      !Array.isArray(inventory.expectedEventIds) ||
      inventory.expectedEventIds.length !== inventory.expectedCount ||
      inventory.expectedEventIds.some((item) => !id(item)))
    return result("invalid-inventory");
  const expected = new Set(inventory.expectedEventIds);
  if (expected.size !== inventory.expectedCount)
    return result("duplicate-event-id");
  if (manifestSnapshot.path !== inventory.sourcePath ||
      manifestSnapshot.denied || !manifestSnapshot.exists ||
      !row(manifestSnapshot.data) ||
      manifestSnapshot.version !== inventory.sourceVersion)
    return result("missing-or-stale-source");

  const hydration = reviewChunkHydration(
    audit, inventory.sourcePath, manifestSnapshot.data, shardSnapshots);
  if (!hydration.ok || hydration.paths.length !== shardSnapshots.length)
    return result("invalid-shards");
  const paths = new Set(hydration.paths);
  const seenPaths = new Set<string>();
  const seenIds = new Set<string>();
  for (const shard of shardSnapshots) {
    if (!row(shard) || typeof shard.path !== "string" ||
        !paths.has(shard.path) ||
        seenPaths.has(shard.path) || shard.denied ||
        !shard.exists || !version(shard.version) ||
        !row(shard.data) || !Array.isArray(shard.data.items))
      return result("invalid-shards");
    seenPaths.add(shard.path);
    for (const item of shard.data.items) {
      if (!row(item) || !id(item.id) || item.actorId !== inventory.actorUid)
        return result("event-set-conflict");
      if (seenIds.has(item.id)) return result("duplicate-event-id");
      seenIds.add(item.id);
      if (!expected.has(item.id)) return result("event-set-conflict");
    }
  }
  if (seenIds.size !== inventory.expectedCount)
    return result("event-set-conflict");
  return result("none");
}
