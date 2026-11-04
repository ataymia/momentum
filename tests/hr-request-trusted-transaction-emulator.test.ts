/**
 * REVIEW ONLY: real Firestore emulator transaction wiring for the disabled HR
 * decision boundary. No Admin SDK, production rules, endpoint or live data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { createHcmSeed, type HCMState } from "../lib/hcm-engine";
import {
  executeHrDecisionReview, type HrDecisionTransactionRunner,
} from "../lib/hr-request-trusted-transaction";
import type { HrDecisionReceipt } from "../lib/hr-request-server-contract";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

let env: RulesTestEnvironment;
const sourceRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(sourceRules.includes(marker), "rules layout changed; do not silently weaken security");
const candidateRules = sourceRules.replace(marker, `
    // Synthetic-only canonical HR decision state and receipts, never deployed.
    match /hrTrustedDecisionReview/{docId} {
      allow read, write: if false;
    }
    match /hrTrustedDecisionReceipts/{receiptId} {
      allow read, write: if false;
    }
` + marker);
const canonicalPath = "hrTrustedDecisionReview/canonical";
const directoryPath = "hrTrustedDecisionReview/directory";
const receiptPath = (key: string) => "hrTrustedDecisionReceipts/" + key;
const at = "2026-11-04T17:00:00.000Z";
const user = (id: string, role: WorkspaceUser["role"]): WorkspaceUser =>
  ({ id, role, name: id, email: id + "@example.test", team: "Sales",
    title: "Synthetic", initials: "TT", accent: "#123456",
    employmentStatus: "Active" } as WorkspaceUser);
const admin = user("admin", "Administrator");
const rep = user("rep", "Sales Representative");
const directory = [admin, rep];

async function privileged<T>(
  callback: (db: ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>) => Promise<T>,
): Promise<T> {
  let result!: T;
  await env.withSecurityRulesDisabled(async (context) => {
    result = await callback(context.firestore());
  });
  return result;
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "momentum-hr-trusted-decision-review",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  const hcm = createHcmSeed({ users: directory } as WorkspaceData);
  hcm.leaveRequests = [{
    id: "leave-rep", userId: "rep", reason: "Synthetic", requestedHours: 8,
    startDate: "2026-11-10", endDate: "2026-11-10",
    submittedAt: at, status: "Submitted", policyId: "pto",
  }];
  hcm.ptoPolicies = [{
    id: "pto", name: "Synthetic", active: true, method: "Manual",
    accrualHoursPerPayPeriod: 0, frontLoadHours: 0, waitingDays: 0,
    minimumRequestHours: 1, effectiveDate: "2026-01-01",
  }];
  hcm.ptoLedger = [{
    id: "credit", userId: "rep", policyId: "pto", date: "2026-11-01",
    type: "Adjustment", hours: 12, note: "Synthetic", createdBy: "admin", createdAt: at,
  }];
  await privileged(async (db) => {
    for (const p of directory) {
      await setDoc(doc(db, "userAccess", p.id), {
        role: p.role, accountState: "Active", email: p.email, team: p.team,
        updatedAt: at, updatedBy: "synthetic", managedTeams: [],
      });
    }
    await setDoc(doc(db, directoryPath), { json: JSON.stringify(directory) });
    await setDoc(doc(db, canonicalPath), { revision: 7, json: JSON.stringify(hcm) });
  });
});
after(async () => { await env?.cleanup(); });

const runner: HrDecisionTransactionRunner = {
  run: (callback) => privileged((db) => runTransaction(db, async (transaction) => callback({
    readAccess: async (uid) => {
      const snap = await transaction.get(doc(db, "userAccess", uid));
      return snap.exists() ? { uid, ...snap.data() } as UserAccessRecord : null;
    },
    readDirectory: async () => {
      const snap = await transaction.get(doc(db, directoryPath));
      return snap.exists() ? JSON.parse(snap.data().json as string) as WorkspaceUser[] : [];
    },
    readHcm: async () => {
      const snap = await transaction.get(doc(db, canonicalPath));
      if (!snap.exists()) return null;
      return { revision: snap.data().revision as number,
        hcm: JSON.parse(snap.data().json as string) as HCMState };
    },
    readReceipt: async (key) => {
      const snap = await transaction.get(doc(db, receiptPath(key)));
      return snap.exists() ? snap.data() as HrDecisionReceipt : null;
    },
    replaceHcm: (value) => {
      transaction.set(doc(db, canonicalPath), {
        revision: value.revision, json: JSON.stringify(value.hcm),
      });
    },
    createReceipt: (key, receipt) => {
      transaction.set(doc(db, receiptPath(key)), receipt);
    },
  }))),
};

test("all browser roles, including Administrator, are denied synthetic canonical HR writes", async () => {
  for (const uid of ["admin", "rep", "manager", "customer", "separated"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, canonicalPath)));
    await assertFails(getDoc(doc(db, receiptPath("leave:leave-rep"))));
    await assertFails(setDoc(doc(db, canonicalPath), { revision: 100 }));
    await assertFails(setDoc(doc(db, receiptPath("leave:leave-rep")), { forged: true }));
  }
});

test("real emulator transactions commit one HR request, PTO debit, audit and receipt atomically", async () => {
  const call = (id: string) => executeHrDecisionReview({
    commandId: id, kind: "leave", requestId: "leave-rep",
    decision: "Approved", note: "", expectedRevision: 7,
  }, {
    enabled: true, verifiedUid: async () => "admin", serverNow: () => at, runner,
  });
  const results = await Promise.all([call("first"), call("second")]);
  assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
  assert.equal((await call("third")).ok, false);
  await privileged(async (db) => {
    const canonical = (await getDoc(doc(db, canonicalPath))).data();
    assert.equal(canonical?.revision, 8);
    const hcm = JSON.parse(canonical?.json as string) as HCMState;
    assert.equal(hcm.leaveRequests[0].status, "Approved");
    assert.equal(hcm.ptoLedger.filter((entry) => entry.requestId === "leave-rep").length, 1);
    assert.equal(hcm.ptoLedger.find((entry) => entry.requestId === "leave-rep")?.hours, -8);
    assert.equal(hcm.audit.length, 1);
    const receipts = await Promise.all([
      getDoc(doc(db, receiptPath("leave:leave-rep"))),
    ]);
    assert.equal(receipts[0].exists(), true);
    assert.equal(receipts[0].data()?.nextRevision, 8);
  });
});
