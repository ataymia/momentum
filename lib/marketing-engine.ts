import { isValidCalendarDateKey } from "./date-time";
import type { WorkspaceData } from "./types";
import type {CommerceState} from "./commerce-engine";
import {resolvedPaidOrderFacts} from "./commercial-source";

export const MARKETING_STORAGE_KEY="momentum-marketing-v3";
export type MarketingRequestType="Collateral"|"Samples / event"|"Creative"|"Partnership";
export type MarketingRequest={id:string;requesterId:string;type:MarketingRequestType;accountId?:string;campaignId?:string;title:string;detail:string;quantity?:number;materialItemId?:string;neededBy?:string;status:"Submitted"|"Approved"|"Returned"|"Fulfilled";submittedAt:string;decidedAt?:string;decidedBy?:string;fulfilledAt?:string;fulfilledBy?:string};
export type DeliveryMarketingNotice={id:string;requestId:string;requesterId:string;type:MarketingRequestType;accountId?:string;title:string;detail:string;quantity?:number;neededBy?:string;approvedAt:string;approvedBy:string;status:"Approved"|"Fulfilled";fulfilledAt?:string};
export type CampaignStatus="Draft"|"Awaiting approval"|"Approved"|"Active"|"Complete"|"Returned"|"Cancelled";
export type Campaign={id:string;name:string;objective:string;audience:string;startDate:string;endDate:string;requestedBudget:number;approvedBudget?:number;ownerId:string;status:CampaignStatus;successMeasure:string;createdAt:string;approvedAt?:string;approvedBy?:string};
export type MarketingSpend={id:string;campaignId:string;date:string;vendor:string;category:string;amount:number;businessPurpose:string;receiptName?:string;status:"Submitted"|"Approved"|"Returned"|"Reconciled";submittedBy:string;submittedAt:string;approvedAt?:string;approvedBy?:string;reconciledAt?:string};
export type Asset={id:string;name:string;type:string;version:number;status:"Approved"|"Draft"|"Retired";fileName?:string;effectiveDate?:string;updatedAt:string;updatedBy:string};
export type MaterialItem={id:string;name:string;unit:string;active:boolean;reorderPoint:number;openingQty:number};
export type MaterialMovement={id:string;itemId:string;type:"Receipt"|"Issue"|"Adjustment"|"Return";quantity:number;accountId?:string;campaignId?:string;requestId?:string;reason:string;at:string;actorId:string};
export type MarketingTouchType="Ad"|"Event"|"Sample"|"Collateral"|"Partnership"|"Creator / PR"|"Retail activation"|"Other";
export type MarketingTouch={id:string;campaignId:string;accountId?:string;type:MarketingTouchType;occurredAt:string;summary:string;evidence?:string;createdBy:string};
export type AttributionRelation="Sourced"|"Influenced"|"Supported";
export type MarketingAttribution={id:string;campaignId:string;accountId:string;relation:AttributionRelation;sourceType:"Order"|"Placement"|"Account opening"|"Reorder";sourceId:string;note:string;createdAt:string;createdBy:string;reviewed:boolean;reviewedBy?:string;reviewedAt?:string};
export type Partnership={id:string;name:string;type:string;contact?:string;startDate?:string;endDate?:string;status:"Prospect"|"Active"|"Complete"|"Declined";campaignId?:string;notes:string;ownerId:string;createdAt:string};
export type MarketingState={version:3;requests:MarketingRequest[];deliveryNotices:DeliveryMarketingNotice[];campaigns:Campaign[];spend:MarketingSpend[];assets:Asset[];materials:MaterialItem[];materialMovements:MaterialMovement[];touches:MarketingTouch[];attributions:MarketingAttribution[];partnerships:Partnership[]};

