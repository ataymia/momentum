import { canManageUser } from "./access";
import {
  ptoBalance,
  type BenefitEnrollment,
  type EmployeePrivateProfile,
  type HCMState,
  type LeaveRequest,
} from "./hcm-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export type HcmTransitionCheck = { ok: boolean; message?: string };
export type LeaveBalanceImpact = { balanceBefore: number; balanceAfter: number; requestedHours: number; insufficientAvailableBalance: boolean };

type RecordUpdate<T> = { before: T; after: T };
type RecordDiff<T> = { added: T[]; removed: T[]; updated: RecordUpdate<T>[] };
type HcmArrayKey = Exclude<keyof HCMState, "version">;

const HCM_ARRAY_KEYS: HcmArrayKey[] = [
  "employees","employmentChanges","privateProfiles","profileChangeRequests","documents","policies","acknowledgments",
  "ptoPolicies","ptoAssignments","ptoLedger","leaveRequests","availability","shifts","shiftRequests","benefitPlans","dependents",
  "benefitEnrollments","benefitEvents","compensation","compensationChanges","requisitions","candidates","interviews","offers",
  "lifecycleCases","courses","training","goals","reviewCycles","reviews","workflows","tasks","audit",
];

const ADMIN_ONLY_COLLECTIONS: HcmArrayKey[] = [
  "employees","employmentChanges","policies","ptoPolicies","ptoAssignments","benefitPlans","compensation","compensationChanges",
  "requisitions","lifecycleCases","courses","goals","reviewCycles",
];

const usedForRequest = (state: HCMState, requestId: string) => state.ptoLedger.filter((entry) => entry.type === "Used" && entry.requestId === requestId);
const rangeEnd = (value?: string) => value ?? "9999-12-31";
const rangesOverlap = (left: BenefitEnrollment, right: BenefitEnrollment) => left.effectiveDate <= rangeEnd(right.endDate) && right.effectiveDate <= rangeEnd(left.endDate);
const fail = (message: string): HcmTransitionCheck => ({ ok: false, message });
const sameRecord = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const idKey = <T extends { id: string }>(record: T) => record.id;
const userKey = <T extends { userId: string }>(record: T) => record.userId;

function diffRecords<T>(before: T[], after: T[], key: (record: T) => string): RecordDiff<T> {
  const left = new Map(before.map((record) => [key(record), record]));
  const right = new Map(after.map((record) => [key(record), record]));
  const added = after.filter((record) => !left.has(key(record)));
  const removed = before.filter((record) => !right.has(key(record)));
  const updated: RecordUpdate<T>[] = [];
  for (const record of after) {
    const prior = left.get(key(record));
    if (prior && !sameRecord(prior, record)) updated.push({ before: prior, after: record });
  }
  return { added, removed, updated };
}

function changedFields<T extends object>(before: T, after: T) {
  const left = before as unknown as Record<string, unknown>;
  const right = after as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => !sameRecord(left[key], right[key]));
}

const onlyFieldsChanged = <T extends object>(before: T, after: T, allowed: string[]) => changedFields(before, after).every((field) => allowed.includes(field));

function collectionChanged<T>(before: T[], after: T[], key: (record: T) => string) {
  const diff = diffRecords(before, after, key);
  return diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;
}

function uniqueBy<T>(records: T[], key: (record: T) => string) {
  const keys = records.map(key);
  return keys.every(Boolean) && new Set(keys).size === keys.length;
}

const managerCanActFor = (data: WorkspaceData, actor: WorkspaceUser, userId: string) => actor.role === "Sales Manager" && userId !== actor.id && canManageUser(data, actor, userId, false);
const managerOrSelf = (data: WorkspaceData, actor: WorkspaceUser, userId: string) => userId === actor.id || managerCanActFor(data, actor, userId);

function candidateRequisition(state: HCMState, candidateId: string) {
  const candidate = state.candidates.find((item) => item.id === candidateId);
  return candidate ? state.requisitions.find((item) => item.id === candidate.requisitionId) : undefined;
}

