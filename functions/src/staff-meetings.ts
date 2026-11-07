import {randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";
import {staffMeetingFieldCollision} from "./staff-meeting-policy";

/** Real connected meeting records are server-owned and never exposed as shared Firestore arrays. */
type Row=Record<string,unknown>;
type Actor={uid:string;role:string;accountState:string};
type Input={title:string;agenda:string;location:string;date:string;startTime:string;endTime:string;attendeeIds:string[]};
type Action="list"|"create"|"update"|"cancel"|"rsvp"|"seen";
const meetingCollection="staffMeetings";
const slotCollection="staffMeetingSlots";
const organizingRoles=new Set(["Administrator","Sales Manager","Operations","Marketing"]);
const employeeRoles=new Set(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Marketing","Warehouse","Delivery Driver"]);
const rsvpOptions=new Set(["Accepted","Tentative","Declined"]);
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const day=/^\d{4}-\d{2}-\d{2}$/;
const str=(v:unknown)=>typeof v==="string"?v.trim():"";
const obj=(v:unknown):v is Row=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const phoenixDay=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=(name:string)=>parts.find(p=>p.type===name)?.value??"";return get("year")+"-"+get("month")+"-"+get("day");};
const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
const error=(status:number,message:string)=>new MeetingServerError(status,message);
class MeetingServerError extends Error {
  constructor(readonly status:number,message:string){super(message);}
}
const validDate=(d:string)=>{
  if(!day.test(d))return false;
  const [year,month,dayOfMonth]=d.split("-").map(Number);
  const utc=new Date(Date.UTC(year,month-1,dayOfMonth));
  return utc.getUTCFullYear()===year&&utc.getUTCMonth()===month-1&&utc.getUTCDate()===dayOfMonth;
};
const validEmployee=(r:Row|undefined)=>Boolean(r&&r.accountState==="Active"&&employeeRoles.has(str(r.role)));
const asStringArray=(v:unknown)=>Array.isArray(v)&&v.every(item=>typeof item==="string")?v as string[]:[];
const own=(record:Row,actor:Actor)=>record.organizerId===actor.uid;
const member=(record:Row,actor:Actor)=>own(record,actor)||asStringArray(record.attendeeIds).includes(actor.uid);
const asRecord=(record:Row)=>record;
const orderedSlots=(d:string,start:string,end:string,people:string[])=>{
  const result:string[]=[];
  for(const uid of people){
    for(let minute=Math.floor(minutes(start)/15)*15;minute<minutes(end);minute+=15){
      const slot=String(Math.floor(minute/60)).padStart(2,"0")+String(minute%60).padStart(2,"0");
      result.push(uid+"_"+d+"_"+slot);
    }
  }
  return [...new Set(result)].sort();
};
export const serverMeetingSlots=orderedSlots;
function inputFrom(value:unknown):Input{
  if(!obj(value))throw error(400,"Missing meeting details.");
  const title=str(value.title),agenda=str(value.agenda),location=str(value.location),date=str(value.date),startTime=str(value.startTime),endTime=str(value.endTime);
  const attendeeIds=asStringArray(value.attendeeIds);
  if(!title||title.length>160||agenda.length<5||agenda.length>4000||!location||location.length>240||!validDate(date)||!time.test(startTime)||!time.test(endTime)||minutes(endTime)<=minutes(startTime)||
    minutes(endTime)-minutes(startTime)>180||date<phoenixDay()||
    attendeeIds.length<1||attendeeIds.length>15||new Set(attendeeIds).size!==attendeeIds.length||attendeeIds.some(id=>!id||id.length>128)){
    throw error(400,"Enter a valid title, agenda, location, future Arizona meeting date/time (max 3 hours), and 1–15 unique active employees.");
  }
  if(date===phoenixDay()){
    const current=new Intl.DateTimeFormat("en-US",{timeZone:"America/Phoenix",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    if(endTime<=current)throw error(400,"This meeting has already ended in Arizona.");
  }
  return{title,agenda,location,date,startTime,endTime,attendeeIds};
}
async function userAccess(db:Firestore,uid:string):Promise<Row|undefined>{
  if(!uid||uid.length>128)return undefined;
  const snapshot=await db.collection("userAccess").doc(uid).get();
  return snapshot.data() as Row|undefined;
}
async function authenticate(request:{headers:{authorization?:string|string[]}}):Promise<Actor>{
  const bearer=str(request.headers.authorization);
  if(!bearer.startsWith("Bearer "))throw error(401,"Sign in to continue.");
  let token:{uid:string};
  try{token=await getAuth().verifyIdToken(bearer.slice(7),true);}catch{throw error(401,"Sign-in session expired or revoked.");}
  const access=await userAccess(getFirestore(),token.uid);
  if(!validEmployee(access))throw error(403,"Active employee authorization is required.");
  return{uid:token.uid,role:str(access?.role),accountState:str(access?.accountState)};
}
async function verifyInvitees(db:Firestore,actor:Actor,people:string[]){
  if(people.includes(actor.uid))throw error(400,"Organizer cannot invite themself as an attendee.");
  const refs=people.map(id=>db.collection("userAccess").doc(id));
  const docs=await db.getAll(...refs);
  if(docs.some(d=>!validEmployee(d.data() as Row|undefined)))throw error(400,"Select only active employee identities as attendees.");
}
function history(actor:Actor,action:"Created"|"Updated"|"Cancelled"|"RSVP",at:string,detail:string){
  return{actorId:actor.uid,action,at,detail};
}
/** Atomically reserve 15-minute per-person slots with optimistic expected revision. */
async function saveSchedule(db:Firestore,actor:Actor,body:Row,update:boolean){
  if(!organizingRoles.has(actor.role))throw error(403,"Only authorized meeting organizers can schedule meetings.");
  const input=inputFrom(body.meeting);
  await verifyInvitees(db,actor,input.attendeeIds);
  const id=update?str(body.id):"mtg-"+randomUUID();
  if(!id||id.length>128)throw error(400,"Invalid meeting reference.");
  const ref=db.collection(meetingCollection).doc(id);
  const at=new Date().toISOString();
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    const old=snapshot.data() as Row|undefined;
    if(update){
      if(!old||!own(old,actor)||old.status!=="Scheduled")throw error(403,"Only the organizer may update their scheduled meeting.");
      if(!Number.isInteger(body.expectedRevision)||body.expectedRevision!==old.revision)throw error(409,"Meeting changed. Refresh before saving.");
    }else if(snapshot.exists)throw error(409,"Meeting already exists.");
    // Lock refs are read before any writes, so two organizers cannot book one slot.
    const oldSlots=old?orderedSlots(str(old.date),str(old.startTime),str(old.endTime),[str(old.organizerId),...asStringArray(old.attendeeIds)]):[];
    const freshSlots=orderedSlots(input.date,input.startTime,input.endTime,[actor.uid,...input.attendeeIds]);
    const keys=[...new Set([...oldSlots,...freshSlots])].sort();
    const slotRefs=keys.map(key=>db.collection(slotCollection).doc(key));
    const stamps:Map<string,string>=new Map();
    for(const [index,s] of (await Promise.all(slotRefs.map(slot=>tx.get(slot)))).entries()){
      const occupied=str(s.data()?.meetingId);
      if(freshSlots.includes(keys[index])&&occupied&&occupied!==id)throw error(409,"An invited employee or organizer already has a meeting in that time slot.");
      if(occupied)stamps.set(keys[index],occupied);
    }
    // Reserve staff meeting slots and verify the existing field appointment ledger
    // in the same transaction, including appointments beyond the organizer's UI scope.
    const [workspaceAppointments,commercialAppointments]=await Promise.all([
      tx.get(db.doc("domains/workspace/fields/appointments")),
      tx.get(db.doc("domains/commercial/fields/appointments")),
    ]);
    const rows=(snapshot:typeof workspaceAppointments):unknown[]=>
      Array.isArray(snapshot.data()?.items)?snapshot.data()!.items as unknown[]:[];
    if(staffMeetingFieldCollision([...rows(workspaceAppointments),...rows(commercialAppointments)],input,actor.uid)){
      throw error(409,"An invited employee or organizer has an overlapping recorded field appointment.");
    }
    const revision=old?Number(old.revision)+1:1;
    const existingRecipients=asStringArray(old?.attendeeIds),priorRsvps=obj(old?.rsvps)?old!.rsvps as Row:{};
    const adjusted=old?old.date!==input.date||old.startTime!==input.startTime||old.endTime!==input.endTime:false;
    const rsvps:Row={};
    for(const person of input.attendeeIds)rsvps[person]=!adjusted&&existingRecipients.includes(person)&&typeof priorRsvps[person]==="string"?priorRsvps[person]:"Pending";
    const seenRevision:Row=obj(old?.seenRevision)?{...old!.seenRevision as Row}:{};
    seenRevision[actor.uid]=revision;
    const result:Row={...old,...input,id,organizerId:actor.uid,rsvps,seenRevision,revision,status:"Scheduled",createdAt:old?.createdAt??at,updatedAt:at,
      history:[...(Array.isArray(old?.history)?old!.history:[]),history(actor,update?"Updated":"Created",at,update?"Meeting details updated.":"Meeting created with invited employees.")].slice(-200)};
    for(const key of oldSlots)if(!freshSlots.includes(key)&&stamps.get(key)===id)tx.delete(db.collection(slotCollection).doc(key));
    for(const key of freshSlots)tx.set(db.collection(slotCollection).doc(key),{meetingId:id});
    tx.set(ref,result);
    return result;
  });
}
async function cancelSchedule(db:Firestore,actor:Actor,body:Row){
  const id=str(body.id);
  if(!id||id.length>128)throw error(400,"Invalid meeting reference.");
  const ref=db.collection(meetingCollection).doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),old=snap.data() as Row|undefined;
    if(!old||!own(old,actor)||old.status!=="Scheduled")throw error(403,"Only the organizer may cancel this meeting.");
    if(body.expectedRevision!==old.revision)throw error(409,"Meeting changed. Refresh before cancelling.");
    const slots=orderedSlots(str(old.date),str(old.startTime),str(old.endTime),[str(old.organizerId),...asStringArray(old.attendeeIds)]);
    const locks=await Promise.all(slots.map(slot=>tx.get(db.collection(slotCollection).doc(slot))));
    for(const [i,lock] of locks.entries())if(lock.data()?.meetingId===id)tx.delete(db.collection(slotCollection).doc(slots[i]));
    const at=new Date().toISOString();
    const nextRevision=Number(old.revision)+1;
    const seenRevision:Row=obj(old.seenRevision)?{...old.seenRevision}:{};
    seenRevision[actor.uid]=nextRevision;
    const result={...old,status:"Cancelled",revision:nextRevision,seenRevision,updatedAt:at,history:[...(Array.isArray(old.history)?old.history:[]),history(actor,"Cancelled",at,"Meeting cancelled by organizer.")].slice(-200)};
    tx.set(ref,result);
    return result;
  });
}
async function respond(db:Firestore,actor:Actor,body:Row,action:"rsvp"|"seen"){
  const id=str(body.id);
  if(!id||id.length>128)throw error(400,"Invalid meeting reference.");
  const ref=db.collection(meetingCollection).doc(id);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),old=snap.data() as Row|undefined;
    if(!old||!member(old,actor))throw error(404,"Meeting not found for this employee.");
    const seenRevision:Row=obj(old.seenRevision)?{...old.seenRevision}:{};
    if(action==="seen"){
      seenRevision[actor.uid]=old.revision;
      const result={...old,seenRevision};
      tx.set(ref,result);
      return result;
    }
    if(old.status!=="Scheduled"||!asStringArray(old.attendeeIds).includes(actor.uid)||!rsvpOptions.has(str(body.response)))throw error(403,"Meeting response is not authorized.");
    const at=new Date().toISOString();
    const rsvps=obj(old.rsvps)?{...old.rsvps}:{};
    rsvps[actor.uid]=str(body.response);
    const revision=Number(old.revision);
    seenRevision[actor.uid]=revision;
    const result={...old,rsvps,seenRevision,history:[...(Array.isArray(old.history)?old.history:[]),history(actor,"RSVP",at,str(body.response))].slice(-200)};
    tx.set(ref,result);
    return result;
  });
}
async function listFor(db:Firestore,actor:Actor){
  const collection=db.collection(meetingCollection);
  const [organized,attending]=await Promise.all([
    collection.where("organizerId","==",actor.uid).limit(300).get(),
    collection.where("attendeeIds","array-contains",actor.uid).limit(300).get(),
  ]);
  const found=new Map<string,Row>();
  for(const doc of [...organized.docs,...attending.docs]){
    const record=doc.data();
    if(member(record,actor))found.set(doc.id,asRecord(record));
  }
  return [...found.values()].sort((a,b)=>str(a.date).localeCompare(str(b.date))||str(a.startTime).localeCompare(str(b.startTime))).slice(0,500);
}
function handleError(errorValue:unknown):{status:number;message:string}{
  if(errorValue instanceof MeetingServerError)return{status:errorValue.status,message:errorValue.message};
  return{status:503,message:"Meeting service unavailable. No change was confirmed."};
}
/** Verified HTTPS entry point. Browser users cannot read/write Firestore meeting documents directly. */
export const staffMeetingsApi=onRequest({cors:true,region:"us-central1",maxInstances:10},async(request,response)=>{
  response.set("Cache-Control","no-store");
  if(request.method!=="POST"){response.status(405).json({ok:false,message:"Method not allowed."});return;}
  try{
    const actor=await authenticate(request);
    const body=obj(request.body)?request.body:{};
    const action=str(body.action) as Action;
    const db=getFirestore();
    if(action==="list"){response.status(200).json({ok:true,meetings:await listFor(db,actor)});return;}
    if(!["create","update","cancel","rsvp","seen"].includes(action))throw error(400,"Unsupported meeting action.");
    const result=action==="create"||action==="update"?await saveSchedule(db,actor,body,action==="update"):
      action==="cancel"?await cancelSchedule(db,actor,body):await respond(db,actor,body,action as "rsvp"|"seen");
    response.status(200).json({ok:true,meeting:result});
  }catch(err){
    const failure=handleError(err);
    response.status(failure.status).json({ok:false,message:failure.message});
  }
});
