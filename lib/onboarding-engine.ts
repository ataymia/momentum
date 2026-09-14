import { appendAudit, type EmployeeDocument, type HCMState, type LifecycleCase, type TrainingAssignment, type WorkerClassification } from "./hcm-engine";
import type { IdentityProvisioningRecord, ProvisioningDraft } from "./identity-provisioning";
import type { WorkspaceData } from "./types";

export type OnboardingReadiness = {
  readyForEmployeeSubmission: boolean;
  readyForActivation: boolean;
  completed: number;
  total: number;
  blockers: string[];
  requiredDocumentIds: string[];
  requiredTrainingIds: string[];
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function requiredOnboardingDocumentTemplates(classification: WorkerClassification) {
  const common: Array<Pick<EmployeeDocument, "title" | "category">> = [
    { title: classification === "Contractor" ? "Contractor agreement" : "Employment agreement", category: "Employment" },
    { title: "Compensation plan / pay notice", category: "Compensation" },
  ];
  if (classification === "Contractor") return [...common, { title: "Form W-9", category: "Tax" as const }];
  if (["Hourly", "Salary"].includes(classification)) return [
    ...common,
    { title: "Form I-9", category: "Employment" as const },
    { title: "Form W-4", category: "Tax" as const },
    { title: "Arizona Form A-4", category: "Tax" as const },
  ];
  return common;
}

export function prepareOnboardingPackage(state: HCMState, data: WorkspaceData, draft: ProvisioningDraft, userId: string, actorId: string): HCMState {
  const user = data.users.find((item) => item.id === userId && item.role !== "Customer");
  if (!user || draft.linkedUserId !== userId || user.email.toLowerCase() !== draft.workEmail.toLowerCase()) return state;
  const at = new Date().toISOString();
  const employeeIndex = state.employees.findIndex((item) => item.userId === userId);
  if (employeeIndex < 0) return state;
  const employee = state.employees[employeeIndex];
  const employees = state.employees.map((item) => item.userId === userId ? {
    ...item,
    status: "Prehire" as const,
    hireDate: draft.startDate,
    jobTitle: draft.jobTitle,
    department: draft.team,
    location: draft.workLocation,
    managerId: draft.managerId,
    classification: draft.classification,
    payGroup: draft.payGroup,
    standardWeeklyHours: draft.standardWeeklyHours,
    updatedAt: at,
  } : item);

  const templates = requiredOnboardingDocumentTemplates(draft.classification);
  const existingTitles = new Set(state.documents.filter((doc) => doc.userId === userId).map((doc) => doc.title.toLowerCase()));
  const addedDocuments: EmployeeDocument[] = templates.filter((template) => !existingTitles.has(template.title.toLowerCase())).map((template) => ({
    id: uid("onboard-doc"), userId, title: template.title, category: template.category, version: 1, status: "Missing", uploadedAt: at, uploadedBy: actorId,
  }));

  const courseIds = new Set(draft.courseIds);
  const existingCourseIds = new Set(state.training.filter((item) => item.userId === userId).map((item) => item.courseId));
  const addedTraining: TrainingAssignment[] = state.courses.filter((course) => course.active && courseIds.has(course.id) && !existingCourseIds.has(course.id)).map((course) => ({
    id: uid("onboard-training"), userId, courseId: course.id, assignedAt: draft.startDate, status: "Assigned",
  }));

  const existingCase = state.lifecycleCases.find((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open");
  const lifecycleCase: LifecycleCase = existingCase ?? {
    id: uid("onboarding"), type: "Onboarding", userId, candidateId: draft.candidateId, effectiveDate: draft.startDate, status: "Open", createdAt: at, createdBy: actorId,
    tasks: [
      { id: uid("task"), title: "Secure account and change first-login password", status: "Open" },
      { id: uid("task"), title: "Confirm employee profile and contact information", status: "Open" },
      { id: uid("task"), title: "Complete required employment and tax forms", status: "Open" },
      { id: uid("task"), title: "Complete assigned onboarding training", status: "Open" },
      { id: uid("task"), title: "HR review and activate role-based access", status: "Open" },
    ],
  };

  let next: HCMState = {
    ...state,
    employees,
    documents: [...addedDocuments, ...state.documents],
    training: [...addedTraining, ...state.training],
    lifecycleCases: existingCase ? state.lifecycleCases : [lifecycleCase, ...state.lifecycleCases],
  };

  if (draft.payBasis !== "Not configured" && draft.payRate && draft.payRate > 0 && !state.compensation.some((item) => item.userId === userId && item.effectiveDate === draft.startDate && item.status !== "Ended")) {
    next = {
      ...next,
      compensation: [{ id: uid("comp"), userId, basis: draft.payBasis, rate: draft.payRate, effectiveDate: draft.startDate, reason: draft.source === "Accepted offer" ? "Accepted employment offer" : "New hire setup", status: "Active", approvedBy: actorId, createdAt: at }, ...next.compensation],
    };
  }

  return appendAudit(next, { actorId, action: "Prepared employee onboarding package", entityType: "LifecycleCase", entityId: lifecycleCase.id, before: employee.status, after: "Prehire", reason: `Provisioning draft ${draft.id}` });
}

export function onboardingReadiness(state: HCMState, record: IdentityProvisioningRecord | undefined, userId: string): OnboardingReadiness {
  const employee = state.employees.find((item) => item.userId === userId);
  const profile = state.privateProfiles.find((item) => item.userId === userId);
  const lifecycle = state.lifecycleCases.find((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open");
  const requiredTitles = new Set(requiredOnboardingDocumentTemplates(employee?.classification ?? "Not configured").map((item) => item.title.toLowerCase()));
  const documents = state.documents.filter((item) => item.userId === userId && requiredTitles.has(item.title.toLowerCase()));
  const training = state.training.filter((item) => item.userId === userId);
  const requiredDocumentIds = documents.map((item) => item.id);
  const requiredTrainingIds = training.map((item) => item.id);
  const blockers: string[] = [];
  const checks: boolean[] = [];

  const passwordComplete = Boolean(record?.passwordChangedAt);
  checks.push(passwordComplete);
  if (!passwordComplete) blockers.push("First-login password change is not verified.");

  const employmentConfigured = Boolean(employee && employee.status === "Prehire" && employee.jobTitle.trim() && employee.department.trim() && employee.location.trim() && employee.managerId && employee.classification !== "Not configured" && employee.payGroup !== "Not configured");
  checks.push(employmentConfigured);
  if (!employmentConfigured) blockers.push("Employment profile, reporting line, classification, location, or pay group is incomplete.");

  const profileComplete = Boolean(profile?.phone?.trim() && profile.address?.trim() && profile.emergencyContact?.trim());
  checks.push(profileComplete);
  if (!profileComplete) blockers.push("Employee phone, address, and emergency contact are incomplete.");

  const compensationConfigured = state.compensation.some((item) => item.userId === userId && item.status !== "Ended" && item.rate > 0 && item.basis !== "Not configured");
  checks.push(compensationConfigured);
  if (!compensationConfigured) blockers.push("Approved compensation is not configured.");

  const documentsComplete = requiredTitles.size > 0 && documents.length === requiredTitles.size && documents.every((item) => item.status === "Available");
  checks.push(documentsComplete);
  if (!documentsComplete) blockers.push("Required employment/tax documents are incomplete or awaiting secure file/e-sign evidence.");

  const trainingComplete = training.length > 0 && training.every((item) => item.status === "Complete");
  checks.push(trainingComplete);
  if (!trainingComplete) blockers.push("Assigned onboarding training is incomplete.");

  const lifecycleExists = Boolean(lifecycle);
  checks.push(lifecycleExists);
  if (!lifecycleExists) blockers.push("Onboarding case has not been prepared.");

  const readyForEmployeeSubmission = passwordComplete && employmentConfigured && profileComplete && compensationConfigured && documentsComplete && trainingComplete && lifecycleExists;
  const readyForActivation = readyForEmployeeSubmission && record?.state === "Pending approval";
  return { readyForEmployeeSubmission, readyForActivation, completed: checks.filter(Boolean).length, total: checks.length, blockers, requiredDocumentIds, requiredTrainingIds };
}

export function activateEmploymentAfterOnboarding(state: HCMState, userId: string, actorId: string) {
  const at = new Date().toISOString();
  const lifecycle = state.lifecycleCases.find((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open");
  const employee = state.employees.find((item) => item.userId === userId);
  if (!lifecycle || !employee) return state;
  const next: HCMState = {
    ...state,
    employees: state.employees.map((item) => item.userId === userId ? { ...item, status: "Active", updatedAt: at } : item),
    lifecycleCases: state.lifecycleCases.map((item) => item.id === lifecycle.id ? { ...item, status: "Complete", tasks: item.tasks.map((task) => ({ ...task, status: "Complete", completedAt: task.completedAt ?? at })) } : item),
  };
  return appendAudit(next, { actorId, action: "Completed onboarding and activated employment", entityType: "LifecycleCase", entityId: lifecycle.id, before: employee.status, after: "Active" });
}
