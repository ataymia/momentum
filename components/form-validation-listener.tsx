"use client";

import {useEffect} from "react";

/** Lightweight delegated native validation for every application form.
 * One listener, no per-field React state, no background saves.
 */
export function FormValidationListener(){
  useEffect(()=>{
    const onInvalid=(event:Event)=>{
      const control=event.target;
      if(!(control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement))return;
      control.form?.setAttribute("data-validation-attempted","true");
    };
    document.addEventListener("invalid",onInvalid,true);
    return()=>document.removeEventListener("invalid",onInvalid,true);
  },[]);
  return null;
}
