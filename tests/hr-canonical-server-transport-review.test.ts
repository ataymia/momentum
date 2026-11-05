import test from "node:test";
import assert from "node:assert/strict";
import {
  createHrCanonicalServerTransportReview,
  type HrAdminFirestoreShape, type HrAdminSnapshotShape,
} from "../lib/hr-canonical-server-transport-review";
import { executeHrCanonicalTrustedIdentityReview } from
  "../lib/hr-canonical-trusted-identity-review";
import { executeHrCanonicalPinnedReadReview } from
  "../lib/hr-canonical-pinned-snapshot";
import type { HrCanonicalReadCommand } from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";

const projectId = "momentum-hr-server-transport-review";
const now = Math.floor(Date.parse("2026-11-04T22:00:00.000Z") / 1000);
const token = "synthetic.header.signature";
const command = (field: HrCanonicalReadCommand["field"] = "leaveRequests"):
  HrCanonicalReadCommand => ({ ownerUid: "rep", field, expectedSessionEpoch: 7 });
const canonical = (field: HrCanonicalReadCommand["field"]) =>
  hrCanonicalReviewPath("rep", field);
const authorityPath = (uid: string) => "hrCanonicalReadAuthorityReview/" + uid;
const sessionPath = (uid: string) => "hrCanonicalReadSessionReview/" + uid;
const clone = <T>(value: T): T => structuredClone(value);
const roles = {
  rep: "Sales Representative",
  manager: "Sales Manager",
  admin: "Administrator",
  marketing: "Marketing",
  customer: "Customer",
} as const;

function harness() {
  const records = new Map<string, Record<string, unknown>>();
  for (const [uid, role] of Object.entries(roles)) {
    const managerId = uid === "rep" ? "manager" : null;
    records.set("userAccess/" + uid, {
      uid, role, accountState: "Active", managerId,
      email: uid + "@example.test", team: "Synthetic",
      updatedAt: "synthetic-v1", updatedBy: "synthetic",
    });
    records.set(authorityPath(uid), {
      id: uid, role, name: "Synthetic " + uid, managerId,
      employmentStatus: "Active",
    });
    records.set(sessionPath(uid), { uid, epoch: 7, active: true });
  }
  records.set(canonical("leaveRequests"), {
    version: "v1", items: [{
      id: "leave-1", userId: "rep", status: "Submitted",
      requestedHours: 4, reason: "SECRET-HR-REASON",
    }],
  });
  records.set(canonical("compensation"), {
    version: "v1", items: [{
      id: "pay-1", userId: "rep", basis: "Hourly", rate: 23,
      privateNotes: "SECRET-PAY-NOTES",
    }],
  });
  records.set(canonical("documents"), {
    version: "v1", items: [{
      id: "doc-1", userId: "rep", title: "Synthetic document",
      evidence: "SECRET-DOCUMENT",
    }],
  });

  let reads = 0;
  let transactions = 0;
  let verifierCalls = 0;
  let afterTransaction: (() => void) | undefined;
  const snapshot = (data: Record<string, unknown> | undefined): HrAdminSnapshotShape => ({
    exists: Boolean(data), data: () => data ? clone(data) : undefined,
  });
  const db: HrAdminFirestoreShape = {
    projectId,
    doc: (path) => ({
      path,
      get: async () => {
        reads += 1;
        return snapshot(records.get(path));
      },
    }),
    runTransaction: async <T>(callback: (tx: {
      get: (ref: { path: string }) => Promise<HrAdminSnapshotShape>;
    }) => Promise<T>, options: { readOnly: true }): Promise<T> => {
      assert.deepEqual(options, { readOnly: true });
      transactions += 1;
      const pinned = new Map([...records].map(([path, value]) => [path, clone(value)]));
      const result = await callback({
        get: async (ref) => {
          reads += 1;
          return snapshot(pinned.get(ref.path));
        },
      });
      afterTransaction?.();
      return result;
    },
  };
  const claims = (uid: string) => ({
    uid, sub: uid, aud: projectId,
    iss: "https://securetoken.google.com/" + projectId,
    iat: now - 300, auth_time: now - 400, exp: now + 1800,
  });
  const factory = (c = command(), enabled = true, host = "127.0.0.1:8080") =>
    createHrCanonicalServerTransportReview({
      projectId, emulatorHost: host, firestore: db, command: c,
    }, enabled);
  const run = async (uid: keyof typeof roles, c = command()) => {
    const make = factory(c);
    assert.ok(make);
    return executeHrCanonicalTrustedIdentityReview(c, token, {
      projectId, nowSeconds: () => now,
      verifyIdToken: async (_token, revoked) => {
        assert.equal(revoked, true);
        verifierCalls += 1;
        return claims(uid);
      },
      createPinnedTransport: make,
    }, true);
  };
  return {
    db, records, factory, run,
    setAfterTransaction: (callback: () => void) => { afterTransaction = callback; },
    counts: () => ({ reads, transactions, verifierCalls }),
  };
}

