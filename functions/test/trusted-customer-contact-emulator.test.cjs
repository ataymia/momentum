/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("Customer contact tests require the Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {createTrustedCrmAccount}=require("../lib/trusted-account-creation.js");
const {updateTrustedCustomerContacts,CustomerContactUpdateError}=
 require("../lib/trusted-customer-contact.js");
const suffix=randomUUID().replaceAll("-","").slice(0,14);
const admin="crm-contact-admin-"+suffix;
const manager="crm-contact-manager-"+suffix;
const rep="crm-contact-rep-"+suffix;
const outsider="crm-contact-outsider-"+suffix;
const suspended="crm-contact-suspended-"+suffix;
const key="crmContact"+suffix+"abcdefghijklmn";
const name="QA Wholesale Contact "+suffix;
const account={
 name,legalBusinessName:name,customerName:name,locationName:"QA Place",
 location:"Phoenix, AZ",channel:"Independent retail",
 contactName:"Synthetic Buyer",contactRole:"Buyer",phone:"6025550199",
 postalCode:"85001",streetAddress:"900 Synthetic Ave",
 deliveryAddressSameAsBusiness:true,taxDocumentType:"Undetermined",
};
const rejected=(p,status)=>assert.rejects(p,e=>
 e instanceof CustomerContactUpdateError&&e.status===status);
after(async()=>deleteApp(app));
test("R18 contact updates: full source revision, strict group scope, clean audit, and no tax/credit promises",async()=>{
 const accountsRef=db.doc("domains/workspace/fields/accounts");
 const customersRef=db.doc("domains/workspace/fields/customers");
 const activitiesRef=db.doc("domains/workspace/fields/activities");
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+manager).set({role:"Sales Manager",accountState:"Active"}),
  db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active",managerId:manager,team:"Sales"}),
  db.doc("userAccess/"+outsider).set({role:"Sales Representative",accountState:"Active",managerId:"someone-else",team:"Sales"}),
  db.doc("userAccess/"+suspended).set({role:"Administrator",accountState:"Suspended"}),
  accountsRef.set({items:[]}),customersRef.set({items:[]}),activitiesRef.set({items:[]}),
 ]);
 const created=await createTrustedCrmAccount(manager,account,"create"+key);
 const original=(await accountsRef.get()).data().items.find(a=>a.id===created.accountId);
 assert(original);
 const groupId=original.customerId;
 const payload={accountId:created.accountId,customerId:groupId,expectedRevision:0,
  patch:{billingContactName:"Jane Test",
   billingEmail:"billing@example.test",
   accountsPayableContactName:"QA Accounts Payable",
   accountsPayableEmail:"ap@example.test",
   onboardingPackageStatus:"Prepared"},
 };
 const receipt=await updateTrustedCustomerContacts(manager,payload,key);
 assert.equal(receipt.replayed,false);
 assert.equal(receipt.revision,1);
 assert.equal(receipt.customerId,groupId);
 const actual=(await customersRef.get()).data().items.find(c=>c.id===groupId);
 assert.equal(actual.contactRevision,1);
 assert.equal(actual.billingContactName,"Jane Test");
 assert.equal(actual.accountsPayableEmail,"ap@example.test");
 assert.equal(actual.onboardingPackageStatus,"Prepared");
 assert(actual.onboardingPackagePreparedAt);
 assert.equal(actual.onboardingPackagePreparedBy,manager);
 assert.equal(actual.creditStatus,undefined);
 assert.equal(actual.ein,"");
 assert.equal(actual.taxDocumentType,"Undetermined");
 assert.equal(actual.legalBusinessName,name);
 assert.equal((await activitiesRef.get()).data().items.length,2);
 const events=await db.collection("customerContactUpdateAudit").get();
 assert.equal(events.docs.length,1);
 const ev=events.docs[0].data();
 assert.equal(ev.actorUid,manager);
 assert.equal(ev.beforeRevision,0);
 assert.equal(ev.afterRevision,1);
 assert.equal(ev.legalVerified,false);
 assert.equal(ev.creditApproved,false);
 assert(!("billingEmail" in ev));
 assert(!("taxDocument" in ev));
 const replay=await updateTrustedCustomerContacts(manager,payload,key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.revision,1);
 assert.equal((await db.collection("customerContactUpdateAudit").get()).docs.length,1);
 await rejected(updateTrustedCustomerContacts(manager,{...payload,expectedRevision:1},key),409);
 await rejected(updateTrustedCustomerContacts(manager,payload,"again"+key),409);
 await rejected(updateTrustedCustomerContacts(manager,{
  ...payload,expectedRevision:1,
  patch:{billingContactName:"Updated",ein:"12-3456789"},
 },"forged"+key),400);
 await rejected(updateTrustedCustomerContacts(manager,{
  ...payload,expectedRevision:1,patch:{creditStatus:"Net 30 Approved"},
 },"credit"+key),400);
 await rejected(updateTrustedCustomerContacts(manager,{
  ...payload,expectedRevision:1,patch:{onboardingPackageStatus:"Complete"},
 },"signed"+key),400);
 await rejected(updateTrustedCustomerContacts(rep,{
  ...payload,expectedRevision:1,patch:{billingPhone:"6025550100"},
 },"rep"+key),403);
 await rejected(updateTrustedCustomerContacts(suspended,{
  ...payload,expectedRevision:1,patch:{billingPhone:"6025550100"},
 },"suspended"+key),403);
 // A newly shared location outside this manager's team is a boundary.
 const snap=await accountsRef.get();
 await accountsRef.set({items:[...snap.data().items,{
  ...original,id:"acc-other-"+suffix,ownerId:outsider,createdAt:new Date().toISOString(),
 }]});
 await rejected(updateTrustedCustomerContacts(manager,{
  ...payload,expectedRevision:1,patch:{billingPhone:"6025550100"},
 },"outside"+key),403);
 const adminResult=await updateTrustedCustomerContacts(admin,{
  ...payload,expectedRevision:1,patch:{billingPhone:"6025550100"},
 },"admin"+key);
 assert.equal(adminResult.revision,2);
 const stable=(await customersRef.get()).data().items.find(c=>c.id===groupId);
 assert.equal(stable.billingPhone,"6025550100");
 assert.equal(stable.contactRevision,2);
 // A contact-only edit cannot change a source package that has already
 // reached an externally reviewed state, even when an Administrator calls it.
 await customersRef.set({items:(await customersRef.get()).data().items.map(c=>
  c.id===groupId?{...c,onboardingPackageStatus:"Complete"}:c)});
 await rejected(updateTrustedCustomerContacts(admin,{
  ...payload,expectedRevision:2,
  patch:{onboardingPackageStatus:"Prepared"},
 },"downgrade"+key),409);
 const contactAfterVerification=await updateTrustedCustomerContacts(admin,{
  ...payload,expectedRevision:2,
  patch:{billingEmail:"verified-contacts@example.test"},
 },"safeEdit"+key);
 assert.equal(contactAfterVerification.revision,3);
 const verified=(await customersRef.get()).data().items.find(c=>c.id===groupId);
 assert.equal(verified.onboardingPackageStatus,"Complete");
 assert.equal(verified.billingEmail,"verified-contacts@example.test");
});
