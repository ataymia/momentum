"use client";

import {currentFirebaseSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {MeetingInput,TeamMeeting,Rsvp} from "./workspace-meetings";

/** All authenticated meeting reads/writes go through this server API, never browser Firestore. */
export type StaffMeetingCommand =
 | {action:"list"}
 | {action:"create";meeting:MeetingInput}
 | {action:"update";id:string;expectedRevision:number;meeting:MeetingInput}
 | {action:"cancel";id:string;expectedRevision:number}
 | {action:"rsvp";id:string;response:Exclude<Rsvp,"Pending">}
 | {action:"seen";id:string};
export type StaffMeetingResponse={
 ok:boolean;message?:string;meeting?:TeamMeeting;meetings?:TeamMeeting[];
};

export async function staffMeetingRequest(command:StaffMeetingCommand):Promise<StaffMeetingResponse>{
 const session=await currentFirebaseSession();
 if(!session)return{ok:false,message:"Your verified employee session has expired."};
 try{
   const response=await fetch(firebaseFunctionUrl("staffMeetingsApi"),{
     method:"POST",
     headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
     body:JSON.stringify(command),cache:"no-store",
   });
   const result=await response.json().catch(()=>null) as StaffMeetingResponse|null;
   if(!response.ok||!result?.ok)return{
     ok:false,message:result?.message??"Meeting service unavailable. No change has been confirmed.",
   };
   return result;
 }catch{return{ok:false,message:"Cannot reach the secure meeting service. No change has been confirmed."};}
}
