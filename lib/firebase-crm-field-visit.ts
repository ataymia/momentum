import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";

export type TrustedFieldVisitPayload={
  businessName:string;
  accountId?:string;
  physicallyVisited:true;
  unsuccessful:boolean;
  score:number;
  summary:string;
  nextAction?:string;
  nextActionDate?:string;
  sampleProduct?:string;
  sampleQuantity?:number;
};

export type FieldVisitReceipt={
  visitId:string;sampleId?:string;occurredAt:string;replayed:boolean;
};

/** Makes one authenticated, idempotent, server-owned Quick Visit write.
 * Never falls back to an optimistic local save in a connected session.
 */
export async function recordTrustedFieldVisit(
  session:FirebaseAuthSession,
  visit:TrustedFieldVisitPayload,
  requestId:string,
):Promise<FieldVisitReceipt>{
  let response:Response;
  try{
    response=await fetch(firebaseFunctionUrl("recordCrmFieldVisit"),{
      method:"POST",
      headers:{
        "content-type":"application/json",
        authorization:`Bearer ${session.idToken}`,
      },
      body:JSON.stringify({requestId,visit}),
    });
  }catch{
    throw new Error(
      "Could not reach CRM. Retry with the same form to avoid duplicate visits.");
  }
  const data=await response.json().catch(()=>null) as
    ({ok:true}&FieldVisitReceipt)|{ok:false;message?:string}|null;
  if(!data)throw new Error(
    "CRM returned no readable receipt. Check the visit history before retrying.");
  if(!data.ok)throw new Error(
    data.message||"CRM rejected the field visit.");
  if(!data.visitId||!data.occurredAt)throw new Error(
    "CRM did not return a verifiable visit receipt.");
  return{
    visitId:data.visitId,sampleId:data.sampleId,
    occurredAt:data.occurredAt,replayed:data.replayed,
  };
}
