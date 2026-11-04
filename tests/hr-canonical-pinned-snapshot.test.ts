import test from "node:test";
import assert from "node:assert/strict";
import {
  executeHrCanonicalPinnedReadReview, HrCanonicalSnapshotConflict,
  type HrCanonicalPinnedReader, type HrCanonicalPinnedTransport,
} from "../lib/hr-canonical-pinned-snapshot";
import {
  type HrCanonicalAuthority, type HrCanonicalDocument, type HrCanonicalReadCommand,
} from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceUser } from "../lib/types";

const at = "2026-11-04T21:00:00.000Z";
const person = (id: string, role: WorkspaceUser["role"], managerId?: string): WorkspaceUser => ({
  id, role, managerId, name: id, email: id + "@example.test", title: "Synthetic",
  team: "Sales", initials: "SY", accent: "#000000", employmentStatus: "Active",
} as WorkspaceUser);
const access = (user: WorkspaceUser): UserAccessRecord => ({
  uid: user.id, role: user.role, email: user.email, team: user.team,
  managerId: user.managerId, accountState: "Active", updatedAt: at, updatedBy: "synthetic",
});
const rep = person("rep", "Sales Representative", "manager");
const manager = person("manager", "Sales Manager");
const admin = person("admin", "Administrator");
const command: HrCanonicalReadCommand = { ownerUid: "rep", field: "leaveRequests", expectedSessionEpoch: 7 };
const canonical: HrCanonicalDocument = {
  path: hrCanonicalReviewPath("rep", "leaveRequests"), version: "revision-1",
  items: [{ id: "leave-1", userId: "rep", status: "Submitted", requestedHours: 4,
    reason: "PRIVATE-REASON", startDate: "2026-11-10", endDate: "2026-11-10" }],
};
const copy = <T>(value: T): T => structuredClone(value);
function authority(actor: WorkspaceUser = rep): HrCanonicalAuthority {
  return {
    authenticatedUid: actor.id, session: { uid: actor.id, epoch: 7, active: true },
    actorAccess: access(actor), actorDirectory: copy(actor),
    targetAccess: access(rep), targetDirectory: copy(rep),
  };
}
type State = { authority: HrCanonicalAuthority; document: HrCanonicalDocument };
function harness(
  actor: WorkspaceUser = rep,
  hooks: { afterSnapshot?: (state: State) => void; onRead?: (state: State) => void;
    conflicts?: number; revision?: string | null } = {},
) {
  const state: State = { authority: authority(actor), document: copy(canonical) };
  let attempts = 0;
  let canonicalReads = 0;
  const transport: HrCanonicalPinnedTransport = {
    withReadOnlySnapshot: async (callback) => {
      attempts += 1;
      if (attempts <= (hooks.conflicts ?? 0)) throw new HrCanonicalSnapshotConflict();
      // A synthetic immutable snapshot models a provider's transaction read view.
      const snapshot = copy(state);
      const reader: HrCanonicalPinnedReader = {
        readAuthority: async () => copy(snapshot.authority),
        readCanonical: async (path) => {
          canonicalReads += 1;
          assert.equal(path, canonical.path, "path must be computed by server policy");
          hooks.onRead?.(state);
          return copy(snapshot.document);
        },
        readCanonicalVersion: async () =>
          hooks.revision === undefined ? snapshot.document.version : hooks.revision,
      };
      const result = await callback(reader);
      hooks.afterSnapshot?.(state);
      return result;
    },
    readAuthority: async () => copy(state.authority),
  };
  return { state, transport, attempts: () => attempts, canonicalReads: () => canonicalReads };
}

test("disabled mode does not touch injected transport", async () => {
  const result = await executeHrCanonicalPinnedReadReview(command, {
    withReadOnlySnapshot: async () => { throw Error("not called"); },
    readAuthority: async () => { throw Error("not called"); },
  });
  assert.deepEqual(result, { ok: false, reason: "disabled" });
});

