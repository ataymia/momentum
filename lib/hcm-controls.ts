import { ptoBalance, type HCMState, type LeaveRequest } from "./hcm-engine";

export type HcmTransitionCheck = { ok: boolean; message?: string };
export type LeaveBalanceImpact = { balanceBefore: number; balanceAfter: number; requestedHours: number; insufficientAvailableBalance: boolean };

const usedForRequest = (state: HCMState, requestId: string) => state.ptoLedger.filter((entry) => entry.type === "Used" && entry.requestId === requestId);

export function leaveBalanceImpact(state: HCMState, request: LeaveRequest): LeaveBalanceImpact | undefined {
  if (!request.policyId) return undefined;
  const balanceBefore = ptoBalance(state, request.userId, request.policyId, request.startDate);
  const requestedHours = Math.abs(request.requestedHours);
  return { balanceBefore, balanceAfter: balanceBefore - requestedHours, requestedHours, insufficientAvailableBalance: requestedHours > balanceBefore };
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

  return { ok: true };
}
