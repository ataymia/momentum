/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("CRM lead authorization tests require local Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"}),db=getFirestore(app);
const {commitTrustedCrmLead,TrustedCrmLeadError}=require("../lib/trusted-crm-lead.js");
const suffix=randomUUID().replaceAll("-","").slice(0,14);
const admin="qa-admin-"+suffix,mgr="qa-mgr-"+suffix,mgr2="qa-mgr2-"+suffix;
const rep="qa-rep-"+suffix,rep2="qa-rep2-"+suffix,outside="qa-out-"+suffix;
const customer="qa-customer-"+suffix;
const a="qa-a-"+suffix,b="qa-b-"+suffix,c="qa-c-"+suffix;
const key="qaLead"+suffix+"ABCDEFGHIJKLMNOP";
const row=(id,ownerId,stage)=>({id,ownerId,stage,name:"Test "+id,
 location:"Phoenix, AZ",postalCode:"85001",lifetimeCases:0,reorderCount:0,
 lastActivity:"",nextAction:"Call buyer",nextActionDate:"2026-11-20"});
const qualify=(accountId,expectedStage,nextStage)=>({action:"Qualify",
 accountId,expectedStage,nextStage,reason:"Buyer qualification documented"});
const transfer=(accountId,expectedOwnerId,targetUid)=>({action:"Transfer",
 accountId,expectedOwnerId,targetUid,reason:"Manager verified account assignment"});
const denied=(promise,status)=>assert.rejects(promise,
 e=>e instanceof TrustedCrmLeadError&&e.status===status);
after(async()=>{await deleteApp(app);});
test("R21/R22/R79 connected lead state and assignment: authorized, atomic and replay-safe",async()=>{
 const accounts=db.doc("domains/workspace/fields/accounts");
 const activities=db.doc("domains/workspace/fields/activities");
 const history=db.doc("domains/crm/fields/responsibilityHistory");
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+mgr).set({role:"Sales Manager",team:"Sales",accountState:"Active"}),
  db.doc("userAccess/"+mgr2).set({role:"Sales Manager",team:"Sales",accountState:"Active"}),
  db.doc("userAccess/"+rep).set({role:"Sales Representative",team:"Sales",managerId:mgr,accountState:"Active"}),
  db.doc("userAccess/"+rep2).set({role:"Sales Representative",team:"Sales",managerId:mgr,accountState:"Active"}),
  db.doc("userAccess/"+outside).set({role:"Sales Representative",team:"Sales",managerId:mgr2,accountState:"Active"}),
  db.doc("userAccess/"+customer).set({role:"Customer",accountState:"Active"}),
  accounts.set({items:[row(a,mgr,"Prospect"),row(b,outside,"Qualified"),row(c,rep,"Opening order")]}),
  activities.set({items:[]}),history.set({items:[]}),
 ]);
 const q=qualify(a,"Prospect","Qualified");
 const first=await commitTrustedCrmLead(mgr,q,key);
 assert.equal(first.replayed,false);
 assert.equal(first.stage,"Qualified");
 assert.equal((await accounts.get()).data().items.find(x=>x.id===a).stage,"Qualified");
 const replay=await commitTrustedCrmLead(mgr,q,key);
 assert.equal(replay.replayed,true);assert.equal(replay.eventId,first.eventId);
 await denied(commitTrustedCrmLead(mgr,{...q,reason:"Different evidence"},key),409);
 await denied(commitTrustedCrmLead(mgr,q,"stale"+key),409);
 const move=await commitTrustedCrmLead(mgr,transfer(a,mgr,rep),"move"+key);
 assert.equal(move.ownerId,rep);
 const historyItems=(await history.get()).data().items;
 assert.equal(historyItems.length,1);
 assert.equal(historyItems[0].fromUserId,mgr);
 assert.equal(historyItems[0].toUserId,rep);
 assert.equal(historyItems[0].acceptedAt,undefined);
 assert.equal((await db.doc("crmLeadEvents/"+move.eventId).get()).data().actorUid,mgr);
 await denied(commitTrustedCrmLead(mgr,transfer(a,mgr,rep2),"oldowner"+key),409);
 await denied(commitTrustedCrmLead(mgr2,transfer(a,rep,outside),"outsidemgr"+key),403);
 await denied(commitTrustedCrmLead(mgr,transfer(a,rep,outside),"outside"+key),403);
 await denied(commitTrustedCrmLead(rep2,qualify(a,"Qualified","Sampled"),"wrongrep"+key),403);
 await denied(commitTrustedCrmLead(customer,qualify(a,"Qualified","Sampled"),"customer"+key),403);
 assert.equal((await commitTrustedCrmLead(rep,qualify(a,"Qualified","Sampled"),"sample"+key)).stage,"Sampled");
 await denied(commitTrustedCrmLead(rep,qualify(a,"Sampled","Qualified"),"reverse"+key),409);
 assert.equal((await commitTrustedCrmLead(mgr,qualify(a,"Sampled","Qualified"),"correct"+key)).stage,"Qualified");
 await denied(commitTrustedCrmLead(admin,qualify(c,"Prospect","Qualified"),"paid"+key),409);
 await denied(commitTrustedCrmLead(admin,transfer(a,rep,"no-such-user"),"fake"+key),403);
 await db.doc("userAccess/"+mgr).update({accountState:"Suspended"});
 await denied(commitTrustedCrmLead(mgr,qualify(a,"Qualified","Sampled"),"suspend"+key),403);
 assert.equal((await accounts.get()).data().items.find(x=>x.id===c).stage,"Opening order");
 assert.equal((await accounts.get()).data().items.find(x=>x.id===a).lifetimeCases,0);
 assert.equal((await history.get()).data().items.length,1);
 assert.equal((await activities.get()).data().items.length,4);
});


