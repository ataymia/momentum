import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {momentumStorage} from "./persistence";
export type AssignedDeliveryAction={orderId:string;action:"status"|"claim"|"assign"|"pack"|"load"|"depart"|"release"|"note"|"complete";driverId?:string;reason?:string;note?:string;signature?:{strokes:number[][][];recipientName:string}};
// Deduplicate simultaneous submissions from multiple UI controls in this tab.
// This is a client-side guard only; the trusted function must still enforce
// authorization and replay safety across devices and sessions.
const pendingCustodyActions=new Map<string,Promise<Awaited<ReturnType<typeof submitAssignedDelivery>>>>();
// Different custody transitions for one order must not race in the same tab.
const pendingOrderActions=new Map<string,string>();
export function assignedDelivery(session:FirebaseAuthSession,body:AssignedDeliveryAction){
 // Reject malformed requests before entering the pending-operation registry or
 // contacting the trusted endpoint. The server remains the authority.
 if(!session.uid?.trim()||!session.idToken?.trim())return Promise.reject(new Error("Sign in again before changing delivery custody."));
 if(!/^[A-Za-z0-9_-]{5,120}$/.test(body.orderId??""))return Promise.reject(new Error("Select a valid delivery order before continuing."));
 // Types are erased at runtime. Reject malformed actions and assignment targets
 // before any network call; backend authorization and state checks remain required.
 const allowedActions=new Set(["status","claim","assign","pack","load","depart","release","note","complete"]);
 if(!allowedActions.has(body.action))return Promise.reject(new Error("Select a supported delivery action before continuing."));
 if(body.driverId!==undefined&&!/^[A-Za-z0-9_-]{5,120}$/.test(body.driverId))return Promise.reject(new Error("Select a valid driver before assigning delivery custody."));
 // Match the trusted function's note and release contracts before posting.
 // Invalid notes and release reasons must not create uncertain network outcomes.
 if(body.action==="note"&&(typeof body.note!=="string"||body.note.trim().length<3||body.note.trim().length>500))return Promise.reject(new Error("Enter a delivery note of 3–500 characters."));
 if(body.action==="release"&&(typeof body.reason!=="string"||body.reason.trim().length<8||body.reason.trim().length>500))return Promise.reject(new Error("Enter a release reason of 8–500 characters."));
 const key=JSON.stringify([session.uid,body.orderId,body.action,body.driverId,body.reason,body.note,body.signature]);
 const pending=pendingCustodyActions.get(key);
 if(pending)return pending;
 const orderKey=JSON.stringify([session.uid,body.orderId]);
 if(pendingOrderActions.has(orderKey))return Promise.reject(new Error("Another delivery action is still pending for this order. Refresh the queue and verify custody before continuing."));
 const operation=submitAssignedDelivery(session,body);
 pendingOrderActions.set(orderKey,key);
 pendingCustodyActions.set(key,operation);
 void operation.finally(()=>{if(pendingCustodyActions.get(key)===operation){pendingCustodyActions.delete(key);if(pendingOrderActions.get(orderKey)===key)pendingOrderActions.delete(orderKey);}}).catch(()=>{});
 return operation;
}
async function submitAssignedDelivery(session:FirebaseAuthSession,body:AssignedDeliveryAction){
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
