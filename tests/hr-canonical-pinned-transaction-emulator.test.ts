/**
 * REVIEW ONLY: real Firestore emulator transaction transport for the
 * default-disabled pinned HR read contract. Candidate rules, identities,
 * sessions and records are synthetic. No production Admin SDK or endpoint.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import {
  executeHrCanonicalPinnedReadReview, HrCanonicalSnapshotConflict,
  type HrCanonicalPinnedTransport,
} from "../lib/hr-canonical-pinned-snapshot";
import {
  type HrCanonicalAuthority, type HrCanonicalDocument, type HrCanonicalReadCommand,
} from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceUser } from "../lib/types";

const originalRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(originalRules.includes(marker), "fail closed if rules layout changes");
const candidateRules = originalRules.replace(marker, `
    // Review-only synthetic storage: no browser identity has direct access.
    match /hrCanonicalReview/{uid}/fields/{field} {
      allow read, write: if false;
    }
    match /hrCanonicalReadAuthorityReview/{uid} {
      allow read, write: if false;
    }
    match /hrCanonicalReadSessionReview/{uid} {
      allow read, write: if false;
    }
` + marker);

type Db = ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>;
const at = "2026-11-04T22:00:00.000Z";
const people: WorkspaceUser[] = [
  { id: "admin", role: "Administrator", name: "Synthetic Admin" },
  { id: "manager", role: "Sales Manager", name: "Synthetic Manager" },
  { id: "rep", role: "Sales Representative", name: "Synthetic Rep", managerId: "manager" },
  { id: "customer", role: "Customer", name: "Synthetic Customer" },
  { id: "marketing", role: "Marketing", name: "Synthetic Marketing" },
].map((p) => ({
  ...p, email: p.id + "@example.test", team: "Sales",
  title: "Synthetic", initials: "SY", accent: "#123456",
  employmentStatus: "Active",
} as WorkspaceUser));
const canonicalPath = (field: "leaveRequests" | "documents" | "compensation") =>
  hrCanonicalReviewPath("rep", field);
const directoryPath = (uid: string) => "hrCanonicalReadAuthorityReview/" + uid;
const sessionPath = (uid: string) => "hrCanonicalReadSessionReview/" + uid;
const command = (field: "leaveRequests" | "documents" | "compensation" = "leaveRequests"):
  HrCanonicalReadCommand => ({ ownerUid: "rep", field, expectedSessionEpoch: 7 });
let env: RulesTestEnvironment;

async function privileged<T>(callback: (db: Db) => Promise<T>): Promise<T> {
  let result!: T;
  await env.withSecurityRulesDisabled(async (context) => {
    result = await callback(context.firestore());
  });
  return result;
}
async function patch(path: string, value: Record<string, unknown>) {
  await privileged(async (db) => {
    await setDoc(doc(db, path), value, { merge: true });
  });
}
async function seed() {
  await privileged(async (db) => {
    for (const p of people) {
      await setDoc(doc(db, "userAccess", p.id), {
        role: p.role, accountState: "Active", email: p.email,
        team: p.team, managerId: p.managerId ?? null,
        updatedAt: at, updatedBy: "synthetic",
      });
      await setDoc(doc(db, directoryPath(p.id)), { ...p });
      await setDoc(doc(db, sessionPath(p.id)), { uid: p.id, epoch: 7, active: true });
    }
    await setDoc(doc(db, canonicalPath("leaveRequests")), {
      version: "v1", items: [{
        id: "leave-1", userId: "rep", status: "Submitted",
        requestedHours: 4, reason: "CONFIDENTIAL-LEAVE-REASON",
      }],
    });
    await setDoc(doc(db, canonicalPath("documents")), {
      version: "v1", items: [{
        id: "doc-1", userId: "rep", title: "Synthetic document",
        status: "Available", evidence: "CONFIDENTIAL-FILE-URL",
      }],
    });
    await setDoc(doc(db, canonicalPath("compensation")), {
      version: "v1", items: [{
        id: "pay-1", userId: "rep", basis: "Hourly", rate: 23,
        privateNotes: "CONFIDENTIAL-PAY-NOTES",
      }],
    });
  });
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "momentum-hr-pinned-transaction-emulator-review",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});
after(async () => { await env?.cleanup(); });

type Hooks = {
  afterTransaction?: () => Promise<void>;
  conflictAttempts?: number;
};
function transport(actorUid: string, hooks: Hooks = {}) {
  let attempts = 0;
  let canonicalReads = 0;
  const readAuthority = async (
    read: (path: string) => Promise<Record<string, unknown> | null>,
  ): Promise<HrCanonicalAuthority> => {
    const [session, actorAccess, actorPerson, targetAccess, targetPerson] = await Promise.all([
      read(sessionPath(actorUid)), read("userAccess/" + actorUid),
      read(directoryPath(actorUid)), read("userAccess/rep"), read(directoryPath("rep")),
    ]);
    return {
      authenticatedUid: actorUid,
      session: session as HrCanonicalAuthority["session"],
      actorAccess: actorAccess ? { uid: actorUid, ...actorAccess } as UserAccessRecord : null,
      actorDirectory: actorPerson as WorkspaceUser | null,
      targetAccess: targetAccess ? { uid: "rep", ...targetAccess } as UserAccessRecord : null,
      targetDirectory: targetPerson as WorkspaceUser | null,
    };
  };
  const result: HrCanonicalPinnedTransport = {
    withReadOnlySnapshot: async (callback) => {
      attempts += 1;
      if (attempts <= (hooks.conflictAttempts ?? 0)) throw new HrCanonicalSnapshotConflict();
      const response = await privileged((db) => runTransaction(db, async (tx) => {
        const read = async (path: string) => {
          const snapshot = await tx.get(doc(db, path));
          return snapshot.exists() ? snapshot.data() : null;
        };
        return callback({
          readAuthority: () => readAuthority(read),
          readCanonical: async (path): Promise<HrCanonicalDocument | null> => {
            canonicalReads += 1;
            const data = await read(path);
            return data ? {
              path, version: data.version as string, items: data.items,
            } : null;
          },
          readCanonicalVersion: async (path) => {
            const data = await read(path);
            return typeof data?.version === "string" ? data.version : null;
          },
        });
      }));
      await hooks.afterTransaction?.();
      return response;
    },
    readAuthority: () => privileged((db) => readAuthority(async (path) => {
      const snapshot = await getDoc(doc(db, path));
      return snapshot.exists() ? snapshot.data() : null;
    })),
  };
  return { result, attempts: () => attempts, canonicalReads: () => canonicalReads };
}

test("candidate canonical, session and directory documents deny all browser roles", async () => {
  for (const uid of ["rep", "manager", "admin", "marketing", "customer"]) {
    const db = env.authenticatedContext(uid).firestore();
    for (const path of [canonicalPath("leaveRequests"), canonicalPath("compensation"),
      directoryPath("rep"), sessionPath("rep")]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { forged: true }));
    }
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),
    canonicalPath("leaveRequests"))));
});

test("real emulator transaction projects only authorized synthetic HR fields", async () => {
  for (const uid of ["rep", "manager", "admin"]) {
    const t = transport(uid);
    const value = await executeHrCanonicalPinnedReadReview(command(), t.result, true);
    assert.equal(value.ok, true, uid);
    assert.equal(t.attempts(), 1);
    assert.equal(t.canonicalReads(), 1);
    assert.ok(!JSON.stringify(value).includes("CONFIDENTIAL-"));
  }
  for (const uid of ["rep", "manager", "marketing", "customer"]) {
    const t = transport(uid);
    const value = await executeHrCanonicalPinnedReadReview(command("compensation"), t.result, true);
    assert.equal(value.ok, false, uid);
    assert.equal(t.canonicalReads(), 0, "deny before confidential read");
  }
  const adminPay = await executeHrCanonicalPinnedReadReview(command("compensation"),
    transport("admin").result, true);
  assert.equal(adminPay.ok, true);
  assert.ok(!JSON.stringify(adminPay).includes("CONFIDENTIAL-PAY-NOTES"));
  const managerDocs = transport("manager");
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command("documents"),
    managerDocs.result, true), { ok: false, reason: "field-restricted" });
  assert.equal(managerDocs.canonicalReads(), 0);
});

test("post-transaction session revocation rejects formerly authorized projection", async () => {
  const t = transport("rep", {
    afterTransaction: () => patch(sessionPath("rep"), { epoch: 8, active: false }),
  });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command(), t.result, true),
    { ok: false, reason: "authority-changed" });
  assert.equal(t.attempts(), 1);
});

test("post-transaction manager reassignment and suspension deny without retry", async () => {
  const reassigned = transport("manager", {
    afterTransaction: async () => {
      await patch("userAccess/rep", { managerId: "admin", updatedAt: "v2" });
      await patch(directoryPath("rep"), { managerId: "admin" });
    },
  });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command(), reassigned.result, true),
    { ok: false, reason: "authority-changed" });
  assert.equal(reassigned.attempts(), 1);
  // The second scenario must begin with an authorized manager relationship.
  await patch("userAccess/rep", { managerId: "manager", updatedAt: at });
  await patch(directoryPath("rep"), { managerId: "manager" });
  const suspended = transport("manager", {
    afterTransaction: () => patch("userAccess/manager",
      { accountState: "Suspended", updatedAt: "v3" }),
  });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command(), suspended.result, true),
    { ok: false, reason: "authority-changed" });
  assert.equal(suspended.attempts(), 1);
});

test("explicit contention retries entire real transaction once, never on revocation", async () => {
  const t = transport("rep", { conflictAttempts: 1 });
  assert.equal((await executeHrCanonicalPinnedReadReview(command(), t.result, true)).ok, true);
  assert.equal(t.attempts(), 2);
  assert.equal(t.canonicalReads(), 1);
  const exhausted = transport("rep", { conflictAttempts: 2 });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command(), exhausted.result, true),
    { ok: false, reason: "unavailable" });
  assert.equal(exhausted.attempts(), 2);
  assert.equal(exhausted.canonicalReads(), 0);
});

test("default-disabled adapter performs no emulator transaction or authority read", async () => {
  const t = transport("rep");
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command(), t.result),
    { ok: false, reason: "disabled" });
  assert.equal(t.attempts(), 0);
  assert.equal(t.canonicalReads(), 0);
});
