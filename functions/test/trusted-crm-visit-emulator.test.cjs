"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");

// This test NEVER runs against production. Do not relax this guard.
if(!process.env.FIRESTORE_EMULATOR_HOST){
  throw new Error("Trusted CRM transaction tests require the local Firestore emulator");
}
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {commitTrustedCrmFieldVisit,TrustedCrmVisitError}=
  require("../lib/trusted-crm-field-visit.js");
const stamp=randomUUID().replaceAll("-","").slice(0,12);
const rep="qa-rep-"+stamp;
const stranger="qa-stranger-"+stamp;
const accountA="qa-own-"+stamp;
const accountB="qa-foreign-"+stamp;
const reqKey="integration"+stamp+"ABCDEFGHIJKLMNOP";
const refs=[
  db.doc("userAccess/"+rep),
  db.doc("userAccess/"+stranger),
  db.doc("domains/workspace/fields/accounts"),
  db.doc("domains/crm/fields/interactions"),
];
const visit={
  businessName:"QA Local Retailer",accountId:accountA,physicallyVisited:true,
  unsuccessful:false,score:8,summary:"Physical shelf check",nextAction:"Call buyer",
  nextActionDate:"2026-12-10",sampleProduct:"Energy drink can",sampleQuantity:2,
};
after(async()=>{
  // Emulator is ephemeral and writes must never occur in a real project.
  await deleteApp(app);
});
test("authenticated CRM field visit transaction, replay and unauthorized denials",async()=>{
  await Promise.all([
    refs[0].set({role:"Sales Representative",accountState:"Active"}),
    refs[1].set({role:"Sales Representative",accountState:"Active"}),
    refs[2].set({items:[
      {id:accountA,ownerId:rep,stage:"Qualified",name:"QA A"},
      {id:accountB,ownerId:stranger,stage:"Qualified",name:"QA B"},
    ]}),
    refs[3].set({items:[]}),
  ]);
  const receipt=await commitTrustedCrmFieldVisit(rep,visit,reqKey);
  assert.equal(receipt.replayed,false);
  assert(receipt.visitId.startsWith("interaction-"));
  assert(receipt.sampleId?.startsWith("interaction-"));
  const interactionSnap=await refs[3].get();
  const interactions=interactionSnap.data()?.items??[];
  assert.equal(interactions.length,2);
  assert(interactions.some(item=>item.id===receipt.visitId
    &&item.userId===rep&&item.locationId===accountA&&item.physicalVisit===true));
  assert(interactions.some(item=>item.id===receipt.sampleId
    &&item.type==="Sample"&&item.sampleInventoryLinked===false));
  const provenance=await db.doc("crmFieldVisitProvenance/"+receipt.visitId).get();
  assert.equal(provenance.data()?.actorUid,rep);
  const replay=await commitTrustedCrmFieldVisit(rep,visit,reqKey);
  assert.equal(replay.replayed,true);
  assert.equal(replay.visitId,receipt.visitId);
  assert.equal((await refs[3].get()).data()?.items.length,2,
    "Same idempotent request must not create duplicate visits or sample records");
  await assert.rejects(()=>commitTrustedCrmFieldVisit(rep,{...visit,summary:"Edited later"},reqKey),
    error=>error instanceof TrustedCrmVisitError&&error.status===409);
  await assert.rejects(()=>commitTrustedCrmFieldVisit(rep,{...visit,accountId:accountB},
    "foreign"+reqKey),error=>error instanceof TrustedCrmVisitError&&error.status===403);
  await assert.rejects(()=>commitTrustedCrmFieldVisit(rep,{...visit,accountId:"not-found"},
    "missing"+reqKey),error=>error instanceof TrustedCrmVisitError&&error.status===404);
  assert.equal((await refs[3].get()).data()?.items.length,2,
    "Foreign or nonexistent accounts must never mutate CRM");
  await refs[0].update({accountState:"Suspended"});
  await assert.rejects(()=>commitTrustedCrmFieldVisit(rep,visit,"suspended"+reqKey),
    error=>error instanceof TrustedCrmVisitError&&error.status===403);
  assert.equal((await refs[3].get()).data()?.items.length,2,
    "Suspended employees must not write CRM");
});