const now=()=>new Date().toISOString();
const finiteNonnegative=(value:number)=>Number.isFinite(value)&&value>=0;
const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const validOptionalDate=(value?:string)=>value===undefined||isValidCalendarDateKey(value);
const validInstant=(value?:string)=>value===undefined||!Number.isNaN(new Date(value).getTime());
const validDateRange=(start?:string,end?:string)=>validOptionalDate(start)&&validOptionalDate(end)&&(!start||!end||end>=start);
/** A new workspace has no campaigns, approved collateral, or stock until sourced records exist.
 * Never synthesize an approved Golden Eagle asset, an owner, or account outcomes on hydration. */
export function createMarketingSeed():MarketingState{
 return {version:3,requests:[],deliveryNotices:[],campaigns:[],spend:[],assets:[],
   materials:[],materialMovements:[],touches:[],attributions:[],partnerships:[]};
}
export function normalizeMarketingState(input:unknown):MarketingState{
  const seed=createMarketingSeed();if(!input||typeof input!=="object")return seed;const state=input as Partial<MarketingState>;
  const campaigns=Array.isArray(state.campaigns)?state.campaigns.filter((item)=>item&&item.id&&isValidCalendarDateKey(item.startDate)&&isValidCalendarDateKey(item.endDate)&&item.endDate>=item.startDate&&finiteNonnegative(item.requestedBudget)&&(item.approvedBudget===undefined||finiteNonnegative(item.approvedBudget))):seed.campaigns;
  const requests=Array.isArray(state.requests)?state.requests.filter((item)=>item&&item.id&&item.requesterId&&item.title?.trim()&&item.detail?.trim()&&(item.quantity===undefined||finitePositive(item.quantity))&&validOptionalDate(item.neededBy)):[];
  const storedDeliveryNotices=Array.isArray(state.deliveryNotices)?state.deliveryNotices.filter((item):item is DeliveryMarketingNotice=>Boolean(item&&item.id&&item.requestId&&item.requesterId&&item.title?.trim()&&item.detail?.trim()&&["Approved","Fulfilled"].includes(item.status)&&validInstant(item.approvedAt)&&validInstant(item.fulfilledAt))):[];
  const derivedDeliveryNotices:DeliveryMarketingNotice[]=requests.filter((item)=>item.status==="Approved"||item.status==="Fulfilled").map((item)=>({id:`delivery-notice-${item.id}`,requestId:item.id,requesterId:item.requesterId,type:item.type,accountId:item.accountId,title:item.title,detail:item.detail,quantity:item.quantity,neededBy:item.neededBy,approvedAt:item.decidedAt??item.submittedAt,approvedBy:item.decidedBy??"system",status:item.status as "Approved"|"Fulfilled",fulfilledAt:item.fulfilledAt}));
  const noticeByRequest=new Map<string,DeliveryMarketingNotice>();for(const item of [...storedDeliveryNotices,...derivedDeliveryNotices])noticeByRequest.set(item.requestId,item);const deliveryNotices=[...noticeByRequest.values()];
  const spend=Array.isArray(state.spend)?state.spend.filter((item)=>item&&item.id&&item.campaignId&&isValidCalendarDateKey(item.date)&&finitePositive(item.amount)):[];
  const assets=Array.isArray(state.assets)?state.assets.filter((item)=>item&&item.id&&item.name?.trim()&&item.type?.trim()&&Number.isInteger(item.version)&&item.version>0&&validOptionalDate(item.effectiveDate)):seed.assets;
  const materials=Array.isArray(state.materials)?state.materials.filter((item)=>item&&item.id&&item.name?.trim()&&item.unit?.trim()&&finiteNonnegative(item.reorderPoint)&&finiteNonnegative(item.openingQty)):seed.materials;
  const materialMovements=Array.isArray(state.materialMovements)?state.materialMovements.filter((item)=>item&&item.id&&item.itemId&&finitePositive(item.quantity)):[];
  const touches=Array.isArray(state.touches)?state.touches.filter((item)=>item&&item.id&&item.campaignId&&isValidCalendarDateKey(item.occurredAt)&&item.summary?.trim()):[];
  const attributions=Array.isArray(state.attributions)?state.attributions.filter((item)=>item&&item.id&&item.campaignId&&item.accountId&&item.sourceId&&item.note?.trim()):[];
  const partnerships=Array.isArray(state.partnerships)?state.partnerships.filter((item)=>item&&item.id&&item.name?.trim()&&item.type?.trim()&&item.notes?.trim()&&validDateRange(item.startDate,item.endDate)):[];
  return{version:3,requests,deliveryNotices,campaigns,spend,assets,materials,materialMovements,touches,attributions,partnerships};
}
/** Demo reconciliation requires a recorded receipt reference and prior approval.
 * A filename is not evidence of funds settlement or a verified signed receipt. */
