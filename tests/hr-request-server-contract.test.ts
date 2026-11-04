import test from "node:test";
import assert from "node:assert/strict";
import { createHcmSeed } from "../lib/hcm-engine";
import { evaluateHrDecisionCommand, type HrDecisionCommand, type TrustedHrDecisionSnapshot } from "../lib/hr-request-server-contract";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const date = "2026-11-04T16:00:00.000Z";
const user = (id: string, role: WorkspaceUser["role"]): WorkspaceUser =>
  ({ id, role, name: id, email: id + "@example.test", title: "Test", team: "Sales",
    initials: "TT", accent: "#123456", employmentStatus: "Active" } as WorkspaceUser);
const admin = user("admin", "Administrator");
const rep = user("rep", "Sales Representative");
const other = user("other", "Sales Representative");
const manager = user("manager", "Sales Manager");
const customer = user("customer", "Customer");
const directory = [admin, rep, other, manager, customer];
const access = (person: WorkspaceUser, state: UserAccessRecord["accountState"] = "Active"): UserAccessRecord => ({
  uid: person.id, email: person.email, role: person.role, team: person.team,
  accountState: state, updatedAt: date, updatedBy: "test",
});
const command = (): HrDecisionCommand => ({
  commandId: "review-001", kind: "leave", requestId: "leave-rep",
  decision: "Approved", note: "", expectedRevision: 3, decidedAt: date,
});
function snapshot(): TrustedHrDecisionSnapshot {
  const hcm = createHcmSeed({ users: directory } as WorkspaceData);
  hcm.leaveRequests = [
    { id: "leave-rep", userId: "rep", reason: "Synthetic", requestedHours: 8,
      startDate: "2026-11-10", endDate: "2026-11-10", submittedAt: date, status: "Submitted" },
    { id: "leave-other", userId: "other", reason: "Synthetic", requestedHours: 4,
      startDate: "2026-11-11", endDate: "2026-11-11", submittedAt: date, status: "Submitted" },
  ];
  hcm.workflows = [{ id: "workflow-rep", userId: "rep", type: "Other",
    title: "Synthetic request", detail: "Synthetic detail", submittedAt: date, status: "Submitted" }];
  return {
    authenticatedUid: "admin", actorAccess: access(admin), targetAccess: access(rep),
    directory, hcm, revision: 3,
  };
}
const run = (change?: Partial<HrDecisionCommand>, state?: TrustedHrDecisionSnapshot) =>
  evaluateHrDecisionCommand({ ...command(), ...change }, state ?? snapshot());

test("trusted active Administrator previews canonical HCM transition with deterministic audit and receipt", () => {
  const before = snapshot();
  const result = run(undefined, before);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.nextRevision, 4);
  assert.equal(result.receipt.actorUid, "admin");
  assert.equal(result.receipt.targetUid, "rep");
  assert.equal(result.receipt.requestKey, "leave:leave-rep");
  assert.equal(result.state.leaveRequests[0].status, "Approved");
  assert.equal(result.state.leaveRequests[1].status, "Submitted");
  assert.equal(result.state.audit.length, before.hcm.audit.length + 1);
  assert.equal(result.state.audit[0].id, "hr-decision-review-001");
  assert.equal(result.state.audit[0].at, date);
  assert.equal(before.hcm.leaveRequests[0].status, "Submitted");
  assert.equal(result.state.ptoLedger.length, 0, "no fabricated PTO use for unpaid leave");
});

test("replay receipts, changed revision and existing audit deny without modifying HCM", () => {
  const first = run();
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const withReceipt = snapshot();
  withReceipt.existingReceipt = first.receipt;
  assert.equal(run(undefined, withReceipt).ok, false);
  assert.equal(run({ commandId: "different-command" }, withReceipt).ok, false);
  assert.equal(run({ expectedRevision: 2 }).ok, false);
  const withAudit = snapshot();
  withAudit.hcm.audit.push(first.state.audit[0]);
  assert.equal(run(undefined, withAudit).ok, false);
  const decided = snapshot();
  decided.hcm.leaveRequests[0].status = "Approved";
  assert.equal(run(undefined, decided).ok, false);
});

