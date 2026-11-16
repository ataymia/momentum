import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {currentFirebaseSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";

export type HrTemplateKind=
 "W9"|"I9"|"W4"|"AZ_A4"|"CONTRACTOR_AGREEMENT"|"EMPLOYEE_AGREEMENT"|"OTHER";
export const HR_TEMPLATE_CHOICES:ReadonlyArray<{
 kind:HrTemplateKind;title:string;worker:"Contractor"|"Employee"|"All workers";
 source?:string;
}>=[
 {kind:"W9",title:"IRS Form W-9",worker:"Contractor",
  source:"https://www.irs.gov/forms-pubs/about-form-w-9"},
 {kind:"I9",title:"USCIS Form I-9",worker:"Employee",
  source:"https://www.uscis.gov/i-9"},
 {kind:"W4",title:"IRS Form W-4",worker:"Employee",
  source:"https://www.irs.gov/forms-pubs/about-form-w-4"},
 {kind:"AZ_A4",title:"Arizona Form A-4",worker:"Employee",
  source:"https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election"},
 {kind:"CONTRACTOR_AGREEMENT",title:"Independent contractor agreement",worker:"Contractor"},
 {kind:"EMPLOYEE_AGREEMENT",title:"Employment agreement",worker:"Employee"},
 {kind:"OTHER",title:"Other blank HR form",worker:"All workers"},
] as const;

export type HrTemplateFieldHint={
 id:string;label:string;type:"Text"|"Date"|"Checkbox"|"Signature"|"Initials";
 signer:"Worker"|"Company";required:boolean;pdfFieldName?:string;
};
export type HrTemplateRegistration={
 kind:HrTemplateKind;title:string;edition:string;
 storagePath:string;sha256:string;
 fields:HrTemplateFieldHint[];blankTemplateConfirmed:true;
};
export type HrTemplateRecord=HrTemplateRegistration&{
 id:string;source:string;classification:string;
 size:number;generation:string;createdBy:string;createdAt:string;
 status:"Pending HR form and signer review";signedOriginal:false;
};
export type UploadedHrTemplate={
 storagePath:string;sha256:string;size:number;kind:HrTemplateKind;
};
const MAX_UPLOAD=12*1024*1024;

async function activeSession():Promise<FirebaseAuthSession>{
 const session=await currentFirebaseSession();
 if(!session)throw new Error("Sign in to the connected HR workspace again.");
 return session;
}
function digestHex(buffer:ArrayBuffer):Promise<string>{
 if(!crypto?.subtle)throw new Error("Secure browser cryptography is unavailable.");
 return crypto.subtle.digest("SHA-256",buffer).then(result=>
  Array.from(new Uint8Array(result)).map(value=>value.toString(16).padStart(2,"0")).join(""));
}
function pdfBase64(buffer:ArrayBuffer):string{
 const bytes=new Uint8Array(buffer);
 let binary="";
 for(let offset=0;offset<bytes.length;offset+=32768)
  binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
 return btoa(binary);
}
/** Upload only an unsigned blank source through authenticated server verification.
 * No undocumented direct-browser Storage REST routes, no signed-status mutation.
 * Retries must preserve requestId even when the browser loses the first receipt.
 */
export async function uploadBlankHrTemplate(
 file:File,kind:HrTemplateKind,requestId:string,
):Promise<UploadedHrTemplate>{
 if(!HR_TEMPLATE_CHOICES.some(choice=>choice.kind===kind))
  throw new Error("Unsupported HR template category.");
 if(file.size<8||file.size>=MAX_UPLOAD||
  !(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")))
  throw new Error("Choose an unsigned PDF template under 12 MB.");
 const buffer=await file.arrayBuffer();
 if(String.fromCharCode(...new Uint8Array(buffer.slice(0,5)))!=="%PDF-")
  throw new Error("This file is not a PDF.");
 const sha256=await digestHex(buffer);
 const session=await activeSession();
 const response=await fetch(firebaseFunctionUrl("uploadHrBlankTemplate"),{
  method:"POST",headers:{
   authorization:"Bearer "+session.idToken,"content-type":"application/json",
  },body:JSON.stringify({
   requestId,upload:{
    kind,pdfBase64:pdfBase64(buffer),sha256,blankTemplateConfirmed:true,
   },
  }),
 }).catch(()=>null);
 if(!response)throw new Error(
  "HR template upload service is unreachable. Retry with the SAME request ID.");
 const result=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;kind?:HrTemplateKind;storagePath?:string;
   sha256?:string;size?:number;generation?:string}|null;
 if(!response.ok||result?.ok!==true)
  throw new Error(result?.message||"Upload not confirmed. Retry with the SAME request ID.");
 if(result.kind!==kind||result.sha256!==sha256||result.size!==buffer.byteLength||
  !result.generation||!result.storagePath?.startsWith("hr-templates/"+kind+"/")||
  !result.storagePath.endsWith("/source.pdf"))
  throw new Error("The server's saved-PDF receipt differs from the selected original.");
 return{kind,storagePath:result.storagePath,sha256,size:result.size};
}

/** Only the server can register a blank upload as pending HR/legal review. */
export async function registerHrTemplate(
 session:FirebaseAuthSession,template:HrTemplateRegistration,requestId:string,
):Promise<{templateId:string;createdAt:string;replayed:boolean}>{
 const response=await fetch(firebaseFunctionUrl("hrFormTemplateLibrary"),{
  method:"POST",headers:{
   authorization:"Bearer "+session.idToken,"content-type":"application/json",
  },body:JSON.stringify({action:"Register",template,requestId}),
 }).catch(()=>null);
 if(!response)throw new Error("HR template registration service is unreachable.");
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;templateId?:string;createdAt?:string;replayed?:boolean}|null;
 if(!response.ok||data?.ok!==true||!data.templateId||!data.createdAt)
  throw new Error(data?.message||"Template was not verified. Keep the receipt to retry registration.");
 return{templateId:data.templateId,createdAt:data.createdAt,replayed:Boolean(data.replayed)};
}

export async function listHrTemplates(session:FirebaseAuthSession):Promise<HrTemplateRecord[]>{
 const response=await fetch(firebaseFunctionUrl("hrFormTemplateLibrary"),{
  method:"POST",headers:{
   authorization:"Bearer "+session.idToken,"content-type":"application/json",
  },body:JSON.stringify({action:"List"}),
 }).catch(()=>null);
 if(!response)throw new Error("HR template list service is unreachable.");
 const data=await response.json().catch(()=>null) as
  {ok?:boolean;message?:string;records?:HrTemplateRecord[]}|null;
 if(!response.ok||data?.ok!==true||!Array.isArray(data.records))
  throw new Error(data?.message||"Private HR template register cannot be verified.");
 return data.records;
}