function managerOwnsCandidate(state: HCMState, actor: WorkspaceUser, candidateId: string) {
  return actor.role === "Sales Manager" && candidateRequisition(state, candidateId)?.hiringManagerId === actor.id;
}

function validateAuditBoundary(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.audit, next.audit, idKey);
  if (diff.removed.length || diff.updated.length) return fail("Existing HCM audit history is immutable.");
  if (diff.added.some((event) => event.actorId !== actor.id)) return fail("New HCM audit events must identify the authenticated actor.");
  return { ok: true };
}

function validateProfileRequests(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.profileChangeRequests, next.profileChangeRequests, idKey);
  if (diff.removed.length) return fail("Profile change requests cannot be deleted by a non-administrator.");
  for (const request of diff.added) {
    if (request.userId !== actor.id || request.status !== "Submitted" || request.reviewerId || request.decidedAt || request.decisionNote) return fail("Employees may only submit their own profile change requests.");
  }
  for (const { before, after } of diff.updated) {
    if (!managerCanActFor(data, actor, after.userId) || before.userId !== after.userId || before.status !== "Submitted" || !["Approved","Returned"].includes(after.status) || after.reviewerId !== actor.id || !onlyFieldsChanged(before, after, ["status","reviewerId","decidedAt","decisionNote"])) return fail("Profile change decisions require management authority over the employee.");
  }
  return { ok: true };
}

function validatePrivateProfiles(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.privateProfiles, next.privateProfiles, userKey);
  if (diff.added.length || diff.removed.length) return fail("Private employee profiles cannot be created or deleted by a non-administrator.");
  for (const { before, after } of diff.updated) {
    if (!managerCanActFor(data, actor, after.userId) || before.userId !== after.userId) return fail("Private profile changes require management authority.");
    const approved = next.profileChangeRequests.find((request) => {
      if (request.userId !== after.userId || request.status !== "Approved" || request.reviewerId !== actor.id || request.field === "email") return false;
      const prior = current.profileChangeRequests.find((item) => item.id === request.id);
      return prior?.status === "Submitted";
    });
    if (!approved) return fail("Private profile data can change only through an approved profile-change request.");
    const field = approved.field as keyof EmployeePrivateProfile;
    const record = after as unknown as Record<string, unknown>;
    if (record[field] !== approved.requestedValue || !onlyFieldsChanged(before, after, [approved.field,"updatedAt"])) return fail("Approved private-profile changes must match the submitted field and value exactly.");
  }
  return { ok: true };
}

function validateLeaveRequests(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.leaveRequests, next.leaveRequests, idKey);
  if (diff.removed.length) return fail("Time-off requests cannot be deleted by a non-administrator.");
  for (const request of diff.added) {
    if (request.userId !== actor.id || request.status !== "Submitted" || request.reviewerId || request.decidedAt || request.decisionNote) return fail("Employees may only submit their own time-off requests.");
  }
  for (const { before, after } of diff.updated) {
    if (before.userId !== after.userId) return fail("Time-off request ownership is immutable.");
    if (after.userId === actor.id && before.status === "Submitted" && after.status === "Cancelled" && onlyFieldsChanged(before, after, ["status"])) continue;
    if (!managerCanActFor(data, actor, after.userId) || before.status !== "Submitted" || !["Approved","Returned"].includes(after.status) || after.reviewerId !== actor.id || !onlyFieldsChanged(before, after, ["status","reviewerId","decidedAt","decisionNote"])) return fail("Time-off decisions require management authority over the employee.");
  }
  return { ok: true };
}

