import { appendAudit, ptoBalance, type HCMState } from "./hcm-engine";
import { validateHcmActorTransition, validateHcmTransition } from "./hcm-controls";
import { hrWorkspaceOverview } from "./hr-workspace-overview";
import type { AccountAccessState } from "./identity-provisioning";
import type { WorkspaceData, WorkspaceUser } from "./types";

/**
 * Review projections deliberately omit compensation, private profiles, document
 * evidence and all other unrelated HCM fields. Backend record-level rules are
 * still required: this client-side projection is not a confidentiality boundary.
 */
export type HrRequestKind = "leave" | "workflow";
export type HrRequestSummary = {
  kind: HrRequestKind;
  id: string;
  userId: string;
  employeeName: string;
  label: string;
  status: string;
  submittedAt: string;
};
export type HrRequestDetail = HrRequestSummary & {
  reason: string;
  startDate?: string;
  endDate?: string;
  requestedHours?: number;
  policyId?: string;
  reviewerId?: string;
  decidedAt?: string;
  decisionNote?: string;
};
type Input = {
  viewer: WorkspaceUser | null;
  users: readonly WorkspaceUser[];
  hcm: HCMState;
  accessRecords?: Readonly<Record<string, { accountState: AccountAccessState }>>;
};

function permitted(input: Input) {
  const employees = hrWorkspaceOverview({ ...input, timecards: [] }).visibleEmployees;
  const viewer = input.viewer;
  if (!viewer || !employees.some((person) => person.id === viewer.id)) return [];
  return viewer.role === "Administrator" ? employees : employees.filter((person) => person.id === viewer.id);
}

export function hrRequestReviewRows(input: Input): HrRequestSummary[] {
  const names = new Map(permitted(input).map((person) => [person.id, person.name]));
  const leave: HrRequestSummary[] = input.hcm.leaveRequests.filter((item) => names.has(item.userId)).map((item) => ({
    kind: "leave", id: item.id, userId: item.userId, employeeName: names.get(item.userId)!,
    label: "Time off", status: item.status, submittedAt: item.submittedAt,
  }));
  const workflows: HrRequestSummary[] = input.hcm.workflows.filter((item) => names.has(item.userId)).map((item) => ({
    kind: "workflow", id: item.id, userId: item.userId, employeeName: names.get(item.userId)!,
    label: item.title, status: item.status, submittedAt: item.submittedAt,
  }));
  return [...leave, ...workflows].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
}

export function hrRequestReviewDetail(input: Input & { kind: HrRequestKind; requestId: string }): HrRequestDetail | null {
  const row = hrRequestReviewRows(input).find((item) => item.kind === input.kind && item.id === input.requestId);
  if (!row) return null;
  if (input.kind === "leave") {
    const record = input.hcm.leaveRequests.find((item) => item.id === row.id && item.userId === row.userId);
    return record ? { ...row, reason: record.reason, startDate: record.startDate, endDate: record.endDate,
      requestedHours: record.requestedHours, policyId: record.policyId, reviewerId: record.reviewerId,
      decidedAt: record.decidedAt, decisionNote: record.decisionNote } : null;
  }
  const record = input.hcm.workflows.find((item) => item.id === row.id && item.userId === row.userId);
  return record ? { ...row, reason: record.detail, reviewerId: record.reviewerId,
    decidedAt: record.decidedAt, decisionNote: record.decisionNote } : null;
}

type DecisionInput = Input & {
  data: WorkspaceData;
  kind: HrRequestKind;
  requestId: string;
  decision: "Approved" | "Returned";
  note: string;
  decidedAt: string;
};
type DecisionResult = { ok: true; state: HCMState } | { ok: false; error: string };
const reject = (error: string): DecisionResult => ({ ok: false, error });

/**
 * Canonical HCM transition preview, not a backend write or approval authority.
 * Callers must separately guard persistence; no connected-data mutation is
 * authorized by this helper. A workflow "Approved" flag does not execute the
 * requested underlying employment, compensation or compliance action.
 */
export function planHrRequestDecision(input: DecisionInput): DecisionResult {
  const { viewer, data, hcm, kind, requestId, decision } = input;
  if (!viewer || viewer.role !== "Administrator" || !data.users.some((person) =>
    person.id === viewer.id && person.role === "Administrator")) return reject("Administrator authority required.");
  const detail = hrRequestReviewDetail(input);
  if (!detail || detail.userId === viewer.id) return reject("Request not accessible for review.");
  if (detail.status !== "Submitted") return reject("Request is no longer pending.");
  const note = input.note.trim();
  if (decision === "Returned" && !note) return reject("Return instructions are required.");
  if (!Number.isFinite(Date.parse(input.decidedAt))) return reject("A valid decision timestamp is required.");
  let next: HCMState;
  if (kind === "leave") {
    const record = hcm.leaveRequests.find((item) => item.id === requestId && item.userId === detail.userId);
    if (!record || !Number.isFinite(record.requestedHours) || record.requestedHours <= 0 ||
      record.endDate < record.startDate) return reject("Invalid time-off request.");
    if (decision === "Approved" && record.policyId) {
      if (!hcm.ptoPolicies.some((policy) => policy.id === record.policyId)) return reject("PTO policy unavailable.");
      if (ptoBalance(hcm, record.userId, record.policyId, record.startDate) < record.requestedHours) {
        return reject("Available PTO does not cover this request. Manual policy review required.");
      }
    }
    next = { ...hcm, leaveRequests: hcm.leaveRequests.map((item) => item.id === record.id ?
      { ...item, status: decision, reviewerId: viewer.id, decidedAt: input.decidedAt, decisionNote: note || undefined } : item) };
    if (decision === "Approved" && record.policyId) {
      if (hcm.ptoLedger.some((entry) => entry.requestId === record.id && entry.type === "Used")) return reject("PTO already recorded.");
      next = { ...next, ptoLedger: [{ id: `pto-review-${record.id}-${input.decidedAt}`,
        userId: record.userId, policyId: record.policyId, date: record.startDate, type: "Used",
        hours: -record.requestedHours, requestId: record.id, note: "Approved time-off request",
        createdBy: viewer.id, createdAt: input.decidedAt }, ...hcm.ptoLedger] };
    }
  } else {
    next = { ...hcm, workflows: hcm.workflows.map((item) => item.id === requestId && item.userId === detail.userId ?
      { ...item, status: decision, reviewerId: viewer.id, decidedAt: input.decidedAt, decisionNote: note || undefined } : item) };
  }
  next = appendAudit(next, { actorId: viewer.id, action: `HR ${kind} request ${decision.toLowerCase()}`,
    entityType: kind === "leave" ? "LeaveRequest" : "WorkflowRequest", entityId: requestId,
    reason: note || undefined });
  const actorCheck = validateHcmActorTransition(hcm, next, viewer, data);
  if (!actorCheck.ok) return reject(actorCheck.message ?? "Actor authorization failed.");
  const invariantCheck = validateHcmTransition(hcm, next);
  if (!invariantCheck.ok) return reject(invariantCheck.message ?? "HCM invariant failed.");
  return { ok: true, state: next };
}
