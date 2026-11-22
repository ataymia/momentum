import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {momentumStorage} from "./persistence";
export type AssignedDeliveryAction={orderId:string;action:"status"|"claim"|"assign"|"pack"|"load"|"depart"|"release"|"note"|"complete";driverId?:string;reason?:string;note?:string;signature?:{strokes:number[][][];recipientName:string}};
export async function assignedDelivery(session:FirebaseAuthSession,body:AssignedDeliveryAction){
 // A network failure does not prove that the server rejected the mutation.
 // Drivers must reconcile the authoritative queue rather than repeat a
 // possibly accepted custody transition.
 let response:Response;
 try {
   response=await fetch(firebaseFunctionUrl("assignedDeliveryApi"),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},body:JSON.stringify(body)});
 } catch {
   throw new Error("Delivery server confirmation is unavailable. Refresh the queue and verify the current custody status before taking another action.");
 }
 // A gateway error may return HTML or an empty body. Never mistake it for an
 // accepted custody transition, and never tell a driver to blindly retry.
 const result=await response.json().catch(()=>null) as {ok?:boolean;cloudConfirmed?:boolean;message?:string;orderStatus?:string;taskStatus?:string;replayed?:boolean}|null;
 if(!response.ok||result?.ok!==true||result.cloudConfirmed!==true)
   throw new Error(result?.message||"Delivery update is not confirmed by the company server. Refresh the queue before taking another action.");
 // Server acknowledgement is authoritative. A failed client readback must not
 // turn an accepted custody mutation into an apparent rejected mutation.
 let refreshed=false;
 try {
   const readback=await momentumStorage.refreshKeys(["momentum-delivery-v1","momentum-inventory-ledger-v1","momentum-commercial-controls-v1","momentum-demo-workspace-v5"]);
   refreshed=readback.ok;
 } catch {
   refreshed=false;
 }
 return {...result,refreshed};
}
