import type { FirebaseAuthSession } from "./firebase-auth-rest";
import { currentFirebaseSession } from "./firebase-auth-rest";
import { firebaseWebConfig } from "./firebase-config";

type FirestoreValue={
  nullValue?:null;
  booleanValue?:boolean;
  integerValue?:string;
  doubleValue?:number;
  timestampValue?:string;
  stringValue?:string;
  mapValue?:{fields?:Record<string,FirestoreValue>};
  arrayValue?:{values?:FirestoreValue[]};
};
type FirestoreDocument={name?:string;fields?:Record<string,FirestoreValue>;createTime?:string;updateTime?:string};

const path=(value:string)=>value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
const configOrThrow=()=>{const config=firebaseWebConfig();if(!config)throw new Error("Firebase web app configuration is missing.");return config;};
const authHeaders=(session:FirebaseAuthSession)=>({authorization:`Bearer ${session.idToken}`,"content-type":"application/json"});

function encode(value:unknown):FirestoreValue{
  if(value===null||value===undefined)return{nullValue:null};
  if(typeof value==="string")return{stringValue:value};
  if(typeof value==="boolean")return{booleanValue:value};
  if(typeof value==="number")return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return{arrayValue:{values:value.map(encode)}};
  if(typeof value==="object"){
    const fields:Record<string,FirestoreValue>={};
    for(const [key,item] of Object.entries(value as Record<string,unknown>))if(item!==undefined)fields[key]=encode(item);
    return{mapValue:{fields}};
  }
  return{stringValue:String(value)};
}

function decode(value:FirestoreValue):unknown{
  if("nullValue" in value)return null;
  if("booleanValue" in value)return value.booleanValue;
  if("integerValue" in value)return Number(value.integerValue);
  if("doubleValue" in value)return value.doubleValue;
  if("timestampValue" in value)return value.timestampValue;
  if("stringValue" in value)return value.stringValue;
  if("arrayValue" in value)return(value.arrayValue?.values??[]).map(decode);
  if("mapValue" in value){const output:Record<string,unknown>={};for(const [key,item] of Object.entries(value.mapValue?.fields??{}))output[key]=decode(item);return output;}
  return null;
}

const documentFields=(value:Record<string,unknown>)=>{const fields:Record<string,FirestoreValue>={};for(const [key,item] of Object.entries(value))if(item!==undefined)fields[key]=encode(item);return fields;};
const decodedDocument=<T>(document:FirestoreDocument)=>{const output:Record<string,unknown>={};for(const [key,value] of Object.entries(document.fields??{}))output[key]=decode(value);return output as T;};

async function sessionOrThrow(){const session=await currentFirebaseSession();if(!session)throw new Error("Firebase session expired. Sign in again.");return session;}

export async function getFirestoreDocument<T>(documentPath:string):Promise<T|null>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${path(documentPath)}`,{headers:authHeaders(session)});
  if(response.status===404)return null;
  const payload=await response.json().catch(()=>null) as FirestoreDocument|null;
  if(!response.ok||!payload)throw new Error(`Firestore read failed (${response.status}).`);
  return decodedDocument<T>(payload);
}

export async function setFirestoreDocument<T extends Record<string,unknown>>(documentPath:string,value:T):Promise<void>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${path(documentPath)}`,{
    method:"PATCH",
    headers:authHeaders(session),
    body:JSON.stringify({fields:documentFields(value)}),
  });
  if(!response.ok)throw new Error(`Firestore write failed (${response.status}).`);
}

export async function deleteFirestoreDocument(documentPath:string):Promise<void>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${path(documentPath)}`,{method:"DELETE",headers:authHeaders(session)});
  if(!response.ok&&response.status!==404)throw new Error(`Firestore delete failed (${response.status}).`);
}

export async function listFirestoreCollection<T>(collectionPath:string,pageSize=200):Promise<T[]>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const results:T[]=[];let pageToken="";
  do{
    const query=new URLSearchParams({pageSize:String(Math.min(Math.max(pageSize,1),1000))});if(pageToken)query.set("pageToken",pageToken);
    const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${path(collectionPath)}?${query}`,{headers:authHeaders(session)});
    const payload=await response.json().catch(()=>null) as {documents?:FirestoreDocument[];nextPageToken?:string}|null;
    if(!response.ok||!payload)throw new Error(`Firestore list failed (${response.status}).`);
    results.push(...(payload.documents??[]).map((document)=>decodedDocument<T>(document)));
    pageToken=payload.nextPageToken??"";
  }while(pageToken);
  return results;
}

