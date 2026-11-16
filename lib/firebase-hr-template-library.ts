import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {currentFirebaseSession} from "./firebase-auth-rest";
import {firebaseWebConfig} from "./firebase-config";
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
const STORAGE_ORIGIN="https://firebasestorage.googleapis.com";
const MAX_UPLOAD=12*1024*1024;

async function activeSession():Promise<FirebaseAuthSession>{
 const session=await currentFirebaseSession();
 if(!session)throw new Error("Sign in to the connected HR workspace again.");
 return session;
}
function storageUrl(bucket:string,storagePath:string,params:string){
 return STORAGE_ORIGIN+"/v0/b/"+encodeURIComponent(bucket)+"/o/"+
  encodeURIComponent(storagePath)+params;
}
function digestHex(buffer:ArrayBuffer):Promise<string>{
 if(!crypto?.subtle)throw new Error("The secure browser cryptography API is unavailable.");
 return crypto.subtle.digest("SHA-256",buffer).then(result=>
  Array.from(new Uint8Array(result)).map(value=>value.toString(16).padStart(2,"0")).join(""));
}

/** Upload an immutable PDF template to the Administrator-only Storage location.
 * Does NOT upload a completed W-9, an identity scan or a signed worker file.
 * The second authenticated download verifies that the uploaded bytes match.
 */
export async function uploadBlankHrTemplate(file:File,kind:HrTemplateKind):Promise<UploadedHrTemplate>{
 if(!HR_TEMPLATE_CHOICES.some(choice=>choice.kind===kind))
  throw new Error("Unsupported HR template category.");
 if(file.size<8||file.size>=MAX_UPLOAD||
  !(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")))
  throw new Error("Choose an unsigned PDF template under 12 MB.");
 const buffer=await file.arrayBuffer();
 if(String.fromCharCode(...new Uint8Array(buffer.slice(0,5)))!=="%PDF-")
  throw new Error("This file is not a PDF. Convert the unsigned form to PDF first.");
 const sha256=await digestHex(buffer);
 const config=firebaseWebConfig();
 if(!config?.storageBucket)throw new Error("Firebase Storage is not configured.");
 const id=crypto.randomUUID();
 const storagePath="hr-templates/"+kind+"/"+id+"/source.pdf";
 const session=await activeSession();
 let response:Response;
 try{
  response=await fetch(storageUrl(config.storageBucket,storagePath,
   "?uploadType=media&name="+encodeURIComponent(storagePath)),{
    method:"POST",headers:{authorization:"Firebase "+session.idToken,
     "content-type":"application/pdf"},
    body:file,
  });
 }catch{
  throw new Error("Template upload connection failed. Check the private archive before retrying.");
 }
 if(!response.ok)
  throw new Error(response.status===401||response.status===403?
   "Storage refused the form. Active Administrator access is required.":
   "Template upload was not confirmed (Storage "+response.status+").");
 const fresh=await activeSession();
 const stored=await fetch(storageUrl(config.storageBucket,storagePath,"?alt=media"),{
  headers:{authorization:"Firebase "+fresh.idToken},
 }).catch(()=>null);
 if(!stored?.ok)throw new Error(
  "File upload returned success, but authenticated byte readback failed. Check Storage before re-upload.");
 const storedBytes=await stored.arrayBuffer();
 if(storedBytes.byteLength!==buffer.byteLength||
  await digestHex(storedBytes)!==sha256)
  throw new Error("Uploaded PDF readback does not match the selected original.");
 return{storagePath,sha256,size:buffer.byteLength,kind};
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