test("default-disabled factory and malformed configuration fail closed with zero IO", () => {
  const h = harness();
  assert.equal(h.factory(command(), false), null);
  assert.equal(h.factory(command(), true, "production.example.com:443"), null);
  assert.equal(h.factory(command(), true, "localhost:99999"), null);
  // A valid factory can be constructed without reading the database.
  assert.ok(h.factory());
  assert.deepEqual(h.counts(), { reads: 0, transactions: 0, verifierCalls: 0 });
});

test("rejects project mismatch, production-shaped IDs and malformed target fields", () => {
  const h = harness();
  h.db.projectId = "different-project";
  assert.equal(h.factory(), null);
  h.db.projectId = projectId;
  const invalid = { ...command(), field: "../compensation" } as unknown as HrCanonicalReadCommand;
  assert.equal(h.factory(invalid), null);
  assert.equal(h.factory({ ...command(), expectedSessionEpoch: -1 }), null);
  assert.deepEqual(h.counts(), { reads: 0, transactions: 0, verifierCalls: 0 });
});

test("verified employee, direct-report manager and Admin see only scoped projections", async () => {
  for (const uid of ["rep", "manager", "admin"] as const) {
    const h = harness();
    const value = await h.run(uid);
    assert.equal(value.ok, true, uid);
    assert.ok(!JSON.stringify(value).includes("SECRET-HR-REASON"));
    assert.equal(h.counts().transactions, 1);
    assert.equal(h.counts().verifierCalls, 2);
  }
  const h = harness();
  const adminPay = await h.run("admin", command("compensation"));
  assert.equal(adminPay.ok, true);
  assert.ok(!JSON.stringify(adminPay).includes("SECRET-PAY-NOTES"));
});

test("unauthorized roles and manager private fields deny before canonical retrieval", async () => {
  for (const [uid, field] of [
    ["marketing", "leaveRequests"], ["customer", "leaveRequests"],
    ["manager", "compensation"], ["manager", "documents"],
    ["rep", "compensation"],
  ] as const) {
    const h = harness();
    const value = await h.run(uid, command(field));
    assert.equal(value.ok, false, uid + ":" + field);
    assert.equal(h.counts().reads, 5, "authority reads only, no canonical read");
  }
});

test("verified UID binds to actor path; forged record UID and session deny", async () => {
  const h = harness();
  h.records.set("userAccess/rep", {
    ...h.records.get("userAccess/rep"), uid: "admin",
  });
  assert.deepEqual(await h.run("rep"), { ok: false, reason: "session-revoked" });
  assert.equal(h.counts().reads, 5);
  const other = harness();
  other.records.set(sessionPath("rep"), { uid: "admin", epoch: 7, active: true });
  assert.deepEqual(await other.run("rep"), { ok: false, reason: "session-revoked" });
  assert.equal(other.counts().reads, 5);
});

test("read transport rejects arbitrary canonical paths without database IO", async () => {
  const h = harness();
  const make = h.factory();
  assert.ok(make);
  const t = make("rep");
  await assert.rejects(t.withReadOnlySnapshot(async (reader) => {
    await reader.readCanonical("hrCanonicalReview/admin/fields/compensation");
  }));
  assert.equal(h.counts().reads, 0);
  assert.equal(h.counts().transactions, 1);
  assert.throws(() => make("../admin"));
});

test("post-transaction revocation and reassignment deny stale projections", async () => {
  const revoked = harness();
  revoked.setAfterTransaction(() => {
    revoked.records.set(sessionPath("rep"), { uid: "rep", epoch: 8, active: false });
  });
  assert.deepEqual(await revoked.run("rep"), {
    ok: false, reason: "authority-changed",
  });
  assert.equal(revoked.counts().transactions, 1);

  const reassigned = harness();
  reassigned.setAfterTransaction(() => {
    reassigned.records.set("userAccess/rep", {
      ...reassigned.records.get("userAccess/rep"), managerId: "admin",
    });
    reassigned.records.set(authorityPath("rep"), {
      ...reassigned.records.get(authorityPath("rep")), managerId: "admin",
    });
  });
  assert.deepEqual(await reassigned.run("manager"), {
    ok: false, reason: "authority-changed",
  });
  assert.equal(reassigned.counts().transactions, 1);
});

test("canonical version corruption denies without exposing private records", async () => {
  const h = harness();
  h.records.set(canonical("leaveRequests"), {
    version: 42, items: [{ id: "leave-1", userId: "rep", reason: "SECRET" }],
  });
  const value = await h.run("rep");
  assert.deepEqual(value, { ok: false, reason: "canonical-changed" });
  assert.ok(!JSON.stringify(value).includes("SECRET"));
});

test("factory returns read-only pinned transport without a callable endpoint", async () => {
  const h = harness();
  const make = h.factory();
  assert.ok(make);
  const transport = make("rep");
  assert.equal(typeof transport.withReadOnlySnapshot, "function");
  assert.equal(typeof transport.readAuthority, "function");
  assert.equal("write" in transport, false);
  const result = await executeHrCanonicalPinnedReadReview(command(), transport, true);
  assert.equal(result.ok, true);
  assert.equal(h.counts().transactions, 1);
});
