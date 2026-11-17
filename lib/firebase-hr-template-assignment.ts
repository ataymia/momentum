import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {HrTemplateKind} from "./firebase-hr-template-library";
export type AssignedHrDocument={
 id:string;employeeUid:string;templateId:string;kind:HrTemplateKind;
 title:string;edition:string;status:string;createdAt:string;submittedAt?:string;
};
async function call(session:FirebaseAuthSession,body:unknown){
 const response=await fetch(firebaseFunctionUrl("hrTemplateAssignmentApi"),{
  method:"POST",cache:"no-store",
  headers:{authorization:"Bearer "+session.idToken,"content-type":"application/json"},
  body:JSON.stringify(body),
 }).catch(()=>null);
 if(!response)throw new Error("HR assignment service is unreachable.");
 const data=await response.json().catch(()=>null) as Record<string,unknown>|null;
 if(!response.ok||data?.ok!==true)
  throw new Error(typeof data?.message==="string"?data.message:"HR assignment not confirmed.");
 return data;
}
export async function assignHrDocument(
 session:FirebaseAuthSession,employeeUid:string,templateId:string,requestId:string,
){
 const result=await call(session,{action:"Assign",requestId,assignment:{
  employeeUid,templateId,reviewedForWorkerPreparation:true,
 }});
 if(typeof result.assignmentId!=="string"||result.employeeUid!==employeeUid||
  result.templateId!==templateId)
  throw new Error("HR assignment receipt did not match requested worker and template.");
 return result.assignmentId;
}
export async function listHrDocumentAssignments(
 session:FirebaseAuthSession,employeeUid?:string,
):Promise<AssignedHrDocument[]>{
 const result=await call(session,{action:"List",...(employeeUid?{employeeUid}:{})});
 if(!Array.isArray(result.records))throw new Error("HR assignment list was incomplete.");
 return result.records as AssignedHrDocument[];
}
export async function downloadAssignedHrDocument(
 session:FirebaseAuthSession,assignmentId:string,
):Promise<File>{
 const result=await call(session,{action:"Download",assignmentId});
 if(result.assignmentId!==assignmentId||typeof result.pdfBase64!=="string"||
  typeof result.sha256!=="string"||!/^[a-f0-9]{64}$/.test(result.sha256)||
  typeof result.kind!=="string")
  throw new Error("Assigned PDF proof is incomplete.");
 const encoded=result.pdfBase64;
 if(encoded.length>18*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
  throw new Error("Assigned PDF data is invalid.");
 const binary=atob(encoded),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 if(bytes.length<16||bytes.length>12*1024*1024||
  String.fromCharCode(...bytes.subarray(0,5))!=="%PDF-")
  throw new Error("Assigned source is not a valid PDF.");
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 const sha256=Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,"0")).join("");
 if(sha256!==result.sha256)throw new Error("Assigned PDF source checksum mismatch.");
 const name=String(result.kind).replace(/[^A-Z0-9_]/gi,"-").slice(0,35);
 return new File([bytes.buffer],name+"-"+assignmentId+".pdf",{type:"application/pdf"});
}
