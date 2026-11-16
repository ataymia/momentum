import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {HrTemplateKind} from "./firebase-hr-template-library";

export type HrOriginalSource="Paper signed scan"|"External e-sign result";
export type HrOriginalArchiveReceipt={
 recordId:string;employeeUid:string;kind:HrTemplateKind;sha256:string;
 status:"Pending independent HR review";createdAt:string;replayed:boolean;
};
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
