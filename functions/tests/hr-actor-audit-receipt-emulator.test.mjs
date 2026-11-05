/**
 * REVIEW ONLY: actual Firebase Admin Firestore transactions and browser-deny
 * checks for a proposed subject-scoped HR audit receipt. Synthetic data only.
 * No migration executor, callable endpoint, deployment or real employee access.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  assessHrActorAuditReconciliation, fingerprintHrAuditEvent,
} from "../../lib/hr-actor-audit-reconciliation-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "",
  /^(?:127\.0\.0\.1|localhost):8080$/, "Local Firestore emulator required");
assert.equal(process.env.GCLOUD_PROJECT, projectId,
  "Dedicated synthetic project required before Admin SDK initialization");
const sourcePath = "userDomains/actor/hcm/audit";
const targetPath = "hrAuditReview/subject/events/audit-1";
const receiptPath = "hrAuditReviewReceipts/audit-1";
const at = "2026-11-04T22:45:00.000Z";
const event = () => ({
  id: "audit-1", at, actorId: "actor", action: "Synthetic correction",
  entityType: "CompensationRecord", entityId: "synthetic-record",
  before: "PRIVATE synthetic old value", after: "PRIVATE synthetic new value",
  reason: "PRIVATE synthetic reason",
});
const decision = () => ({
  sourcePath, eventId: "audit-1", eventDigest: fingerprintHrAuditEvent(event()),
  subjectUid: "subject", reviewerUid: "reviewer",
  reviewedAt: "2026-11-04T23:00:00.000Z",
  evidenceRef: "review:synthetic-1", classification: "single-subject",
});
const sourceRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.equal(sourceRules.split(marker).length, 2,
  "Rule insertion marker drift: never silently weaken a candidate");
const candidateRules = sourceRules.replace(marker, [
  "    // Emulator-only audit candidate; never deploy these injected rules.",
  "    match /hrAuditReview/{subjectUid}/events/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  "    match /hrAuditReviewReceipts/{eventId} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  marker,
].join("\n"));

let app;
let db;
let env;
const version = (snap) => snap.exists
  ? snap.updateTime.seconds + ":" + snap.updateTime.nanoseconds : null;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-audit-receipt-review");
  db = getFirestore(app);
  assert.equal(db.projectId, projectId);
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  batch.set(db.doc(sourcePath), { items: [event()] });
  for (const [uid, role, state] of [
    ["actor", "Administrator", "Active"],
    ["subject", "Sales Representative", "Active"],
    ["reviewer", "Administrator", "Active"],
    ["manager", "Sales Manager", "Active"],
    ["marketing", "Marketing", "Active"],
    ["customer", "Customer", "Active"],
    ["separated", "Sales Representative", "Separated"],
  ]) {
    batch.set(db.doc("userAccess/" + uid), {
      uid, role, accountState: state, managerId: null,
    });
  }
  await batch.commit();
});
after(async () => {
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

async function plan() {
  const [source, target] = await Promise.all([
    db.doc(sourcePath).get(), db.doc(targetPath).get(),
  ]);
  const baseline = [
    { path: sourcePath, version: version(source), data: source.data() },
    { path: targetPath, version: version(target),
      data: target.exists ? target.data() : null },
  ];
  return assessHrActorAuditReconciliation({
    actorUids: ["actor"],
    knownSubjectUids: new Set(["subject"]),
    authorizedReviewerUids: new Set(["reviewer"]),
    baseline, current: structuredClone(baseline), decisions: [decision()],
  });
}

/**
 * TEST HARNESS ONLY. The real executor must independently verify identity,
 * reviewer evidence, full inventory, retention and restoration before use.
 * A transaction reads every precondition before writing either immutable doc.
 */
async function appendSyntheticReceipt(review) {
  if (review.status !== "ready-for-human-review" ||
      review.candidates.length !== 1 ||
      review.candidates[0].destinationPath !== targetPath) {
    throw new Error("blocked-review");
  }
  const expectedSource = review.preconditions.find((p) => p.path === sourcePath);
  const expectedTarget = review.preconditions.find((p) => p.path === targetPath);
  if (!expectedSource?.expectedVersion || expectedTarget?.expectedVersion !== null) {
    throw new Error("missing-preconditions");
  }
  const reviewed = decision();
  return db.runTransaction(async (tx) => {
    const sourceRef = db.doc(sourcePath);
    const targetRef = db.doc(targetPath);
    const receiptRef = db.doc(receiptPath);
    const [source, target, receipt] = await Promise.all([
      tx.get(sourceRef), tx.get(targetRef), tx.get(receiptRef),
    ]);
    if (!source.exists || version(source) !== expectedSource.expectedVersion) {
      throw new Error("stale-source");
    }
    const records = source.data()?.items;
    if (!Array.isArray(records) || records.length !== 1 ||
        records[0]?.actorId !== "actor" ||
        records[0]?.id !== review.candidates[0].eventId ||
        fingerprintHrAuditEvent(records[0]) !== review.candidates[0].eventDigest ||
        reviewed.eventDigest !== review.candidates[0].eventDigest) {
      throw new Error("changed-event");
    }
    const audit = {
      event: records[0],
      provenance: {
        sourcePath, sourceVersion: expectedSource.expectedVersion,
        eventDigest: reviewed.eventDigest, subjectUid: reviewed.subjectUid,
        reviewerUid: reviewed.reviewerUid, reviewedAt: reviewed.reviewedAt,
        evidenceRef: reviewed.evidenceRef,
      },
    };
    const metadata = {
      destinationPath: targetPath, sourcePath,
      sourceVersion: expectedSource.expectedVersion,
      eventDigest: reviewed.eventDigest, subjectUid: reviewed.subjectUid,
      reviewerUid: reviewed.reviewerUid,
    };
    if (target.exists || receipt.exists) {
      if (!target.exists || !receipt.exists ||
          JSON.stringify(target.data()) !== JSON.stringify(audit) ||
          JSON.stringify(receipt.data()) !== JSON.stringify(metadata)) {
        throw new Error("immutable-conflict");
      }
      return "already-present";
    }
    tx.create(targetRef, audit);
    tx.create(receiptRef, metadata);
    return "created";
  }, { maxAttempts: 5 });
}

