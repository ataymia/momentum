/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {
 HR_TEMPLATE_KINDS,TrustedHrTemplateError,type HrTemplateKind,
} from "./trusted-hr-template";

type Row=Record<string,unknown>;
type Intake={kind:HrTemplateKind;sha256:string;bytes:Buffer};
type UploadReceipt={
 kind:HrTemplateKind;storagePath:string;sha256:string;size:number;
 generation:string;createdAt:string;replayed:boolean;
 status:"Uploaded blank PDF; pending form and signer review";
};
const isRow=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const txt=(v:unknown)=>typeof v==="string"?v.trim():"";
const uidPattern=/^[a-zA-Z0-9_-]{3,128}$/;
const reqPattern=/^[a-zA-Z0-9_-]{16,80}$/;
const maxBytes=12*1024*1024;

/** Validate a canonical base64 PDF upload. The caller cannot set an object path,
 * role, owner, signed status, compliance approval or form values.
 * @param {unknown} raw Untrusted request payload.
 * @return {Intake} Server-validated PDF and its hash.
 */
function parseIntake(raw:unknown):Intake{
 if(!isRow(raw)||Object.keys(raw).some(key=>
  !["kind","pdfBase64","sha256","blankTemplateConfirmed"].includes(key))||
  raw.blankTemplateConfirmed!==true)
  throw new TrustedHrTemplateError(400,
   "Only an explicitly confirmed blank HR form may be uploaded.");
 const kind=txt(raw.kind) as HrTemplateKind;
 const sha256=txt(raw.sha256).toLowerCase();
 const base64=txt(raw.pdfBase64);
 if(!Object.prototype.hasOwnProperty.call(HR_TEMPLATE_KINDS,kind)||
  !/^[a-f0-9]{64}$/.test(sha256)||base64.length<12||
  base64.length>Math.ceil(maxBytes/3)*4+4||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length%4!==0)
  throw new TrustedHrTemplateError(400,"Invalid PDF form type, encoded length or checksum.");
 const bytes=Buffer.from(base64,"base64");
 if(bytes.toString("base64")!==base64||
  bytes.length<8||bytes.length>=maxBytes||
  bytes.subarray(0,5).toString("ascii")!=="%PDF-"||
  !bytes.subarray(Math.max(0,bytes.length-2048)).toString("latin1").includes("%%EOF"))
  throw new TrustedHrTemplateError(400,
   "Only a well-framed unsigned PDF under 12 MB may enter the HR template archive.");
 const actual=createHash("sha256").update(bytes).digest("hex");
 if(actual!==sha256)throw new TrustedHrTemplateError(409,"Selected PDF checksum does not match its bytes.");
 return{kind,sha256,bytes};
}

/** Authoritative, idempotent creation-only upload through Firebase Admin Storage.
 * The Firestore reservation is created first. If upload fails, the SAME
 * request ID can safely resume the same path. Neither step marks the
 * document legally signed or approved.
 * @param {string} actorUid Revoked-token-checked Firebase UID.
 * @param {unknown} raw Untrusted PDF/base64.
 * @param {unknown} rawRequestId Stable retry key from the browser.
 * @return {Promise<UploadReceipt>} Independently downloaded and hashed source receipt.
 */
export async function uploadTrustedBlankHrTemplate(
 actorUid:string,raw:unknown,rawRequestId:unknown,
):Promise<UploadReceipt>{
 if(!uidPattern.test(actorUid)||typeof rawRequestId!=="string"||
  !reqPattern.test(rawRequestId))
  throw new TrustedHrTemplateError(400,"Invalid HR template upload request ID.");
 const draft=parseIntake(raw);
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const requestRef=db.doc("hrTemplateUploadRequests/"+actorUid+"_"+rawRequestId);
 const fingerprint=createHash("sha256").update(
  draft.kind+":"+draft.sha256).digest("hex");
 const reservation=await db.runTransaction(async tx=>{
  const [accessSnap,priorSnap]=await Promise.all([
   tx.get(actorRef),tx.get(requestRef),
  ]);
  if(txt(accessSnap.data()?.accountState)!=="Active"||
   txt(accessSnap.data()?.role)!=="Administrator")
   throw new TrustedHrTemplateError(403,"Active Administrator access required.");
  if(priorSnap.exists){
   if(txt(priorSnap.data()?.fingerprint)!==fingerprint||
    txt(priorSnap.data()?.actorUid)!==actorUid)
    throw new TrustedHrTemplateError(409,"Upload request ID reused for different content.");
   const path=txt(priorSnap.data()?.storagePath);
   const expectedKind=draft.kind;
   if(!path.startsWith("hr-templates/"+expectedKind+"/")||
    !path.endsWith("/source.pdf"))
    throw new TrustedHrTemplateError(409,"Previous upload reservation needs reconciliation.");
   return{storagePath:path,createdAt:txt(priorSnap.data()?.createdAt),replayed:true};
  }
  const createdAt=new Date().toISOString();
  const storagePath="hr-templates/"+draft.kind+"/"+randomUUID()+"/source.pdf";
  tx.create(requestRef,{
   actorUid,storagePath,kind:draft.kind,sha256:draft.sha256,
   fingerprint,createdAt,status:"Upload reserved, not signed",
  });
  return{storagePath,createdAt,replayed:false};
 });
 const file=getStorage().bucket().file(reservation.storagePath);
 try{
  const [exists]=await file.exists();
  if(!exists){
   // The precondition forbids overwrite even for competing retry requests.
   await file.save(draft.bytes,{
    resumable:false,contentType:"application/pdf",
    preconditionOpts:{ifGenerationMatch:0},
   });
  }
 }catch(error){
  // A retry may race the first successful upload. Verify the actual bytes,
  // never assume an error means there is no saved object.
  const [exists]=await file.exists().catch(()=>[false]);
  if(!exists){
   console.error("HR blank upload unavailable",error);
   throw new TrustedHrTemplateError(503,
    "Blank form upload not confirmed. Retry with the SAME request ID.");
  }
 }
 let metadata:Record<string,unknown>;
 let saved:Buffer;
 try{
  const results=await Promise.all([file.getMetadata(),file.download()]);
  metadata=results[0][0] as Record<string,unknown>;
  saved=results[1][0];
 }catch(error){
  console.error("HR blank readback unavailable",error);
  throw new TrustedHrTemplateError(503,
   "Upload source readback unavailable. Retry with the SAME request ID.");
 }
 if(metadata.contentType!=="application/pdf"||
  Number(metadata.size)!==draft.bytes.length||
  saved.length!==draft.bytes.length||
  createHash("sha256").update(saved).digest("hex")!==draft.sha256||
  !metadata.generation)
  throw new TrustedHrTemplateError(409,
   "HR template source differs from the immutable original. Quarantine and reconcile before continuing.");
 return{
  kind:draft.kind,storagePath:reservation.storagePath,
  sha256:draft.sha256,size:saved.length,
  generation:String(metadata.generation),createdAt:reservation.createdAt,
  replayed:reservation.replayed,
  status:"Uploaded blank PDF; pending form and signer review",
 };
}
