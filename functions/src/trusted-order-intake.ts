/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore,type Transaction} from "firebase-admin/firestore";
import {customerAccountIds} from "./customer-commerce-projection";

type Row=Record<string,unknown>;
type OrderLine={skuId:string;description:string;casePack:number;cases:number};
type IntakeDraft={accountId:string;lines:OrderLine[];note:string};
export type OrderIntakeStage="Needs commercial review"|"Needs clarification"|"Pricing and inventory verification"|"Approved"|"Declined";
export type OrderIntakeRecord={
 id:string;accountId:string;customerId:string;requestedByUid:string;
 ownerAtSubmission:string;createdAt:string;status:OrderIntakeStage;
 reviewRevision?:number;reviewedAt?:string;reviewedBy?:string;reviewReason?:string;
 /** Server-resolved labels for authorized staff; never accept labels from the requester. */
 requestedByName?:string;accountName?:string;
 lines:OrderLine[];totalCases:number;note:string;source:string;
};
type IntakeReceipt={intakeId:string;createdAt:string;status:OrderIntakeStage;replayed:boolean};
export type CustomerIntakeReceiptRecord=Pick<OrderIntakeRecord,
 "id"|"accountId"|"requestedByUid"|"createdAt"|"status"|"lines"|"totalCases"> &{declineReason?:string};
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


/** Check current location ownership before any receipt replay or non-admin read.
 * @param {Transaction} tx Current Firestore transaction.
 * @param {string} actorUid Verified active identity.
 * @param {string} role Current authoritative role.
 * @param {Row} account Current source account.
 * @return {Promise<void>} Denies off-scope sales access.
 */
