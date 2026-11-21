import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {PurchaseAction,PurchasingState} from "./purchasing-review";
export class PurchasingRequestError extends Error{constructor(message:string,public readonly definitive:boolean){super(message);}}
export async function connectedPurchasing(session:FirebaseAuthSession,action?:PurchaseAction,requestId?:string):Promise<{state:PurchasingState;message:string}>{
 const response=await fetch(firebaseFunctionUrl("purchasingApi"),{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},body:JSON.stringify(action?{mode:"write",action,requestId}:{mode:"read"})});
 const result=await response.json() as {ok:boolean;state?:PurchasingState;message?:string};
 if(!response.ok||!result.ok||!result.state)throw new PurchasingRequestError(result.message||"Purchasing request could not be confirmed.",response.status>=400&&response.status<500);
 return {state:result.state,message:result.message||"Saved."};
}
