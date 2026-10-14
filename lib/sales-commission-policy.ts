import { isValidCalendarDateKey } from "./date-time";

export type SalesCommissionPolicy = {
  basis: "Qualifying Net Collected Sales";
  representativeRate: number;
  managerOverrideRate: number;
  maxCombinedRate: number;
  /** A dated change, if explicitly approved; not inferred from system timestamps. */
  effectiveDate: string | null;
  /** Approved launch-to-date treatment for all recorded Momentum sales, including backlog. */
  retroactiveToLaunch?: boolean;
};

/**
 * Approved 2.50% representative plus 0.50% eligible-manager allocation.
 *
 * October 10, 2026 direction: apply to all Momentum sales since business launch,
 * including existing/backlogged orders. No calendar launch date was verified.
 * Collection and qualifying revenue reconciliation still gate actual payroll.
 */
export const STANDARD_SALES_COMMISSION_POLICY: SalesCommissionPolicy = {
  basis: "Qualifying Net Collected Sales",
  representativeRate: 0.025,
  managerOverrideRate: 0.005,
  maxCombinedRate: 0.03,
  effectiveDate: null,
  retroactiveToLaunch: true,
};

export const QUALIFYING_NET_COLLECTED_SALES_EXCLUSIONS = [
  "Sales taxes",
  "Refunds",
  "Returns",
  "Credits",
  "Rebates",
  "Promotional allowances",
  "Chargebacks",
  "Uncollected invoices",
  "Bad debt",
  "Customer discounts",
  "Freight separately charged to customers",
  "Other amounts not ultimately retained as product sales revenue",
] as const;

export function salesCommissionPolicyProblem(policy: SalesCommissionPolicy = STANDARD_SALES_COMMISSION_POLICY) {
  if (!Number.isFinite(policy.representativeRate) || policy.representativeRate < 0) return "Sales Representative commission rate is invalid.";
  if (!Number.isFinite(policy.managerOverrideRate) || policy.managerOverrideRate < 0) return "Sales Manager override rate is invalid.";
  if (!Number.isFinite(policy.maxCombinedRate) || policy.maxCombinedRate < 0) return "Maximum combined commission rate is invalid.";
  if (Math.abs(policy.representativeRate + policy.managerOverrideRate - policy.maxCombinedRate) > 0.0000001) return "Commission allocation does not equal the approved maximum combined rate.";
  if (policy.retroactiveToLaunch && policy.effectiveDate) return "Choose launch-to-date or a dated policy, not both.";
  if (!policy.retroactiveToLaunch && !policy.effectiveDate) return "Commission effective date or an approved launch-to-date rule is required.";
  if (policy.effectiveDate && !isValidCalendarDateKey(policy.effectiveDate)) return "Commission effective date is invalid.";
  return null;
}

export function standardSalesCommissionPolicyReady(policy: SalesCommissionPolicy = STANDARD_SALES_COMMISSION_POLICY) {
  return salesCommissionPolicyProblem(policy) === null;
}
