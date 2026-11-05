/** REVIEW ONLY: real Admin Auth + Firestore, synthetic local emulator data. */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { createHrAuditSessionPinnedReaderReview } from
  "../../lib/hr-audit-session-pinned-review.ts";

const projectId = "momentum-hr-admin-sdk-review";
const host = "127.0.0.1:8080";
const authHost = "127.0.0.1:9099";
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, host);
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost);
assert.equal(process.env.GCLOUD_PROJECT, projectId);

const reviewer = "pinnedSessionReviewer";
const actor = "pinnedSessionActor";
const eventId = "pinned-event-1";
const subject = "pinnedSubject";
const shard = "events__chunk_000000";
const legacyPath = `userDomains/${actor}/hcm/audit`;
const manifestPath = `userDomains/${actor}/audit/events`;
const shardPath = `userDomains/${actor}/audit/${shard}`;
const eventPath = `hrAuditReview/${subject}/events/${eventId}`;
const receiptPath = `hrAuditReviewReceipts/${eventId}`;
const accessPath = `userAccess/${reviewer}`;
const authorityPath = `hrAuditReviewerAuthorityReview/${reviewer}`;
const sessionPath = `hrAuditReviewerSessionReview/${reviewer}`;
const auditPaths = [manifestPath, legacyPath, shardPath, eventPath, receiptPath];
const event = { id: eventId, actorId: actor, action: "synthetic" };
const password = "Synthetic-Only-Review-Not-Real-Password-91";
const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}`;
let env, app, db, auth, token;
const stamp = (snapshot) =>
  snapshot.updateTime.seconds + ":" + snapshot.updateTime.nanoseconds;
const versions = async () => Object.fromEntries(await Promise.all(
  auditPaths.map(async (path) => [path, stamp(await db.doc(path).get())]),
));
const inventory = async () => ({
  actorUid: actor, reviewerUid: reviewer, shardNames: [shard],
  eventSubjects: [{ eventId, subjectUid: subject }],
  expectedVersions: await versions(),
});
const command = { reviewerUid: reviewer, actorUid: actor, expectedSessionEpoch: 7 };
const quarantined = {
  status: "quarantined", reason: "unauthorized",
  safeToAppend: false, safeToReplayWithoutWrite: false,
  independentlyAuthenticated: false, sameHistoricalSnapshotVerified: false,
};
const matched = {
  ...quarantined, status: "versions-matched-unattested", reason: "none",
};
let tokenChecks, pinnedReads;
const makeDb = (duringPinnedRead) => ({
  projectId,
  doc: (path) => db.doc(path),
  runTransaction: (fn, options) => db.runTransaction(async (tx) => {
    if (options.maxAttempts !== 1) return fn(tx);
    pinnedReads++;
    let count = 0;
    return fn({
      get: async (ref) => {
        const snapshot = await tx.get(ref);
        if (++count === auditPaths.length) await duringPinnedRead?.();
        return snapshot;
      },
    });
  }, options),
});
const create = async ({
  enabled = true, rawToken = token, verify = null,
  duringPinnedRead = null, inventoryOverride = null, firestore = null,
  commandOverride = command,
} = {}) => createHrAuditSessionPinnedReaderReview({
  projectId, emulatorHost: host,
  firestore: firestore ?? makeDb(duringPinnedRead),
  inventory: inventoryOverride ?? await inventory(),
  command: commandOverride,
  rawToken,
  verifyIdToken: verify ?? (async (jwt, checkRevoked) => {
    assert.equal(checkRevoked, true);
    tokenChecks++;
    return auth.verifyIdToken(jwt, true);
  }),
}, enabled);

before(async () => {
  env = await initializeTestEnvironment({
    projectId, firestore: { rules, host: "127.0.0.1", port: 8080 },
  });
  app = initializeApp({ projectId }, "momentum-session-pinned-audit-review");
  db = getFirestore(app);
  auth = getAuth(app);
  await auth.createUser({
    uid: reviewer, email: "pinned-session@synthetic.invalid", password,
  });
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-key`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "pinned-session@synthetic.invalid", password,
        returnSecureToken: true,
      }) },
  );
  assert.equal(response.ok, true);
  token = (await response.json()).idToken;
  assert.equal(typeof token, "string");
});
beforeEach(async () => {
  await env.clearFirestore();
  await auth.updateUser(reviewer, { disabled: false });
  tokenChecks = 0;
  pinnedReads = 0;
  const batch = db.batch();
  batch.set(db.doc(manifestPath), { shards: [shard], itemCount: 1 });
  batch.set(db.doc(legacyPath), { items: [event] });
  batch.set(db.doc(shardPath), { items: [event] });
  batch.set(db.doc(eventPath), {
    event, provenance: { sourcePath: legacyPath, subjectUid: subject },
  });
  batch.set(db.doc(receiptPath), {
    sourcePath: legacyPath, destinationPath: eventPath, subjectUid: subject,
  });
  batch.set(db.doc(accessPath), {
    uid: reviewer, role: "Administrator", accountState: "Active",
  });
  batch.set(db.doc(authorityPath), {
    uid: reviewer, role: "Administrator", active: true,
    scope: "actor-audit", revision: "review-v1",
  });
  batch.set(db.doc(sessionPath), {
    uid: reviewer, active: true, epoch: 7,
  });
  await batch.commit();
});
after(async () => {
  if (auth) await auth.deleteUser(reviewer);
  await env?.cleanup();
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});

