/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HR_TEMPLATE_KINDS, type HrTemplateKind} from "./trusted-hr-template";

type Row=Record<string,unknown>;
type SourceType="Paper signed scan"|"External e-sign result"|"In-app prepared PDF (unverified)"|"Employee-submitted PDF (unverified)";
type Incoming={
 employeeUid:string;kind:HrTemplateKind;sourceType:SourceType;
 reference:string;pdf:Buffer;sha256:string;attestedByWorker:boolean;assignmentId?:string;
 certificate?:{pdf:Buffer;sha256:string};
};
type Reservation={id:string;path:string;createdAt:string;replayed:boolean};
type Archived={
 recordId:string;employeeUid:string;kind:HrTemplateKind;
 originalPath:string;sha256:string;generation:string;
 certificatePath?:string;certificateSha256?:string;certificateGeneration?:string;
 status:"Pending independent HR review";createdAt:string;replayed:boolean;
};
const row=(value:unknown):value is Row=>Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const txt=(value:unknown)=>typeof value==="string"?value.trim():"";
const uid=/^[a-zA-Z0-9_-]{3,128}$/;
const retryKey=/^[a-zA-Z0-9_-]{16,80}$/;

/** A pending archive entry is NOT e-sign provider verification, I-9 examination,
 * tax compliance approval, or a completed onboarding task.
 */
export class HrOriginalArchiveError extends Error {
 /** @param {number} status Safe HTTP status.
  * @param {string} message Safe response message with no worker PII.
  */
 constructor(public readonly status:number,message:string){super(message);}
}

/** Accept only canonical PDF bytes and verify the actual SHA-256.
 * @param {unknown} encoded Base64 PDF.
 * @param {unknown} checksum Expected SHA-256.
 * @param {number} max Maximum decoded byte length, exclusive.
 * @return {{pdf:Buffer,sha256:string}} Verified bytes.
 */
function parsePdf(encoded:unknown,checksum:unknown,max:number){
 const base64=txt(encoded);
 const sha256=txt(checksum).toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(sha256)||base64.length<12||
  base64.length>Math.ceil(max/3)*4+4||base64.length%4!==0||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
  throw new HrOriginalArchiveError(400,"Invalid signed-original PDF encoding or hash.");
 const pdf=Buffer.from(base64,"base64");
 if(pdf.toString("base64")!==base64||pdf.length<16||pdf.length>=max||
  pdf.subarray(0,5).toString("ascii")!=="%PDF-"||
  !pdf.subarray(Math.max(0,pdf.length-2048)).toString("latin1").includes("%%EOF"))
  throw new HrOriginalArchiveError(400,"Signed-original file must be a well-framed PDF within the permitted size.");
 if(createHash("sha256").update(pdf).digest("hex")!==sha256)
  throw new HrOriginalArchiveError(409,"Signed-original PDF checksum does not match its bytes.");
 return {pdf,sha256};
}

/** Require a known worker and source details; never accept claimed signature status.
 * @param {unknown} raw Untrusted request envelope.
 * @return {Incoming} Validated original and optional provider certificate.
 */
function parseRequest(raw:unknown):Incoming {
 if(!row(raw)||Object.keys(raw).some(key=>![
  "employeeUid","kind","sourceType","reference","pdfBase64","sha256",
  "certificateBase64","certificateSha256","attestedByWorker","assignmentId"].includes(key)))
  throw new HrOriginalArchiveError(400,"Unexpected signed-original archive fields.");
 const employeeUid=txt(raw.employeeUid);
 const kind=txt(raw.kind) as HrTemplateKind;
 const sourceType=txt(raw.sourceType) as SourceType;
 const reference=txt(raw.reference);
 if(!uid.test(employeeUid)||
  !Object.prototype.hasOwnProperty.call(HR_TEMPLATE_KINDS,kind)||
  !["Paper signed scan","External e-sign result","In-app prepared PDF (unverified)","Employee-submitted PDF (unverified)"].includes(sourceType)||
  reference.length<5||reference.length>160||
  (sourceType==="External e-sign result"&&!reference))
  throw new HrOriginalArchiveError(400,"Worker, form kind or external evidence reference invalid.");
 const workerSource=sourceType==="Employee-submitted PDF (unverified)";
 const assignmentId=txt(raw.assignmentId);
 if(raw.assignmentId!==undefined&&(!workerSource||!/^hrassign-[0-9a-f-]{36}$/.test(assignmentId)))
  throw new HrOriginalArchiveError(400,"Assigned source must belong to an employee submission.");
 if(workerSource?raw.attestedByWorker!==true:raw.attestedByWorker!==undefined)
  throw new HrOriginalArchiveError(400,"Worker attestation is required only for employee self-service intake.");
 const original=parsePdf(raw.pdfBase64,raw.sha256,8*1024*1024);
 const hasCertificate=raw.certificateBase64!==undefined||raw.certificateSha256!==undefined;
 let certificate:{pdf:Buffer;sha256:string}|undefined;
 if(hasCertificate){
  if(sourceType!=="External e-sign result"||
   raw.certificateBase64===undefined||raw.certificateSha256===undefined)
   throw new HrOriginalArchiveError(400,"A certificate must accompany external e-sign evidence only.");
  certificate=parsePdf(raw.certificateBase64,raw.certificateSha256,4*1024*1024);
 }
 return {employeeUid,kind,sourceType,reference,...original,attestedByWorker:workerSource,
  ...(assignmentId?{assignmentId}:{}),
  ...(certificate?{certificate}:{})};
}

