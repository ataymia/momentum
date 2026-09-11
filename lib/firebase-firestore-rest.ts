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
