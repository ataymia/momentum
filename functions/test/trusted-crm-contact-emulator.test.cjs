/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("CRM contact tests require isolated Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {saveTrustedCrmContact,TrustedCrmContactError}=
 require("../lib/trusted-crm-contact.js");
const suffix=randomUUID().replaceAll("-","").slice(0,12);
const ids={admin:"contact-admin-"+suffix,mgr:"contact-manager-"+suffix,
 rep:"contact-rep-"+suffix,other:"contact-other-"+suffix,
 customer:"contact-customer-"+suffix,account:"contact-account-"+suffix,
 foreign:"contact-foreign-"+suffix};
const key="contactTestIdempotency-"+suffix;
const draft={action:"Create",locationId:ids.account,contactId:"",
 expectedRevision:0,contact:{name:"Jordan Buyer",role:"Beverage buyer",
 email:"jordan@example.test",phone:"602-555-0123",
 decisionRole:"Decision maker",active:true}};
const deny=(p,status)=>assert.rejects(p,
 e=>e instanceof TrustedCrmContactError&&e.status===status);
after(async()=>{await deleteApp(app);});

test("connected contacts enforce tenant ownership, idempotent writes and revision integrity",async()=>{
 const contacts=db.doc("domains/crm/fields/contacts");
 const orders=db.doc("domains/commercial/fields/orders");
 await Promise.all([
  db.doc("userAccess/"+ids.admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+ids.mgr).set({role:"Sales Manager",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.rep).set({role:"Sales Representative",accountState:"Active",team:"Sales",managerId:ids.mgr}),
  db.doc("userAccess/"+ids.other).set({role:"Sales Representative",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.customer).set({role:"Customer",accountState:"Active"}),
  db.doc("domains/workspace/fields/accounts").set({items:[
   {id:ids.account,customerId:"customer-"+suffix,ownerId:ids.rep,contactName:"Primary Buyer"},
   {id:ids.foreign,customerId:"foreign-"+suffix,ownerId:ids.other},
  ]}),
  contacts.set({items:[]}),
  orders.set({items:[{id:"unchanged-orders-"+suffix}]}),
 ]);
 await deny(saveTrustedCrmContact(ids.other,draft,"foreign"+key),403);
 await deny(saveTrustedCrmContact(ids.customer,draft,"customer"+key),403);
 await deny(saveTrustedCrmContact(ids.rep,{...draft,locationId:ids.foreign},"foreign2"+key),403);
 await deny(saveTrustedCrmContact(ids.rep,{...draft,contact:{...draft.contact,paid:true}},"paid"+key),400);
 const receipt=await saveTrustedCrmContact(ids.rep,draft,"create"+key);
 assert.equal(receipt.replayed,false);
 assert.equal(receipt.revision,1);
 const original=(await contacts.get()).data().items[0];
 assert.equal(original.id,receipt.contactId);
 assert.equal(original.createdBy,ids.rep);
 assert.equal(original.scope,"Location");
 assert.equal(original.primary,false);
 const again=await saveTrustedCrmContact(ids.rep,draft,"create"+key);
 assert.equal(again.replayed,true);
 assert.equal(again.contactId,receipt.contactId);
 assert.equal((await contacts.get()).data().items.length,1);
 await deny(saveTrustedCrmContact(ids.rep,{...draft,contact:{...draft.contact,name:"Other Contact"}},"create"+key),409);
 await deny(saveTrustedCrmContact(ids.rep,draft,"duplicate"+key),409);
 const update={...draft,action:"Update",contactId:receipt.contactId,
  expectedRevision:1,contact:{...draft.contact,role:"Purchasing Director",active:false}};
 const changed=await saveTrustedCrmContact(ids.mgr,update,"update"+key);
 assert.equal(changed.revision,2);
 assert.equal((await contacts.get()).data().items[0].role,"Purchasing Director");
 await deny(saveTrustedCrmContact(ids.rep,update,"stale"+key),409);
 await deny(saveTrustedCrmContact(ids.other,update,"foreignUpdate"+key),403);
 await deny(saveTrustedCrmContact(ids.rep,{...update,contactId:"contact-unknown"},"unknown"+key),404);
 assert.equal((await orders.get()).data().items[0].id,"unchanged-orders-"+suffix);
 const audit=await db.collection("crmContactAudit").where("contactId","==",receipt.contactId).get();
 assert.equal(audit.size,2);
 assert(audit.docs.every(doc=>doc.data().financialPosting===false));
});
