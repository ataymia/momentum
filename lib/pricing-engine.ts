import { addCalendarDays, arizonaDateKey, isValidCalendarDateKey } from "./date-time";
import { assessRetailPriceBook, quarterStart, RETAIL_PROGRAM_POLICY } from "./retail-price-book";
import type { PricingTier, WorkspaceData } from "./types";

/** The sales-bonus 90-day window does not govern retailer pricing. */
export const PARTNER_PRICING_RULE = {
  casePack: RETAIL_PROGRAM_POLICY.casePack,
  partnerPricePerCan: 1,
  partnerPricePerCase: RETAIL_PROGRAM_POLICY.introPrice,
  introDays: RETAIL_PROGRAM_POLICY.introDays,
  introQualificationCases: RETAIL_PROGRAM_POLICY.launchExtensionCases,
  reviewCadence: "calendar quarter",
} as const;

export type PartnerPricingStatus = "Not started" | "Intro partner pricing" | "Partner pricing" | "Standard pricing";
export type PartnerPricingEvaluation = {
  accountId: string;
  status: PartnerPricingStatus;
  effectiveTier?: PricingTier;
  outsidePartnerTier?: Exclude<PricingTier,"A">;
  firstOrderDate?: string;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  countedCases: number;
  thresholdCases: number;
  partnerPricePerCase: number;
  currentPricePerCase?: number;
  reason: string;
  nextReviewDate?: string;
  evidenceOrderIds: string[];
};

export function evaluatePartnerPricing(data: WorkspaceData,accountId: string,asOf=new Date()): PartnerPricingEvaluation {
  const account=data.accounts.find(item=>item.id===accountId);
  const outsidePartnerTier=account?.pricingTier==="B"||account?.pricingTier==="C"?account.pricingTier:undefined;
  const asOfKey=arizonaDateKey(asOf);
  const assessed=assessRetailPriceBook(accountId,data.orders,asOfKey);
  const firstOrder=data.orders
    .filter(order=>order.accountId===accountId&&!order.testOnly&&
      ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status)&&
      isValidCalendarDateKey(order.placedAt.slice(0,10))&&order.placedAt.slice(0,10)<=asOfKey&&
      Number.isSafeInteger(order.cases)&&order.cases>0)
    .sort((a,b)=>a.placedAt.localeCompare(b.placedAt)||a.id.localeCompare(b.id))[0];
  if(assessed.status==="Not started"){
    return{
      accountId,status:"Not started",effectiveTier:"A",outsidePartnerTier,
      firstOrderDate:firstOrder?.placedAt.slice(0,10),
      countedCases:0,thresholdCases:RETAIL_PROGRAM_POLICY.openingMinCases,
      partnerPricePerCase:RETAIL_PROGRAM_POLICY.introPrice,
      // Provisional price for an opening order; createOrder validates its 10-case minimum.
      currentPricePerCase:RETAIL_PROGRAM_POLICY.introPrice,
      reason:"Qualified new locations can request a minimum 10-case opening order at $24/case. The 60-day retailer window starts with an approved opening order.",
      evidenceOrderIds:[],
    };
  }
  const status:PartnerPricingStatus=assessed.status==="Introductory"?"Intro partner pricing":
    assessed.status==="Launch extension"||assessed.tier==="A"?"Partner pricing":"Standard pricing";
  const periodStart=assessed.status==="Introductory"?firstOrder?.placedAt.slice(0,10):
    assessed.status==="Launch extension"&&firstOrder?
    addCalendarDays(firstOrder.placedAt.slice(0,10),RETAIL_PROGRAM_POLICY.introDays):quarterStart(asOfKey);
  const message=assessed.status==="Introductory"?"60-day introductory retailer pricing":
    assessed.status==="Launch extension"?"20 qualifying launch cases preserve the $24 retailer price through the next full calendar quarter":
    assessed.tier?"Retailer tier from average monthly purchases in the completed prior calendar quarter":
    "No automatic price is documented for this review period; pricing requires approval.";
  return{
    accountId,status,effectiveTier:assessed.tier??undefined,outsidePartnerTier,
    firstOrderDate:firstOrder?.placedAt.slice(0,10),
    currentWindowStart:periodStart,currentWindowEnd:assessed.periodEnd??undefined,
    countedCases:assessed.paidCases,thresholdCases:RETAIL_PROGRAM_POLICY.launchExtensionCases,
    partnerPricePerCase:RETAIL_PROGRAM_POLICY.introPrice,
    currentPricePerCase:assessed.pricePerCase??undefined,
    reason:message+" "+assessed.basis,
    nextReviewDate:assessed.nextReview??undefined,
    evidenceOrderIds:assessed.evidenceOrderIds,
  };
}
