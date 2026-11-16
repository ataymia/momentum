/* eslint-disable @typescript-eslint/no-require-imports */
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
 pageTrustedOrderIntakes,OrderIntakeError}=require("../lib/trusted-order-intake.js");
const {decideTrustedOrderIntake}=require("../lib/trusted-order-intake-review.js");
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
 await db.doc("userAccess/"+ids.customer).update({email:"buyer-"+suffix+"@example.test"});
 await db.doc("employeeDirectory/"+ids.customer).set({
  role:"Customer",email:"buyer-"+suffix+"@example.test",accountIds:[ids.account],
 });
 const customerReceipt=await submitTrustedOrderIntake(ids.customer,draft,"verifiedCustomer"+key);
 assert.equal(customerReceipt.status,"Needs commercial review");
 const customerRecord=await getTrustedOrderIntake(ids.customer,customerReceipt.intakeId);
 assert.equal(customerRecord.accountId,ids.account);
 assert.equal(customerRecord.requestedByUid,ids.customer);
 assert.equal(customerRecord.totalCases,14);
 assert.equal((await submitTrustedOrderIntake(ids.customer,draft,"verifiedCustomer"+key)).replayed,true);
 await deny(submitTrustedOrderIntake(ids.customer,{...draft,accountId:ids.otherAccount},"crossAccount"+key),403);
 await db.doc("employeeDirectory/"+ids.customer).update({email:"forged-"+suffix+"@example.test"});
 await deny(submitTrustedOrderIntake(ids.customer,draft,"staleCustomer"+key),403);
 await db.doc("employeeDirectory/"+ids.customer).update({email:"buyer-"+suffix+"@example.test"});
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

test("R33 reviewer transitions require an active Admin, verified source, replay safety and no financial writes",async()=>{
 const first=await submitTrustedOrderIntake(ids.rep,draft,"reviewSubmitted"+key);
 const intakeId=first.intakeId;
 const command={
  intakeId,expectedStatus:"Needs commercial review",
  nextStatus:"Pricing and inventory verification",
  reason:"Confirm customer pricing, stock, tax setup and delivery capacity before a sale",
 };
 await deny(decideTrustedOrderIntake(ids.rep,command,"repReview"+key),403);
 await deny(decideTrustedOrderIntake(ids.mgr,command,"mgrReview"+key),403);
 await deny(decideTrustedOrderIntake(ids.suspended,command,"suspendedReview"+key),403);
 await deny(decideTrustedOrderIntake(ids.admin,{...command,paid:true},"forgedReview"+key),400);
 await deny(decideTrustedOrderIntake(ids.admin,{...command,reason:"short"},"shortReview"+key),400);
 const done=await decideTrustedOrderIntake(ids.admin,command,"reviewDecision"+key);
 assert.equal(done.status,"Pricing and inventory verification");
 assert.equal(done.replayed,false);
 const saved=await getTrustedOrderIntake(ids.rep,intakeId);
 assert.equal(saved.status,done.status);
 assert.equal(saved.reviewedBy,ids.admin);
 assert.equal(saved.reviewReason,command.reason);
 const replay=await decideTrustedOrderIntake(ids.admin,command,"reviewDecision"+key);
 assert.equal(replay.replayed,true);
 assert.equal(replay.reviewedAt,done.reviewedAt);
 await deny(decideTrustedOrderIntake(ids.admin,{...command,reason:command.reason+" edited"},"reviewDecision"+key),409);
 await deny(decideTrustedOrderIntake(ids.admin,command,"staleDecision"+key),409);
 const intakeReplay=await submitTrustedOrderIntake(ids.rep,draft,"reviewSubmitted"+key);
 assert.equal(intakeReplay.replayed,true);
 assert.equal(intakeReplay.status,"Pricing and inventory verification");
 const audit=await db.collection("commerceOrderIntakeReviewAudit").where("intakeId","==",intakeId).get();
 assert.equal(audit.size,1);
 assert.equal(audit.docs[0].data().financialPosting,false);
 const returned=await decideTrustedOrderIntake(ids.admin,{
  intakeId,expectedStatus:"Pricing and inventory verification",
  nextStatus:"Needs clarification",reason:"Pricing and supplier stock require current, authorized verification",
 },"returnReview"+key);
 assert.equal(returned.status,"Needs clarification");
 const declined=await decideTrustedOrderIntake(ids.admin,{
  intakeId,expectedStatus:"Needs clarification",nextStatus:"Declined",
  reason:"No binding sale occurred because the buyer did not approve valid terms",
 },"declineReview"+key);
 assert.equal(declined.status,"Declined");
 await deny(decideTrustedOrderIntake(ids.admin,{
  intakeId,expectedStatus:"Declined",nextStatus:"Needs commercial review",
  reason:"Cannot silently reopen a declined intake without a fresh buyer request",
 },"reopenReview"+key),400);
 for(const [path,originalId] of [
  ["domains/commerce/fields/invoices","preserve-invoice-"+suffix],
  ["domains/commerce/fields/payments","preserve-payment-"+suffix],
  ["domains/commercial/fields/orders","preserve-orders-"+suffix],
  ["domains/workspace/fields/inventory","preserve-inventory-"+suffix],
 ]){
  assert.equal((await db.doc(path).get()).data().items[0].id,originalId);
 }
});


test("R33 Administrator source intake pagination does not silently omit older requests",async()=>{
 const recordIds=new Set();
 const batch=db.batch();
 for(let i=0;i<47;i++){
  const id="intake-"+randomUUID();
  recordIds.add(id);
  batch.create(db.doc("commerceOrderIntakes/"+id),{
   id,accountId:ids.account,customerId:"customer-"+suffix,
   requestedByUid:ids.rep,ownerAtSubmission:ids.rep,
   createdAt:new Date(Date.UTC(2026,9,1,0,0,i)).toISOString(),
   status:"Needs commercial review",lines:[],totalCases:1,
   note:"Synthetic pagination test",source:"Isolated emulator seed",
  });
 }
 await batch.commit();
 await deny(pageTrustedOrderIntakes(ids.rep,null),403);
 await deny(pageTrustedOrderIntakes(ids.suspended,null),403);
 await deny(pageTrustedOrderIntakes(ids.admin,"not-valid"),400);
 await deny(pageTrustedOrderIntakes(ids.admin,"intake-"+randomUUID()),409);
 const seen=new Set(),pages=[];
 let cursor=null;
 let count=0;
 do{
  const page=await pageTrustedOrderIntakes(ids.admin,cursor);
  count++;
  assert.equal(page.limit,40);
  assert(page.records.length<=40);
  assert(page.records.every(entry=>!seen.has(entry.id)),
   "Cursor pages must not contain earlier source records");
  for(const entry of page.records)seen.add(entry.id);
  pages.push(page);
  cursor=page.nextCursor;
  assert(count<=10,"Pagination must terminate rather than cycle");
 }while(cursor);
 assert(count>=2);
 assert(pages.at(-1).nextCursor===null);
 for(const id of recordIds)assert(seen.has(id),"Original source request omitted: "+id);
 const first=await pageTrustedOrderIntakes(ids.admin,null);
 const repeated=await pageTrustedOrderIntakes(ids.admin,null);
 assert.deepEqual(repeated.records.map(row=>row.id),first.records.map(row=>row.id));
 assert.equal(repeated.nextCursor,first.nextCursor);
});
