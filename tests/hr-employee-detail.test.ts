import test from "node:test";
import assert from "node:assert/strict";
import { createHcmSeed } from "../lib/hcm-engine";
import { hrEmployeeDetail, hrOnboardingCaseDetail, hrOnboardingQueue } from "../lib/hr-employee-detail";
import { canVisitRoute, pageForPath, requiresPrototypePage, routeLabel } from "../lib/navigation-route-registry";
import type { Timecard, WorkspaceData, WorkspaceUser } from "../lib/types";

const person = (id: string, role: WorkspaceUser["role"] = "Sales Representative", employmentStatus: "Active" | "Separated" = "Active"): WorkspaceUser => ({
  id, name: id, firstName: id, initials: "XX", title: "Team member",
  role, team: role === "Administrator" ? "Leadership" : "Sales",
  email: id + "@example.invalid", accent: "#123456", employmentStatus,
});
const admin = person("admin", "Administrator");
const rep = person("rep");
const other = person("other");
const former = person("former", "Sales Representative", "Separated");
const users = [admin, rep, other, former];
const data = { users } as WorkspaceData;

function setup() {
  const hcm = createHcmSeed(data);
  hcm.privateProfiles = [{ userId: "rep", phone: "SECRET_PHONE", address: "SECRET_ADDRESS", updatedAt: "2026-11-04" }];
  hcm.compensation = [{ id: "private-pay", userId: "rep", basis: "Hourly", rate: 99999, effectiveDate: "2026-11-01", reason: "SECRET_PAY", status: "Active", approvedBy: "admin", createdAt: "2026-11-01" }];
  hcm.documents = [
    { id: "doc-rep", userId: "rep", title: "Agreement", category: "Employment", version: 2, status: "Acknowledgment required", fileName: "SECRET_FILE", uploadedAt: "2026-11-04", uploadedBy: "admin" },
    { id: "doc-other", userId: "other", title: "Other confidential file", category: "Tax", version: 1, status: "Missing", uploadedAt: "2026-11-04", uploadedBy: "admin" },
  ];
  hcm.lifecycleCases = [
    { id: "case-rep", type: "Onboarding", userId: "rep", effectiveDate: "2026-11-05", status: "Open", createdAt: "2026-11-04", createdBy: "admin", tasks: [
      { id: "task-rep", title: "Orientation", status: "Open", dueDate: "2026-11-05", evidence: "SECRET_EVIDENCE" },
      { id: "task-done", title: "Account walkthrough", status: "Complete", completedAt: "2026-11-04" },
    ] },
    { id: "case-other", type: "Onboarding", userId: "other", effectiveDate: "2026-11-06", status: "Open", createdAt: "2026-11-04", createdBy: "admin", tasks: [{ id: "task-other", title: "Private onboarding", status: "Open" }] },
    { id: "case-former", type: "Onboarding", userId: "former", effectiveDate: "2026-11-02", status: "Open", createdAt: "2026-11-04", createdBy: "admin", tasks: [] },
    { id: "case-candidate", type: "Onboarding", candidateId: "candidate-internal", effectiveDate: "2026-11-07", status: "Open", createdAt: "2026-11-04", createdBy: "admin", tasks: [] },
  ];
  hcm.leaveRequests = [
    { id: "leave-rep", userId: "rep", startDate: "2026-11-10", endDate: "2026-11-11", requestedHours: 8, reason: "SECRET_REASON", submittedAt: "2026-11-04", status: "Submitted" },
    { id: "leave-other", userId: "other", startDate: "2026-11-10", endDate: "2026-11-11", requestedHours: 8, reason: "PRIVATE_OTHER", submittedAt: "2026-11-04", status: "Submitted" },
  ];
  hcm.training = [{ id: "training-rep", userId: "rep", courseId: "course-company-onboarding", assignedAt: "2026-11-04", status: "Assigned" }];
  hcm.reviews = [{ id: "review-rep", cycleId: "cycle", userId: "rep", status: "Employee submitted", employeeSummary: "SECRET_REVIEW" }];
  hcm.workflows = [{ id: "request-rep", userId: "rep", type: "Document", title: "Record request", detail: "SECRET_REQUEST", submittedAt: "2026-11-04", status: "Submitted" }];
  const timecards: Timecard[] = [
    { id: "time-rep", userId: "rep", weekStart: "2026-11-01", weekEnd: "2026-11-07", status: "Submitted", attested: true },
    { id: "time-other", userId: "other", weekStart: "2026-11-01", weekEnd: "2026-11-07", status: "Submitted", attested: true },
  ];
  return { users, hcm, timecards };
}

