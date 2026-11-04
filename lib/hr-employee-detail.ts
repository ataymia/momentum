import { hrWorkspaceOverview } from "./hr-workspace-overview";
import type { HCMState, EmploymentRecord, EmployeeDocument, LeaveRequest, PerformanceReview, LifecycleCase, LifecycleTask } from "./hcm-engine";
import type { AccountAccessState } from "./identity-provisioning";
import type { Timecard, WorkspaceUser } from "./types";

/**
 * Presentation-only projections. Never return the raw HCM record or private
 * profile, compensation, tax form, evidence text, or document download URL.
 * Backend Firestore/Storage authorization remains mandatory.
 */
type Input = {
  viewer: WorkspaceUser | null;
  users: readonly WorkspaceUser[];
  hcm: HCMState;
  timecards: readonly Timecard[];
  accessRecords?: Readonly<Record<string, { accountState: AccountAccessState }>>;
};
type ChecklistTask = Pick<LifecycleTask, "id" | "title" | "status" | "dueDate">;
type OnboardingSummary = Pick<LifecycleCase, "id" | "status" | "effectiveDate"> & {
  tasks: ChecklistTask[];
};
type EmploymentSummary = Pick<EmploymentRecord, "employeeNumber" | "status" | "jobTitle" | "department" | "location" | "classification" | "hireDate">;
type DocumentSummary = Pick<EmployeeDocument, "id" | "title" | "category" | "version" | "status">;
type LeaveSummary = Pick<LeaveRequest, "id" | "startDate" | "endDate" | "requestedHours" | "status">;
type ReviewSummary = Pick<PerformanceReview, "id" | "status">;

const checklist = (item: LifecycleCase): OnboardingSummary => ({
  id: item.id,
  status: item.status,
  effectiveDate: item.effectiveDate,
  tasks: item.tasks.map(({ id, title, status, dueDate }) => ({ id, title, status, dueDate })),
});

const authorizedEmployees = (input: Input) => hrWorkspaceOverview(input).visibleEmployees;

export function hrEmployeeDetail(input: Input & { employeeId: string }) {
  const { viewer, hcm, timecards, employeeId } = input;
  if (!viewer || (viewer.role !== "Administrator" && viewer.id !== employeeId)) return null;
  const employee = authorizedEmployees(input).find((person) => person.id === employeeId);
  if (!employee) return null;

  const employment = hcm.employees.find((item) => item.userId === employeeId);
  const employmentSummary: EmploymentSummary | null = employment ? {
    employeeNumber: employment.employeeNumber,
    status: employment.status,
    jobTitle: employment.jobTitle,
    department: employment.department,
    location: employment.location,
    classification: employment.classification,
    hireDate: employment.hireDate,
  } : null;
  return {
    employee: {
      id: employee.id,
      name: employee.name,
      initials: employee.initials,
      title: employee.title,
      team: employee.team,
      email: employee.email,
    },
    employment: employmentSummary,
    onboarding: hcm.lifecycleCases.filter((item) => item.type === "Onboarding" && item.userId === employeeId).map(checklist),
    timecards: timecards.filter((item) => item.userId === employeeId).map(({ id, weekStart, weekEnd, status }) => ({ id, weekStart, weekEnd, status })),
    leave: hcm.leaveRequests.filter((item) => item.userId === employeeId).map(({ id, startDate, endDate, requestedHours, status }): LeaveSummary => ({ id, startDate, endDate, requestedHours, status })),
    documents: hcm.documents.filter((item) => item.userId === employeeId).map(({ id, title, category, version, status }): DocumentSummary => ({ id, title, category, version, status })),
    training: hcm.training.filter((item) => item.userId === employeeId).map(({ id, courseId, status, dueDate }) => ({
      id, status, dueDate, title: hcm.courses.find((course) => course.id === courseId)?.title ?? "Unlinked course",
    })),
    reviews: hcm.reviews.filter((item) => item.userId === employeeId).map(({ id, status }): ReviewSummary => ({ id, status })),
    requests: hcm.workflows.filter((item) => item.userId === employeeId).map(({ id, title, status }) => ({ id, title, status })),
  };
}

/** Administrators see only active-user or candidate-only onboarding case metadata. */
export function hrOnboardingQueue(input: Input): OnboardingSummary[] {
  if (input.viewer?.role !== "Administrator") return [];
  const active = authorizedEmployees(input);
  if (!active.some((person) => person.id === input.viewer?.id)) return [];
  const ids = new Set(active.map((person) => person.id));
  return input.hcm.lifecycleCases
    .filter((item) => item.type === "Onboarding" && item.status === "Open" && (!item.userId || ids.has(item.userId)))
    .map(checklist)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));
}

export function hrOnboardingCaseDetail(input: Input & { caseId: string }): OnboardingSummary | null {
  if (input.viewer?.role !== "Administrator") return null;
  const active = authorizedEmployees(input);
  if (!active.some((person) => person.id === input.viewer?.id)) return null;
  const ids = new Set(active.map((person) => person.id));
  const item = input.hcm.lifecycleCases.find((record) => record.id === input.caseId && record.type === "Onboarding");
  if (!item || (item.userId && !ids.has(item.userId))) return null;
  return checklist(item);
}
