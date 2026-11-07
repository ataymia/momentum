import {ACCOUNT_PRICING_TIERS} from "./account-health";
import {addCalendarDays,isValidCalendarDateKey} from "./date-time";
import type {PricingTier} from "./types";

/** Supplied retail program. Not connected to live quote or invoice issuance. */
export const RETAIL_PRICE_BOOK=[
  {id:"standard",tier:"C",label:"Standard Wholesale",minCases:1,maxCases:9,pricePerCase:ACCOUNT_PRICING_TIERS.C.pricePerCase},
  {id:"preferred",tier:"B",label:"Preferred Retailer",minCases:10,maxCases:19,pricePerCase:ACCOUNT_PRICING_TIERS.B.pricePerCase},
  {id:"partner",tier:"A",label:"Golden Eagle Partner",minCases:20,maxCases:null,pricePerCase:ACCOUNT_PRICING_TIERS.A.pricePerCase},
] as const;
export const RETAIL_PROGRAM_POLICY={casePack:24,openingMinCases:10,introDays:60,introPrice:24,launchExtensionCases:20} as const;
export type PriceOrder={id:string;accountId:string;placedAt:string;cases:number;status:string;paymentStatus:string;testOnly?:boolean};
export type PriceAssessment={
  status:"Not started"|"Introductory"|"Launch extension"|"Quarterly";
  tier:PricingTier|null;pricePerCase:number|null;
  paidCases:number;averageMonthlyCases:number|null;
  basis:string;periodEnd:string|null;nextReview:string|null;evidenceOrderIds:string[];
};
const key=(year:number,month:number,day:number)=>year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
export function quarterStart(day:string){
  if(!isValidCalendarDateKey(day))throw new Error("Invalid assessment date");
  const year=Number(day.slice(0,4)),month=Number(day.slice(5,7));
  return key(year,Math.floor((month-1)/3)*3+1,1);
}
export function followingQuarterStart(day:string){
  const d=quarterStart(day),year=Number(d.slice(0,4)),month=Number(d.slice(5,7));
  return month===10?key(year+1,1,1):key(year,month+3,1);
}
export function quarterEnd(day:string){return addCalendarDays(followingQuarterStart(day),-1);}
export function tierForMonthlyCases(cases:number):PricingTier{
  if(!Number.isFinite(cases)||cases<0)throw new Error("Invalid case quantity");
  if(cases===0)throw new Error("Zero-case quarters have no documented default price tier.");
  return cases>=20?"A":cases>=10?"B":"C";
}
export function assessRetailPriceBook(accountId:string,records:readonly PriceOrder[],asOf:string):PriceAssessment{
  if(!isValidCalendarDateKey(asOf))throw new Error("Invalid assessment date");
  const orders=records.filter(o=>o.accountId===accountId&&!o.testOnly&&
    ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(o.status)&&
    isValidCalendarDateKey(o.placedAt.slice(0,10))&&o.placedAt.slice(0,10)<=asOf&&
    Number.isSafeInteger(o.cases)&&o.cases>0)
    .sort((a,b)=>a.placedAt.localeCompare(b.placedAt)||a.id.localeCompare(b.id));
  const first=orders[0];
  // A less-than-minimum first order never creates an automatic introductory entitlement.
  // Approved account eligibility still requires a separate owner-approved commercial record.
  if(!first||first.cases<RETAIL_PROGRAM_POLICY.openingMinCases)return{
    status:"Not started",tier:null,pricePerCase:null,paidCases:0,
    averageMonthlyCases:null,basis:first?"Opening order below 10-case qualification":"No approved opening order",
    periodEnd:null,nextReview:null,evidenceOrderIds:[],
  };
  const launchStart=first.placedAt.slice(0,10);
  const launchEnd=addCalendarDays(launchStart,RETAIL_PROGRAM_POLICY.introDays-1);
  const paid=orders.filter(o=>o.paymentStatus==="Paid"&&o.placedAt.slice(0,10)<=asOf);
  const launch=paid.filter(o=>o.placedAt.slice(0,10)>=launchStart&&o.placedAt.slice(0,10)<=launchEnd);
  const sum=(rows:PriceOrder[])=>rows.reduce((n,o)=>n+o.cases,0);
  const launchCases=sum(launch);
  const launchFields={tier:"A" as const,pricePerCase:24,paidCases:launchCases,
    averageMonthlyCases:launchCases/2,evidenceOrderIds:launch.map(o=>o.id)};
  if(asOf<=launchEnd)return{status:"Introductory",...launchFields,basis:"60-day launch",periodEnd:launchEnd,nextReview:addCalendarDays(launchEnd,1)};
  if(launchCases>=RETAIL_PROGRAM_POLICY.launchExtensionCases){
    const extensionEnd=quarterEnd(followingQuarterStart(launchEnd));
    if(asOf<=extensionEnd)return{status:"Launch extension",...launchFields,basis:"20 paid launch cases",periodEnd:extensionEnd,nextReview:addCalendarDays(extensionEnd,1)};
  }
  const day61=addCalendarDays(launchEnd,1),currentQuarter=quarterStart(asOf);
  const launchAverage=launchCases<RETAIL_PROGRAM_POLICY.launchExtensionCases&&quarterStart(day61)===currentQuarter;
  const priorEnd=addCalendarDays(currentQuarter,-1),priorStart=quarterStart(priorEnd);
  const evidence=launchAverage?launch:paid.filter(o=>o.placedAt.slice(0,10)>=priorStart&&o.placedAt.slice(0,10)<=priorEnd);
  const paidCases=sum(evidence),averageMonthlyCases=paidCases/(launchAverage?2:3);
  // Supplied retailer terms explicitly cover 1–9, 10–19 and 20+ case
  // averages, not 0. Returning an authoritative standard price for a
  // zero-case review would invent a commercial rule.
  if(averageMonthlyCases===0)return{
    status:"Quarterly",tier:null,pricePerCase:null,paidCases,averageMonthlyCases,
    basis:"Zero-volume pricing is not defined; owner approval required",
    periodEnd:quarterEnd(asOf),nextReview:addCalendarDays(quarterEnd(asOf),1),
    evidenceOrderIds:evidence.map(o=>o.id),
  };
  const tier=tierForMonthlyCases(averageMonthlyCases);
  return{status:"Quarterly",tier,pricePerCase:ACCOUNT_PRICING_TIERS[tier].pricePerCase,
    paidCases,averageMonthlyCases,basis:launchAverage?"Launch-period monthly average":"Prior calendar-quarter monthly average",
    periodEnd:quarterEnd(asOf),nextReview:addCalendarDays(quarterEnd(asOf),1),evidenceOrderIds:evidence.map(o=>o.id)};
}
