/**
 * REVIEW ONLY: actual Firebase Admin Firestore cross-domain read races.
 * The two audit domains are independent; matching contents do not attest
 * historical provenance or authorize a migration. Synthetic records only.
 * All injected rules and mutations below are emulator-only test fixtures.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { fingerprintHrAuditEvent } from
  "../../lib/hr-actor-audit-reconciliation-review.ts";
import { assessHrAuditEventProvenanceReview } from
  "../../lib/hr-audit-event-provenance-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "",
  /^(?:127\.0\.0\.1|localhost):8080$/, "Local Firestore emulator required");
assert.equal(process.env.GCLOUD_PROJECT, projectId,
  "Synthetic project required before initializing Firebase Admin");

const actor = "actor", reviewer = "reviewer";
const reviewedAt = "2026-11-05T15:00:00.000Z";
const evidenceRef = "review:synthetic-cross-domain";
const inventoryVersion = "synthetic-inventory-v1";
const ids = ["audit-1", "audit-2"];
const legacyPath = "userDomains/actor/hcm/audit";
const chunkPath = "userDomains/actor/audit/events";
const chunkNames = ["events__chunk_000000", "events__chunk_000001"];
const shardPaths = chunkNames.map((name) => "userDomains/actor/audit/" + name);
const subjectFor = (id) => id === "audit-1" ? "subjectA" : "subjectB";
const eventPath = (id) => "hrAuditReview/" + subjectFor(id) + "/events/" + id;
const receiptPath = (id) => "hrAuditReviewReceipts/" + id;
const paths = [
  legacyPath, chunkPath, ...shardPaths,
  ...ids.flatMap((id) => [eventPath(id), receiptPath(id)]),
];
const event = (id) => ({
  id, at: "2026-11-05T14:00:00.000Z", actorId: actor,
  action: "Synthetic audit", entityType: "EmploymentRecord",
  entityId: "synthetic", before: "PRIVATE before", after: "PRIVATE after",
});
const digest = (id) => fingerprintHrAuditEvent(event(id));
const rules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.equal(rules.split(marker).length, 2, "Rules insertion marker drift");
const candidateRules = rules.replace(marker, [
  "    // Emulator-only HR review paths, never deployed.",
  "    match /hrAuditReview/{subjectUid}/events/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  "    match /hrAuditReviewReceipts/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  marker,
].join("\n"));

let app, db, env;
const version = (snap) => snap.exists
  ? snap.updateTime.seconds + ":" + snap.updateTime.nanoseconds : null;
const projectSnapshot = (snap) => ({
  path: snap.ref.path, exists: snap.exists, version: version(snap),
  data: snap.exists ? snap.data() : null,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-cross-domain-snapshot-review");
  db = getFirestore(app);
  assert.equal(db.projectId, projectId);
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc(legacyPath).set({ items: ids.map(event) });
  const legacy = await db.doc(legacyPath).get();
  const legacyVersion = version(legacy);
  const batch = db.batch();
  batch.set(db.doc(chunkPath), {
    shardManifestVersion: 1, shards: chunkNames, itemCount: ids.length,
  });
  ids.forEach((id, i) => {
    batch.set(db.doc(shardPaths[i]), { items: [event(id)] });
    batch.set(db.doc(eventPath(id)), {
      event: event(id),
      provenance: {
        sourcePath: legacyPath, sourceVersion: legacyVersion,
        eventDigest: digest(id), subjectUid: subjectFor(id),
        reviewerUid: reviewer, reviewedAt, evidenceRef,
      },
    });
    batch.set(db.doc(receiptPath(id)), {
      sourcePath: legacyPath, destinationPath: eventPath(id),
      sourceVersion: legacyVersion, eventDigest: digest(id),
      subjectUid: subjectFor(id), reviewerUid: reviewer,
    });
  });
  for (const [uid, role] of [
    ["actor", "Administrator"], ["reviewer", "Administrator"],
    ["subjectA", "Sales Representative"], ["subjectB", "Sales Representative"],
    ["manager", "Sales Manager"], ["marketing", "Marketing"],
  ]) batch.set(db.doc("userAccess/" + uid), {
    uid, role, accountState: "Active", managerId: null,
  });
  await batch.commit();
});
after(async () => {
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

/** One pinned, read-only Admin transaction for all declared source documents. */
async function readCrossDomain() {
  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(paths.map((path) => tx.get(db.doc(path))));
    return Object.fromEntries(snaps.map((snap) => [
      snap.ref.path, projectSnapshot(snap),
    ]));
  }, { readOnly: true, maxAttempts: 1 });
}
function classify(state) {
  const manifest = state[chunkPath];
  const legacy = state[legacyPath];
  return assessHrAuditEventProvenanceReview({
    chunk: {
      inventory: {
        actorUid: actor, reviewerUid: reviewer, reviewedAt, evidenceRef,
        inventoryVersion, sourcePath: chunkPath,
        sourceVersion: manifest.version, independentlyVerified: true,
        expectedEventIds: ids, expectedCount: ids.length,
      },
      manifestSnapshot: manifest,
      shardSnapshots: shardPaths.map((path) => state[path]),
    },
    receipts: {
      inventory: {
        actorUid: actor, reviewerUid: reviewer, reviewedAt, evidenceRef,
        inventoryVersion, sourcePath: legacyPath,
        sourceVersion: legacy.version, independentlyVerified: true,
        expectedEventIds: ids, expectedCount: ids.length,
      },
      pairs: ids.map((id) => ({
        expected: {
          actorUid: actor, reviewerUid: reviewer, reviewedAt, evidenceRef,
          eventId: id, subjectUid: subjectFor(id), sourcePath: legacyPath,
          sourceVersion: legacy.version, eventDigest: digest(id),
        },
        subjectEvent: state[eventPath(id)],
        metadataReceipt: state[receiptPath(id)],
      })),
    },
    claims: ids.map((id) => ({
      eventId: id, chunkDigest: digest(id), legacyDigest: digest(id),
      chunkSourceVersion: manifest.version,
      legacySourceVersion: legacy.version,
      reviewerUid: reviewer, evidenceRef,
    })),
  });
}
/**
 * Test-only comparison gate. Two separate read transactions are NEVER
 * automatically one pinned snapshot, even if versions match. A version
 * change quarantines the candidate before any cross-domain classification.
 */
