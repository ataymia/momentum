import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {HrTemplateKind} from "./firebase-hr-template-library";

export type HrOriginalSource="Paper signed scan"|"External e-sign result"|"In-app prepared PDF (unverified)";
export type HrOriginalArchiveReceipt={
 recordId:string;employeeUid:string;kind:HrTemplateKind;sha256:string;
 status:"Pending independent HR review";createdAt:string;replayed:boolean;
};
export type HrOriginalReviewStatus=
 "Pending independent HR review"|"Requires correction"|
 "Evidence inspected; compliance verification pending"|"Quarantined; access revoked";
export type HrOriginalReviewDecision="Return for correction"|"Record evidence inspection"|"Quarantine misfiled original";
export type HrOriginalRecord={
 id:string;employeeUid:string;kind:HrTemplateKind;sha256:string;
 status:string;createdAt:string;sourceType:HrOriginalSource;hasCertificate:boolean;
};
const LIMIT=8*1024*1024;
async function pdfPayload(file:File,limit=LIMIT){
 if(!file||file.size<16||file.size>=limit||
  !(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")))
  throw new Error("Select a PDF smaller than "+Math.floor(limit/1024/1024)+" MB.");
 const buffer=await file.arrayBuffer();
 const bytes=new Uint8Array(buffer);
 if(String.fromCharCode(...bytes.subarray(0,5))!=="%PDF-")
  throw new Error("The selected file does not begin with a PDF header.");
 const hash=await crypto.subtle.digest("SHA-256",buffer);
 const sha256=Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
 let encoded="";
 for(let index=0;index<bytes.length;index+=32768)
  encoded+=String.fromCharCode(...bytes.subarray(index,index+32768));
 return {pdfBase64:btoa(encoded),sha256};
}
/** Authenticated server-only archive. The receipt does not attest valid signatures. */
export async function archiveHrOriginal(
 session:FirebaseAuthSession,input:{
  employeeUid:string;kind:HrTemplateKind;sourceType:HrOriginalSource;
  reference:string;pdf:File;certificate?:File;
 },requestId:string,
):Promise<HrOriginalArchiveReceipt>{
 const source=await pdfPayload(input.pdf);
 const certificate=input.certificate?
  await pdfPayload(input.certificate,4*1024*1024):undefined;
 const response=await fetch(firebaseFunctionUrl("hrSignedOriginalArchive"),{
  method:"POST",
  headers:{authorization:"Bearer "+session.idToken,"content-type":"application/json"},
  body:JSON.stringify({
   action:"Archive",requestId,
   original:{
    employeeUid:input.employeeUid,kind:input.kind,sourceType:input.sourceType,
    reference:input.reference,...source,
    ...(certificate?{
     certificateBase64:certificate.pdfBase64,
     certificateSha256:certificate.sha256,
    }:{}),
   },
  }),
 }).catch(()=>null);
 if(!response)throw new Error("HR archive service unreachable. Retry without changing the document.");
 const data=await response.json().catch(()=>null) as
  (HrOriginalArchiveReceipt&{ok?:boolean;message?:string})|null;
 if(!response.ok||data?.ok!==true||!data.recordId||
  data.sha256!==source.sha256||
  data.employeeUid!==input.employeeUid||
  data.status!=="Pending independent HR review")
  throw new Error(data?.message||"Original archive verification not confirmed. Retry with the same file.");
 return data;
}

/** Metadata only. No downloaded PDF, worker TIN or bearer-style download link. */
export async function listHrOriginals(
 session:FirebaseAuthSession,employeeUid?:string,
):Promise<HrOriginalRecord[]>{
 const response=await fetch(firebaseFunctionUrl("hrSignedOriginalArchive"),{
  method:"POST",
  headers:{authorization:"Bearer "+session.idToken,"content-type":"application/json"},
  body:JSON.stringify({action:"List",...(employeeUid?{employeeUid}:{})}),
 }).catch(()=>null);
 if(!response)throw new Error("Secure HR document register unavailable.");
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;records?:HrOriginalRecord[]}|null;
 if(!response.ok||data?.ok!==true||!Array.isArray(data.records))
  throw new Error(data?.message||"HR record listing was not authorized.");
 return data.records;
}

/** Privileged, read-audited private file retrieval. The path is resolved by
 * the server and the file SHA-256 is verified again in the browser. No public
 * URL or persistent browser cache is created.
 */
export async function downloadHrOriginalBytes(
 session:FirebaseAuthSession,
 recordId:string,
 artifact:"Original"|"Certificate",
):Promise<{bytes:Uint8Array<ArrayBuffer>;fileName:string;sha256:string;readAuditId:string}>{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(recordId))
  throw new Error("Invalid private original identifier.");
 const response=await fetch(firebaseFunctionUrl("hrSignedOriginalArchive"),{
  method:"POST",cache:"no-store",
  headers:{authorization:"Bearer "+session.idToken,"content-type":"application/json"},
  body:JSON.stringify({action:"Read",recordId,artifact}),
 }).catch(()=>null);
 if(!response)throw new Error("Secure HR document retrieval unavailable.");
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;recordId?:string;artifact?:string;
   pdfBase64?:string;fileName?:string;sha256?:string;readAuditId?:string}|null;
 if(!response.ok||data?.ok!==true||data.recordId!==recordId||
  data.artifact!==artifact||!data.pdfBase64||
  !/^[A-Za-z0-9_-]+-[0-9a-f-]+-(signed|certificate)\.pdf$/.test(data.fileName??"")||
  !/^[a-f0-9]{64}$/.test(data.sha256??"")||
  !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(data.readAuditId??""))
  throw new Error(data?.message||"Private HR original could not be verified.");
 if(data.pdfBase64.length>Math.ceil(LIMIT/3)*4+4||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(data.pdfBase64))
  throw new Error("Private HR original has unexpected binary framing.");
 const binary=atob(data.pdfBase64);
 const bytes=new Uint8Array(binary.length);
 for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
 if(bytes.length<16||bytes.length>=LIMIT||
  String.fromCharCode(...bytes.subarray(0,5))!=="%PDF-")
  throw new Error("Private HR original is not a valid-sized PDF.");
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
  .map(v=>v.toString(16).padStart(2,"0")).join("");
 if(actual!==data.sha256)
  throw new Error("Downloaded HR original failed integrity verification.");
 return {bytes,fileName:data.fileName!,sha256:actual,
  readAuditId:data.readAuditId!};
}


