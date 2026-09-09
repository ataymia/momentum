import { ptoBalance, type BenefitEnrollment, type HCMState, type LeaveRequest } from "./hcm-engine";

export type HcmTransitionCheck = { ok: boolean; message?: string };
export type LeaveBalanceImpact = { balanceBefore: number; balanceAfter: number; requestedHours: number; insufficientAvailableBalance: boolean };

const usedForRequest = (state: HCMState, requestId: string) => state.ptoLedger.filter((entry) => entry.type === "Used" && entry.requestId === requestId);
const rangeEnd = (value?: string) => value ?? "9999-12-31";
const rangesOverlap = (left: BenefitEnrollment, right: BenefitEnrollment) => left.effectiveDate <= rangeEnd(right.endDate) && right.effectiveDate <= rangeEnd(left.endDate);

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
