import type {DeliverySignaturePoint} from "./delivery-engine";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {RepDeliveryAction,RepDeliveryReceipt} from "./rep-delivery-workspace-policy";

/** One existing server authority for rep self-delivery. Never directly writes domain arrays. */
export async function repDeliveryRequest(
  idToken:string,orderId:string,action:"status"|RepDeliveryAction,
  signature?:{strokes:DeliverySignaturePoint[][];recipientName:string},
  signal?:AbortSignal,
):Promise<RepDeliveryReceipt>{
  if(!idToken||!orderId)throw new Error("Sign in and select an order before continuing.");
  const response=await fetch(firebaseFunctionUrl("repSelfDelivery"),{
    method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+idToken},
    body:JSON.stringify({orderId,action,...(action==="complete"?{signature}:{} )}),signal,
  });
  const value=await response.json().catch(()=>null) as RepDeliveryReceipt|null;
  if(!response.ok||!value?.ok)throw new Error(value?.message||"Could not verify the rep delivery record.");
  if(value.orderId!==orderId||value.cloudConfirmed!==true)throw new Error(
    "The delivery service did not confirm the requested order. Ask Operations to reconcile before retrying.",
  );
  return value;
}