test("server authority cannot be spoofed with directory roles or mismatched Firebase identities", () => {
  const cases: Array<(s: TrustedHrDecisionSnapshot) => void> = [
    (s) => { s.authenticatedUid = "other"; },
    (s) => { s.authenticatedUid = null; },
    (s) => { s.actorAccess = access(manager); },
    (s) => { s.actorAccess = access(admin, "Suspended"); },
    (s) => { s.actorAccess = access(admin, "Separated"); },
    (s) => { s.directory = [manager, rep, other, customer]; },
    (s) => { s.directory = [{ ...admin, role: "Sales Manager" }, rep, other, manager, customer]; },
  ];
  for (const modify of cases) {
    const s = snapshot();
    modify(s);
    assert.equal(run(undefined, s).ok, false);
  }
});

test("request ownership and active target are checked against trusted access and employment", () => {
  const cases: Array<(s: TrustedHrDecisionSnapshot) => void> = [
    (s) => { s.targetAccess = access(other); },
    (s) => { s.targetAccess = access(rep, "Suspended"); },
    (s) => { s.targetAccess = access(rep, "Separated"); },
    (s) => { s.targetAccess = access(customer); },
    (s) => { s.directory = s.directory.filter((p) => p.id !== "rep"); },
    (s) => { s.directory = s.directory.map((p) => p.id === "rep" ? { ...p, role: "Marketing" } : p); },
    (s) => { s.hcm.employees.find((p) => p.userId === "rep")!.status = "Separated"; },
    (s) => { s.hcm.leaveRequests.push({ ...s.hcm.leaveRequests[0] }); },
  ];
  for (const modify of cases) {
    const s = snapshot();
    modify(s);
    assert.equal(run(undefined, s).ok, false);
  }
});

test("workflow approval is a review flag, not an employment, payroll or compliance execution", () => {
  const s = snapshot();
  const result = run({ kind: "workflow", requestId: "workflow-rep" }, s);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.workflows[0].status, "Approved");
  assert.deepEqual(result.state.compensation, s.hcm.compensation);
  assert.deepEqual(result.state.employees, s.hcm.employees);
});

test("invalid commands, missing return instructions and ambiguous request identifiers fail closed", () => {
  for (const change of [
    { commandId: "../unsafe" }, { requestId: "../unsafe" }, { decidedAt: "invalid" },
    { commandId: null as unknown as string }, { commandId: undefined as unknown as string },
    { requestId: null as unknown as string }, { requestId: undefined as unknown as string },
    { note: "x".repeat(2001) }, { expectedRevision: -1 },
    { decision: "Paid" as HrDecisionCommand["decision"] },
    { kind: "payroll" as HrDecisionCommand["kind"] },
    { decision: "Returned" as const, note: "  " },
  ]) assert.equal(run(change).ok, false);
  assert.equal(run({ requestId: "missing" }).ok, false);
});

test("PTO is debited only once under canonical policy and balance validation", () => {
  const s = snapshot();
  s.hcm.ptoPolicies = [{ id: "pto", name: "Synthetic", active: true, method: "Manual",
    accrualHoursPerPayPeriod: 0, frontLoadHours: 0, waitingDays: 0,
    minimumRequestHours: 1, effectiveDate: "2026-01-01" }];
  s.hcm.leaveRequests[0].policyId = "pto";
  assert.equal(run(undefined, s).ok, false);
  s.hcm.ptoLedger = [{ id: "credit", userId: "rep", policyId: "pto", date: "2026-11-01",
    type: "Adjustment", hours: 12, note: "Synthetic", createdBy: "admin", createdAt: date }];
  const result = run(undefined, s);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.ptoLedger.filter((item) => item.requestId === "leave-rep").length, 1);
  assert.equal(result.state.ptoLedger[0].hours, -8);
  const after = { ...s, hcm: result.state, revision: result.nextRevision, existingReceipt: result.receipt };
  assert.equal(run({ expectedRevision: result.nextRevision }, after).ok, false);
});
