"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { HCM_STORAGE_KEY, HCMState, createHcmSeed, normalizeHcmState } from "./hcm-engine";
import { useWorkspace } from "./workspace-context";

type HcmMutation=HCMState|((state:HCMState)=>unknown);
type HcmContextValue={hcm:HCMState;setHcm:(mutation:HcmMutation)=>void;resetHcm:()=>void;reloadHcm:()=>void};
const HcmContext=createContext<HcmContextValue|null>(null);

const readState=(data:ReturnType<typeof useWorkspace>["data"]):HCMState=>{
  if(typeof window==="undefined")return createHcmSeed(data);
  try{return normalizeHcmState(JSON.parse(window.localStorage.getItem(HCM_STORAGE_KEY)??"null"),data);}catch{return createHcmSeed(data);}
};

export function HcmProvider({children}:{children:ReactNode}){
  const {data}=useWorkspace();
  const [hcm,setState]=useState<HCMState>(()=>readState(data));
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(HCM_STORAGE_KEY,JSON.stringify(hcm));},[hcm]);
  const setHcm=(mutation:HcmMutation)=>setState((current)=>normalizeHcmState(typeof mutation==="function"?mutation(current):mutation,data));
  const resetHcm=()=>setState(createHcmSeed(data));
  const reloadHcm=()=>setState(readState(data));
  return <HcmContext.Provider value={{hcm,setHcm,resetHcm,reloadHcm}}>{children}</HcmContext.Provider>;
}

export function useHcm(){const value=useContext(HcmContext);if(!value)throw new Error("useHcm must be used inside HcmProvider");return value;}
