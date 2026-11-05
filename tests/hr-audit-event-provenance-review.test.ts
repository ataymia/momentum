import assert from "node:assert/strict";
import test from "node:test";
import { userDocPath } from "../lib/firestore-domains";
import { fingerprintHrAuditEvent } from
  "../lib/hr-actor-audit-reconciliation-review";
import { assessHrAuditEventProvenanceReview } from
  "../lib/hr-audit-event-provenance-review";

type Input = Parameters<typeof assessHrAuditEventProvenanceReview>[0];
const actor = "actor1", reviewer = "reviewer1";
const when = "2026-11-05T14:00:00.000Z";
const ids = ["event1", "event2"];
const chunkPath = userDocPath(actor, "audit", "events");
const legacyPath = userDocPath(actor, "hcm", "audit");
const names = ["events__chunk_000000", "events__chunk_000001"];
const event = (id: string) => ({
  id, at: when, actorId: actor, action: "Synthetic audit",
  entityType: "EmploymentRecord", entityId: "synthetic",
  before: "PRIVATE before", after: "PRIVATE after",
});
const fixture = (): Input => ({
  chunk: {
    inventory: {
      actorUid: actor, reviewerUid: reviewer, reviewedAt: when,
      evidenceRef: "review:synthetic", inventoryVersion: "inventory1",
      sourcePath: chunkPath, sourceVersion: "100:200",
      independentlyVerified: true, expectedEventIds: ids, expectedCount: 2,
    },
    manifestSnapshot: {
      path: chunkPath, exists: true, version: "100:200",
      data: { shardManifestVersion: 1, shards: names, itemCount: 2 },
    },
    shardSnapshots: names.map((name, index) => ({
      path: userDocPath(actor, "audit", name),
      exists: true, version: `101:${index}`,
      data: { items: [event(ids[index])] },
    })),
  },
  receipts: {
    inventory: {
      actorUid: actor, reviewerUid: reviewer, reviewedAt: when,
      evidenceRef: "review:synthetic", inventoryVersion: "inventory1",
      sourcePath: legacyPath, sourceVersion: "200:300",
      independentlyVerified: true, expectedEventIds: ids, expectedCount: 2,
    },
    pairs: ids.map((id, index) => {
      const original = event(id);
      const eventDigest = fingerprintHrAuditEvent(original);
      const subjectUid = `subject${index}`;
      return {
        expected: {
          actorUid: actor, reviewerUid: reviewer, reviewedAt: when,
          evidenceRef: "review:synthetic", eventId: id, subjectUid,
          sourcePath: legacyPath, sourceVersion: "200:300", eventDigest,
        },
        subjectEvent: {
          exists: true, version: "301:400",
          data: {
            event: original,
            provenance: {
              sourcePath: legacyPath, sourceVersion: "200:300",
              eventDigest, subjectUid, reviewerUid: reviewer,
              reviewedAt: when, evidenceRef: "review:synthetic",
            },
          },
        },
        metadataReceipt: {
          exists: true, version: "301:401",
          data: {
            sourcePath: legacyPath,
            destinationPath: `hrAuditReview/${subjectUid}/events/${id}`,
            sourceVersion: "200:300", eventDigest,
            subjectUid, reviewerUid: reviewer,
          },
        },
      };
    }),
  },
  claims: ids.map((id) => ({
    eventId: id,
    chunkDigest: fingerprintHrAuditEvent(event(id)),
    legacyDigest: fingerprintHrAuditEvent(event(id)),
    chunkSourceVersion: "100:200", legacySourceVersion: "200:300",
    reviewerUid: reviewer, evidenceRef: "review:synthetic",
  })),
});

test("byte-equivalent events are only content-matched, never independently attested", () => {
  assert.deepEqual(assessHrAuditEventProvenanceReview(fixture()), {
    status: "content-matched-unattested", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: false,
    independentlyAuthenticated: false, sameHistoricalSnapshotVerified: false,
  });
});
test("matching IDs with different event bytes quarantine", () => {
  const input = fixture();
  (input.chunk.shardSnapshots[0].data as {items: ReturnType<typeof event>[]})
    .items[0].after = "PRIVATE altered";
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "event-content-conflict");
});
test("a false caller-supplied chunk digest cannot authorize equivalence", () => {
  const input = fixture();
  input.claims[0].chunkDigest = "a".repeat(64);
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "event-content-conflict");
});
test("a forged legacy digest cannot authorize equivalence", () => {
  const input = fixture();
  input.claims[0].legacyDigest = "b".repeat(64);
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "event-content-conflict");
});
test("missing claim fails closed", () => {
  const input = fixture();
  (input.claims as Array<(typeof input.claims)[number]>).pop();
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "incomplete-mapping");
});
test("duplicate mapping fails closed", () => {
  const input = fixture();
  (input.claims as Array<(typeof input.claims)[number]>)[1] =\n    {...input.claims[0]};
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "duplicate-event");
});
test("claim cannot refer to stale source versions", () => {
  const input = fixture();
  input.claims[0].chunkSourceVersion = "stale";
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "invalid-claim");
});
test("claim cannot substitute another reviewer or evidence reference", () => {
  for (const change of [
    {reviewerUid: "someoneElse"}, {evidenceRef: "review:other"},
  ]) {
    const input = fixture();
    input.claims[0] = {...input.claims[0], ...change};
    assert.equal(assessHrAuditEventProvenanceReview(input).reason,
      "invalid-claim");
  }
});
test("missing source shard quarantines before digest matching", () => {
  const input = fixture();
  (input.chunk.shardSnapshots as Array<\n    (typeof input.chunk.shardSnapshots)[number]>).pop();
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "source-or-receipt-quarantined");
});
test("tampered subject receipt quarantines before digest matching", () => {
  const input = fixture();
  (input.receipts.pairs[0].subjectEvent.data as
    {event: ReturnType<typeof event>}).event.after = "PRIVATE forged";
  assert.equal(assessHrAuditEventProvenanceReview(input).reason,
    "source-or-receipt-quarantined");
});
test("malformed mapping fails closed without throwing", () => {
  for (const input of [null, {}, {chunk: {}, receipts: {}, claims: null}]) {
    assert.equal(assessHrAuditEventProvenanceReview(input as never).status,
      "quarantined");
  }
});
test("review does not mutate input or leak identifiers or private bytes", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const output = JSON.stringify(assessHrAuditEventProvenanceReview(input));
  assert.equal(JSON.stringify(input), before);
  for (const secret of [
    "PRIVATE", "event1", actor, reviewer, "subject0", "review:synthetic",
  ]) assert.equal(output.includes(secret), false);
});
