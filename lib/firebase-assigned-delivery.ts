import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {momentumStorage} from "./persistence";
export type AssignedDeliveryAction={orderId:string;action:"status"|"claim"|"assign"|"pack"|"load"|"depart"|"release"|"note"|"complete";driverId?:string;reason?:string;note?:string;signature?:{strokes:number[][][];recipientName:string}};
export async function assignedDelivery(session:FirebaseAuthSession,body:AssignedDeliveryAction){
 const response=await fetch(firebaseFunctionUrl("assignedDeliveryApi"),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},body:JSON.stringify(body)});
 const result=await response.json() as {ok:boolean;cloudConfirmed?:boolean;message?:string;orderStatus?:string;taskStatus?:string;replayed?:boolean};
 if(!response.ok||!result.ok||!result.cloudConfirmed)throw new Error(result.message||"Delivery update not confirmed.");
 const refreshed=await momentumStorage.refreshKeys(["momentum-delivery-v1","momentum-inventory-ledger-v1","momentum-commercial-controls-v1","momentum-demo-workspace-v5"]);
 return {...result,refreshed:refreshed.ok};
}
