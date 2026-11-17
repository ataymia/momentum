/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");

if(!process.env.FIRESTORE_EMULATOR_HOST){
 throw new Error("Support transaction integration requires the local Firestore emulator");
}
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {writeCase,readCases,SupportCasesError}=require("../lib/support-case-service.js");
const code=randomUUID().replaceAll("-","").slice(0,12);
const rep="qa-support-rep-"+code;
const stranger="qa-support-other-"+code;
const admin="qa-support-admin-"+code;
const account="qa-support-own-"+code;
const foreign="qa-support-foreign-"+code;
const key="support-create-"+code+"-ABCDEFGHIJKLMNOP";
const actor={uid:rep,role:"Sales Representative",accountState:"Active"};
const supervisor={uid:admin,role:"Administrator",accountState:"Active"};
const draft={kind:"create",draft:{title:"Damaged Golden Eagle cases",
 description:"Several cases arrived dented and need review.",
 accountId:account,category:"Delivery",priority:"High"}};
after(async()=>{await deleteApp(app);});
test("R62 trusted support case transaction enforces ownership, revisions, idempotency and audit events",async()=>{
 await Promise.all([
  db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+stranger).set({role:"Sales Representative",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active",team:"Leadership"}),
  db.doc("domains/workspace/fields/accounts").set({items:[
   {id:account,ownerId:rep,stage:"Qualified"},{id:foreign,ownerId:stranger,stage:"Qualified"},
  ]}),
 ]);
 const receipt=await writeCase(actor,draft,key);
 assert.equal(receipt.replayed,false);
 assert(receipt.caseId.startsWith("case-"));
 const doc=db.doc("supportCases/"+receipt.caseId);
 const record=(await doc.get()).data();
 assert.equal(record.createdBy,rep);
 assert.equal(record.ownerId,rep);
 assert.equal(record.revision,1);
 assert.equal(record.status,"Open");
 assert.equal(record.history.length,1);
 assert.equal(record.history[0].actorId,rep);
 const request=(await db.doc("supportCaseRequests/"+rep+"_"+key).get()).data();
 assert.equal(request.actorUid,rep);
 assert.equal(request.caseId,receipt.caseId);
 const replay=await writeCase(actor,draft,key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.caseId,receipt.caseId);
 assert.equal((await doc.get()).data().history.length,1);
 await assert.rejects(()=>writeCase(actor,{...draft,draft:{...draft.draft,title:"Different title"}},key),
   error=>error instanceof SupportCasesError&&error.status===409);
 await assert.rejects(()=>writeCase(actor,{...draft,draft:{...draft.draft,accountId:foreign}},key+"-other"),
   error=>error instanceof SupportCasesError&&error.status===403);
 const read=await readCases(actor);
 assert.equal(read.cases.filter(c=>c.id===receipt.caseId).length,1);
 const noAccess=await readCases({uid:stranger,role:"Sales Representative",accountState:"Active"});
 assert.equal(noAccess.cases.some(c=>c.id===receipt.caseId),false);
 const note={kind:"note",caseId:receipt.caseId,value:"Spoke to receiving manager",revision:1};
 const noted=await writeCase(actor,note,key+"-note");
 assert.equal(noted.revision,2);
 assert.equal((await doc.get()).data().history.length,2);
 await assert.rejects(()=>writeCase(actor,{kind:"status",caseId:receipt.caseId,
   value:"Investigating",reason:"Attempted by rep",revision:2},key+"-repstatus"),
   error=>error instanceof SupportCasesError&&error.status===409);
 const status=await writeCase(supervisor,{kind:"status",caseId:receipt.caseId,
   value:"Investigating",reason:"Verified source tracking",revision:2},key+"-status");
 assert.equal(status.revision,3);
 assert.equal((await doc.get()).data().status,"Investigating");
 await assert.rejects(()=>writeCase(actor,{...note,revision:1},key+"-stale"),
   error=>error instanceof SupportCasesError&&error.status===409);
 await db.doc("userAccess/"+rep).update({accountState:"Suspended"});
 await assert.rejects(()=>writeCase(actor,{kind:"note",caseId:receipt.caseId,
  value:"Cannot write when suspended",revision:3},key+"-suspended"),
  error=>error instanceof SupportCasesError&&error.status===403);
 assert.equal((await doc.get()).data().history.length,3);
});
