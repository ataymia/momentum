/* eslint-disable max-len,comma-spacing,key-spacing,object-curly-spacing,space-before-blocks,keyword-spacing,curly,brace-style,semi-spacing,arrow-parens,one-var,indent,operator-linebreak,space-before-function-paren */
import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {
  planTrustedTimecardCorrection,type CorrectionIntent,type Row,
} from "./timecard-correction-policy";

const text=(x:unknown)=>typeof x==="string"?x.trim():"";
const object=(x:unknown):x is Row=>Boolean(x&&typeof x==="object"&&!Array.isArray(x));
const validId=(x:string)=>/^[A-Za-z0-9_-]{8,120}$/.test(x);

export class TrustedTimecardError extends Error{
  constructor(public readonly status:number,message:string){super(message);}
}
const fail=(status:number,message:string):never=>{throw new TrustedTimecardError(status,message);};

/**
 * Disabled by default. Setting MOMENTUM_ENABLE_TIMECARD_CORRECTIONS=true must
 * require an explicit staged release after privacy/security acceptance.
 * The browser has no authority to supply timecard, payroll or lock snapshots.
 */
export async function commitTrustedTimecardCorrection(actorUid:string,raw:unknown){
 if(process.env.MOMENTUM_ENABLE_TIMECARD_CORRECTIONS!=="true")
   fail(503,"Connected timecard corrections have not been released.");
 if(!object(raw)){throw new TrustedTimecardError(400,"Invalid timecard correction request.");}
 const input:Row=raw;
 const intent:CorrectionIntent={
   requestId:text(input.requestId),targetUid:text(input.targetUid),
   action:text(input.action) as CorrectionIntent["action"],
   reason:text(input.reason),
   cardId:text(input.cardId)||undefined,entryId:text(input.entryId)||undefined,
   date:text(input.date)||undefined,weekDate:text(input.weekDate)||undefined,
   punch:object(input.punch)?{
     clockIn:text(input.punch.clockIn),clockOut:text(input.punch.clockOut),
     mealStart:text(input.punch.mealStart)||undefined,mealEnd:text(input.punch.mealEnd)||undefined,
     breakMinutes:typeof input.punch.breakMinutes==="number"?input.punch.breakMinutes:Number.NaN,
   }:undefined,
   expectedBefore:object(input.expectedBefore)?{
     clockIn:text(input.expectedBefore.clockIn),clockOut:text(input.expectedBefore.clockOut)||undefined,
     mealStart:text(input.expectedBefore.mealStart)||undefined,
     mealEnd:text(input.expectedBefore.mealEnd)||undefined,
     breakMinutes:typeof input.expectedBefore.breakMinutes==="number"?
       input.expectedBefore.breakMinutes:Number.NaN,
   }:undefined,
 };
 if(!validId(intent.targetUid)||!validId(intent.requestId))
   fail(400,"Invalid employee or correction request identifier.");
 const db=getFirestore();
 const actorRef=db.doc("userAccess/"+actorUid);
 const targetRef=db.doc("userAccess/"+intent.targetUid);
 const cardsRef=db.doc("userDomains/"+intent.targetUid+"/workspace/timecards");
 const entriesRef=db.doc("userDomains/"+intent.targetUid+"/workspace/timeEntries");
 const sharedCardsRef=db.doc("domains/workspace/fields/timecards");
 const sharedEntriesRef=db.doc("domains/workspace/fields/timeEntries");
 const payrollRef=db.doc("domains/payroll/fields/runs");
 const locksRef=db.doc("domains/periodLocks/fields/locks");
 const approvalsRef=db.doc("domains/workspace/fields/approvals");
 const notificationsRef=db.doc("domains/workspace/fields/notifications");
 const receiptRef=db.doc("timecardCorrectionReceipts/"+intent.requestId);
 const auditRef=db.doc("timecardCorrectionAudit/"+intent.requestId);
 const metaRef=db.doc("platform/meta");
 const now=new Date().toISOString();
 const dateParts=new Intl.DateTimeFormat("en-US",{
   timeZone:"America/Phoenix",year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(new Date());
 const part=(type:string)=>dateParts.find(x=>x.type===type)?.value??"";
 const todayArizona=part("year")+"-"+part("month")+"-"+part("day");
 const jsonRows=(snap:{exists:boolean;data:()=>Row|undefined},name:string,missingOk:boolean):Row[]=>{
   if(!snap.exists){if(missingOk)return[];fail(409,name+" is unavailable; source correction is blocked.");}
   const value=snap.data()?.items;
   if(!Array.isArray(value)||!value.every(object))
     fail(409,name+" is invalid; resolve storage before retrying.");
   return value as Row[];
 };
 return db.runTransaction(async tx=>{
   // Every value is fetched again when Firestore retries a transaction. All
   // reads are before writes, so each commit uses current payroll/lock state.
   const [
     actor,target,cards,entries,sharedCards,sharedEntries,payroll,locks,
     approvals,notifications,receipt,
   ]=await Promise.all([
     tx.get(actorRef),tx.get(targetRef),tx.get(cardsRef),tx.get(entriesRef),
     tx.get(sharedCardsRef),tx.get(sharedEntriesRef),tx.get(payrollRef),
     tx.get(locksRef),tx.get(approvalsRef),tx.get(notificationsRef),
     tx.get(receiptRef),
   ]);
   const decision=planTrustedTimecardCorrection(intent,{
     actorUid,actor:actor.exists?actor.data()??null:null,
     target:target.exists?target.data()??null:null,
     now,todayArizona,
     timecards:jsonRows(cards,"Employee timecards",intent.action==="create_week"),
     entries:jsonRows(entries,"Employee time entries",true),
     sharedCards:jsonRows(sharedCards,"Legacy shared timecards",true),
     sharedEntries:jsonRows(sharedEntries,"Legacy shared time entries",true),
     payrollRuns:jsonRows(payroll,"Payroll source runs",false),
     periodLocks:jsonRows(locks,"Payroll period locks",false),
     approvals:jsonRows(approvals,"Approval records",true),
     notifications:jsonRows(notifications,"Notification records",true),
     receipt:receipt.exists?receipt.data()??null:null,
   });
   if(!decision.ok){throw new TrustedTimecardError(decision.status,decision.message);}
   if(decision.plan.replayed){
     return{requestId:intent.requestId,cardId:text(decision.plan.receipt.cardId),
       status:"Recorded",replayed:true,serverRecordedAt:text(decision.plan.receipt.at)};
   }
   const plan=decision.plan;
   // Firestore rejects undefined; omit optional before-image fields while
   // keeping nulls for explicitly cleared approval and punch instants.
   const safe=(value:unknown):Row=>JSON.parse(JSON.stringify(value)) as Row;
   tx.set(cardsRef,{items:plan.timecards.map(safe)});
   tx.set(entriesRef,{items:plan.entries.map(safe)});
   tx.set(approvalsRef,{items:plan.approvals.map(safe)});
   tx.set(notificationsRef,{items:plan.notifications.map(safe)});
   tx.create(receiptRef,safe(plan.receipt));
   tx.create(auditRef,safe(plan.audit));
   const stamp=now+"#"+randomUUID().slice(0,6);
   const paths=[cardsRef.path,entriesRef.path,approvalsRef.path,notificationsRef.path];
   tx.set(metaRef,{versions:Object.fromEntries(paths.map(p=>
     [p.replace(/[^A-Za-z0-9]+/g,"_"),stamp]))},{merge:true});
   return{requestId:intent.requestId,cardId:text(plan.receipt.cardId),
     status:"Recorded",replayed:false,serverRecordedAt:now};
 });
}