async function assertCurrentSalesScope(tx:Transaction,actorUid:string,role:string,account:Row):Promise<void>{
 const ownerId=text(account.ownerId);
 if(role==="Sales Representative"&&ownerId!==actorUid)
  throw new OrderIntakeError(403,"Only the assigned representative may access this account.");
 if(role==="Sales Manager"&&ownerId!==actorUid){
  const owner=actorIdPattern.test(ownerId)?
   (await tx.get(getFirestore().doc("userAccess/"+ownerId))).data():undefined;
  if(text(owner?.accountState)!=="Active"||text(owner?.role)!=="Sales Representative"||
   text(owner?.managerId)!==actorUid||text(owner?.team)!=="Sales")
   throw new OrderIntakeError(403,"The customer is outside your direct sales team.");
 }
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
 const directoryRef=db.doc("employeeDirectory/"+actorUid);
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const keyRef=db.doc("commerceOrderIntakeKeys/"+actorUid+"_"+rawRequestId);
 return db.runTransaction(async tx=>{
  const [actorSnap,directorySnap,accountsSnap,keySnap]=await Promise.all([
   tx.get(actorRef),tx.get(directoryRef),tx.get(accountsRef),tx.get(keyRef),
  ]);
  const actor=actorSnap.data();
  const role=text(actor?.role);
  if(text(actor?.accountState)!=="Active"||
   !["Administrator","Sales Manager","Sales Representative","Customer"].includes(role))
   throw new OrderIntakeError(403,"An active authorized account identity is required.");
  if(role==="Customer"&&
   !customerAccountIds(actor,directorySnap.data()).includes(draft.accountId))
   throw new OrderIntakeError(403,"This location is not assigned to your customer account.");
  const account=records(accountsSnap.data()).find(row=>text(row.id)===draft.accountId);
  if(!account)throw new OrderIntakeError(404,"Customer account is not available.");
  const ownerId=text(account.ownerId);
  await assertCurrentSalesScope(tx,actorUid,role,account);
  if(keySnap.exists){
   const saved=keySnap.data();
   if(text(saved?.actorUid)!==actorUid||
    text(saved?.fingerprint)!==fingerprint)
    throw new OrderIntakeError(409,"That request ID belongs to different intake details.");
   const intakeId=text(saved?.intakeId);
   const proof=intakeId?await tx.get(db.doc("commerceOrderIntakes/"+intakeId)):null;
   if(!proof?.exists||text(proof.data()?.requestedByUid)!==actorUid||
    text(proof.data()?.accountId)!==draft.accountId||
    text(proof.data()?.customerId)!==text(account.customerId))
    throw new OrderIntakeError(409,"Previous intake needs source reconciliation.");
   return{intakeId,createdAt:text(saved?.createdAt),
    status:proof.data()?.status as OrderIntakeStage,replayed:true};
  }
  const intakeId="intake-"+randomUUID();
  const createdAt=new Date().toISOString();
  const intake:OrderIntakeRecord={
   id:intakeId,accountId:draft.accountId,
   customerId:text(account.customerId),requestedByUid:actorUid,
   ownerAtSubmission:ownerId,createdAt,status:"Needs commercial review",reviewRevision:0,
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

/** Read one source submission plus nonbinding review stage, never an order or settlement ledger.
 * @param {string} actorUid Verified session.
 * @param {unknown} rawIntakeId Opaque intake identifier.
 * @return {Promise<OrderIntakeRecord|CustomerIntakeReceiptRecord>} Role-scoped source record.
 */
export async function getTrustedOrderIntake(
 actorUid:string,rawIntakeId:unknown,
):Promise<OrderIntakeRecord|CustomerIntakeReceiptRecord>{
 const intakeId=text(rawIntakeId);
 if(!actorIdPattern.test(actorUid)||!/^intake-[0-9a-f-]{36}$/.test(intakeId))
  throw new OrderIntakeError(400,"Invalid intake ID.");
 const db=getFirestore();
 return db.runTransaction(async tx=>{
  const [accessSnap,intakeSnap,directorySnap,accountsSnap]=await Promise.all([
   tx.get(db.doc("userAccess/"+actorUid)),
   tx.get(db.doc("commerceOrderIntakes/"+intakeId)),
   tx.get(db.doc("employeeDirectory/"+actorUid)),
   tx.get(db.doc("domains/workspace/fields/accounts")),
  ]);
  const access=accessSnap.data();
  const role=text(access?.role);
  if(text(access?.accountState)!=="Active"||
   !["Administrator","Sales Manager","Sales Representative","Customer"].includes(role))
   throw new OrderIntakeError(403,"An active authorized account identity is required.");
  const record=intakeSnap.data() as OrderIntakeRecord|undefined;
  if(!record)throw new OrderIntakeError(404,"Order intake not found.");
  if(role==="Administrator"){
   const account=records(accountsSnap.data()).find(row=>text(row.id)===record.accountId);
   const requester=record.requestedByUid===actorUid?directorySnap.data():
    (await tx.get(db.doc("employeeDirectory/"+record.requestedByUid))).data();
   return{...record,accountName:text(account?.name)||"Account name unavailable",
    requestedByName:text(requester?.name)||text(requester?.email)||"Requester name unavailable"};
  }
  if(record.requestedByUid!==actorUid)
   throw new OrderIntakeError(403,"Order intake is outside your scope.");
  if(role==="Customer"&&!customerAccountIds(access,directorySnap.data()).includes(record.accountId))
   throw new OrderIntakeError(403,"This location is no longer assigned to your customer account.");
  const account=records(accountsSnap.data()).find(row=>text(row.id)===record.accountId);
  if(!account||text(account.customerId)!==record.customerId)
   throw new OrderIntakeError(403,"Order intake account is no longer in your scope.");
  await assertCurrentSalesScope(tx,actorUid,role,account);
  if(role==="Customer"){
   // A customer's receipt is not the internal administrator review record.
   return{id:record.id,accountId:record.accountId,requestedByUid:record.requestedByUid,
    createdAt:record.createdAt,status:record.status,totalCases:record.totalCases,
    lines:record.lines.map(line=>({skuId:line.skuId,description:line.description,
     casePack:line.casePack,cases:line.cases})),
    ...(record.status==="Declined"?{declineReason:record.reviewReason||"Declined; contact your sales representative."}:{})};
  }
  return record;
 });
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


/** Page through ALL source intakes without leaking a shared customer ledger.
 * Cursor is the trusted last source document ID, not a client-chosen timestamp.
 * Firestore snapshots preserve the timestamp + document-id ordering tie-break.
 * @param {string} actorUid Verified active Administrator.
 * @param {unknown} rawCursor Previous page cursor or null.
 * @return {Promise<object>} Latest source intake page and cursor.
 */
export async function pageTrustedOrderIntakes(
 actorUid:string,rawCursor:unknown,
):Promise<{records:OrderIntakeRecord[];limit:number;nextCursor:string|null}>{
 if(!actorIdPattern.test(actorUid))
  throw new OrderIntakeError(400,"Invalid requester.");
 const cursor=rawCursor===undefined||rawCursor===null?"":text(rawCursor);
 if(rawCursor!==undefined&&rawCursor!==null&&typeof rawCursor!=="string")
  throw new OrderIntakeError(400,"Invalid intake page cursor.");
 if(cursor&&!/^intake-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor))
  throw new OrderIntakeError(400,"Invalid intake page cursor.");
 const db=getFirestore();
 const actor=(await db.doc("userAccess/"+actorUid).get()).data();
 if(text(actor?.accountState)!=="Active"||text(actor?.role)!=="Administrator")
  throw new OrderIntakeError(403,"Administrator review required.");
 let query=db.collection("commerceOrderIntakes").orderBy("createdAt","desc");
 if(cursor){
  const position=await db.doc("commerceOrderIntakes/"+cursor).get();
  if(!position.exists||!text(position.data()?.createdAt))
   throw new OrderIntakeError(409,"Intake page cursor no longer resolves. Refresh the queue.");
  query=query.startAfter(position);
 }
 const limit=40;
 const results=await query.limit(limit+1).get();
 const visible=results.docs.slice(0,limit);
 const originals=visible.map(doc=>doc.data() as OrderIntakeRecord);
 const accountsSnap=await db.doc("domains/workspace/fields/accounts").get();
 const accountNames=new Map(records(accountsSnap.data()).map(row=>[text(row.id),text(row.name)]));
 const requesterIds=[...new Set(originals.map(row=>row.requestedByUid))].filter(id=>actorIdPattern.test(id));
 const requesters=await Promise.all(requesterIds.map(id=>db.doc("employeeDirectory/"+id).get()));
 const requesterNames=new Map(requesters.map((snap,i)=>[
  requesterIds[i],text(snap.data()?.name)||text(snap.data()?.email),
 ]));
 return{
  records:originals.map(row=>({...row,
   accountName:accountNames.get(row.accountId)||"Account name unavailable",
   requestedByName:requesterNames.get(row.requestedByUid)||"Requester name unavailable",
  })),
  limit,
  nextCursor:results.docs.length>limit?
   visible[visible.length-1].id:null,
 };
}

/** Return only the signed-in requester's latest decisions, including decline feedback.
 * No customer financial data or other people's requests are returned.
 * @param {string} actorUid Verified Firebase user.
 * @return {Promise<object>} Recent request outcomes.
 */
export async function listOwnTrustedOrderIntakes(actorUid:string):Promise<Array<{
 id:string;status:OrderIntakeStage;createdAt:string;totalCases:number;declineReason?:string;
}>>{
 if(!actorIdPattern.test(actorUid))throw new OrderIntakeError(400,"Invalid requester.");
 const db=getFirestore();
 const access=(await db.doc("userAccess/"+actorUid).get()).data();
 if(text(access?.accountState)!=="Active"||
  !["Administrator","Sales Manager","Sales Representative","Customer"].includes(text(access?.role)))
  throw new OrderIntakeError(403,"Active account access required.");
 const result=await db.collection("commerceOrderIntakes").where("requestedByUid","==",actorUid)
  .orderBy("createdAt","desc").limit(30).get();
 return result.docs.map(doc=>{
  const data=doc.data() as OrderIntakeRecord;
  return{id:data.id,status:data.status,createdAt:data.createdAt,totalCases:data.totalCases,
   ...(data.status==="Declined"?{declineReason:data.reviewReason||"Declined. Contact the reviewer."}:{})};
 });
}
