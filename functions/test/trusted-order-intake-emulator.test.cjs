"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {randomUUID}=require("node:crypto");
if(!process.env.FIRESTORE_EMULATOR_HOST)
 throw new Error("Order intake tests require an isolated Firestore emulator");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {submitTrustedOrderIntake,getTrustedOrderIntake,listTrustedOrderIntakes,
 OrderIntakeError}=require("../lib/trusted-order-intake.js");
const suffix=randomUUID().replaceAll("-","").slice(0,14);
const ids={
 admin:"qa-intake-admin-"+suffix,mgr:"qa-intake-mgr-"+suffix,
 mgrOther:"qa-intake-other-mgr-"+suffix,rep:"qa-intake-rep-"+suffix,
 repOther:"qa-intake-other-rep-"+suffix,
 customer:"qa-intake-customer-"+suffix,suspended:"qa-intake-suspended-"+suffix,
 account:"qa-intake-account-"+suffix,otherAccount:"qa-intake-other-account-"+suffix,
};
const key="intakeKey"+suffix+"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const draft={accountId:ids.account,lines:[
 {skuId:"ge-original-250ml-24",cases:10},
 {skuId:"ge-tropical-250ml-24",cases:4},
],note:"Retail buyer asked for case quantities only"};
const deny=(call,status)=>assert.rejects(call,
 error=>error instanceof OrderIntakeError&&error.status===status);
after(async()=>{await deleteApp(app);});

test("R33 source-bound nonbinding intake, role isolation, idempotency and no financial writes",async()=>{
 const accounts=db.doc("domains/workspace/fields/accounts");
 const orders=db.doc("domains/commercial/fields/orders");
 const invoices=db.doc("domains/commerce/fields/invoices");
 const payments=db.doc("domains/commerce/fields/payments");
 const inventory=db.doc("domains/workspace/fields/inventory");
 await Promise.all([
  db.doc("userAccess/"+ids.admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+ids.mgr).set({role:"Sales Manager",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.mgrOther).set({role:"Sales Manager",accountState:"Active",team:"Sales"}),
  db.doc("userAccess/"+ids.rep).set({role:"Sales Representative",accountState:"Active",team:"Sales",managerId:ids.mgr}),
  db.doc("userAccess/"+ids.repOther).set({role:"Sales Representative",accountState:"Active",team:"Sales",managerId:ids.mgrOther}),
  db.doc("userAccess/"+ids.customer).set({role:"Customer",accountState:"Active"}),
  db.doc("userAccess/"+ids.suspended).set({role:"Administrator",accountState:"Suspended"}),
  accounts.set({items:[{id:ids.account,ownerId:ids.rep,customerId:"customer-"+suffix,stage:"Qualified"},
   {id:ids.otherAccount,ownerId:ids.repOther,stage:"Prospect"}]}),
  orders.set({items:[{id:"preserve-orders-"+suffix}]}),
  invoices.set({items:[{id:"preserve-invoice-"+suffix}]}),
  payments.set({items:[{id:"preserve-payment-"+suffix}]}),
  inventory.set({items:[{id:"preserve-inventory-"+suffix}]}),
 ]);
 const receipt=await submitTrustedOrderIntake(ids.rep,draft,key);
 assert.equal(receipt.replayed,false);
 assert.equal(receipt.status,"Needs commercial review");
 const record=await getTrustedOrderIntake(ids.rep,receipt.intakeId);
 assert.equal(record.requestedByUid,ids.rep);
 assert.equal(record.ownerAtSubmission,ids.rep);
 assert.equal(record.customerId,"customer-"+suffix);
 assert.equal(record.totalCases,14);
 assert.equal(record.lines[0].casePack,24);
 assert.equal(record.note,draft.note);
 assert(!("amount" in record)&&!("unitPrice" in record)&&!("paymentStatus" in record));
 assert.equal((await db.doc("commerceOrderIntakeAudit/"+receipt.intakeId).get()).data().actorUid,ids.rep);
 const replay=await submitTrustedOrderIntake(ids.rep,draft,key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.intakeId,receipt.intakeId);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,note:"Changed note"},key),409);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,pricePerCase:24},"forgedPrice"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,paid:true},"forgedPaid"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,lines:[{skuId:"fake-sku",cases:10}]},"fakeSku"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,lines:[{skuId:"ge-original-250ml-24",cases:0}]},"zero"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,lines:[{skuId:"ge-original-250ml-24",cases:1.4}]},"decimal"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,lines:[{skuId:"ge-original-250ml-24",cases:1},
  {skuId:"ge-original-250ml-24",cases:1}]},"duplicate"+key),400);
 await deny(submitTrustedOrderIntake(ids.rep,{...draft,accountId:ids.otherAccount},"other"+key),403);
 await deny(submitTrustedOrderIntake(ids.mgr,{...draft,accountId:ids.otherAccount},"otherMgr"+key),403);
 await deny(submitTrustedOrderIntake(ids.customer,draft,"customer"+key),403);
 await deny(submitTrustedOrderIntake(ids.suspended,draft,"suspended"+key),403);
 await deny(getTrustedOrderIntake(ids.repOther,receipt.intakeId),403);
 await deny(listTrustedOrderIntakes(ids.rep),403);
 const queue=await listTrustedOrderIntakes(ids.admin);
 assert(queue.some(x=>x.id===receipt.intakeId));
 const manager=await submitTrustedOrderIntake(ids.mgr,draft,"manager"+key);
 assert.equal(manager.replayed,false);
 const admin=await submitTrustedOrderIntake(ids.admin,{...draft,accountId:ids.otherAccount},"admin"+key);
 assert.equal(admin.replayed,false);
 assert.equal((await orders.get()).data().items[0].id,"preserve-orders-"+suffix);
 assert.equal((await invoices.get()).data().items[0].id,"preserve-invoice-"+suffix);
 assert.equal((await payments.get()).data().items[0].id,"preserve-payment-"+suffix);
 assert.equal((await inventory.get()).data().items[0].id,"preserve-inventory-"+suffix);
 assert.equal((await accounts.get()).data().items[0].stage,"Qualified");
});
