import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeHrCanonicalRead, evaluateHrCanonicalRead, executeHrCanonicalReadReview,
  type HrCanonicalAuthority, type HrCanonicalReadCommand, type HrCanonicalDocument,
} from "../lib/hr-canonical-read-contract";
import { hrCanonicalReviewPath } from "../lib/hr-canonical-storage-review";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceUser } from "../lib/types";

const at = "2026-11-04T19:00:00.000Z";
const person = (id: string, role: WorkspaceUser["role"], managerId?: string): WorkspaceUser => ({
  id, role, managerId, name: id, email: id + "@example.test", title: "Synthetic",
  team: "Sales", initials: "SY", accent: "#000000", employmentStatus: "Active",
} as WorkspaceUser);
const access = (user: WorkspaceUser, accountState: UserAccessRecord["accountState"] = "Active"): UserAccessRecord => ({
  uid: user.id, role: user.role, email: user.email, team: user.team, managerId: user.managerId,
  accountState, updatedAt: at, updatedBy: "synthetic",
});
const admin = person("admin", "Administrator");
const manager = person("manager", "Sales Manager");
const rep = person("rep", "Sales Representative", "manager");
const stranger = person("stranger", "Sales Representative");
const marketer = person("marketer", "Marketing");
const customer = person("customer", "Customer");
const cmd = (field: HrCanonicalReadCommand["field"] = "leaveRequests"): HrCanonicalReadCommand => ({
  ownerUid: "rep", field, expectedSessionEpoch: 7,
});
const doc = (field: HrCanonicalReadCommand["field"], items: unknown[]): HrCanonicalDocument => ({
  path: hrCanonicalReviewPath("rep", field), version: "canonical-v1", items,
});
const leave = { id: "leave-1", userId: "rep", status: "Submitted",
  startDate: "2026-11-10", endDate: "2026-11-10", requestedHours: 4,
  reason: "CONFIDENTIAL SHOULD NEVER RETURN", reviewerId: "private-reviewer" };
const document = { id: "doc-1", userId: "rep", title: "Synthetic file", status: "Available",
  category: "Tax", version: 1, fileName: "SECRET-PATH.pdf",
  verification: { secret: "CONFIDENTIAL" } };
const compensation = { id: "pay-1", userId: "rep", basis: "Hourly", rate: 23,
  effectiveDate: "2026-01-01", status: "Active", secret: "NOT RETURNED" };

function authority(actor: WorkspaceUser = rep, target: WorkspaceUser = rep): HrCanonicalAuthority {
  return {
    authenticatedUid: actor.id, session: { uid: actor.id, epoch: 7, active: true },
    actorAccess: access(actor), actorDirectory: actor,
    targetAccess: access(target), targetDirectory: target,
  };
}

test("employee self-service receives narrow summaries, not reason or document evidence", () => {
  const self = authority();
  const leaveResult = evaluateHrCanonicalRead(cmd(), self, doc("leaveRequests", [leave]));
  assert.equal(leaveResult.ok, true);
  if (leaveResult.ok) {
    assert.deepEqual(leaveResult.records, [{
      id: "leave-1", startDate: "2026-11-10", endDate: "2026-11-10",
      requestedHours: 4, status: "Submitted",
    }]);
    assert.ok(!JSON.stringify(leaveResult).includes("CONFIDENTIAL"));
  }
  const fileResult = evaluateHrCanonicalRead(cmd("documents"), self, doc("documents", [document]));
  assert.equal(fileResult.ok, true);
  if (fileResult.ok) {
    assert.deepEqual(fileResult.records, [{
      id: "doc-1", title: "Synthetic file", category: "Tax", version: 1, status: "Available",
    }]);
    assert.ok(!JSON.stringify(fileResult).includes("SECRET"));
  }
  assert.equal(evaluateHrCanonicalRead(cmd("compensation"), self, doc("compensation", [compensation])).ok, false);
});

