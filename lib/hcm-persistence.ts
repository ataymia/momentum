import { isValidCalendarDateKey } from "./date-time";
import type {
  Availability,
  BenefitEnrollment,
  BenefitEvent,
  BenefitPlan,
  Candidate,
  CompensationChangeRequest,
  CompensationRecord,
  Course,
  Dependent,
  EmployeeDocument,
  EmployeePrivateProfile,
  EmploymentChange,
  EmploymentRecord,
  Goal,
  HCMState,
  HcmAuditEvent,
  HcmTask,
  Interview,
  LeaveRequest,
  LifecycleCase,
  Offer,
  PerformanceReview,
  PolicyAcknowledgment,
  PolicyRecord,
  ProfileChangeRequest,
  PtoAssignment,
  PtoLedgerEntry,
  PtoPolicy,
  Requisition,
  ReviewCycle,
  Shift,
  ShiftRequest,
  TrainingAssignment,
  WorkflowRequest,
} from "./hcm-engine";
import type { WorkspaceData } from "./types";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown) => text(value) || undefined;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown) => finite(value) && Number(value) >= 0;
const positive = (value: unknown) => finite(value) && Number(value) > 0;
const integerPositive = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const validDate = (value: unknown) => typeof value === "string" && isValidCalendarDateKey(value);
const optionalDate = (value: unknown) => value === undefined || value === null || value === "" || validDate(value);
const validInstant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const optionalInstant = (value: unknown) => value === undefined || value === null || value === "" || validInstant(value);
const validTime = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const uniqueBy = <T>(records: T[], key: (record: T) => string) => { const seen = new Set<string>(); return records.filter((record) => { const id = key(record); return Boolean(id) && !seen.has(id) && (seen.add(id), true); }); };
const records = (root: Record<string, unknown>, key: keyof HCMState) => Array.isArray(root[key]) ? root[key] as unknown[] : [];
const enumValue = <T extends string>(value: unknown, allowed: Set<string>) => allowed.has(text(value)) ? text(value) as T : undefined;
const actorValid = (value: unknown, users: Set<string>) => text(value) === "system" || users.has(text(value));

const employmentStatuses = new Set(["Prehire", "Active", "Leave", "Separated"]);
const classifications = new Set(["Hourly", "Salary", "Contractor", "Not configured"]);
const profileFields = new Set(["email", "phone", "address", "emergencyContact"]);
const requestStatuses = new Set(["Submitted", "Approved", "Returned"]);
const documentCategories = new Set(["Employment", "Compensation", "Benefits", "Policy", "Tax", "Performance", "Training", "Other"]);
const documentStatuses = new Set(["Available", "Acknowledgment required", "Missing"]);
const policyAudiences = new Set(["Company", "Leadership", "Sales", "Operations"]);
const ptoMethods = new Set(["Accrual", "Front load", "Manual"]);
const ptoLedgerTypes = new Set(["Accrual", "Front load", "Used", "Adjustment", "Carryover", "Reversal"]);
const leaveStatuses = new Set(["Submitted", "Approved", "Returned", "Cancelled"]);
const shiftStatuses = new Set(["Draft", "Published", "Open", "Completed", "Cancelled"]);
const shiftRequestTypes = new Set(["Claim", "Swap", "Drop"]);
const benefitCategories = new Set(["Medical", "Dental", "Vision", "Life", "Disability", "Retirement", "Other"]);
const benefitElections = new Set(["Enroll", "Waive"]);
const benefitEnrollmentStatuses = new Set(["Pending", "Active", "Ended", "Returned"]);
const benefitEvents = new Set(["New hire", "Open enrollment", "Life event", "Admin correction"]);
const lifeEventTypes = new Set(["Marriage", "Birth/adoption", "Loss of coverage", "Divorce", "Other"]);
const payBases = new Set(["Hourly", "Salary per pay period", "Not configured"]);
const compensationStatuses = new Set(["Active", "Future", "Ended"]);
const compensationChangeTypes = new Set(["Merit", "Promotion", "Market", "Correction", "Other"]);
const requisitionStatuses = new Set(["Draft", "Open", "Paused", "Closed"]);
const candidateStages = new Set(["Applied", "Screen", "Interview", "Final", "Offer", "Hired", "Rejected", "Withdrawn"]);
const interviewStatuses = new Set(["Scheduled", "Completed", "Cancelled"]);
const recommendations = new Set(["Advance", "Hold", "Pass"]);
const offerStatuses = new Set(["Draft", "Sent", "Accepted", "Declined", "Withdrawn"]);
const lifecycleTypes = new Set(["Onboarding", "Offboarding"]);
const lifecycleStatuses = new Set(["Open", "Complete", "Cancelled"]);
const lifecycleTaskStatuses = new Set(["Open", "Complete", "Blocked"]);
const trainingStatuses = new Set(["Assigned", "In progress", "Complete"]);
const goalStatuses = new Set(["Draft", "Active", "Complete", "Cancelled"]);
const cycleStatuses = new Set(["Draft", "Open", "Closed"]);
const reviewStatuses = new Set(["Not started", "Employee submitted", "Manager submitted", "Acknowledged"]);
const workflowTypes = new Set(["Profile change", "Employment change", "Compensation", "Benefits", "Schedule", "Document", "Other"]);
const workflowStatuses = new Set(["Submitted", "Approved", "Returned", "Cancelled"]);
const taskStatuses = new Set(["Open", "Complete", "Dismissed"]);

