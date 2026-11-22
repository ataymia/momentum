import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {momentumStorage} from "./persistence";
export type AssignedDeliveryAction={orderId:string;action:"status"|"claim"|"assign"|"pack"|"load"|"depart"|"release"|"note"|"complete";driverId?:string;reason?:string;note?:string;signature?:{strokes:number[][][];recipientName:string}};
export async function assignedDelivery(session:FirebaseAuthSession,body:AssignedDeliveryAction){
 const response=await fetch(firebaseFunctionUrl("assignedDeliveryApi"),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},body:JSON.stringify(body)});
 // A gateway error may return HTML or an empty body. Never mistake it for an
 // accepted custody transition, and never tell a driver to blindly retry.
 const result=await response.json().catch(()=>null) as {ok?:boolean;cloudConfirmed?:boolean;message?:string;orderStatus?:string;taskStatus?:string;replayed?:boolean}|null;
 if(!response.ok||result?.ok!==true||result.cloudConfirmed!==true)
   throw new Error(result?.message||"Delivery update is not confirmed by the company server. Refresh the queue before taking another action.");
 const refreshed=await momentumStorage.refreshKeys(["momentum-delivery-v1","momentum-inventory-ledger-v1","momentum-commercial-controls-v1","momentum-demo-workspace-v5"]);
 return {...result,refreshed:refreshed.ok};
}
