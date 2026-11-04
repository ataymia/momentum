import test from "node:test";
import assert from "node:assert/strict";
import { createHcmSeed } from "../lib/hcm-engine";
import { hrRequestReviewRows, hrRequestReviewDetail, planHrRequestDecision } from "../lib/hr-request-review";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const person = (id: string, role: WorkspaceUser["role"], employmentStatus: "Active" | "Separated" = "Active") =>
  ({ id, name: id, role, team: "Sales", email: id + "@example.test", title: "Test",
    initials: "T", accent: "#123456", employmentStatus } as WorkspaceUser);
const admin = person("admin", "Administrator");
const rep = person("rep", "Sales Representative");
const other = person("other", "Sales Representative");
const manager = person("manager", "Sales Manager");
const former = person("former", "Sales Representative", "Separated");
const customer = person("customer", "Customer");
const users = [admin, rep, other, manager, former, customer];
const data = { users } as WorkspaceData;
const date = "2026-11-04T15:00:00.000Z";

function fixture() {
  const hcm = createHcmSeed(data);
  hcm.leaveRequests = [
    { id: "leave-rep", userId: rep.id, startDate: "2026-11-10", endDate: "2026-11-10",
      requestedHours: 8, reason: "Private leave details", submittedAt: date, status: "Submitted" },
    { id: "leave-other", userId: other.id, startDate: "2026-11-11", endDate: "2026-11-11",
      requestedHours: 4, reason: "Other person's private details", submittedAt: date, status: "Submitted" },
    { id: "leave-former", userId: former.id, startDate: "2026-11-12", endDate: "2026-11-12",
      requestedHours: 2, reason: "Separated history", submittedAt: date, status: "Submitted" },
  ];
  hcm.workflows = [{ id: "workflow-rep", userId: rep.id, type: "Other", title: "Request review",
    detail: "Confidential workflow explanation", submittedAt: date, status: "Submitted" }];
  return hcm;
}
const input = (viewer: WorkspaceUser | null, hcm = fixture()) => ({ viewer, users, hcm });
const decide = (viewer: WorkspaceUser, hcm = fixture(), kind: "leave" | "workflow" = "leave",
  requestId = "leave-rep", decision: "Approved" | "Returned" = "Approved", note = "") =>
  planHrRequestDecision({ ...input(viewer, hcm), data, kind, requestId, decision, note, decidedAt: date });

test("request list is record-scoped and never returns raw HCM or compensation", () => {
  assert.deepEqual(hrRequestReviewRows(input(rep)).map((item) => item.id), ["leave-rep", "workflow-rep"]);
  assert.deepEqual(hrRequestReviewRows(input(manager)).map((item) => item.id), []);
  assert.deepEqual(hrRequestReviewRows(input(customer)), []);
  assert.deepEqual(hrRequestReviewRows(input(former)), []);
  assert.deepEqual(hrRequestReviewRows(input(null)), []);
  assert.deepEqual(hrRequestReviewRows(input(admin)).map((item) => item.id).sort(),
    ["leave-other", "leave-rep", "workflow-rep"]);
  assert.equal("reason" in hrRequestReviewRows(input(admin))[0], false);
  assert.equal("compensation" in hrRequestReviewRows(input(admin))[0], false);
  assert.equal(hrRequestReviewDetail({ ...input(rep), kind: "leave", requestId: "leave-other" }), null);
  assert.equal(hrRequestReviewDetail({ ...input(customer), kind: "workflow", requestId: "workflow-rep" }), null);
  assert.equal(hrRequestReviewDetail({ ...input(admin), kind: "leave", requestId: "leave-former" }), null);
});

