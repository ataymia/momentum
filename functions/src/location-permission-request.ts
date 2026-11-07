/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren */
import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const isId=(v:string)=>/^[A-Za-z0-9_-]{5,128}$/.test(v);
const COOLDOWN_MS=5*60_000;
const EXPIRY_MS=7*24*60*60_000;
/** Typed refusal for unauthorized or malformed location-permission requests. */
export class LocationPermissionRequestError extends Error{
 /**
  * Construct a safe HTTP error.
  * @param {number} status HTTP error status.
  * @param {string} message User-safe explanation.
  */
 constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new LocationPermissionRequestError(status,message);};
/**
 * The Admin can request a voluntary on-device permission review, not grant or
 * remotely trigger geolocation. Coordinates are NEVER collected by this API.
 * The employee alone can try the browser prompt on their own device.
 * @param {string} actorUid Authenticated employee Firebase UID.
 * @param {unknown} payload Request action and target identity from the caller.
 * @return {Promise<object>} Verified request or response receipt.
 */
export async function operateLocationPermissionRequest(actorUid:string,payload:unknown){
 if(!payload||typeof payload!=="object"||Array.isArray(payload))
  fail(400,"Valid location access request required.");
 const input=payload as Row,action=text(input.action),targetUid=text(input.targetUid);
 if(!isId(targetUid)||!["send","respond"].includes(action))
  fail(400,"Invalid location permission action or employee.");
 const db=getFirestore(),ref=db.doc("locationPermissionRequests/"+targetUid);
 const actorRef=db.doc("userAccess/"+actorUid);
 const targetRef=db.doc("userAccess/"+targetUid);
 const requestId=text(input.requestId),outcome=text(input.outcome);
 if(action==="respond"&&(!isId(requestId)||!["Enabled","Blocked","Unavailable"].includes(outcome)))
  fail(400,"Invalid permission request receipt.");
 const at=new Date().toISOString(),time=Date.now();
 return db.runTransaction(async tx=>{
  const [actor,target,prior]=await Promise.all([
   tx.get(actorRef),tx.get(targetRef),tx.get(ref)]);
  const actorAccess=actor.data(),targetAccess=target.data();
  if(!actor.exists||actorAccess?.accountState!=="Active")
   fail(403,"An active Momentum employee account is required.");
  if(!target.exists||targetAccess?.accountState!=="Active"||targetAccess?.role!=="Sales Representative")
   fail(409,"Only an active Sales Representative is eligible for route-location requests.");
  if(action==="send"){
   if(actorAccess?.role!=="Administrator")
    fail(403,"Only an Administrator can send location permission reminders.");
   const old=prior.data();
   const last=Date.parse(text(old?.requestedAt));
   if(Number.isFinite(last)&&time-last<COOLDOWN_MS)
    fail(429,"A request was recently sent. Try again after the five-minute cooldown.");
   const id="location-"+randomUUID();
   tx.set(ref,{
    targetUid,requestId:id,requestedAt:at,requestedBy:actorUid,
    expiresAt:new Date(time+EXPIRY_MS).toISOString(),
    status:"Pending",responseAt:null,outcome:null,
    history:[...(Array.isArray(old?.history)?old.history:[]).slice(-19),
     {requestId:id,requestedAt:at,requestedBy:actorUid}],
   });
   return{action,targetUid,requestId:id,status:"Pending",requestedAt:at};
  }
  if(actorUid!==targetUid||actorAccess?.role!=="Sales Representative")
   fail(403,"Only the employee can respond from their own device.");
  const existing=prior.data();
  if(!prior.exists||text(existing?.requestId)!==requestId)
   fail(409,"This request has expired or was replaced. Refresh before responding.");
  const expiry=Date.parse(text(existing?.expiresAt));
  if(!Number.isFinite(expiry)||expiry<time)
   fail(409,"This request has expired. Ask an Administrator to send a new request.");
  if(existing?.status==="Responded")
   return{action,targetUid,requestId,status:"Responded",outcome:existing.outcome,replayed:true};
  if(existing?.status!=="Pending")fail(409,"The request is no longer active.");
  tx.update(ref,{status:"Responded",responseAt:at,outcome,
   outcomeNote:"Employee-device browser result only; fresh route ping separately verifies tracking."});
  return{action,targetUid,requestId,status:"Responded",outcome,replayed:false};
 });
}
