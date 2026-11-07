import {currentFirebaseSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreDocument} from "./firebase-firestore-rest";
export type LocationPermissionRequest={
 targetUid:string;requestId:string;requestedAt:string;requestedBy:string;expiresAt:string;
 status:"Pending"|"Responded";outcome?:"Enabled"|"Blocked"|"Unavailable"|null;responseAt?:string|null;
};
export const isPendingLocationRequest=(item:LocationPermissionRequest|null,now=Date.now())=>
 Boolean(item&&item.status==="Pending"&&Date.parse(item.expiresAt)>now);
export async function employeeLocationReminder(uid:string){
 return getFirestoreDocument<LocationPermissionRequest>("locationPermissionRequests/"+uid);
}
export async function updateLocationPermissionRequest(payload:{
 action:"send"|"respond";targetUid:string;requestId?:string;outcome?:"Enabled"|"Blocked"|"Unavailable";
}){
 const session=await currentFirebaseSession();
 if(!session)throw new Error("Sign in to Momentum before requesting location access.");
 const response=await fetch(firebaseFunctionUrl("locationPermissionRequestWorkflow"),{
  method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
  body:JSON.stringify(payload),
 });
 const result=await response.json().catch(()=>null) as {ok?:boolean;message?:string;requestedAt?:string;status?:string;requestId?:string}|null;
 if(!response.ok||!result?.ok)throw new Error(result?.message??"Permission request was not confirmed.");
 return result;
}
