import test from "node:test";
import assert from "node:assert/strict";
import { planHrLegacySharedField } from "../lib/hr-legacy-migration-plan";
import { userDocPath } from "../lib/firestore-domains";
import {
  assessHrLegacyBatchDryRun, assessHrLegacyRestoreReadiness,
  inspectChunkedAuditInventory, type VersionedSnapshot,
} from "../lib/hr-legacy-reconciliation";

const sourcePath = "domains/hcm/fields/documents";
const alexPath = userDocPath("uid-alex", "hcm", "documents");
const jordanPath = userDocPath("uid-jordan", "hcm", "documents");
const sample = [
  { id: "d-1", userId: "uid-alex", status: "Missing" },
  { id: "d-2", userId: "uid-jordan", status: "Available" },
];
const baseline = (): VersionedSnapshot[] => [
  { path: sourcePath, version: "source@1", data: { items: sample } },
  { path: alexPath, version: null, data: null },
  { path: jordanPath, version: null, data: null },
];
const makePlan = () => planHrLegacySharedField({
  field: "documents", sharedDocument: { items: sample },
  knownUserIds: new Set(["uid-alex", "uid-jordan"]),
  existingUserDocuments: new Map([[alexPath, null], [jordanPath, null]]),
});
const check = (before = baseline(), current = structuredClone(before)) =>
  assessHrLegacyBatchDryRun({ plan: makePlan(), baseline: before, current, maxBatchRecords: 1 });

test("versioned dry run creates bounded metadata-only batches and explicit CAS preconditions", () => {
  const original = JSON.stringify(sample);
  const report = check();
  assert.equal(report.status, "ready-for-human-review");
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.batches, [
    { batch: 1, records: 1, targets: 1 },
    { batch: 2, records: 1, targets: 1 },
  ]);
  assert.deepEqual(report.preconditions, [
    { path: sourcePath, expectedVersion: "source@1" },
    { path: alexPath, expectedVersion: null },
    { path: jordanPath, expectedVersion: null },
  ]);
  assert.equal(JSON.stringify(sample), original);
  assert.ok(!JSON.stringify(report).includes("Missing"), "report must not echo HR values");
  assert.equal((report as unknown as Record<string, unknown>).apply, undefined);
});

test("stale source, changed target, and absent target created after inventory all fail closed", () => {
  for (const [path, newVersion, newData] of [
    [sourcePath, "source@2", { items: sample }],
    [alexPath, "target@1", { items: [] }],
    [jordanPath, "target@1", { items: [] }],
  ] as const) {
    const after = structuredClone(baseline());
    const target = after.find((entry) => entry.path === path)!;
    target.version = newVersion;
    target.data = newData;
    const result = check(baseline(), after);
    assert.equal(result.status, "blocked");
    assert.ok(result.issues.includes("stale-snapshot"));
    assert.deepEqual(result.batches, []);
    assert.deepEqual(result.preconditions, []);
  }
});

test("missing, duplicate and malformed inventory snapshots never mean verified absence", () => {
  const before = baseline();
  assert.ok(check(before, before.slice(0, 2)).issues.includes("incomplete-inventory"));
  assert.ok(check([...before, before[0]], before).issues.includes("invalid-snapshot"));
  assert.ok(check(before, [{ ...before[0], version: null }, ...before.slice(1)])
    .issues.includes("invalid-snapshot"));
  assert.ok(check(before, [...before, { path: "unrelated", version: null, data: null }])
    .issues.includes("incomplete-inventory"));
});

test("unsafe or unresolved migration plan never becomes an executable batch", () => {
  const plan = makePlan();
  plan.quarantine.push({ sourceIndex: 0, reason: "target-conflict" });
  assert.ok(assessHrLegacyBatchDryRun({ plan, baseline: baseline(), current: baseline() })
    .issues.includes("unresolved-records"));
  const bad = makePlan();
  bad.copyCandidates[0].destinationPath = jordanPath;
  assert.ok(assessHrLegacyBatchDryRun({ plan: bad, baseline: baseline(), current: baseline() })
    .issues.includes("candidate-mismatch"));
  const limit = assessHrLegacyBatchDryRun({
    plan: makePlan(), baseline: baseline(), current: baseline(), maxBatchRecords: 401,
  });
  assert.ok(limit.issues.includes("invalid-plan"));
});

