"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { CRM_STORAGE_KEY, CrmContact, CrmInteraction, CrmState, Opportunity, ResponsibilityEvent, createCrmSeed, normalizeCrmState } from "./crm-engine";
import { useWorkspace } from "./workspace-context";

const now=()=>new Date().toISOString();
const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
type NewContact=Omit<CrmContact,"id"|"createdAt"|"createdBy">;
type NewInteraction=Omit<CrmInteraction,"id"|"userId"|"occurredAt"> & {occurredAt?:string};
type NewOpportunity=Omit<Opportunity,"id"|"createdAt"|"createdBy"|"updatedAt">;
type CrmContextValue={crm:CrmState;addContact:(input:NewContact)=>string;addInteraction:(input:NewInteraction)=>string;addOpportunity:(input:NewOpportunity)=>string;updateOpportunity:(id:string,patch:Partial<Opportunity>)=>void;recordResponsibility:(input:Omit<ResponsibilityEvent,"id"|"effectiveAt"|"changedBy">&{effectiveAt?:string})=>void;resetCrm:()=>void};
const CrmContext=createContext<CrmContextValue|null>(null);

export function CrmProvider({children}:{children:ReactNode}){
  const{data,currentUser}=useWorkspace();
  const read=()=>{if(typeof window==="undefined")return createCrmSeed(data);try{return normalizeCrmState(JSON.parse(window.localStorage.getItem(CRM_STORAGE_KEY)??"null"),data);}catch{return createCrmSeed(data);}};
  const[crm,setCrm]=useState<CrmState>(()=>read());
  useEffect(()=>{setCrm((current)=>normalizeCrmState(current,data));},[data]);
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(CRM_STORAGE_KEY,JSON.stringify(crm));},[crm]);
  const addContact=(input:NewContact)=>{const id=uid("contact");const record:CrmContact={...input,id,createdAt:now(),createdBy:currentUser?.id??"system"};setCrm((state)=>({...state,contacts:[record,...(input.primary?state.contacts.map((item)=>item.scope===input.scope&&item.customerId===input.customerId&&item.locationId===input.locationId?{...item,primary:false}:item):state.contacts)]}));return id;};
  const addInteraction=(input:NewInteraction)=>{const id=uid("interaction");const record:CrmInteraction={...input,id,userId:currentUser?.id??"system",occurredAt:input.occurredAt??now()};setCrm((state)=>({...state,interactions:[record,...state.interactions]}));return id;};
  const addOpportunity=(input:NewOpportunity)=>{const id=uid("opportunity");const stamp=now();const record:Opportunity={...input,id,createdAt:stamp,createdBy:currentUser?.id??"system",updatedAt:stamp};setCrm((state)=>({...state,opportunities:[record,...state.opportunities]}));return id;};
  const updateOpportunity=(id:string,patch:Partial<Opportunity>)=>setCrm((state)=>({...state,opportunities:state.opportunities.map((item)=>item.id===id?{...item,...patch,updatedAt:now()}:item)}));
  const recordResponsibility=(input:Omit<ResponsibilityEvent,"id"|"effectiveAt"|"changedBy">&{effectiveAt?:string})=>{const record:ResponsibilityEvent={...input,id:uid("responsibility"),effectiveAt:input.effectiveAt??now(),changedBy:currentUser?.id??"system"};setCrm((state)=>({...state,responsibilityHistory:[record,...state.responsibilityHistory]}));};
  const resetCrm=()=>setCrm(createCrmSeed(data));
  const value=useMemo(()=>({crm,addContact,addInteraction,addOpportunity,updateOpportunity,recordResponsibility,resetCrm}),[crm,currentUser,data]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
export function useCrm(){const value=useContext(CrmContext);if(!value)throw new Error("useCrm must be used inside CrmProvider");return value;}