function validatePtoLedger(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.ptoLedger, next.ptoLedger, idKey);
  if (diff.removed.length || diff.updated.length) return fail("PTO ledger history is append-only for non-administrators.");
  for (const entry of diff.added) {
    if (entry.type !== "Used" || entry.createdBy !== actor.id || !entry.requestId || !managerCanActFor(data, actor, entry.userId)) return fail("Managers may add PTO usage only from an approved managed-employee request.");
    const request = next.leaveRequests.find((item) => item.id === entry.requestId);
    const prior = current.leaveRequests.find((item) => item.id === entry.requestId);
    if (!request || prior?.status !== "Submitted" || request.status !== "Approved" || request.userId !== entry.userId || request.policyId !== entry.policyId || request.startDate !== entry.date || entry.hours !== -Math.abs(request.requestedHours) || request.reviewerId !== actor.id) return fail("PTO usage must exactly reconcile to the approved source request.");
  }
  return { ok: true };
}

function validateBenefitEnrollments(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.benefitEnrollments, next.benefitEnrollments, idKey);
  if (diff.removed.length) return fail("Benefit elections cannot be deleted by a non-administrator.");
  for (const enrollment of diff.added) {
    if (enrollment.userId !== actor.id || enrollment.status !== "Pending" || enrollment.event === "Admin correction" || enrollment.approvedBy || enrollment.approvedAt) return fail("Employees may only submit their own pending benefit elections.");
  }
  for (const { before, after } of diff.updated) {
    if (!managerCanActFor(data, actor, after.userId) || before.userId !== after.userId || before.status !== "Pending" || !["Active","Returned"].includes(after.status) || !onlyFieldsChanged(before, after, ["status","approvedBy","approvedAt","note"])) return fail("Benefit-election decisions require management authority over the employee.");
    if (after.status === "Active" && after.approvedBy !== actor.id) return fail("Approved benefit elections must record the approving manager.");
  }
  return { ok: true };
}

function validateBenefitEvents(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.benefitEvents, next.benefitEvents, idKey);
  if (diff.removed.length) return fail("Benefit life events cannot be deleted by a non-administrator.");
  for (const event of diff.added) if (event.userId !== actor.id || event.status !== "Submitted" || event.reviewerId) return fail("Employees may only submit their own benefit life events.");
  for (const { before, after } of diff.updated) {
    if (!managerCanActFor(data, actor, after.userId) || before.userId !== after.userId || before.status !== "Submitted" || !["Approved","Returned"].includes(after.status) || after.reviewerId !== actor.id || !onlyFieldsChanged(before, after, ["status","reviewerId"])) return fail("Benefit life-event decisions require management authority over the employee.");
  }
  return { ok: true };
}

function validateWorkflows(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.workflows, next.workflows, idKey);
  if (diff.removed.length) return fail("HR workflow requests cannot be deleted by a non-administrator.");
  for (const request of diff.added) if (request.userId !== actor.id || request.status !== "Submitted" || request.reviewerId || request.decidedAt || request.decisionNote) return fail("Employees may only submit their own HR workflow requests.");
  for (const { before, after } of diff.updated) {
    if (before.userId !== after.userId) return fail("HR workflow ownership is immutable.");
    if (after.userId === actor.id && before.status === "Submitted" && after.status === "Cancelled" && onlyFieldsChanged(before, after, ["status"])) continue;
    if (!managerCanActFor(data, actor, after.userId) || before.status !== "Submitted" || !["Approved","Returned"].includes(after.status) || after.reviewerId !== actor.id || !onlyFieldsChanged(before, after, ["status","reviewerId","decidedAt","decisionNote"])) return fail("HR workflow decisions require management authority over the employee.");
  }
  return { ok: true };
}

function validateTraining(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.training, next.training, idKey);
  if (diff.added.length || diff.removed.length) return fail("Training assignments are administrator-controlled.");
  for (const { before, after } of diff.updated) {
    if (after.userId !== actor.id || before.userId !== after.userId || before.status === "Complete" || after.status !== "Complete" || !after.completedAt || !onlyFieldsChanged(before, after, ["status","completedAt","evidence"])) return fail("Employees may only complete their own assigned training.");
  }
  return { ok: true };
}

