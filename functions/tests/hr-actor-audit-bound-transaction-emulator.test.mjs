/**
 * REVIEW ONLY: real Firebase Admin Auth/Firestore emulator composition of
 * reviewer identity with subject-audit immutable writes. No callable endpoint,
 * migration, production rule or actual employee information.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { executeHrAuditReviewerGateReview } from
  "../../lib/hr-audit-reviewer-session-review.ts";
import { authorizedHrAuditReceiptTransactionReview } from
  "../../lib/hr-audit-receipt-authority-review.ts";
import { fingerprintHrAuditEvent } from
  "../../lib/hr-actor-audit-reconciliation-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
const host = "127.0.0.1:8080";
const authHost = "127.0.0.1:9099";
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, host);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost);
const reviewerUid = "auditBoundReviewer";
const actorUid = "auditBoundActor";
const subjectUid = "auditBoundSubject";
const managerUid = "auditBoundManager";
const sourcePath = "userDomains/" + actorUid + "/hcm/audit";
const targetPath = "hrAuditReview/" + subjectUid + "/events/boundEvent1";
const receiptPath = "hrAuditReviewReceipts/boundEvent1";
const decisionPath = "hrAuditSubjectDecisionReview/boundEvent1";
const accessPath = "userAccess/" + reviewerUid;
const authorityPath = "hrAuditReviewerAuthorityReview/" + reviewerUid;
const sessionPath = "hrAuditReviewerSessionReview/" + reviewerUid;
const at = "2026-11-05T08:15:00.000Z";
const password = "Synthetic-Only-Bound-Receipt-77";
const event = () => ({
  id: "boundEvent1", at, actorId: actorUid,
  action: "Synthetic HR event", entityType: "EmploymentRecord",
  entityId: "synthetic-only", before: "PRIVATE synthetic before",
  after: "PRIVATE synthetic after",
});
const reviewed = () => ({
  verified: true, classification: "single-subject", sourcePath,
  eventId: "boundEvent1", eventDigest: fingerprintHrAuditEvent(event()),
  subjectUid, reviewerUid, evidenceRef: "review:bound-synthetic",
  reviewedAt: "2026-11-05T08:20:00.000Z",
});
const request = () => ({
  reviewerUid, actorUid, subjectUid, eventId: "boundEvent1",
  sourcePath, eventDigest: fingerprintHrAuditEvent(event()),
  evidenceRef: "review:bound-synthetic", expectedSessionEpoch: 7,
  approvedAuthorityRevision: "review-v1",
});
const rules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.equal(rules.split(marker).length, 2, "Review-only rule insertion must be exact");
const candidateRules = rules.replace(marker, [
  "    // In-memory emulator-only deny rules. NEVER DEPLOY.",
  ...[
    "hrAuditReviewerAuthorityReview/{uid}",
    "hrAuditReviewerSessionReview/{uid}",
    "hrAuditSubjectDecisionReview/{eventId}",
    "hrAuditReview/{subjectUid}/events/{eventId}",
    "hrAuditReviewReceipts/{eventId}",
  ].flatMap((path) => [
    "    match /" + path + " {",
    "      allow get, list, create, update, delete: if false;",
    "    }",
  ]),
  marker,
].join("\n"));
let app;
let db;
let auth;
let env;
let token;
let managerToken;
let writeAttempts = 0;
let verifiedTokens = 0;

before(async () => {
  env = await initializeTestEnvironment({
    projectId, firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-audit-bound-transaction");
  db = getFirestore(app);
  auth = getAuth(app);
  for (const uid of [reviewerUid, managerUid]) {
    const email = uid + "@synthetic.invalid";
    await auth.createUser({ uid, email, password });
    const response = await fetch(
      "http://" + authHost +
      "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-key",
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }) },
    );
    assert.equal(response.ok, true, "Synthetic Auth emulator sign-in");
    const result = await response.json();
    if (uid === reviewerUid) token = result.idToken;
    else managerToken = result.idToken;
  }
});
beforeEach(async () => {
  await env.clearFirestore();
  await auth.updateUser(reviewerUid, { disabled: false });
  writeAttempts = 0;
  verifiedTokens = 0;
  const batch = db.batch();
  batch.set(db.doc(sourcePath), { items: [event()] });
  batch.set(db.doc(accessPath), {
    uid: reviewerUid, role: "Administrator", accountState: "Active",
  });
  batch.set(db.doc(authorityPath), {
    uid: reviewerUid, role: "Administrator", active: true,
    scope: "actor-audit", revision: "review-v1",
  });
  batch.set(db.doc(sessionPath), { uid: reviewerUid, active: true, epoch: 7 });
  batch.set(db.doc(decisionPath), reviewed());
  await batch.commit();
});
after(async () => {
  if (auth) for (const uid of [reviewerUid, managerUid]) await auth.deleteUser(uid);
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

const version = (snap) => snap.updateTime.seconds + ":" + snap.updateTime.nanoseconds;
async function verify(rawToken, checkRevoked) {
  assert.equal(checkRevoked, true);
  verifiedTokens++;
  return auth.verifyIdToken(rawToken, true);
}
function gateDependencies() {
  return {
    projectId, emulatorHost: host,
    firestore: {
      projectId: db.projectId,
      doc: (path) => db.doc(path),
      runTransaction: (callback, options) => db.runTransaction(callback, options),
    },
    verifyIdToken: verify,
  };
}

/**
 * TEST-ONLY privileged harness. The existing reviewer gate is a preflight,
 * NEVER an approval to write. Every authority and evidence record is re-read
 * INSIDE the same Firestore transaction as the immutable audit pair.
 * afterReads is a synthetic race hook, not a production API.
 */