test("restore evidence requires exact backup versions and tested restoration for every path", () => {
  const before = baseline();
  const dryRun = check(before, structuredClone(before));
  const receipts = dryRun.preconditions.map(({ path, expectedVersion }) => ({
    path, originalVersion: expectedVersion, verified: true, restoreTested: true,
  }));
  const ready = assessHrLegacyRestoreReadiness({
    dryRun, baseline: before, current: structuredClone(before), backups: receipts,
  });
  assert.equal(ready.status, "ready-for-human-review");
  const missing = assessHrLegacyRestoreReadiness({
    dryRun, baseline: before, current: before, backups: receipts.slice(1),
  });
  assert.ok(missing.issues.includes("backup-unverified"));
  const untested = assessHrLegacyRestoreReadiness({
    dryRun, baseline: before, current: before,
    backups: receipts.map((receipt, index) =>
      index === 1 ? { ...receipt, restoreTested: false } : receipt),
  });
  assert.ok(untested.issues.includes("backup-unverified"));
  const changed = structuredClone(before);
  changed[0].version = "source@2";
  const unsafe = assessHrLegacyRestoreReadiness({
    dryRun, baseline: before, current: changed, backups: receipts,
  });
  assert.ok(unsafe.issues.includes("source-changed"));
  assert.equal((unsafe as unknown as Record<string, unknown>).restore, undefined);
});

const auditManifestPath = userDocPath("uid-alex", "audit", "events");
const auditChunk = (index: number) =>
  userDocPath("uid-alex", "audit", `events__chunk_${String(index).padStart(6, "0")}`);
const chunks = (): VersionedSnapshot[] => [
  { path: auditManifestPath, version: "manifest@1",
    data: { shardManifestVersion: 1, shards: ["events__chunk_000000", "events__chunk_000001"], itemCount: 2 } },
  { path: auditChunk(0), version: "chunk@1", data: { items: [{ id: "a", actorId: "uid-alex" }] } },
  { path: auditChunk(1), version: "chunk@2", data: { items: [{ id: "b", actorId: "uid-alex" }] } },
];

test("chunk-aware audit inventory validates manifest, physical shards and counts without copying", () => {
  const result = inspectChunkedAuditInventory({
    manifestPath: auditManifestPath, snapshots: chunks(),
  });
  assert.deepEqual(result, {
    status: "ready-for-human-review", issues: [], manifestVersion: 1,
    chunks: 2, countedRecords: 2,
  });
  assert.equal((result as unknown as Record<string, unknown>).migrate, undefined);
});

test("missing, reordered, duplicate, cross-owner and count-drift chunks fail closed", () => {
  assert.ok(inspectChunkedAuditInventory({
    manifestPath: auditManifestPath, snapshots: chunks().slice(0, 2),
  }).issues.includes("missing-chunk"));
  const reordered = chunks();
  reordered[0].data!.shards = ["events__chunk_000001", "events__chunk_000000"];
  assert.ok(inspectChunkedAuditInventory({
    manifestPath: auditManifestPath, snapshots: reordered,
  }).issues.includes("invalid-chunk-manifest"));
  const crossOwner = chunks();
  crossOwner[1].data!.items = [{ id: "x", actorId: "uid-jordan" }];
  assert.ok(inspectChunkedAuditInventory({
    manifestPath: auditManifestPath, snapshots: crossOwner,
  }).issues.includes("chunk-owner-mismatch"));
  const wrongCount = chunks();
  wrongCount[0].data!.itemCount = 99;
  assert.ok(inspectChunkedAuditInventory({
    manifestPath: auditManifestPath, snapshots: wrongCount,
  }).issues.includes("chunk-count-mismatch"));
  assert.ok(inspectChunkedAuditInventory({
    manifestPath: userDocPath("uid-alex", "hcm", "audit"), snapshots: chunks(),
  }).issues.includes("invalid-chunk-manifest"));
});