/** Only a source-inspection record or correction request; NOT form signature approval. */
export async function reviewHrOriginal(
 session:FirebaseAuthSession,
 input:{
  recordId:string;expectedStatus:HrOriginalReviewStatus;
  decision:HrOriginalReviewDecision;reason:string;
  readAuditId:string;sha256:string;
 },
 requestId:string,
):Promise<{recordId:string;status:HrOriginalReviewStatus;reviewedAt:string;replayed:boolean}>{
 const response=await fetch(firebaseFunctionUrl("hrSignedOriginalArchive"),{
  method:"POST",cache:"no-store",
  headers:{authorization:"Bearer "+session.idToken,"content-type":"application/json"},
  body:JSON.stringify({action:"Review",review:input,requestId}),
 }).catch(()=>null);
 if(!response)throw new Error("HR review service unavailable. Check source before retrying.");
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;recordId?:string;status?:HrOriginalReviewStatus;
   reviewedAt?:string;replayed?:boolean}|null;
 if(!response.ok||data?.ok!==true||data.recordId!==input.recordId||
  !["Requires correction","Evidence inspected; compliance verification pending","Quarantined; access revoked"].includes(data.status??"")||
  !data.reviewedAt)
  throw new Error(data?.message||"HR review was not confirmed. Refresh source and retry with the same request ID.");
 return{recordId:input.recordId,status:data.status!,reviewedAt:data.reviewedAt,
  replayed:Boolean(data.replayed)};
}