function validateDocuments(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.documents, next.documents, idKey);
  if (diff.added.length || diff.removed.length) return fail("Employee documents are administrator-controlled.");
  for (const { before, after } of diff.updated) {
    if (after.userId !== actor.id || before.userId !== after.userId || before.status !== "Acknowledgment required" || after.status !== "Available" || !after.acknowledgedAt || after.acknowledgedVersion !== after.version || !onlyFieldsChanged(before, after, ["status","acknowledgedAt","acknowledgedVersion"])) return fail("Employees may only acknowledge their own acknowledgment-required documents.");
  }
  return { ok: true };
}

function validatePolicyAcknowledgments(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.acknowledgments, next.acknowledgments, idKey);
  if (diff.removed.length || diff.updated.length) return fail("Policy acknowledgments are immutable once recorded.");
  for (const acknowledgment of diff.added) {
    const policy = next.policies.find((item) => item.id === acknowledgment.policyId);
    if (acknowledgment.userId !== actor.id || !policy?.active || policy.version !== acknowledgment.version || !(policy.audience === "Company" || policy.audience === actor.team)) return fail("Employees may only acknowledge an active policy assigned to them.");
  }
  return { ok: true };
}

function validateReviews(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.reviews, next.reviews, idKey);
  if (diff.added.length || diff.removed.length) return fail("Performance review records are created through administrator-controlled cycles.");
  for (const { before, after } of diff.updated) {
    if (before.userId !== after.userId || before.cycleId !== after.cycleId) return fail("Performance review identity and employee linkage are immutable.");
    if (after.userId === actor.id) {
      const selfSubmit = before.status === "Not started" && after.status === "Employee submitted" && Boolean(after.employeeSummary?.trim()) && Boolean(after.employeeSubmittedAt) && onlyFieldsChanged(before, after, ["employeeSummary","employeeSubmittedAt","status"]);
      const acknowledge = before.status === "Manager submitted" && after.status === "Acknowledged" && Boolean(after.acknowledgedAt) && onlyFieldsChanged(before, after, ["status","acknowledgedAt"]);
      if (selfSubmit || acknowledge) continue;
      return fail("Employees may only submit or acknowledge their own performance review.");
    }
    const ratingValid = after.rating === undefined || (Number.isFinite(after.rating) && after.rating >= 1 && after.rating <= 5);
    if (!managerCanActFor(data, actor, after.userId) || !["Not started","Employee submitted"].includes(before.status) || after.status !== "Manager submitted" || !after.managerSummary?.trim() || !after.managerSubmittedAt || !ratingValid || !onlyFieldsChanged(before, after, ["managerSummary","rating","managerSubmittedAt","status"])) return fail("Manager review changes require authority over the reviewed employee.");
  }
  return { ok: true };
}

function validateTasks(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.tasks, next.tasks, idKey);
  if (diff.removed.length) return fail("HCM tasks cannot be deleted by a non-administrator.");
  for (const task of diff.added) {
    if (actor.role !== "Sales Manager") return fail("Only managers may generate HCM workflow tasks.");
    if (task.userId && !managerOrSelf(data, actor, task.userId)) return fail("Managers may generate HCM tasks only for employees inside their management scope.");
    const owner = data.users.find((user) => user.id === task.ownerId && user.role !== "Customer");
    if (!owner) return fail("HCM task owners must be active company identities.");
  }
  for (const { before, after } of diff.updated) {
    if (before.ownerId !== after.ownerId || after.ownerId !== actor.id || before.status !== "Open" || after.status !== "Complete" || !onlyFieldsChanged(before, after, ["status"])) return fail("Employees may only complete HCM tasks assigned to themselves.");
  }
  return { ok: true };
}

function validateAvailability(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.availability, next.availability, idKey);
  if ([...diff.added, ...diff.removed].some((record) => record.userId !== actor.id) || diff.updated.some(({ before, after }) => before.userId !== actor.id || after.userId !== actor.id || before.userId !== after.userId)) return fail("Employees may manage only their own availability.");
  return { ok: true };
}

function validateDependents(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const diff = diffRecords(current.dependents, next.dependents, idKey);
  if ([...diff.added, ...diff.removed].some((record) => record.userId !== actor.id) || diff.updated.some(({ before, after }) => before.userId !== actor.id || after.userId !== actor.id || before.userId !== after.userId)) return fail("Employees may manage only their own benefit dependents.");
  return { ok: true };
}

