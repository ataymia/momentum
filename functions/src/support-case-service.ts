/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,indent,space-before-function-paren,one-var */
import {createHash,randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {
 applyCaseCommand,canSeeAccount,canSeeSupportCase,validSupportRequestId,
 validateCaseCommand,type CaseAccess,type CaseAccount,type CaseCommand,
 type CaseOwnerAccess,type CaseRecord,type CaseRole,
} from "./support-case-policy";
type Row=Record<string,unknown>;
const row=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const items=(v:Row|undefined):Row[]=>
 Array.isArray(v?.items)?v.items.filter(row):[];
const roles:CaseRole[]=["Administrator","Operations","Sales Manager","Sales Representative"];
const validId=(v:unknown)=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,130}$/.test(v);
const accountCollectionPath="domains/workspace/fields/accounts";
const orderPaths=["domains/commercial/fields/orders","domains/workspace/fields/orders"];
/** Safe client-facing refusal (no sensitive internal record data). */
export class SupportCasesError extends Error{
 /**
  * @param {number} status HTTP status.
  * @param {string} message Safe explanation.
  */
 constructor(public readonly status:number,message:string){super(message);}
}
/**
 * @param {Row|undefined} value The authenticated user's access record.
 * @param {string} uid Verified Firebase UID.
 * @return {CaseAccess} Current active staff identity.
 */
function actorAccess(value:Row|undefined,uid:string):CaseAccess{
 const role=str(value?.role) as CaseRole;
 if(value?.accountState!=="Active"||!roles.includes(role))
   throw new SupportCasesError(403,"Authorized active Sales or Operations access required.");
 return{uid,role,accountState:"Active",
   managedTeams:Array.isArray(value?.managedTeams)?
     value.managedTeams.filter((x):x is string=>typeof x==="string"):[]};
}
/**
 * @param {CaseRecord} item Firestore support document.
 * @param {CaseAccess} actor Verified staff.
 * @param {Map<string,CaseAccount>} accounts Canonical linked accounts.
 * @param {Map<string,CaseOwnerAccess>} owners Verified owner access.
 * @return {boolean} Whether the case may be read.
 */
function visible(item:CaseRecord,actor:CaseAccess,
 accounts:Map<string,CaseAccount>,owners:Map<string,CaseOwnerAccess>):boolean{
 if(!item||!validId(item.id)||!Array.isArray(item.history))return false;
 const account=item.accountId?accounts.get(item.accountId):undefined;
 if(item.accountId&&!account)return false;
 const owner=account?.ownerId?owners.get(account.ownerId):undefined;
 return canSeeSupportCase(actor,item,
   Boolean(account&&canSeeAccount(actor,account,owner)));
}
/**
 * @param {string} uid Verified Firebase identity.
 * @return {Promise<CaseAccess>} Active staff access or denial.
 */
async function verifiedActor(uid:string):Promise<CaseAccess>{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
   throw new SupportCasesError(401,"Session identity is invalid.");
 const snap=await getFirestore().doc("userAccess/"+uid).get();
 return actorAccess(snap.data(),uid);
}
/**
 * @param {CaseAccount[]} accounts Canonical scoped source.
 * @return {Promise<Map<string,CaseOwnerAccess>>} Access records for account owners.
 */
async function fetchOwners(accounts:CaseAccount[]):Promise<Map<string,CaseOwnerAccess>>{
 const ids=[...new Set(accounts.map(a=>a.ownerId).filter((uid):uid is string=>
   Boolean(uid&&/^[A-Za-z0-9_-]{1,128}$/.test(uid))))];
 const result=new Map<string,CaseOwnerAccess>();
 if(!ids.length)return result;
 const db=getFirestore();
 const snapshots=await db.getAll(...ids.map(uid=>db.doc("userAccess/"+uid)));
 for(let i=0;i<snapshots.length;i++){
  const raw=snapshots[i].data();if(!raw)continue;
  result.set(ids[i],{uid:ids[i],role:str(raw.role),
   accountState:str(raw.accountState),team:str(raw.team),managerId:str(raw.managerId)});
 }
 return result;
}
/**
 * @param {CaseAccess} actor Verified authenticated staff.
 * @param {string|undefined} caseId Optional exact case reference.
 * @return {Promise<object>} Bounded, server-filtered case results.
 */