async function appendBoundReceipt({
  rawToken = token, beforeTransaction, afterReads,
  requested = request(),
} = {}) {
  const gate = await executeHrAuditReviewerGateReview(
    { reviewerUid: requested.reviewerUid, actorUid: requested.actorUid,
      expectedSessionEpoch: requested.expectedSessionEpoch },
    rawToken, gateDependencies(), true,
  );
  if (!gate.ok) throw new Error("reviewer-gate-denied");
  await beforeTransaction?.();
  // Auth verification is external to Firestore atomicity. This check prevents
  // proceeding with a disabled/revoked token before starting the write.
  const claims = await verify(rawToken, true);
  if (claims.uid !== requested.reviewerUid) throw new Error("forged-reviewer");
  const sourceBaseline = await db.doc(sourcePath).get();
  assert.equal(sourceBaseline.exists, true);
  const expectedSourceVersion = version(sourceBaseline);
  return db.runTransaction(async (tx) => {
    writeAttempts++;
    const refs = [accessPath, authorityPath, sessionPath, decisionPath,
      sourcePath, targetPath, receiptPath].map((path) => db.doc(path));
    const [access, authority, session, decision, source, target, receipt] =
      await Promise.all(refs.map((ref) => tx.get(ref)));
    if (!authorizedHrAuditReceiptTransactionReview({
      request: requested,
      access: access.data(), reviewerAuthority: authority.data(),
      reviewerSession: session.data(), subjectDecision: decision.data(),
    })) throw new Error("transaction-authority-denied");
    if (!source.exists || version(source) !== expectedSourceVersion ||
        !Array.isArray(source.data()?.items) ||
        source.data().items.length !== 1 ||
        fingerprintHrAuditEvent(source.data().items[0]) !== requested.eventDigest ||
        source.data().items[0].actorId !== requested.actorUid ||
        source.data().items[0].id !== requested.eventId) {
      throw new Error("source-changed");
    }
    if (target.exists || receipt.exists) throw new Error("immutable-conflict");
    await afterReads?.();
    const metadata = {
      sourcePath, destinationPath: targetPath,
      sourceVersion: expectedSourceVersion, eventDigest: requested.eventDigest,
      subjectUid, reviewerUid,
    };
    tx.create(refs[5], {
      event: source.data().items[0],
      provenance: { sourcePath, sourceVersion: expectedSourceVersion,
        eventDigest: requested.eventDigest, subjectUid, reviewerUid,
        reviewedAt: decision.data().reviewedAt,
        evidenceRef: decision.data().evidenceRef },
    });
    tx.create(refs[6], metadata);
    return "created";
  }, { maxAttempts: 5 });
}
async function assertNoWrites() {
  const [target, receipt] = await Promise.all([
    db.doc(targetPath).get(), db.doc(receiptPath).get(),
  ]);
  assert.equal(target.exists, false, "No partial subject event");
  assert.equal(receipt.exists, false, "No partial receipt");
}

