"use client";

import { useEffect } from "react";
import { recordRuntimeError } from "../lib/runtime-diagnostics";

const CHUNK_RECOVERY_KEY="momentum-chunk-recovery-v1";
const chunkFailure=(value:unknown)=>{
  const message=value instanceof Error?value.message:typeof value==="string"?value:String(value??"");
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script/i.test(message);
};

function recoverStaleChunk(value:unknown){
  if(!chunkFailure(value))return false;
  try{
    if(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY)==="reloaded")return false;
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY,"reloaded");
  }catch{return false;}
  window.location.reload();
  return true;
}

export function RuntimeErrorListeners(){
  useEffect(()=>{
    // A successful app mount means any previous one-time deployment recovery completed.
    const clearRecovery=window.setTimeout(()=>{try{window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);}catch{}},10_000);
    const onError=(event:ErrorEvent)=>{
      const error=event.error??event.message;
      recordRuntimeError(error,"window-error");
      recoverStaleChunk(error);
    };
    const onRejection=(event:PromiseRejectionEvent)=>{
      recordRuntimeError(event.reason,"unhandled-rejection");
      recoverStaleChunk(event.reason);
    };
    window.addEventListener("error",onError);
    window.addEventListener("unhandledrejection",onRejection);
    return()=>{window.clearTimeout(clearRecovery);window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onRejection);};
  },[]);
  return null;
}