test("CRM connected journey: create prospect, hand off to rep, qualify and record field visit",async()=>{
 const {createTrustedCrmAccount}=require("../lib/trusted-account-creation.js");
 const {commitTrustedCrmFieldVisit}=require("../lib/trusted-crm-field-visit.js");
 const manager="qa-journey-manager-"+suffix;
 const seller="qa-journey-rep-"+suffix;
 await Promise.all([
  db.doc("userAccess/"+manager).set({role:"Sales Manager",team:"Sales",accountState:"Active"}),
  db.doc("userAccess/"+seller).set({role:"Sales Representative",team:"Sales",managerId:manager,accountState:"Active"}),
  db.doc("domains/workspace/fields/accounts").set({items:[]}),
  db.doc("domains/workspace/fields/customers").set({items:[]}),
  db.doc("domains/workspace/fields/activities").set({items:[]}),
  db.doc("domains/crm/fields/responsibilityHistory").set({items:[]}),
  db.doc("domains/crm/fields/interactions").set({items:[]}),
 ]);
 const created=await createTrustedCrmAccount(manager,{
  name:"QA Journey Store "+suffix,legalBusinessName:"QA Journey Store "+suffix,
  customerName:"QA Journey Store "+suffix,locationName:"Test outlet",
  location:"Phoenix, AZ",channel:"Independent retail",
  contactName:"Verified Buyer",contactRole:"Owner",
  phone:"6025550199",postalCode:"85001",streetAddress:"245 Synthetic St",
  deliveryAddressSameAsBusiness:true,taxDocumentType:"Undetermined",
 },"journeyCreate"+key);
 assert.equal(created.replayed,false);
 const assigned=await commitTrustedCrmLead(manager,
  transfer(created.accountId,manager,seller),"journeyTransfer"+key);
 assert.equal(assigned.ownerId,seller);
 const qualified=await commitTrustedCrmLead(seller,
  qualify(created.accountId,"Prospect","Qualified"),"journeyQualify"+key);
 assert.equal(qualified.stage,"Qualified");
 const visit={
  businessName:"QA Journey Store "+suffix,accountId:created.accountId,
  physicallyVisited:true,unsuccessful:false,score:8,
  summary:"Verified in-person shelf and buyer review",
  nextAction:"Discuss opening order",nextActionDate:"2026-12-10",
  sampleProduct:"Golden Eagle",sampleQuantity:1,
 };
 const visitKey="journeyVisit"+key;
 const receipt=await commitTrustedCrmFieldVisit(seller,visit,visitKey);
 assert(receipt.visitId.startsWith("interaction-"));
 const replay=await commitTrustedCrmFieldVisit(seller,visit,visitKey);
 assert.equal(replay.replayed,true);
 assert.equal(replay.visitId,receipt.visitId);
 const saved=(await db.doc("domains/workspace/fields/accounts").get()).data().items
  .find(item=>item.id===created.accountId);
 assert.equal(saved.ownerId,seller);assert.equal(saved.stage,"Qualified");
 assert.equal(saved.lifetimeCases,0);
 assert.equal(saved.reorderCount,0);
 const interactions=(await db.doc("domains/crm/fields/interactions").get()).data().items;
 assert(interactions.some(item=>item.id===receipt.visitId&&item.locationId===created.accountId&&item.userId===seller));
 assert(interactions.some(item=>item.type==="Sample"&&item.sampleInventoryLinked===false));
 assert.equal((await db.doc("domains/workspace/fields/customers").get()).data().items.length,1);
 assert.equal((await db.doc("domains/crm/fields/responsibilityHistory").get()).data().items.length,1);
});