function classifyIndependentReads(first, second) {
  const firstPaths = Object.keys(first);
  const secondPaths = Object.keys(second);
  if (firstPaths.length !== paths.length || secondPaths.length !== paths.length ||
      paths.some((path) => !first[path]?.exists || !second[path]?.exists ||
        typeof first[path].version !== "string" ||
        first[path].version !== second[path].version)) {
    return {
      status: "quarantined", reason: "cross-read-version-drift",
      sameHistoricalSnapshotVerified: false, safeToAppend: false,
    };
  }
  return classify(second);
}
const noAuthority = (result) => {
  assert.equal(result.sameHistoricalSnapshotVerified, false);
  assert.equal(result.safeToAppend, false);
};

test("single pinned Admin read compares content but never attests historical provenance", async () => {
  const beforeState = await readCrossDomain();
  const result = classify(beforeState);
  assert.equal(result.status, "content-matched-unattested");
  assert.equal(result.independentlyAuthenticated, false);
  noAuthority(result);
  assert.deepEqual(await readCrossDomain(), beforeState,
    "Read-only comparison must not change records or versions");
});

test("unchanged independent reads still cannot claim one historical snapshot", async () => {
  const first = await readCrossDomain();
  const second = await readCrossDomain();
  const result = classifyIndependentReads(first, second);
  assert.equal(result.status, "content-matched-unattested");
  noAuthority(result);
});

test("manifest metadata-only update between reads quarantines unchanged event contents", async () => {
  const first = await readCrossDomain();
  await db.doc(chunkPath).update({ syntheticReviewMarker: "touched" });
  const second = await readCrossDomain();
  assert.notEqual(first[chunkPath].version, second[chunkPath].version);
  const result = classifyIndependentReads(first, second);
  assert.equal(result.reason, "cross-read-version-drift");
  noAuthority(result);
  assert.deepEqual(await readCrossDomain(), second);
});

test("changed chunk event between independent reads cannot pass fingerprint comparison", async () => {
  const first = await readCrossDomain();
  await db.doc(shardPaths[0]).update({
    items: [{ ...event(ids[0]), after: "PRIVATE altered" }],
  });
  const second = await readCrossDomain();
  assert.equal(classify(second).reason, "event-content-conflict");
  const result = classifyIndependentReads(first, second);
  assert.equal(result.reason, "cross-read-version-drift");
  noAuthority(result);
  assert.deepEqual(await readCrossDomain(), second);
});

test("legacy actor source changed between independent reads is quarantined", async () => {
  const first = await readCrossDomain();
  await db.doc(legacyPath).update({ syntheticReviewMarker: "touched" });
  const second = await readCrossDomain();
  assert.notEqual(first[legacyPath].version, second[legacyPath].version);
  assert.equal(classify(second).reason, "source-or-receipt-quarantined");
  const result = classifyIndependentReads(first, second);
  assert.equal(result.reason, "cross-read-version-drift");
  noAuthority(result);
  assert.deepEqual(await readCrossDomain(), second);
});

test("receipt metadata changed between independent reads blocks the whole comparison", async () => {
  const first = await readCrossDomain();
  await db.doc(receiptPath(ids[1])).update({ eventDigest: "f".repeat(64) });
  const second = await readCrossDomain();
  assert.equal(classify(second).reason, "source-or-receipt-quarantined");
  const result = classifyIndependentReads(first, second);
  assert.equal(result.reason, "cross-read-version-drift");
  noAuthority(result);
  assert.deepEqual(await readCrossDomain(), second);
});

test("missing source path in independent read cannot be treated as a complete inventory", async () => {
  const first = await readCrossDomain();
  const second = { ...first };
  delete second[shardPaths[1]];
  const result = classifyIndependentReads(first, second);
  assert.equal(result.reason, "cross-read-version-drift");
  noAuthority(result);
});

test("browser users including Administrator cannot inspect proposed private receipt paths", async () => {
  for (const uid of ["actor", "reviewer", "subjectA", "subjectB",
    "manager", "marketing"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [eventPath(ids[0]), receiptPath(ids[1])])
      await assertFails(getDoc(doc(client, path)));
  }
});

test("classification does not leak synthetic private event data or reviewer IDs", async () => {
  const first = await readCrossDomain();
  await db.doc(shardPaths[1]).update({
    items: [{ ...event(ids[1]), after: "PRIVATE changed" }],
  });
  const second = await readCrossDomain();
  const serialized = JSON.stringify(classifyIndependentReads(first, second));
  for (const secret of ["PRIVATE", "actor", "reviewer", "subjectA",
    "audit-1", "audit-2", evidenceRef])
    assert.equal(serialized.includes(secret), false);
});