/** Persist an immutable original plus optional e-sign completion certificate.
 * The named worker is the sole record subject. Active Administrators can
 * archive verified external originals; an authenticated onboarding worker can
 * submit only their own explicitly attested unverified PDF for HR review.
 * SHA readback verifies the storage object on every retry.
 * This never asserts that the form was properly signed or legally accepted.
 * @param {string} actorUid Revocation-verified Firebase identity.
 * @param {unknown} raw Uploaded PDF plus administrative source reference.
 * @param {unknown} key Stable retry identifier.
 * @return {Promise<Archived>} Pending-review receipt, never a compliance approval.
 */
export async function archiveTrustedHrSignedOriginal(
 actorUid:string,raw:unknown,key:unknown,
):Promise<Archived>{
 if(!uid.test(actorUid)||typeof key!=="string"||!retryKey.test(key))
  throw new HrOriginalArchiveError(400,"Invalid HR archive retry key.");
 const incoming=parseRequest(raw);
 const db=getFirestore();
 const admin=db.doc("userAccess/"+actorUid);
 const worker=db.doc("userAccess/"+incoming.employeeUid);
 const requestRef=db.doc("hrOriginalArchiveRequests/"+actorUid+"_"+key);
 const fingerprint=createHash("sha256").update(JSON.stringify({
  employeeUid:incoming.employeeUid,kind:incoming.kind,
  sourceType:incoming.sourceType,reference:incoming.reference,
  sha256:incoming.sha256,certificateSha256:incoming.certificate?.sha256??"",
  attestedByWorker:incoming.attestedByWorker,assignmentId:incoming.assignmentId??"",
 })).digest("hex");
 const reserved:Reservation=await db.runTransaction(async tx=>{
  const assignmentRef=incoming.assignmentId?
   db.doc("hrDocumentAssignments/"+incoming.assignmentId):null;
  const [adminSnap,workerSnap,prior,assignmentSnap]=await Promise.all([
   tx.get(admin),tx.get(worker),tx.get(requestRef),
   assignmentRef?tx.get(assignmentRef):Promise.resolve(null),
  ]);
  const accountState=txt(adminSnap.data()?.accountState);
  const role=txt(adminSnap.data()?.role);
  const administrator=accountState==="Active"&&role==="Administrator";
  const ownWorker=actorUid===incoming.employeeUid&&
   ["Onboarding","Pending approval","Active"].includes(accountState)&&
   Boolean(role)&&role!=="Customer"&&
   incoming.sourceType==="Employee-submitted PDF (unverified)"&&
   incoming.attestedByWorker===true;
  if(incoming.sourceType==="Employee-submitted PDF (unverified)"&&
   actorUid!==incoming.employeeUid)
   throw new HrOriginalArchiveError(403,"Worker attestation cannot be submitted on behalf of another worker.");
  if(!administrator&&!ownWorker)
   throw new HrOriginalArchiveError(403,"Active HR authorization or authenticated worker self-submission required.");
  if(!workerSnap.exists||txt(workerSnap.data()?.role)==="Customer"||
   txt(workerSnap.data()?.role)==="")
   throw new HrOriginalArchiveError(404,"Worker account could not be verified.");
  if(assignmentSnap&&(
   txt(assignmentSnap.data()?.employeeUid)!==incoming.employeeUid||
   txt(assignmentSnap.data()?.kind)!==incoming.kind))
   throw new HrOriginalArchiveError(403,"Assigned HR document is outside your worker and form scope.");
  if(prior.exists){
   if(txt(prior.data()?.fingerprint)!==fingerprint||
    txt(prior.data()?.actorUid)!==actorUid)
    throw new HrOriginalArchiveError(409,"Archive retry key was used for another document.");
   const id=txt(prior.data()?.id);
   const path=txt(prior.data()?.path);
   if(!uid.test(id)||!path.startsWith(
    "hr-private/"+incoming.employeeUid+"/"+incoming.kind+"/")||
    !path.endsWith("/signed.pdf"))
    throw new HrOriginalArchiveError(409,"Existing archive reservation requires reconciliation.");
   return {id,path,createdAt:txt(prior.data()?.createdAt),replayed:true};
  }
  if(incoming.assignmentId&&(!assignmentSnap?.exists||
   txt(assignmentSnap.data()?.status)!=="Assigned"))
   throw new HrOriginalArchiveError(409,"This HR assignment is not awaiting a submission.");
  const id=randomUUID();
  const path="hr-private/"+incoming.employeeUid+"/"+incoming.kind+"/"+id+"/signed.pdf";
  const createdAt=new Date().toISOString();
  tx.create(requestRef,{
   id,path,actorUid,employeeUid:incoming.employeeUid,fingerprint,
   createdAt,status:"Reserved; no signed verification",
  });
  return {id,path,createdAt,replayed:false};
 });
 const bucket=getStorage().bucket();
 const writeAndVerify=async (path:string,pdf:Buffer,sha256:string)=>{
  const file=bucket.file(path);
  // An idempotent retry MUST NOT rewrite an existing immutable object. Some
  // storage emulators do not enforce upload preconditions consistently; the
  // existence check prevents changing generation on a valid replay.
  const [alreadyExists]=await file.exists().catch(()=>[false]);
  if(!alreadyExists){
   try{
    await file.save(pdf,{
     resumable:false,contentType:"application/pdf",
     metadata:{cacheControl:"private, no-store"},
     preconditionOpts:{ifGenerationMatch:0},
    });
   }catch{
    const [existsAfterRace]=await file.exists().catch(()=>[false]);
    if(!existsAfterRace)throw new HrOriginalArchiveError(503,
     "Original archive storage unavailable. Retry with the SAME request ID.");
   }
  }
  try{
   const [metadataResult,downloadResult]=await Promise.all([
    file.getMetadata(),file.download(),
   ]);
   const metadata=metadataResult[0];
   const saved=downloadResult[0];
   if(metadata.contentType!=="application/pdf"||
    Number(metadata.size)!==pdf.length||saved.length!==pdf.length||
    createHash("sha256").update(saved).digest("hex")!==sha256||
    !metadata.generation)
    throw new HrOriginalArchiveError(409,
     "Private original differs from the expected bytes. Quarantine for HR review.");
   return String(metadata.generation);
  }catch(error){
   if(error instanceof HrOriginalArchiveError)throw error;
   throw new HrOriginalArchiveError(503,
    "Archived PDF readback unavailable. Retry with the SAME request ID.");
  }
 };
 const generation=await writeAndVerify(reserved.path,incoming.pdf,incoming.sha256);
 const certificatePath=incoming.certificate?
  reserved.path.replace(/signed\.pdf$/,"certificate.pdf"):undefined;
 const certificateGeneration=incoming.certificate&&certificatePath?
  await writeAndVerify(certificatePath,incoming.certificate.pdf,incoming.certificate.sha256):undefined;
 const recordRef=db.doc("hrOriginalIntakeRecords/"+reserved.id);
 const auditRef=db.doc("hrOriginalIntakeAudit/"+reserved.id);
 await db.runTransaction(async tx=>{
  const assignmentRef=incoming.assignmentId?
   db.doc("hrDocumentAssignments/"+incoming.assignmentId):null;
  const [actor,workerSnap,request,existing,assignment]=await Promise.all([
   tx.get(admin),tx.get(worker),tx.get(requestRef),tx.get(recordRef),
   assignmentRef?tx.get(assignmentRef):Promise.resolve(null),
  ]);
  const finalState=txt(actor.data()?.accountState),finalRole=txt(actor.data()?.role);
  const adminStillAuthorized=finalState==="Active"&&finalRole==="Administrator";
  const workerStillAuthorized=actorUid===incoming.employeeUid&&
   ["Onboarding","Pending approval","Active"].includes(finalState)&&
   Boolean(finalRole)&&finalRole!=="Customer"&&
   incoming.sourceType==="Employee-submitted PDF (unverified)"&&
   incoming.attestedByWorker===true;
  if(incoming.sourceType==="Employee-submitted PDF (unverified)"&&
   actorUid!==incoming.employeeUid)
   throw new HrOriginalArchiveError(403,"Worker attestation must originate from the worker.");
  if(!adminStillAuthorized&&!workerStillAuthorized)
   throw new HrOriginalArchiveError(403,"HR archive authorization was revoked.");
  if(!workerSnap.exists||txt(workerSnap.data()?.role)==="Customer")
   throw new HrOriginalArchiveError(409,"Worker identity changed during upload.");
  if(txt(request.data()?.fingerprint)!==fingerprint)
   throw new HrOriginalArchiveError(409,"Original archive reservation changed.");
  if(assignment&&(
   txt(assignment.data()?.employeeUid)!==incoming.employeeUid||
   txt(assignment.data()?.kind)!==incoming.kind||
   (txt(assignment.data()?.status)!=="Assigned"&&
    txt(assignment.data()?.submittedOriginalId)!==reserved.id)))
   throw new HrOriginalArchiveError(409,"Assigned form changed while submitting.");
  if(existing.exists){
   if(txt(existing.data()?.sha256)!==incoming.sha256||
    txt(existing.data()?.employeeUid)!==incoming.employeeUid)
    throw new HrOriginalArchiveError(409,"Existing original record conflicts with uploaded bytes.");
   return;
  }
  tx.create(recordRef,{
   id:reserved.id,employeeUid:incoming.employeeUid,kind:incoming.kind,
   sourceType:incoming.sourceType,reference:incoming.reference,
   employeeAttested:incoming.attestedByWorker,
   ...(incoming.assignmentId?{assignmentId:incoming.assignmentId}:{}),
   originalPath:reserved.path,sha256:incoming.sha256,generation,
   ...(certificatePath?{certificatePath,
    certificateSha256:incoming.certificate?.sha256,
    certificateGeneration}:{}),
   uploadedBy:actorUid,createdAt:reserved.createdAt,
   status:"Pending independent HR review",
   independentlyVerified:false,complianceApproved:false,
   signedOriginalVerified:false,
  });
  if(assignmentRef&&assignment)
   tx.update(assignmentRef,{
    status:"Submitted for HR review",submittedOriginalId:reserved.id,
    submittedAt:reserved.createdAt,
   });
  tx.create(auditRef,{
   recordId:reserved.id,employeeUid:incoming.employeeUid,actorUid,
   event:incoming.attestedByWorker?
    "Authenticated worker submitted unverified PDF for independent HR review":
    "Immutable source bytes archived for independent HR verification",
   employeeAttested:incoming.attestedByWorker,
   at:reserved.createdAt,kind:incoming.kind,sha256:incoming.sha256,
  });
 });
 return {recordId:reserved.id,employeeUid:incoming.employeeUid,
  kind:incoming.kind,originalPath:reserved.path,sha256:incoming.sha256,
  generation,...(certificatePath?{certificatePath,
   certificateSha256:incoming.certificate?.sha256,
   certificateGeneration}:{}),
  createdAt:reserved.createdAt,status:"Pending independent HR review",
  replayed:reserved.replayed};
}

