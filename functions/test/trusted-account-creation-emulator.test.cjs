/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("Account creation tests require local Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {createTrustedCrmAccount,TrustedAccountCreationError}=
 require("../lib/trusted-account-creation.js");
const suffix=randomUUID().replaceAll("-","").slice(0,15);
const admin="qa-account-admin-"+suffix;
const manager="qa-account-manager-"+suffix;
const rep="qa-account-rep-"+suffix;
const key="qaAccount"+suffix+"abcdefghijklmn";
const account={
 name:"QA Corner Market "+suffix,legalBusinessName:"QA Corner Market "+suffix,
 customerName:"QA Corner Market "+suffix,locationName:"Flagship",
 location:"Phoenix, AZ",channel:"Independent retail",
 contactName:"Buyer",contactRole:"Owner",phone:"6025550100",
 postalCode:"85001",streetAddress:"123 Synthetic Test St",
 deliveryAddressSameAsBusiness:true,taxDocumentType:"Undetermined",
};
after(async()=>{await deleteApp(app);});
test("R18 customer and location creation is atomic, replay-safe and manager-only",async()=>{
 const accounts=db.doc("domains/workspace/fields/accounts");
 const customers=db.doc("domains/workspace/fields/customers");
 const activities=db.doc("domains/workspace/fields/activities");
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+manager).set({role:"Sales Manager",accountState:"Active"}),
  db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active"}),
  accounts.set({items:[]}),customers.set({items:[]}),activities.set({items:[]}),
 ]);
 const receipt=await createTrustedCrmAccount(manager,account,key);
 assert.equal(receipt.replayed,false);
 assert(receipt.accountId.startsWith("acc-"));
 const row=(await accounts.get()).data().items.find(r=>r.id===receipt.accountId);
 assert.equal(row.createdByUid,manager);
 assert.equal(row.ownerId,manager);
 assert.equal(row.stage,"Prospect");
 assert.equal(row.lifetimeCases,0);
 assert.match(row.notes,/not been verified/);
 const groups=(await customers.get()).data().items;
 assert.equal(groups.length,1);
 assert.equal(groups[0].taxDocumentType,"Undetermined");
 assert.equal(groups[0].billingEmail,"","optional email must not become undefined in Firestore");
 assert.equal(groups[0].billingPhone,"6025550100");
 assert.equal(groups[0].ein,"");
 assert.equal(groups[0].azTptLicenseNumber,"");
 assert.equal((await activities.get()).data().items.length,1);
 assert.equal((await db.doc("accountCreatorProvenance/"+receipt.accountId).get()).data().creatorUid,manager);
 const again=await createTrustedCrmAccount(manager,account,key);
 assert.equal(again.replayed,true);
 assert.equal(again.accountId,receipt.accountId);
 assert.equal((await accounts.get()).data().items.length,1);
 await assert.rejects(()=>createTrustedCrmAccount(manager,{...account,phone:"6025550199"},key),
  e=>e instanceof TrustedAccountCreationError&&e.status===409);
 await assert.rejects(()=>createTrustedCrmAccount(manager,account,"new"+key),
  e=>e instanceof TrustedAccountCreationError&&e.status===409);
 await assert.rejects(()=>createTrustedCrmAccount(rep,{...account,name:"Other",legalBusinessName:"Other"},"rep"+key),
  e=>e instanceof TrustedAccountCreationError&&e.status===403);
 await assert.rejects(()=>createTrustedCrmAccount(admin,{...account,ein:"12-3456789"},"ein"+key),
  e=>e instanceof TrustedAccountCreationError&&e.status===400);
 await assert.rejects(()=>createTrustedCrmAccount(admin,{...account,ownerId:admin},"forge"+key),
  e=>e instanceof TrustedAccountCreationError&&e.status===400);
 await db.doc("userAccess/"+manager).update({accountState:"Suspended"});
 await assert.rejects(()=>createTrustedCrmAccount(manager,{...account,name:"Suspended",legalBusinessName:"Suspended"},"stop"+key),
  e=>e instanceof TrustedAccountCreationError&&e.status===403);
 assert.equal((await accounts.get()).data().items.length,1);
});
