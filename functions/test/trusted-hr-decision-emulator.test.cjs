/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error("HR manager decision tests require local Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {commitTrustedLeaveDecision,TrustedLeaveDecisionError}=require("../lib/trusted-hr-leave-decision.js");
const suffix=randomUUID().replaceAll("-","").slice(0,14);
const reviewer="qa-leave-admin-"+suffix;
const employee="qa-leave-rep-"+suffix;
const outsider="qa-leave-other-"+suffix;
const policyId="qa-leave-policy-"+suffix;
const leaveId="leave-qa-"+suffix;
const returnId="leave-return-"+suffix;
const rejectId="leave-insufficient-"+suffix;
const submittedAt="2026-11-11T11:00:00.000Z";
const key="decision"+suffix+"ABCDEFGH";
const paths={
 leave:db.doc("userDomains/"+employee+"/hcm/leaveRequests"),
 ledger:db.doc("userDomains/"+employee+"/hcm/ptoLedger"),
 assignment:db.doc("userDomains/"+employee+"/hcm/ptoAssignments"),
};
const input=(id,decision,note="Source and manager evidence checked")=>({
 employeeUid:employee,leaveId:id,status:decision,note,submittedAt,
});
const request=(id,hours)=>({id,userId:employee,policyId,startDate:"2026-12-02",
 endDate:"2026-12-03",requestedHours:hours,reason:"Requested personal time",
 status:"Submitted",submittedAt});
after(async()=>{await deleteApp(app);});
test("R53 verified manager leave decisions preserve request and never double-debit PTO",async()=>{
 await Promise.all([
  db.doc("userAccess/"+reviewer).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+employee).set({role:"Sales Representative",accountState:"Active",team:"Sales",managerId:reviewer}),
  db.doc("userAccess/"+outsider).set({role:"Sales Manager",accountState:"Active",managedTeams:["Other"]}),
  paths.leave.set({items:[request(leaveId,8),request(returnId,6),request(rejectId,100)]}),
  paths.ledger.set({items:[{id:"initial-"+suffix,userId:employee,policyId,date:"2026-01-01",type:"Accrued",hours:24}]}),
  paths.assignment.set({items:[{id:"assignment-"+suffix,userId:employee,policyId,effectiveDate:"2026-01-01"}]}),
  db.doc("domains/hcm/fields/ptoPolicies").set({items:[{id:policyId,active:true,minimumRequestHours:1}]}),
 ]);
 const receipt=await commitTrustedLeaveDecision(reviewer,input(leaveId,"Approved"),key);
 assert.equal(receipt.status,"Approved");
 assert.equal(receipt.replayed,false);
 assert(receipt.ptoEntryId);
 const leaveRow=(await paths.leave.get()).data().items.find(x=>x.id===leaveId);
 assert.equal(leaveRow.status,"Approved");
 assert.equal(leaveRow.reviewerId,reviewer);
 assert(leaveRow.decidedAt);
 const entries=(await paths.ledger.get()).data().items;
 assert.equal(entries.filter(e=>e.requestId===leaveId&&e.type==="Used").length,1);
 assert.equal(entries.find(e=>e.requestId===leaveId).hours,-8);
 const replay=await commitTrustedLeaveDecision(reviewer,input(leaveId,"Approved"),key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.ptoEntryId,receipt.ptoEntryId);
 assert.equal((await paths.ledger.get()).data().items.filter(e=>e.requestId===leaveId).length,1);
 await assert.rejects(()=>commitTrustedLeaveDecision(reviewer,input(leaveId,"Approved","Different decision evidence"),key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===409);
 await assert.rejects(()=>commitTrustedLeaveDecision(reviewer,input(leaveId,"Approved"),"alternative-"+key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===409);
 await assert.rejects(()=>commitTrustedLeaveDecision(outsider,input(returnId,"Returned"),"outsider-"+key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===403);
 await assert.rejects(()=>commitTrustedLeaveDecision(employee,input(returnId,"Returned"),"self-review-"+key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===403);
 const returned=await commitTrustedLeaveDecision(reviewer,input(returnId,"Returned","Please clarify the dates and hours"),"return-"+key);
 assert.equal(returned.status,"Returned");
 assert.equal(returned.ptoEntryId,undefined);
 const returnedSource=(await paths.leave.get()).data().items.find(x=>x.id===returnId);
 assert.equal(returnedSource.decisionNote,"Please clarify the dates and hours");
 assert.equal((await paths.ledger.get()).data().items.length,2,"A returned request must not consume PTO");
 await assert.rejects(()=>commitTrustedLeaveDecision(reviewer,input(rejectId,"Approved"),"insufficient-"+key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===409);
 assert.equal((await paths.leave.get()).data().items.find(x=>x.id===rejectId).status,"Submitted");
 assert.equal((await paths.ledger.get()).data().items.length,2);
 await db.doc("userAccess/"+reviewer).update({accountState:"Suspended"});
 await assert.rejects(()=>commitTrustedLeaveDecision(reviewer,input(rejectId,"Returned"),"suspended-"+key),
  e=>e instanceof TrustedLeaveDecisionError&&e.status===403);
});