function validateShiftRequests(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.shiftRequests, next.shiftRequests, idKey);
  if (diff.removed.length) return fail("Shift requests cannot be deleted by a non-administrator.");
  for (const request of diff.added) if (request.userId !== actor.id || request.status !== "Submitted" || request.reviewerId) return fail("Employees may only submit their own shift requests.");
  for (const { before, after } of diff.updated) {
    if (!managerCanActFor(data, actor, after.userId) || before.userId !== after.userId || before.status !== "Submitted" || !["Approved","Returned"].includes(after.status) || after.reviewerId !== actor.id || !onlyFieldsChanged(before, after, ["status","reviewerId"])) return fail("Shift-request decisions require management authority over the employee.");
  }
  return { ok: true };
}

function validateShifts(current: HCMState, next: HCMState, actor: WorkspaceUser, data: WorkspaceData): HcmTransitionCheck {
  const diff = diffRecords(current.shifts, next.shifts, idKey);
  if (diff.removed.length) return fail("Published scheduling history cannot be deleted by a non-administrator.");
  if (actor.role !== "Sales Manager" && (diff.added.length || diff.updated.length)) return fail("Only managers may change employee shifts.");
  for (const shift of diff.added) if (!shift.userId || !managerCanActFor(data, actor, shift.userId) || shift.createdBy !== actor.id) return fail("Managers may create shifts only for employees inside their management scope.");
  for (const { before, after } of diff.updated) {
    if (!before.userId || !after.userId || !managerCanActFor(data, actor, before.userId) || !managerCanActFor(data, actor, after.userId) || before.id !== after.id || before.createdBy !== after.createdBy) return fail("Managers may update only managed-employee shifts without rewriting their creator record.");
  }
  return { ok: true };
}

function validateRecruiting(current: HCMState, next: HCMState, actor: WorkspaceUser): HcmTransitionCheck {
  const candidateDiff = diffRecords(current.candidates, next.candidates, idKey);
  const interviewDiff = diffRecords(current.interviews, next.interviews, idKey);
  const offerDiff = diffRecords(current.offers, next.offers, idKey);
  if (actor.role !== "Sales Manager" && (candidateDiff.added.length || candidateDiff.removed.length || candidateDiff.updated.length || interviewDiff.added.length || interviewDiff.removed.length || interviewDiff.updated.length || offerDiff.added.length || offerDiff.removed.length || offerDiff.updated.length)) return fail("Recruiting records require assigned hiring-manager authority.");
  if (candidateDiff.removed.length || interviewDiff.removed.length || offerDiff.removed.length) return fail("Recruiting history cannot be deleted by a non-administrator.");

  for (const candidate of candidateDiff.added) {
    const requisition = next.requisitions.find((item) => item.id === candidate.requisitionId);
    if (requisition?.hiringManagerId !== actor.id) return fail("Managers may add candidates only to requisitions assigned to them.");
  }
  for (const { before, after } of candidateDiff.updated) {
    if (before.requisitionId !== after.requisitionId || !managerOwnsCandidate(next, actor, after.id) || !onlyFieldsChanged(before, after, ["stage","dispositionReason","notes"])) return fail("Managers may update only pipeline fields for candidates in their assigned requisitions.");
  }
  for (const interview of interviewDiff.added) {
    if (!managerOwnsCandidate(next, actor, interview.candidateId) || !interview.interviewerIds.includes(actor.id) || interview.status !== "Scheduled") return fail("Managers may schedule interviews only for candidates in their assigned requisitions.");
  }
  for (const { before, after } of interviewDiff.updated) {
    if (before.candidateId !== after.candidateId || !managerOwnsCandidate(next, actor, after.candidateId) || !onlyFieldsChanged(before, after, ["status","score","recommendation","notes"])) return fail("Managers may update interview outcomes only within their assigned requisitions.");
  }
  for (const offer of offerDiff.added) {
    if (!managerOwnsCandidate(next, actor, offer.candidateId) || offer.status !== "Draft" || offer.approvedBy) return fail("Managers may create draft offers only for candidates in their assigned requisitions.");
  }
  for (const { before, after } of offerDiff.updated) {
    if (before.candidateId !== after.candidateId || !managerOwnsCandidate(next, actor, after.candidateId) || !onlyFieldsChanged(before, after, ["status","sentAt","respondedAt","approvedBy"])) return fail("Managers may update offer status only within their assigned requisitions.");
    const allowed = (before.status === "Draft" && ["Sent","Withdrawn"].includes(after.status)) || (before.status === "Sent" && ["Accepted","Declined","Withdrawn"].includes(after.status));
    if (!allowed || (after.status === "Sent" && after.approvedBy !== actor.id)) return fail("Offer status transition is not authorized.");
  }
  return { ok: true };
}