test("default disabled creates no reader or Auth/Firestore work", async () => {
  assert.equal(await create({ enabled: false }), null);
  assert.equal(tokenChecks, 0);
  assert.equal(pinnedReads, 0);
});

test("real revoked-aware Admin Auth + authority permits only unattested metadata", async () => {
  const beforeVersions = await versions();
  const reader = await create();
  assert.deepEqual(await reader(), matched);
  assert.equal(tokenChecks, 4, "two independent gates each verify token twice");
  assert.equal(pinnedReads, 1);
  assert.deepEqual(await versions(), beforeVersions);
});

test("forged token fails before any confidential pinned reads", async () => {
  const reader = await create({ rawToken: "fake.header.signature" });
  assert.deepEqual(await reader(), quarantined);
  assert.equal(pinnedReads, 0);
});

test("non-admin reviewer cannot read audit despite valid token", async () => {
  await db.doc(accessPath).update({ role: "Marketing" });
  const reader = await create();
  assert.deepEqual(await reader(), quarantined);
  assert.equal(pinnedReads, 0);
});

test("session revoked during pinned transaction denies the final result", async () => {
  const reader = await create({ duringPinnedRead: () =>
    db.doc(sessionPath).update({ active: false, epoch: 8 }) });
  assert.deepEqual(await reader(), quarantined);
  assert.equal(pinnedReads, 1);
  assert.equal((await db.doc(receiptPath).get()).exists, true);
});

test("reviewer permission revoked during pinned transaction denies result", async () => {
  const reader = await create({ duringPinnedRead: () =>
    db.doc(authorityPath).update({ active: false, revision: "revoked-v2" }) });
  assert.deepEqual(await reader(), quarantined);
  assert.equal(pinnedReads, 1);
});

test("Auth account disabled during pinned transaction denies result", async () => {
  try {
    const reader = await create({ duringPinnedRead: () =>
      auth.updateUser(reviewer, { disabled: true }) });
    assert.deepEqual(await reader(), quarantined);
    assert.equal(pinnedReads, 1);
  } finally {
    await auth.updateUser(reviewer, { disabled: false });
  }
});

test("missing audit receipt remains quarantined and never repaired", async () => {
  const reader = await create();
  await db.doc(receiptPath).delete();
  const result = await reader();
  assert.equal(result.status, "quarantined");
  assert.equal(result.safeToAppend, false);
  assert.equal((await db.doc(receiptPath).get()).exists, false);
});

test("mismatched asserted actor and reviewer inventory rejects composition", async () => {
  const reader = await create({
    commandOverride: { ...command, actorUid: "different-actor" },
  });
  assert.equal(reader, null);
});

test("browser roles cannot read private receipts or reviewer authority", async () => {
  for (const uid of [reviewer, actor, "Marketing", "anonymousUser"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [receiptPath, authorityPath, sessionPath])
      await assertFails(getDoc(doc(client, path)));
  }
});

test("quarantine output contains no token, employee IDs or private paths", async () => {
  const reader = await create({ rawToken: "invalid.header.signature" });
  const result = JSON.stringify(await reader());
  for (const secret of [reviewer, actor, subject, eventId,
    "userDomains", "hrAuditReview", token])
    assert.equal(result.includes(secret), false);
});
