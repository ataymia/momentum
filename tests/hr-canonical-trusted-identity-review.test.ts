import test from "node:test";
import assert from "node:assert/strict";
import {
  executeHrCanonicalTrustedIdentityReview,
  type HrTrustedIdentityReviewDependencies,
} from "../lib/hr-canonical-trusted-identity-review";
import {
  type HrCanonicalAuthority, type HrCanonicalDocument, type HrCanonicalReadCommand,
} from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";
import type { HrCanonicalPinnedTransport } from "../lib/hr-canonical-pinned-snapshot";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceUser } from "../lib/types";

const projectId = "momentum-hr-review";
const now = Math.floor(Date.parse("2026-11-04T22:00:00.000Z") / 1000);
const token = "synthetic.header.signature"; // Fake token; never used outside injected test verifier.
const person = (id: string, role: WorkspaceUser["role"], managerId?: string): WorkspaceUser => ({
  id, role, managerId, name: "Synthetic " + id, email: id + "@example.test",
  title: "Synthetic", team: "Sales", initials: "SY", accent: "#000000",
  employmentStatus: "Active",
} as WorkspaceUser);
const rep = person("rep", "Sales Representative", "manager");
const manager = person("manager", "Sales Manager");
const admin = person("admin", "Administrator");
const access = (p: WorkspaceUser): UserAccessRecord => ({
  uid: p.id, role: p.role, email: p.email, team: p.team, managerId: p.managerId,
  accountState: "Active", updatedAt: "2026-11-04T22:00:00.000Z", updatedBy: "synthetic",
});
const command = (field: HrCanonicalReadCommand["field"] = "leaveRequests"): HrCanonicalReadCommand =>
  ({ ownerUid: "rep", field, expectedSessionEpoch: 7 });
const document: HrCanonicalDocument = {
  path: hrCanonicalReviewPath("rep", "leaveRequests"), version: "v1",
  items: [{ id: "leave-1", userId: "rep", status: "Submitted",
    reason: "SECRET-REASON", requestedHours: 4 }],
};
const clone = <T>(value: T): T => structuredClone(value);
function authority(actor: WorkspaceUser = rep): HrCanonicalAuthority {
  return {
    authenticatedUid: actor.id,
    session: { uid: actor.id, epoch: 7, active: true },
    actorAccess: access(actor), actorDirectory: clone(actor),
    targetAccess: access(rep), targetDirectory: clone(rep),
  };
}
const claims = (uid = "rep"): Record<string, unknown> => ({
  uid, sub: uid, aud: projectId, iss: "https://securetoken.google.com/" + projectId,
  iat: now - 300, auth_time: now - 400, exp: now + 1800,
});
type Hooks = {
  verify?: (count: number, state: State) => Promise<unknown> | unknown;
  afterSnapshot?: (state: State) => void;
  afterRead?: (state: State) => void;
  beforeFinalAuthority?: (state: State) => void;
  overrideUid?: string;
};
type State = { authority: HrCanonicalAuthority; document: HrCanonicalDocument };
function harness(actor: WorkspaceUser = rep, hooks: Hooks = {}) {
  const state: State = { authority: authority(actor), document: clone(document) };
  let verifications = 0;
  let factories = 0;
  let canonicalReads = 0;
  let authorityReads = 0;
  const transport: HrCanonicalPinnedTransport = {
    withReadOnlySnapshot: async (callback) => {
      const snapshot = clone(state);
      const value = await callback({
        readAuthority: async () => clone(snapshot.authority),
        readCanonical: async (path) => {
          canonicalReads += 1;
          assert.equal(path, document.path, "only server-computed path allowed");
          hooks.afterRead?.(state);
          return clone(snapshot.document);
        },
        readCanonicalVersion: async () => snapshot.document.version,
      });
      hooks.afterSnapshot?.(state);
      return value;
    },
    readAuthority: async () => {
      authorityReads += 1;
      if (authorityReads === 2) hooks.beforeFinalAuthority?.(state);
      return clone(state.authority);
    },
  };
  const deps: HrTrustedIdentityReviewDependencies = {
    projectId,
    nowSeconds: () => now,
    verifyIdToken: async (_raw, checkRevoked) => {
      assert.equal(checkRevoked, true, "never bypass Admin SDK revocation check");
      verifications += 1;
      return hooks.verify ? hooks.verify(verifications, state) : claims(actor.id);
    },
    createPinnedTransport: (uid) => {
      factories += 1;
      assert.equal(uid, hooks.overrideUid ?? actor.id);
      return transport;
    },
  };
  return {
    deps, state, transport,
    counts: () => ({ verifications, factories, canonicalReads, authorityReads }),
  };
}

test("default-disabled mode performs no verifier, factory or confidential IO", async () => {
  const h = harness();
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(command(), token, h.deps),
    { ok: false, reason: "disabled" });
  assert.deepEqual(h.counts(), {
    verifications: 0, factories: 0, canonicalReads: 0, authorityReads: 0,
  });
});

test("verified employee gets only own allowlisted HR fields and two revocation checks", async () => {
  const h = harness();
  const result = await executeHrCanonicalTrustedIdentityReview(command(), token, h.deps, true);
  assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes("SECRET-REASON"));
  assert.deepEqual(h.counts(), {
    verifications: 2, factories: 1, canonicalReads: 1, authorityReads: 2,
  });
});

