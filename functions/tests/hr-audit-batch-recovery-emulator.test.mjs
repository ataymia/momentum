/**
 * REVIEW ONLY: actual Firebase Admin Firestore emulator read-only scan of
 * a synthetic, multi-event HR audit inventory. No migration executor.
 * Neither the candidate rules nor this harness are deployed.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { fingerprintHrAuditEvent } from
  "../../lib/hr-actor-audit-reconciliation-review.ts";
import { assessHrAuditBatchRecoveryReview } from
  "../../lib/hr-audit-batch-recovery-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "",
  /^(?:127\\.0\\.0\\.1|localhost):8080$/, "Local Firestore emulator required");
assert.equal(process.env.GCLOUD_PROJECT, projectId,
  "Dedicated synthetic project required before Admin SDK initialization");

const actorUid = "actor";
const reviewerUid = "reviewer";
const sourcePath = "userDomains/actor/hcm/audit";
const reviewedAt = "2026-11-05T11:00:00.000Z";
const evidenceRef = "review:synthetic-batch";
const items = () => ["audit-1", "audit-2"].map((id) => ({
  id, at: "2026-11-05T10:00:00.000Z", actorId: actorUid,
  action: "Synthetic HR audit", entityType: "EmploymentRecord",
  entityId: "synthetic", before: "PRIVATE synthetic before",
  after: "PRIVATE synthetic after", reason: "PRIVATE synthetic reason",
}));
const subjectFor = (id) => id === "audit-1" ? "subjectA" : "subjectB";
const eventPath = (id) =>
  `hrAuditReview/${subjectFor(id)}/events/${id}`;
const receiptPath = (id) => `hrAuditReviewReceipts/${id}`;
const sourceRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.equal(sourceRules.split(marker).length, 2,
  "Candidate rules insertion marker changed");
const candidateRules = sourceRules.replace(marker, [
  "    // Emulator-only HR audit paths; never deploy injected rules.",
  "    match /hrAuditReview/{subjectUid}/events/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  "    match /hrAuditReviewReceipts/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  marker,
].join("\\n"));

let app;
let db;
let env;
const version = (snap) => snap.exists
  ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : null;
const snapshot = (snap) => ({
  exists: snap.exists, version: version(snap),
  data: snap.exists ? snap.data() : null,
});
const quarantined = (reason) => ({
  status: "quarantined", reason,
  safeToAppend: false, safeToReplayWithoutWrite: false,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-audit-batch-firestore-review");
  db = getFirestore(app);
  assert.equal(db.projectId, projectId);
});
beforeEach(async () => {
  await env.clearFirestore();
  const originals = items();
  await db.doc(sourcePath).set({ items: originals });
  const source = await db.doc(sourcePath).get();
  const sourceVersion = version(source);
  const batch = db.batch();
  for (const original of originals) {
    const subjectUid = subjectFor(original.id);
    const eventDigest = fingerprintHrAuditEvent(original);
    batch.set(db.doc(eventPath(original.id)), {
      event: original,
      provenance: {
        sourcePath, sourceVersion, eventDigest, subjectUid,
        reviewerUid, reviewedAt, evidenceRef,
      },
    });
    batch.set(db.doc(receiptPath(original.id)), {
      sourcePath, destinationPath: eventPath(original.id),
      sourceVersion, eventDigest, subjectUid, reviewerUid,
    });
  }
  for (const [uid, role] of [
    ["actor", "Administrator"], ["reviewer", "Administrator"],
    ["subjectA", "Sales Representative"], ["subjectB", "Sales Representative"],
    ["manager", "Sales Manager"], ["marketing", "Marketing"],
    ["customer", "Customer"],
  ]) {
    batch.set(db.doc("userAccess/" + uid), {
      uid, role, accountState: "Active", managerId: null,
    });
  }
  await batch.commit();
});
after(async () => {
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

/**
 * Test-only trusted read path: all documents are read in one Firestore
 * transaction. The original source's complete synthetic ID list is compared
 * with the declared inventory, so a sampled subset cannot pass as complete.
 * This does NOT authenticate human inventory evidence or support HCM chunks.
 */
