import type {FirebaseAuthSession} from "./firebase-auth-rest";
import {firebaseFunctionUrl} from "./firebase-functions";
import type {CaseDraft,SupportCase} from "./support-cases-engine";
export type ServerCaseCommand={kind:"create";draft:CaseDraft}|
 {kind:"note"|"status"|"assign";caseId:string;value:string;reason?:string;revision:number};
export type CaseWriteReceipt={caseId:string;revision:number;recordedAt:string;replayed:boolean};
export type ConnectedCasesResponse={cases:SupportCase[];truncated:boolean;asOf:string};
const endpoint=()=>firebaseFunctionUrl("supportCasesApi");
async function parse(response:Response):Promise<Record<string,unknown>>{
 const payload=await response.json().catch(()=>null) as Record<string,unknown>|null;
 if(!payload||typeof payload!=="object"||payload.ok!==true){
  throw new Error(typeof payload?.message==="string"?payload.message:
    "Support records could not be verified. Retry after checking your connection.");
 }
 return payload;
}
/** Scoped server read, never accepts or infers client-supplied account IDs. */
export async function readConnectedSupportCases(session:FirebaseAuthSession,caseId?:string):
 Promise<ConnectedCasesResponse>{
 const url=endpoint()+(caseId?"?id="+encodeURIComponent(caseId):"");
 let response:Response;
 try{response=await fetch(url,{headers:{authorization:"Bearer "+session.idToken},cache:"no-store"});}
 catch{throw new Error("Support service is unreachable. Case records were not loaded.");}
 const data=await parse(response);
 if(!Array.isArray(data.cases)||typeof data.truncated!=="boolean"||typeof data.asOf!=="string")
  throw new Error("Support returned an incomplete or invalid case snapshot.");
 return{cases:data.cases as SupportCase[],truncated:data.truncated,asOf:data.asOf};
}
/** Idempotent server mutation; no locally fabricated case, actor, status or history. */
export async function writeConnectedSupportCase(session:FirebaseAuthSession,
 requestId:string,command:ServerCaseCommand):Promise<CaseWriteReceipt>{
 let response:Response;
 try{response=await fetch(endpoint(),{
  method:"POST",headers:{authorization:"Bearer "+session.idToken,
   "content-type":"application/json"},body:JSON.stringify({requestId,command}),
 });}
 catch{throw new Error("Support service is unreachable. Retry with the unchanged case details.");}
 const data=await parse(response);
 if(typeof data.caseId!=="string"||typeof data.revision!=="number"||
   typeof data.recordedAt!=="string"||typeof data.replayed!=="boolean")
  throw new Error("Support returned no verifiable action receipt. Refresh before retrying.");
 return{caseId:data.caseId,revision:data.revision,recordedAt:data.recordedAt,replayed:data.replayed};
}
