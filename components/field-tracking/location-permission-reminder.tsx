"use client";
import {useEffect,useState} from "react";
import {MapPin} from "lucide-react";
import {useFieldTracking} from "../../lib/location-tracking-context";
import {roleIsTracked} from "../../lib/location-tracking-engine";
import {employeeLocationReminder,isPendingLocationRequest,updateLocationPermissionRequest,type LocationPermissionRequest} from "../../lib/location-permission-requests";
import {useWorkspace} from "../../lib/workspace-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {Button,Modal} from "../ui";

/** Visible only on the recipient's own signed-in device. Never accesses GPS on Admin's behalf. */
export function LocationPermissionReminder(){
 const {currentUser}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const tracking=useFieldTracking();
 const eligible=roleIsTracked(currentUser?.role);
 const uid=eligible&&firebase?.session?.uid===currentUser?.id?currentUser?.id:undefined;
 const [request,setRequest]=useState<LocationPermissionRequest|null>(null);
 const [dismissed,setDismissed]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState("");
 useEffect(()=>{
  if(!uid)return;
  let active=true;
  const reload=()=>{
   if(typeof document!=="undefined"&&document.visibilityState!=="visible")return;
   void employeeLocationReminder(uid).then(item=>{if(active)setRequest(item);})
    .catch(()=>{if(active)setError("Could not check for a location permission reminder. Check your connection.");});
  };
  reload();
  const id=window.setInterval(reload,60_000);
  const onFocus=()=>reload();
  window.addEventListener("focus",onFocus);
  return()=>{active=false;window.clearInterval(id);window.removeEventListener("focus",onFocus);};
 },[uid]);
 const pending=isPendingLocationRequest(request);
 const open=Boolean(uid&&pending&&request?.targetUid===uid&&request?.requestId!==dismissed);
 const check=()=>{
  if(!uid||!request||busy)return;
  const selected=request;
  setBusy(true);setError("");setResult("");
  // Invoke geolocation while this click retains browser user activation.
  void tracking.requestLocationPermission().then(async status=>{
   const outcome=status==="Active"?"Enabled":status==="Denied"?"Blocked":"Unavailable";
   await updateLocationPermissionRequest({
    action:"respond",targetUid:uid,requestId:selected.requestId,outcome,
   });
   setRequest({...selected,status:"Responded",outcome,responseAt:new Date().toISOString()});
   setResult(outcome==="Enabled"?"Location access was enabled on this device. Route tracking starts when clocked in.":"Location remains unavailable. Use your browser/site settings to allow Location, then try Check location again from Timekeeping.");
  }).catch(e=>setError(e instanceof Error?e.message:"Could not save permission response."))
   .finally(()=>setBusy(false));
 };
 if(!eligible)return null;
 return <>
  <Modal open={open} title="Location access requested"
   description="A Momentum Administrator requested that you review work-route location permissions on this device."
   onClose={()=>{if(request&&!busy)setDismissed(request.requestId)}}
   footer={<>
    <Button variant="ghost" disabled={busy} onClick={()=>{if(request)setDismissed(request.requestId)}}>Not now</Button>
    <Button disabled={busy} onClick={check}>{busy?"Checking device…":"Check location access"}</Button>
   </>}>
   <div className="form-callout"><MapPin size={18}/>
    <p>Location is requested only on your own device. Select Check location access to let the browser ask for permission if allowed. If you previously blocked the site, change Location to Allow in the browser&apos;s site settings and ensure your device&apos;s Location Services are on. Your time punch is not blocked.</p>
   </div>
   {error&&<p className="form-error" role="alert">{error}</p>}
  </Modal>
  {result&&<div role="status" className="form-notice" style={{position:"fixed",bottom:12,right:12,zIndex:1200,maxWidth:400,padding:12}}>{result}<button type="button" onClick={()=>setResult("")} aria-label="Dismiss location result"> ×</button></div>}
 </>;
}
