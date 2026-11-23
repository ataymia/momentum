import {isValidCalendarDateKey} from "./date-time";
import {STANDARD_SALES_COMMISSION_POLICY,type SalesCommissionPolicy} from "./sales-commission-policy";
import type {CommissionRateAdjustment,HCMState} from "./hcm-engine";

/** Percentages are stored as decimals. No plan here is itself a payroll authorization. */
export function commissionAdjustmentProblem(plan:Pick<CommissionRateAdjustment,
  "userId"|"representativeRate"|"managerOverrideRate"|"effectiveDate"|"reason"|"approvalReference">):string|null{
  if(!plan.userId.trim())return "Choose a representative.";
  if(!Number.isFinite(plan.representativeRate)||!Number.isFinite(plan.managerOverrideRate)||
    plan.representativeRate<0||plan.managerOverrideRate<0||
    plan.representativeRate+plan.managerOverrideRate>1)
    return "Commission shares must be nonnegative and total at most 100%.";
  if(!isValidCalendarDateKey(plan.effectiveDate))return "Choose a valid effective date.";
  if(!plan.reason.trim())return "Record the business reason.";
  if(!plan.approvalReference.trim())return "Record a verified signed-plan or owner-approval reference.";
  return null;
}

/** The policy for a source earning uses its collection date, not the current date. */
export function commissionPolicyForRepresentative(state:HCMState,repId:string,earningDate:string):SalesCommissionPolicy{
  if(!isValidCalendarDateKey(earningDate))return STANDARD_SALES_COMMISSION_POLICY;
  const plan=state.commissionRateAdjustments
    .filter(item=>item.userId===repId && item.effectiveDate<=earningDate)
    .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];
  if(!plan||commissionAdjustmentProblem(plan))return STANDARD_SALES_COMMISSION_POLICY;
  return {
    basis:"Qualifying Net Collected Sales",
    representativeRate:plan.representativeRate,
    managerOverrideRate:plan.managerOverrideRate,
    maxCombinedRate:plan.representativeRate+plan.managerOverrideRate,
    effectiveDate:plan.effectiveDate,
    retroactiveToLaunch:false,
  };
}
