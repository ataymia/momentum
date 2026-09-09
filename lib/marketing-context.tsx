"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { MARKETING_STORAGE_KEY, Asset, Campaign, MarketingAttribution, MarketingRequest, MarketingSpend, MarketingState, MarketingTouch, MaterialItem, MaterialMovement, Partnership, createMarketingSeed, materialBalance, normalizeMarketingState } from "./marketing-engine";
import { useWorkspace } from "./workspace-context";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
type MarketingContextValue={state:MarketingState;submitRequest:(input:Omit<MarketingRequest,"id"|"submittedAt"|"status">)=>string;decideRequest:(id:string,status:"Approved"|"Returned")=>void;fulfillRequest:(id:string)=>void;createCampaign:(input:Omit<Campaign,"id"|"createdAt"|"status">&{status?:Campaign["status"]})=>string;decideCampaign:(id:string,status:"Approved"|"Returned")=>void;setCampaignStatus:(id:string,status:Campaign["status"])=>void;recordSpend:(input:Omit<MarketingSpend,"id"|"submittedAt"|"status"|"submittedBy">)=>string|null;decideSpend:(id:string,status:"Approved"|"Returned")=>void;reconcileSpend:(id:string)=>void;addAsset:(input:Omit<Asset,"id"|"updatedAt"|"updatedBy">)=>string;setAssetStatus:(id:string,status:Asset["status"])=>void;addMaterial:(input:Omit<MaterialItem,"id">)=>string;moveMaterial:(input:Omit<MaterialMovement,"id"|"at"|"actorId">)=>string|null;addTouch:(input:Omit<MarketingTouch,"id"|"createdBy">)=>string;addAttribution:(input:Omit<MarketingAttribution,"id"|"createdAt"|"createdBy"|"reviewed">)=>string;reviewAttribution:(id:string)=>void;addPartnership:(input:Omit<Partnership,"id"|"createdAt"|"ownerId">)=>string;resetMarketing:()=>void};
const MarketingContext=createContext<MarketingContextValue|null>(null);

