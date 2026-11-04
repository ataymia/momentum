import { visibleActiveEmployees } from "./employee-directory-visibility";
import type { HCMState, HcmTask } from "./hcm-engine";
import type { AccountAccessState } from "./identity-provisioning";
import type { Timecard, WorkspaceUser } from "./types";

/**
 * Read-only HR home projection. Do not expose company-wide HR aggregates to
 * ordinary employees, even when a client-side navigation link is guessed.
 * This is defense in depth, not a replacement for Firestore/Storage rules.
 */
export type HrWorkspaceOverview = {
  visibleEmployees: WorkspaceUser[];
  submittedTimecards: number;
  submittedLeave: number;
  incompleteTraining: number;
  documentsNeedingAttention: number;
  openOnboarding: number;
  pendingProfileChanges: number;
  pendingWorkflows: number;
  performanceForReview: number;
  assignedTasks: HcmTask[];
};

const empty = (): HrWorkspaceOverview => ({
  visibleEmployees: [],
  submittedTimecards: 0,
  submittedLeave: 0,
  incompleteTraining: 0,
  documentsNeedingAttention: 0,
  openOnboarding: 0,
  pendingProfileChanges: 0,
  pendingWorkflows: 0,
  performanceForReview: 0,
  assignedTasks: [],
});

export function hrWorkspaceOverview(input: {
  viewer: WorkspaceUser | null;
  users: readonly WorkspaceUser[];
  hcm: HCMState;
  timecards: readonly Timecard[];
  accessRecords?: Readonly<Record<string, { accountState: AccountAccessState }>>;
}): HrWorkspaceOverview {
  const { viewer, users, hcm, timecards, accessRecords } = input;
  if (!viewer || viewer.role === "Customer") return empty();

  const isAdmin = viewer.role === "Administrator";
  const visibleEmployees = visibleActiveEmployees(users, accessRecords)
    .filter((employee) => isAdmin || employee.id === viewer.id);
  const ids = new Set(visibleEmployees.map((employee) => employee.id));
  const forVisibleEmployee = (record: { userId: string }) => ids.has(record.userId);

  return {
    visibleEmployees,
    submittedTimecards: timecards.filter((card) => forVisibleEmployee(card) && card.status === "Submitted").length,
    submittedLeave: hcm.leaveRequests.filter((request) => forVisibleEmployee(request) && request.status === "Submitted").length,
    incompleteTraining: hcm.training.filter((assignment) => forVisibleEmployee(assignment) && assignment.status !== "Complete").length,
    documentsNeedingAttention: hcm.documents.filter((document) =>
      forVisibleEmployee(document) && (document.status === "Missing" || document.status === "Acknowledgment required")
    ).length,
    // Candidate-only cases have no employee identity and are visible to HR Administrators only.
    openOnboarding: isAdmin ? hcm.lifecycleCases.filter((item) =>
      item.type === "Onboarding" && item.status === "Open" && (!item.userId || ids.has(item.userId))
    ).length : 0,
    pendingProfileChanges: isAdmin ? hcm.profileChangeRequests.filter((request) =>
      forVisibleEmployee(request) && request.status === "Submitted"
    ).length : 0,
    pendingWorkflows: isAdmin ? hcm.workflows.filter((request) =>
      forVisibleEmployee(request) && request.status === "Submitted"
    ).length : 0,
    performanceForReview: isAdmin ? hcm.reviews.filter((review) =>
      forVisibleEmployee(review) && review.status === "Employee submitted"
    ).length : 0,
    assignedTasks: hcm.tasks.filter((task) => task.ownerId === viewer.id && task.status === "Open"),
  };
}