test("trusted reviewer creates exactly one subject event and metadata-only receipt", async () => {
  const beforeSource = (await db.doc(sourcePath).get()).data();
  assert.equal(await appendBoundReceipt(), "created");
  const [source, target, receipt] = await Promise.all([
    db.doc(sourcePath).get(), db.doc(targetPath).get(), db.doc(receiptPath).get(),
  ]);
  assert.deepEqual(source.data(), beforeSource, "Legacy actor history preserved");
  assert.deepEqual(target.data().event, event());
  assert.equal(target.data().provenance.reviewerUid, reviewerUid);
  assert.equal(receipt.data().eventDigest, fingerprintHrAuditEvent(event()));
  assert.ok(!JSON.stringify(receipt.data()).includes("PRIVATE"));
  assert.equal(writeAttempts, 1);
  assert.ok(verifiedTokens >= 3, "Revocation checked before the write");
});

test("all browser roles including Administrator cannot read or forge protected records", async () => {
  for (const uid of [reviewerUid, managerUid, subjectUid]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [authorityPath, sessionPath, decisionPath,
      targetPath, receiptPath]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: uid }));
    }
  }
  await assertNoWrites();
});

test("forged token cannot reach the write transaction", async () => {
  await assert.rejects(() => appendBoundReceipt({ rawToken: managerToken }),
    /reviewer-gate-denied/);
  assert.equal(writeAttempts, 0);
  await assertNoWrites();
});

test("revoked session between preflight and write transaction denies without writes", async () => {
  await assert.rejects(() => appendBoundReceipt({
    beforeTransaction: () => db.doc(sessionPath).update({ active: false, epoch: 8 }),
  }), /transaction-authority-denied/);
  assert.ok(writeAttempts >= 1);
  await assertNoWrites();
});

test("mid-transaction session revocation conflicts and retries fail closed", async () => {
  let raced = false;
  await assert.rejects(() => appendBoundReceipt({
    afterReads: async () => {
      if (!raced) {
        raced = true;
        await db.doc(sessionPath).update({ active: false, epoch: 8 });
      }
    },
  }), /transaction-authority-denied|ABORTED|aborted|conflict/i);
  assert.equal(raced, true);
  await assertNoWrites();
});

test("reviewer role and evidence revocation fail within transaction", async () => {
  await assert.rejects(() => appendBoundReceipt({
    beforeTransaction: () => db.doc(authorityPath).update({ active: false,
      revision: "revoked-v2" }),
  }), /transaction-authority-denied/);
  await assertNoWrites();
  await db.doc(authorityPath).update({ active: true, revision: "review-v1" });
  await assert.rejects(() => appendBoundReceipt({
    beforeTransaction: () => db.doc(decisionPath).update({ verified: false }),
  }), /transaction-authority-denied/);
  await assertNoWrites();
});

test("wrong subject decision and changed event digest fail closed", async () => {
  await db.doc(decisionPath).update({ subjectUid: "anotherSyntheticSubject" });
  await assert.rejects(() => appendBoundReceipt(), /transaction-authority-denied/);
  await assertNoWrites();
  await db.doc(decisionPath).update({ subjectUid });
  await db.doc(sourcePath).update({ items: [{ ...event(), after: "changed" }] });
  await assert.rejects(() => appendBoundReceipt(), /source-changed/);
  await assertNoWrites();
});

test("duplicate immutable event is rejected without modifying existing receipt", async () => {
  assert.equal(await appendBoundReceipt(), "created");
  const original = await db.doc(receiptPath).get();
  await assert.rejects(() => appendBoundReceipt(), /immutable-conflict/);
  const current = await db.doc(receiptPath).get();
  assert.equal(version(current), version(original));
});
