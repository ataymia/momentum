import { appendAudit, type EmployeeDocument, type EmploymentRecord, type HCMState, type LifecycleCase, type TrainingAssignment, type WorkerClassification } from "./hcm-engine";
import { isFailClosedPlaceholder, type AccountAccessState, type IdentityProvisioningRecord, type IdentityProvisioningState, type ProvisioningDraft } from "./identity-provisioning";
import type { WorkspaceData, WorkspaceUser } from "./types";

export type OnboardingReadiness = {
  readyForEmployeeSubmission: boolean;
  readyForActivation: boolean;
  completed: number;
  total: number;
  blockers: string[];
  activationBlockers: string[];
  requiredDocumentIds: string[];
  requiredTrainingIds: string[];
};

type PrepareOnboardingOptions = { preserveExistingEmployee?: boolean };

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

/** Detects the partial-provisioning state that previously stranded an employee after Firebase identity creation. */
export function onboardingPackageNeedsRepair(state: HCMState, draft: ProvisioningDraft, userId: string) {
  const employee = state.employees.find((item) => item.userId === userId);
  if (!employee) return true;
  if (!state.privateProfiles.some((item) => item.userId === userId)) return true;
  if (!state.lifecycleCases.some((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open")) return true;

  const requiredTitles = requiredOnboardingDocumentTemplates(draft.classification).map((item) => item.title.toLowerCase());
  const existingTitles = new Set(state.documents.filter((item) => item.userId === userId).map((item) => item.title.toLowerCase()));
  if (requiredTitles.some((title) => !existingTitles.has(title))) return true;

  const assignedCourseIds = new Set(state.training.filter((item) => item.userId === userId).map((item) => item.courseId));
  if (draft.courseIds.some((courseId) => !assignedCourseIds.has(courseId))) return true;

  if (draft.payBasis !== "Not configured" && draft.payRate && draft.payRate > 0) {
    const compensationExists = state.compensation.some((item) => item.userId === userId && item.effectiveDate === draft.startDate && item.status !== "Ended" && item.basis !== "Not configured" && item.rate > 0);
    if (!compensationExists) return true;
  }
  return false;
}

export function prepareOnboardingPackage(state: HCMState, data: WorkspaceData, draft: ProvisioningDraft, userId: string, actorId: string, options: PrepareOnboardingOptions = { preserveExistingEmployee: true }): HCMState {
  const user = data.users.find((item) => item.id === userId && item.role !== "Customer");
  if (!user || draft.linkedUserId !== userId || user.email.toLowerCase() !== draft.workEmail.toLowerCase()) return state;
  const at = new Date().toISOString();
  const existingEmployee = state.employees.find((item) => item.userId === userId);
  const employeeNumber = existingEmployee?.employeeNumber ?? `MD-${String(state.employees.length + 1).padStart(4, "0")}`;
  const preserve = Boolean(options.preserveExistingEmployee && existingEmployee);
  const preparedEmployee: EmploymentRecord = preserve && existingEmployee ? {
    ...existingEmployee,
    status: "Prehire",
    hireDate: existingEmployee.hireDate ?? draft.startDate,
    jobTitle: existingEmployee.jobTitle.trim() || draft.jobTitle,
    department: existingEmployee.department.trim() || draft.team,
    location: existingEmployee.location.trim() || draft.workLocation,
    managerId: existingEmployee.managerId ?? draft.managerId,
    classification: existingEmployee.classification === "Not configured" ? draft.classification : existingEmployee.classification,
    payGroup: existingEmployee.payGroup.trim() && existingEmployee.payGroup !== "Not configured" ? existingEmployee.payGroup : draft.payGroup,
    standardWeeklyHours: existingEmployee.standardWeeklyHours ?? draft.standardWeeklyHours,
    updatedAt: at,
  } : {
    ...(existingEmployee ?? {
      userId,
      employeeNumber,
      status: "Prehire",
      jobTitle: draft.jobTitle,
      department: draft.team,
      location: draft.workLocation,
      classification: draft.classification,
      payGroup: draft.payGroup,
      updatedAt: at,
    }),
    status: "Prehire",
    hireDate: draft.startDate,
    jobTitle: draft.jobTitle,
    department: draft.team,
    location: draft.workLocation,
    managerId: draft.managerId,
    classification: draft.classification,
    payGroup: draft.payGroup,
    standardWeeklyHours: draft.standardWeeklyHours,
    updatedAt: at,
  };
  const employees = existingEmployee ? state.employees.map((item) => item.userId === userId ? preparedEmployee : item) : [preparedEmployee, ...state.employees];
  const privateProfiles = state.privateProfiles.some((item) => item.userId === userId) ? state.privateProfiles : [{ userId, updatedAt: at }, ...state.privateProfiles];

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
    privateProfiles,
    documents: [...addedDocuments, ...state.documents],
    training: [...addedTraining, ...state.training],
    lifecycleCases: existingCase ? state.lifecycleCases : [lifecycleCase, ...state.lifecycleCases],
  };

  if (draft.payBasis !== "Not configured" && draft.payRate && draft.payRate > 0 && !state.compensation.some((item) => item.userId === userId && item.effectiveDate === draft.startDate && item.status !== "Ended")) {
    next = { ...next, compensation: [{ id: uid("comp"), userId, basis: draft.payBasis, rate: draft.payRate, effectiveDate: draft.startDate, reason: draft.source === "Accepted offer" ? "Accepted employment offer" : "New hire setup", status: "Active", approvedBy: actorId, createdAt: at }, ...next.compensation] };
  }

  return appendAudit(next, { actorId, action: preserve ? "Repaired employee onboarding package" : "Prepared employee onboarding package", entityType: "LifecycleCase", entityId: lifecycleCase.id, before: existingEmployee?.status ?? "Not present", after: "Prehire", reason: `Provisioning draft ${draft.id}` });
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
  const activationBlockers: string[] = [];
  const employeeChecks: boolean[] = [];

  const passwordComplete = Boolean(record?.passwordChangedAt);
  employeeChecks.push(passwordComplete);
  if (!passwordComplete) blockers.push("Change the temporary password.");

  const employmentConfigured = Boolean(employee && employee.status === "Prehire" && employee.jobTitle.trim() && employee.department.trim() && employee.location.trim() && employee.managerId && employee.classification !== "Not configured" && employee.payGroup !== "Not configured");
  employeeChecks.push(employmentConfigured);
  if (!employmentConfigured) blockers.push("HR must finish the employment profile, reporting line, classification, location, and pay group.");

  const profileComplete = Boolean(profile?.phone?.trim() && profile.address?.trim() && profile.emergencyContact?.trim());
  employeeChecks.push(profileComplete);
  if (!profileComplete) blockers.push("Add your phone number, home address, and emergency contact.");

  const compensationConfigured = state.compensation.some((item) => item.userId === userId && item.status !== "Ended" && item.rate > 0 && item.basis !== "Not configured");
  employeeChecks.push(compensationConfigured);
  if (!compensationConfigured) blockers.push("HR must finish approved compensation before onboarding can be submitted.");

  const trainingComplete = training.length > 0 && training.every((item) => item.status === "Complete");
  employeeChecks.push(trainingComplete);
  if (!trainingComplete) blockers.push("Complete all assigned onboarding training.");

  const lifecycleExists = Boolean(lifecycle);
  employeeChecks.push(lifecycleExists);
  if (!lifecycleExists) blockers.push("HR has not prepared the onboarding case yet.");

  const documentsComplete = requiredTitles.size > 0 && documents.length === requiredTitles.size && documents.every((item) => item.status === "Available");
  if (!documentsComplete) activationBlockers.push("Administrator must verify every required employment and tax document before activation.");

  const readyForEmployeeSubmission = passwordComplete && employmentConfigured && profileComplete && compensationConfigured && trainingComplete && lifecycleExists;
  if (!readyForEmployeeSubmission) activationBlockers.push("Employee onboarding has not been completed and submitted.");
  if (record?.state !== "Pending approval") activationBlockers.push("Employee onboarding must be in Pending approval status.");
  const readyForActivation = readyForEmployeeSubmission && documentsComplete && record?.state === "Pending approval";

  return { readyForEmployeeSubmission, readyForActivation, completed: employeeChecks.filter(Boolean).length, total: employeeChecks.length, blockers, activationBlockers, requiredDocumentIds, requiredTrainingIds };
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

/**
 * Explicit Administrator override. This changes access and employment state, but it never fabricates missing
 * documents, training completion, or employee profile data. The reason is preserved in the HCM audit and on
 * the completed lifecycle tasks so an override can be distinguished from ordinary onboarding later.
 */
export function administratorOverrideEmploymentActivation(state: HCMState, data: WorkspaceData, userId: string, actorId: string, reason: string) {
  const target = data.users.find((user) => user.id === userId && user.role !== "Customer" && user.role !== "Administrator");
  const cleanReason = reason.trim();
  if (!target || cleanReason.length < 5) return state;
  const at = new Date().toISOString();
  const existingEmployee = state.employees.find((item) => item.userId === userId);
  const employee: EmploymentRecord = existingEmployee ? { ...existingEmployee, status: "Active", updatedAt: at } : {
    userId,
    employeeNumber: `MD-${String(state.employees.length + 1).padStart(4, "0")}`,
    status: "Active",
    hireDate: undefined,
    jobTitle: target.title,
    department: target.team,
    location: "Not configured",
    managerId: target.managerId,
    classification: "Not configured",
    payGroup: "Not configured",
    updatedAt: at,
  };
  const openCase = state.lifecycleCases.find((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open");
  const completedCase: LifecycleCase = openCase ? {
    ...openCase,
    status: "Complete",
    reason: `Administrator override: ${cleanReason}`,
    tasks: openCase.tasks.map((task) => ({ ...task, status: "Complete", completedAt: task.completedAt ?? at, evidence: task.evidence ?? `Administrator override: ${cleanReason}` })),
  } : {
    id: uid("onboarding-override"), type: "Onboarding", userId, effectiveDate: at.slice(0, 10), status: "Complete", reason: `Administrator override: ${cleanReason}`, createdAt: at, createdBy: actorId,
    tasks: [{ id: uid("task"), title: "Administrator override activation", status: "Complete", completedAt: at, evidence: cleanReason }],
  };
  const next: HCMState = {
    ...state,
    employees: existingEmployee ? state.employees.map((item) => item.userId === userId ? employee : item) : [employee, ...state.employees],
    lifecycleCases: openCase ? state.lifecycleCases.map((item) => item.id === openCase.id ? completedCase : item) : [completedCase, ...state.lifecycleCases],
  };
  return appendAudit(next, { actorId, action: "Administrator bypassed remaining onboarding and activated employment", entityType: "LifecycleCase", entityId: completedCase.id, before: existingEmployee?.status ?? "Not present", after: "Active", reason: cleanReason });
}

/** Everything an Administrator can do to a stuck identity from the onboarding queue. */
export type OnboardingRescueAction =
  | "repairIdentityRecord"
  | "repairOnboardingPackage"
  | "attestPasswordChange"
  | "moveToOnboarding"
  | "advanceToReview"
  | "returnForCorrections"
  | "activate"
  | "overrideAndActivate";

export type OnboardingRescueEntry = {
  user: WorkspaceUser;
  record?: IdentityProvisioningRecord;
  /** "Not provisioned" when Momentum holds no trusted record at all. */
  state: AccountAccessState | "Not provisioned";
  draft?: ProvisioningDraft;
  /** Momentum has no trusted provisioning record, or only the fail-closed placeholder it invented. */
  missingTrustedRecord: boolean;
  /** The employee/document/training/compensation package was never created or is incomplete. */
  packageIncomplete: boolean;
  /** Firebase Auth may hold a rotated password, but Momentum never recorded the local evidence. */
  passwordEvidenceMissing: boolean;
  readiness: OnboardingReadiness;
  diagnosis: string;
  actions: OnboardingRescueAction[];
};

const RESCUE_ORDER: Record<AccountAccessState | "Not provisioned", number> = {
  "Not provisioned": 0,
  Suspended: 1,
  "Password change required": 2,
  Onboarding: 3,
  "Pending approval": 4,
  Separated: 5,
  Active: 6,
};

/**
 * Every non-active internal identity an Administrator may still need to rescue, with the reason it is stuck.
 *
 * The Administrator queue previously listed only `Pending approval`, which left employees who never got past
 * the password change, or who fell back to the fail-closed placeholder, invisible outside Firebase Console.
 */
export function onboardingRescueQueue(hcm: HCMState, data: WorkspaceData, identity: IdentityProvisioningState): OnboardingRescueEntry[] {
  const entries = data.users.flatMap((user): OnboardingRescueEntry[] => {
    if (user.role === "Customer" || user.role === "Administrator") return [];
    const stored = identity.records.find((item) => item.userId === user.id);
    const missingTrustedRecord = !stored || isFailClosedPlaceholder(stored);
    const record = missingTrustedRecord ? undefined : stored;
    if (record?.state === "Active") return [];

    const draft = identity.drafts.find((item) => item.status !== "Cancelled" && (item.id === stored?.draftId || item.linkedUserId === user.id || item.workEmail.toLowerCase() === user.email.toLowerCase()));
    const packageIncomplete = draft ? onboardingPackageNeedsRepair(hcm, { ...draft, linkedUserId: user.id }, user.id) : !hcm.employees.some((item) => item.userId === user.id);
    const readiness = onboardingReadiness(hcm, record, user.id);
    const state: AccountAccessState | "Not provisioned" = missingTrustedRecord ? (stored?.state === "Suspended" ? "Not provisioned" : stored?.state ?? "Not provisioned") : record!.state;

    const actions: OnboardingRescueAction[] = [];
    if (missingTrustedRecord) actions.push("repairIdentityRecord");
    if (packageIncomplete && draft) actions.push("repairOnboardingPackage");
    if (!record?.passwordChangedAt) actions.push("attestPasswordChange");
    if (record?.state !== "Onboarding") actions.push("moveToOnboarding");
    if (record && record.state !== "Pending approval" && readiness.readyForEmployeeSubmission) actions.push("advanceToReview");
    if (record && ["Pending approval", "Onboarding"].includes(record.state)) actions.push("returnForCorrections");
    if (readiness.readyForActivation) actions.push("activate");
    actions.push("overrideAndActivate");

    const diagnosis = missingTrustedRecord
      ? "No trusted Momentum provisioning record. Repair it from the Firebase identity, access record, and saved new-hire setup."
      : packageIncomplete
        ? "The onboarding package (employment record, documents, training, or compensation) is incomplete."
        : record!.state === "Password change required"
          ? "Waiting on the first-login password change. If Firebase Authentication already has a new password, attest it here."
          : record!.state === "Suspended" || record!.state === "Separated"
            ? "Access is closed. Move the employee back into onboarding to restart, or override if activation was already approved."
            : readiness.blockers[0] ?? readiness.activationBlockers[0] ?? "Waiting on Administrator review.";

    return [{ user, record, state, draft, missingTrustedRecord, packageIncomplete, passwordEvidenceMissing: !record?.passwordChangedAt, readiness, diagnosis, actions }];
  });
  return entries.sort((a, b) => RESCUE_ORDER[a.state] - RESCUE_ORDER[b.state] || a.user.name.localeCompare(b.user.name));
}

