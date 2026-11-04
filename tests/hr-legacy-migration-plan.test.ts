import test from "node:test";
import assert from "node:assert/strict";
import { planHrLegacySharedField, HR_LEGACY_PLAN_VERSION } from "../lib/hr-legacy-migration-plan";
import { userDocPath } from "../lib/firestore-domains";

const uids = new Set(["uid-alex", "uid-jordan"]);
const path = (uid: string, field: string) => userDocPath(uid, "hcm", field);
const doc = (items: unknown[]) => ({ items });
const plan = (
  field: string, items: unknown[],
  existingUserDocuments = new Map<string, { items?: unknown }>(),
) => planHrLegacySharedField({
  field, sharedDocument: doc(items), knownUserIds: uids, existingUserDocuments,
});

test("legacy HR planner is pure, deterministic and versioned; never deletes shared history", () => {
  const source = [
    { id: "doc-2", userId: "uid-jordan", status: "Missing" },
    { id: "doc-1", userId: "uid-alex", status: "Available" },
  ];
  const snapshot = JSON.stringify(source);
  const first = plan("documents", source);
  assert.equal(first.version, HR_LEGACY_PLAN_VERSION);
  assert.equal(first.sourcePath, "domains/hcm/fields/documents");
  assert.deepEqual(first.copyCandidates.map((c) => c.destinationPath), [
    path("uid-alex", "documents"), path("uid-jordan", "documents"),
  ]);
  assert.equal(first.sourceCount, 2);
  assert.equal(first.alreadyPresent, 0);
  assert.equal(first.needsHumanReconciliation, false);
  assert.equal(JSON.stringify(source), snapshot);
  assert.deepEqual(plan("documents", source), first);
  const migrated = new Map([
    [path("uid-alex", "documents"), doc([{ ...source[1] }])],
    [path("uid-jordan", "documents"), doc([{ ...source[0] }])],
  ]);
  const second = plan("documents", source, migrated);
  assert.equal(second.copyCandidates.length, 0);
  assert.equal(second.alreadyPresent, 2);
  assert.equal(second.needsHumanReconciliation, false);
  assert.equal(JSON.stringify(source), snapshot, "source records must remain untouched");
});

test("missing, invalid and unknown ownership are quarantined without guessing identity", () => {
  const result = plan("leaveRequests", [
    { id: "valid", userId: "uid-alex", reason: "private" },
    { id: "missing" },
    { id: "invalid", userId: "uid/other" },
    { id: "unknown", userId: "uid-unknown" },
    "not-an-object",
  ]);
  assert.deepEqual(result.copyCandidates.map((c) => c.recordId), ["valid"]);
  assert.deepEqual(result.quarantine.map((q) => q.reason), [
    "missing-owner", "invalid-owner", "unknown-owner", "malformed-record",
  ]);
  assert.equal(result.needsHumanReconciliation, true);
  assert.ok(!JSON.stringify(result.quarantine).includes("private"), "quarantine never echoes sensitive payload");
});

test("conflicting duplicate record IDs across owners quarantine BOTH copies", () => {
  const result = plan("documents", [
    { id: "same", userId: "uid-alex", status: "Missing" },
    { id: "same", userId: "uid-jordan", status: "Available" },
  ]);
  assert.equal(result.copyCandidates.length, 0);
  assert.deepEqual(result.quarantine, [
    { sourceIndex: 0, reason: "duplicate-conflict" },
    { sourceIndex: 1, reason: "duplicate-conflict" },
  ]);
});

test("conflicting source duplicate invalidates an earlier target match too", () => {
  const original = { id: "same", userId: "uid-alex", status: "Missing" };
  const result = plan("documents", [original, { ...original, status: "Available" }],
    new Map([[path("uid-alex", "documents"), doc([original])]]));
  assert.equal(result.copyCandidates.length, 0);
  assert.equal(result.alreadyPresent, 0);
  assert.equal(result.quarantine.length, 2);
});

test("identical source duplicates are counted but not copied twice", () => {
  const record = { id: "same", userId: "uid-alex", status: "Missing" };
  const result = plan("documents", [record, { status: "Missing", userId: "uid-alex", id: "same" }]);
  assert.equal(result.copyCandidates.length, 1);
  assert.equal(result.identicalSourceDuplicates, 1);
  assert.equal(result.needsHumanReconciliation, true);
});

test("existing target conflicts never overwrite history", () => {
  const source = { id: "doc-1", userId: "uid-alex", status: "Missing" };
  const existing = new Map([[path("uid-alex", "documents"), doc([{ ...source, status: "Available" }])]]);
  const result = plan("documents", [source], existing);
  assert.equal(result.copyCandidates.length, 0);
  assert.deepEqual(result.quarantine, [{ sourceIndex: 0, reason: "target-conflict" }]);
  assert.deepEqual(existing.get(path("uid-alex", "documents"))?.items, [{ ...source, status: "Available" }]);
});

test("malformed destination or cross-owner contamination fails closed", () => {
  const source = [{ id: "doc-1", userId: "uid-alex" }];
  for (const target of [{ items: "bad" }, doc([{ id: "other", userId: "uid-jordan" }])]) {
    const result = plan("documents", source, new Map([[path("uid-alex", "documents"), target]]));
    assert.equal(result.copyCandidates.length, 0);
    assert.deepEqual(result.quarantine, [{ sourceIndex: 0, reason: "malformed-target" }]);
  }
});

test("private profiles without record IDs retain exactly one stable owner key", () => {
  const result = plan("privateProfiles", [{ userId: "uid-alex", updatedAt: "2026-11-04" }]);
  assert.equal(result.copyCandidates[0]?.recordId, "profile:uid-alex");
});

test("compensation records remain review-only even when owner is valid", () => {
  const result = plan("compensation", [{ id: "rate-1", userId: "uid-alex", rate: 0 }]);
  assert.equal(result.copyCandidates.length, 1);
  assert.equal(result.needsHumanReconciliation, false);
  assert.equal(typeof (result as unknown as Record<string, unknown>).apply, "undefined");
});

test("unsupported, shared, chunked and malformed inputs never create a plan", () => {
  for (const field of ["employees", "policies", "audit", "notAField"]) {
    assert.throws(() => plan(field, []), /Only HCM user-owned|Chunked HCM/);
  }
  assert.throws(() => planHrLegacySharedFieldMigrationInvalid(), /Legacy source/);
});
function planHrLegacySharedFieldMigrationInvalid() {
  return planHrLegacySharedField({
    field: "documents", sharedDocument: { items: null }, knownUserIds: uids,
    existingUserDocuments: new Map(),
  });
}
