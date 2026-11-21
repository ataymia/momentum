/* eslint-disable max-len,comma-spacing,key-spacing,indent,object-curly-spacing,curly,brace-style,keyword-spacing,arrow-parens,space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {OrderIntakeError,type OrderIntakeStage} from "./trusted-order-intake";
type Row=Record<string,unknown>;
const isRow=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const uid=/^[A-Za-z0-9_-]{1,128}$/;
const retryId=/^[A-Za-z0-9_-]{16,80}$/;
const intakeIdPattern=/^intake-[0-9a-f-]{36}$/;
const transitions:Record<OrderIntakeStage,OrderIntakeStage[]>={
 "Needs commercial review":["Approved","Declined"],
 "Needs clarification":["Approved","Declined"],
 "Pricing and inventory verification":["Approved","Declined"],
 "Approved":[],
 "Declined":[],
};
type Receipt={intakeId:string;status:OrderIntakeStage;reviewRevision:number;reviewedAt:string;replayed:boolean};
/** Final commercial intake review with compare-and-set and idempotency.
 * Never quotes, invoices, reserves inventory, charges funds, or pays commissions.
 * @param {string} actorUid Verified Firebase caller.
 * @param {unknown} rawDecision Untrusted state and reason.
 * @param {unknown} rawRequestId Retry-stable ID.
 * @return {Promise<Receipt>} Persisted decision receipt.
 */
export async function decideTrustedOrderIntake(
 actorUid:string,rawDecision:unknown,rawRequestId:unknown,
):Promise<Receipt>{
 if(!uid.test(actorUid)||typeof rawRequestId!=="string"||!retryId.test(rawRequestId))
  throw new OrderIntakeError(400,"Invalid review request identifier.");
 if(!isRow(rawDecision)||Object.keys(rawDecision).some(k=>
  !["intakeId","expectedStatus","expectedRevision","nextStatus","reason"].includes(k)))
  throw new OrderIntakeError(400,"Unexpected review fields.");
 const intakeId=text(rawDecision.intakeId);
 const expected=text(rawDecision.expectedStatus) as OrderIntakeStage;
 const status=text(rawDecision.nextStatus) as OrderIntakeStage;
 const reason=text(rawDecision.reason);
 const expectedRevision=rawDecision.expectedRevision;
 if(!intakeIdPattern.test(intakeId)||
  !Object.prototype.hasOwnProperty.call(transitions,expected)||
  !transitions[expected].includes(status)||typeof expectedRevision!=="number"||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
  (status==="Declined"?(reason.length<10||reason.length>1000):reason.length!==0))
  throw new OrderIntakeError(400,"Choose Approve or Decline. Only a decline requires a reason of 10–1000 characters.");
 const fingerprint=createHash("sha256").update(JSON.stringify({
  intakeId,expectedStatus:expected,expectedRevision,nextStatus:status,reason,
 })).digest("hex");
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const intakeRef=db.doc("commerceOrderIntakes/"+intakeId);
 const keyRef=db.doc("commerceOrderIntakeReviewKeys/"+actorUid+"_"+rawRequestId);
 return db.runTransaction(async tx=>{
  const [access,original,prior]=await Promise.all([
   tx.get(actorRef),tx.get(intakeRef),tx.get(keyRef),
  ]);
  if(access.data()?.role!=="Administrator"||access.data()?.accountState!=="Active")
   throw new OrderIntakeError(403,"Active Administrator review is required.");
  if(prior.exists){
   const data=prior.data();
   if(data?.fingerprint!==fingerprint||data?.actorUid!==actorUid||
    data?.intakeId!==intakeId)
    throw new OrderIntakeError(409,"Review request ID was used for another decision.");
   if(!original.exists)
    throw new OrderIntakeError(409,"Prior source intake is missing.");
   return{intakeId,status:data?.status as OrderIntakeStage,
    reviewRevision:expectedRevision+1,reviewedAt:text(data?.reviewedAt),replayed:true};
  }
  if(!original.exists)throw new OrderIntakeError(404,"Intake not found.");
  const storedRevision=original.data()?.reviewRevision??0;
  if(original.data()?.status!==expected||storedRevision!==expectedRevision||
   !Number.isSafeInteger(storedRevision)||storedRevision<0||storedRevision>=Number.MAX_SAFE_INTEGER)
   throw new OrderIntakeError(409,"Intake changed since last read. Refresh before review.");
  const reviewRevision=expectedRevision+1;
  const reviewedAt=new Date().toISOString();
  const auditId="intake-review-"+randomUUID();
  tx.update(intakeRef,{status,reviewRevision,reviewedAt,reviewedBy:actorUid,reviewReason:reason});
  tx.create(keyRef,{intakeId,actorUid,status,reviewRevision,reviewedAt,fingerprint,auditId});
  tx.create(db.doc("commerceOrderIntakeReviewAudit/"+auditId),{
   id:auditId,intakeId,actorUid,before:expected,after:status,reviewRevision,reviewedAt,
   reason,source:"Trusted commercial intake decision",financialPosting:false,
  });
  return{intakeId,status,reviewRevision,reviewedAt,replayed:false};
 });
}