test("manager gets direct-report leave, but neither private documents nor compensation", async () => {
  const h = harness(manager);
  assert.equal((await executeHrCanonicalTrustedIdentityReview(command(), token, h.deps, true)).ok, true);
  for (const field of ["documents", "compensation"] as const) {
    const blocked = harness(manager);
    assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
      command(field), token, blocked.deps, true),
    { ok: false, reason: "field-restricted" });
    assert.equal(blocked.counts().canonicalReads, 0);
  }
});

test("Admin compensation access uses server role, never client role claims", async () => {
  const h = harness(admin);
  h.state.document = {
    path: hrCanonicalReviewPath("rep", "compensation"), version: "v1",
    items: [{ id: "pay-1", userId: "rep", basis: "Hourly", rate: 23,
      privateNotes: "SECRET-PAY-NOTE" }],
  };
  const result = await executeHrCanonicalTrustedIdentityReview(
    command("compensation"), token, h.deps, true);
  assert.equal(result.ok, true);
  assert.ok(!JSON.stringify(result).includes("SECRET-PAY-NOTE"));
  const spoof = harness(rep, { verify: () => ({ ...claims("rep"), role: "Administrator" }) });
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command("compensation"), token, spoof.deps, true),
  { ok: false, reason: "field-restricted" });
  assert.equal(spoof.counts().canonicalReads, 0);
});

test("malformed token strings reject before verifier or transport construction", async () => {
  for (const invalid of [null, 7, "", "not-a-jwt", "a.b", "a.b.c.d", "a. b.c",
    "a".repeat(8193) + ".b.c"]) {
    const h = harness();
    assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
      command(), invalid, h.deps, true), { ok: false, reason: "session-revoked" });
    assert.equal(h.counts().verifications, 0);
    assert.equal(h.counts().factories, 0);
  }
});

test("malformed, cross-project, expired and forged decoded claims all fail closed", async () => {
  const invalid: unknown[] = [
    null, [], {}, { ...claims(), uid: "../other" },
    { ...claims(), uid: "other" }, { ...claims(), sub: "other" },
    { ...claims(), aud: "other-project" },
    { ...claims(), iss: "https://securetoken.google.com/other-project" },
    { ...claims(), exp: now }, { ...claims(), iat: now + 61 },
    { ...claims(), auth_time: now }, { ...claims(), auth_time: 0 },
    { ...claims(), exp: "later" }, { ...claims(), iat: NaN },
  ];
  for (const value of invalid) {
    const h = harness(rep, { verify: () => value });
    assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
      command(), token, h.deps, true), { ok: false, reason: "session-revoked" });
    assert.equal(h.counts().factories, 0);
  }
});

test("verified UID must match server-owned actor/session/directory before canonical reads", async () => {
  const mismatches: Array<(a: HrCanonicalAuthority) => void> = [
    (a) => { a.authenticatedUid = "other"; },
    (a) => { a.session = { uid: "other", epoch: 7, active: true }; },
    (a) => { a.actorAccess = { ...a.actorAccess!, uid: "other" }; },
    (a) => { a.actorDirectory = { ...a.actorDirectory!, id: "other" }; },
  ];
  for (const change of mismatches) {
    const h = harness();
    change(h.state.authority);
    assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
      command(), token, h.deps, true), { ok: false, reason: "session-revoked" });
    assert.equal(h.counts().canonicalReads, 0);
  }
});

test("verified different user cannot impersonate the target employee", async () => {
  const h = harness(rep, {
    verify: () => claims("other"),
    overrideUid: "other",
  });
  assert.equal((await executeHrCanonicalTrustedIdentityReview(
    command(), token, h.deps, true)).ok, false);
  assert.equal(h.counts().canonicalReads, 0);
});

test("token revocation after snapshot prevents releasing previously allowed HR records", async () => {
  const h = harness(rep, {
    verify: (count) => {
      if (count === 2) throw Error("auth/id-token-revoked");
      return claims();
    },
  });
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command(), token, h.deps, true), { ok: false, reason: "unavailable" });
  assert.equal(h.counts().canonicalReads, 1);
  assert.equal(h.counts().verifications, 2);
});

test("changed verified identity on second check denies instead of returning HR data", async () => {
  const h = harness(rep, {
    verify: (count) => count === 1 ? claims() : { ...claims(), iat: now - 200 },
  });
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command(), token, h.deps, true), { ok: false, reason: "session-revoked" });
});

test("post-snapshot session epoch change and final manager reassignment fail closed", async () => {
  const revoked = harness(rep, {
    afterSnapshot: (s) => { s.authority.session = { uid: "rep", epoch: 8, active: false }; },
  });
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command(), token, revoked.deps, true), { ok: false, reason: "authority-changed" });
  assert.equal(revoked.counts().verifications, 1, "no retry after revoked authority");

  const reassigned = harness(manager, {
    beforeFinalAuthority: (s) => {
      s.authority.targetAccess = { ...s.authority.targetAccess!, managerId: "other" };
      s.authority.targetDirectory = { ...s.authority.targetDirectory!, managerId: "other" };
    },
  });
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command(), token, reassigned.deps, true), { ok: false, reason: "field-restricted" });
  assert.equal(reassigned.counts().verifications, 2);
});

test("bad server config and verifier failure never build a transport or expose data", async () => {
  const h = harness();
  assert.deepEqual(await executeHrCanonicalTrustedIdentityReview(
    command(), token, { ...h.deps, projectId: "../other" }, true),
  { ok: false, reason: "unavailable" });
  assert.equal(h.counts().verifications, 0);
  const denied = harness(rep, { verify: () => { throw Error("secret SDK detail"); } });
  const result = await executeHrCanonicalTrustedIdentityReview(
    command(), token, denied.deps, true);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
  assert.equal(denied.counts().factories, 0);
});
