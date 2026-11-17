/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks, require-jsdoc, valid-jsdoc, one-var */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import type {HrTemplateKind} from "./trusted-hr-template";

type Row=Record<string,unknown>;
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const uidPattern=/^[A-Za-z0-9_-]{3,128}$/;
const keyPattern=/^[A-Za-z0-9_-]{16,80}$/;
const assignmentPattern=/^hrassign-[0-9a-f-]{36}$/;
export type AssignedHrTemplate={
 id:string;employeeUid:string;templateId:string;kind:HrTemplateKind;
 title:string;edition:string;sha256:string;storagePath:string;
 createdAt:string;createdBy:string;
 status:"Assigned"|"Submitted for HR review";
 submittedOriginalId?:string;submittedAt?:string;
};
export class HrAssignmentError extends Error{
 constructor(public readonly status:number,message:string){super(message);}
}
/** An employee assignment is a source-approved invitation to prepare a PDF, not a legal signature. */
export async function assignTrustedHrTemplate(
 actorUid:string,raw:unknown,requestId:unknown,
):Promise<{assignmentId:string;employeeUid:string;templateId:string;createdAt:string;replayed:boolean}>{
 if(!uidPattern.test(actorUid)||typeof requestId!=="string"||!keyPattern.test(requestId))
  throw new HrAssignmentError(400,"Invalid assignment request.");
 if(!row(raw)||Object.keys(raw).some(k=>!["employeeUid","templateId","reviewedForWorkerPreparation"].includes(k))||
  !uidPattern.test(txt(raw.employeeUid))||!uidPattern.test(txt(raw.templateId))||
  raw.reviewedForWorkerPreparation!==true)
  throw new HrAssignmentError(400,"Choose a worker and an administrator-reviewed blank template.");
 const employeeUid=txt(raw.employeeUid),templateId=txt(raw.templateId);
 const fingerprint=createHash("sha256").update(JSON.stringify({
  employeeUid,templateId,reviewedForWorkerPreparation:true,
 })).digest("hex");
 const db=getFirestore();
 const admin=db.doc("userAccess/"+actorUid),worker=db.doc("userAccess/"+employeeUid);
 const templateRef=db.doc("hrTemplateCatalog/"+templateId);
 const requestRef=db.doc("hrTemplateAssignmentKeys/"+actorUid+"_"+requestId);
 const assignmentIndex=db.doc("hrTemplateAssignmentIndex/"+employeeUid+"_"+templateId);
 return db.runTransaction(async tx=>{
  const [adminSnap,workerSnap,templateSnap,priorSnap,indexSnap]=await Promise.all([
   tx.get(admin),tx.get(worker),tx.get(templateRef),tx.get(requestRef),tx.get(assignmentIndex),
  ]);
  if(txt(adminSnap.data()?.role)!=="Administrator"||txt(adminSnap.data()?.accountState)!=="Active")
   throw new HrAssignmentError(403,"Active HR Administrator required.");
  const workerState=txt(workerSnap.data()?.accountState);
  if(!workerSnap.exists||!txt(workerSnap.data()?.role)||
   txt(workerSnap.data()?.role)==="Customer"||
   !["Password change required","Onboarding","Pending approval","Active"].includes(workerState))
   throw new HrAssignmentError(404,"Worker account is not eligible for a document assignment.");
  const template=templateSnap.data();
  if(!templateSnap.exists||txt(template?.id)!==templateId||
   !/^hr-templates\/[A-Z0-9_]+\/[a-f0-9-]+\/source\.pdf$/.test(txt(template?.storagePath))||
   !/^[a-f0-9]{64}$/.test(txt(template?.sha256))||
   txt(template?.status)!=="Pending HR form and signer review"||
   template?.signedOriginal!==false)
   throw new HrAssignmentError(409,"The source template must be registered, unsigned and reviewable.");
  if(priorSnap.exists){
   if(txt(priorSnap.data()?.fingerprint)!==fingerprint)
    throw new HrAssignmentError(409,"Assignment request ID conflicts with a previous worker or form.");
   const assignmentId=txt(priorSnap.data()?.assignmentId);
   const proof=assignmentId?await tx.get(db.doc("hrDocumentAssignments/"+assignmentId)):null;
   if(!proof?.exists||txt(proof.data()?.employeeUid)!==employeeUid||
    txt(proof.data()?.templateId)!==templateId)
    throw new HrAssignmentError(409,"Prior assignment requires reconciliation.");
   return{assignmentId,employeeUid,templateId,
    createdAt:txt(proof.data()?.createdAt),replayed:true};
  }
  if(indexSnap.exists)
   throw new HrAssignmentError(409,"This worker already has an assignment for this edition.");
  const assignmentId="hrassign-"+randomUUID(),createdAt=new Date().toISOString();
  const assignment:AssignedHrTemplate={
   id:assignmentId,employeeUid,templateId,kind:txt(template.kind) as HrTemplateKind,
   title:txt(template.title),edition:txt(template.edition),
   sha256:txt(template.sha256),storagePath:txt(template.storagePath),
   createdAt,createdBy:actorUid,status:"Assigned",
  };
  tx.create(db.doc("hrDocumentAssignments/"+assignmentId),assignment);
  tx.create(requestRef,{actorUid,assignmentId,employeeUid,templateId,fingerprint});
  tx.create(assignmentIndex,{assignmentId,employeeUid,templateId,createdAt});
  tx.create(db.doc("hrDocumentAssignmentAudit/"+assignmentId),{
   assignmentId,employeeUid,templateId,actorUid,createdAt,
   event:"Blank template assigned after Administrator edition and field-map confirmation",
   legallySigned:false,complianceApproved:false,
  });
  return{assignmentId,employeeUid,templateId,createdAt,replayed:false};
 });
}
/** Metadata only, scoped to the employee or active HR Administrator. */
export async function listTrustedHrAssignments(actorUid:string,targetUid?:unknown){
 if(!uidPattern.test(actorUid))throw new HrAssignmentError(401,"Sign in required.");
 const db=getFirestore(),actor=(await db.doc("userAccess/"+actorUid).get()).data();
 const state=txt(actor?.accountState),role=txt(actor?.role);
 const admin=role==="Administrator"&&state==="Active";
 const employeeUid=txt(targetUid)||actorUid;
 const self=employeeUid===actorUid&&Boolean(role)&&role!=="Customer"&&
  ["Onboarding","Pending approval","Active"].includes(state);
 if(!uidPattern.test(employeeUid)||(!admin&&!self))
  throw new HrAssignmentError(403,"Assignment register is outside your scope.");
 const snapshot=await db.collection("hrDocumentAssignments")
  .where("employeeUid","==",employeeUid).limit(40).get();
 return snapshot.docs.map(item=>{
  const v=item.data();
  return{id:item.id,employeeUid,templateId:txt(v.templateId),
   kind:txt(v.kind),title:txt(v.title),edition:txt(v.edition),
   status:txt(v.status),createdAt:txt(v.createdAt),
   submittedAt:txt(v.submittedAt)||undefined};
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
/** Return immutable, verified blank source bytes only to assigned worker or HR. */
export async function readTrustedHrAssignedTemplate(actorUid:string,assignmentId:unknown){
 if(!uidPattern.test(actorUid)||!assignmentPattern.test(txt(assignmentId)))
  throw new HrAssignmentError(400,"Invalid assigned form.");
 const db=getFirestore();
 const [access,assignment]=await db.getAll(
  db.doc("userAccess/"+actorUid),db.doc("hrDocumentAssignments/"+txt(assignmentId)),
 );
 const source=assignment.data() as AssignedHrTemplate|undefined;
 if(!source||source.status!=="Assigned")
  throw new HrAssignmentError(404,"No pending form assignment found.");
 const state=txt(access.data()?.accountState),role=txt(access.data()?.role);
 const admin=state==="Active"&&role==="Administrator";
 const self=source.employeeUid===actorUid&&Boolean(role)&&role!=="Customer"&&
  ["Onboarding","Pending approval","Active"].includes(state);
 if(!admin&&!self)
  throw new HrAssignmentError(403,"Form assignment is outside your scope.");
 const sourceTemplate=await db.doc("hrTemplateCatalog/"+source.templateId).get();
 const template=sourceTemplate.data();
 if(!template||txt(template.sha256)!==source.sha256||
  txt(template.storagePath)!==source.storagePath||
  txt(template.kind)!==source.kind)
  throw new HrAssignmentError(409,"Assigned source version needs HR reconciliation.");
 try{
  const object=getStorage().bucket().file(source.storagePath);
  const [metadataResult,dataResult]=await Promise.all([object.getMetadata(),object.download()]);
  const metadata=metadataResult[0],bytes=dataResult[0];
  const sha256=createHash("sha256").update(bytes).digest("hex");
  if(bytes.length<16||bytes.length>12*1024*1024||
   metadata.contentType!=="application/pdf"||
   txt(metadata.generation)!==txt(template.generation)||
   sha256!==source.sha256||
   bytes.subarray(0,5).toString("ascii")!=="%PDF-")
   throw new HrAssignmentError(409,"Source PDF fails immutable receipt verification.");
  return{assignmentId:source.id,kind:source.kind,title:source.title,
   edition:source.edition,sha256,pdfBase64:bytes.toString("base64")};
 }catch(error){
  if(error instanceof HrAssignmentError)throw error;
  throw new HrAssignmentError(503,"Private assigned PDF is unavailable.");
 }
}
