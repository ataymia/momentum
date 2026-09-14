import type { Order, WorkspaceData } from "./types";

export const SALES_REP_ACCOUNT_BONUS_RULE = {
  openingOrderCases: 10,
  openingBonusAmount: 25,
  sustainedAccountCases: 40,
  sustainedBonusAmount: 25,
  windowDays: 90,
  countingBasisLabel: "Settled payments only; the second milestone is 40 total cases within 90 days of the first order, including the qualifying opening order",
};

export type BonusMilestoneStatus = "Not started" | "Awaiting payment" | "Tracking" | "Earned" | "Window expired" | "Not qualified";
export type BonusMilestone = { id:string; accountId:string; repId:string; milestone:"Opening order"|"Sustained account"; amount:number; thresholdCases:number; observedCases:number; status:BonusMilestoneStatus; windowStart?:string; windowEnd?:string; evidenceOrderIds:string[]; ruleNote:string };
const dateAtNoon=(value:string)=>new Date(`${value}T12:00:00`);
const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const addDays=(value:string,days:number)=>{const date=dateAtNoon(value);date.setDate(date.getDate()+days);return dateKey(date);};

export function orderFirstSettlementDate(data:WorkspaceData,order:Order){
  if(order.firstSettledAt)return order.firstSettledAt.slice(0,10);
  if(order.paidAt)return order.paidAt.slice(0,10);
  const auditSettlement=data.activities
    .filter((activity)=>activity.accountId===order.accountId&&activity.title==="Payment cleared"&&activity.detail.includes(order.number))
    .sort((a,b)=>a.at.localeCompare(b.at))[0];
  if(auditSettlement)return auditSettlement.at.slice(0,10);
  if(order.paymentStatus==="Paid")return order.placedAt;
  return undefined;
}

export function evaluateSalesRepAccountBonuses(data:WorkspaceData,asOf=new Date()):BonusMilestone[]{
  const rule=SALES_REP_ACCOUNT_BONUS_RULE;const repIds=new Set(data.users.filter((user)=>user.role==="Sales Representative").map((user)=>user.id));const asOfKey=dateKey(asOf);const signals:BonusMilestone[]=[];
  for(const account of data.accounts){
    const allOrders=data.orders.filter((order)=>order.accountId===account.id).sort((a,b)=>a.placedAt.localeCompare(b.placedAt)||a.id.localeCompare(b.id));
    const firstOrder=allOrders[0];
    const historicalRepId=firstOrder&&repIds.has(firstOrder.ownerId)?firstOrder.ownerId:account.originatorId&&repIds.has(account.originatorId)?account.originatorId:!firstOrder&&repIds.has(account.ownerId)?account.ownerId:undefined;
    if(!historicalRepId)continue;
    if(!firstOrder){signals.push({id:`bonus-${account.id}-opening`,accountId:account.id,repId:historicalRepId,milestone:"Opening order",amount:rule.openingBonusAmount,thresholdCases:rule.openingOrderCases,observedCases:0,status:"Not started",evidenceOrderIds:[],ruleNote:`The first order must be at least ${rule.openingOrderCases} cases and its payment must settle before the opening bonus is earned.`});signals.push({id:`bonus-${account.id}-sustained`,accountId:account.id,repId:historicalRepId,milestone:"Sustained account",amount:rule.sustainedBonusAmount,thresholdCases:rule.sustainedAccountCases,observedCases:0,status:"Not started",evidenceOrderIds:[],ruleNote:`A qualifying opening order starts the ${rule.windowDays}-day window. The account must reach ${rule.sustainedAccountCases} total settled cases in that window, including the opening order.`});continue;}
    const windowStart=firstOrder.placedAt;const windowEnd=addDays(windowStart,rule.windowDays);const openingQualified=firstOrder.cases>=rule.openingOrderCases;const openingSettlement=orderFirstSettlementDate(data,firstOrder);const expired=asOfKey>windowEnd;
    const settledOrdersInWindow=allOrders.filter((order)=>{const settledAt=orderFirstSettlementDate(data,order);return order.placedAt>=windowStart&&order.placedAt<=windowEnd&&Boolean(settledAt&&settledAt<=windowEnd&&settledAt<=asOfKey);});
    const totalSettledCases=settledOrdersInWindow.reduce((sum,order)=>sum+order.cases,0);
    signals.push({id:`bonus-${account.id}-opening`,accountId:account.id,repId:historicalRepId,milestone:"Opening order",amount:rule.openingBonusAmount,thresholdCases:rule.openingOrderCases,observedCases:firstOrder.cases,status:!openingQualified?"Not qualified":openingSettlement&&openingSettlement<=asOfKey?"Earned":"Awaiting payment",windowStart,windowEnd,evidenceOrderIds:[firstOrder.id],ruleNote:openingQualified?`Opening order met the ${rule.openingOrderCases}-case threshold. The $${rule.openingBonusAmount} becomes earned when that order's payment first settles. Once earned, later refund or receivable activity does not erase the earning unless a future approved compensation policy explicitly creates a clawback rule. Attribution is locked to the historical opening-order representative.`:`The first order was below ${rule.openingOrderCases} cases, so it does not qualify as the bonus-eligible opening order.`});
    const sustainedStatus:BonusMilestoneStatus=!openingQualified?"Not qualified":totalSettledCases>=rule.sustainedAccountCases?"Earned":expired?"Window expired":"Tracking";
    signals.push({id:`bonus-${account.id}-sustained`,accountId:account.id,repId:historicalRepId,milestone:"Sustained account",amount:rule.sustainedBonusAmount,thresholdCases:rule.sustainedAccountCases,observedCases:totalSettledCases,status:sustainedStatus,windowStart,windowEnd,evidenceOrderIds:settledOrdersInWindow.map((order)=>order.id),ruleNote:openingQualified?`${totalSettledCases}/${rule.sustainedAccountCases} total cases, including the qualifying opening order, have payments that first settled inside the ${rule.windowDays}-day window beginning ${windowStart}. A 10-case opening order therefore needs 30 more settled cases to earn the second $${rule.sustainedBonusAmount}. Once earned, later refund or receivable activity does not erase it unless a future approved compensation rule says otherwise. Attribution remains with the historical opening-account representative unless a future approved compensation rule says otherwise.`:`The sustained-account bonus cannot qualify because the first order was below the ${rule.openingOrderCases}-case opening threshold.`});
  }
  return signals;
}
