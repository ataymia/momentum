"use client";

import { useEffect } from "react";
import { recordRuntimeError } from "../lib/runtime-diagnostics";

export function RuntimeErrorListeners(){
  useEffect(()=>{
    const onError=(event:ErrorEvent)=>{recordRuntimeError(event.error??event.message,"window-error");};
    const onRejection=(event:PromiseRejectionEvent)=>{recordRuntimeError(event.reason,"unhandled-rejection");};
    window.addEventListener("error",onError);
    window.addEventListener("unhandledrejection",onRejection);
    return()=>{window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onRejection);};
  },[]);
  return null;
}
