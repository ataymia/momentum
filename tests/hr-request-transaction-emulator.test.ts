/**
 * REVIEW-ONLY Firestore emulator characterization of a future server-owned
 * HR decision store. This does NOT install rules, register a Function or write
 * business data. withSecurityRulesDisabled represents trusted service access
 * in a synthetic emulator project, not production Admin SDK verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const requestPath = "hrDecisionReview/leave-rep";
const receiptPath = (id: string) => "hrDecisionReviewReceipts/" + id;
const sourceRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(sourceRules.includes(marker), "generated rules layout changed");
const candidateRules = sourceRules.replace(marker,
  `    // REVIEW ONLY: server-owned HR decision records; not generated or deployed.
    match /hrDecisionReview/{requestId} {
      allow read, write: if false;
    }
    match /hrDecisionReviewReceipts/{receiptId} {
      allow read, write: if false;
    }
` + marker);

const client = (uid: string) => env.authenticatedContext(uid).firestore();
async function privileged<T>(callback: (db: ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>) => Promise<T>): Promise<T> {
  return env.withSecurityRulesDisabled(async (context) => callback(context.firestore()));
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "momentum-hr-decision-review-only",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  await privileged(async (db) => {
    const identities = [
      ["admin", "Administrator", "Active"],
      ["manager", "Sales Manager", "Active"],
      ["rep", "Sales Representative", "Active"],
      ["other", "Sales Representative", "Active"],
      ["customer", "Customer", "Active"],
      ["separated", "Sales Representative", "Separated"],
    ] as const;
    for (const [uid, role, accountState] of identities) {
      await setDoc(doc(db, "userAccess", uid), {
        role, accountState, team: role === "Customer" ? "Customer" : "Sales",
        email: uid + "@example.test", managedTeams: [], updatedAt: "2026-11-04",
      });
    }
    await setDoc(doc(db, requestPath), {
      status: "Submitted", ownerUid: "rep", revision: 3,
    });
  });
});
after(async () => { await env?.cleanup(); });

test("proposed server-owned paths deny reads and forged decisions for every browser role", async () => {
  for (const uid of ["admin", "manager", "rep", "other", "customer", "separated"]) {
    await assertFails(getDoc(doc(client(uid), requestPath)));
    await assertFails(getDoc(doc(client(uid), receiptPath("attempt"))));
    await assertFails(setDoc(doc(client(uid), requestPath), { status: "Approved" }));
    await assertFails(setDoc(doc(client(uid), receiptPath("attempt")), { approved: true }));
  }
});

async function syntheticServerDecision(commandId: string) {
  return privileged(async (db) => runTransaction(db, async (tx) => {
    const requestRef = doc(db, requestPath);
    const receiptRef = doc(db, receiptPath(commandId));
    const current = await tx.get(requestRef);
    const priorReceipt = await tx.get(receiptRef);
    if (!current.exists() || current.data().status !== "Submitted" ||
        current.data().revision !== 3 || priorReceipt.exists()) return false;
    tx.update(requestRef, { status: "Approved", revision: 4, reviewerUid: "admin" });
    tx.set(receiptRef, { commandId, requestKey: "leave:leave-rep",
      priorRevision: 3, nextRevision: 4, actorUid: "admin" });
    return true;
  }));
}

test("synthetic privileged transactions serialize two concurrent approvals and block replay", async () => {
  const outcomes = await Promise.all([
    syntheticServerDecision("synthetic-a"),
    syntheticServerDecision("synthetic-b"),
  ]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(await syntheticServerDecision("synthetic-a"), false);
  assert.equal(await syntheticServerDecision("synthetic-b"), false);
  await privileged(async (db) => {
    const record = await getDoc(doc(db, requestPath));
    assert.equal(record.data()?.status, "Approved");
    assert.equal(record.data()?.revision, 4);
    const a = await getDoc(doc(db, receiptPath("synthetic-a")));
    const b = await getDoc(doc(db, receiptPath("synthetic-b")));
    assert.equal(Number(a.exists()) + Number(b.exists()), 1);
  });
});
