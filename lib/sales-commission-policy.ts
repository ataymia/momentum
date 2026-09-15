import { isValidCalendarDateKey } from "./date-time";

export type SalesCommissionPolicy = {
  basis: "Qualifying Net Collected Sales";
  representativeRate: number;
  managerOverrideRate: number;
  maxCombinedRate: number;
  /** Written prospective effective date. Null means the rate is approved but not yet safe to calculate in payroll. */
  effectiveDate: string | null;
};

/**
 * Confirmed 2026-09-15 standard allocation for representative-generated qualifying sales.
 *
 * Do not infer retroactivity. The written effective date still has to be approved before percentage
 * commission can be calculated or added to payroll.
 */
export const STANDARD_SALES_COMMISSION_POLICY: SalesCommissionPolicy = {
  basis: "Qualifying Net Collected Sales",
  representativeRate: 0.025,
  managerOverrideRate: 0.005,
  maxCombinedRate: 0.03,
  effectiveDate: null,
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
  if (!policy.effectiveDate) return "Written commission effective date is required before payroll calculation.";
  if (!isValidCalendarDateKey(policy.effectiveDate)) return "Commission effective date is invalid.";
  return null;
}

export function standardSalesCommissionPolicyReady(policy: SalesCommissionPolicy = STANDARD_SALES_COMMISSION_POLICY) {
  return salesCommissionPolicyProblem(policy) === null;
}
