import assert from "node:assert/strict";
import test from "node:test";
import {
  assessHrAuditBatchRecoveryReview,
  type HrAuditBatchInventoryReview,
  type HrAuditBatchPairReview,
} from "../lib/hr-audit-batch-recovery-review";
import { fingerprintHrAuditEvent } from
  "../lib/hr-actor-audit-reconciliation-review";

const actorUid = "actor1";
const reviewerUid = "reviewer1";
const sourcePath = "userDomains/actor1/hcm/audit";
const sourceVersion = "1:200";
const reviewedAt = "2026-11-05T10:00:00.000Z";
const event = (id: string) => ({
  id, at: "2026-11-05T09:00:00.000Z", actorId: actorUid,
  action: "Synthetic HR change", entityType: "EmploymentRecord",
  entityId: "fake", before: "PRIVATE synthetic old",
  after: "PRIVATE synthetic new",
});
const inventory = (): HrAuditBatchInventoryReview => ({
  actorUid, sourcePath, sourceVersion, inventoryVersion: "inventory:1",
  reviewerUid, reviewedAt, evidenceRef: "review:synthetic",
  independentlyVerified: true, expectedEventIds: ["event1", "event2"],
  expectedCount: 2,
});
const pair = (eventId: string, subjectUid: string): HrAuditBatchPairReview => {
  const original = event(eventId);
  const eventDigest = fingerprintHrAuditEvent(original);
  return {
    expected: {
      actorUid, subjectUid, reviewerUid, eventId, sourcePath,
      sourceVersion, eventDigest, reviewedAt, evidenceRef: "review:synthetic",
    },
    subjectEvent: {
      exists: true, version: "2:400",
      data: {
        event: original,
        provenance: {
          sourcePath, sourceVersion, eventDigest, subjectUid,
          reviewerUid, reviewedAt, evidenceRef: "review:synthetic",
        },
      },
    },
    metadataReceipt: {
      exists: true, version: "2:401",
      data: {
        sourcePath, destinationPath:
          `hrAuditReview/${subjectUid}/events/${eventId}`,
        sourceVersion, eventDigest, subjectUid, reviewerUid,
      },
    },
  };
};
const pairs = () => [pair("event1", "subject1"), pair("event2", "subject2")];
const scan = (
  items: readonly HrAuditBatchPairReview[] = pairs(),
  manifest: HrAuditBatchInventoryReview = inventory(),
) => assessHrAuditBatchRecoveryReview({ inventory: manifest, pairs: items });
const absent = () => ({ exists: false as const, version: null, data: null });

test("two independently inventoried complete pairs allow only read-only replay", () => {
  assert.deepEqual(scan(), {
    status: "consistent-read-only", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: true,
  });
});

test("missing inventory item quarantines the entire batch, not partial replay", () => {
  assert.equal(scan(pairs().slice(0, 1)).reason, "incomplete-inventory");
  assert.equal(scan(pairs().slice(0, 1)).safeToReplayWithoutWrite, false);
});

test("duplicate IDs in independently reviewed inventory are rejected", () => {
  const manifest = { ...inventory(), expectedEventIds: ["event1", "event1"] };
  assert.equal(scan(pairs(), manifest).reason, "duplicate-event-id");
});

test("duplicate candidate event IDs cannot overwrite another subject", () => {
  assert.equal(scan([pair("event1", "subject1"), pair("event1", "subject2")])
    .reason, "duplicate-event-id");
});

test("unexpected candidate event ID is not silently admitted", () => {
  assert.equal(scan([pair("event1", "subject1"), pair("event3", "subject3")])
    .reason, "unexpected-event-id");
});

test("one missing receipt quarantines otherwise complete batch", () => {
  const items = pairs();
  items[1].metadataReceipt = absent();
  assert.equal(scan(items).reason, "pair-incomplete");
});

test("one orphan receipt quarantines otherwise complete batch", () => {
  const items = pairs();
  items[0].subjectEvent = absent();
  assert.equal(scan(items).reason, "pair-incomplete");
});

test("both positively absent documents are not authorization to append", () => {
  const items = pairs();
  items[1].subjectEvent = absent();
  items[1].metadataReceipt = absent();
  const report = scan(items);
  assert.equal(report.reason, "pair-incomplete");
  assert.equal(report.safeToAppend, false);
});

test("one forged event or receipt quarantines all records", () => {
  for (const change of ["event", "receipt"]) {
    const items = pairs();
    if (change === "event") {
      const data = items[0].subjectEvent.data as Record<string, unknown>;
      data.event = { ...event("event1"), after: "PRIVATE forged" };
    } else {
      const data = items[0].metadataReceipt.data as Record<string, unknown>;
      data.eventDigest = "f".repeat(64);
    }
    assert.equal(scan(items).reason, "pair-conflict");
  }
});

test("batch source identity and version must match each pair", () => {
  for (const change of [
    { actorUid: "another" }, { sourceVersion: "old" },
    { reviewerUid: "another" }, { sourcePath: "wrong" },
  ]) {
    const items = pairs();
    items[1].expected = { ...items[1].expected, ...change };
    assert.equal(scan(items).reason, "pair-conflict");
  }
});

test("missing independent inventory attestation or evidence blocks scan", () => {
  for (const change of [
    { independentlyVerified: false }, { evidenceRef: "" },
    { reviewerUid: actorUid }, { reviewedAt: "invalid" },
    { inventoryVersion: "" }, { sourceVersion: "" },
    { sourcePath: "wrong" },
  ]) {
    const manifest = { ...inventory(), ...change } as HrAuditBatchInventoryReview;
    assert.equal(scan(pairs(), manifest).reason, "invalid-inventory");
  }
});

test("inventory count must match the full declared list", () => {
  assert.equal(scan(pairs(), { ...inventory(), expectedCount: 3 })
    .reason, "invalid-inventory");
  assert.equal(scan(pairs(), { ...inventory(), expectedCount: 0 })
    .reason, "invalid-inventory");
});

test("oversized and empty batches fail closed", () => {
  const tooMany = Array.from({ length: 1001 }, (_, i) => `event${i}`);
  assert.equal(scan([], { ...inventory(), expectedCount: 1001,
    expectedEventIds: tooMany }).reason, "invalid-inventory");
  assert.equal(scan([], { ...inventory(), expectedCount: 0,
    expectedEventIds: [] }).reason, "invalid-inventory");
});

test("malformed runtime input never throws or returns a positive status", () => {
  for (const input of [null, {}, { inventory: null, pairs: [] },
    { inventory: inventory(), pairs: null },
    { inventory: inventory(), pairs: [null] }]) {
    const report = assessHrAuditBatchRecoveryReview(
      input as unknown as Parameters<typeof assessHrAuditBatchRecoveryReview>[0],
    );
    assert.equal(report.status, "quarantined");
    assert.equal(report.safeToAppend, false);
  }
});

test("no private event content, subject, actor, reviewer or evidence in report", () => {
  const items = pairs();
  const data = items[1].subjectEvent.data as Record<string, unknown>;
  data.event = { ...event("event2"), after: "PRIVATE sentinel" };
  const serialized = JSON.stringify(scan(items));
  for (const secret of ["PRIVATE", "subject1", "subject2", "actor1",
    "reviewer1", "review:synthetic", "event1", "event2"]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("scan never mutates caller-owned manifest or snapshots", () => {
  const items = pairs();
  const manifest = inventory();
  const before = JSON.stringify({ items, manifest });
  scan(items, manifest);
  assert.equal(JSON.stringify({ items, manifest }), before);
});
