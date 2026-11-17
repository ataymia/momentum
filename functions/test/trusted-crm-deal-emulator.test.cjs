/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("Deals test requires isolated Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"}),db=getFirestore(app);
const {saveTrustedCrmDeal,TrustedCrmDealError}=require("../lib/trusted-crm-deal.js");
const suffix=randomUUID().replaceAll("-","").slice(0,12);
const ids={admin:"deal-admin-"+suffix,mgr:"deal-manager-"+suffix,rep:"deal-rep-"+suffix,
 other:"deal-other-"+suffix,customer:"deal-customer-"+suffix,
 account:"deal-account-"+suffix,foreign:"deal-foreign-"+suffix};
const key="dealIdempotencyRequest-"+suffix;
const draft={action:"Create",locationId:ids.account,dealId:"",expectedRevision:0,
 details:{name:"Arizona Independent Retail Launch",stage:"Qualified",
 estimatedCases:20,expectedCloseDate:"2026-12-15",nextAction:"Call the buyer",
 nextActionDate:"2026-12-01",lossReason:""}};
const deny=(p,status)=>assert.rejects(p,
 e=>e instanceof TrustedCrmDealError&&e.status===status);
after(async()=>{await deleteApp(app);});
test("server deals enforce tenant, revisions, idempotency and zero financial writes",async()=>{
 const opportunities=db.doc("domains/crm/fields/opportunities");
 const orders=db.doc("domains/commercial/fields/orders");
 const payments=db.doc("domains/commerce/fields/payments");
 await Promise.all([
  db.doc("userAccess/"+ids.admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+ids.mgr).set({role:"Sales Manager",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.rep).set({role:"Sales Representative",accountState:"Active",team:"Sales",managerId:ids.mgr}),
  db.doc("userAccess/"+ids.other).set({role:"Sales Representative",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.customer).set({role:"Customer",accountState:"Active"}),
  db.doc("domains/workspace/fields/accounts").set({items:[
   {id:ids.account,customerId:"customer-"+suffix,ownerId:ids.rep},
   {id:ids.foreign,customerId:"foreign-"+suffix,ownerId:ids.other},
  ]}),
  opportunities.set({items:[]}),
  orders.set({items:[{id:"preserve-order-"+suffix}]}),
  payments.set({items:[{id:"preserve-payment-"+suffix}]}),
 ]);
 await deny(saveTrustedCrmDeal(ids.other,draft,"other"+key),403);
 await deny(saveTrustedCrmDeal(ids.customer,draft,"customer"+key),403);
 await deny(saveTrustedCrmDeal(ids.rep,{...draft,locationId:ids.foreign},"foreign"+key),403);
 await deny(saveTrustedCrmDeal(ids.rep,{...draft,details:{...draft.details,paid:true}},"paid"+key),400);
 await deny(saveTrustedCrmDeal(ids.rep,{...draft,details:{...draft.details,stage:"Won"}},"won"+key),400);
 const receipt=await saveTrustedCrmDeal(ids.rep,draft,"create"+key);
 assert.equal(receipt.revision,1);
 assert.equal(receipt.replayed,false);
 const saved=(await opportunities.get()).data().items[0];
 assert.equal(saved.id,receipt.dealId);
 assert.equal(saved.customerId,"customer-"+suffix);
 assert.equal(saved.ownerId,ids.rep);
 assert.equal(saved.status,"Open");
 assert.equal((await saveTrustedCrmDeal(ids.rep,draft,"create"+key)).replayed,true);
 await deny(saveTrustedCrmDeal(ids.rep,{...draft,details:{...draft.details,name:"Different deal"}},"create"+key),409);
 const closed={...draft,action:"Update",dealId:receipt.dealId,expectedRevision:1,
  details:{...draft.details,stage:"Won",nextAction:"",nextActionDate:""}};
 const second=await saveTrustedCrmDeal(ids.mgr,closed,"close"+key);
 assert.equal(second.revision,2);
 assert.equal((await opportunities.get()).data().items[0].status,"Won");
 await deny(saveTrustedCrmDeal(ids.rep,closed,"stale"+key),409);
 await deny(saveTrustedCrmDeal(ids.rep,{...closed,expectedRevision:2,details:{...draft.details,stage:"Qualified"}},"reopen"+key),409);
 assert.equal((await orders.get()).data().items[0].id,"preserve-order-"+suffix);
 assert.equal((await payments.get()).data().items[0].id,"preserve-payment-"+suffix);
 const audits=await db.collection("crmDealAudit").where("dealId","==",receipt.dealId).get();
 assert.equal(audits.size,2);
 assert(audits.docs.every(x=>x.data().financialPosting===false&&x.data().inventoryPosting===false));
});