export function marketingSpendReadyForReconciliation(spend:MarketingSpend):boolean{
 return spend.status==="Approved"&&Boolean(spend.receiptName?.trim()&&spend.approvedAt&&spend.approvedBy);
}
export function campaignSpend(state:MarketingState,campaignId:string){return state.spend.filter((item)=>item.campaignId===campaignId&&["Approved","Reconciled"].includes(item.status)&&finitePositive(item.amount)).reduce((sum,item)=>sum+item.amount,0);}
export function materialBalance(state:MarketingState,itemId:string){const item=state.materials.find((material)=>material.id===itemId);if(!item||!finiteNonnegative(item.openingQty))return 0;return item.openingQty+state.materialMovements.filter((movement)=>movement.itemId===itemId&&finitePositive(movement.quantity)).reduce((sum,movement)=>sum+(movement.type==="Receipt"||movement.type==="Return"?movement.quantity:-movement.quantity),0);}
/** Paid means an order marked Paid in legacy source state, not independently verified settlement. */
/** Campaign overlap is not marketing credit. Cash metrics are only source
 * ledger-supported when Commerce is provided, and still do not prove a bank
 * deposit without independent provider reconciliation. */
export function campaignCommercialActivity(state:MarketingState,data:WorkspaceData,campaignId:string,commerce?:CommerceState){
 const campaign=state.campaigns.find(item=>item.id===campaignId);
 if(!campaign)return{paidCases:0,paidRevenue:0,reorders:0,locations:0};
 const linkedAccountIds=new Set([...state.touches.filter(touch=>touch.campaignId===campaignId&&touch.accountId).map(touch=>touch.accountId!),...state.attributions.filter(item=>item.campaignId===campaignId).map(item=>item.accountId)]);
 const ordersById=new Map(data.orders.map(order=>[order.id,order]));
 const paid=resolvedPaidOrderFacts(data,commerce).filter(fact=>{
  const order=ordersById.get(fact.orderId);
  return Boolean(order&&!order.testOnly&&linkedAccountIds.has(fact.accountId)
    &&order.placedAt>=campaign.startDate&&order.placedAt<=campaign.endDate);
 });
 return{
   paidCases:paid.reduce((sum,fact)=>sum+fact.cases,0),
   paidRevenue:paid.reduce((sum,fact)=>sum+fact.amount,0),
   reorders:data.accounts.filter(account=>linkedAccountIds.has(account.id)&&account.reorderCount>0).length,
   locations:linkedAccountIds.size,
 };
}
/** Only reviewed, same-location order attribution joins to paid order evidence. */
export function attributionSummary(state:MarketingState,data:WorkspaceData,campaignId:string,commerce?:CommerceState){
 const records=state.attributions.filter(item=>item.campaignId===campaignId&&item.reviewed);
 const sourceByOrder=new Map(records.filter(item=>item.sourceType==="Order"||item.sourceType==="Reorder").map(item=>[item.sourceId,item.accountId]));
 const facts=resolvedPaidOrderFacts(data,commerce).filter(fact=>sourceByOrder.get(fact.orderId)===fact.accountId);
 return{
  evidenceCount:records.length,
  paidCases:facts.reduce((sum,fact)=>sum+fact.cases,0),
  paidRevenue:facts.reduce((sum,fact)=>sum+fact.amount,0),
 };
}