export function validateHcmActorTransition(current: HCMState, next: HCMState, actor: WorkspaceUser | null | undefined, data: WorkspaceData): HcmTransitionCheck {
  if (!actor) return fail("An authenticated employee is required for HCM changes.");
  if (next.version !== current.version) return fail("HCM state version cannot be changed through an employee mutation.");
  for (const key of HCM_ARRAY_KEYS) if (!Array.isArray(next[key])) return fail(`HCM collection ${key} is malformed.`);
  if (!uniqueBy(next.employees, userKey) || !uniqueBy(next.privateProfiles, userKey)) return fail("Employee and private-profile user IDs must be unique.");
  for (const key of HCM_ARRAY_KEYS.filter((item) => !["employees","privateProfiles"].includes(item))) {
    const records = next[key] as unknown as { id?: string }[];
    if (records.some((record) => typeof record.id !== "string" || !record.id) || new Set(records.map((record) => record.id)).size !== records.length) return fail(`HCM collection ${key} contains duplicate or missing record IDs.`);
  }

  const audit = validateAuditBoundary(current, next, actor);
  if (!audit.ok) return audit;

  const businessChanged = HCM_ARRAY_KEYS.filter((key) => key !== "audit").some((key) => collectionChanged(current[key] as unknown[], next[key] as unknown[], (record) => String((record as Record<string, unknown>).id ?? (record as Record<string, unknown>).userId ?? "")));
  if (actor.role === "Customer") return businessChanged || !sameRecord(current.audit, next.audit) ? fail("Customers cannot mutate employee HCM records.") : { ok: true };
  if (actor.role === "Administrator") return { ok: true };

  for (const key of ADMIN_ONLY_COLLECTIONS) {
    const recordKey = key === "employees" ? (record: unknown) => String((record as { userId?: string }).userId ?? "") : (record: unknown) => String((record as { id?: string }).id ?? "");
    if (collectionChanged(current[key] as unknown[], next[key] as unknown[], recordKey)) return fail(`${key} is administrator-controlled.`);
  }

  const checks = [
    validateProfileRequests(current, next, actor, data),
    validatePrivateProfiles(current, next, actor, data),
    validateLeaveRequests(current, next, actor, data),
    validatePtoLedger(current, next, actor, data),
    validateBenefitEnrollments(current, next, actor, data),
    validateBenefitEvents(current, next, actor, data),
    validateWorkflows(current, next, actor, data),
    validateTraining(current, next, actor),
    validateDocuments(current, next, actor),
    validatePolicyAcknowledgments(current, next, actor),
    validateReviews(current, next, actor, data),
    validateTasks(current, next, actor, data),
    validateAvailability(current, next, actor),
    validateDependents(current, next, actor),
    validateShiftRequests(current, next, actor, data),
    validateShifts(current, next, actor, data),
    validateRecruiting(current, next, actor),
  ];
  return checks.find((check) => !check.ok) ?? { ok: true };
}

