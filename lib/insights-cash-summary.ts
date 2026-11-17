import type {CollectedCashFact,PaidOrderFact} from "./commercial-source";

export type MonthlyCashEvidence={month:string;collections:number;refunds:number;net:number};
export type InsightCashSummary={
 collections:number; refunds:number; net:number; cashEventCount:number;
 markedPaidOrders:number; markedPaidCases:number; reorderAccounts:number;
 months:MonthlyCashEvidence[];
};
const cents=(value:number)=>Math.round(value*100);
const within=(day:string,start:string,end:string)=>day>=start&&day<=end;

/** Period-scoped evidence. Legacy paid-status orders remain marked-paid, not bank-certified.
 * Collected cash uses cleared allocations and settled refunds only. */
export function insightCashSummary(
 cashFacts:ReadonlyArray<CollectedCashFact>,paidFacts:ReadonlyArray<PaidOrderFact>,
 start:string,end:string
):InsightCashSummary{
 const cash=cashFacts.filter(f=>within(f.settledAt,start,end)&&Number.isFinite(f.amount));
 const collectionsCents=cash.filter(f=>f.kind==="Collection").reduce((sum,f)=>sum+cents(f.amount),0);
 const refundCents=cash.filter(f=>f.kind==="Refund").reduce((sum,f)=>sum+Math.abs(cents(f.amount)),0);
 const paid=paidFacts.filter(f=>within(f.paidAt,start,end));
 const seenOrders=new Set<string>(),uniquePaid=paid.filter(f=>{if(seenOrders.has(f.orderId))return false;seenOrders.add(f.orderId);return true;});
 const historical=paidFacts.filter(f=>f.paidAt<=end).sort((a,b)=>a.paidAt.localeCompare(b.paidAt)||a.orderId.localeCompare(b.orderId));
 const accountOrders=new Map<string,number>(),reordered=new Set<string>(),knownOrders=new Set<string>();
 for(const fact of historical){
  if(knownOrders.has(fact.orderId))continue;knownOrders.add(fact.orderId);
  const count=accountOrders.get(fact.accountId)??0;
  if(count>=1&&within(fact.paidAt,start,end))reordered.add(fact.accountId);
  accountOrders.set(fact.accountId,count+1);
 }
 const byMonth=new Map<string,{collections:number;refunds:number}>();
 for(const fact of cash){
  const month=fact.settledAt.slice(0,7);
  const old=byMonth.get(month)??{collections:0,refunds:0};
  if(fact.kind==="Collection")old.collections+=cents(fact.amount);
  else old.refunds+=Math.abs(cents(fact.amount));
  byMonth.set(month,old);
 }
 const months=[...byMonth.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([month,v])=>({
  month,collections:v.collections/100,refunds:v.refunds/100,net:(v.collections-v.refunds)/100
 }));
 return {collections:collectionsCents/100,refunds:refundCents/100,net:(collectionsCents-refundCents)/100,cashEventCount:cash.length,
  markedPaidOrders:uniquePaid.length,markedPaidCases:uniquePaid.reduce((sum,f)=>sum+f.cases,0),
  reorderAccounts:reordered.size,months};
}
