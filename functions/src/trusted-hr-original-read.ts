/* eslint-disable max-len, comma-spacing, key-spacing, indent, object-curly-spacing, curly, brace-style, keyword-spacing, arrow-parens, space-before-blocks */
import {createHash,randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HR_TEMPLATE_KINDS} from "./trusted-hr-template";
import {HrOriginalArchiveError} from "./trusted-hr-signed-original";

type Row=Record<string,unknown>;
const row=(value:unknown):value is Row=>
 Boolean(value&&typeof value==="object"&&!Array.isArray(value));
const txt=(value:unknown)=>typeof value==="string"?value.trim():"";
const uidPattern=/^[A-Za-z0-9_-]{3,128}$/;
const recordIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Readback is restricted to the owning active worker or a current Administrator.
 * No bearer download URLs, PDF public links, tax field values or disclosure in
 * read-audit metadata. A download is still not signature/legal review approval.
 * @param {string} actorUid Authenticated and non-revoked Firebase UID.
 * @param {unknown} rawInput Exact original/certificate record request.
 * @return {Promise<Row>} Verified PDF body and private download receipt.
 */
export async function readTrustedHrOriginal(
 actorUid:string,rawInput:unknown,
):Promise<Row>{
 if(!uidPattern.test(actorUid)||!row(rawInput)||
  Object.keys(rawInput).some(key=>!["recordId","artifact"].includes(key)))
  throw new HrOriginalArchiveError(400,"Invalid private HR original request.");
 const recordId=txt(rawInput.recordId);
 const artifact=txt(rawInput.artifact);
 if(!recordIdPattern.test(recordId)||
  !["Original","Certificate"].includes(artifact))
  throw new HrOriginalArchiveError(400,"Unsupported HR original reference.");
 const db=getFirestore();
 const [actorSnap,sourceSnap]=await Promise.all([
  db.doc("userAccess/"+actorUid).get(),
  db.doc("hrOriginalIntakeRecords/"+recordId).get(),
 ]);
 const actor=actorSnap.data();
 const active=txt(actor?.accountState)==="Active";
 const role=txt(actor?.role);
 if(!active||role!=="Administrator")
  throw new HrOriginalArchiveError(403,"Unverified original intake is restricted to active HR Administrators.");
 const entry=sourceSnap.data();
 if(!entry)
  throw new HrOriginalArchiveError(404,"Private HR source record not found.");
 const employeeUid=txt(entry.employeeUid);
 const kind=txt(entry.kind);
 if(!uidPattern.test(employeeUid)||
  !Object.prototype.hasOwnProperty.call(HR_TEMPLATE_KINDS,kind))
  throw new HrOriginalArchiveError(403,"Worker document scope denied.");
 if(role!=="Administrator"&&txt(entry.status)==="Quarantined; access revoked")
  throw new HrOriginalArchiveError(403,"Private original is held for HR quarantine review.");
 const path=txt(artifact==="Original"?entry.originalPath:entry.certificatePath);
 const sha256=txt(artifact==="Original"?entry.sha256:entry.certificateSha256);
 const expectedGeneration=txt(artifact==="Original"?entry.generation:entry.certificateGeneration);
 const requiredName=artifact==="Original"?"signed.pdf":"certificate.pdf";
 const allowedPath="hr-private/"+employeeUid+"/"+kind+"/"+recordId+"/"+requiredName;
 if(!path||path!==allowedPath||!/^[a-f0-9]{64}$/.test(sha256))
  throw new HrOriginalArchiveError(409,"Private original evidence is unavailable or mismatched.");
 try{
  const file=getStorage().bucket().file(path);
  const [metadataResult,bytesResult]=await Promise.all([
   file.getMetadata(),file.download(),
  ]);
  const metadata=metadataResult[0];
  const bytes=bytesResult[0];
  const actualHash=createHash("sha256").update(bytes).digest("hex");
  if(metadata.contentType!=="application/pdf"||
   bytes.length<16||bytes.length>=8*1024*1024||
   Number(metadata.size)!==bytes.length||
   bytes.subarray(0,5).toString("ascii")!=="%PDF-"||
   !bytes.subarray(Math.max(0,bytes.length-2048))
    .toString("latin1").includes("%%EOF")||
   actualHash!==sha256||
   (expectedGeneration&&String(metadata.generation)!==expectedGeneration))
   throw new HrOriginalArchiveError(409,
    "Private original failed integrity verification. Request HR reconciliation.");
  const viewedAt=new Date().toISOString();
  const auditId=randomUUID();
  await db.collection("hrOriginalIntakeReadAudit").doc(auditId).create({
   auditId,recordId,employeeUid,actorUid,artifact,sha256,viewedAt,
   action:"Private original retrieved after storage integrity readback",
  });
  return {
   recordId,artifact,sha256,readAuditId:auditId,
   fileName:kind+"-"+recordId+"-"+requiredName,
   pdfBase64:bytes.toString("base64"),
   status:txt(entry.status)||"Pending independent HR review",
  };
 }catch(error){
  if(error instanceof HrOriginalArchiveError)throw error;
  throw new HrOriginalArchiveError(503,
   "Secure HR original readback unavailable. Try again or contact HR.");
 }
}