/** Scoped record index never returns PDF contents, tax IDs or download URLs.
 * @param {string} actorUid Verified current Firebase identity.
 * @param {unknown} targetUid Worker UID, omitted for an employee's own register.
 * @return {Promise<Row[]>} Latest original metadata.
 */
export async function listTrustedHrSignedOriginals(actorUid:string,targetUid:unknown){
 if(!uid.test(actorUid))throw new HrOriginalArchiveError(401,"Sign in first.");
 const db=getFirestore();
 const access=(await db.doc("userAccess/"+actorUid).get()).data();
 const state=txt(access?.accountState),role=txt(access?.role);
 const active=state==="Active";
 const administrator=active&&role==="Administrator";
 const employeeUid=txt(targetUid)||actorUid;
 const ownWorker=employeeUid===actorUid&&Boolean(role)&&role!=="Customer"&&
  ["Onboarding","Pending approval","Active"].includes(state);
 if(!administrator&&!ownWorker)
  throw new HrOriginalArchiveError(403,"Private HR metadata is accessible only to HR or the submitting worker.");
 if(!uid.test(employeeUid))
  throw new HrOriginalArchiveError(403,"HR document scope is not authorized.");
 const items=await db.collection("hrOriginalIntakeRecords")
  .where("employeeUid","==",employeeUid).limit(40).get();
 return items.docs.map(snapshot=>{
  const v=snapshot.data();
  return {id:snapshot.id,employeeUid,
   kind:txt(v.kind),status:txt(v.status),createdAt:txt(v.createdAt),
   sourceType:txt(v.sourceType),sha256:txt(v.sha256),
   hasCertificate:Boolean(v.certificatePath)};
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
