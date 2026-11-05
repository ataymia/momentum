/**
 * REVIEW ONLY: real Admin Auth + Firestore emulator tests for a default-off
 * read-only HR actor-audit reviewer identity/session gate. Synthetic users.
 * No audit migration, callable endpoint, production rule or external data.
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

const projectId = "momentum-hr-admin-sdk-review";
const host = "127.0.0.1:8080";
const authHost = "127.0.0.1:9099";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, host,
  "Only isolated local Firestore emulator is permitted");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost,
  "Only isolated local Auth emulator is permitted");
assert.equal(process.env.GCLOUD_PROJECT, projectId,
  "Only isolated synthetic project is permitted");
const roles = {
  reviewer: "Administrator", actor: "Administrator",
  manager: "Sales Manager", marketing: "Marketing",
};
const password = "Synthetic-Review-Only-Password-Not-Real-77";
const rules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.equal(rules.split(marker).length, 2, "Review rule marker drift");
const candidateRules = rules.replace(marker, [
  "    // In-memory emulator-only rules. Never deploy.",
  "    match /hrAuditReviewerAuthorityReview/{uid} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  "    match /hrAuditReviewerSessionReview/{uid} {",
  "      allow get, list, create, update, delete: if false;",
  "    }",
  marker,
].join("\n"));
let app;
let db;
let auth;
let env;
const tokens = new Map();
let transactions = 0;
let verifies = 0;
const accessPath = (uid) => "userAccess/" + uid;
const authorityPath = (uid) => "hrAuditReviewerAuthorityReview/" + uid;
const sessionPath = (uid) => "hrAuditReviewerSessionReview/" + uid;
const command = (uid = "reviewer", actorUid = "actor", epoch = 7) =>
  ({ reviewerUid: uid, actorUid, expectedSessionEpoch: epoch });

before(async () => {
  env = await initializeTestEnvironment({
    projectId, firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-hr-audit-reviewer-gate");
  db = getFirestore(app);
  auth = getAuth(app);
  assert.equal(db.projectId, projectId);
  assert.equal(auth.app.options.projectId, projectId);
  for (const uid of Object.keys(roles)) {
    const email = uid + "-audit@synthetic.invalid";
    // Other emulator suites may already have synthetic manager/marketing UIDs.
    // Reuse only emulator users; no production Auth project is reachable here.
    try {
      await auth.createUser({ uid, email, password });
    } catch (error) {
      if (error?.code !== "auth/uid-already-exists") throw error;
      await auth.updateUser(uid, { email, password, disabled: false });
    }
    const response = await fetch(
      "http://" + authHost +
      "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-key",
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }) },
    );
    assert.equal(response.ok, true, "Synthetic Auth sign-in for " + uid);
    const result = await response.json();
    assert.equal(typeof result.idToken, "string");
    tokens.set(uid, result.idToken);
  }
});
beforeEach(async () => {
  await env.clearFirestore();
  await auth.updateUser("reviewer", { disabled: false });
  transactions = 0;
  verifies = 0;
  const batch = db.batch();
  for (const [uid, role] of Object.entries(roles)) {
    batch.set(db.doc(accessPath(uid)), { uid, role, accountState: "Active" });
    batch.set(db.doc(authorityPath(uid)), {
      uid, role, active: true, scope: "actor-audit", revision: "review-v1",
    });
    batch.set(db.doc(sessionPath(uid)), { uid, epoch: 7, active: true });
  }
  await batch.commit();
});
after(async () => {
  // Auth emulator state persists across test files. Restore isolation so the
  // existing canonical Admin Auth suite can create its own synthetic users.
  if (auth) {
    for (const uid of Object.keys(roles)) await auth.deleteUser(uid);
  }
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

function dependencies(afterTransaction, options = {}) {
  return {
    projectId, emulatorHost: host,
    firestore: {
      projectId: db.projectId,
      doc: (path) => db.doc(path),
      runTransaction: async (callback, config) => {
        assert.deepEqual(config, { readOnly: true });
        transactions += 1;
        const result = await db.runTransaction(callback, config);
        await afterTransaction?.();
        return result;
      },
    },
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      verifies += 1;
      return auth.verifyIdToken(token, true);
    },
    ...options,
  };
}
async function gate(uid = "reviewer", opts = {}) {
  return executeHrAuditReviewerGateReview(
    opts.command ?? command(uid), opts.token ?? tokens.get(uid),
    opts.deps ?? dependencies(opts.afterTransaction), opts.enabled ?? true,
  );
}

test("default-off gate performs zero token verification and zero Firestore IO", async () => {
  assert.deepEqual(await gate("reviewer", { enabled: false }),
    { ok: false, reason: "disabled" });
  assert.equal(transactions, 0);
  assert.equal(verifies, 0);
});

test("real Admin Auth token and pinned reviewer session permit metadata-only result", async () => {
  const result = await gate();
  assert.deepEqual(result, { ok: true, reviewerUid: "reviewer", sessionEpoch: 7 });
  assert.equal(verifies, 2, "Both Auth checks must request revocation");
  assert.equal(transactions, 1, "One pinned read-only transaction");
  assert.equal((await db.doc("hrAuditReview/actor/events/audit-1").get()).exists, false);
  assert.equal((await db.doc("hrAuditReviewReceipts/audit-1").get()).exists, false);
});

test("non-Admin, self-review, forged UID and wrong epoch all fail closed", async () => {
  assert.deepEqual(await gate("manager"), { ok: false, reason: "not-authorized" });
  assert.deepEqual(await gate("marketing"), { ok: false, reason: "not-authorized" });
  assert.deepEqual(await gate("actor", { command: command("actor", "actor") }),
    { ok: false, reason: "unavailable" });
  const beforeForged = transactions;
  assert.deepEqual(await gate("reviewer", { token: tokens.get("manager") }),
    { ok: false, reason: "session-revoked" });
  assert.equal(transactions, beforeForged, "Forged identity must not read authority");
  assert.deepEqual(await gate("reviewer", { command: command("reviewer", "actor", 8) }),
    { ok: false, reason: "not-authorized" });
});

test("browser roles cannot read or forge server-owned reviewer session/authority", async () => {
  for (const uid of Object.keys(roles)) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [authorityPath("reviewer"), sessionPath("reviewer")]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { active: true, uid }));
    }
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),
    sessionPath("reviewer"))));
});

test("session revoked immediately after pinned transaction cannot yield approval", async () => {
  const result = await gate("reviewer", { afterTransaction: () =>
    db.doc(sessionPath("reviewer")).update({ active: false, epoch: 8 }) });
  assert.deepEqual(result, { ok: false, reason: "authority-changed" });
  assert.equal(verifies, 2);
  assert.equal(transactions, 1);
  assert.equal((await db.doc("hrAuditReviewReceipts/audit-1").get()).exists, false);
});

test("reviewer permission revoked after pinned transaction denies final result", async () => {
  const result = await gate("reviewer", { afterTransaction: () =>
    db.doc(authorityPath("reviewer")).update({ active: false, revision: "revoked-v2" }) });
  assert.deepEqual(result, { ok: false, reason: "authority-changed" });
  assert.equal(verifies, 2);
  assert.equal(transactions, 1);
});

test("actual Auth account disabled after pinned transaction blocks result", async () => {
  try {
    const result = await gate("reviewer", { afterTransaction: () =>
      auth.updateUser("reviewer", { disabled: true }) });
    assert.deepEqual(result, { ok: false, reason: "unavailable" });
    assert.equal(verifies, 2);
    assert.equal(transactions, 1);
  } finally {
    await auth.updateUser("reviewer", { disabled: false });
  }
});

test("disabled Auth account, invalid token and wrong project perform no transaction", async () => {
  await auth.updateUser("reviewer", { disabled: true });
  try {
    assert.deepEqual(await gate(), { ok: false, reason: "unavailable" });
    assert.equal(transactions, 0);
  } finally {
    await auth.updateUser("reviewer", { disabled: false });
  }
  assert.deepEqual(await gate("reviewer", { token: "forged.header.signature" }),
    { ok: false, reason: "unavailable" });
  assert.equal(transactions, 0);
  assert.deepEqual(await gate("reviewer", { deps: {
    ...dependencies(), projectId: "momentum-hr-other-review",
  } }), { ok: false, reason: "unavailable" });
  assert.equal(transactions, 0);
});
