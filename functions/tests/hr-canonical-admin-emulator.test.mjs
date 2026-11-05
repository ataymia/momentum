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
import { getAuth } from "firebase-admin/auth";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { createHrCanonicalServerTransportReview } from
  "../../lib/hr-canonical-server-transport-review.ts";
import { executeHrCanonicalTrustedIdentityReview } from
  "../../lib/hr-canonical-trusted-identity-review.ts";
import { hrCanonicalReviewPath } from "../../lib/hr-canonical-storage-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
const host = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const syntheticPassword = "synthetic-emulator-only-password";
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
assert.match(authHost ?? "", /^(?:127\.0\.0\.1|localhost):9099$/,
  "Dedicated local Auth emulator is required before Admin SDK initialization");
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
let auth;
let env;
const realTokens = new Map();
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
  auth = getAuth(app);
  assert.equal(auth.app.options.projectId, projectId);
  // Create synthetic users and sign in through the REAL local Auth emulator.
  // These tokens are emulator-issued/unsigned and MUST NEVER be used as
  // production signature-verification evidence.
  for (const uid of Object.keys(roles)) {
    const email = uid + "@synthetic.invalid";
    await auth.createUser({ uid, email, password: syntheticPassword });
    const response = await fetch(
      "http://" + authHost +
      "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-key",
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: syntheticPassword, returnSecureToken: true }) },
    );
    assert.equal(response.ok, true, "Auth emulator sign-in failed for " + uid);
    const payload = await response.json();
    assert.equal(typeof payload.idToken, "string");
    realTokens.set(uid, payload.idToken);
  }
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


async function runWithRealAuth(uid, c = command(), onTransactionDone, enabled = true) {
  let verified = 0;
  const initialTransactions = transactionCount;
  const result = await executeHrCanonicalTrustedIdentityReview(
    c, realTokens.get(uid), {
      projectId,
      verifyIdToken: async (idToken, checkRevoked) => {
        assert.equal(checkRevoked, true);
        verified += 1;
        return auth.verifyIdToken(idToken, true);
      },
      createPinnedTransport: factory(c, onTransactionDone),
    }, enabled,
  );
  return { result, verified, transactions: transactionCount - initialTransactions };
}

test("actual Auth emulator tokens bind to scoped Admin Firestore reads", async () => {
  for (const uid of ["rep", "manager", "admin"]) {
    const { result, verified, transactions } = await runWithRealAuth(uid);
    assert.equal(result.ok, true, uid + ": " + JSON.stringify(result));
    assert.equal(verified, 2, "Admin Auth revocation must be checked twice");
    assert.equal(transactions, 1);
    assert.equal(result.records[0].status, "Submitted");
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  }
});

test("actual Auth identity cannot elevate Marketing, customer or manager compensation", async () => {
  for (const [uid, field] of [
    ["marketing", "leaveRequests"], ["customer", "leaveRequests"],
    ["manager", "compensation"], ["rep", "compensation"],
  ]) {
    const { result, verified } = await runWithRealAuth(uid, command(field));
    assert.equal(result.ok, false, uid + ": " + field);
    assert.equal(verified, 1, "Denied access must not need a second token check");
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  }
});

test("disabled Auth emulator account is rejected before confidential Firestore read", async () => {
  await auth.updateUser("rep", { disabled: true });
  try {
    const { result, verified, transactions } = await runWithRealAuth("rep");
    assert.equal(result.ok, false);
    assert.ok(["session-revoked", "unavailable"].includes(result.reason));
    assert.equal(verified, 1);
    assert.equal(transactions, 0);
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  } finally {
    await auth.updateUser("rep", { disabled: false });
  }
});

test("real Admin Auth recheck blocks account disabled after Firestore transaction", async () => {
  try {
    const { result, verified, transactions } = await runWithRealAuth(
      "rep", command(), () => auth.updateUser("rep", { disabled: true }),
    );
    assert.equal(result.ok, false);
    assert.ok(["session-revoked", "unavailable"].includes(result.reason));
    assert.equal(verified, 2, "Post-transaction Auth recheck must run");
    assert.equal(transactions, 1);
    assert.ok(!JSON.stringify(result).includes("SECRET-SYNTHETIC"));
  } finally {
    await auth.updateUser("rep", { disabled: false });
  }
});

test("real Admin Auth invalid token and default-off path perform no HR transaction", async () => {
  let verifierCalls = 0;
  const c = command();
  const deps = {
    projectId,
    verifyIdToken: async (idToken, checkRevoked) => {
      verifierCalls += 1;
      return auth.verifyIdToken(idToken, checkRevoked);
    },
    createPinnedTransport: factory(c),
  };
  const beforeTransactions = transactionCount;
  assert.deepEqual(
    await executeHrCanonicalTrustedIdentityReview(c, realTokens.get("rep"), deps),
    { ok: false, reason: "disabled" },
  );
  assert.equal(verifierCalls, 0);
  const malformed = await executeHrCanonicalTrustedIdentityReview(
    c, "forged.header.signature", deps, true,
  );
  assert.equal(malformed.ok, false);
  assert.ok(["session-revoked", "unavailable"].includes(malformed.reason));
  assert.equal(transactionCount, beforeTransactions);
});