// ---------------------------------------------------------------------------
// Snapshot-aware helpers used by the Firestore persistence backend.
// ---------------------------------------------------------------------------

export type FirestoreSnapshot<T=Record<string,unknown>>={path:string;exists:boolean;updateTime?:string;data:T|null};
export type FirestoreWrite=
  |{kind:"set";path:string;data:Record<string,unknown>;updateTime?:string;create?:boolean}
  |{kind:"merge";path:string;data:Record<string,unknown>;fieldPaths:string[]}
  |{kind:"delete";path:string;updateTime?:string};
export type FirestoreCommitResult={ok:true;updateTimes:Record<string,string|undefined>;commitTime?:string}|{ok:false;status:number;code:string;message:string};

export class FirestoreRequestError extends Error{
  status:number;code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}

const documentRoot=(projectId:string)=>`projects/${projectId}/databases/(default)/documents`;
const documentName=(projectId:string,documentPath:string)=>`${documentRoot(projectId)}/${documentPath.split("/").filter(Boolean).join("/")}`;
const pathFromName=(projectId:string,name:string)=>name.startsWith(`${documentRoot(projectId)}/`)?name.slice(documentRoot(projectId).length+1):name;
const errorCode=(payload:unknown,fallback:string)=>{const error=(payload as {error?:{status?:string;message?:string}}|null)?.error;return{code:error?.status??fallback,message:error?.message??fallback};};

function snapshot<T>(config:{projectId:string},document:FirestoreDocument):FirestoreSnapshot<T>{
  return{path:pathFromName(config.projectId,document.name??""),exists:true,updateTime:document.updateTime,data:decodedDocument<T>(document)};
}

/** Read one document and return its update time so callers can write with a precondition. */
export async function getFirestoreSnapshot<T=Record<string,unknown>>(documentPath:string):Promise<FirestoreSnapshot<T>>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const response=await fetch(`https://firestore.googleapis.com/v1/${documentName(config.projectId,documentPath)}`,{headers:authHeaders(session)});
  if(response.status===404)return{path:documentPath,exists:false,data:null};
  const payload=await response.json().catch(()=>null) as FirestoreDocument|null;
  if(!response.ok||!payload){const {code,message}=errorCode(payload,`HTTP_${response.status}`);throw new FirestoreRequestError(response.status,code,`Firestore read failed for ${documentPath}: ${message}`);}
  return snapshot<T>(config,payload);
}

/**
 * Read many documents. Uses batchGet when every requested document is readable; if Security Rules deny any
 * document in the batch, falls back to individual reads and reports denied documents as `exists:false`.
 */
export async function getFirestoreSnapshots<T=Record<string,unknown>>(documentPaths:string[]):Promise<FirestoreSnapshot<T>[]>{
  const unique=[...new Set(documentPaths)];
  if(unique.length===0)return[];
  const config=configOrThrow();const session=await sessionOrThrow();
  const results:FirestoreSnapshot<T>[]=[];
  for(let index=0;index<unique.length;index+=100){
    const chunk=unique.slice(index,index+100);
    const response=await fetch(`https://firestore.googleapis.com/v1/${documentRoot(config.projectId)}:batchGet`,{
      method:"POST",headers:authHeaders(session),
      body:JSON.stringify({documents:chunk.map((item)=>documentName(config.projectId,item))}),
    });
    if(response.status===403||response.status===401){
      const individual=await Promise.all(chunk.map(async(item)=>{
        try{return await getFirestoreSnapshot<T>(item);}
        catch(error){if(error instanceof FirestoreRequestError&&(error.status===403||error.status===401))return{path:item,exists:false,data:null,denied:true} as FirestoreSnapshot<T>;throw error;}
      }));
      results.push(...individual);
      continue;
    }
    const payload=await response.json().catch(()=>null) as Array<{found?:FirestoreDocument;missing?:string}>|null;
    if(!response.ok||!Array.isArray(payload)){const {code,message}=errorCode(payload,`HTTP_${response.status}`);throw new FirestoreRequestError(response.status,code,`Firestore batch read failed: ${message}`);}
    for(const entry of payload){
      if(entry.found)results.push(snapshot<T>(config,entry.found));
      else if(entry.missing)results.push({path:pathFromName(config.projectId,entry.missing),exists:false,data:null});
    }
  }
  return results;
}

