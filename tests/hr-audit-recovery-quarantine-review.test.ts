import assert from "node:assert/strict";
import test from "node:test";
import { assessHrAuditReceiptRecoveryReview } from
  "../lib/hr-audit-recovery-quarantine-review";
import { fingerprintHrAuditEvent } from
  "../lib/hr-actor-audit-reconciliation-review";

const event = () => ({
  id: "event1", at: "2026-11-05T09:00:00.000Z",
  actorId: "actor1", action: "Synthetic HR change",
  entityType: "EmploymentRecord", entityId: "fake",
  before: "PRIVATE synthetic old", after: "PRIVATE synthetic new",
});
const expected = () => ({
  actorUid: "actor1", subjectUid: "subject1", reviewerUid: "reviewer1",
  eventId: "event1", sourcePath: "userDomains/actor1/hcm/audit",
  sourceVersion: "1:200", eventDigest: fingerprintHrAuditEvent(event()),
  reviewedAt: "2026-11-05T09:10:00.000Z",
  evidenceRef: "review:synthetic",
});
const target = () => ({
  event: event(),
  provenance: {
    sourcePath: expected().sourcePath,
    sourceVersion: expected().sourceVersion,
    eventDigest: expected().eventDigest,
    subjectUid: "subject1", reviewerUid: "reviewer1",
    reviewedAt: expected().reviewedAt, evidenceRef: expected().evidenceRef,
  },
});
const receipt = () => ({
  sourcePath: expected().sourcePath,
  destinationPath: "hrAuditReview/subject1/events/event1",
  sourceVersion: expected().sourceVersion,
  eventDigest: expected().eventDigest,
  subjectUid: "subject1", reviewerUid: "reviewer1",
});
const missing = () => ({ exists: false as const, version: null, data: null });
const present = (data: unknown) => ({
  exists: true as const, version: "2:400", data,
});
const inspect = (subjectEvent: ReturnType<typeof missing> | ReturnType<typeof present>,
  metadataReceipt: ReturnType<typeof missing> | ReturnType<typeof present>,
  changes: Partial<ReturnType<typeof expected>> = {}) =>
  assessHrAuditReceiptRecoveryReview({
    expected: { ...expected(), ...changes }, subjectEvent, metadataReceipt,
  });

test("complete versioned inventory with no pair is not-migrated, never a write command", () => {
  assert.deepEqual(inspect(missing(), missing()), {
    status: "not-migrated", reason: "none",
    safeToAppend: true, safeToReplayWithoutWrite: false,
  });
});

test("exact immutable pair is replayable only without writing", () => {
  assert.deepEqual(inspect(present(target()), present(receipt())), {
    status: "verified-pair", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: true,
  });
});

test("missing metadata receipt quarantines an existing subject event", () => {
  assert.deepEqual(inspect(present(target()), missing()), {
    status: "quarantined", reason: "missing-receipt",
    safeToAppend: false, safeToReplayWithoutWrite: false,
  });
});

test("orphan metadata receipt quarantines without fabricating an event", () => {
  assert.equal(inspect(missing(), present(receipt())).reason, "orphan-receipt");
});

test("unverified absence and malformed version cannot be mistaken for safe append", () => {
  for (const subjectEvent of [
    { exists: false, version: null, data: { fake: true } },
    { exists: false, version: "unknown", data: null },
    { exists: true, version: null, data: target() },
    { exists: true, version: "2:4", data: null },
  ]) {
    const report = assessHrAuditReceiptRecoveryReview({
      expected: expected(), subjectEvent, metadataReceipt: missing(),
    });
    assert.equal(report.reason, "invalid-inventory");
    assert.equal(report.safeToAppend, false);
  }
});

test("forged event or provenance never becomes a valid replay", () => {
  for (const changed of [
    { ...target(), event: { ...event(), after: "forged" } },
    { ...target(), event: { ...event(), actorId: "subject1" } },
    { ...target(), provenance: { ...target().provenance, reviewerUid: "actor1" } },
    { ...target(), provenance: { ...target().provenance, extra: "PRIVATE" } },
  ]) {
    const report = inspect(present(changed), present(receipt()));
    assert.equal(report.reason, "event-conflict");
    assert.equal(report.safeToReplayWithoutWrite, false);
  }
});

test("forged receipt, mismatched destination and extra fields quarantine", () => {
  for (const changed of [
    { ...receipt(), eventDigest: "f".repeat(64) },
    { ...receipt(), destinationPath: "hrAuditReview/other/events/event1" },
    { ...receipt(), reviewerUid: "actor1" },
    { ...receipt(), extra: "PRIVATE" },
  ]) {
    assert.equal(inspect(present(target()), present(changed)).reason, "receipt-conflict");
  }
});

test("untrusted context never authorizes append or replay", () => {
  for (const changes of [
    { actorUid: "bad/path" },
    { reviewerUid: "actor1" },
    { sourcePath: "userDomains/other/hcm/audit" },
    { eventId: "../bad" },
    { eventDigest: "not-a-digest" },
    { evidenceRef: "PRIVATE note" },
    { reviewedAt: "not-a-date" },
  ]) {
    const report = inspect(missing(), missing(), changes);
    assert.equal(report.reason, "invalid-context");
    assert.equal(report.safeToAppend, false);
  }
});

test("report never serializes private audit contents or reviewer evidence", () => {
  const report = inspect(present({
    ...target(), event: { ...event(), after: "PRIVATE synthetic extra" },
  }), present(receipt()));
  const serialized = JSON.stringify(report);
  assert.equal(report.status, "quarantined");
  assert.ok(!serialized.includes("PRIVATE"));
  assert.ok(!serialized.includes("review:synthetic"));
  assert.ok(!serialized.includes("actor1"));
});

test("classification is pure and does not alter caller-owned snapshots", () => {
  const subjectEvent = present(target());
  const metadataReceipt = present(receipt());
  const before = JSON.stringify({ subjectEvent, metadataReceipt });
  inspect(subjectEvent, metadataReceipt);
  assert.equal(JSON.stringify({ subjectEvent, metadataReceipt }), before);
});
