import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";

export type OrderIntakeDraft={
 accountId:string;lines:Array<{skuId:string;cases:number}>;note:string;
};
export type OrderIntakeRecord={
 id:string;accountId:string;customerId:string;requestedByUid:string;
 ownerAtSubmission:string;createdAt:string;status:"Needs commercial review";
 totalCases:number;note:string;
 lines:Array<{skuId:string;description:string;casePack:number;cases:number}>;
 source:string;
};
export type OrderIntakeReceipt={
 intakeId:string;createdAt:string;replayed:boolean;readbackVerified:boolean;
};
/** An authenticated server call, with no local or optimistic success fallback.
 * @param {FirebaseAuthSession} session Signed-in staff session.
 * @param {string} endpoint Trusted order-intake function.
 * @param {Record<string,unknown>} payload Allowlisted request.
 * @return {Promise<unknown>} Validated response envelope.
 */
async function call(
 session:FirebaseAuthSession,endpoint:"submitOrderIntake"|"reviewOrderIntake",
 payload:Record<string,unknown>,
):Promise<unknown>{
 let response:Response;
 try{
  response=await fetch(firebaseFunctionUrl(endpoint),{
   method:"POST",headers:{
    authorization:"Bearer "+session.idToken,
    "content-type":"application/json",
   },body:JSON.stringify(payload),
  });
 }catch{
  throw new Error("Order intake connection failed. Review the source before retrying.");
 }
 const result=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string}|null;
 if(!result)throw new Error("Order intake returned no readable receipt.");
 if(result.ok!==true)throw new Error(result.message||"Order intake request rejected.");
 return result;
}

/** Requires both a durable receipt and independently authenticated record readback. */
export async function submitConnectedOrderIntake(
 session:FirebaseAuthSession,draft:OrderIntakeDraft,requestId:string,
):Promise<OrderIntakeReceipt>{
 const response=await call(session,"submitOrderIntake",{draft,requestId}) as
  {intakeId?:string;createdAt?:string;replayed?:boolean};
 if(!response.intakeId||!response.createdAt)
  throw new Error("Intake receipt incomplete. Check records before retrying.");
 let readbackVerified=false;
 try{
  const evidence=await call(session,"reviewOrderIntake",{intakeId:response.intakeId}) as
   {record?:OrderIntakeRecord};
  const record=evidence.record;
  readbackVerified=Boolean(record&&record.id===response.intakeId&&
   record.accountId===draft.accountId&&record.requestedByUid===session.uid&&
   record.status==="Needs commercial review"&&record.lines.length===draft.lines.length&&
   draft.lines.every(line=>record.lines.some(item=>
    item.skuId===line.skuId&&item.cases===line.cases)));
 }catch{
  // No claim of source verification when the readback fails.
 }
 return{
  intakeId:response.intakeId,createdAt:response.createdAt,
  replayed:Boolean(response.replayed),readbackVerified,
 };
}

/** Administrator-only read of the most recent source requests, not an order ledger. */
export async function listConnectedOrderIntakes(
 session:FirebaseAuthSession,
):Promise<{records:OrderIntakeRecord[];limit:number}>{
 const response=await call(session,"reviewOrderIntake",{}) as
  {records?:OrderIntakeRecord[];limit?:number};
 if(!Array.isArray(response.records))
  throw new Error("Commercial intake register could not be verified.");
 return{records:response.records,limit:response.limit??40};
}
