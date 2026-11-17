/* eslint-disable max-len, indent, comma-spacing, key-spacing, keyword-spacing, curly, brace-style, arrow-parens, space-before-blocks, object-curly-spacing, semi-spacing, space-infix-ops, space-before-function-paren, operator-linebreak, quote-props, block-spacing */
import {createHash} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {phoenixDateKey,lotEligibleForAutomaticDelivery} from "./inventory-lot-quality";
import {applyPurchaseAction,emptyPurchasingState,normalizePurchasingDemoState,type PurchaseAction,type PurchaseActor,type PurchasingState} from "./purchasing-policy";

type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const schema:Record<string,Record<string,"text"|"number"|"optional">>={
 "vendor.add":{name:"text",contact:"text"},
 "po.create":{vendorId:"text",sku:"text",cases:"number",unitCostCents:"number",warehouse:"text",expectedDate:"text"},
 "po.submit":{id:"text"},"po.approve":{id:"text"},"po.cancel":{id:"text"},
 "receipt.record":{poId:"text",cases:"number",lotCode:"text",bestBy:"text",warehouse:"text"},
 "receipt.post":{id:"text",inspectionReference:"text"},
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
 if(role==="Warehouse"){
  const orders=state.orders.filter(p=>p.approvedAt&&!p.cancelledAt);
  const ids=new Set(orders.map(p=>p.id));
  return {...emptyPurchasingState(),orders:orders.map(p=>({...p,unitCostCents:0,createdBy:"Restricted",approvedBy:"Restricted"})),vendors:state.vendors.filter(v=>orders.some(p=>p.vendorId===v.id)).map(v=>({...v,contact:"",createdBy:"Restricted"})),receipts:state.receipts.filter(r=>ids.has(r.poId))};
 }
 return {...state,payments:state.payments.map(p=>({...p,reference:"Restricted",settlementEvidence:undefined})),audit:state.audit.map(e=>({...e,detail:""}))};
}
/** Verified UID is supplied by the HTTPS handler; the transaction checks role and account state. */
export async function commitPurchasingRequest(uid:string,body:unknown){
  if(!isRow(body)||(body.mode!=="read"&&body.mode!=="write")||Object.keys(body).some(k=>!["mode","action","requestId"].includes(k)))throw new PurchaseApiError(400,"Invalid request.");
  const action=body.mode==="write"?validatePurchasingAction(body.action):null;
  const requestId=body.requestId;
  if(action&&(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{16,80}$/.test(requestId)))throw new PurchaseApiError(400,"Invalid request key.");
  const db=getFirestore();
  const stateRef=db.doc("purchasingRegisters/current");
  return db.runTransaction(async tx=>{
   const access=(await tx.get(db.doc("userAccess/"+uid))).data();
   if(access?.accountState!=="Active"||!["Administrator","Operations","Warehouse"].includes(access.role))throw new PurchaseApiError(403,"Active purchasing staff access required.");
   if(access.role==="Warehouse"&&action&&action.kind!=="receipt.record")throw new PurchaseApiError(403,"Warehouse access is restricted to receiving.");
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
   const actor:PurchaseActor={id:uid,role:access.role,canVerifySettlement:access.role==="Administrator",canPostInventory:access.role==="Administrator"};
   const outcome=applyPurchaseAction(state,actor,action,new Date().toISOString());
   if(!outcome.ok)throw new PurchaseApiError(409,outcome.message);
   const next=JSON.parse(JSON.stringify(outcome.state)) as PurchasingState;
   if(Buffer.byteLength(JSON.stringify(next),"utf8")>700000||next.audit.length>4500)throw new PurchaseApiError(409,"Register capacity reached; contact operations before further entry.");
   if(action.kind==="receipt.post"){
    const r=next.receipts.find(row=>row.id===action.id);
    const po=next.orders.find(row=>row.id===r?.poId);
    const descriptions:Record<string,string>={
     "ge-original-250ml-24":"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",
     "ge-sugarfree-250ml-24":"0.25L (8.4oz) Golden Eagle SugarFree (24pack)",
     "ge-tropical-250ml-24":"0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",
     "ge-red-250ml-24":"0.25L (8.4oz) Golden Eagle RED Edition (24pack)",
     "ge-blue-zero-250ml-24":"0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",
     "ge-strawberry-250ml-24":"0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",
    };
    const product=po&&descriptions[po.sku];
    if(!r||!product||!r.inventoryLotId||!lotEligibleForAutomaticDelivery({status:"Available",bestBy:r.bestBy},phoenixDateKey()))throw new PurchaseApiError(409,"Valid sellable product and current best-by evidence required.");
    const paths=["domains/workspace/fields/inventory","domains/commercial/fields/inventoryLots","domains/inventoryLedger/fields/nodes","domains/inventoryLedger/fields/movements","domains/periodLocks/fields/locks"];
    const refs=paths.map(path=>db.doc(path));
    const docs=await Promise.all(refs.map(doc=>tx.get(doc)));
    const arrays=docs.map(doc=>{
     if(!doc.exists)return [];
     const items=doc.data()?.items;
     if(!Array.isArray(items)||!items.every(isRow))throw new PurchaseApiError(409,"Inventory register requires reconciliation.");
     return items as Row[];
    });
    const [baseLots,commercialLots,nodes,movements,locks]=arrays;
    const warehouse=nodes.find(n=>n.id==="node-warehouse-main"&&n.type==="Warehouse"&&n.active===true);
    if(!warehouse||!nodes.some(n=>n.id==="node-external"&&n.type==="External"&&n.active===true)||![warehouse.id,warehouse.name].includes(r.warehouse))throw new PurchaseApiError(409,"Receipt must match a verified active warehouse and external source node.");
    if(locks.length>0)throw new PurchaseApiError(409,"Inventory period lock records require review before receipt posting.");
    if([...baseLots,...commercialLots].some(l=>l.id===r.inventoryLotId||(typeof l.lotCode==="string"&&l.lotCode.trim().toLowerCase()===r.lotCode.trim().toLowerCase())))throw new PurchaseApiError(409,"Existing batch code must be reconciled instead of creating duplicate stock.");
    const movementId="purchase-receipt-"+r.id;
    if(movements.some(m=>m.id===movementId))throw new PurchaseApiError(409,"Receipt movement already exists; reconcile the register.");
    const lot={id:r.inventoryLotId,lotCode:r.lotCode,product,onHand:0,reserved:0,available:0,receivedAt:r.recordedAt.slice(0,10),bestBy:r.bestBy,location:r.warehouse,status:"Available"};
    const movement={id:movementId,lotId:r.inventoryLotId,product,quantity:r.cases,type:"Receipt",fromNodeId:"node-external",toNodeId:"node-warehouse-main",reason:"Inspected purchase receipt "+r.id,at:r.postedAt,actorId:uid};
    const lots=[...commercialLots,lot];
    const ledger=[...movements,movement];
    if([lots,ledger].some(items=>Buffer.byteLength(JSON.stringify(items),"utf8")>700000))throw new PurchaseApiError(409,"Inventory register capacity requires review.");
    tx.set(refs[1],{items:lots},{merge:true});
    tx.set(refs[3],{items:ledger},{merge:true});
   }
   tx.set(stateRef,{state:next,updatedAt:new Date().toISOString()});
   tx.create(receiptRef,{digest,actorUid:uid,recordId:next.audit[next.audit.length-1].recordId,recordedAt:new Date().toISOString()});
   return {state:projectState(next,access.role),message:action.kind==="receipt.post"?"Verified receipt and inventory movement saved together.":"Saved to company purchasing register. No payment was initiated or stock posted."};
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
