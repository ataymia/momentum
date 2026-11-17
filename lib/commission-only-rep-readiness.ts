import {validExternalVerification} from "./hr-document-controls";
import type {HCMState} from "./hcm-engine";
import {STANDARD_SALES_COMMISSION_POLICY,salesCommissionPolicyProblem} from "./sales-commission-policy";
import {activeTerritories} from "./territory-engine";
import type {WorkspaceData} from "./types";

/** C25 is a preflight review, not a legal classification determination or payroll authorization. */
export type CommissionOnlyRepresentativeReview={
  repId:string;
  repName:string;
  activeDirectoryUser:boolean;
  employmentStatus:string;
  workerClassification:string;
  verifiedCommissionOnlyAgreement:boolean;
  activeTerritoryZips:string[];
  attributedOrders:number;
  missingExplicitAttribution:number;
  commissionRates:{representative:number;managerOverride:number;combined:number};
  blockers:string[];
  /** Deliberately always false while no reconciled, audited commission payroll writer exists. */
  automaticPaymentEnabled:false;
};

export function commissionOnlyRepresentativeReview(
  data:WorkspaceData,hcm:HCMState,repId:string,
):CommissionOnlyRepresentativeReview{
  const user=data.users.find(u=>u.id===repId);
  const activeDirectoryUser=Boolean(user?.role==="Sales Representative"&&user.employmentStatus!=="Separated");
  const employment=hcm.employees.find(e=>e.userId===repId);
  const documents=hcm.documents.filter(d=>d.userId===repId&&d.category==="Compensation");
  const verifiedCommissionOnlyAgreement=documents.some(d=>
    /commission[ -]?only|sales commission agreement/i.test(d.title)&&d.status==="Available"&&
    validExternalVerification(d.verification,d.version));
  const territoryZips=[...new Set(activeTerritories(data)
    .filter(territory=>territory.ownerId===repId)
    .flatMap(territory=>territory.postalCodes))].sort();
  const orders=data.orders.filter(o=>o.ownerId===repId||o.creditedRepId===repId)
    .filter(o=>o.status!=="Cancelled"&&!o.testOnly);
  const missingExplicitAttribution=orders.filter(o=>!o.creditedRepId).length;
  const attributedOrders=orders.filter(o=>o.creditedRepId===repId).length;
  const activeBasePay=hcm.compensation.some(c=>
    c.userId===repId&&c.status==="Active"&&["Hourly","Salary per pay period"].includes(c.basis)&&c.rate>0);
  const blockers:string[]=[];
  if(!activeDirectoryUser)blockers.push("No currently active Sales Representative directory identity.");
  if(employment?.status!=="Active")blockers.push("Employment/onboarding record is not active.");
  if(!employment||employment.classification==="Not configured")
    blockers.push("HR must record a reviewed worker classification; commission-only does not establish contractor status.");
  if(activeBasePay)blockers.push("An active hourly or salary basis conflicts with a commission-only designation; reconcile the approved compensation record.");
  if(!verifiedCommissionOnlyAgreement)
    blockers.push("Missing externally verified, current-version signed commission-only agreement.");
  if(!territoryZips.length)
    blockers.push("No active assigned territory/ZIP scope; geographic guidance and exception responsibility must be confirmed.");
  if(missingExplicitAttribution>0)
    blockers.push(missingExplicitAttribution+" recorded order(s) lack a locked credited representative; reconcile historical attribution.");
  const policyProblem=salesCommissionPolicyProblem();
  if(policyProblem)blockers.push(policyProblem);
  blockers.push("Commission payout is blocked: qualifying net collected sales, refund exclusions, prior disbursements, signed plan and payroll disbursement controls are not integrated into an approved release path.");
  return {
    repId,repName:user?.name??"Unverified user",
    activeDirectoryUser,employmentStatus:employment?.status??"Not configured",
    workerClassification:employment?.classification??"Not configured",
    verifiedCommissionOnlyAgreement,activeTerritoryZips:territoryZips,
    attributedOrders,missingExplicitAttribution,
    commissionRates:{
      representative:STANDARD_SALES_COMMISSION_POLICY.representativeRate,
      managerOverride:STANDARD_SALES_COMMISSION_POLICY.managerOverrideRate,
      combined:STANDARD_SALES_COMMISSION_POLICY.maxCombinedRate,
    },
    blockers,automaticPaymentEnabled:false,
  };
}
