"use client";

import {useCallback,useEffect,useState} from "react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";

export type CommerceRecordKind="order"|"invoice"|"payment";
type Marker={kind:CommerceRecordKind;id:string};
type Receipt={ok?:boolean;message?:string;hidden?:Marker[]|boolean;kind?:CommerceRecordKind;id?:string};
const key=(kind:CommerceRecordKind,id:string)=>kind+":"+id;

export function useCommerceRecordVisibility(){
  const {currentUser}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const uid=firebase?.session?.uid;
  const enabled=Boolean(uid&&firebase?.status==="ready"&&currentUser&&["Administrator","Sales Manager","Sales Representative","Operations","Warehouse","Delivery Driver"].includes(currentUser.role));
  const admin=enabled&&currentUser?.role==="Administrator";
  const [markers,setMarkers]=useState<Set<string>>(new Set());
  const [showHidden,setShowHidden]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const call=useCallback(async(payload:Record<string,unknown>)=>{
    const session=await currentFirebaseSession();
    if(!session||session.uid!==uid)throw new Error("Your session has changed. Refresh before changing records.");
    const response=await fetch(firebaseFunctionUrl("commerceRecordVisibility"),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>null) as Receipt|null;
    if(!response.ok||!result?.ok)throw new Error(result?.message??"Visibility service unavailable.");
    return result;
  },[uid]);
  useEffect(()=>{
    let active=true;
    setMarkers(new Set());setShowHidden(false);setError("");
    if(enabled)void call({action:"list"}).then(result=>{
      if(!Array.isArray(result.hidden))throw new Error("Invalid visibility response.");
      if(active)setMarkers(new Set(result.hidden.map(marker=>key(marker.kind,marker.id))));
    }).catch(error=>{if(active)setError(error instanceof Error?error.message:"Visibility unavailable.");});
    return()=>{active=false;};
  },[enabled,call]);
  const isHidden=useCallback((kind:CommerceRecordKind,id:string)=>markers.has(key(kind,id)),[markers]);
  const visible=useCallback((kind:CommerceRecordKind,id:string)=>!isHidden(kind,id)||Boolean(admin&&showHidden),[isHidden,admin,showHidden]);
  const change=async(kind:CommerceRecordKind,id:string)=>{
    if(!admin||busy)return;
    const hidden=!isHidden(kind,id);
    const reason=window.prompt((hidden?"Hide":"Restore")+" this "+kind+" in sales registers? Accounting, inventory and audit records remain unchanged. Enter a reason:");
    if(!reason?.trim())return;
    setBusy(true);setError("");
    try{
      const result=await call({action:"set",kind,id,hidden,reason:reason.trim()});
      if(result.kind!==kind||result.id!==id||result.hidden!==hidden)throw new Error("Visibility receipt not verified.");
      setMarkers(old=>{const next=new Set(old);if(hidden)next.add(key(kind,id));else next.delete(key(kind,id));return next;});
    }catch(error){setError(error instanceof Error?error.message:"Visibility change not confirmed.");}
    finally{setBusy(false);}
  };
  return {admin,showHidden,setShowHidden,error,busy,visible,isHidden,change,markers};
}
type Visibility=ReturnType<typeof useCommerceRecordVisibility>;
export function RecordVisibilityToolbar({visibility}:{visibility:Visibility}){
  return <>{visibility.admin&&<div className="prototype-controls"><label><input type="checkbox" checked={visibility.showHidden} onChange={event=>visibility.setShowHidden(event.target.checked)}/> Show hidden records</label><small>Display only; financial and fulfillment source records are retained.</small></div>}{visibility.error&&<p role="alert" className="prototype-note">Record visibility: {visibility.error}</p>}</>;
}
export function RecordVisibilityAction({visibility,kind,id}:{visibility:Visibility;kind:CommerceRecordKind;id:string}){
  if(!visibility.admin)return null;
  return <button type="button" className="prototype-secondary-action" disabled={visibility.busy} onClick={()=>void visibility.change(kind,id)}>{visibility.isHidden(kind,id)?"Restore":"Hide"}</button>;
}