export function normalizePersistedHcmState(input: unknown, data: WorkspaceData, seed: HCMState): HCMState {
  if (!object(input) || Number(input.version) !== 4) return seed;
  const root = input;
  const userIds = new Set(data.users.filter((user) => user.role !== "Customer").map((user) => user.id));
  const teamNames = new Set(data.users.map((user) => user.team));

  const employees = uniqueBy(records(root, "employees").flatMap((raw): EmploymentRecord[] => {
    if (!object(raw)) return [];
    const userId = text(raw.userId); const status = enumValue<EmploymentRecord["status"]>(raw.status, employmentStatuses); const classification = enumValue<EmploymentRecord["classification"]>(raw.classification, classifications);
    if (!userIds.has(userId) || !text(raw.employeeNumber) || !status || !text(raw.jobTitle) || !text(raw.department) || !text(raw.location) || !classification || !text(raw.payGroup) || !optionalDate(raw.hireDate) || !optionalDate(raw.separationDate) || !optionalInstant(raw.updatedAt) || (raw.standardWeeklyHours !== undefined && !nonnegative(raw.standardWeeklyHours))) return [];
    const managerId = optionalText(raw.managerId);
    return [{ userId, employeeNumber: text(raw.employeeNumber), status, hireDate: optionalText(raw.hireDate), separationDate: optionalText(raw.separationDate), jobTitle: text(raw.jobTitle), department: text(raw.department), location: text(raw.location), managerId: managerId && userIds.has(managerId) && managerId !== userId ? managerId : undefined, classification, payGroup: text(raw.payGroup), standardWeeklyHours: finite(raw.standardWeeklyHours) ? Number(raw.standardWeeklyHours) : undefined, updatedAt: validInstant(raw.updatedAt) ? text(raw.updatedAt) : new Date().toISOString() }];
  }), (record) => record.userId);
  const employeeIds = new Set(employees.map((record) => record.userId));
  for (const seeded of seed.employees) if (!employeeIds.has(seeded.userId)) employees.push(seeded);

  const privateProfiles = uniqueBy(records(root, "privateProfiles").flatMap((raw): EmployeePrivateProfile[] => {
    if (!object(raw) || !userIds.has(text(raw.userId)) || !validInstant(raw.updatedAt)) return [];
    return [{ userId: text(raw.userId), phone: optionalText(raw.phone), address: optionalText(raw.address), emergencyContact: optionalText(raw.emergencyContact), preferredName: optionalText(raw.preferredName), updatedAt: text(raw.updatedAt) }];
  }), (record) => record.userId);
  const profileIds = new Set(privateProfiles.map((record) => record.userId));
  for (const seeded of seed.privateProfiles) if (!profileIds.has(seeded.userId)) privateProfiles.push(seeded);

  const employmentChanges = uniqueBy(records(root, "employmentChanges").flatMap((raw): EmploymentChange[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.field) || !text(raw.next) || !validDate(raw.effectiveDate) || !text(raw.reason) || !actorValid(raw.approvedBy, userIds) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as EmploymentChange];
  }), (record) => record.id);

  const profileChangeRequests = uniqueBy(records(root, "profileChangeRequests").flatMap((raw): ProfileChangeRequest[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !profileFields.has(text(raw.field)) || !text(raw.requestedValue) || !text(raw.reason) || !validInstant(raw.submittedAt) || !requestStatuses.has(text(raw.status)) || !optionalInstant(raw.decidedAt)) return [];
    const reviewerId = optionalText(raw.reviewerId); if (reviewerId && !userIds.has(reviewerId)) return [];
    if (["Approved", "Returned"].includes(text(raw.status)) && (!reviewerId || !validInstant(raw.decidedAt))) return [];
    return [raw as unknown as ProfileChangeRequest];
  }), (record) => record.id);

  const documents = uniqueBy(records(root, "documents").flatMap((raw): EmployeeDocument[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.title) || !documentCategories.has(text(raw.category)) || !integerPositive(raw.version) || !documentStatuses.has(text(raw.status)) || !optionalDate(raw.effectiveDate) || !optionalDate(raw.expiresAt) || !optionalInstant(raw.acknowledgedAt) || !validInstant(raw.uploadedAt) || !actorValid(raw.uploadedBy, userIds)) return [];
    if (raw.acknowledgedVersion !== undefined && (!integerPositive(raw.acknowledgedVersion) || Number(raw.acknowledgedVersion) > Number(raw.version))) return [];
    return [raw as unknown as EmployeeDocument];
  }), (record) => record.id);
  const documentIds = new Set(documents.map((record) => record.id));
  for (const seeded of seed.documents) if (!documentIds.has(seeded.id)) documents.push(seeded);

  const policies = uniqueBy(records(root, "policies").flatMap((raw): PolicyRecord[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.title) || !integerPositive(raw.version) || !policyAudiences.has(text(raw.audience)) || !validDate(raw.effectiveDate) || !optionalDate(raw.dueDate) || typeof raw.active !== "boolean" || !text(raw.summary)) return [];
    return [raw as unknown as PolicyRecord];
  }), (record) => record.id);
  const policyById = new Map(policies.map((record) => [record.id, record]));

  const acknowledgments = uniqueBy(records(root, "acknowledgments").flatMap((raw): PolicyAcknowledgment[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.policyId) || !integerPositive(raw.version) || !validInstant(raw.acknowledgedAt)) return [];
    const policy = policyById.get(text(raw.policyId)); if (!policy || Number(raw.version) !== policy.version) return [];
    return [raw as unknown as PolicyAcknowledgment];
  }), (record) => record.id);

  const ptoPolicies = uniqueBy(records(root, "ptoPolicies").flatMap((raw): PtoPolicy[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.name) || typeof raw.active !== "boolean" || !ptoMethods.has(text(raw.method)) || !nonnegative(raw.accrualHoursPerPayPeriod) || !nonnegative(raw.frontLoadHours) || (raw.annualCap !== undefined && !nonnegative(raw.annualCap)) || (raw.carryoverCap !== undefined && !nonnegative(raw.carryoverCap)) || !nonnegative(raw.waitingDays) || !positive(raw.minimumRequestHours) || !validDate(raw.effectiveDate) || !optionalDate(raw.endDate) || (raw.endDate && text(raw.endDate) < text(raw.effectiveDate))) return [];
    return [raw as unknown as PtoPolicy];
  }), (record) => record.id);
  const ptoPolicyIds = new Set(ptoPolicies.map((record) => record.id));

  const ptoAssignments = uniqueBy(records(root, "ptoAssignments").flatMap((raw): PtoAssignment[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !ptoPolicyIds.has(text(raw.policyId)) || !validDate(raw.effectiveDate) || !optionalDate(raw.endDate) || (raw.endDate && text(raw.endDate) < text(raw.effectiveDate))) return [];
    return [raw as unknown as PtoAssignment];
  }), (record) => record.id);

  const leaveRequests = uniqueBy(records(root, "leaveRequests").flatMap((raw): LeaveRequest[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || (raw.policyId && !ptoPolicyIds.has(text(raw.policyId))) || !validDate(raw.startDate) || !validDate(raw.endDate) || text(raw.endDate) < text(raw.startDate) || !positive(raw.requestedHours) || !text(raw.reason) || !validInstant(raw.submittedAt) || !leaveStatuses.has(text(raw.status)) || !optionalInstant(raw.decidedAt)) return [];
    const reviewerId = optionalText(raw.reviewerId); if (reviewerId && !userIds.has(reviewerId)) return [];
    if (["Approved", "Returned"].includes(text(raw.status)) && (!reviewerId || !validInstant(raw.decidedAt))) return [];
    return [raw as unknown as LeaveRequest];
  }), (record) => record.id);
  const leaveById = new Map(leaveRequests.map((record) => [record.id, record]));

  const ptoLedger = uniqueBy(records(root, "ptoLedger").flatMap((raw): PtoLedgerEntry[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !ptoPolicyIds.has(text(raw.policyId)) || !validDate(raw.date) || !ptoLedgerTypes.has(text(raw.type)) || !finite(raw.hours) || Number(raw.hours) === 0 || !text(raw.note) || !actorValid(raw.createdBy, userIds) || !validInstant(raw.createdAt)) return [];
    const requestId = optionalText(raw.requestId);
    if (text(raw.type) === "Used") {
      const request = requestId ? leaveById.get(requestId) : undefined;
      if (!request || request.status !== "Approved" || request.userId !== text(raw.userId) || request.policyId !== text(raw.policyId) || Number(raw.hours) !== -Math.abs(request.requestedHours)) return [];
    }
    return [raw as unknown as PtoLedgerEntry];
  }), (record) => record.id);

  const availability = uniqueBy(records(root, "availability").flatMap((raw): Availability[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !Number.isInteger(raw.weekday) || Number(raw.weekday) < 0 || Number(raw.weekday) > 6 || !validTime(raw.startTime) || !validTime(raw.endTime) || typeof raw.available !== "boolean") return [];
    return [raw as unknown as Availability];
  }), (record) => record.id);

  const shifts = uniqueBy(records(root, "shifts").flatMap((raw): Shift[] => {
    if (!object(raw) || !text(raw.id) || (raw.userId && !userIds.has(text(raw.userId))) || !validDate(raw.date) || !validTime(raw.startTime) || !validTime(raw.endTime) || text(raw.endTime) <= text(raw.startTime) || !text(raw.role) || !text(raw.location) || !shiftStatuses.has(text(raw.status)) || !actorValid(raw.createdBy, userIds) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as Shift];
  }), (record) => record.id);
  const shiftIds = new Set(shifts.map((record) => record.id));

  const shiftRequests = uniqueBy(records(root, "shiftRequests").flatMap((raw): ShiftRequest[] => {
    if (!object(raw) || !text(raw.id) || !shiftIds.has(text(raw.shiftId)) || !userIds.has(text(raw.userId)) || !shiftRequestTypes.has(text(raw.type)) || !text(raw.note) || !validInstant(raw.submittedAt) || !requestStatuses.has(text(raw.status))) return [];
    const reviewerId = optionalText(raw.reviewerId); if (reviewerId && !userIds.has(reviewerId)) return [];
    return [raw as unknown as ShiftRequest];
  }), (record) => record.id);

  const benefitPlans = uniqueBy(records(root, "benefitPlans").flatMap((raw): BenefitPlan[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.name) || !benefitCategories.has(text(raw.category)) || !text(raw.planYear) || !validDate(raw.startDate) || !validDate(raw.endDate) || text(raw.endDate) < text(raw.startDate) || typeof raw.active !== "boolean" || !Array.isArray(raw.tiers) || !text(raw.eligibilityNote)) return [];
    const tierIds = new Set<string>();
    if (raw.tiers.some((tier) => !object(tier) || !text(tier.id) || tierIds.has(text(tier.id)) || !text(tier.name) || !nonnegative(tier.employeeContributionPerPayPeriod) || !nonnegative(tier.employerContributionPerPayPeriod) || !(tierIds.add(text(tier.id))))) return [];
    return [raw as unknown as BenefitPlan];
  }), (record) => record.id);
  const planById = new Map(benefitPlans.map((record) => [record.id, record]));

  const dependents = uniqueBy(records(root, "dependents").flatMap((raw): Dependent[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.name) || !text(raw.relationship) || !optionalDate(raw.birthDate)) return [];
    return [raw as unknown as Dependent];
  }), (record) => record.id);
  const dependentById = new Map(dependents.map((record) => [record.id, record]));

  const benefitEnrollments = uniqueBy(records(root, "benefitEnrollments").flatMap((raw): BenefitEnrollment[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.planId) || !text(raw.tierId) || !Array.isArray(raw.dependentIds) || !benefitElections.has(text(raw.election)) || !benefitEnrollmentStatuses.has(text(raw.status)) || !validDate(raw.effectiveDate) || !optionalDate(raw.endDate) || (raw.endDate && text(raw.endDate) < text(raw.effectiveDate)) || !benefitEvents.has(text(raw.event)) || !validInstant(raw.submittedAt) || !optionalInstant(raw.approvedAt)) return [];
    const plan = planById.get(text(raw.planId)); if (!plan || !plan.tiers.some((tier) => tier.id === text(raw.tierId))) return [];
    const dependentIds = raw.dependentIds.filter((item): item is string => typeof item === "string");
    if (new Set(dependentIds).size !== dependentIds.length || dependentIds.some((id) => dependentById.get(id)?.userId !== text(raw.userId))) return [];
    const approvedBy = optionalText(raw.approvedBy); if (approvedBy && !userIds.has(approvedBy)) return [];
    if (text(raw.status) === "Active" && (!approvedBy || !validInstant(raw.approvedAt))) return [];
    return [raw as unknown as BenefitEnrollment];
  }), (record) => record.id);

  const benefitEventRecords = uniqueBy(records(root, "benefitEvents").flatMap((raw): BenefitEvent[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !lifeEventTypes.has(text(raw.type)) || !validDate(raw.eventDate) || !validInstant(raw.submittedAt) || !requestStatuses.has(text(raw.status))) return [];
    const reviewerId = optionalText(raw.reviewerId); if (reviewerId && !userIds.has(reviewerId)) return [];
    return [raw as unknown as BenefitEvent];
  }), (record) => record.id);

  const compensation = uniqueBy(records(root, "compensation").flatMap((raw): CompensationRecord[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !payBases.has(text(raw.basis)) || !nonnegative(raw.rate) || !validDate(raw.effectiveDate) || !optionalDate(raw.endDate) || (raw.endDate && text(raw.endDate) < text(raw.effectiveDate)) || !text(raw.reason) || !compensationStatuses.has(text(raw.status)) || !actorValid(raw.approvedBy, userIds) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as CompensationRecord];
  }), (record) => record.id);

  const compensationChanges = uniqueBy(records(root, "compensationChanges").flatMap((raw): CompensationChangeRequest[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !compensationChangeTypes.has(text(raw.type)) || !payBases.has(text(raw.proposedBasis)) || !nonnegative(raw.proposedRate) || !validDate(raw.effectiveDate) || !text(raw.reason) || !actorValid(raw.submittedBy, userIds) || !validInstant(raw.submittedAt) || !requestStatuses.has(text(raw.status)) || !optionalInstant(raw.decidedAt)) return [];
    const reviewerId = optionalText(raw.reviewerId); if (reviewerId && !userIds.has(reviewerId)) return [];
    return [raw as unknown as CompensationChangeRequest];
  }), (record) => record.id);

  const requisitions = uniqueBy(records(root, "requisitions").flatMap((raw): Requisition[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.title) || !text(raw.department) || !text(raw.location) || !userIds.has(text(raw.hiringManagerId)) || !integerPositive(raw.openings) || !requisitionStatuses.has(text(raw.status)) || !optionalInstant(raw.openedAt) || !optionalInstant(raw.closedAt) || !validInstant(raw.createdAt) || !actorValid(raw.createdBy, userIds)) return [];
    return [raw as unknown as Requisition];
  }), (record) => record.id);
  const requisitionIds = new Set(requisitions.map((record) => record.id));

  const candidates = uniqueBy(records(root, "candidates").flatMap((raw): Candidate[] => {
    if (!object(raw) || !text(raw.id) || !requisitionIds.has(text(raw.requisitionId)) || !text(raw.name) || !text(raw.email) || !text(raw.source) || !candidateStages.has(text(raw.stage)) || !validInstant(raw.appliedAt)) return [];
    return [raw as unknown as Candidate];
  }), (record) => record.id);
  const candidateIds = new Set(candidates.map((record) => record.id));

  const interviews = uniqueBy(records(root, "interviews").flatMap((raw): Interview[] => {
    if (!object(raw) || !text(raw.id) || !candidateIds.has(text(raw.candidateId)) || !Array.isArray(raw.interviewerIds) || raw.interviewerIds.some((id) => typeof id !== "string" || !userIds.has(id)) || !validInstant(raw.scheduledAt) || !integerPositive(raw.durationMinutes) || !interviewStatuses.has(text(raw.status)) || (raw.score !== undefined && (!finite(raw.score) || Number(raw.score) < 1 || Number(raw.score) > 5)) || (raw.recommendation && !recommendations.has(text(raw.recommendation)))) return [];
    return [raw as unknown as Interview];
  }), (record) => record.id);

  const offers = uniqueBy(records(root, "offers").flatMap((raw): Offer[] => {
    if (!object(raw) || !text(raw.id) || !candidateIds.has(text(raw.candidateId)) || !text(raw.title) || !payBases.has(text(raw.basis)) || !nonnegative(raw.rate) || !validDate(raw.startDate) || !offerStatuses.has(text(raw.status)) || !optionalInstant(raw.sentAt) || !optionalInstant(raw.respondedAt) || (raw.approvedBy && !userIds.has(text(raw.approvedBy)))) return [];
    return [raw as unknown as Offer];
  }), (record) => record.id);

  const lifecycleCases = uniqueBy(records(root, "lifecycleCases").flatMap((raw): LifecycleCase[] => {
    if (!object(raw) || !text(raw.id) || !lifecycleTypes.has(text(raw.type)) || (raw.userId && !userIds.has(text(raw.userId))) || (raw.candidateId && !candidateIds.has(text(raw.candidateId))) || (!raw.userId && !raw.candidateId) || !validDate(raw.effectiveDate) || !lifecycleStatuses.has(text(raw.status)) || !Array.isArray(raw.tasks) || !validInstant(raw.createdAt) || !actorValid(raw.createdBy, userIds)) return [];
    const taskIds = new Set<string>();
    if (raw.tasks.some((task) => !object(task) || !text(task.id) || taskIds.has(text(task.id)) || !(taskIds.add(text(task.id))) || !text(task.title) || (task.ownerId && !userIds.has(text(task.ownerId))) || !optionalDate(task.dueDate) || !lifecycleTaskStatuses.has(text(task.status)) || !optionalInstant(task.completedAt))) return [];
    return [raw as unknown as LifecycleCase];
  }), (record) => record.id);

  const courses = uniqueBy(records(root, "courses").flatMap((raw): Course[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.title) || !text(raw.category) || typeof raw.active !== "boolean" || !text(raw.description) || !Array.isArray(raw.requiredForTeams) || raw.requiredForTeams.some((team) => typeof team !== "string" || !teamNames.has(team)) || !integerPositive(raw.version)) return [];
    return [raw as unknown as Course];
  }), (record) => record.id);
  const courseIds = new Set(courses.map((record) => record.id));
  for (const seeded of seed.courses) if (!courseIds.has(seeded.id)) { courses.push(seeded); courseIds.add(seeded.id); }

  const training = uniqueBy(records(root, "training").flatMap((raw): TrainingAssignment[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !courseIds.has(text(raw.courseId)) || !validDate(raw.assignedAt) || !optionalDate(raw.dueDate) || !trainingStatuses.has(text(raw.status)) || !optionalInstant(raw.completedAt) || (raw.score !== undefined && (!finite(raw.score) || Number(raw.score) < 0))) return [];
    return [raw as unknown as TrainingAssignment];
  }), (record) => record.id);
  const trainingIds = new Set(training.map((record) => record.id));
  for (const seeded of seed.training) if (!trainingIds.has(seeded.id)) training.push(seeded);

  const goals = uniqueBy(records(root, "goals").flatMap((raw): Goal[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !text(raw.title) || !text(raw.measure) || !text(raw.target) || !validDate(raw.periodStart) || !validDate(raw.periodEnd) || text(raw.periodEnd) < text(raw.periodStart) || !goalStatuses.has(text(raw.status)) || !actorValid(raw.createdBy, userIds) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as Goal];
  }), (record) => record.id);

  const reviewCycles = uniqueBy(records(root, "reviewCycles").flatMap((raw): ReviewCycle[] => {
    if (!object(raw) || !text(raw.id) || !text(raw.name) || !validDate(raw.periodStart) || !validDate(raw.periodEnd) || text(raw.periodEnd) < text(raw.periodStart) || !validDate(raw.dueDate) || !cycleStatuses.has(text(raw.status)) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as ReviewCycle];
  }), (record) => record.id);
  const cycleIds = new Set(reviewCycles.map((record) => record.id));

  const reviews = uniqueBy(records(root, "reviews").flatMap((raw): PerformanceReview[] => {
    if (!object(raw) || !text(raw.id) || !cycleIds.has(text(raw.cycleId)) || !userIds.has(text(raw.userId)) || (raw.managerId && !userIds.has(text(raw.managerId))) || !reviewStatuses.has(text(raw.status)) || (raw.rating !== undefined && (!finite(raw.rating) || Number(raw.rating) < 1 || Number(raw.rating) > 5)) || !optionalInstant(raw.employeeSubmittedAt) || !optionalInstant(raw.managerSubmittedAt) || !optionalInstant(raw.acknowledgedAt)) return [];
    return [raw as unknown as PerformanceReview];
  }), (record) => record.id);

  const workflows = uniqueBy(records(root, "workflows").flatMap((raw): WorkflowRequest[] => {
    if (!object(raw) || !text(raw.id) || !userIds.has(text(raw.userId)) || !workflowTypes.has(text(raw.type)) || !text(raw.title) || !text(raw.detail) || !validInstant(raw.submittedAt) || !optionalDate(raw.dueDate) || !workflowStatuses.has(text(raw.status)) || !optionalInstant(raw.decidedAt) || (raw.reviewerId && !userIds.has(text(raw.reviewerId)))) return [];
    return [raw as unknown as WorkflowRequest];
  }), (record) => record.id);

  const tasks = uniqueBy(records(root, "tasks").flatMap((raw): HcmTask[] => {
    if (!object(raw) || !text(raw.id) || (raw.userId && !userIds.has(text(raw.userId))) || !userIds.has(text(raw.ownerId)) || !text(raw.title) || !text(raw.detail) || !optionalDate(raw.dueDate) || !taskStatuses.has(text(raw.status)) || !text(raw.sourceType) || !text(raw.sourceId) || !validInstant(raw.createdAt)) return [];
    return [raw as unknown as HcmTask];
  }), (record) => record.id);

  const audit = uniqueBy(records(root, "audit").flatMap((raw): HcmAuditEvent[] => {
    if (!object(raw) || !text(raw.id) || !validInstant(raw.at) || !actorValid(raw.actorId, userIds) || !text(raw.action) || !text(raw.entityType) || !text(raw.entityId)) return [];
    return [raw as unknown as HcmAuditEvent];
  }), (record) => record.id);

  return {
    version: 4,
    employees,
    employmentChanges,
    privateProfiles,
    profileChangeRequests,
    documents,
    policies,
    acknowledgments,
    ptoPolicies,
    ptoAssignments,
    ptoLedger,
    leaveRequests,
    availability,
    shifts,
    shiftRequests,
    benefitPlans,
    dependents,
    benefitEnrollments,
    benefitEvents: benefitEventRecords,
    compensation,
    compensationChanges,
    requisitions,
    candidates,
    interviews,
    offers,
    lifecycleCases,
    courses,
    training,
    goals,
    reviewCycles,
    reviews,
    workflows,
    tasks,
    audit,
  };
}
