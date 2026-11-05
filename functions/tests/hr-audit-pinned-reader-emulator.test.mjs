/**
 * REVIEW ONLY: actual Firebase Admin Firestore, synthetic data, local emulator.
 * No production identity, history, rule, endpoint, migration or write path.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { createHrAuditPinnedReaderReview } from
  "../../lib/hr-audit-pinned-reader-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
assert.equal(process.env.GCLOUD_PROJECT, projectId);
const actor = "actor", reviewer = "reviewer";
const ids = ["audit-1", "audit-2"];
const shards = ["events__chunk_000000", "events__chunk_000001"];
const chunkPath = "userDomains/actor/audit/events";
const legacyPath = "userDomains/actor/hcm/audit";
const shardPaths = shards.map((name) => "userDomains/actor/audit/" + name);
const subjectFor = (id) => id === "audit-1" ? "subjectA" : "subjectB";
const eventPath = (id) => "hrAuditReview/" + subjectFor(id) + "/events/" + id;
const receiptPath = (id) => "hrAuditReviewReceipts/" + id;
const paths = [
  chunkPath, legacyPath, ...shardPaths,
  ...ids.map(eventPath), ...ids.map(receiptPath),
];
const event = (id) => ({
  id, actorId: actor, at: "2026-11-05T16:00:00.000Z",
  action: "Synthetic review", before: "PRIVATE before",
  after: "PRIVATE after",
});
const deniedRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}`;
let app, db, env;
const version = (snap) => snap.updateTime.seconds + ":" +
  snap.updateTime.nanoseconds;
const readVersions = async () => Object.fromEntries(await Promise.all(
  paths.map(async (path) => {
    const snap = await db.doc(path).get();
    return [path, snap.exists ? version(snap) : null];
  })));
const inventory = async () => ({
  actorUid: actor, reviewerUid: reviewer, shardNames: [...shards],
  eventSubjects: ids.map((eventId) => ({
    eventId, subjectUid: subjectFor(eventId),
  })),
  expectedVersions: await readVersions(),
});
const create = async ({
  enabled = true, authorizeReviewer = async () => true,
  expected = null, emulatorHost = "127.0.0.1:8080",
  firestore = db,
} = {}) => createHrAuditPinnedReaderReview({
  projectId, emulatorHost, firestore,
  inventory: expected ?? await inventory(), authorizeReviewer,
}, enabled);
const quarantined = (reason) => ({
  status: "quarantined", reason, safeToAppend: false,
  safeToReplayWithoutWrite: false, independentlyAuthenticated: false,
  sameHistoricalSnapshotVerified: false,
});
const consistent = {
  status: "versions-matched-unattested", reason: "none",
  safeToAppend: false, safeToReplayWithoutWrite: false,
  independentlyAuthenticated: false, sameHistoricalSnapshotVerified: false,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: deniedRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-pinned-reader-review");
  db = getFirestore(app);
  assert.equal(db.projectId, projectId);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  batch.set(db.doc(chunkPath), {
    shardManifestVersion: 1, shards, itemCount: ids.length,
  });
  batch.set(db.doc(legacyPath), { items: ids.map(event) });
  ids.forEach((id, index) => {
    batch.set(db.doc(shardPaths[index]), { items: [event(id)] });
    batch.set(db.doc(eventPath(id)), {
      event: event(id), provenance: {
        sourcePath: legacyPath, subjectUid: subjectFor(id),
      },
    });
    batch.set(db.doc(receiptPath(id)), {
      sourcePath: legacyPath, destinationPath: eventPath(id),
      subjectUid: subjectFor(id),
    });
  });
  await batch.commit();
});
after(async () => {
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

test("default disabled and wrong emulator configuration expose no reader", async () => {
  assert.equal(await create({ enabled: false }), null);
  assert.equal(await create({ emulatorHost: "localhost:8080" }), null);
  assert.equal(await create({ firestore: { ...db, projectId: "production" } }), null);
});
test("all documents read in one pinned Admin transaction without writes", async () => {
  const beforeState = await readVersions();
  const reader = await create();
  assert.equal(typeof reader, "function");
  assert.deepEqual(await reader(), consistent);
  assert.deepEqual(await readVersions(), beforeState);
});
test("manifest metadata-only drift fails even when events are unchanged", async () => {
  const reader = await create();
  await db.doc(chunkPath).update({ reviewMarker: "changed" });
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
});
test("chunk shard drift fails complete-document version preconditions", async () => {
  const reader = await create();
  await db.doc(shardPaths[0]).update({ reviewMarker: "changed" });
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
});
test("legacy actor source drift fails complete-document version preconditions", async () => {
  const reader = await create();
  await db.doc(legacyPath).update({ reviewMarker: "changed" });
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
});
test("subject event drift fails complete-document version preconditions", async () => {
  const reader = await create();
  await db.doc(eventPath(ids[0])).update({ reviewMarker: "changed" });
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
});
test("receipt drift fails complete-document version preconditions", async () => {
  const reader = await create();
  await db.doc(receiptPath(ids[1])).update({ reviewMarker: "changed" });
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
});
test("missing receipt quarantines without automatic repair", async () => {
  const reader = await create();
  await db.doc(receiptPath(ids[1])).delete();
  assert.deepEqual(await reader(), quarantined("missing-or-stale-document"));
  assert.equal((await db.doc(receiptPath(ids[1])).get()).exists, false);
});
test("missing and extra expected version paths reject the factory", async () => {
  const missing = await inventory();
  delete missing.expectedVersions[shardPaths[1]];
  assert.equal(await create({ expected: missing }), null);
  const extra = await inventory();
  extra.expectedVersions["unreviewed/private"] = "1:0";
  assert.equal(await create({ expected: extra }), null);
});
test("invalid shard names and duplicate IDs reject the factory", async () => {
  const invalid = await inventory();
  invalid.shardNames[0] = "../../untrusted";
  assert.equal(await create({ expected: invalid }), null);
  const duplicate = await inventory();
  duplicate.eventSubjects[1].eventId = duplicate.eventSubjects[0].eventId;
  assert.equal(await create({ expected: duplicate }), null);
});
test("revoked reviewer authorization inside transaction quarantines", async () => {
  let checks = 0;
  const reader = await create({
    authorizeReviewer: async () => ++checks === 1,
  });
  assert.deepEqual(await reader(), quarantined("unauthorized"));
  assert.equal(checks, 2);
});
test("unauthorized reviewer never initiates a transaction", async () => {
  let reads = 0;
  const firestore = {
    projectId,
    doc: (path) => db.doc(path),
    runTransaction: async (...args) => {
      reads++;
      return db.runTransaction(...args);
    },
  };
  const reader = await create({
    firestore, authorizeReviewer: async () => false,
  });
  assert.deepEqual(await reader(), quarantined("unauthorized"));
  assert.equal(reads, 0);
});
test("fresh versions cannot conceal an extra unreviewed historical event", async () => {
  await db.doc(legacyPath).update({
    items: [...ids.map(event), event("unreviewed")],
  });
  const reader = await create();
  assert.deepEqual(await reader(), quarantined("inventory-conflict"));
});
test("browser-authenticated users cannot read private audit review records", async () => {
  for (const uid of ["actor", "reviewer", "subjectA", "manager", "marketing"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [eventPath(ids[0]), receiptPath(ids[1])])
      await assertFails(getDoc(doc(client, path)));
  }
});
test("quarantine results never leak private data or reviewer identifiers", async () => {
  const reader = await create();
  await db.doc(shardPaths[1]).update({
    items: [{ ...event(ids[1]), after: "PRIVATE changed" }],
  });
  const serialized = JSON.stringify(await reader());
  for (const secret of ["PRIVATE", "actor", "reviewer", "subjectA",
    "audit-1", "audit-2", "userDomains", "hrAuditReview"])
    assert.equal(serialized.includes(secret), false);
});