test("employee drilldown is self-only except Administrator and never returns private source fields", () => {
  const base = setup();
  const own = hrEmployeeDetail({ ...base, viewer: rep, employeeId: "rep" });
  assert.ok(own);
  assert.deepEqual(own.timecards.map((card) => card.id), ["time-rep"]);
  assert.deepEqual(own.leave.map((leave) => leave.id), ["leave-rep"]);
  assert.deepEqual(own.documents.map((document) => document.id), ["doc-rep"]);
  assert.equal(own.onboarding[0].tasks.length, 2);
  assert.equal(own.training[0].title, "Company onboarding");
  for (const secret of ["SECRET_PHONE", "SECRET_ADDRESS", "SECRET_PAY", "SECRET_FILE", "SECRET_EVIDENCE", "SECRET_REASON", "SECRET_REVIEW", "SECRET_REQUEST", "PRIVATE_OTHER"]) {
    assert.equal(JSON.stringify(own).includes(secret), false, secret + " must never be projected");
  }
  assert.equal(hrEmployeeDetail({ ...base, viewer: rep, employeeId: "other" }), null);
  assert.equal(hrEmployeeDetail({ ...base, viewer: other, employeeId: "rep" }), null);
  assert.ok(hrEmployeeDetail({ ...base, viewer: admin, employeeId: "rep" }));
  assert.equal(hrEmployeeDetail({ ...base, viewer: admin, employeeId: "former" }), null);
  assert.equal(hrEmployeeDetail({ ...base, viewer: person("unknown", "Administrator"), employeeId: "rep" }), null);
  assert.equal(hrEmployeeDetail({ ...base, viewer: { ...rep, role: "Administrator" }, employeeId: "rep" }), null);
  assert.equal(hrEmployeeDetail({ ...base, viewer: person("customer", "Customer"), employeeId: "customer" }), null);
});

test("onboarding review and case details fail closed outside active Administrator identity", () => {
  const base = setup();
  assert.deepEqual(hrOnboardingQueue({ ...base, viewer: rep }), []);
  assert.equal(hrOnboardingCaseDetail({ ...base, viewer: rep, caseId: "case-rep" }), null);
  assert.deepEqual(hrOnboardingQueue({ ...base, viewer: admin }).map((item) => item.id), ["case-rep", "case-other", "case-candidate"]);
  assert.equal(hrOnboardingCaseDetail({ ...base, viewer: admin, caseId: "case-former" }), null);
  assert.equal(hrOnboardingCaseDetail({ ...base, viewer: admin, caseId: "case-other" })?.tasks[0].title, "Private onboarding");
  assert.equal(hrOnboardingCaseDetail({ ...base, viewer: admin, caseId: "missing" }), null);
  assert.equal(JSON.stringify(hrOnboardingCaseDetail({ ...base, viewer: admin, caseId: "case-rep" })).includes("SECRET_EVIDENCE"), false);
  assert.deepEqual(hrOnboardingQueue({ ...base, viewer: { ...rep, role: "Administrator" } }), []);
  const separatedAdmin = { ...admin, employmentStatus: "Separated" as const };
  assert.deepEqual(hrOnboardingQueue({ ...base, viewer: separatedAdmin, accessRecords: { admin: { accountState: "Separated" } } }), []);
});

test("authoritative active account overrides stale local separation without exposing separated accounts", () => {
  const base = setup();
  const withFirebase = { ...base, viewer: admin, accessRecords: { former: { accountState: "Active" as const } } };
  assert.ok(hrEmployeeDetail({ ...withFirebase, employeeId: "former" }));
  assert.ok(hrOnboardingCaseDetail({ ...withFirebase, caseId: "case-former" }));
  assert.equal(hrEmployeeDetail({ ...base, viewer: former, employeeId: "former", accessRecords: { former: { accountState: "Separated" } } }), null);
});

test("HR deep links map to protected prototype routes; legacy onboarding route remains", () => {
  assert.equal(pageForPath("/people/me"), "people");
  assert.equal(pageForPath("/people/employees/opaque-id"), "people");
  assert.equal(routeLabel("/people/onboarding/cases/opaque-id"), "Onboarding checklist");
  assert.equal(requiresPrototypePage("/people/me"), true);
  assert.equal(requiresPrototypePage("/people/onboarding/review"), true);
  assert.equal(canVisitRoute(rep, "/people/me"), true);
  assert.equal(canVisitRoute(rep, "/people/employees/other"), false);
  assert.equal(canVisitRoute(rep, "/people/onboarding/review"), false);
  assert.equal(canVisitRoute(rep, "/people/onboarding/cases/opaque-id"), false);
  assert.equal(canVisitRoute(admin, "/people/employees/opaque-id"), true);
  assert.equal(canVisitRoute(admin, "/people/onboarding/cases/opaque-id"), true);
  assert.equal(canVisitRoute(person("customer", "Customer"), "/people/me"), false);
  assert.equal(requiresPrototypePage("/people/onboarding"), false);
});
