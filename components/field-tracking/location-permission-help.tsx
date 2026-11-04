"use client";
import {MapPin,ShieldAlert} from "lucide-react";
import {useFieldTracking} from "../../lib/location-tracking-context";
import {roleIsTracked} from "../../lib/location-tracking-engine";
import {useWorkspace} from "../../lib/workspace-context";
import {Button} from "../ui";

/** On-device recovery instructions; does not record off-duty coordinates. */
export function LocationPermissionHelp({compact=false}:{compact?:boolean}){
 const {currentUser}=useWorkspace();
 const tracking=useFieldTracking();
 if(!roleIsTracked(currentUser?.role))return null;
 const status=tracking.permission;
 if(status!=="Denied"&&status!=="Unavailable")return null;
 return <div className="form-callout" role="status">
  {status==="Denied"?<ShieldAlert size={18}/>:<MapPin size={18}/>}
  <div>
   <strong>{status==="Denied"?"Location access is blocked on this device":"Device location is unavailable"}</strong>
   <p>Momentum cannot reset browser permissions remotely. On this device, open the site&apos;s permissions from the address-bar settings and change Location to Allow. On iPhone, also check Settings → Privacy &amp; Security → Location Services and the browser&apos;s location access. Return to Momentum and select Check location. Keep location permission enabled while using work-route tracking.</p>
   <p>Your clock-in time is recorded separately. Missing GPS is shown as a gap, not a fabricated position.</p>
   {!compact&&<Button size="sm" variant="secondary" onClick={()=>{void tracking.requestLocationPermission()}}>Check location again</Button>}
  </div>
 </div>;
}
