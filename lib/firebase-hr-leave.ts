import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";

export type TrustedLeavePayload={
 startDate:string;endDate:string;requestedHours:number;reason:string;
};
export type LeaveSubmissionReceipt={
 id:string;submittedAt:string;replayed:boolean;
};
/** Send the request to an authenticated transaction, never a client-owned HR status. */
export async function submitConnectedLeaveRequest(
 session:FirebaseAuthSession,request:TrustedLeavePayload,requestId:string,
):Promise<LeaveSubmissionReceipt>{
 let response:Response;
 try{
  response=await fetch(firebaseFunctionUrl("submitHrLeaveRequest"),{
   method:"POST",headers:{
    "content-type":"application/json",authorization:`Bearer ${session.idToken}`,
   },body:JSON.stringify({request,requestId}),
  });
 }catch{
  throw new Error("Could not reach HR. Check your connection and retry the same request.");
 }
 const receipt=await response.json().catch(()=>null) as
  ({ok:true}&LeaveSubmissionReceipt)|{ok:false;message?:string}|null;
 if(!receipt)throw new Error("HR returned no readable receipt. Check request history before retrying.");
 if(!receipt.ok)throw new Error(receipt.message||"HR did not accept your request.");
 if(!receipt.id||!receipt.submittedAt)
  throw new Error("HR did not return a verifiable request receipt.");
 return{id:receipt.id,submittedAt:receipt.submittedAt,replayed:receipt.replayed};
}
