/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string,unknown>;
type OrderLine={skuId:string;description:string;casePack:number;cases:number};
type IntakeDraft={accountId:string;lines:OrderLine[];note:string};
export type OrderIntakeRecord={
 id:string;accountId:string;customerId:string;requestedByUid:string;
 ownerAtSubmission:string;createdAt:string;status:"Needs commercial review";
 lines:OrderLine[];totalCases:number;note:string;source:string;
};
type IntakeReceipt={intakeId:string;createdAt:string;status:"Needs commercial review";replayed:boolean};
const catalog=[
 {skuId:"ge-original-250ml-24",description:"0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",casePack:24},
 {skuId:"ge-sugarfree-250ml-24",description:"0.25L (8.4oz) Golden Eagle SugarFree (24pack)",casePack:24},
 {skuId:"ge-tropical-250ml-24",description:"0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",casePack:24},
 {skuId:"ge-red-250ml-24",description:"0.25L (8.4oz) Golden Eagle RED Edition (24pack)",casePack:24},
 {skuId:"ge-blue-zero-250ml-24",description:"0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",casePack:24},
 {skuId:"ge-strawberry-250ml-24",description:"0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",casePack:24},
] as const;
const skuMap=new Map<string,typeof catalog[number]>(catalog.map(s=>[s.skuId,s]));
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const object=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const records=(data:Row|undefined)=>Array.isArray(data?.items)?data.items.filter(object):[];
const actorIdPattern=/^[A-Za-z0-9_-]{1,128}$/;
const requestIdPattern=/^[A-Za-z0-9_-]{16,80}$/;

/** Safe refusal from an authenticated order-intake operation. */
export class OrderIntakeError extends Error{
 /** @param {number} status Safe HTTP response status.
  * @param {string} message Client-safe refusal explanation.
  */
 constructor(public readonly status:number,message:string){super(message);}
}

/** An order intake is intentionally not an order or commercial commitment.
 * Accept only canonical product IDs and case counts, with no caller-supplied
 * prices, payment states, inventory, approval or commission fields.
 * @param {unknown} raw User-submitted request.
 * @return {IntakeDraft} Strict validated draft with canonical catalog metadata.
 */
function validateDraft(raw:unknown):IntakeDraft{
 if(!object(raw)||Object.keys(raw).some(k=>!["accountId","lines","note"].includes(k)))
  throw new OrderIntakeError(400,"Invalid order-intake fields.");
 const accountId=text(raw.accountId);
 const note=text(raw.note);
 if(!actorIdPattern.test(accountId)||note.length>1000)
  throw new OrderIntakeError(400,"Invalid account or note.");
 if(!Array.isArray(raw.lines)||raw.lines.length<1||raw.lines.length>12)
  throw new OrderIntakeError(400,"Choose 1 to 12 product lines.");
 const seen=new Set<string>();
 let totalCases=0;
 const lines:OrderLine[]=raw.lines.map(value=>{
  if(!object(value)||Object.keys(value).some(k=>!["skuId","cases"].includes(k)))
   throw new OrderIntakeError(400,"Order intake accepts only product ID and case quantity.");
  const skuId=text(value.skuId);
  const sku=skuMap.get(skuId);
  const cases=value.cases;
  if(!sku||seen.has(skuId)||typeof cases!=="number"||
   !Number.isSafeInteger(cases)||cases<1||cases>10000)
   throw new OrderIntakeError(400,"Product selection or case quantity is invalid.");
  seen.add(skuId); totalCases+=cases;
  return{skuId,description:sku.description,casePack:sku.casePack,cases};
 });
 if(totalCases>10000)
  throw new OrderIntakeError(400,"Total cases exceed the intake limit.");
 return{accountId,lines,note};
}

/** An active sales identity may submit only a source-authorized account.
 * Administrator can submit any account; Sales Manager can submit own
 * or directly supervised active rep's account; reps require ownership.
 * @param {string} actorUid Authenticated Firebase UID.
 * @param {unknown} raw Request form.
 * @param {unknown} rawRequestId Idempotency key.
 * @return {Promise<IntakeReceipt>} Committed request receipt.
 */