export function MarketingProvider({children}:{children:ReactNode}){
  const{data,scope,currentUser}=useWorkspace();
  const read=()=>{if(typeof window==="undefined")return createMarketingSeed();try{return normalizeMarketingState(JSON.parse(window.localStorage.getItem(MARKETING_STORAGE_KEY)??"null"));}catch{return createMarketingSeed();}};
  const[state,setState]=useState<MarketingState>(()=>read());
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(MARKETING_STORAGE_KEY,JSON.stringify(state));},[state]);

  const isEmployee=Boolean(currentUser&&currentUser.role!=="Customer");
  const isAdmin=currentUser?.role==="Administrator";
  const accountInScope=(accountId?:string)=>!accountId||scope.accounts.some((account)=>account.id===accountId);
  const campaignExists=(campaignId?:string)=>!campaignId||state.campaigns.some((campaign)=>campaign.id===campaignId);
  const sourceExists=(input:Pick<MarketingAttribution,"sourceType"|"sourceId"|"accountId">)=>{
    if(input.sourceType==="Order"||input.sourceType==="Reorder")return data.orders.some((order)=>order.id===input.sourceId&&order.accountId===input.accountId);
    if(input.sourceType==="Placement")return data.placements.some((placement)=>placement.id===input.sourceId&&placement.accountId===input.accountId);
    if(input.sourceType==="Account opening")return data.accounts.some((account)=>account.id===input.sourceId&&account.id===input.accountId);
    return false;
  };

  const submitRequest=(input:Omit<MarketingRequest,"id"|"submittedAt"|"status">)=>{
    if(!isEmployee||!currentUser||input.requesterId!==currentUser.id||!input.title.trim()||!input.detail.trim()||!accountInScope(input.accountId)||!campaignExists(input.campaignId))return"";
    if(input.quantity!==undefined&&(!Number.isFinite(input.quantity)||input.quantity<=0))return"";
    if(input.materialItemId&&!state.materials.some((item)=>item.id===input.materialItemId&&item.active))return"";
    const id=uid("marketing-request");const record:MarketingRequest={...input,id,submittedAt:now(),status:"Submitted",title:input.title.trim(),detail:input.detail.trim()};setState((s)=>({...s,requests:[record,...s.requests]}));return id;
  };
  const decideRequest=(id:string,status:"Approved"|"Returned")=>{if(!isAdmin)return;setState((s)=>({...s,requests:s.requests.map((request)=>request.id===id&&request.status==="Submitted"?{...request,status,decidedAt:now(),decidedBy:currentUser?.id}:request)}));};
  const fulfillRequest=(id:string)=>{if(!isAdmin)return;setState((s)=>{const request=s.requests.find((item)=>item.id===id&&item.status==="Approved");if(!request)return s;let movements=s.materialMovements;if(request.materialItemId&&request.quantity){if(materialBalance(s,request.materialItemId)<request.quantity)return s;movements=[{id:uid("material-movement"),itemId:request.materialItemId,type:"Issue",quantity:request.quantity,accountId:request.accountId,campaignId:request.campaignId,requestId:request.id,reason:`Fulfilled marketing request: ${request.title}`,at:now(),actorId:currentUser?.id??"system"},...movements];}return{...s,materialMovements:movements,requests:s.requests.map((item)=>item.id===id?{...item,status:"Fulfilled",fulfilledAt:now(),fulfilledBy:currentUser?.id}:item)};});};
  const createCampaign=(input:Omit<Campaign,"id"|"createdAt"|"status">&{status?:Campaign["status"]})=>{
    if(!isEmployee||!currentUser||!input.name.trim()||!input.objective.trim()||!input.audience.trim()||!input.startDate||!input.endDate||input.endDate<input.startDate||!Number.isFinite(input.requestedBudget)||input.requestedBudget<0||!input.successMeasure.trim())return"";
    const id=uid("campaign");const record:Campaign={...input,id,ownerId:currentUser.id,name:input.name.trim(),objective:input.objective.trim(),audience:input.audience.trim(),successMeasure:input.successMeasure.trim(),createdAt:now(),status:"Awaiting approval",approvedBudget:undefined};setState((s)=>({...s,campaigns:[record,...s.campaigns]}));return id;
  };
  const decideCampaign=(id:string,status:"Approved"|"Returned")=>{if(!isAdmin)return;setState((s)=>({...s,campaigns:s.campaigns.map((campaign)=>campaign.id===id&&campaign.status==="Awaiting approval"?{...campaign,status,approvedBudget:status==="Approved"?campaign.requestedBudget:undefined,approvedAt:now(),approvedBy:currentUser?.id}:campaign)}));};
  const setCampaignStatus=(id:string,status:Campaign["status"])=>{if(!isAdmin)return;setState((s)=>({...s,campaigns:s.campaigns.map((campaign)=>{if(campaign.id!==id)return campaign;const allowed=(campaign.status==="Approved"&&status==="Active")||(campaign.status==="Active"&&status==="Complete")||(["Draft","Awaiting approval","Approved","Active"].includes(campaign.status)&&status==="Cancelled");return allowed?{...campaign,status}:campaign;})}));};
  const recordSpend=(input:Omit<MarketingSpend,"id"|"submittedAt"|"status"|"submittedBy">)=>{
    if(!isEmployee||!currentUser)return null;const campaign=state.campaigns.find((item)=>item.id===input.campaignId);if(!campaign||!["Approved","Active","Complete"].includes(campaign.status)||!input.date||!input.vendor.trim()||!input.category.trim()||!Number.isFinite(input.amount)||input.amount<=0||!input.businessPurpose.trim())return null;const id=uid("marketing-spend");const record:MarketingSpend={...input,vendor:input.vendor.trim(),category:input.category.trim(),businessPurpose:input.businessPurpose.trim(),id,status:"Submitted",submittedBy:currentUser.id,submittedAt:now()};setState((s)=>({...s,spend:[record,...s.spend]}));return id;
  };
  const decideSpend=(id:string,status:"Approved"|"Returned")=>{if(!isAdmin)return;setState((s)=>({...s,spend:s.spend.map((spend)=>spend.id===id&&spend.status==="Submitted"?{...spend,status,approvedAt:now(),approvedBy:currentUser?.id}:spend)}));};
  const reconcileSpend=(id:string)=>{if(!isAdmin)return;setState((s)=>({...s,spend:s.spend.map((spend)=>spend.id===id&&spend.status==="Approved"?{...spend,status:"Reconciled",reconciledAt:now()}:spend)}));};
  const addAsset=(input:Omit<Asset,"id"|"updatedAt"|"updatedBy">)=>{if(!isAdmin||!input.name.trim()||!input.type.trim()||!Number.isInteger(input.version)||input.version<1)return"";const id=uid("asset");const record:Asset={...input,name:input.name.trim(),type:input.type.trim(),id,updatedAt:now(),updatedBy:currentUser?.id??"system"};setState((s)=>({...s,assets:[record,...s.assets]}));return id;};
  const setAssetStatus=(id:string,status:Asset["status"])=>{if(!isAdmin)return;setState((s)=>({...s,assets:s.assets.map((asset)=>{if(asset.id!==id)return asset;const allowed=(asset.status==="Draft"&&status==="Approved")||(asset.status==="Approved"&&status==="Retired");return allowed?{...asset,status,updatedAt:now(),updatedBy:currentUser?.id??"system"}:asset;})}));};
  const addMaterial=(input:Omit<MaterialItem,"id">)=>{if(!isAdmin||!input.name.trim()||!input.unit.trim()||input.openingQty<0||input.reorderPoint<0)return"";const id=uid("material");setState((s)=>({...s,materials:[{...input,name:input.name.trim(),unit:input.unit.trim(),id},...s.materials]}));return id;};
  const moveMaterial=(input:Omit<MaterialMovement,"id"|"at"|"actorId">)=>{if(!isAdmin||input.quantity<=0||!input.reason.trim()||!state.materials.some((item)=>item.id===input.itemId)||!accountInScope(input.accountId)||!campaignExists(input.campaignId))return null;if(input.type==="Issue"&&materialBalance(state,input.itemId)<input.quantity)return null;const id=uid("material-movement");const record:MaterialMovement={...input,reason:input.reason.trim(),id,at:now(),actorId:currentUser?.id??"system"};setState((s)=>({...s,materialMovements:[record,...s.materialMovements]}));return id;};
  const addTouch=(input:Omit<MarketingTouch,"id"|"createdBy">)=>{if(!isEmployee||!currentUser||!campaignExists(input.campaignId)||!accountInScope(input.accountId)||!input.occurredAt||!input.summary.trim())return"";const id=uid("marketing-touch");setState((s)=>({...s,touches:[{...input,summary:input.summary.trim(),id,createdBy:currentUser.id},...s.touches]}));return id;};
  const addAttribution=(input:Omit<MarketingAttribution,"id"|"createdAt"|"createdBy"|"reviewed">)=>{if(!isEmployee||!currentUser||!campaignExists(input.campaignId)||!accountInScope(input.accountId)||!input.note.trim()||!sourceExists(input))return"";const id=uid("attribution");setState((s)=>({...s,attributions:[{...input,note:input.note.trim(),id,createdAt:now(),createdBy:currentUser.id,reviewed:false},...s.attributions]}));return id;};
  const reviewAttribution=(id:string)=>{if(!isAdmin)return;setState((s)=>({...s,attributions:s.attributions.map((item)=>item.id===id&&!item.reviewed&&sourceExists(item)?{...item,reviewed:true,reviewedBy:currentUser?.id,reviewedAt:now()}:item)}));};
  const addPartnership=(input:Omit<Partnership,"id"|"createdAt"|"ownerId">)=>{if(!isEmployee||!currentUser||!input.name.trim()||!input.type.trim()||!input.notes.trim()||!campaignExists(input.campaignId))return"";const id=uid("partnership");setState((s)=>({...s,partnerships:[{...input,name:input.name.trim(),type:input.type.trim(),notes:input.notes.trim(),id,createdAt:now(),ownerId:currentUser.id},...s.partnerships]}));return id;};
  const resetMarketing=()=>{if(isAdmin)setState(createMarketingSeed());};
  const value:MarketingContextValue={state,submitRequest,decideRequest,fulfillRequest,createCampaign,decideCampaign,setCampaignStatus,recordSpend,decideSpend,reconcileSpend,addAsset,setAssetStatus,addMaterial,moveMaterial,addTouch,addAttribution,reviewAttribution,addPartnership,resetMarketing};
  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}
export function useMarketing(){const value=useContext(MarketingContext);if(!value)throw new Error("useMarketing must be used inside MarketingProvider");return value;}
