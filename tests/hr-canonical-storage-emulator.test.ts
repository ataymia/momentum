/**
 * REVIEW ONLY: synthetic Firestore emulator copy/restore rehearsal.
 * The candidate server-owned HR paths and rules exist ONLY in memory.
 * No production Admin SDK, migration executor, callable endpoint or deployment.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { userDocPath } from "../lib/firestore-domains";
import { planHrLegacySharedField } from "../lib/hr-legacy-migration-plan";
import type { VersionedSnapshot } from "../lib/hr-legacy-reconciliation";
import {
  assessHrCanonicalCopyGate, assessHrCanonicalRoundTrip, hrCanonicalReviewPath,
} from "../lib/hr-canonical-storage-review";

const sourceRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(sourceRules.includes(marker), "review rules insertion point must exist");
const candidateRules = sourceRules.replace(marker,
  "\n    // Test-only canonical HCM storage. All browser identities denied.\n" +
  "    match /hrCanonicalReview/{uid}/fields/{field} {\n" +
  "      allow read, write: if false;\n" +
  "    }\n" + marker);
const source = "domains/hcm/fields/leaveRequests";
const owner = "uid-synthetic-a";
const peer = "uid-synthetic-b";
const target = userDocPath(owner, "hcm", "leaveRequests");
const canonicalPath = hrCanonicalReviewPath(owner, "leaveRequests");
const synthetic = { id: "leave-synthetic", userId: owner, status: "Submitted", hours: 4 };
let env: RulesTestEnvironment;

async function privileged<T>(
  callback: (db: ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>) => Promise<T>,
): Promise<T> {
  let result!: T;
  await env.withSecurityRulesDisabled(async (context) => {
    result = await callback(context.firestore());
  });
  return result;
}
async function readReviewSnapshot(path: string): Promise<VersionedSnapshot> {
  return privileged(async (db) => {
    const snapshot = await getDoc(doc(db, path));
    if (!snapshot.exists()) return { path, version: null, data: null };
    const value = snapshot.data();
    return { path, version: value.version as string,
      data: { items: value.items } };
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "momentum-hr-canonical-review-only",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  await privileged(async (db) => {
    await setDoc(doc(db, source), { version: "legacy@1", items: [synthetic] });
  });
});
after(async () => { await env?.cleanup(); });

test("canonical candidate denies browser read/write for every role including Administrator", async () => {
  for (const uid of [owner, peer, "uid-admin", "uid-manager", "uid-customer", "uid-separated"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, canonicalPath)));
    await assertFails(setDoc(doc(db, canonicalPath), { version: "forged", items: [synthetic] }));
    await assertFails(deleteDoc(doc(db, canonicalPath)));
  }
  const unauth = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauth, canonicalPath)));
});

test("privileged emulator-only transaction copies one verified synthetic record and restores absence", async () => {
  const plan = planHrLegacySharedField({
    field: "leaveRequests", sharedDocument: { items: [synthetic] },
    knownUserIds: new Set([owner]),
    existingUserDocuments: new Map([[target, null]]),
  });
  const baseline: VersionedSnapshot[] = [
    { path: source, version: "legacy@1", data: { items: [synthetic] } },
    { path: target, version: null, data: null },
  ];
  const before = [await readReviewSnapshot(canonicalPath)];
  assert.equal(assessHrCanonicalCopyGate({
    plan, baseline, current: structuredClone(baseline), canonicalInventory: before,
  }).status, "eligible-for-synthetic-review");
  await privileged((db) => runTransaction(db, async (tx) => {
    const original = await tx.get(doc(db, source));
    const destination = await tx.get(doc(db, canonicalPath));
    assert.equal(original.data()?.version, "legacy@1");
    assert.deepEqual(original.data()?.items, [synthetic]);
    assert.equal(destination.exists(), false);
    tx.set(doc(db, canonicalPath), { version: "copy@1", items: [synthetic] });
  }));
  const copied = [await readReviewSnapshot(canonicalPath)];
  assert.equal(copied[0].version, "copy@1");
  // Restore rehearsal operates ONLY on the synthetic target, never deletes source.
  await privileged((db) => runTransaction(db, async (tx) => {
    const destination = await tx.get(doc(db, canonicalPath));
    assert.equal(destination.data()?.version, "copy@1");
    tx.delete(doc(db, canonicalPath));
  }));
  const restored = [await readReviewSnapshot(canonicalPath)];
  const sourceAfter = await readReviewSnapshot(source);
  const result = assessHrCanonicalRoundTrip({
    plan, baseline, current: structuredClone(baseline),
    canonicalBefore: before, canonicalAfter: copied, canonicalRestored: restored,
    legacyAfter: [sourceAfter, { path: target, version: null, data: null }],
  });
  assert.deepEqual(result, {
    status: "eligible-for-synthetic-review", issues: [], records: 1, targets: 1,
  });
  assert.equal(sourceAfter.version, "legacy@1");
  assert.deepEqual(sourceAfter.data?.items, [synthetic]);
  await assertFails(getDoc(doc(env.authenticatedContext(owner).firestore(), canonicalPath)));
});
