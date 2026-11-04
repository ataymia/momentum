/**
 * REVIEW ONLY: Firestore emulator integration for the disabled canonical HR
 * read contract. All identities and records are synthetic; candidate rules
 * are injected in memory. Privileged context is NOT a deployed Admin handler.
 */
import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  executeHrCanonicalReadReview, type HrCanonicalAuthority,
  type HrCanonicalReadCommand, type HrCanonicalReadField,
  type HrCanonicalReadTransport,
} from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceUser } from "../lib/types";

const originalRules = readFileSync("firestore.rules", "utf8");
const marker = "    match /userAccess/{uid} {";
assert.ok(originalRules.includes(marker), "rules layout changed: fail instead of silently weakening security");
const candidateRules = originalRules.replace(marker, `
    // Synthetic review paths are never exposed to browser SDK identities.
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

const at = "2026-11-04T20:00:00.000Z";
const people: WorkspaceUser[] = [
  { id: "admin", role: "Administrator", name: "Synthetic Admin" },
  { id: "manager", role: "Sales Manager", name: "Synthetic Manager" },
  { id: "rep", role: "Sales Representative", name: "Synthetic Rep", managerId: "manager" },
  { id: "customer", role: "Customer", name: "Synthetic Customer" },
  { id: "marketing", role: "Marketing", name: "Synthetic Marketing" },
].map((entry) => ({
  ...entry, email: entry.id + "@example.test", team: "Sales", title: "Synthetic",
  initials: "SY", accent: "#123456", employmentStatus: "Active",
} as WorkspaceUser));

const canonicalPath = (field: HrCanonicalReadField) => hrCanonicalReviewPath("rep", field);
const authorityPath = (uid: string) => "hrCanonicalReadAuthorityReview/" + uid;
const sessionPath = (uid: string) => "hrCanonicalReadSessionReview/" + uid;
const command = (field: HrCanonicalReadField = "leaveRequests"): HrCanonicalReadCommand => ({
  ownerUid: "rep", field, expectedSessionEpoch: 7,
});
const leave = { id: "leave-1", userId: "rep", status: "Submitted", requestedHours: 4,
  startDate: "2026-11-10", endDate: "2026-11-10",
  reason: "PRIVATE LEAVE REASON NEVER RETURNED" };
const file = { id: "doc-1", userId: "rep", title: "Synthetic document",
  status: "Available", category: "Tax", version: 1,
  fileName: "PRIVATE-DOCUMENT-LOCATION.pdf" };
const pay = { id: "pay-1", userId: "rep", basis: "Hourly", rate: 23,
  effectiveDate: "2026-01-01", status: "Active", privateNotes: "SECRET" };
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
async function seed() {
  await privileged(async (db) => {
    for (const p of people) {
      await setDoc(doc(db, "userAccess", p.id), {
        role: p.role, accountState: "Active", email: p.email,
        team: p.team, managerId: p.managerId ?? null,
        updatedAt: at, updatedBy: "synthetic",
      });
      await setDoc(doc(db, authorityPath(p.id)), { ...p });
      await setDoc(doc(db, sessionPath(p.id)), { uid: p.id, epoch: 7, active: true });
    }
    await setDoc(doc(db, canonicalPath("leaveRequests")), { version: "v1", items: [leave] });
    await setDoc(doc(db, canonicalPath("documents")), { version: "v1", items: [file] });
    await setDoc(doc(db, canonicalPath("compensation")), { version: "v1", items: [pay] });
  });
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "momentum-hr-canonical-read-emulator-review",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});
after(async () => { await env?.cleanup(); });

type Hooks = { afterCanonical?: () => Promise<void>; afterVersion?: () => Promise<void> };
function transport(actorUid: string, hooks: Hooks = {}): HrCanonicalReadTransport {
  return {
    readAuthority: () => privileged(async (db): Promise<HrCanonicalAuthority> => {
      const [session, actorAccess, actorPerson, targetAccess, targetPerson] = await Promise.all([
        getDoc(doc(db, sessionPath(actorUid))),
        getDoc(doc(db, "userAccess", actorUid)),
        getDoc(doc(db, authorityPath(actorUid))),
        getDoc(doc(db, "userAccess", "rep")),
        getDoc(doc(db, authorityPath("rep"))),
      ]);
      return {
        authenticatedUid: actorUid,
        session: session.exists() ? session.data() as HrCanonicalAuthority["session"] : null,
        actorAccess: actorAccess.exists()
          ? { uid: actorUid, ...actorAccess.data() } as UserAccessRecord : null,
        actorDirectory: actorPerson.exists() ? actorPerson.data() as WorkspaceUser : null,
        targetAccess: targetAccess.exists()
          ? { uid: "rep", ...targetAccess.data() } as UserAccessRecord : null,
        targetDirectory: targetPerson.exists() ? targetPerson.data() as WorkspaceUser : null,
      };
    }),
    readCanonical: async (path) => {
      const snapshot = await privileged((db) => getDoc(doc(db, path)));
      await hooks.afterCanonical?.();
      return snapshot.exists()
        ? { path, version: snapshot.data().version as string, items: snapshot.data().items }
        : null;
    },
    readCanonicalVersion: async (path) => {
      const snapshot = await privileged((db) => getDoc(doc(db, path)));
      await hooks.afterVersion?.();
      return snapshot.exists() && typeof snapshot.data().version === "string"
        ? snapshot.data().version as string : null;
    },
  };
}
async function mutate(path: string, patch: Record<string, unknown>) {
  await privileged(async (db) => { await setDoc(doc(db, path), patch, { merge: true }); });
}

test("browser roles and unauthenticated sessions cannot read or mutate candidate canonical data", async () => {
  for (const uid of ["admin", "manager", "rep", "customer", "marketing", "separated"]) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, canonicalPath("leaveRequests"))));
    await assertFails(getDoc(doc(db, canonicalPath("compensation"))));
    await assertFails(getDoc(doc(db, authorityPath("rep"))));
    await assertFails(getDoc(doc(db, sessionPath("rep"))));
    await assertFails(setDoc(doc(db, canonicalPath("leaveRequests")), { version: "forged" }));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), canonicalPath("leaveRequests"))));
});

test("privileged synthetic read projects self, manager and Administrator scopes without leaking evidence", async () => {
  const self = await executeHrCanonicalReadReview(command(), transport("rep"), true);
  assert.equal(self.ok, true);
  assert.ok(!JSON.stringify(self).includes("PRIVATE"));
  const manager = await executeHrCanonicalReadReview(command(), transport("manager"), true);
  assert.equal(manager.ok, true);
  assert.deepEqual(await executeHrCanonicalReadReview(command("documents"), transport("manager"), true),
    { ok: false, reason: "field-restricted" });
  const ownFile = await executeHrCanonicalReadReview(command("documents"), transport("rep"), true);
  assert.equal(ownFile.ok, true);
  assert.ok(!JSON.stringify(ownFile).includes("PRIVATE-DOCUMENT-LOCATION"));
  const adminPay = await executeHrCanonicalReadReview(command("compensation"), transport("admin"), true);
  assert.equal(adminPay.ok, true);
  assert.ok(!JSON.stringify(adminPay).includes("SECRET"));
  for (const uid of ["rep", "manager", "customer", "marketing"]) {
    assert.equal((await executeHrCanonicalReadReview(command("compensation"), transport(uid), true)).ok, false);
  }
});

test("midflight suspension and manager reassignment reject the previously authorized response", async () => {
  const revoked = await executeHrCanonicalReadReview(command(), transport("manager", {
    afterCanonical: () => mutate("userAccess/manager", { accountState: "Suspended", updatedAt: "v2" }),
  }), true);
  assert.deepEqual(revoked, { ok: false, reason: "authority-changed" });
  await mutate("userAccess/manager", { accountState: "Active", updatedAt: at });

  const reassigned = await executeHrCanonicalReadReview(command(), transport("manager", {
    afterCanonical: async () => {
      await mutate("userAccess/rep", { managerId: "admin", updatedAt: "v3" });
      await mutate(authorityPath("rep"), { managerId: "admin" });
    },
  }), true);
  assert.deepEqual(reassigned, { ok: false, reason: "authority-changed" });
});

test("replaced canonical revision and revocation during version check fail closed", async () => {
  const changed = await executeHrCanonicalReadReview(command(), transport("rep", {
    afterCanonical: () => mutate(canonicalPath("leaveRequests"), { version: "v2" }),
  }), true);
  assert.deepEqual(changed, { ok: false, reason: "canonical-changed" });

  const revoked = await executeHrCanonicalReadReview(command(), transport("rep", {
    afterVersion: () => mutate(sessionPath("rep"), { epoch: 8, active: false }),
  }), true);
  assert.deepEqual(revoked, { ok: false, reason: "authority-changed" });
});

test("disabled mode performs zero reads even when transport would throw", async () => {
  const noTransport: HrCanonicalReadTransport = {
    readAuthority: async () => { throw Error("should not read"); },
    readCanonical: async () => { throw Error("should not read"); },
    readCanonicalVersion: async () => { throw Error("should not read"); },
  };
  assert.deepEqual(await executeHrCanonicalReadReview(command(), noTransport),
    { ok: false, reason: "disabled" });
});
