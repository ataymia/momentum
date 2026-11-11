/* eslint-disable max-len, comma-spacing, key-spacing, keyword-spacing, curly, brace-style, space-before-blocks, arrow-parens, indent, semi-spacing */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {
 validateLeaveDecision,mayDecideLeave,eligiblePtoUsage,
 type LeaveDecisionInput,type DecisionAuthority,type EmployeeAuthority,
 type PtoBalanceEntry,
} from "./trusted-hr-leave-decision-policy";
import {validLeaveRequestId} from "./trusted-hr-leave-validation";
type Row=Record<string,unknown>;
const asRow=(value:unknown):value is Row=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const items=(data:Row|undefined):Row[]=>Array.isArray(data?.items)?data.items.filter(asRow):[];
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const key=(s:string)=>s.replace(/[^A-Za-z0-9]+/g,"_");
/** Refusal carrying a sanitized HTTP status. */
export class TrustedLeaveDecisionError extends Error{
 /**
  * @param {number} status Safe HTTP status.
  * @param {string} message Sanitized message.
  */
 constructor(public readonly status:number,message:string){super(message);}
}
type LeaveDecisionReceipt={
 employeeUid:string;leaveId:string;status:"Approved"|"Returned";
 recordedAt:string;ptoEntryId?:string;replayed:boolean;
};
/**
 * An authenticated employer decision with exactly one PTO adjustment, if
 * eligible. No payroll settlement or external notification is asserted.
 * @param {string} reviewerUid Verified Firebase session identity.
 * @param {unknown} draft Untrusted employer decision payload.
 * @param {unknown} requestId Idempotency key from client.
 * @return {Promise<LeaveDecisionReceipt>} Authenticated transaction receipt.
 */
