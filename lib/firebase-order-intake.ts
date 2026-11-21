import {currentFirebaseSession,type FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";

export type OrderIntakeDraft={
 accountId:string;lines:Array<{skuId:string;cases:number}>;note:string;
};
export type OrderIntakeStage="Needs commercial review"|"Needs clarification"|"Pricing and inventory verification"|"Approved"|"Declined";
export type OrderIntakeRecord={
 id:string;accountId:string;customerId:string;requestedByUid:string;
 ownerAtSubmission:string;createdAt:string;status:OrderIntakeStage;
 reviewRevision?:number;reviewedAt?:string;reviewedBy?:string;reviewReason?:string;
 requestedByName?:string;accountName?:string;
 preparationStatus?:"Prepared"|"Needs pricing";preparationMessage?:string;
 orderId?:string;invoiceId?:string;
 totalCases:number;note:string;
 lines:Array<{skuId:string;description:string;casePack:number;cases:number}>;
 source:string;
};
export type AuthorizedIntakePricing={pricePerCase:number;terms:"COD"|"Prepaid"|"Net 7"|"Net 15"|"Net 30"|"Custom";priceEvidence:string};
export type OrderIntakeReceipt={
 intakeId:string;createdAt:string;replayed:boolean;readbackVerified:boolean;
};
/** Every action needs a current token, not the provider's potentially hour-old token. */
async function activeIntakeSession(previous:FirebaseAuthSession):Promise<FirebaseAuthSession>{
 const active=await currentFirebaseSession();
 if(!active||active.uid!==previous.uid)
  throw new Error("Your Momentum session needs renewal. Sign in again before changing an order.");
 return active;
}

/** An authenticated server call, with no local or optimistic success fallback.
 * @param {FirebaseAuthSession} session Signed-in staff session.
 * @param {string} endpoint Trusted order-intake function.
 * @param {Record<string,unknown>} payload Allowlisted request.
 * @return {Promise<unknown>} Validated response envelope.
 */
async function call(
 session:FirebaseAuthSession,endpoint:"submitOrderIntake"|"reviewOrderIntake"|"decideOrderIntake",
 payload:Record<string,unknown>,
):Promise<unknown>{
 const active=await activeIntakeSession(session);
 let response:Response;
 try{
  response=await fetch(firebaseFunctionUrl(endpoint),{
   method:"POST",headers:{
    authorization:"Bearer "+active.idToken,
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
   ["Needs commercial review","Needs clarification","Pricing and inventory verification","Approved","Declined"].includes(record.status)&&record.lines.length===draft.lines.length&&
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

/** Administrator-only paged source register, with an opaque continuation cursor. */
export async function listConnectedOrderIntakes(
 session:FirebaseAuthSession,cursor?:string|null,
):Promise<{records:OrderIntakeRecord[];limit:number;nextCursor:string|null}>{
 const response=await call(session,"reviewOrderIntake",
  cursor?{cursor}:{}) as
  {records?:OrderIntakeRecord[];limit?:number;nextCursor?:string|null};
 if(!Array.isArray(response.records)||response.records.some(record=>!record.id)||
  (response.nextCursor!==null&&response.nextCursor!==undefined&&
   !/^intake-[0-9a-f-]{36}$/.test(response.nextCursor)))
  throw new Error("Commercial intake page could not be verified.");
 return{records:response.records,limit:response.limit??40,
  nextCursor:response.nextCursor??null};
}

/** Exact source verification still works after the request has left page one. */
export async function getConnectedOrderIntake(
 session:FirebaseAuthSession,intakeId:string,
):Promise<OrderIntakeRecord>{
 const response=await call(session,"reviewOrderIntake",{intakeId}) as
  {record?:OrderIntakeRecord};
 if(!response.record||response.record.id!==intakeId)
  throw new Error("Order-intake review source readback failed.");
 return response.record;
}

/** Verified Administrator decision; does not issue an order or charge money. */
export async function decideConnectedOrderIntake(
 session:FirebaseAuthSession,decision:{
  intakeId:string;expectedStatus:OrderIntakeStage;expectedRevision:number;nextStatus:OrderIntakeStage;reason:string;
 },requestId:string,pricing?:AuthorizedIntakePricing,
):Promise<{intakeId:string;status:OrderIntakeStage;reviewRevision:number;reviewedAt:string;replayed:boolean;orderId?:string;invoiceId?:string}>{
 const record=await call(session,"decideOrderIntake",{decision,requestId,...(pricing?{pricing}:{})}) as
  {intakeId?:string;status?:OrderIntakeStage;reviewRevision?:number;reviewedAt?:string;replayed?:boolean;orderId?:string;invoiceId?:string};
 if(!record.reviewedAt||record.intakeId!==decision.intakeId||
  record.status!==decision.nextStatus||record.reviewRevision!==decision.expectedRevision+1)
  throw new Error("Review receipt is incomplete. Read source before retrying.");
 if(decision.nextStatus==="Approved"&&(!record.orderId||!record.invoiceId))
  throw new Error("Approval did not confirm an order and invoice draft. Refresh the source before trying again.");
 return{intakeId:record.intakeId,status:record.status,
  reviewRevision:record.reviewRevision,reviewedAt:record.reviewedAt,replayed:Boolean(record.replayed),
  orderId:record.orderId,invoiceId:record.invoiceId};
}

/** The signed-in requester's source-backed outcome inbox; visible after refresh or on a new device. */
export async function listMyConnectedOrderIntakes(session:FirebaseAuthSession):Promise<Array<{
 id:string;status:OrderIntakeStage;createdAt:string;totalCases:number;declineReason?:string;
}>>{
 const result=await call(session,"reviewOrderIntake",{mine:true}) as {records?:Array<{
  id:string;status:OrderIntakeStage;createdAt:string;totalCases:number;declineReason?:string;
 }>};
 if(!Array.isArray(result.records)||result.records.some(row=>!row.id||!row.status))
  throw new Error("My submitted request status could not be verified.");
 return result.records;
}

/** Prepare an approved request using confirmed price and payment terms. */
export async function prepareConnectedApprovedIntake(
 session:FirebaseAuthSession,intakeId:string,
 pricing?:AuthorizedIntakePricing,
):Promise<{status:"Prepared"|"Needs pricing";orderId?:string;invoiceId?:string;message:string}>{
 const active=await activeIntakeSession(session);
 const response=await fetch(firebaseFunctionUrl("prepareApprovedOrderIntake"),{
  method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+active.idToken},
  body:JSON.stringify({intakeId,...(pricing?{pricing}:{})}),
 });
 const result=await response.json().catch(()=>null) as {ok?:boolean;status?:"Prepared"|"Needs pricing";orderId?:string;invoiceId?:string;message?:string}|null;
 if(!response.ok||result?.ok!==true||!result.status)
  throw new Error(result?.message||"Order preparation unconfirmed. Check Orders before retrying.");
 return{status:result.status,orderId:result.orderId,invoiceId:result.invoiceId,
  message:result.message||"Order preparation reviewed."};
}
