/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {HrOriginalArchiveError} from "./trusted-hr-signed-original";

type Row=Record<string,unknown>;
type ReviewDecision="Return for correction"|"Record evidence inspection";
type ReviewStatus="Pending independent HR review"|
 "Requires correction"|"Evidence inspected; compliance verification pending";
type Intent={
 recordId:string;expectedStatus:ReviewStatus;decision:ReviewDecision;
 reason:string;readAuditId:string;sha256:string;
};
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const segment=/^[A-Za-z0-9_-]{3,128}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const key=/^[A-Za-z0-9_-]{16,80}$/;
const transitions:Record<ReviewStatus,ReviewDecision[]>={
 "Pending independent HR review":["Return for correction","Record evidence inspection"],
 "Requires correction":[],
 "Evidence inspected; compliance verification pending":["Return for correction"],
};

/** An HR inspection or return for correction is not signature, IRS, DHS/I-9,
 * eligibility, classification, or payroll compliance approval.
 * @param {unknown} value Untrusted request.
 * @return {Intent} Fail-closed review intention.
 */
function parseIntent(value:unknown):Intent{
 if(!row(value)||Object.keys(value).some(k=>![
  "recordId","expectedStatus","decision","reason","readAuditId","sha256",
 ].includes(k)))
  throw new HrOriginalArchiveError(400,"Invalid HR review fields.");
 const recordId=txt(value.recordId),expectedStatus=txt(value.expectedStatus);
 const decision=txt(value.decision),reason=txt(value.reason);
 const readAuditId=txt(value.readAuditId),sha256=txt(value.sha256).toLowerCase();
 if(!uuid.test(recordId)||!uuid.test(readAuditId)||
  !Object.prototype.hasOwnProperty.call(transitions,expectedStatus)||
  !transitions[expectedStatus as ReviewStatus].includes(decision as ReviewDecision)||
  reason.length<12||reason.length>800||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reason)||
  /\b\d{3}-\d{2}-\d{4}\b/.test(reason)||
  !/^[a-f0-9]{64}$/.test(sha256))
  throw new HrOriginalArchiveError(400,
   "Invalid HR review transition, source evidence, or safe reason (12–800 characters; no sensitive identifiers).");
 return{recordId,expectedStatus:expectedStatus as ReviewStatus,
  decision:decision as ReviewDecision,reason,readAuditId,sha256};
}

/** Record a source-inspection milestone without ever self-certifying a legal
 * signature or completing a mandatory form. Requires a current independent
 * server-authored original PDF retrieval and a valid source checksum.
 * @param {string} actorUid Revocation-checked session from endpoint.
 * @param {unknown} raw Request with explicit expected status and read audit.
 * @param {unknown} requestId Stable idempotency key.
 * @return {Promise<Row>} Review status receipt.
 */
export async function decideTrustedHrOriginalReview(
 actorUid:string,raw:unknown,requestId:unknown,
):Promise<Row>{
 if(!segment.test(actorUid)||typeof requestId!=="string"||!key.test(requestId))
  throw new HrOriginalArchiveError(400,"Invalid HR review request key.");
 const input=parseIntent(raw);
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const recordRef=db.doc("hrOriginalIntakeRecords/"+input.recordId);
 const readRef=db.doc("hrOriginalIntakeReadAudit/"+input.readAuditId);
 const requestRef=db.doc("hrOriginalReviewKeys/"+actorUid+"_"+requestId);
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 return db.runTransaction(async tx=>{
  const [actorSnap,recordSnap,readSnap,prior]=await Promise.all([
   tx.get(actorRef),tx.get(recordRef),tx.get(readRef),tx.get(requestRef),
  ]);
  if(txt(actorSnap.data()?.accountState)!=="Active"||
   txt(actorSnap.data()?.role)!=="Administrator")
   throw new HrOriginalArchiveError(403,
    "Only an active HR Administrator may inspect or return a completed original.");
  const source=recordSnap.data();
  if(!recordSnap.exists||!source)
   throw new HrOriginalArchiveError(404,"HR original reference not found.");
  if(prior.exists){
   if(txt(prior.data()?.actorUid)!==actorUid||
    txt(prior.data()?.fingerprint)!==fingerprint||
    txt(prior.data()?.recordId)!==input.recordId)
    throw new HrOriginalArchiveError(409,"HR review retry key conflict.");
   return{
    recordId:input.recordId,status:txt(prior.data()?.status),
    reviewedAt:txt(prior.data()?.reviewedAt),replayed:true,
   };
  }
  if(txt(source.status)!==input.expectedStatus||
   txt(source.sha256)!==input.sha256)
   throw new HrOriginalArchiveError(409,
    "Original status or checksum changed. Reload and independently inspect before review.");
  const read=readSnap.data();
  if(!readSnap.exists||txt(read?.recordId)!==input.recordId||
   txt(read?.actorUid)!==actorUid||
   txt(read?.artifact)!=="Original"||
   txt(read?.sha256)!==input.sha256||
   txt(read?.employeeUid)!==txt(source.employeeUid))
   throw new HrOriginalArchiveError(409,
    "No valid Administrator original inspection evidence. Download the original first.");
  const nextStatus:ReviewStatus=input.decision==="Return for correction"?
   "Requires correction":"Evidence inspected; compliance verification pending";
  const reviewedAt=new Date().toISOString();
  const auditId=randomUUID();
  tx.update(recordRef,{
   status:nextStatus,reviewedBy:actorUid,reviewedAt,
   reviewReason:input.reason,reviewReadAuditId:input.readAuditId,
   complianceApproved:false,independentlyVerified:false,
   signedOriginalVerified:false,
  });
  tx.create(db.doc("hrOriginalReviewAudit/"+auditId),{
   auditId,recordId:input.recordId,actorUid,
   employeeUid:txt(source.employeeUid),kind:txt(source.kind),
   previousStatus:input.expectedStatus,status:nextStatus,
   reviewedAt,readAuditId:input.readAuditId,sha256:input.sha256,
   reason:input.reason,
   signatureVerified:false,legalApproved:false,i9Examined:false,
  });
  tx.create(requestRef,{
   actorUid,recordId:input.recordId,reviewedAt,
   status:nextStatus,fingerprint,auditId,
  });
  return{recordId:input.recordId,status:nextStatus,reviewedAt,replayed:false};
 });
}