export async function commitTrustedLeaveDecision(
 reviewerUid:string,draft:unknown,requestId:unknown,
):Promise<LeaveDecisionReceipt>{
 const checked=validateLeaveDecision(draft);
 if(!checked.ok)throw new TrustedLeaveDecisionError(400,checked.message);
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(reviewerUid)||!validLeaveRequestId(requestId))
   throw new TrustedLeaveDecisionError(400,"Invalid reviewer or request identifier.");
 const input:LeaveDecisionInput=checked.value;
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 const db=getFirestore();
 const employeeUid=input.employeeUid;
 const reviewerRef=db.doc("userAccess/"+reviewerUid);
 const employeeRef=db.doc("userAccess/"+employeeUid);
 const leaveRef=db.doc("userDomains/"+employeeUid+"/hcm/leaveRequests");
 const ledgerRef=db.doc("userDomains/"+employeeUid+"/hcm/ptoLedger");
 const assignRef=db.doc("userDomains/"+employeeUid+"/hcm/ptoAssignments");
 const policyRef=db.doc("domains/hcm/fields/ptoPolicies");
 const requestRef=db.doc("hrLeaveDecisionKeys/"+reviewerUid+"_"+requestId);
 const metaRef=db.doc("platform/meta");
 return db.runTransaction(async tx=>{
  const [reviewerSnap,employeeSnap,leaveSnap,ledgerSnap,assignSnap,policySnap,previous]=await Promise.all([
   tx.get(reviewerRef),tx.get(employeeRef),tx.get(leaveRef),
   tx.get(ledgerRef),tx.get(assignRef),tx.get(policyRef),tx.get(requestRef),
  ]);
  const reviewer=reviewerSnap.data() as Row|undefined;
  const employee=employeeSnap.data() as Row|undefined;
  const reviewerAccess:DecisionAuthority={
   uid:reviewerUid,role:text(reviewer?.role),state:text(reviewer?.accountState),
   managedTeams:Array.isArray(reviewer?.managedTeams)?
     reviewer.managedTeams.filter((x):x is string=>typeof x==="string"):[],
  };
  const targetAccess:EmployeeAuthority={
   uid:employeeUid,role:text(employee?.role),state:text(employee?.accountState),
   team:text(employee?.team),managerId:text(employee?.managerId),
  };
  if(!mayDecideLeave(reviewerAccess,targetAccess))
   throw new TrustedLeaveDecisionError(403,"Manager authority over this employee is required.");
  const list=items(leaveSnap.data());
  const found=list.find(v=>v.id===input.leaveId&&v.userId===employeeUid);
  if(!found||text(found.submittedAt)!==input.submittedAt)
   throw new TrustedLeaveDecisionError(404,"Leave request is not available for review.");
  const oldLedger=items(ledgerSnap.data());
  if(previous.exists){
   const prior=previous.data();
   if(text(prior?.reviewerUid)!==reviewerUid||
     text(prior?.employeeUid)!==employeeUid||
     text(prior?.fingerprint)!==fingerprint)
     throw new TrustedLeaveDecisionError(409,"This request ID belongs to a different leave decision.");
   const ptoEntryId=text(prior?.ptoEntryId)||undefined;
   if(found.status!==input.status||found.reviewerId!==reviewerUid||
     (ptoEntryId&&!oldLedger.some(v=>v.id===ptoEntryId&&v.requestId===input.leaveId)))
     throw new TrustedLeaveDecisionError(409,"A prior decision requires source reconciliation.");
   return{employeeUid,leaveId:input.leaveId,status:input.status,
     recordedAt:text(prior?.recordedAt),ptoEntryId,replayed:true};
  }
  if(found.status!=="Submitted"||found.reviewerId||found.decidedAt)
   throw new TrustedLeaveDecisionError(409,"This leave request was already decided. Refresh the employee record.");
  const now=new Date().toISOString();
  const changes:Record<string,string>={};
  let ptoEntryId:string|undefined;
  if(input.status==="Approved"){
   const policyId=text(found.policyId);
   const startDate=text(found.startDate);
   const requestedHours=found.requestedHours;
   if(!policyId||!/^\d{4}-\d\d-\d\d$/.test(startDate)||
     typeof requestedHours!=="number"||!Number.isFinite(requestedHours)||
     requestedHours<=0)
     throw new TrustedLeaveDecisionError(409,"Paid-leave policy or hours are not verified. Return the request for correction.");
   const assignment=items(assignSnap.data()).find(v=>v.userId===employeeUid&&
     v.policyId===policyId&&text(v.effectiveDate)<=startDate&&
     (!v.endDate||text(v.endDate)>=startDate));
   const policy=items(policySnap.data()).find(v=>v.id===policyId&&v.active===true);
   if(!assignment||!policy||
     (typeof policy.minimumRequestHours==="number"&&
      requestedHours<policy.minimumRequestHours))
     throw new TrustedLeaveDecisionError(409,"Assigned, active PTO policy is not verified for this request.");
   if(!eligiblePtoUsage(oldLedger as PtoBalanceEntry[],employeeUid,
     policyId,startDate,requestedHours,input.leaveId))
     throw new TrustedLeaveDecisionError(409,"Insufficient verified PTO or duplicate usage. Reconcile the employee ledger.");
   ptoEntryId="pto-used-"+randomUUID();
   const entry:Row={
     id:ptoEntryId,userId:employeeUid,policyId,date:startDate,type:"Used",
     hours:-Math.abs(requestedHours),requestId:input.leaveId,
     note:"Approved leave "+text(found.startDate)+" through "+text(found.endDate),
     createdBy:reviewerUid,createdAt:now,
   };
   const nextLedger={items:[entry,...oldLedger]};
   if(Buffer.byteLength(JSON.stringify(nextLedger),"utf8")>900_000)
     throw new TrustedLeaveDecisionError(409,"PTO ledger needs a secure archive before approval.");
   tx.set(ledgerRef,nextLedger);
   changes[key(ledgerRef.path)]=now+"#"+randomUUID().slice(0,6);
  }
  const amended={...found,status:input.status,decisionNote:input.note,
   reviewerId:reviewerUid,decidedAt:now};
  const nextLeave={items:list.map(v=>v.id===input.leaveId?amended:v)};
  if(Buffer.byteLength(JSON.stringify(nextLeave),"utf8")>900_000)
    throw new TrustedLeaveDecisionError(409,"Leave history needs archival review.");
  tx.set(leaveRef,nextLeave);
  changes[key(leaveRef.path)]=now+"#"+randomUUID().slice(0,6);
  const auditId="leave-decision-"+randomUUID();
  tx.create(db.doc("hrLeaveDecisionProvenance/"+auditId),{
   actorUid:reviewerUid,employeeUid,leaveId:input.leaveId,status:input.status,
   recordedAt:now,ptoEntryId:ptoEntryId??null,requestId,
   source:"Authenticated manager decision",
  });
  tx.create(requestRef,{reviewerUid,employeeUid,leaveId:input.leaveId,
   fingerprint,ptoEntryId:ptoEntryId??null,recordedAt:now});
  tx.set(metaRef,{versions:changes},{merge:true});
  return{employeeUid,leaveId:input.leaveId,status:input.status,
   recordedAt:now,ptoEntryId,replayed:false};
 });
}
