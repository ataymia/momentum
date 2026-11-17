/* eslint-disable max-len, comma-spacing, indent, key-spacing, space-before-blocks, space-before-function-paren, keyword-spacing, brace-style, semi-spacing, one-var, arrow-parens, curly, object-curly-spacing */
import {createHash,randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {onRequest} from "firebase-functions/v2/https";
import {customerAccountIds,rows,txt,type Row} from "./customer-commerce-projection";

const validId=(v:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(v);
const categories=["Resale certificate","Business registration","Agreement","Other business document"];
const hash=(v:Buffer|string)=>createHash("sha256").update(v).digest("hex");
class DocumentError extends Error{
 constructor(readonly status:number,message:string){super(message);}
}
function refuse(status:number,message:string):never{throw new DocumentError(status,message);}
async function scope(uid:string){
 const db=getFirestore();
 const [access,directory,accounts]=await db.getAll(db.doc("userAccess/"+uid),db.doc("employeeDirectory/"+uid),db.doc("domains/workspace/fields/accounts"));
 const a=access.data(),d=directory.data();
 if(!a||a.accountState!=="Active")refuse(403,"Document access is unavailable.");
 const admin=a.role==="Administrator";
 const ids=admin?null:new Set(customerAccountIds(a,d));
 if(!admin&&!ids?.size)refuse(403,"Document access is unavailable.");
 const source=rows(accounts.data());
 const counts=new Map<string,number>();
 for(const r of source){const id=txt(r.id);counts.set(id,(counts.get(id)??0)+1);}
 const allowed=source.filter(r=>validId(txt(r.id))&&validId(txt(r.customerId))&&counts.get(txt(r.id))===1&&(admin||ids?.has(txt(r.id))));
 return {admin,allowed};
}
const publicRecord=(r:Row)=>({id:txt(r.id),title:txt(r.title),category:txt(r.category),status:txt(r.status),createdAt:txt(r.createdAt),reviewNote:txt(r.reviewNote),canReview:false});
/** Authenticated account document intake, independent review and private download. */
export async function customerDocumentAction(uid:string,raw:unknown){
 if(!validId(uid)||!raw||typeof raw!=="object"||Array.isArray(raw))refuse(400,"Invalid document request.");
 const body=raw as Row;
 const db=getFirestore(),access=await scope(uid);
 if(body.action==="locations")return {locations:access.allowed.map(r=>({id:txt(r.id),name:txt(r.name),location:txt(r.location)}))};
 const accountId=txt(body.accountId),account=access.allowed.find(r=>r.id===accountId);
 if(!account)refuse(403,"Document access is unavailable.");
 const customerId=txt(account.customerId);
 const collection=db.collection("customerDocuments");
 if(body.action==="list"){
  const result=await collection.where("accountId","==",accountId).limit(501).get();
  const records=result.docs.map(d=>d.data()).filter(r=>r.customerId===customerId&&r.state==="Archived");
  return {records:records.slice(0,500).sort((a,b)=>txt(b.createdAt).localeCompare(txt(a.createdAt))).map(r=>({...publicRecord(r),canReview:access.admin&&r.actorUid!==uid&&r.status==="Submitted for review"})),partial:result.size>500};
 }
 if(body.action==="upload"){
  const title=txt(body.title),category=txt(body.category),encoded=txt(body.pdfBase64);
  if(!title||title.length>120||!categories.includes(category)||body.attested!==true||encoded.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))refuse(400,"Choose a PDF, category, title and sharing confirmation.");
  const bytes=Buffer.from(encoded,"base64");
  if(bytes.length<16||bytes.length>5*1024*1024||bytes.toString("base64")!==encoded||bytes.subarray(0,5).toString()!=="%PDF-"||!bytes.subarray(-2048).toString().includes("%%EOF"))refuse(400,"A well-framed PDF up to 5 MB is required.");
  const sha256=hash(bytes),id=hash(JSON.stringify([accountId,customerId,category,sha256])),ref=collection.doc(id);
  const storagePath="customer-private/"+accountId+"/"+id+".pdf";
  const prior=await db.runTransaction(async tx=>{
   const [current,actor,dir,source]=await Promise.all([tx.get(ref),tx.get(db.doc("userAccess/"+uid)),tx.get(db.doc("employeeDirectory/"+uid)),tx.get(db.doc("domains/workspace/fields/accounts"))]);
   const a=actor.data(),locations=rows(source.data()).filter(r=>r.id===accountId);
   if(a?.accountState!=="Active"||locations.length!==1||locations[0].customerId!==customerId||(a.role!=="Administrator"&&!customerAccountIds(a,dir.data()).includes(accountId)))refuse(403,"Document access is unavailable.");
   if(current.exists)return current.data()!;
   const r={id,accountId,customerId,title,category,sha256,storagePath,actorUid:uid,state:"Reserved",status:"Submitted for review",createdAt:new Date().toISOString()};
   tx.create(ref,r);return r;
  });
  if(prior.sha256!==sha256||prior.accountId!==accountId||prior.customerId!==customerId||prior.storagePath!==storagePath)refuse(409,"Document reference conflict.");
  const file=getStorage().bucket().file(storagePath);
  try{await file.save(bytes,{resumable:false,contentType:"application/pdf",preconditionOpts:{ifGenerationMatch:0}});}
  catch(e){if(Number((e as {code?:unknown}).code)!==412)throw e;}
  const [stored]=await file.download();
  if(hash(stored)!==sha256)refuse(409,"Archived document checksum mismatch.");
  await db.runTransaction(async tx=>{
   const [current,actor,dir,source]=await Promise.all([tx.get(ref),tx.get(db.doc("userAccess/"+uid)),tx.get(db.doc("employeeDirectory/"+uid)),tx.get(db.doc("domains/workspace/fields/accounts"))]);
   const a=actor.data(),locations=rows(source.data()).filter(r=>r.id===accountId);
   if(a?.accountState!=="Active"||locations.length!==1||locations[0].customerId!==customerId||(a.role!=="Administrator"&&!customerAccountIds(a,dir.data()).includes(accountId)))refuse(403,"Document access is unavailable.");
   if(current.data()?.state==="Reserved")tx.update(ref,{state:"Archived",archivedAt:new Date().toISOString()});
  });
  const saved=await ref.get();
  return {id,status:txt(saved.data()?.status)};
 }
 const id=txt(body.id);
 if(!/^[a-f0-9]{64}$/.test(id))refuse(400,"Invalid document reference.");
 const ref=collection.doc(id);
 const record=await db.runTransaction(async tx=>{
  const [snap,actor,dir,source]=await Promise.all([tx.get(ref),tx.get(db.doc("userAccess/"+uid)),tx.get(db.doc("employeeDirectory/"+uid)),tx.get(db.doc("domains/workspace/fields/accounts"))]);
  const a=actor.data(),r=snap.data(),locations=rows(source.data()).filter(x=>x.id===accountId);
  if(!r||r.accountId!==accountId||r.customerId!==customerId||r.state!=="Archived"||locations.length!==1||locations[0].customerId!==customerId||a?.accountState!=="Active"||(a.role!=="Administrator"&&!customerAccountIds(a,dir.data()).includes(accountId)))refuse(403,"Document access is unavailable.");
  if(body.action==="review"){
   const note=txt(body.note),status=txt(body.status);
   if(a.role!=="Administrator"||r.actorUid===uid)refuse(403,"Independent administrator review required.");
   if(r.status!=="Submitted for review"||!["Reviewed","Returned"].includes(status)||note.length<3||note.length>500)refuse(409,"Document review requires a pending record, decision and note.");
   tx.update(ref,{status,reviewNote:note,reviewedAt:new Date().toISOString(),reviewedBy:uid});
   return {...r,status};
  }
  if(body.action!=="download")refuse(400,"Unknown document action.");
  return r;
 });
 if(body.action==="review")return {status:record.status};
 const expectedPath="customer-private/"+accountId+"/"+id+".pdf";
 if(record.storagePath!==expectedPath)refuse(409,"Document reference conflict.");
 const [bytes]=await getStorage().bucket().file(expectedPath).download();
 if(hash(bytes)!==record.sha256)refuse(409,"Document integrity check failed.");
 const current=await scope(uid);
 if(!current.allowed.some(r=>r.id===accountId&&r.customerId===customerId))refuse(403,"Document access is unavailable.");
 await db.collection("customerDocumentAccess").doc(randomUUID()).create({documentId:id,accountId,customerId,actorUid:uid,action:"Download",at:new Date().toISOString()});
 return {pdfBase64:bytes.toString("base64"),filename:id+".pdf"};
}

/** Private, revocation-checked customer document API. */
export const customerDocumentsApi=onRequest({cors:true,region:"us-central1",maxInstances:2},async(req,res)=>{
 res.set("Cache-Control","private, no-store").set("X-Content-Type-Options","nosniff");
 if(req.method!=="POST"){res.status(405).json({ok:false,message:"POST required."});return;}
 let uid:string;
 try{uid=(await getAuth().verifyIdToken((req.headers.authorization??"").replace(/^Bearer /,""),true)).uid;}
 catch{res.status(401).json({ok:false,message:"Sign in again."});return;}
 try{res.json({ok:true,...await customerDocumentAction(uid,req.body)});}
 catch(e){if(e instanceof DocumentError){res.status(e.status).json({ok:false,message:e.message});return;}
 console.error("Customer document action failed",e);res.status(503).json({ok:false,message:"Document action unconfirmed. Refresh or retry the same PDF."});}
});
