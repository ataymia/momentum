import assert from "node:assert/strict";
import test from "node:test";
import { DOMAIN_SPECS, userDocPath, type DomainSpec } from "../lib/firestore-domains";
import { reviewChunkHydration } from "../lib/chunk-hydration-review";
import type { FirestoreSnapshot } from "../lib/firebase-firestore-rest";

const audit = DOMAIN_SPECS.find((spec) => spec.id === "audit")!;
const path = userDocPath("synthetic-actor", "audit", "events");
const shard = userDocPath("synthetic-actor", "audit", "events__chunk_000000");
const manifest = { shardManifestVersion: 1, shards: ["events__chunk_000000"], itemCount: 2 };
const snap = (items: unknown[], denied = false): FirestoreSnapshot =>
  ({ path: shard, exists: true, data: { items }, ...(denied ? { denied: true } : {}) });
const events = [
  { id: "synthetic-1", actorId: "synthetic-actor" },
  { id: "synthetic-2", actorId: "synthetic-actor" },
];

test("complete owner-matched audit chunks pass integrity review", () => {
  const result = reviewChunkHydration(audit, path, manifest, [snap(events)]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.paths, [shard]);
});

test("missing, denied and malformed chunks fail closed without record data in issues", () => {
  for (const snapshots of [[], [snap(events, true)], [{ path: shard, exists: false, data: null }], [snap({} as never)]]) {
    const result = reviewChunkHydration(audit, path, manifest, snapshots as FirestoreSnapshot[]);
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes("synthetic-actor"), false);
  }
});

test("wrong owner, incomplete count, duplicated and foreign manifest entries are rejected", () => {
  assert.equal(reviewChunkHydration(audit, path, manifest, [snap([{ id: "x", actorId: "other" }, events[1]])]).issue, "owner-conflict");
  assert.equal(reviewChunkHydration(audit, path, manifest, [snap([events[0]])]).issue, "item-count-mismatch");
  assert.equal(reviewChunkHydration(audit, path, { ...manifest, shards: [manifest.shards[0], manifest.shards[0]] }, [snap(events)]).issue, "invalid-manifest");
  assert.equal(reviewChunkHydration(audit, path, { ...manifest, shards: ["documents__chunk_000000"] }, [snap(events)]).issue, "invalid-manifest");
});

test("future HCM chunk fields require the same complete owner-verified manifest", () => {
  // HCM fields are not currently chunked. This isolated spec is a future-compatibility
  // test, NOT a claim that the production HCM schema uses chunk manifests.
  const current = DOMAIN_SPECS.find((spec) => spec.id === "hcm")!;
  const future: DomainSpec = { ...current, fields: { ...current.fields,
    documents: { ...current.fields.documents, chunkBytes: 350_000 } } };
  const hcmPath = userDocPath("synthetic-employee", "hcm", "documents");
  const hcmShard = userDocPath("synthetic-employee", "hcm", "documents__chunk_000000");
  const source = { shardManifestVersion: 1, shards: ["documents__chunk_000000"], itemCount: 1 };
  const snapshot: FirestoreSnapshot = { path: hcmShard, exists: true, data: { items: [{ id: "doc", userId: "synthetic-employee" }] } };
  assert.equal(reviewChunkHydration(future, hcmPath, source, [snapshot]).ok, true);
  assert.equal(reviewChunkHydration(future, hcmPath, source, [{ ...snapshot, denied: true }]).ok, false);
});
