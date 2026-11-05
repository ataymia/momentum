import assert from "node:assert/strict";
import test from "node:test";
import { userDocPath } from "../lib/firestore-domains";
import {
  assessHrAuditChunkInventoryReview,
  type HrAuditChunkInventoryReview,
  type HrAuditChunkSnapshot,
} from "../lib/hr-audit-chunk-inventory-review";

const actorUid = "syntheticActor";
const sourcePath = userDocPath(actorUid, "audit", "events");
const names = ["events__chunk_000000", "events__chunk_000001"];
const paths = names.map((name) => userDocPath(actorUid, "audit", name));
const inventory = (): HrAuditChunkInventoryReview => ({
  actorUid, sourcePath, sourceVersion: "100:200",
  inventoryVersion: "synthetic:1", reviewerUid: "reviewer",
  reviewedAt: "2026-11-05T12:00:00.000Z",
  evidenceRef: "review:synthetic", independentlyVerified: true,
  expectedEventIds: ["evt1", "evt2"], expectedCount: 2,
});
const manifest = (): HrAuditChunkSnapshot => ({
  path: sourcePath, exists: true, version: "100:200",
  data: { shardManifestVersion: 1, shards: names, itemCount: 2 },
});
const shards = (): HrAuditChunkSnapshot[] => paths.map((path, i) => ({
  path, exists: true, version: `101:${i}`,
  data: { items: [{ id: `evt${i + 1}`, actorId: actorUid,
    after: "PRIVATE synthetic value" }] },
}));
const scan = (options: {
  inv?: HrAuditChunkInventoryReview;
  m?: HrAuditChunkSnapshot;
  s?: HrAuditChunkSnapshot[];
} = {}) => assessHrAuditChunkInventoryReview({
  inventory: options.inv ?? inventory(),
  manifestSnapshot: options.m ?? manifest(),
  shardSnapshots: options.s ?? shards(),
});

test("complete pinned manifest and both chunks verify source only, never replay", () => {
  assert.deepEqual(scan(), {
    status: "consistent-source-only", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: false,
  });
});
test("missing shard and partial page quarantine entire source", () => {
  assert.equal(scan({ s: shards().slice(0, 1) }).reason, "invalid-shards");
  assert.equal(scan({ s: [] }).status, "quarantined");
});
test("denied, stale, absent or malformed shard never passes", () => {
  for (const change of [
    { denied: true }, { exists: false, data: null },
    { version: null }, { data: { items: null } },
  ]) {
    const s = shards(); s[1] = { ...s[1], ...change };
    assert.equal(scan({ s }).status, "quarantined");
  }
});
test("stale, absent and wrong manifest paths quarantine", () => {
  for (const change of [
    { version: "old" }, { exists: false, data: null },
    { path: "userDomains/other/audit/events" },
  ]) assert.equal(scan({ m: { ...manifest(), ...change } }).status, "quarantined");
});
test("manifest with missing, duplicate or foreign shard cannot pass", () => {
  for (const change of [
    { shards: names.slice(0, 1) },
    { shards: [names[0], names[0]] },
    { shards: [names[0], "documents__chunk_000001"] },
    { itemCount: 1 },
  ]) assert.equal(scan({ m: { ...manifest(), data: {
    ...manifest().data, ...change } } }).status, "quarantined");
});
test("duplicate event across different shards is not a complete inventory", () => {
  const s = shards();
  s[1] = { ...s[1], data: { items: [{ id: "evt1", actorId: actorUid }] } };
  assert.equal(scan({ s }).reason, "duplicate-event-id");
});
test("unexpected event, wrong actor, missing ID, and incomplete event set quarantine", () => {
  for (const item of [
    { id: "evt3", actorId: actorUid },
    { id: "evt2", actorId: "other" },
    { actorId: actorUid },
  ]) {
    const s = shards(); s[1] = { ...s[1], data: { items: [item] } };
    assert.equal(scan({ s }).status, "quarantined");
  }
  assert.equal(scan({ inv: { ...inventory(),
    expectedEventIds: ["evt1", "evt3"] } }).status, "quarantined");
});
test("extra, duplicate or wrong-path loaded snapshots fail closed", () => {
  const s = shards();
  assert.equal(scan({ s: [...s, s[0]] }).status, "quarantined");
  assert.equal(scan({ s: [...s, { ...s[0], path: "other" }] }).status,
    "quarantined");
});
test("reviewer and complete independently declared inventory are required", () => {
  for (const change of [
    { reviewerUid: actorUid }, { independentlyVerified: false },
    { sourceVersion: "wrong" }, { expectedCount: 3 },
    { expectedEventIds: ["evt1", "evt1"] },
    { sourcePath: "userDomains/syntheticActor/hcm/audit" },
  ]) assert.equal(scan({ inv: { ...inventory(), ...change } as HrAuditChunkInventoryReview }).status, "quarantined");
});
test("malformed inputs fail closed without exceptions", () => {
  for (const value of [null, {}, { inventory: null },
    { inventory: inventory(), manifestSnapshot: null, shardSnapshots: [] }]) {
    assert.equal(assessHrAuditChunkInventoryReview(value as never).status,
      "quarantined");
  }
});
test("reports are metadata-only and never mutate snapshots", () => {
  const inv = inventory(), m = manifest(), s = shards();
  const before = JSON.stringify({ inv, m, s });
  const output = JSON.stringify(scan({ inv, m, s }));
  assert.equal(JSON.stringify({ inv, m, s }), before);
  for (const secret of ["PRIVATE", actorUid, "reviewer", "evt1", "evt2",
    "events__chunk", "review:synthetic"])
    assert.equal(output.includes(secret), false);
});
