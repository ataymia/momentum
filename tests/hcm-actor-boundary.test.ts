import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateHcmActorTransition } from "../lib/hcm-controls";
import { appendAudit, createHcmSeed, type HCMState, type LeaveRequest, type ProfileChangeRequest } from "../lib/hcm-engine";
import { createDemoData } from "../lib/demo-data";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const data = createDemoData();
const admin = data.users.find((user) => user.role === "Administrator")!;
const manager = data.users.find((user) => user.role === "Sales Manager")!;
const rep = data.users.find((user) => user.role === "Sales Representative")!;
const customer = data.users.find((user) => user.role === "Customer")!;

const audit = (state: HCMState, actor: WorkspaceUser, entityType: string, entityId: string) => appendAudit(state, {
  actorId: actor.id,
  action: "Test mutation",
  entityType,
  entityId,
});

const leave = (userId: string, id = "leave-test"): LeaveRequest => ({
  id,
  userId,
  policyId: "pto-test",
  startDate: "2026-09-21",
  endDate: "2026-09-21",
  requestedHours: 8,
  reason: "Planned time off",
  submittedAt: "2026-09-10T15:00:00Z",
  status: "Submitted",
});

test("sales rep may submit an own HR request but cannot mutate protected employment or compensation records", () => {
  const current = createHcmSeed(data);
  const request = leave(rep.id);
  const ownRequest = audit({ ...current, leaveRequests: [request, ...current.leaveRequests] }, rep, "LeaveRequest", request.id);
  assert.equal(validateHcmActorTransition(current, ownRequest, rep, data).ok, true);

  const compensation = {
    id: "comp-forged",
    userId: rep.id,
    basis: "Hourly" as const,
    rate: 99,
    effectiveDate: "2026-09-10",
    reason: "Self edit",
    status: "Active" as const,
    approvedBy: rep.id,
    createdAt: "2026-09-10T15:00:00Z",
  };
  const forgedPay = audit({ ...current, compensation: [compensation] }, rep, "CompensationRecord", compensation.id);
  const result = validateHcmActorTransition(current, forgedPay, rep, data);
  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /administrator-controlled/);

  const employee = current.employees.find((item) => item.userId === rep.id)!;
  const forgedEmployment = audit({ ...current, employees: current.employees.map((item) => item.userId === rep.id ? { ...employee, jobTitle: "President" } : item) }, rep, "EmploymentRecord", rep.id);
  assert.equal(validateHcmActorTransition(current, forgedEmployment, rep, data).ok, false);
});

test("employee cannot create or decide another employee's HR request", () => {
  const current = createHcmSeed(data);
  const otherRequest = leave(manager.id, "leave-other");
  const added = audit({ ...current, leaveRequests: [otherRequest] }, rep, "LeaveRequest", otherRequest.id);
  assert.equal(validateHcmActorTransition(current, added, rep, data).ok, false);

  const submitted = { ...current, leaveRequests: [leave(manager.id, "leave-existing")] };
  const decided = audit({ ...submitted, leaveRequests: submitted.leaveRequests.map((item) => ({ ...item, status: "Approved" as const, reviewerId: rep.id, decidedAt: "2026-09-10T16:00:00Z" })) }, rep, "LeaveRequest", "leave-existing");
  assert.equal(validateHcmActorTransition(submitted, decided, rep, data).ok, false);
});

test("sales manager may approve a managed employee leave request only with exact PTO usage lineage", () => {
  const request = leave(rep.id, "leave-managed");
  const current = { ...createHcmSeed(data), leaveRequests: [request] };
  const approvedRequest = { ...request, status: "Approved" as const, reviewerId: manager.id, decidedAt: "2026-09-10T16:00:00Z" };
  const used = {
    id: "pto-used-managed",
    userId: rep.id,
    policyId: request.policyId!,
    date: request.startDate,
    type: "Used" as const,
    hours: -8,
    requestId: request.id,
    note: "Approved time off",
    createdBy: manager.id,
    createdAt: "2026-09-10T16:00:00Z",
  };
  const next = audit({ ...current, leaveRequests: [approvedRequest], ptoLedger: [used] }, manager, "LeaveRequest", request.id);
  assert.equal(validateHcmActorTransition(current, next, manager, data).ok, true);

  const wrongHours = audit({ ...current, leaveRequests: [approvedRequest], ptoLedger: [{ ...used, hours: -7 }] }, manager, "LeaveRequest", request.id);
  assert.equal(validateHcmActorTransition(current, wrongHours, manager, data).ok, false);
});

