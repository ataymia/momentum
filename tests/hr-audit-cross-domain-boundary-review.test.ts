import assert from "node:assert/strict";
import test from "node:test";
import { userDocPath } from "../lib/firestore-domains";
import { fingerprintHrAuditEvent } from
  "../lib/hr-actor-audit-reconciliation-review";
import { assessHrAuditCrossDomainBoundaryReview } from
  "../lib/hr-audit-cross-domain-boundary-review";
import type { HrAuditChunkInventoryReview } from
  "../lib/hr-audit-chunk-inventory-review";
import type { HrAuditBatchInventoryReview } from
  "../lib/hr-audit-batch-recovery-review";

const actorUid = "actor1", reviewerUid = "reviewer1";
const reviewedAt = "2026-11-05T13:00:00.000Z";
const evidenceRef = "review:synthetic", inventoryVersion = "inventory:synthetic1";
const ids = ["event1", "event2"];
const chunkPath = userDocPath(actorUid, "audit", "events");
const legacyPath = `userDomains/${actorUid}/hcm/audit`;
const shardNames = ["events__chunk_000000", "events__chunk_000001"];
const event = (id: string) => ({
  id, at: "2026-11-05T12:00:00.000Z", actorId: actorUid,
  action: "Synthetic audit", entityType: "EmploymentRecord",
  entityId: "synthetic", before: "PRIVATE old", after: "PRIVATE new",
});
const fixture = () => {
  const chunkInventory: HrAuditChunkInventoryReview = {
    actorUid, reviewerUid, reviewedAt, evidenceRef, inventoryVersion,
    sourcePath: chunkPath, sourceVersion: "100:200",
    independentlyVerified: true, expectedEventIds: ids, expectedCount: 2,
  };
  const receiptInventory: HrAuditBatchInventoryReview = {
    actorUid, reviewerUid, reviewedAt, evidenceRef, inventoryVersion,
    sourcePath: legacyPath, sourceVersion: "200:300",
    independentlyVerified: true, expectedEventIds: ids, expectedCount: 2,
  };
  return {
    chunk: {
      inventory: chunkInventory,
      manifestSnapshot: {
        path: chunkPath, exists: true, version: "100:200",
        data: { shardManifestVersion: 1, shards: shardNames, itemCount: 2 },
      },
      shardSnapshots: shardNames.map((name, index) => ({
        path: userDocPath(actorUid, "audit", name),
        exists: true, version: `101:${index}`,
        data: { items: [{ ...event(ids[index]), after: "PRIVATE source" }] },
      })),
    },
    receipts: {
      inventory: receiptInventory,
      pairs: ids.map((id, index) => {
        const original = event(id);
        const eventDigest = fingerprintHrAuditEvent(original);
        const subjectUid = `subject${index}`;
        return {
          expected: {
            actorUid, reviewerUid, reviewedAt, evidenceRef, eventId: id,
            subjectUid, sourcePath: legacyPath, sourceVersion: "200:300",
            eventDigest,
          },
          subjectEvent: {
            exists: true, version: "301:400",
            data: {
              event: original,
              provenance: {
                sourcePath: legacyPath, sourceVersion: "200:300",
                eventDigest, subjectUid, reviewerUid, reviewedAt, evidenceRef,
              },
            },
          },
          metadataReceipt: {
            exists: true, version: "301:401",
            data: {
              sourcePath: legacyPath,
              destinationPath: `hrAuditReview/${subjectUid}/events/${id}`,
              sourceVersion: "200:300", eventDigest, subjectUid, reviewerUid,
            },
          },
        };
      }),
    },
  };
};
const inspect = (input = fixture()) =>
  assessHrAuditCrossDomainBoundaryReview(input);

test("two valid inventories are distinct sources, NEVER a shared pinned snapshot", () => {
  assert.deepEqual(inspect(), {
    status: "separate-sources-reviewed",
    reason: "distinct-sources-not-linked",
    safeToAppend: false, safeToReplayWithoutWrite: false,
    sameHistoricalSnapshotVerified: false,
  });
});
test("partial chunk page quarantines despite complete subject receipts", () => {
  const input = fixture();
  input.chunk.shardSnapshots.pop();
  assert.equal(inspect(input).reason, "chunk-source-quarantined");
});
test("missing chunk physical document quarantines", () => {
  const input = fixture();
  input.chunk.shardSnapshots[1].exists = false;
  assert.equal(inspect(input).status, "quarantined");
});
test("missing immutable receipt quarantines despite complete chunk source", () => {
  const input = fixture();
  input.receipts.pairs[1].metadataReceipt = {
    exists: false, version: null as never, data: null as never,
  };
  assert.equal(inspect(input).reason, "receipt-batch-quarantined");
});
test("different event sets are not a cross-domain inventory link", () => {
  const input = fixture();
  input.chunk.inventory = {
    ...input.chunk.inventory, expectedEventIds: ["event1", "event3"],
  };
  input.chunk.shardSnapshots[1].data.items[0].id = "event3";
  assert.equal(inspect(input).reason, "inventory-link-conflict");
});
test("reviewer, evidence, timestamp and inventory versions must agree", () => {
  for (const change of [
    { reviewerUid: "reviewer2" },
    { evidenceRef: "review:other" },
    { reviewedAt: "2026-11-05T13:01:00.000Z" },
    { inventoryVersion: "inventory:synthetic2" },
    { actorUid: "actor2" },
  ]) {
    const input = fixture();
    input.receipts.inventory = { ...input.receipts.inventory, ...change };
    assert.equal(inspect(input).status, "quarantined");
  }
});
test("altered subject event is quarantined without trusting source inventory", () => {
  const input = fixture();
  input.receipts.pairs[0].subjectEvent.data.event.after = "PRIVATE forged";
  assert.equal(inspect(input).reason, "receipt-batch-quarantined");
});
test("malformed input fails closed without private identifiers", () => {
  for (const input of [null, {}, { chunk: null, receipts: {} }]) {
    const result = assessHrAuditCrossDomainBoundaryReview(input as never);
    assert.equal(result.status, "quarantined");
    assert.equal(result.safeToReplayWithoutWrite, false);
  }
});
test("classification is pure and output contains no HR records or evidence", () => {
  const input = fixture(), before = JSON.stringify(input);
  const output = JSON.stringify(inspect(input));
  assert.equal(JSON.stringify(input), before);
  for (const privateValue of [
    "PRIVATE", actorUid, reviewerUid, evidenceRef,
    "subject0", "event1", "events__chunk",
  ]) assert.equal(output.includes(privateValue), false);
});