export async function submitTrustedOrderIntake(
 actorUid:string,raw:unknown,rawRequestId:unknown,
):Promise<IntakeReceipt>{
 if(!actorIdPattern.test(actorUid)||typeof rawRequestId!=="string"||
  !requestIdPattern.test(rawRequestId))
  throw new OrderIntakeError(400,"Invalid intake request ID.");
 const draft=validateDraft(raw);
 const fingerprint=createHash("sha256").update(JSON.stringify(draft)).digest("hex");
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const keyRef=db.doc("commerceOrderIntakeKeys/"+actorUid+"_"+rawRequestId);
 return db.runTransaction(async tx=>{
  const [actorSnap,accountsSnap,keySnap]=await Promise.all([
   tx.get(actorRef),tx.get(accountsRef),tx.get(keyRef),
  ]);
  const actor=actorSnap.data();
  const role=text(actor?.role);
  if(text(actor?.accountState)!=="Active"||
   !["Administrator","Sales Manager","Sales Representative"].includes(role))
   throw new OrderIntakeError(403,"An active sales identity is required.");
  if(keySnap.exists){
   const saved=keySnap.data();
   if(text(saved?.actorUid)!==actorUid||
    text(saved?.fingerprint)!==fingerprint)
    throw new OrderIntakeError(409,"That request ID belongs to different intake details.");
   const intakeId=text(saved?.intakeId);
   const proof=intakeId?await tx.get(db.doc("commerceOrderIntakes/"+intakeId)):null;
   if(!proof?.exists||text(proof.data()?.requestedByUid)!==actorUid)
    throw new OrderIntakeError(409,"Previous intake needs source reconciliation.");
   return{intakeId,createdAt:text(saved?.createdAt),
    status:"Needs commercial review" as const,replayed:true};
  }
  const account=records(accountsSnap.data()).find(row=>text(row.id)===draft.accountId);
  if(!account)throw new OrderIntakeError(404,"Customer account is not available.");
  const ownerId=text(account.ownerId);
  if(role==="Sales Representative"&&ownerId!==actorUid)
   throw new OrderIntakeError(403,"Only the assigned representative may submit this account.");
  if(role==="Sales Manager"&&ownerId!==actorUid){
   const ownerSnap=ownerId?await tx.get(db.doc("userAccess/"+ownerId)):null;
   const owner=ownerSnap?.data();
   if(text(owner?.accountState)!=="Active"||
    text(owner?.role)!=="Sales Representative"||
    text(owner?.managerId)!==actorUid||text(owner?.team)!=="Sales")
    throw new OrderIntakeError(403,"The customer is outside your direct sales team.");
  }
  const intakeId="intake-"+randomUUID();
  const createdAt=new Date().toISOString();
  const intake:OrderIntakeRecord={
   id:intakeId,accountId:draft.accountId,
   customerId:text(account.customerId),requestedByUid:actorUid,
   ownerAtSubmission:ownerId,createdAt,status:"Needs commercial review",
   lines:draft.lines,totalCases:draft.lines.reduce((sum,line)=>sum+line.cases,0),
   note:draft.note,source:"Authenticated nonbinding order-intake form",
  };
  tx.create(db.doc("commerceOrderIntakes/"+intakeId),intake);
  tx.create(keyRef,{actorUid,intakeId,createdAt,fingerprint});
  tx.create(db.doc("commerceOrderIntakeAudit/"+intakeId),{
   intakeId,actorUid,accountId:draft.accountId,createdAt,
   event:"Intake submitted for commercial review",source:"Trusted order intake",
  });
  return{intakeId,createdAt,status:"Needs commercial review",replayed:false};
 });
}

/** Read one immutable submission, never the mutable approval/settlement ledger.
 * @param {string} actorUid Verified session.
 * @param {unknown} rawIntakeId Opaque intake identifier.
 * @return {Promise<OrderIntakeRecord>} Record from source.
 */
export async function getTrustedOrderIntake(
 actorUid:string,rawIntakeId:unknown,
):Promise<OrderIntakeRecord>{
 const intakeId=text(rawIntakeId);
 if(!actorIdPattern.test(actorUid)||!/^intake-[0-9a-f-]{36}$/.test(intakeId))
  throw new OrderIntakeError(400,"Invalid intake ID.");
 const db=getFirestore();
 const [accessSnap,intakeSnap]=await Promise.all([
  db.doc("userAccess/"+actorUid).get(),
  db.doc("commerceOrderIntakes/"+intakeId).get(),
 ]);
 const access=accessSnap.data();
 if(text(access?.accountState)!=="Active")
  throw new OrderIntakeError(403,"Active employee access is required.");
 const record=intakeSnap.data() as OrderIntakeRecord|undefined;
 if(!record)throw new OrderIntakeError(404,"Order intake not found.");
 if(text(access?.role)!=="Administrator"&&record.requestedByUid!==actorUid)
  throw new OrderIntakeError(403,"Order intake is outside your scope.");
 return record;
}

/** Bounded Administrator-only read; no implicit financial approval or posting.
 * @param {string} actorUid Verified employee Firebase UID.
 * @return {Promise<OrderIntakeRecord[]>} At most 40 newest immutable requests.
 */
export async function listTrustedOrderIntakes(actorUid:string):Promise<OrderIntakeRecord[]>{
 if(!actorIdPattern.test(actorUid))
  throw new OrderIntakeError(400,"Invalid requester.");
 const db=getFirestore();
 const snap=await db.doc("userAccess/"+actorUid).get();
 const actor=snap.data();
 if(text(actor?.accountState)!=="Active"||text(actor?.role)!=="Administrator")
  throw new OrderIntakeError(403,"Administrator review required.");
 const results=await db.collection("commerceOrderIntakes")
  .orderBy("createdAt","desc").limit(40).get();
 return results.docs.map(doc=>doc.data() as OrderIntakeRecord);
}
