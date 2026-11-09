/* eslint-disable comma-spacing, key-spacing, keyword-spacing, curly, brace-style, space-before-blocks, arrow-parens */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {validLeaveRequestId,validateTrustedLeaveRequest} from "./trusted-hr-leave-validation";

type Row=Record<string,unknown>;
const asRow=(value:unknown):value is Row=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const items=(value:Row|undefined):Row[]=>
 Array.isArray(value?.items)?value.items.filter(asRow):[];
const field=(value:unknown)=>typeof value==="string"?value:"";

/** Refusal with an explicit safe HTTP status. */
export class TrustedHrLeaveError extends Error{
  /**
   * @param {number} status HTTP status.
   * @param {string} message Sanitized message.
   */
  constructor(public readonly status:number,message:string){super(message);}
}
type Receipt={id:string;submittedAt:string;replayed:boolean};

/**
 * Creates one employee-owned pending request with server timestamp, actor and
 * optional PTO policy derived from employer records. Does not grant paid leave.
 * @param {string} actorUid Verified Firebase identity.
 * @param {unknown} raw Untrusted time-off form.
 * @param {unknown} requestId Idempotency key for retry.
 * @return {Promise<Receipt>} Committed receipt or explicit refusal.
 */
export async function submitTrustedHrLeave(
 actorUid:string,raw:unknown,requestId:unknown,
):Promise<Receipt>{
 if(!actorUid||!validLeaveRequestId(requestId)){
   throw new TrustedHrLeaveError(400,"Invalid time-off request ID.");
 }
 const checked=validateTrustedLeaveRequest(raw);
 if(!checked.ok)throw new TrustedHrLeaveError(400,checked.message);
 const input=checked.value;
 const fingerprint=createHash("sha256")
   .update(JSON.stringify(input)).digest("hex");
 const db=getFirestore();
 const accessRef=db.doc("userAccess/"+actorUid);
 const leaveRef=db.doc("userDomains/"+actorUid+"/hcm/leaveRequests");
 const policyRef=db.doc("userDomains/"+actorUid+"/hcm/ptoAssignments");
 const requestRef=db.doc("hrLeaveRequestKeys/"+actorUid+"_"+requestId);
 const metaRef=db.doc("platform/meta");
 return db.runTransaction(async tx=>{
   const [access,leaves,policies,previous]=await Promise.all([
     tx.get(accessRef),tx.get(leaveRef),tx.get(policyRef),tx.get(requestRef),
   ]);
   const actor=access.data();
   if(actor?.accountState!=="Active"||actor.role==="Customer"||
     typeof actor?.role!=="string"||!actor.role.trim()){
     throw new TrustedHrLeaveError(403,"An active employee session is required.");
   }
   const old=items(leaves.data());
   if(previous.exists){
     const existing=previous.data();
     if(field(existing?.actorUid)!==actorUid||
       field(existing?.fingerprint)!==fingerprint)
       throw new TrustedHrLeaveError(409,"Request ID belongs to different leave details.");
     const id=field(existing?.leaveId);
     if(!old.some(row=>row.id===id&&row.userId===actorUid))
       throw new TrustedHrLeaveError(409,"Previous submission needs HR reconciliation.");
     return{id,submittedAt:field(existing?.submittedAt),replayed:true};
   }
   if(old.some(row=>row.userId===actorUid&&row.status==="Submitted"&&
      row.startDate===input.startDate&&row.endDate===input.endDate&&
      row.requestedHours===input.requestedHours&&row.reason===input.reason))
     throw new TrustedHrLeaveError(409,"An identical pending time-off request already exists.");
   const assignment=items(policies.data())
     .filter(row=>row.userId===actorUid&&typeof row.effectiveDate==="string"&&
       row.effectiveDate<=input.startDate&&
       (!row.endDate||typeof row.endDate==="string"&&row.endDate>=input.startDate))
     .sort((a,b)=>field(b.effectiveDate).localeCompare(field(a.effectiveDate)))[0];
   const policyId=assignment?field(assignment.policyId):"";
   const id="leave-"+randomUUID();
   const submittedAt=new Date().toISOString();
   const record:Row={
     id,userId:actorUid,startDate:input.startDate,endDate:input.endDate,
     requestedHours:input.requestedHours,reason:input.reason,
     submittedAt,status:"Submitted",
     ...(policyId?{policyId}:{}),
   };
   const next={items:[record,...old]};
   if(Buffer.byteLength(JSON.stringify(next),"utf8")>900_000)
     throw new TrustedHrLeaveError(409,"Leave record capacity reached. Contact HR.");
   tx.set(leaveRef,next);
   tx.create(requestRef,{actorUid,fingerprint,leaveId:id,submittedAt});
   tx.create(db.doc("hrLeaveRequestProvenance/"+id),{
     actorUid,leaveId:id,requestId,submittedAt,source:"Authenticated employee form",
   });
   tx.set(metaRef,{versions:{
     [leaveRef.path.replace(/[^A-Za-z0-9]+/g,"_")]:
       submittedAt+"#"+randomUUID().slice(0,6),
   }},{merge:true});
   return{id,submittedAt,replayed:false};
 });
}
