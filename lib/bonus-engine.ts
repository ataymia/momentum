import type { Order, WorkspaceData } from "./types";

export const SALES_REP_ACCOUNT_BONUS_RULE = {
  openingOrderCases: 10,
  openingBonusAmount: 25,
  sustainedAccountCases: 40,
  sustainedBonusAmount: 25,
  windowDays: 90,
  countingBasisLabel: "Settled payments only; 90-day clock starts on the first order date",
};

export type BonusMilestoneStatus = "Not started" | "Awaiting payment" | "Tracking" | "Earned" | "Window expired" | "Not qualified";
export type BonusMilestone = { id:string; accountId:string; repId:string; milestone:"Opening order"|"Sustained account"; amount:number; thresholdCases:number; observedCases:number; status:BonusMilestoneStatus; windowStart?:string; windowEnd?:string; evidenceOrderIds:string[]; ruleNote:string };
const dateAtNoon=(value:string)=>new Date(`${value}T12:00:00`);const dateKey=(date:Date)=>date.toISOString().slice(0,10);const addDays=(value:string,days:number)=>{const date=dateAtNoon(value);date.setDate(date.getDate()+days);return dateKey(date);};

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
    if(!firstOrder){signals.push({id:`bonus-${account.id}-opening`,accountId:account.id,repId:historicalRepId,milestone:"Opening order",amount:rule.openingBonusAmount,thresholdCases:rule.openingOrderCases,observedCases:0,status:"Not started",evidenceOrderIds:[],ruleNote:`The first order must be at least ${rule.openingOrderCases} cases and its payment must settle before the bonus is earned.`});signals.push({id:`bonus-${account.id}-sustained`,accountId:account.id,repId:historicalRepId,milestone:"Sustained account",amount:rule.sustainedBonusAmount,thresholdCases:rule.sustainedAccountCases,observedCases:0,status:"Not started",evidenceOrderIds:[],ruleNote:`The ${rule.windowDays}-day clock begins when the first order is placed. Only orders whose payments settle inside that window count toward the ${rule.sustainedAccountCases}-case milestone.`});continue;}
    const windowStart=firstOrder.placedAt;const windowEnd=addDays(windowStart,rule.windowDays);const openingQualified=firstOrder.cases>=rule.openingOrderCases;const openingSettlement=orderFirstSettlementDate(data,firstOrder);const settledOrdersInWindow=allOrders.filter((order)=>{const settledAt=orderFirstSettlementDate(data,order);return order.placedAt>=windowStart&&order.placedAt<=windowEnd&&Boolean(settledAt&&settledAt<=windowEnd&&settledAt<=asOfKey);});const cumulativeSettledCases=settledOrdersInWindow.reduce((sum,order)=>sum+order.cases,0);const expired=asOfKey>windowEnd;
    signals.push({id:`bonus-${account.id}-opening`,accountId:account.id,repId:historicalRepId,milestone:"Opening order",amount:rule.openingBonusAmount,thresholdCases:rule.openingOrderCases,observedCases:firstOrder.cases,status:!openingQualified?"Not qualified":openingSettlement&&openingSettlement<=asOfKey?"Earned":"Awaiting payment",windowStart,windowEnd,evidenceOrderIds:[firstOrder.id],ruleNote:openingQualified?`Opening order met the ${rule.openingOrderCases}-case threshold. The $${rule.openingBonusAmount} becomes earned when that order's payment first settles. Once earned, later refund or receivable activity does not erase the earning unless a future approved compensation policy explicitly creates a clawback rule. Attribution is locked to the historical opening-order representative.`:`The first order was below ${rule.openingOrderCases} cases, so it does not earn the opening-order bonus.`});
    signals.push({id:`bonus-${account.id}-sustained`,accountId:account.id,repId:historicalRepId,milestone:"Sustained account",amount:rule.sustainedBonusAmount,thresholdCases:rule.sustainedAccountCases,observedCases:cumulativeSettledCases,status:cumulativeSettledCases>=rule.sustainedAccountCases?"Earned":expired?"Window expired":"Tracking",windowStart,windowEnd,evidenceOrderIds:settledOrdersInWindow.map((order)=>order.id),ruleNote:`${cumulativeSettledCases}/${rule.sustainedAccountCases} cases from payments that first settled inside the ${rule.windowDays}-day window beginning ${windowStart}. Once the milestone is earned, later refund or receivable activity does not erase it unless a future approved compensation policy explicitly creates a clawback rule. Attribution remains with the historical opening-account representative unless a future approved compensation rule says otherwise.`});
  }
  return signals;
}
