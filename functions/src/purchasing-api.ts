/* eslint-disable max-len, indent, comma-spacing, key-spacing, keyword-spacing, curly, brace-style, arrow-parens, space-before-blocks, object-curly-spacing, semi-spacing, space-infix-ops, space-before-function-paren, operator-linebreak, quote-props, block-spacing */
import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {applyPurchaseAction,emptyPurchasingState,normalizePurchasingDemoState,type PurchaseAction,type PurchaseActor,type PurchasingState} from "./purchasing-policy";

type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const schema:Record<string,Record<string,"text"|"number"|"optional">>={
 "vendor.add":{name:"text",contact:"text"},
 "po.create":{vendorId:"text",sku:"text",cases:"number",unitCostCents:"number",warehouse:"text",expectedDate:"text"},
 "po.submit":{id:"text"},"po.approve":{id:"text"},"po.cancel":{id:"text"},
 "receipt.record":{poId:"text",cases:"number",lotCode:"text",bestBy:"text",warehouse:"text"},
 "bill.record":{poId:"text",invoiceNumber:"text",cases:"number",amountCents:"number"},
 "bill.approve":{id:"text"},"payment.record":{billId:"text",reference:"text",amountCents:"number"},
 "payment.verify":{id:"text",evidence:"text"},
 "credit.record":{billId:"text",reference:"text",reason:"text",amountCents:"number"},"credit.approve":{id:"text"},
 "expense.record":{vendorId:"optional",description:"text",amountCents:"number"},"expense.approve":{id:"text"},
};
class PurchaseApiError extends Error{
 constructor(public status:number,message:string){super(message);}
}
export function validatePurchasingAction(raw:unknown):PurchaseAction{
 if(!isRow(raw)||typeof raw.kind!=="string"||!Object.prototype.hasOwnProperty.call(schema,raw.kind))throw new PurchaseApiError(400,"Unknown purchasing action.");
 const fields=schema[raw.kind];
 if(Object.keys(raw).some(k=>k!=="kind"&&!Object.prototype.hasOwnProperty.call(fields,k)))throw new PurchaseApiError(400,"Unrecognized purchasing fields.");
 for(const [key,type] of Object.entries(fields)){
  const v=raw[key];
  if(type==="optional"&&v===undefined)continue;
  if(type==="number"?typeof v!=="number"||!Number.isSafeInteger(v)||v<1:typeof v!=="string"||v.length>160)throw new PurchaseApiError(400,"Invalid purchasing field: "+key);
 }
 return raw as PurchaseAction;
}
function readState(raw:unknown):PurchasingState{
 if(!isRow(raw)||raw.version!==1)throw new PurchaseApiError(409,"Purchasing records require reconciliation.");
 const state=normalizePurchasingDemoState(raw);
 for(const key of ["vendors","orders","receipts","bills","payments","credits","expenses","audit"] as const){
  const original=raw[key];
  if(!Array.isArray(original)||state[key].length!==original.length)throw new PurchaseApiError(409,"Purchasing records require reconciliation.");
 }
 return state;
}
function projectState(state:PurchasingState,role:string):PurchasingState{
 if(role==="Administrator")return state;
 return {...state,payments:state.payments.map(p=>({...p,reference:"Restricted",settlementEvidence:undefined})),audit:state.audit.map(e=>({...e,detail:""}))};
}
/** Verified UID is supplied by the HTTPS handler; the transaction checks role and account state. */
export async function commitPurchasingRequest(uid:string,body:unknown){
  if(!isRow(body)||(body.mode!=="read"&&body.mode!=="write")||Object.keys(body).some(k=>!["mode","action","requestId"].includes(k)))throw new PurchaseApiError(400,"Invalid request.");
  const action=body.mode==="write"?validatePurchasingAction(body.action):null;
  const requestId=body.requestId;
  if(action&&(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)))throw new PurchaseApiError(400,"Invalid request key.");
  const db=getFirestore(),stateRef=db.doc("purchasingRegisters/current");
  return db.runTransaction(async tx=>{
   const access=(await tx.get(db.doc("userAccess/"+uid))).data();
   if(access?.accountState!=="Active"||!["Administrator","Operations"].includes(access.role))throw new PurchaseApiError(403,"Active purchasing staff access required.");
   const stateDoc=await tx.get(stateRef);
   const state=stateDoc.exists?readState(stateDoc.data()?.state):emptyPurchasingState();
   if(!action)return {state:projectState(state,access.role),message:"Purchasing register loaded."};
   const digest=createHash("sha256").update(JSON.stringify(action)).digest("hex");
   const receiptRef=db.doc("purchasingRequestKeys/"+createHash("sha256").update(uid+":"+requestId).digest("hex"));
   const receipt=await tx.get(receiptRef);
   if(receipt.exists){
    if(receipt.data()?.digest!==digest)throw new PurchaseApiError(409,"Request key was used for different details.");
    return {state:projectState(state,access.role),message:"Previously recorded; current register loaded."};
   }
   const actor:PurchaseActor={id:uid,role:access.role,canVerifySettlement:access.role==="Administrator"};
   const outcome=applyPurchaseAction(state,actor,action,new Date().toISOString());
   if(!outcome.ok)throw new PurchaseApiError(409,outcome.message);
   const next=JSON.parse(JSON.stringify(outcome.state)) as PurchasingState;
   if(Buffer.byteLength(JSON.stringify(next),"utf8")>700000||next.audit.length>4500)throw new PurchaseApiError(409,"Register capacity reached; contact operations before further entry.");
   tx.set(stateRef,{state:next,updatedAt:new Date().toISOString()});
   tx.create(receiptRef,{digest,actorUid:uid,recordId:next.audit[next.audit.length-1].recordId,recordedAt:new Date().toISOString()});
   return {state:projectState(next,access.role),message:"Saved to company purchasing register. No payment was initiated or stock posted."};
  });
}
export const purchasingApi=onRequest({cors:true,region:"us-central1"},async(req,res)=>{
 if(req.method!=="POST"){res.status(405).json({ok:false,message:"POST required."});return;}
 const token=(req.headers.authorization??"").replace(/^Bearer /,"");
 let uid:string;
 try{uid=(await getAuth().verifyIdToken(token,true)).uid;}catch{res.status(401).json({ok:false,message:"Sign in again."});return;}
 try{
  const body=req.body;
  const result=await commitPurchasingRequest(uid,body);
  res.status(200).json({ok:true,...result});
 }catch(error){
  if(error instanceof PurchaseApiError){res.status(error.status).json({ok:false,message:error.message});return;}
  console.error("Purchasing request failed",error);res.status(503).json({ok:false,message:"Purchasing save unconfirmed. Reload the register or retry the same request."});
 }
});
