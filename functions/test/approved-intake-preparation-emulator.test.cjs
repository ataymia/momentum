/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";
const {test,after}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error("Requires isolated Firestore emulator.");
const app=initializeApp({projectId:"momentum-rules-test"});
const db=getFirestore(app);
const {submitTrustedOrderIntake}=require("../lib/trusted-order-intake.js");
const {decideTrustedOrderIntake}=require("../lib/trusted-order-intake-review.js");
const {prepareTrustedApprovedIntake}=require("../lib/trusted-order-intake-preparation.js");
const tag=randomUUID().slice(0,10);
const admin="qa-prep-admin-"+tag,rep="qa-prep-rep-"+tag;
const account="qa-prep-account-"+tag,customer="qa-prep-customer-"+tag;
const key=(v)=>"qa-prep-"+v+"-"+tag+"-abcxyz1234";
const items=async(path)=>(await db.doc(path).get()).data()?.items??[];
after(async()=>{await deleteApp(app);});
async function setup(){
 await Promise.all([
  db.doc("userAccess/"+admin).set({role:"Administrator",accountState:"Active"}),
  db.doc("userAccess/"+rep).set({role:"Sales Representative",accountState:"Active",team:"Sales"}),
  db.doc("employeeDirectory/"+rep).set({id:rep,name:"QA Field Rep",role:"Sales Representative"}),
  db.doc("domains/workspace/fields/accounts").set({items:[{id:account,name:"QA Business",ownerId:rep,customerId:customer,stage:"Qualified"}]}),
  db.doc("domains/workspace/fields/customers").set({items:[{id:customer,name:"QA Customer",paymentTerms:"COD"}]}),
  db.doc("domains/commercial/fields/orders").set({items:[]}),
  db.doc("domains/commerce/fields/invoices").set({items:[]}),
  db.doc("domains/commerce/fields/payments").set({items:[]}),
  db.doc("domains/workspace/fields/inventory").set({items:[]}),
 ]);
}
const draft=(cases)=>({accountId:account,note:"QA end-to-end business request",lines:[
 {skuId:"ge-original-250ml-24",cases}]});
const submit=async(name,cases)=>(
 await submitTrustedOrderIntake(rep,draft(cases),key(name))
).intakeId;
const approve=async(name,id)=>decideTrustedOrderIntake(admin,{
 intakeId:id,expectedStatus:"Needs commercial review",expectedRevision:0,nextStatus:"Approved",reason:""
},key("approve-"+name));
test("Existing approved request stays recoverable; one manual confirmation prepares only one order and internal draft invoice",async()=>{
 await setup();
 const id=await submit("old",12);
 const approval=await approve("old",id);
 assert.equal(approval.status,"Approved");
 assert.equal(approval.preparationStatus,"Needs pricing");
 assert.equal((await items("domains/commercial/fields/orders")).length,0);
 assert.equal((await items("domains/commerce/fields/invoices")).length,0);
 const manual={pricePerCase:27.5,terms:"COD",priceEvidence:"Approved buyer price agreement QA-2026"};
 await assert.rejects(()=>prepareTrustedApprovedIntake(rep,id,manual),e=>e.status===403);
 await assert.rejects(()=>prepareTrustedApprovedIntake(admin,id,{...manual,pricePerCase:0}),e=>e.status===400);
 const prepared=await prepareTrustedApprovedIntake(admin,id,manual);
 assert.equal(prepared.status,"Prepared");
 assert(prepared.orderId&&prepared.invoiceId);
 const [orders,invoices]=await Promise.all([
  items("domains/commercial/fields/orders"),items("domains/commerce/fields/invoices")
 ]);
 assert.equal(orders.length,1);assert.equal(invoices.length,1);
 assert.equal(orders[0].sourceIntakeId,id);
 assert.equal(orders[0].cases,12);
 assert.equal(orders[0].amount,330);
 assert.equal(orders[0].ownerId,rep);
 assert.equal(orders[0].paymentStatus,"Not invoiced");
 assert.equal(orders[0].status,"Approved");
 assert.equal(orders[0].inventoryAvailableAtOrder,0);
 assert.equal(invoices[0].sourceIntakeId,id);
 assert.equal(invoices[0].status,"Draft");
 assert.equal(invoices[0].total,330);
 assert.equal(invoices[0].linesSnapshot[0].amount,330);
 assert.equal(invoices[0].orderId,orders[0].id);
 assert.equal((await items("domains/commerce/fields/payments")).length,0);
 assert.equal((await items("domains/workspace/fields/inventory")).length,0);
 const replay=await prepareTrustedApprovedIntake(admin,id,manual);
 assert.equal(replay.replayed,true);
 assert.equal((await items("domains/commercial/fields/orders")).length,1);
 assert.equal((await items("domains/commerce/fields/invoices")).length,1);
 const saved=(await db.doc("commerceOrderIntakes/"+id).get()).data();
 assert.equal(saved.orderId,orders[0].id);
 assert.equal(saved.invoiceId,invoices[0].id);
 assert.equal(saved.preparationStatus,"Prepared");
});
test("Active documented price and COD automatically create linked order/invoice when approved",async()=>{
 await db.doc("domains/commercial/fields/_root").set({data:{
  accountPatches:{[account]:{programPricePerCase:24,programPricingStatus:"Active",programPricingLabel:"Owner approved QA program"}},
 }});
 const id=await submit("auto",10);
 const result=await approve("auto",id);
 assert.equal(result.preparationStatus,"Prepared");
 const order=(await items("domains/commercial/fields/orders")).find(o=>o.sourceIntakeId===id);
 const invoice=(await items("domains/commerce/fields/invoices")).find(i=>i.sourceIntakeId===id);
 assert(order&&invoice);
 assert.equal(order.amount,240);
 assert.equal(invoice.total,240);
 assert.equal(invoice.status,"Draft");
 assert.equal(order.status,"Approved");
 assert.equal(result.orderId,order.id);
 assert.equal(result.invoiceId,invoice.id);
});
test("Malformed source quantity and unsupported credit terms cannot silently generate invoices",async()=>{
 await db.doc("domains/commercial/fields/_root").set({data:{}});
 await db.doc("domains/workspace/fields/customers").set({items:[{id:customer,name:"QA Customer",paymentTerms:"Net 30",creditStatus:"Pending"}]});
 const id=await submit("no-credit",9);
 const approved=await approve("no-credit",id);
 assert.equal(approved.preparationStatus,"Needs pricing");
 const manual={pricePerCase:24,terms:"Net 30",priceEvidence:"QA unauthorised net terms"};
 await assert.rejects(()=>prepareTrustedApprovedIntake(admin,id,manual),e=>e.status===409);
 const receipt={pricePerCase:24,terms:"COD",priceEvidence:"QA confirmed payment before delivery"};
 assert.equal((await prepareTrustedApprovedIntake(admin,id,receipt)).status,"Prepared");
 const duplicate=(await items("domains/commerce/fields/invoices")).filter(i=>i.sourceIntakeId===id);
 assert.equal(duplicate.length,1);
});
