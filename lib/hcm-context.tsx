"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { validateHcmActorTransition, validateHcmTransition } from "./hcm-controls";
import { HCM_STORAGE_KEY, HCMState, createHcmSeed, normalizeHcmState } from "./hcm-engine";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

type HcmMutation=HCMState|((state:HCMState)=>unknown);
type HcmContextValue={hcm:HCMState;setHcm:(mutation:HcmMutation)=>void;resetHcm:()=>void;reloadHcm:()=>void};
const HcmContext=createContext<HcmContextValue|null>(null);

const readState=(data:ReturnType<typeof useWorkspace>["data"]):HCMState=>{
  if(typeof window==="undefined")return createHcmSeed(data);
  try{return normalizeHcmState(JSON.parse(window.localStorage.getItem(HCM_STORAGE_KEY)??"null"),data);}catch{return createHcmSeed(data);}
};

export function HcmProvider({children}:{children:ReactNode}){
  const {data,currentUser}=useWorkspace();
  const runtime=useRuntimeMode();
  const [hcm,setState]=useState<HCMState>(()=>readState(data));
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(HCM_STORAGE_KEY,JSON.stringify(hcm));},[hcm]);
  const setHcm=(mutation:HcmMutation)=>setState((current)=>{
    const proposed=typeof mutation==="function"?mutation(current):mutation;
    if(!proposed||typeof proposed!=="object")return current;
    const raw=proposed as HCMState;
    const actorCheck=validateHcmActorTransition(current,raw,currentUser,data);
    if(!actorCheck.ok)return current;
    const candidate=normalizeHcmState(raw,data);
    return validateHcmTransition(current,candidate).ok?candidate:current;
  });
  const resetHcm=()=>{if(runtime.isDemo&&currentUser?.role==="Administrator")setState(createHcmSeed(data));};
  const reloadHcm=()=>{if(runtime.isDemo&&currentUser?.role==="Administrator")setState(readState(data));};
  return <HcmContext.Provider value={{hcm,setHcm,resetHcm,reloadHcm}}>{children}</HcmContext.Provider>;
}

export function useHcm(){const value=useContext(HcmContext);if(!value)throw new Error("useHcm must be used inside HcmProvider");return value;}
