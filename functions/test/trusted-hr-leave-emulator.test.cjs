/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error("HR transaction test requires local Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {submitTrustedHrLeave,TrustedHrLeaveError}=require("../lib/trusted-hr-leave-request.js");
const id=randomUUID().replaceAll("-","").slice(0,16);
const uid="qa-hr-"+id;
const key="hrleave"+id+"ABCDEFGHIJKLMNOP";
const request={startDate:"2026-12-09",endDate:"2026-12-10",requestedHours:8,reason:"Scheduled personal appointment"};
const access=db.doc("userAccess/"+uid);
const leave=db.doc("userDomains/"+uid+"/hcm/leaveRequests");
const policy=db.doc("userDomains/"+uid+"/hcm/ptoAssignments");
after(async()=>{await deleteApp(app);});
test("R52 verified employee submission is server-owned, idempotent and immune to forged status",async()=>{
 await Promise.all([
  access.set({role:"Sales Representative",accountState:"Active"}),
  leave.set({items:[]}),
  policy.set({items:[{id:"assignment-1",userId:uid,policyId:"pto-1",effectiveDate:"2026-01-01"}]}),
 ]);
 const receipt=await submitTrustedHrLeave(uid,request,key);
 assert.equal(receipt.replayed,false);
 const doc=(await leave.get()).data();
 assert.equal(doc.items.length,1);
 const row=doc.items[0];
 assert.equal(row.id,receipt.id);
 assert.equal(row.userId,uid);
 assert.equal(row.status,"Submitted");
 assert.equal(row.policyId,"pto-1");
 assert(row.submittedAt);
 const provenance=await db.doc("hrLeaveRequestProvenance/"+receipt.id).get();
 assert.equal(provenance.data()?.actorUid,uid);
 const replay=await submitTrustedHrLeave(uid,request,key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.id,receipt.id);
 assert.equal((await leave.get()).data().items.length,1);
 await assert.rejects(()=>submitTrustedHrLeave(uid,{...request,reason:"Different request"},key),
  e=>e instanceof TrustedHrLeaveError&&e.status===409);
 await assert.rejects(()=>submitTrustedHrLeave(uid,{...request,status:"Approved"},"wrong"+key),
  e=>e instanceof TrustedHrLeaveError&&e.status===400);
 await assert.rejects(()=>submitTrustedHrLeave(uid,request,"other"+key),
  e=>e instanceof TrustedHrLeaveError&&e.status===409);
 await access.update({accountState:"Suspended"});
 await assert.rejects(()=>submitTrustedHrLeave(uid,{...request,reason:"Changed"}, "suspended"+key),
  e=>e instanceof TrustedHrLeaveError&&e.status===403);
 assert.equal((await leave.get()).data().items.length,1);
});
