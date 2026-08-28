"use client";

import { Dispatch, ReactNode, SetStateAction, createContext, useContext, useEffect, useMemo, useState } from "react";
import { HCM_STORAGE_KEY, HCMState, createHcmSeed, normalizeHcmState } from "./hcm-engine";
import { useWorkspace } from "./workspace-context";

type HcmContextValue={
  hcm:HCMState;
  setHcm:Dispatch<SetStateAction<HCMState>>;
  resetHcm:()=>void;
  reloadHcm:()=>void;
};

const HcmContext=createContext<HcmContextValue|null>(null);

const readState=(data:ReturnType<typeof useWorkspace>["data"]):HCMState=>{
  if(typeof window==="undefined")return createHcmSeed(data);
  try{return normalizeHcmState(JSON.parse(window.localStorage.getItem(HCM_STORAGE_KEY)??"null"),data);}catch{return createHcmSeed(data);}
};

export function HcmProvider({children}:{children:ReactNode}){
  const {data}=useWorkspace();
  const [hcm,setHcm]=useState<HCMState>(()=>readState(data));
  useEffect(()=>{if(typeof window!=="undefined")window.localStorage.setItem(HCM_STORAGE_KEY,JSON.stringify(hcm));},[hcm]);
  const resetHcm=()=>setHcm(createHcmSeed(data));
  const reloadHcm=()=>setHcm(readState(data));
  const value=useMemo(()=>({hcm,setHcm,resetHcm,reloadHcm}),[hcm,data]);
  return <HcmContext.Provider value={value}>{children}</HcmContext.Provider>;
}

export function useHcm(){const value=useContext(HcmContext);if(!value)throw new Error("useHcm must be used inside HcmProvider");return value;}
