/**
 * Synthetic Firestore transaction acceptance for the disabled-by-default
 * trusted timecard endpoint. No payroll or personnel records are live.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test,{before,after,beforeEach} from "node:test";
import {initializeTestEnvironment,assertFails,type RulesTestEnvironment} from "@firebase/rules-unit-testing";
import {doc,getDoc,runTransaction,setDoc} from "firebase/firestore";
import {
  planTrustedTimecardCorrection,type CorrectionIntent,type CorrectionSnapshot,type Row,
} from "../functions/src/timecard-correction-policy";

let env:RulesTestEnvironment;
const project="momentum-timecard-trusted-review";
const uid="employee-0001",admin="administrator-001";
const p={
 accessAdmin:"userAccess/"+admin,accessEmployee:"userAccess/"+uid,
 cards:"userDomains/"+uid+"/workspace/timecards",
 entries:"userDomains/"+uid+"/workspace/timeEntries",
 sharedCards:"domains/workspace/fields/timecards",
 sharedEntries:"domains/workspace/fields/timeEntries",
 payroll:"domains/payroll/fields/runs",
 locks:"domains/periodLocks/fields/locks",
 approvals:"domains/workspace/fields/approvals",
 notifications:"domains/workspace/fields/notifications",
 receipt:(id:string)=>"timecardCorrectionReceipts/"+id,
 audit:(id:string)=>"timecardCorrectionAudit/"+id,
};
const now="2026-11-04T20:00:00.000Z";
const source={id:"entry-001",userId:uid,date:"2026-10-27",
  clockIn:"08:00",clockOut:"17:00",breakMinutes:30,source:"Web clock",
  clockInAt:"2026-10-27T15:00:00.000Z",clockOutAt:"2026-10-28T00:00:00.000Z"};
const baseCard={id:"card-0001",userId:uid,weekStart:"2026-10-26",weekEnd:"2026-11-01",
  status:"Manager approved",attested:true,approvedAt:now,approverId:admin};
const intent=(id="request-0001",clockOut="18:00"):CorrectionIntent=>({
  requestId:id,targetUid:uid,action:"amend",cardId:"card-0001",entryId:"entry-001",
  date:"2026-10-27",reason:"Confirmed correction from employee",
  expectedBefore:{clockIn:"08:00",clockOut:"17:00",breakMinutes:30},
  punch:{clockIn:"08:00",clockOut,breakMinutes:30},
});
type TestFirestore=ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>;
const privileged=async <T>(cb:(db:TestFirestore)=>Promise<T>):Promise<T>=>{
  let result!:T;
  await env.withSecurityRulesDisabled(async ctx=>{result=await cb(ctx.firestore());});
  return result;
};
const data=(s:{exists:()=>boolean;data:()=>Record<string,unknown>|undefined},field="items"):Row[]=>{
 const items=s.data()?.[field];return Array.isArray(items)?items as Row[]:[];
};
before(async()=>{
 env=await initializeTestEnvironment({
  projectId:project,
  firestore:{host:"127.0.0.1",port:8080,rules:readFileSync("firestore.rules","utf8")},
 });
});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await privileged(async db=>{
   await Promise.all([
     setDoc(doc(db,p.accessAdmin),{role:"Administrator",accountState:"Active",email:"admin@example.invalid",team:"Leadership"}),
     setDoc(doc(db,p.accessEmployee),{role:"Sales Representative",accountState:"Active",email:"worker@example.invalid",team:"Sales"}),
     setDoc(doc(db,p.cards),{items:[baseCard]}),
     setDoc(doc(db,p.entries),{items:[source]}),
     setDoc(doc(db,p.sharedCards),{items:[]}),setDoc(doc(db,p.sharedEntries),{items:[]}),
     setDoc(doc(db,p.payroll),{items:[]}),setDoc(doc(db,p.locks),{items:[]}),
     setDoc(doc(db,p.approvals),{items:[{id:"approval-1",type:"Timecard",recordId:baseCard.id,status:"Pending"}]}),
     setDoc(doc(db,p.notifications),{items:[]}),
   ]);
 });
});
async function execute(raw:CorrectionIntent,actorUid=admin){
 return privileged(db=>runTransaction(db,async tx=>{
   const paths=[p.accessAdmin,p.accessEmployee,p.cards,p.entries,p.sharedCards,p.sharedEntries,
     p.payroll,p.locks,p.approvals,p.notifications,p.receipt(raw.requestId)];
   const snaps=await Promise.all(paths.map(path=>tx.get(doc(db,path))));
   const snapshot:CorrectionSnapshot={
     actorUid,actor:snaps[0].exists()?snaps[0].data() as Row:null,
     target:snaps[1].exists()?snaps[1].data() as Row:null,
     timecards:data(snaps[2]),entries:data(snaps[3]),sharedCards:data(snaps[4]),
     sharedEntries:data(snaps[5]),payrollRuns:data(snaps[6]),periodLocks:data(snaps[7]),
     approvals:data(snaps[8]),notifications:data(snaps[9]),
     receipt:snaps[10].exists()?snaps[10].data() as Row:null,now,todayArizona:"2026-11-04",
   };
   const decision=planTrustedTimecardCorrection(raw,snapshot);
   if(!decision.ok||decision.plan.replayed)return decision;
   const write=(path:string,rows:Row[])=>tx.set(doc(db,path),{items:JSON.parse(JSON.stringify(rows))});
   write(p.cards,decision.plan.timecards);write(p.entries,decision.plan.entries);
   write(p.approvals,decision.plan.approvals);write(p.notifications,decision.plan.notifications);
   tx.set(doc(db,p.receipt(raw.requestId)),decision.plan.receipt);
   tx.set(doc(db,p.audit(raw.requestId)),JSON.parse(JSON.stringify(decision.plan.audit)));
   return decision;
 }));
}
test("single transaction persists corrected source, attestation reset, approval, notice, audit and receipt",async()=>{
 const result=await execute(intent());assert(result.ok);
 const docs=await privileged(db=>Promise.all([
   p.cards,p.entries,p.approvals,p.notifications,p.receipt("request-0001"),p.audit("request-0001"),
 ].map(path=>getDoc(doc(db,path)))));
 assert.equal(data(docs[0])[0].status,"Returned");
 assert.equal(data(docs[0])[0].attested,false);
 assert.equal(data(docs[1])[0].clockOut,"18:00");
 assert.equal(data(docs[2])[0].status,"Returned");
 assert.deepEqual(data(docs[3])[0].audienceUserIds,[uid]);
 assert.equal(docs[4].data()?.status,"Recorded");
 assert.equal(docs[5].data()?.actorUid,admin);
 const replay=await execute(intent());
 assert(replay.ok);if(replay.ok)assert.equal(replay.plan.replayed,true);
});
test("newer payroll lock prevents trusted correction without any partial writes",async()=>{
 await privileged(db=>setDoc(doc(db,p.payroll),{items:[{
   id:"pay-0001",kind:"Regular",status:"Approved",periodStart:"2026-10-26",periodEnd:"2026-11-01",
   lines:[{employeeId:uid,sourceTimecardIds:["card-0001"]}],
 }]}));
 const result=await execute(intent());assert.equal(result.ok,false);
 const docs=await privileged(db=>Promise.all([p.cards,p.entries,p.receipt("request-0001")]
   .map(path=>getDoc(doc(db,path)))));
 assert.equal(data(docs[0])[0].status,"Manager approved");
 assert.equal(data(docs[1])[0].clockOut,"17:00");
 assert.equal(docs[2].exists(),false);
});
test("concurrent stale corrections cannot silently overwrite the same original punch",async()=>{
 const [one,two]=await Promise.all([
   execute(intent("request-0002","18:00")),
   execute(intent("request-0003","19:00")),
 ]);
 assert.equal(Number(one.ok)+Number(two.ok),1);
 const docs=await privileged(db=>Promise.all([
   p.entries,p.receipt("request-0002"),p.receipt("request-0003"),
 ].map(path=>getDoc(doc(db,path)))));
 const actual=data(docs[0])[0].clockOut;
 assert(["18:00","19:00"].includes(actual as string));
 assert.equal(Number(docs[1].exists())+Number(docs[2].exists()),1);
});
test("non-Administrator browser user cannot directly rewrite another employee timecard shard",async()=>{
 await privileged(db=>setDoc(doc(db,"userAccess/outsider-001"),{
   role:"Sales Representative",accountState:"Active",email:"outside@example.invalid",team:"Sales",
 }));
 const outsider=env.authenticatedContext("outsider-001").firestore();
 await assertFails(setDoc(doc(outsider,p.cards),{items:[{...baseCard,status:"Payroll ready"}]}));
});