test("same department alone does not permit manager HCM decisions", () => {
  const strictManager: WorkspaceUser = { ...manager, managedTeams: [] };
  const unmanagedPeer: WorkspaceUser = {
    ...rep,
    id: "usr-hcm-unmanaged-peer",
    name: "Unmanaged Peer",
    firstName: "Unmanaged",
    email: "unmanaged.hcm@momentum.demo",
    initials: "UH",
    managerId: "usr-someone-else",
  };
  const scopedData: WorkspaceData = { ...data, users: [...data.users, unmanagedPeer] };
  const request = leave(unmanagedPeer.id, "leave-unmanaged");
  const current = { ...createHcmSeed(scopedData), leaveRequests: [request] };
  const next = audit({ ...current, leaveRequests: [{ ...request, status: "Returned" as const, reviewerId: strictManager.id, decidedAt: "2026-09-10T16:00:00Z" }] }, strictManager, "LeaveRequest", request.id);
  assert.equal(validateHcmActorTransition(current, next, strictManager, scopedData).ok, false);
});

test("manager private-profile update requires a matching approved request and exact requested value", () => {
  const request: ProfileChangeRequest = {
    id: "profile-phone",
    userId: rep.id,
    field: "phone",
    currentValue: "602-555-0100",
    requestedValue: "602-555-0199",
    reason: "New work contact number",
    submittedAt: "2026-09-10T15:00:00Z",
    status: "Submitted",
  };
  const current = { ...createHcmSeed(data), profileChangeRequests: [request], privateProfiles: createHcmSeed(data).privateProfiles.map((profile) => profile.userId === rep.id ? { ...profile, phone: request.currentValue } : profile) };
  const directEdit = audit({ ...current, privateProfiles: current.privateProfiles.map((profile) => profile.userId === rep.id ? { ...profile, phone: request.requestedValue, updatedAt: "2026-09-10T16:00:00Z" } : profile) }, manager, "EmployeePrivateProfile", rep.id);
  assert.equal(validateHcmActorTransition(current, directEdit, manager, data).ok, false);

  const approved = { ...request, status: "Approved" as const, reviewerId: manager.id, decidedAt: "2026-09-10T16:00:00Z" };
  const approvedEdit = audit({
    ...current,
    profileChangeRequests: [approved],
    privateProfiles: current.privateProfiles.map((profile) => profile.userId === rep.id ? { ...profile, phone: request.requestedValue, updatedAt: "2026-09-10T16:00:00Z" } : profile),
  }, manager, "ProfileChangeRequest", request.id);
  assert.equal(validateHcmActorTransition(current, approvedEdit, manager, data).ok, true);

  const alteredValue = audit({
    ...current,
    profileChangeRequests: [approved],
    privateProfiles: current.privateProfiles.map((profile) => profile.userId === rep.id ? { ...profile, phone: "602-555-0111", updatedAt: "2026-09-10T16:00:00Z" } : profile),
  }, manager, "ProfileChangeRequest", request.id);
  assert.equal(validateHcmActorTransition(current, alteredValue, manager, data).ok, false);
});

test("employee may complete only own training and acknowledge only own required documents", () => {
  const current = createHcmSeed(data);
  const ownTraining = current.training.find((item) => item.userId === rep.id)!;
  const completeOwn = audit({ ...current, training: current.training.map((item) => item.id === ownTraining.id ? { ...item, status: "Complete" as const, completedAt: "2026-09-10T16:00:00Z" } : item) }, rep, "TrainingAssignment", ownTraining.id);
  assert.equal(validateHcmActorTransition(current, completeOwn, rep, data).ok, true);

  const otherTraining = current.training.find((item) => item.userId !== rep.id)!;
  const completeOther = audit({ ...current, training: current.training.map((item) => item.id === otherTraining.id ? { ...item, status: "Complete" as const, completedAt: "2026-09-10T16:00:00Z" } : item) }, rep, "TrainingAssignment", otherTraining.id);
  assert.equal(validateHcmActorTransition(current, completeOther, rep, data).ok, false);

  const ownDocument = current.documents.find((item) => item.userId === rep.id)!;
  const required = { ...current, documents: current.documents.map((item) => item.id === ownDocument.id ? { ...item, status: "Acknowledgment required" as const, fileName: "policy.pdf" } : item) };
  const acknowledged = audit({ ...required, documents: required.documents.map((item) => item.id === ownDocument.id ? { ...item, status: "Available" as const, acknowledgedAt: "2026-09-10T16:00:00Z", acknowledgedVersion: item.version } : item) }, rep, "EmployeeDocument", ownDocument.id);
  assert.equal(validateHcmActorTransition(required, acknowledged, rep, data).ok, true);
});