export async function readCases(actor:CaseAccess,caseId?:string){
 const db=getFirestore();
 const [accountsDoc,result]=await Promise.all([
  db.doc(accountCollectionPath).get(),
  caseId?db.doc("supportCases/"+caseId).get():
    db.collection("supportCases").orderBy("updatedAt","desc").limit(201).get(),
 ]);
 const accountsList=items(accountsDoc.data()).map(a=>({
  id:str(a.id),ownerId:str(a.ownerId)||undefined,stage:str(a.stage)||undefined,
 })).filter(a=>a.id);
 const accounts=new Map(accountsList.map(a=>[a.id,a]));
 const documents=caseId?[result as FirebaseFirestore.DocumentSnapshot]:
   (result as FirebaseFirestore.QuerySnapshot).docs;
 const relevant=new Set(documents.flatMap(doc=>{
   const raw=doc.data();return typeof raw?.accountId==="string"?[raw.accountId]:[];
 }));
 const owners=await fetchOwners(accountsList.filter(a=>relevant.has(a.id)));
 const bounded=documents.slice(0,200);
 const cases=bounded.map(doc=>doc.data() as CaseRecord|undefined)
   .filter((item):item is CaseRecord=>Boolean(item))
   .filter(item=>visible(item,actor,accounts,owners));
 // Listing is intentionally bounded. Truncation is never presented as a
 // complete company case history or "all clear" support workload.
 return{cases,truncated:!caseId&&documents.length>200,asOf:new Date().toISOString()};
}
/**
 * @param {CaseAccess} actor Live staff identity.
 * @param {CaseCommand} command Bounded authenticated mutation.
 * @param {string} requestId Idempotent client key.
 * @return {Promise<object>} Canonical server receipt.
 */
