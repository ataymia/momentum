"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { validateHcmActorTransition, validateHcmTransition } from "./hcm-controls";
import { HCM_STORAGE_KEY, HCMState, createHcmSeed, normalizeHcmState } from "./hcm-engine";
import { normalizePersistedHcmState } from "./hcm-persistence";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

type HcmMutation=HCMState|((state:HCMState)=>unknown);
type HcmContextValue={hcm:HCMState;setHcm:(mutation:HcmMutation)=>void;resetHcm:()=>void;reloadHcm:()=>void};
const HcmContext=createContext<HcmContextValue|null>(null);

const readState=(data:ReturnType<typeof useWorkspace>["data"]):HCMState=>{
  const seed=createHcmSeed(data);
  if(typeof window==="undefined")return seed;
  try{return normalizePersistedHcmState(JSON.parse(momentumStorage.getItem(HCM_STORAGE_KEY)??"null"),data,seed);}catch{return seed;}
};

const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const safePrehireSelfProfileMutation=(current:HCMState,next:HCMState,userId:string)=>{
  const employment=current.employees.find((item)=>item.userId===userId);
  if(employment?.status!=="Prehire")return false;
  const keys=(Object.keys(current) as (keyof HCMState)[]).filter((key)=>!["privateProfiles","audit"].includes(String(key)));
  if(keys.some((key)=>!same(current[key],next[key])))return false;
  if(current.privateProfiles.length!==next.privateProfiles.length)return false;
  const before=current.privateProfiles.find((item)=>item.userId===userId);
  const after=next.privateProfiles.find((item)=>item.userId===userId);
  if(!before||!after||before.userId!==after.userId)return false;
  if(current.privateProfiles.some((item)=>item.userId!==userId&&!same(item,next.privateProfiles.find((candidate)=>candidate.userId===item.userId))))return false;
  const left=before as unknown as Record<string,unknown>;
  const right=after as unknown as Record<string,unknown>;
  const changed=[...new Set([...Object.keys(left),...Object.keys(right)])].filter((key)=>!same(left[key],right[key]));
  if(!changed.length||changed.some((key)=>!["phone","address","emergencyContact","preferredName","updatedAt"].includes(key)))return false;
  if(next.audit.length!==current.audit.length+1)return false;
  const event=next.audit[0];
  return event?.actorId===userId&&event.entityType==="EmployeePrivateProfile"&&event.entityId===userId;
};

export function HcmProvider({children}:{children:ReactNode}){
  const {data,currentUser}=useWorkspace();
  const runtime=useRuntimeMode();
  const [hcm,setState]=useState<HCMState>(()=>readState(data));
  useEffect(()=>{if(typeof window!=="undefined")momentumStorage.setItem(HCM_STORAGE_KEY,JSON.stringify(hcm));},[hcm]);
  useRemoteStorageSync(HCM_STORAGE_KEY,()=>setState(readState(data)));
  useEffect(()=>{
    const handle=window.setTimeout(()=>setState((current)=>normalizePersistedHcmState(current,data,createHcmSeed(data))),0);
    return()=>window.clearTimeout(handle);
  },[data]);
  const setHcm=(mutation:HcmMutation)=>setState((current)=>{
    const proposed=typeof mutation==="function"?mutation(current):mutation;
    if(!proposed||typeof proposed!=="object")return current;
    const raw=proposed as HCMState;
    const actorCheck=validateHcmActorTransition(current,raw,currentUser,data);
    const onboardingSelfProfile=Boolean(currentUser&&safePrehireSelfProfileMutation(current,raw,currentUser.id));
    if(!actorCheck.ok&&!onboardingSelfProfile)return current;
    const candidate=normalizePersistedHcmState(normalizeHcmState(raw,data),data,createHcmSeed(data));
    return validateHcmTransition(current,candidate).ok?candidate:current;
  });
  const resetHcm=()=>{if(runtime.isDemo&&currentUser?.role==="Administrator")setState(createHcmSeed(data));};
  const reloadHcm=()=>{if(runtime.isDemo&&currentUser?.role==="Administrator")setState(readState(data));};
  return <HcmContext.Provider value={{hcm,setHcm,resetHcm,reloadHcm}}>{children}</HcmContext.Provider>;
}

export function useHcm(){const value=useContext(HcmContext);if(!value)throw new Error("useHcm must be used inside HcmProvider");return value;}