test("Administrator alone receives compensation; Marketing, customer and unrelated employees are denied", () => {
  const adminResult = evaluateHrCanonicalRead(cmd("compensation"), authority(admin), doc("compensation", [compensation]));
  assert.equal(adminResult.ok, true);
  if (adminResult.ok) assert.deepEqual(adminResult.records, [{
    id: "pay-1", basis: "Hourly", rate: 23, effectiveDate: "2026-01-01", status: "Active",
  }]);
  for (const actor of [manager, stranger, marketer, customer]) {
    assert.equal(evaluateHrCanonicalRead(cmd("compensation"), authority(actor), doc("compensation", [compensation])).ok, false);
    assert.equal(evaluateHrCanonicalRead(cmd("privateProfiles"), authority(actor),
      doc("privateProfiles", [{ userId: "rep", address: "PRIVATE" }])).ok, false);
  }
});

test("manager must have matching live direct-report relationship; no private files or compensation", () => {
  const managed = authority(manager);
  assert.equal(evaluateHrCanonicalRead(cmd(), managed, doc("leaveRequests", [leave])).ok, true);
  assert.equal(evaluateHrCanonicalRead(cmd("training"), managed,
    doc("training", [{ id: "course-1", userId: "rep", courseId: "c", status: "Assigned" }])).ok, true);
  assert.equal(evaluateHrCanonicalRead(cmd("documents"), managed, doc("documents", [document])).ok, false);
  assert.equal(evaluateHrCanonicalRead(cmd("compensation"), managed, doc("compensation", [compensation])).ok, false);
  managed.targetAccess = { ...managed.targetAccess!, managerId: "stranger" };
  assert.equal(evaluateHrCanonicalRead(cmd(), managed, doc("leaveRequests", [leave])).ok, false);
  managed.targetAccess = access(rep);
  managed.targetDirectory = { ...rep, managerId: "stranger" };
  assert.equal(evaluateHrCanonicalRead(cmd(), managed, doc("leaveRequests", [leave])).ok, false);
  managed.targetDirectory = { ...rep, managerId: undefined };
  managed.actorAccess = { ...managed.actorAccess!, managedTeams: ["Sales"] };
  assert.equal(evaluateHrCanonicalRead(cmd(), managed, doc("leaveRequests", [leave])).ok, false,
    "broad team scope cannot grant HR access");
});

test("suspended, separated, stale, spoofed and inactive sessions deny before any record access", () => {
  const changes: Array<(a: HrCanonicalAuthority) => void> = [
    (a) => { a.authenticatedUid = "stranger"; },
    (a) => { a.session = { uid: "stranger", epoch: 7, active: true }; },
    (a) => { a.session = { uid: "rep", epoch: 8, active: true }; },
    (a) => { a.session = { uid: "rep", epoch: 7, active: false }; },
    (a) => { a.actorAccess = access(rep, "Suspended"); },
    (a) => { a.actorDirectory = { ...rep, role: "Administrator" }; },
    (a) => { a.actorDirectory = { ...rep, employmentStatus: "Separated" }; },
    (a) => { a.targetAccess = access(rep, "Suspended"); },
    (a) => { a.targetDirectory = { ...rep, employmentStatus: "Separated" }; },
    (a) => { a.targetAccess = access(stranger); },
    (a) => { a.targetDirectory = stranger; },
  ];
  for (const change of changes) {
    const snapshot = authority();
    change(snapshot);
    assert.equal(evaluateHrCanonicalRead(cmd(), snapshot, doc("leaveRequests", [leave])).ok, false);
  }
});

test("historical separation retrieval is explicit Administrator-only and requires consistent source states", () => {
  const history = authority(admin);
  history.targetAccess = access(rep, "Separated");
  history.targetDirectory = { ...rep, employmentStatus: "Separated" };
  assert.equal(evaluateHrCanonicalRead(cmd(), history, doc("leaveRequests", [leave])).ok, false);
  assert.equal(evaluateHrCanonicalRead({ ...cmd(), includeSeparatedHistory: true },
    history, doc("leaveRequests", [leave])).ok, true);
  history.targetAccess = access(rep, "Suspended");
  assert.equal(evaluateHrCanonicalRead({ ...cmd(), includeSeparatedHistory: true },
    history, doc("leaveRequests", [leave])).ok, false);
  const self = authority();
  self.targetAccess = access(rep, "Separated");
  self.targetDirectory = { ...rep, employmentStatus: "Separated" };
  assert.equal(evaluateHrCanonicalRead({ ...cmd(), includeSeparatedHistory: true },
    self, doc("leaveRequests", [leave])).ok, false);
});