test("every browser role, including Administrator, cannot forge or inspect either audit path", async () => {
  for (const uid of [
    "actor", "subject", "reviewer", "manager",
    "marketing", "customer", "separated",
  ]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [targetPath, receiptPath]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: uid }));
      await assertFails(updateDoc(doc(client, path), { forged: uid }));
      await assertFails(deleteDoc(doc(client, path)));
    }
  }
  for (const path of [targetPath, receiptPath]) {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
  }
});

test("trusted emulator transaction creates event and metadata receipt atomically", async () => {
  const sourceBefore = (await db.doc(sourcePath).get()).data();
  const review = await plan();
  assert.equal(review.status, "ready-for-human-review");
  assert.equal(await appendSyntheticReceipt(review), "created");
  const [source, target, receipt] = await Promise.all([
    db.doc(sourcePath).get(), db.doc(targetPath).get(), db.doc(receiptPath).get(),
  ]);
  assert.deepEqual(source.data(), sourceBefore, "Original actor shard is preserved");
  assert.deepEqual(target.data()?.event, event());
  assert.equal(target.data()?.provenance.subjectUid, "subject");
  assert.equal(target.data()?.provenance.reviewerUid, "reviewer");
  assert.equal(receipt.data()?.eventDigest, fingerprintHrAuditEvent(event()));
  assert.ok(!JSON.stringify(receipt.data()).includes("PRIVATE"));
  await assertFails(getDoc(doc(env.authenticatedContext("reviewer").firestore(), targetPath)));
});

test("exact replay performs no write and preserves immutable updateTime", async () => {
  const review = await plan();
  assert.equal(await appendSyntheticReceipt(review), "created");
  const [beforeEvent, beforeReceipt] = await Promise.all([
    db.doc(targetPath).get(), db.doc(receiptPath).get(),
  ]);
  assert.equal(await appendSyntheticReceipt(review), "already-present");
  const [afterEvent, afterReceipt] = await Promise.all([
    db.doc(targetPath).get(), db.doc(receiptPath).get(),
  ]);
  assert.equal(version(afterEvent), version(beforeEvent));
  assert.equal(version(afterReceipt), version(beforeReceipt));
});

test("forged preexisting event blocks receipt creation and cannot be overwritten", async () => {
  const review = await plan();
  await db.doc(targetPath).create({ forged: true });
  await assert.rejects(() => appendSyntheticReceipt(review), /immutable-conflict/);
  assert.deepEqual((await db.doc(targetPath).get()).data(), { forged: true });
  assert.equal((await db.doc(receiptPath).get()).exists, false);
});

test("missing metadata receipt blocks replay rather than silently repairing history", async () => {
  const review = await plan();
  assert.equal(await appendSyntheticReceipt(review), "created");
  await db.doc(receiptPath).delete();
  await assert.rejects(() => appendSyntheticReceipt(review), /immutable-conflict/);
  assert.equal((await db.doc(targetPath).get()).exists, true);
  assert.equal((await db.doc(receiptPath).get()).exists, false);
});

test("source edit after human review fails closed with no partial audit write", async () => {
  const review = await plan();
  await db.doc(sourcePath).update({ items: [{ ...event(), after: "changed" }] });
  await assert.rejects(() => appendSyntheticReceipt(review), /stale-source/);
  assert.equal((await db.doc(targetPath).get()).exists, false);
  assert.equal((await db.doc(receiptPath).get()).exists, false);
});

test("concurrent attempts never create two receipts or overwrite a committed event", async () => {
  const review = await plan();
  const outcomes = await Promise.allSettled([
    appendSyntheticReceipt(review), appendSyntheticReceipt(review),
  ]);
  assert.equal(outcomes.filter((x) =>
    x.status === "fulfilled" && x.value === "created").length, 1);
  assert.ok(outcomes.every((x) =>
    x.status === "rejected" ||
    (x.status === "fulfilled" && ["created", "already-present"].includes(x.value))));
  assert.equal((await db.doc(targetPath).get()).data()?.event.id, "audit-1");
  assert.equal((await db.doc(receiptPath).get()).data()?.eventDigest,
    fingerprintHrAuditEvent(event()));
});

test("unresolved subject never starts privileged transaction", async () => {
  const blocked = assessHrActorAuditReconciliation({
    actorUids: ["actor"],
    knownSubjectUids: new Set(["subject"]),
    authorizedReviewerUids: new Set(["reviewer"]),
    baseline: [{ path: sourcePath, version: "v1", data: { items: [event()] } },
      { path: targetPath, version: null, data: null }],
    current: [{ path: sourcePath, version: "v1", data: { items: [event()] } },
      { path: targetPath, version: null, data: null }],
    decisions: [{ ...decision(), classification: "multi-subject" }],
  });
  assert.equal(blocked.status, "blocked");
  await assert.rejects(() => appendSyntheticReceipt(blocked), /blocked-review/);
  assert.equal((await db.doc(targetPath).get()).exists, false);
});
