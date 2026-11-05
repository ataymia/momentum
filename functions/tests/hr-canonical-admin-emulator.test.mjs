/**
 * REVIEW ONLY: real Firebase Admin Firestore SDK against a dedicated local
 * emulator project. Synthetic records only. No endpoint, live credentials,
 * token-signature verification, production schema or deployment.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { createHrCanonicalServerTransportReview } from
  "../../lib/hr-canonical-server-transport-review.ts";
import { executeHrCanonicalTrustedIdentityReview } from
  "../../lib/hr-canonical-trusted-identity-review.ts";
import { hrCanonicalReviewPath } from "../../lib/hr-canonical-storage-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
const host = process.env.FIRESTORE_EMULATOR_HOST;
const now = Date.parse("2026-11-04T22:00:00Z") / 1000;
const token = "synthetic.header.signature";
const path = (uid, field) => hrCanonicalReviewPath(uid, field);
const authority = (uid) => "hrCanonicalReadAuthorityReview/" + uid;
const session = (uid) => "hrCanonicalReadSessionReview/" + uid;
const command = (field = "leaveRequests") =>
  ({ ownerUid: "rep", field, expectedSessionEpoch: 7 });

// Fail BEFORE initializing Firebase Admin if run outside the dedicated emulator.
// The CLI project must match; never let the SDK infer a production project.
assert.match(host ?? "", /^(?:127\.0\.0\.1|localhost):8080$/);
assert.equal(process.env.GCLOUD_PROJECT, projectId,
  "Dedicated Firebase CLI emulator project is required");
const rules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(rules.includes(marker), "Review rules insertion point must exist");
const candidateRules = rules.replace(marker, [
  "    // Emulator-only: deny all browser access to canonical HR review storage.",
  "    match /hrCanonicalReview/{uid}/fields/{field} { allow read, write: if false; }",
  "    match /hrCanonicalReadAuthorityReview/{uid} { allow read, write: if false; }",
  "    match /hrCanonicalReadSessionReview/{uid} { allow read, write: if false; }",
  marker,
].join("\n"));

let app;
let db;
let env;
let transactionCount = 0;
const roles = {
  rep: "Sales Representative",
  manager: "Sales Manager",
  admin: "Administrator",
  marketing: "Marketing",
  customer: "Customer",
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-admin-sdk-review-only");
  assert.equal(app.options.projectId, projectId);
  db = getFirestore(app);
  assert.equal(db.projectId, projectId, "Admin SDK must bind to synthetic project");
});

beforeEach(async () => {
  await env.clearFirestore();
  transactionCount = 0;
  const batch = db.batch();
  for (const [uid, role] of Object.entries(roles)) {
    const managerId = uid === "rep" ? "manager" : null;
    batch.set(db.doc("userAccess/" + uid), {
      uid, role, managerId, accountState: "Active",
      updatedAt: "synthetic-v1", updatedBy: "synthetic",
    });
    batch.set(db.doc(authority(uid)), {
      id: uid, role, managerId, name: "Synthetic " + uid,
      employmentStatus: "Active",
    });
    batch.set(db.doc(session(uid)), { uid, epoch: 7, active: true });
  }
  batch.set(db.doc(path("rep", "leaveRequests")), {
    version: "v1", items: [{
      id: "leave-synthetic", userId: "rep", status: "Submitted",
      requestedHours: 4, reason: "SECRET-SYNTHETIC-LEAVE",
    }],
  });
  batch.set(db.doc(path("rep", "compensation")), {
    version: "v1", items: [{
      id: "pay-synthetic", userId: "rep", basis: "Synthetic",
      rate: 0, privateNotes: "SECRET-SYNTHETIC-PAY",
    }],
  });
  await batch.commit();
});

after(async () => {
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

function factory(c = command(), onTransactionDone) {
  // These are the REAL SDK's document references and read-only transactions.
  const firestore = {
    projectId: db.projectId,
    doc: (p) => db.doc(p),
    runTransaction: async (callback, options) => {
      assert.deepEqual(options, { readOnly: true });
      transactionCount += 1;
      const result = await db.runTransaction(callback, options);
      await onTransactionDone?.();
      return result;
    },
  };
  return createHrCanonicalServerTransportReview({
    projectId, emulatorHost: host, firestore, command: c,
  }, true);
}

async function run(uid, c = command(), onTransactionDone) {
  const createPinnedTransport = factory(c, onTransactionDone);
  assert.ok(createPinnedTransport);
  let verified = 0;
  const result = await executeHrCanonicalTrustedIdentityReview(c, token, {
    projectId,
    nowSeconds: () => now,
    verifyIdToken: async (_token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      verified += 1;
      return {
        uid, sub: uid, aud: projectId,
        iss: "https://securetoken.google.com/" + projectId,
        iat: now - 300, auth_time: now - 400, exp: now + 1800,
      };
    },
    createPinnedTransport,
  }, true);
  return { result, verified };
}

test("real Admin SDK read-only transactions scope employee, manager and Admin", async () => {
  for (const uid of ["rep", "manager", "admin"]) {
    const { result, verified } = await run(uid);
    assert.equal(result.ok, true, uid + ": " + JSON.stringify(result));
    assert.equal(verified, 2);
    assert.equal(result.records[0].status, "Submitted");
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  }
  const pay = await run("admin", command("compensation"));
  assert.equal(pay.result.ok, true);
  assert.ok(!JSON.stringify(pay.result).includes("SECRET-SYNTHETIC-PAY"));
  assert.equal(transactionCount, 4);
});

test("real Admin SDK denies unrelated roles and confidential manager fields", async () => {
  for (const [uid, field] of [
    ["marketing", "leaveRequests"], ["customer", "leaveRequests"],
    ["manager", "compensation"], ["rep", "compensation"],
  ]) {
    const { result } = await run(uid, command(field));
    assert.equal(result.ok, false, uid + ":" + field);
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  }
});

test("emulator browser identities cannot read canonical, authority or session", async () => {
  for (const uid of ["rep", "admin", "marketing", "customer"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const target of [path("rep", "leaveRequests"), authority("rep"), session("rep")]) {
      await assertFails(getDoc(doc(client, target)));
    }
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),
    path("rep", "compensation"))));
});

test("actual Admin transaction followed by session revocation denies stale result", async () => {
  const { result, verified } = await run("rep", command(), async () => {
    await db.doc(session("rep")).update({ active: false, epoch: 8 });
  });
  assert.deepEqual(result, { ok: false, reason: "authority-changed" });
  assert.equal(verified, 1, "No second token check after denied snapshot");
  assert.equal(transactionCount, 1);
});

test("actual Admin transaction followed by manager reassignment denies stale result", async () => {
  const { result } = await run("manager", command(), async () => {
    const batch = db.batch();
    batch.update(db.doc("userAccess/rep"), { managerId: "admin", updatedAt: "v2" });
    batch.update(db.doc(authority("rep")), { managerId: "admin" });
    await batch.commit();
  });
  assert.deepEqual(result, { ok: false, reason: "authority-changed" });
  assert.equal(transactionCount, 1);
});

test("default-off, mismatched project and nonlocal host fail closed before IO", async () => {
  const firestore = {
    projectId: db.projectId,
    doc: () => { throw Error("unexpected database read"); },
    runTransaction: () => { throw Error("unexpected transaction"); },
  };
  const options = { projectId, emulatorHost: host, firestore, command: command() };
  assert.equal(createHrCanonicalServerTransportReview(options), null);
  assert.equal(createHrCanonicalServerTransportReview({
    ...options, projectId: "momentum-hr-other-review",
  }, true), null);
  assert.equal(createHrCanonicalServerTransportReview({
    ...options, emulatorHost: "firestore.googleapis.com:443",
  }, true), null);
  assert.equal(createHrCanonicalServerTransportReview({
    ...options, command: { ...command(), field: "../compensation" },
  }, true), null);
  assert.equal(transactionCount, 0);
});
