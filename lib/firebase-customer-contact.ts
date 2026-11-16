import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import {getFirestoreSnapshot} from "./firebase-firestore-rest";

export type ConnectedCustomerContactPatch=Partial<{
 billingContactName:string;billingEmail:string;billingPhone:string;
 accountsPayableContactName:string;accountsPayableEmail:string;
 accountsPayablePhone:string;
 onboardingPackageStatus:"Not started"|"Prepared";
}>;
export type ConnectedCustomerUpdate={
 accountId:string;customerId:string;expectedRevision:number;
 patch:ConnectedCustomerContactPatch;
};
export type ConnectedCustomerUpdateReceipt={
 accountId:string;customerId:string;revision:number;updatedAt:string;
 replayed:boolean;readbackVerified:boolean;
};

/** Non-sensitive account setup only; cannot sign forms, approve tax status,
 * change credit limits, or place financial orders.
 */
export async function saveConnectedCustomerContacts(
 session:FirebaseAuthSession,input:ConnectedCustomerUpdate,requestId:string,
):Promise<ConnectedCustomerUpdateReceipt>{
 let response:Response;
 try{
  response=await fetch(firebaseFunctionUrl("updateCustomerContacts"),{
   method:"POST",
   headers:{"content-type":"application/json",authorization:"Bearer "+session.idToken},
   body:JSON.stringify({update:input,requestId}),
  });
 }catch{
  throw new Error("Connected customer contacts unavailable. Retain the same request ID and verify source before retry.");
 }
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;accountId?:string;customerId?:string;
   revision?:number;updatedAt?:string;replayed?:boolean}|null;
 if(!response.ok||data?.ok!==true||data.accountId!==input.accountId||
  data.customerId!==input.customerId||
  !Number.isSafeInteger(data.revision)||!data.updatedAt)
  throw new Error(data?.message||"Contact save not confirmed by server.");
 let readbackVerified=false;
 try{
  const snap=await getFirestoreSnapshot<{
   items?:Array<{id?:string;contactRevision?:number;contactUpdatedBy?:string}>;
  }>("domains/workspace/fields/customers");
  readbackVerified=Boolean(snap.exists&&snap.data?.items?.some(row=>
   row.id===input.customerId&&row.contactRevision===data.revision));
 }catch{
  // A server receipt is not a substitute for connected source readback.
 }
 return{accountId:input.accountId,customerId:input.customerId,
  revision:data.revision!,updatedAt:data.updatedAt,
  replayed:Boolean(data.replayed),readbackVerified};
}