/** List a collection and keep document ids/update times. Throws FirestoreRequestError (status 403) when rules deny the query. */
export async function listFirestoreSnapshots<T=Record<string,unknown>>(collectionPath:string,pageSize=300):Promise<FirestoreSnapshot<T>[]>{
  const config=configOrThrow();const session=await sessionOrThrow();
  const results:FirestoreSnapshot<T>[]=[];let pageToken="";
  do{
    const query=new URLSearchParams({pageSize:String(Math.min(Math.max(pageSize,1),1000))});if(pageToken)query.set("pageToken",pageToken);
    const response=await fetch(`https://firestore.googleapis.com/v1/${documentName(config.projectId,collectionPath)}?${query}`,{headers:authHeaders(session)});
    const payload=await response.json().catch(()=>null) as {documents?:FirestoreDocument[];nextPageToken?:string}|null;
    if(!response.ok||!payload){const {code,message}=errorCode(payload,`HTTP_${response.status}`);throw new FirestoreRequestError(response.status,code,`Firestore list failed for ${collectionPath}: ${message}`);}
    results.push(...(payload.documents??[]).map((document)=>snapshot<T>(config,document)));
    pageToken=payload.nextPageToken??"";
  }while(pageToken);
  return results;
}

/** Atomically apply a set of writes. Preconditions (updateTime / create) make concurrent edits fail closed instead of overwriting. */
export async function commitFirestoreWrites(writes:FirestoreWrite[]):Promise<FirestoreCommitResult>{
  if(writes.length===0)return{ok:true,updateTimes:{}};
  const config=configOrThrow();const session=await sessionOrThrow();
  const body={writes:writes.map((write)=>{
    if(write.kind==="delete")return{delete:documentName(config.projectId,write.path),...(write.updateTime?{currentDocument:{updateTime:write.updateTime}}:{})};
    if(write.kind==="merge")return{update:{name:documentName(config.projectId,write.path),fields:documentFields(write.data)},updateMask:{fieldPaths:write.fieldPaths}};
    const precondition=write.create?{currentDocument:{exists:false}}:write.updateTime?{currentDocument:{updateTime:write.updateTime}}:{};
    return{update:{name:documentName(config.projectId,write.path),fields:documentFields(write.data)},...precondition};
  })};
  const response=await fetch(`https://firestore.googleapis.com/v1/${documentRoot(config.projectId)}:commit`,{method:"POST",headers:authHeaders(session),body:JSON.stringify(body),keepalive:JSON.stringify(body).length<60_000});
  const payload=await response.json().catch(()=>null) as {writeResults?:Array<{updateTime?:string}>;commitTime?:string}|null;
  if(!response.ok||!payload){const {code,message}=errorCode(payload,`HTTP_${response.status}`);return{ok:false,status:response.status,code,message};}
  const updateTimes:Record<string,string|undefined>={};
  writes.forEach((write,index)=>{updateTimes[write.path]=payload.writeResults?.[index]?.updateTime??payload.commitTime;});
  return{ok:true,updateTimes,commitTime:payload.commitTime};
}

export const isFirestoreConflict=(result:FirestoreCommitResult)=>!result.ok&&(result.code==="FAILED_PRECONDITION"||result.code==="ABORTED"||result.status===409||result.code==="ALREADY_EXISTS");
export const isFirestorePermissionDenied=(result:FirestoreCommitResult)=>!result.ok&&(result.code==="PERMISSION_DENIED"||result.status===403);