export function leaveBalanceImpact(state: HCMState, request: LeaveRequest): LeaveBalanceImpact | undefined {
  if (!request.policyId) return undefined;
  const balanceBefore = ptoBalance(state, request.userId, request.policyId, request.startDate);
  const requestedHours = Math.abs(request.requestedHours);
  return { balanceBefore, balanceAfter: balanceBefore - requestedHours, requestedHours, insufficientAvailableBalance: requestedHours > balanceBefore };
}

export function activeBenefitEnrollmentConflicts(state: HCMState, enrollment: BenefitEnrollment) {
  if (enrollment.status !== "Active" || enrollment.election !== "Enroll") return [] as BenefitEnrollment[];
  return state.benefitEnrollments.filter((other) => other.id !== enrollment.id && other.userId === enrollment.userId && other.planId === enrollment.planId && other.status === "Active" && other.election === "Enroll" && rangesOverlap(enrollment, other));
}

export function validateHcmTransition(current: HCMState, next: HCMState): HcmTransitionCheck {
  const currentLedgerIds = new Set(current.ptoLedger.map((entry) => entry.id));

  for (const entry of next.ptoLedger.filter((item) => item.type === "Used" && !currentLedgerIds.has(item.id))) {
    if (!entry.requestId) return { ok: false, message: "PTO Used entries created by leave approval must reference the source leave request." };
    const request = next.leaveRequests.find((item) => item.id === entry.requestId);
    if (!request || request.status !== "Approved") return { ok: false, message: "PTO cannot be deducted from a leave request that is not approved." };
    if (!request.policyId || entry.policyId !== request.policyId) return { ok: false, message: "PTO deduction policy must match the approved leave request." };
    if (entry.userId !== request.userId) return { ok: false, message: "PTO deduction employee must match the approved leave request." };
    if (entry.date !== request.startDate) return { ok: false, message: "PTO deduction date must match the approved leave start date." };
    if (entry.hours !== -Math.abs(request.requestedHours)) return { ok: false, message: "PTO deduction hours must exactly match the approved request." };
  }

  for (const request of next.leaveRequests) {
    const previous = current.leaveRequests.find((item) => item.id === request.id);
    const newlyApproved = request.status === "Approved" && previous?.status !== "Approved";
    const deductions = usedForRequest(next, request.id);
    if (deductions.length > 1) return { ok: false, message: "A leave request cannot deduct PTO more than once." };
    if (newlyApproved && request.policyId && deductions.length !== 1) return { ok: false, message: "An approved PTO request must create exactly one matching PTO deduction." };
  }

  for (const plan of next.benefitPlans) {
    if (plan.tiers.some((tier) => tier.employeeContributionPerPayPeriod < 0 || tier.employerContributionPerPayPeriod < 0)) return { ok: false, message: "Benefit contributions cannot be negative." };
    if (new Set(plan.tiers.map((tier) => tier.id)).size !== plan.tiers.length) return { ok: false, message: "Benefit tier IDs must be unique within a plan." };
  }

  for (const enrollment of next.benefitEnrollments) {
    if (enrollment.endDate && enrollment.endDate < enrollment.effectiveDate) return { ok: false, message: "Benefit enrollment end date cannot be before its effective date." };
    const plan = next.benefitPlans.find((item) => item.id === enrollment.planId);
    if (!plan) return { ok: false, message: "Benefit enrollment must reference an existing plan." };
    if (!plan.tiers.some((tier) => tier.id === enrollment.tierId)) return { ok: false, message: "Benefit enrollment tier must belong to the selected plan." };
    const dependentIds = [...new Set(enrollment.dependentIds)];
    if (dependentIds.length !== enrollment.dependentIds.length) return { ok: false, message: "A dependent cannot be attached to the same benefit enrollment twice." };
    if (dependentIds.some((id) => !next.dependents.some((dependent) => dependent.id === id && dependent.userId === enrollment.userId))) return { ok: false, message: "Benefit enrollment dependents must belong to the enrolled employee." };
    if (activeBenefitEnrollmentConflicts(next, enrollment).length) return { ok: false, message: "An employee cannot have overlapping active enrollments in the same benefit plan." };
  }

  return { ok: true };
}