test("malformed canonical data fails closed instead of returning partial confidential rows", () => {
  const valid = doc("leaveRequests", [leave]);
  const variants: Array<HrCanonicalDocument | null> = [
    null, { ...valid, path: "hrCanonicalReview/stranger/fields/leaveRequests" },
    { ...valid, version: "" }, { ...valid, items: {} },
    { ...valid, items: [leave, { ...leave, userId: "stranger" }] },
    { ...valid, items: [leave, { ...leave }] },
    { ...valid, items: [{ ...leave, id: null }] },
    { ...valid, items: [{ ...leave, requestedHours: { unexpected: "nested" } }] },
    { ...valid, items: [{ ...leave, requestedHours: Infinity }] },
    { ...valid, items: Array.from({ length: 501 }, (_, i) => ({ ...leave, id: String(i) })) },
  ];
  for (const variant of variants) {
    const result = evaluateHrCanonicalRead(cmd(), authority(), variant);
    assert.deepEqual(result, { ok: false, reason: "canonical-invalid" });
  }
});

test("invalid paths, fields, epochs and historical flags never reach a canonical path", () => {
  const invalid: HrCanonicalReadCommand[] = [
    { ...cmd(), ownerUid: "../other" },
    { ...cmd(), field: "audit" as HrCanonicalReadCommand["field"] },
    { ...cmd(), field: "compensationChanges" as HrCanonicalReadCommand["field"] },
    { ...cmd(), expectedSessionEpoch: -1 },
    { ...cmd(), expectedSessionEpoch: 1.5 },
    { ...cmd(), includeSeparatedHistory: "yes" as unknown as boolean },
  ];
  for (const request of invalid) assert.equal(authorizeHrCanonicalRead(request, authority()).ok, false);
});

test("default-disabled transport never performs reads; denial short-circuits before canonical IO", async () => {
  let authorityReads = 0;
  let canonicalReads = 0;
  const transport = {
    readAuthority: async () => { authorityReads++; return authority(); },
    readCanonical: async () => { canonicalReads++; return doc("leaveRequests", [leave]); },
  };
  assert.deepEqual(await executeHrCanonicalReadReview(cmd(), transport), { ok: false, reason: "disabled" });
  assert.equal(authorityReads, 0);
  assert.equal(canonicalReads, 0);
  const forbidden = { ...cmd(), field: "compensation" as const };
  assert.deepEqual(await executeHrCanonicalReadReview(forbidden, transport, true),
    { ok: false, reason: "field-restricted" });
  assert.equal(canonicalReads, 0);
});

test("in-flight session revocation, role downgrade, manager reassignment and target suspension invalidate response", async () => {
  const scenarios: Array<(a: HrCanonicalAuthority) => void> = [
    (a) => { a.session = { uid: "rep", epoch: 8, active: true }; },
    (a) => { a.actorAccess = access(rep, "Suspended"); },
    (a) => { a.actorAccess = { ...a.actorAccess!, updatedAt: "2026-11-04T20:00:00.000Z" }; },
    (a) => { a.targetAccess = access(rep, "Suspended"); },
  ];
  for (const change of scenarios) {
    let current = authority();
    const result = await executeHrCanonicalReadReview(cmd(), {
      readAuthority: async () => current,
      readCanonical: async () => {
        const next = structuredClone(current);
        change(next);
        current = next;
        return doc("leaveRequests", [leave]);
      },
    }, true);
    assert.equal(result.ok, false);
  }
  let current = authority(manager);
  const managerResult = await executeHrCanonicalReadReview(cmd(), {
    readAuthority: async () => current,
    readCanonical: async () => {
      current = { ...current, targetDirectory: { ...rep, managerId: "stranger" } };
      return doc("leaveRequests", [leave]);
    },
  }, true);
  assert.deepEqual(managerResult, { ok: false, reason: "authority-changed" });
});

test("transport fails closed on denied/missing read and on exceptions without echoing payloads", async () => {
  const base = authority();
  const denied = await executeHrCanonicalReadReview(cmd(), {
    readAuthority: async () => base, readCanonical: async () => null,
  }, true);
  assert.deepEqual(denied, { ok: false, reason: "canonical-invalid" });
  const failure = await executeHrCanonicalReadReview(cmd(), {
    readAuthority: async () => base,
    readCanonical: async () => { throw new Error("PRIVATE EMPLOYEE PAYLOAD"); },
  }, true);
  assert.deepEqual(failure, { ok: false, reason: "unavailable" });
});