test("pinned self and direct manager projections never return confidential reason", async () => {
  for (const actor of [rep, manager, admin]) {
    const h = harness(actor);
    const result = await executeHrCanonicalPinnedReadReview(command, h.transport, true);
    assert.equal(result.ok, true);
    assert.ok(!JSON.stringify(result).includes("PRIVATE-REASON"));
    assert.equal(h.attempts(), 1);
  }
});

test("manager access requires both authoritative direct-report assignments", async () => {
  const h = harness(manager);
  h.state.authority.targetAccess = { ...h.state.authority.targetAccess!, managerId: "other" };
  const result = await executeHrCanonicalPinnedReadReview(command, h.transport, true);
  assert.deepEqual(result, { ok: false, reason: "field-restricted" });
  assert.equal(h.canonicalReads(), 0);
});

test("revocation during snapshot and immediately after snapshot denies all rows", async () => {
  const during = harness(manager, { onRead: (state) => {
    state.authority.actorAccess = { ...state.authority.actorAccess!, accountState: "Suspended" };
  } });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, during.transport, true),
    { ok: false, reason: "authority-changed" });

  const after = harness(rep, { afterSnapshot: (state) => {
    state.authority.session = { uid: "rep", epoch: 8, active: false };
  } });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, after.transport, true),
    { ok: false, reason: "authority-changed" });
  assert.equal(after.attempts(), 1, "never retry after revocation");
});

test("manager reassignment during snapshot denies and does not retry", async () => {
  const h = harness(manager, { onRead: (state) => {
    state.authority.targetAccess = { ...state.authority.targetAccess!, managerId: "other" };
    state.authority.targetDirectory = { ...state.authority.targetDirectory!, managerId: "other" };
  } });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, h.transport, true),
    { ok: false, reason: "authority-changed" });
  assert.equal(h.attempts(), 1);
});

test("transaction contention retries the entire read once, then succeeds", async () => {
  const h = harness(rep, { conflicts: 1 });
  assert.equal((await executeHrCanonicalPinnedReadReview(command, h.transport, true)).ok, true);
  assert.equal(h.attempts(), 2);
  assert.equal(h.canonicalReads(), 1);
});

test("persistent contention fails closed after bounded retry", async () => {
  const h = harness(rep, { conflicts: 2 });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, h.transport, true),
    { ok: false, reason: "unavailable" });
  assert.equal(h.attempts(), 2);
  assert.equal(h.canonicalReads(), 0);
});

test("snapshot revision mismatch fails closed without retry", async () => {
  const h = harness(rep, { revision: "revision-2" });
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, h.transport, true),
    { ok: false, reason: "canonical-changed" });
  assert.equal(h.attempts(), 1);
});

test("invalid command, suspended actor and restricted compensation never read canonical payload", async () => {
  const h = harness(rep);
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(
    { ...command, ownerUid: "../other" }, h.transport, true),
    { ok: false, reason: "invalid-command" });
  assert.equal(h.canonicalReads(), 0);
  h.state.authority.actorAccess = { ...h.state.authority.actorAccess!, accountState: "Suspended" };
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, h.transport, true),
    { ok: false, reason: "actor-not-authorized" });
  assert.equal(h.canonicalReads(), 0);
  const pay = harness(rep);
  const payResult = await executeHrCanonicalPinnedReadReview(
    { ...command, field: "compensation" }, pay.transport, true);
  assert.deepEqual(payResult, { ok: false, reason: "field-restricted" });
  assert.equal(pay.canonicalReads(), 0);
});

test("unexpected transport failure and missing snapshot API fail closed", async () => {
  const h = harness(rep);
  const transport: HrCanonicalPinnedTransport = {
    ...h.transport,
    withReadOnlySnapshot: async () => { throw Error("network unavailable"); },
  };
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, transport, true),
    { ok: false, reason: "unavailable" });
  const malformed = { readAuthority: h.transport.readAuthority } as HrCanonicalPinnedTransport;
  assert.deepEqual(await executeHrCanonicalPinnedReadReview(command, malformed, true),
    { ok: false, reason: "unavailable" });
});
