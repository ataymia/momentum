import {firebaseFunctionUrl} from "./firebase-functions";
import type {FirebaseAuthSession} from "./firebase-auth-rest";

export type InactivityNotice = {entryId:string;clockOutAt:string;lastActivityAt:string;thresholdAt:string;acknowledgedAt?:string};
export type InactivityResult = {ok:boolean;pending:boolean;notice?:InactivityNotice|null;clockInAt?:string;message?:string};
export type SalesInactivityAction = "read"|"signIn"|"acknowledge"|"clockIn";

/** The employee's Firebase bearer token is required; device wakeups do not invoke signIn. */
export async function salesInactivityRequest(session:FirebaseAuthSession,action:SalesInactivityAction):Promise<InactivityResult>{
  // Read timecards through the already deployed same-origin Worker. The remote
  // Firebase inactivity Function has an independent deployment lifecycle.
  const endpoint=action==="read"?"/api/field/clock-status":firebaseFunctionUrl("salesCRMClockStatus");
  let response:Response;
  try {response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.idToken},
    body:JSON.stringify({action}),cache:"no-store",
  });}catch{
    throw new Error("Clock verification service unreachable. Check the connection and retry; your timecard has not been verified.");
  }
  const data=await response.json().catch(()=>({ok:false,message:"Unable to read server response."})) as InactivityResult;
  if(!response.ok||!data.ok)throw new Error(data.message||"Clock status request failed.");
  return data;
}
export async function recordSalesInteractiveSignIn(session:FirebaseAuthSession):Promise<void>{
  await salesInactivityRequest(session,"signIn");
}