test("manager recruiting authority follows explicit requisition ownership", () => {
  const requisition = { id: "req-managed", title: "Sales Rep", department: "Sales", location: "Phoenix", hiringManagerId: manager.id, openings: 1, status: "Open" as const, openedAt: "2026-09-01", createdAt: "2026-09-01T12:00:00Z", createdBy: admin.id };
  const candidate = { id: "candidate-managed", requisitionId: requisition.id, name: "Candidate", email: "candidate@example.com", source: "Direct", stage: "Applied" as const, appliedAt: "2026-09-09T12:00:00Z", notes: "" };
  const current = { ...createHcmSeed(data), requisitions: [requisition], candidates: [candidate] };
  const interview = { id: "interview-managed", candidateId: candidate.id, interviewerIds: [manager.id], scheduledAt: "2026-09-12T15:00:00", durationMinutes: 30, status: "Scheduled" as const };
  const next = audit({ ...current, candidates: [{ ...candidate, stage: "Interview" as const }], interviews: [interview] }, manager, "Interview", interview.id);
  assert.equal(validateHcmActorTransition(current, next, manager, data).ok, true);

  const otherManager: WorkspaceUser = { ...manager, id: "usr-other-manager", email: "other.manager@momentum.demo", name: "Other Manager", firstName: "Other", initials: "OM" };
  const otherData = { ...data, users: [...data.users, otherManager] };
  const denied = audit({ ...current, candidates: [{ ...candidate, stage: "Interview" as const }], interviews: [{ ...interview, interviewerIds: [otherManager.id] }] }, otherManager, "Interview", interview.id);
  assert.equal(validateHcmActorTransition(current, denied, otherManager, otherData).ok, false);
});

test("audit history cannot be rewritten and a new audit event cannot impersonate another actor", () => {
  const base = audit(createHcmSeed(data), rep, "WorkflowRequest", "seed-audit");
  const rewritten = { ...base, audit: base.audit.map((event) => ({ ...event, actorId: manager.id })) };
  assert.equal(validateHcmActorTransition(base, rewritten, rep, data).ok, false);

  const forged = appendAudit(base, { actorId: manager.id, action: "Forged", entityType: "WorkflowRequest", entityId: "forged" });
  assert.equal(validateHcmActorTransition(base, forged, rep, data).ok, false);
});

test("administrator may change protected HCM configuration while customer HCM mutations are denied", () => {
  const current = createHcmSeed(data);
  const compensation = { id: "comp-admin", userId: rep.id, basis: "Hourly" as const, rate: 25, effectiveDate: "2026-09-10", reason: "Approved setup", status: "Active" as const, approvedBy: admin.id, createdAt: "2026-09-10T16:00:00Z" };
  const adminNext = audit({ ...current, compensation: [compensation] }, admin, "CompensationRecord", compensation.id);
  assert.equal(validateHcmActorTransition(current, adminNext, admin, data).ok, true);

  const customerRequest = leave(customer.id, "leave-customer");
  const customerNext = audit({ ...current, leaveRequests: [customerRequest] }, customer, "LeaveRequest", customerRequest.id);
  assert.equal(validateHcmActorTransition(current, customerNext, customer, data).ok, false);
});

test("HCM context enforces actor authorization before structural normalization and protects browser reload", () => {
  const source = readFileSync(new URL("../lib/hcm-context.tsx", import.meta.url), "utf8");
  assert.match(source, /validateHcmActorTransition\(current,raw,currentUser,data\)/);
  assert.match(source, /if\(!actorCheck\.ok\)return current/);
  assert.match(source, /reloadHcm=\(\)=>\{if\(runtime\.isDemo&&currentUser\?\.role==="Administrator"\)/);
});

test("manager HCM surfaces hide recruiting records outside explicit requisition ownership", () => {
  const source = readFileSync(new URL("../components/hcm/advanced-hcm.tsx", import.meta.url), "utf8");
  assert.match(source, /recruitingCandidateInScope/);
  assert.match(source, /requisition\?\.hiringManagerId===currentUser\.id/);
  assert.match(source, /visibleRecruitingCandidates/);
  assert.match(source, /visibleInterviews/);
  assert.match(source, /visibleOffers/);
  assert.match(source, /hrUserInScope/);
});

test("People manager approval applies the exact requested non-email profile value", () => {
  const source = readFileSync(new URL("../components/pages/people-v2.tsx", import.meta.url), "utf8");
  assert.match(source, /status==="Approved"&&item\.field!=="email"/);
  assert.match(source, /\[item\.field\]:item\.requestedValue/);
  assert.match(source, /privateProfiles:/);
});