export async function writeCase(actor:CaseAccess,command:CaseCommand,requestId:string){
 const db=getFirestore();
 const fingerprint=createHash("sha256").update(JSON.stringify(command)).digest("hex");
 const accessRef=db.doc("userAccess/"+actor.uid);
 const requestRef=db.doc("supportCaseRequests/"+actor.uid+"_"+requestId);
 const accountsRef=db.doc(accountCollectionPath);
 const caseId=command.kind==="create"?"case-"+randomUUID():command.caseId;
 const caseRef=db.doc("supportCases/"+caseId);
 const ordersRef=command.kind==="create"&&command.draft.orderId?
   orderPaths.map(path=>db.doc(path)):[];
 return db.runTransaction(async tx=>{
  const [accessSnap,prior,accountSnap,caseSnap,...orderSnaps]=await Promise.all([
   tx.get(accessRef),tx.get(requestRef),tx.get(accountsRef),tx.get(caseRef),
   ...ordersRef.map(ref=>tx.get(ref)),
  ]);
  const live=actorAccess(accessSnap.data(),actor.uid);
  if(live.role!==actor.role)
   throw new SupportCasesError(409,"Your role changed. Sign in again.");
  if(prior.exists){
   const p=prior.data();
   if(str(p?.fingerprint)!==fingerprint||str(p?.actorUid)!==actor.uid)
    throw new SupportCasesError(409,"This request ID belongs to different case details.");
   const priorId=str(p?.caseId);
   // Idempotency must always verify its referenced event still exists.
   const original=priorId===caseId?caseSnap:await tx.get(db.doc("supportCases/"+priorId));
   if(!original.exists||!Array.isArray(original.data()?.history)||
      !original.data()?.history.some((e:Row)=>e.id===p?.eventId))
    throw new SupportCasesError(409,"Previous case action needs reconciliation.");
   return{caseId:priorId,revision:original.data()?.revision,
    recordedAt:str(p?.recordedAt),replayed:true};
  }
  const accountRows=items(accountSnap.data());
  const accountId=command.kind==="create"?command.draft.accountId:
    str(caseSnap.data()?.accountId)||undefined;
  const canonical=accountId?accountRows.find(a=>str(a.id)===accountId):undefined;
  if(accountId&&!canonical)throw new SupportCasesError(404,"Linked customer location is unavailable.");
  const account=canonical?{id:str(canonical.id),ownerId:str(canonical.ownerId)||undefined,
    stage:str(canonical.stage)||undefined}:undefined;
  const ownerSnap=account?.ownerId?await tx.get(db.doc("userAccess/"+account.ownerId)):null;
  const rawOwner=ownerSnap?.data();
  const owner=account?.ownerId&&rawOwner?{
   uid:account.ownerId,role:str(rawOwner.role),accountState:str(rawOwner.accountState),
   team:str(rawOwner.team),managerId:str(rawOwner.managerId),
  }:undefined;
  const scoped=Boolean(account&&canSeeAccount(live,account,owner));
  if(command.kind==="create"){
   if(!scoped&&(account||!["Administrator","Operations"].includes(live.role)))
    throw new SupportCasesError(403,"That business is outside your support case scope.");
   if(command.draft.orderId){
    const linked=orderSnaps.flatMap(doc=>items(doc.data())).find(o=>str(o.id)===command.draft.orderId);
    if(!linked||str(linked.accountId)!==accountId||linked.testOnly===true)
     throw new SupportCasesError(400,"The order is not linked to this authorized customer.");
   }
  }else{
   if(!caseSnap.exists)
    throw new SupportCasesError(404,"Case not found or access denied.");
   const before=caseSnap.data() as CaseRecord;
   if(!visible(before,live,new Map(account?[[account.id,account]]:[]),
      new Map(owner?[[owner.uid,owner]]:[])))
    throw new SupportCasesError(404,"Case not found or access denied.");
  }
  const at=new Date().toISOString(),eventId="case-event-"+randomUUID();
  let next:CaseRecord;
  if(command.kind==="create"){
   next={...command.draft,id:caseId,createdBy:actor.uid,ownerId:actor.uid,
    status:"Open",createdAt:at,updatedAt:at,revision:1,
    history:[{id:eventId,at,actorId:actor.uid,action:"Created",
     detail:"Case submitted and initially assigned to the creating employee."}]};
  }else{
   let recipientLabel:string|undefined;
   if(command.kind==="assign"){
    const targetSnap=await tx.get(db.doc("userAccess/"+command.value));
    const target=targetSnap.data();
    const targetRole=str(target?.role);
    if(target?.accountState!=="Active"||
      !["Administrator","Operations","Sales Manager","Sales Representative"].includes(targetRole)||
      (live.role==="Operations"&&targetRole!=="Operations")||
      (targetRole==="Sales Representative"&&account?.ownerId!==command.value))
      throw new SupportCasesError(403,"Selected assignee is not eligible for this account.");
    const directory=await tx.get(db.doc("employeeDirectory/"+command.value));
    recipientLabel=str(directory.data()?.name)||"authorized employee";
   }
   const changed=applyCaseCommand(caseSnap.data() as CaseRecord,
     command,live,eventId,at,recipientLabel);
   if(!changed)throw new SupportCasesError(409,"Case changed or transition not permitted. Refresh before retrying.");
   next=changed;
  }
  if(Buffer.byteLength(JSON.stringify(next),"utf8")>800_000)
   throw new SupportCasesError(409,"Case history requires archive review before new changes.");
  if(command.kind==="create")tx.create(caseRef,next);
  else tx.update(caseRef,next as unknown as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
  tx.create(requestRef,{actorUid:actor.uid,fingerprint,caseId,eventId,recordedAt:at});
  return{caseId,revision:next.revision,recordedAt:at,replayed:false};
 });
}
/** Protected read/write endpoint. No client-provided staff identity or account scope. */
export const supportCasesApi=onRequest({cors:true,region:"us-central1",maxInstances:2},
 async(request,response)=>{
  const send=(status:number,payload:unknown)=>response.status(status).set({
   "Cache-Control":"private, no-store, max-age=0",
   "Content-Type":"application/json; charset=utf-8",
   "X-Content-Type-Options":"nosniff",
  }).json(payload);
  if(!["GET","POST"].includes(request.method)){
   send(405,{ok:false,message:"GET or POST required."});return;
  }
  const auth=request.headers.authorization??"";
  const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
  if(!token){send(401,{ok:false,message:"Sign in required."});return;}
  let uid:string;
  try{uid=(await getAuth().verifyIdToken(token,true)).uid;}
  catch{send(401,{ok:false,message:"Session expired."});return;}
  try{
   const actor=await verifiedActor(uid);
   if(request.method==="GET"){
    const rawId=request.query.id;
    if(rawId!==undefined&&!validId(rawId)){
     send(400,{ok:false,message:"Invalid case reference."});return;
    }
    send(200,{ok:true,...await readCases(actor,rawId as string|undefined)});return;
   }
   if(!row(request.body)||Object.keys(request.body).some(key=>!["requestId","command"].includes(key))||
     !validSupportRequestId(request.body.requestId)){
    send(400,{ok:false,message:"Invalid case request envelope."});return;
   }
   const validation=validateCaseCommand(request.body.command);
   if(!validation.ok){send(400,{ok:false,message:validation.message});return;}
   send(200,{ok:true,...await writeCase(actor,validation.command,request.body.requestId)});
  }catch(error){
   if(error instanceof SupportCasesError){
    send(error.status,{ok:false,message:error.message});return;
   }
   console.error("supportCasesApi failed",error);
   send(503,{ok:false,message:"Support records could not be confirmed. Refresh before retrying."});
  }
 });