test("stale role, unknown viewer and Firebase revoked access fail closed", () => {
  const hcm = fixture();
  assert.deepEqual(hrRequestReviewRows(input({ ...rep, role: "Administrator" }, hcm)), []);
  assert.deepEqual(hrRequestReviewRows(input({ ...admin, id: "unknown" }, hcm)), []);
  assert.deepEqual(hrRequestReviewRows({ ...input(admin, hcm), accessRecords: { rep: { accountState: "Separated" } } })
    .map((item) => item.id), ["leave-other"]);
  assert.equal(hrRequestReviewDetail({ ...input(rep, hcm), accessRecords: { rep: { accountState: "Suspended" } },
    kind: "leave", requestId: "leave-rep" }), null);
  const rejected = planHrRequestDecision({ ...input(admin, hcm), data, kind: "leave", requestId: "leave-rep",
    decision: "Approved", note: "", decidedAt: date, accessRecords: { rep: { accountState: "Separated" } } });
  assert.equal(rejected.ok, false);
});

test("canonical leave approval appends one immutable audit and does not alter other records", () => {
  const hcm = fixture();
  const result = decide(admin, hcm);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.leaveRequests.find((r) => r.id === "leave-rep")?.status, "Approved");
  assert.equal(result.state.leaveRequests.find((r) => r.id === "leave-other")?.status, "Submitted");
  assert.equal(result.state.leaveRequests.find((r) => r.id === "leave-rep")?.reviewerId, "admin");
  assert.equal(result.state.audit.length, hcm.audit.length + 1);
  assert.equal(result.state.audit[0].actorId, "admin");
  assert.equal(result.state.ptoLedger.length, 0, "unassigned unpaid leave does not invent PTO usage");
  assert.equal(decide(admin, result.state).ok, false, "already decided requests cannot be approved twice");
  assert.equal(hcm.leaveRequests[0].status, "Submitted", "source state is not mutated");
});

test("return instructions are mandatory and workflows do not execute underlying changes", () => {
  assert.equal(decide(admin, fixture(), "leave", "leave-rep", "Returned").ok, false);
  const result = decide(admin, fixture(), "workflow", "workflow-rep", "Returned", "Provide evidence");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state.workflows[0].status, "Returned");
  assert.equal(result.state.workflows[0].decisionNote, "Provide evidence");
  assert.equal(result.state.compensation.length, 0);
  assert.equal(result.state.employees.length, fixture().employees.length);
  assert.equal(result.state.audit[0].entityType, "WorkflowRequest");
});

test("no manager, employee, customer or mismatched role can approve", () => {
  for (const actor of [manager, rep, other, customer, former, { ...rep, role: "Administrator" }]) {
    assert.equal(decide(actor).ok, false, actor.id + " must be denied");
  }
  assert.equal(decide(admin, fixture(), "leave", "leave-former").ok, false);
  assert.equal(decide(admin, fixture(), "leave", "missing").ok, false);
});

test("PTO approval records exact one usage and rejects insufficient or missing policies", () => {
  const hcm = fixture();
  hcm.ptoPolicies = [{ id: "pto", name: "Test PTO", active: true, method: "Manual",
    accrualHoursPerPayPeriod: 0, frontLoadHours: 0, waitingDays: 0,
    minimumRequestHours: 1, effectiveDate: "2026-01-01" }];
  hcm.leaveRequests[0].policyId = "pto";
  assert.equal(decide(admin, hcm).ok, false, "zero balance requires review");
  hcm.ptoLedger = [{ id: "credit", userId: "rep", policyId: "pto", date: "2026-11-01",
    type: "Adjustment", hours: 12, note: "Synthetic balance", createdBy: "admin", createdAt: date }];
  const result = decide(admin, hcm);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const used = result.state.ptoLedger.filter((entry) => entry.requestId === "leave-rep");
  assert.equal(used.length, 1);
  assert.equal(used[0].hours, -8);
  assert.equal(used[0].createdBy, "admin");
  assert.equal(decide(admin, result.state).ok, false);
  hcm.ptoPolicies = [];
  assert.equal(decide(admin, hcm).ok, false);
});

test("invalid time off and timestamps are rejected without writing", () => {
  const hcm = fixture();
  hcm.leaveRequests[0].requestedHours = -5;
  assert.equal(decide(admin, hcm).ok, false);
  hcm.leaveRequests[0].requestedHours = 8;
  const invalid = planHrRequestDecision({ ...input(admin, hcm), data, kind: "leave",
    requestId: "leave-rep", decision: "Approved", note: "", decidedAt: "not-a-date" });
  assert.equal(invalid.ok, false);
});