async function inspectBatch({
  expectedIds = ["audit-1", "audit-2"],
  loadedIds = expectedIds,
} = {}) {
  return db.runTransaction(async (tx) => {
    const source = await tx.get(db.doc(sourcePath));
    if (!source.exists || !Array.isArray(source.data()?.items)) {
      return quarantined("invalid-inventory");
    }
    const originals = source.data().items;
    const sourceIds = originals.map((item) => item?.id);
    const uniqueSourceIds = new Set(sourceIds);
    if (sourceIds.some((id) =>
      typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
      uniqueSourceIds.size !== sourceIds.length ||
      sourceIds.length !== expectedIds.length ||
      expectedIds.some((id) => !uniqueSourceIds.has(id))) {
      return quarantined("invalid-inventory");
    }
    const docs = await Promise.all(loadedIds.flatMap((id) => [
      tx.get(db.doc(eventPath(id))), tx.get(db.doc(receiptPath(id))),
    ]));
    const pairs = loadedIds.map((id, index) => {
      const original = originals.find((item) => item.id === id);
      return {
        expected: {
          actorUid, subjectUid: subjectFor(id), reviewerUid,
          eventId: id, sourcePath, sourceVersion: version(source),
          eventDigest: original ? fingerprintHrAuditEvent(original) : "",
          reviewedAt, evidenceRef,
        },
        subjectEvent: snapshot(docs[index * 2]),
        metadataReceipt: snapshot(docs[index * 2 + 1]),
      };
    });
    return assessHrAuditBatchRecoveryReview({
      inventory: {
        actorUid, sourcePath, sourceVersion: version(source),
        inventoryVersion: "synthetic-emulator-inventory-v1",
        reviewerUid, reviewedAt, evidenceRef,
        independentlyVerified: true, // Synthetic fixture, NOT real evidence.
        expectedEventIds: expectedIds, expectedCount: expectedIds.length,
      },
      pairs,
    });
  }, { readOnly: true, maxAttempts: 1 });
}

async function auditVersions() {
  const paths = [
    sourcePath, ...items().flatMap((item) =>
      [eventPath(item.id), receiptPath(item.id)]),
  ];
  const snapshots = await Promise.all(paths.map((path) => db.doc(path).get()));
  return snapshots.map((snap) => ({
    path: snap.ref.path, version: version(snap),
    data: snap.exists ? snap.data() : null,
  }));
}

test("complete two-event Admin Firestore snapshot is consistent but never writable", async () => {
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), {
    status: "consistent-read-only", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: true,
  });
  assert.deepEqual(await auditVersions(), beforeState);
});

test("missing second receipt quarantines entire batch and preserves first pair", async () => {
  await db.doc(receiptPath("audit-2")).delete(); // Synthetic fault injection.
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), quarantined("pair-incomplete"));
  assert.deepEqual(await auditVersions(), beforeState);
  assert.equal((await db.doc(eventPath("audit-1")).get()).exists, true);
  assert.equal((await db.doc(receiptPath("audit-2")).get()).exists, false);
});

test("missing first event quarantines batch without repairing or overwriting receipt", async () => {
  await db.doc(eventPath("audit-1")).delete(); // Synthetic fault injection.
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), quarantined("pair-incomplete"));
  assert.deepEqual(await auditVersions(), beforeState);
});

test("partial loaded page is not mistaken for a complete inventory", async () => {
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch({ loadedIds: ["audit-1"] }),
    quarantined("incomplete-inventory"));
  assert.deepEqual(await auditVersions(), beforeState);
});

test("source gains an unreviewed third event: stale declared inventory fails closed", async () => {
  await db.doc(sourcePath).update({
    items: [...items(), { ...items()[0], id: "audit-3" }],
  });
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), quarantined("invalid-inventory"));
  assert.deepEqual(await auditVersions(), beforeState);
});

test("source changes after receipt creation: both pairs fail version preconditions", async () => {
  await db.doc(sourcePath).update({
    items: items().map((item, i) => i ? item : { ...item, after: "PRIVATE changed" }),
  });
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), quarantined("pair-conflict"));
  assert.deepEqual(await auditVersions(), beforeState);
});

test("tampered second receipt quarantines all without rewriting either pair", async () => {
  await db.doc(receiptPath("audit-2")).update({ eventDigest: "f".repeat(64) });
  const beforeState = await auditVersions();
  assert.deepEqual(await inspectBatch(), quarantined("pair-conflict"));
  assert.deepEqual(await auditVersions(), beforeState);
});

test("browser roles including Administrator cannot inspect or mutate either audit path", async () => {
  for (const uid of ["actor", "reviewer", "subjectA", "subjectB",
    "manager", "marketing", "customer"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [eventPath("audit-1"), receiptPath("audit-2")]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: uid }));
      await assertFails(updateDoc(doc(client, path), { forged: uid }));
      await assertFails(deleteDoc(doc(client, path)));
    }
  }
  assert.deepEqual(await inspectBatch(), {
    status: "consistent-read-only", reason: "none",
    safeToAppend: false, safeToReplayWithoutWrite: true,
  });
});

test("classification never includes confidential values, subjects or evidence", async () => {
  await db.doc(receiptPath("audit-1")).delete();
  const serialized = JSON.stringify(await inspectBatch());
  for (const secret of [
    "PRIVATE", "actor", "reviewer", "subjectA", "subjectB",
    "audit-1", "audit-2", evidenceRef,
  ]) assert.equal(serialized.includes(secret), false);
});
