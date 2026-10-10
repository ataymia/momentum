import { isValidCalendarDateKey } from "./date-time";
import {
  STANDARD_SALES_COMMISSION_POLICY,
  salesCommissionPolicyProblem,
  type SalesCommissionPolicy,
} from "./sales-commission-policy";
import type { WorkspaceUser } from "./types";

/**
 * A calculation helper, not a payroll posting or a determination that an invoice qualifies.
 * The caller must supply an independently reconciled qualifying net collected amount.
 */
export type CommissionAllocationInput = {
  qualifyingNetCollectedCents: number;
  /** Collection/earning date, not the order placement date. */
  earningDate: string;
  creditedRepresentativeId: string;
  /** Historical reporting manager recorded for this earning. Never infer from today's hierarchy. */
  designatedManagerId?: string;
  designatedManager?: Pick<WorkspaceUser, "id" | "role" | "title">;
  /** All plan exclusions and subsequent adjustments have been reconciled. */
  basisReconciled: boolean;
};

export type CommissionAllocation =
  | { status: "Blocked"; reason: string }
  | {
    status: "Calculated";
    earningDate: string;
    creditedRepresentativeId: string;
    representativeCents: number;
    managerCents: number;
    managerRecipientId?: string;
    /** Not a wage, commission payable, or amount earmarked for an owner. */
    retainedByCompanyCents: number;
    combinedCommissionExpenseCents: number;
  };

const centsAtRate = (cents: number, rate: number) =>
  Math.round(cents * rate);

/** An access role alone is insufficient to designate a payable Sales Manager. */
export function eligibleCommissionManager(
  input: CommissionAllocationInput,
): string | undefined {
  const manager = input.designatedManager;
  if (
    !input.designatedManagerId ||
    !manager ||
    input.designatedManagerId !== manager.id ||
    manager.role !== "Sales Manager" ||
    !/\bsales manager\b/i.test(manager.title)
  ) return undefined;
  return manager.id;
}

export function allocateStandardSalesCommission(
  input: CommissionAllocationInput,
  policy: SalesCommissionPolicy = STANDARD_SALES_COMMISSION_POLICY,
): CommissionAllocation {
  const policyProblem = salesCommissionPolicyProblem(policy);
  if (policyProblem) return {status: "Blocked", reason: policyProblem};
  if (!input.basisReconciled) {
    return {status: "Blocked", reason: "Qualifying Net Collected Sales must be reconciled before commission calculation."};
  }
  if (!Number.isSafeInteger(input.qualifyingNetCollectedCents) || input.qualifyingNetCollectedCents < 0) {
    return {status: "Blocked", reason: "Verified qualifying sales must be nonnegative integer cents."};
  }
  if (!isValidCalendarDateKey(input.earningDate) ||
      (policy.effectiveDate !== null && input.earningDate < policy.effectiveDate)) {
    return {status: "Blocked", reason: "Invalid earning date or earning predates the approved dated policy."};
  }
  // Launch-to-date approval includes historical recorded sales. Reconciliation and
  // immutable attribution are independent requirements, not a retroactivity cutoff.
  if (!input.creditedRepresentativeId.trim()) {
    return {status: "Blocked", reason: "The credited Sales Representative UID is missing."};
  }
  const rep = centsAtRate(input.qualifyingNetCollectedCents, policy.representativeRate);
  const managerShare = centsAtRate(input.qualifyingNetCollectedCents, policy.managerOverrideRate);
  const managerRecipientId = eligibleCommissionManager(input);
  const managerCents = managerRecipientId ? managerShare : 0;
  return {
    status: "Calculated",
    earningDate: input.earningDate,
    creditedRepresentativeId: input.creditedRepresentativeId,
    representativeCents: rep,
    managerCents,
    managerRecipientId,
    retainedByCompanyCents: managerRecipientId ? 0 : managerShare,
    combinedCommissionExpenseCents: rep + managerCents,
  };
}
