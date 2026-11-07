import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyPurchaseAction,billDueCents,emptyPurchasingState,poStatus,receivedCases,threeWayMatch,type PurchaseAction,type PurchaseActor,type PurchasingState} from "../lib/purchasing-review";
const admin:PurchaseActor={id:"admin-a",role:"Administrator"};
const otherAdmin:PurchaseActor={id:"admin-b",role:"Administrator"};
const operations:PurchaseActor={id:"ops-a",role:"Operations"};
const warehouse:PurchaseActor={id:"warehouse-a",role:"Warehouse"};
const unauthorized:PurchaseActor={id:"sales-a",role:"Other"};
const clock="2026-11-06T18:00:00Z";
const act=(state:PurchasingState,actor:PurchaseActor,action:PurchaseAction)=>applyPurchaseAction(state,actor,action,clock);
function success(s:PurchasingState,actor:PurchaseActor,action:PurchaseAction){
  const result=act(s,actor,action);
  assert.equal(result.ok,true,result.message);
  return result.state;
}
const vendor=()=>({kind:"vendor.add",name:"Illustrative demo-only vendor",contact:"No actual contact"} as const);
const po=(vendorId:string)=>({kind:"po.create",vendorId,sku:"ge-original-250ml-24",cases:10,unitCostCents:1600,warehouse:"Illustrative local warehouse",expectedDate:"2026-11-30"} as const);
function approvedPurchase(){
  let s=emptyPurchasingState();
  s=success(s,admin,vendor());
  s=success(s,operations,po(s.vendors[0].id));
  const id=s.orders[0].id;
  s=success(s,operations,{kind:"po.submit",id});
  s=success(s,admin,{kind:"po.approve",id});
  return s;
}
const receipt=(poId:string,cases:number)=>({kind:"receipt.record",poId,cases,lotCode:"ILLUSTRATIVE-LOT",bestBy:"2027-11-30",warehouse:"Illustrative local warehouse"} as const);
const bill=(poId:string,cases:number,amountCents:number,reference="DEMO-INVOICE")=>({kind:"bill.record",poId,invoiceNumber:reference,cases,amountCents} as const);
test("empty state has no invented suppliers, payables or posted stock",()=>{
  const s=emptyPurchasingState();
  assert.equal(s.vendors.length,0);assert.equal(s.orders.length,0);assert.equal(s.audit.length,0);
});
test("vendor creation requires admin and rejects duplicate names",()=>{
  const s=emptyPurchasingState();
  assert.equal(act(s,operations,vendor()).ok,false);
  const next=success(s,admin,vendor());
  assert.equal(act(next,admin,{...vendor(),name:"illustrative demo-only vendor"}).ok,false);
});
test("purchase order requires verified vendor, positive quantities and cost",()=>{
  const s=emptyPurchasingState();
  assert.equal(act(s,operations,po("missing")).ok,false);
  const withVendor=success(s,admin,vendor());
  assert.equal(act(withVendor,operations,{...po(withVendor.vendors[0].id),cases:0}).ok,false);
  assert.equal(act(withVendor,operations,{...po(withVendor.vendors[0].id),sku:"unregistered-product"}).ok,false);
  assert.equal(act(withVendor,operations,{...po(withVendor.vendors[0].id),unitCostCents:1.5}).ok,false);
  assert.equal(act(withVendor,operations,{...po(withVendor.vendors[0].id),expectedDate:"2026-02-30"}).ok,false);
  assert.equal(act(withVendor,operations,{...po(withVendor.vendors[0].id),cases:9007199254740991}).ok,false);
});
test("purchase approvals enforce submit and independent approver",()=>{
  let s=success(emptyPurchasingState(),admin,vendor());
  s=success(s,admin,po(s.vendors[0].id));
  assert.equal(act(s,admin,{kind:"po.approve",id:s.orders[0].id}).ok,false);
  s=success(s,admin,{kind:"po.submit",id:s.orders[0].id});
  assert.equal(act(s,admin,{kind:"po.approve",id:s.orders[0].id}).ok,false);
  assert.equal(act(s,warehouse,{kind:"po.approve",id:s.orders[0].id}).ok,false);
  s=success(s,otherAdmin,{kind:"po.approve",id:s.orders[0].id});
  assert.equal(poStatus(s,s.orders[0]),"Approved");
});
test("transitions do not mutate original state or fabricate ledger postings",()=>{
  const s=approvedPurchase();
  const original=JSON.stringify(s);
  const next=success(s,warehouse,receipt(s.orders[0].id,4));
  assert.equal(JSON.stringify(s),original);
  assert.equal(receivedCases(s,s.orders[0].id),0);
  assert.equal(receivedCases(next,next.orders[0].id),4);
  assert.equal(next.receipts[0].inventoryPosted,false);
  assert.equal(poStatus(next,next.orders[0]),"Partially received");
});
test("receiving rejects unapproved, excess and wrong-location cases",()=>{
  const s=approvedPurchase();
  const pid=s.orders[0].id;
  assert.equal(act(s,warehouse,{...receipt(pid,1),warehouse:"Different warehouse"}).ok,false);
  assert.equal(act(s,warehouse,receipt(pid,11)).ok,false);
  assert.equal(act(s,unauthorized,receipt(pid,1)).ok,false);
  const next=success(s,warehouse,receipt(pid,10));
  assert.equal(poStatus(next,next.orders[0]),"Received");
  assert.equal(act(next,warehouse,receipt(pid,1)).ok,false);
});
test("bill requires unique vendor invoice and quantities inside PO",()=>{
  const s=approvedPurchase();const id=s.orders[0].id;
  assert.equal(act(s,operations,bill(id,5,8000)).ok,false);
  assert.equal(act(s,admin,bill(id,11,17600)).ok,false);
  const next=success(s,admin,bill(id,5,8000));
  assert.equal(act(next,admin,bill(id,3,4800,"demo-invoice")).ok,false);
  assert.equal(act(next,admin,bill(id,6,9600,"another")).ok,false);
});
test("bill approval blocked until three-way match including exact unit price",()=>{
  let s=approvedPurchase();const id=s.orders[0].id;
  s=success(s,admin,bill(id,5,8500));
  assert.equal(threeWayMatch(s,s.bills[0]).matched,false);
  assert.equal(act(s,otherAdmin,{kind:"bill.approve",id:s.bills[0].id}).ok,false);
  s=success(s,warehouse,receipt(id,5));
  assert.equal(threeWayMatch(s,s.bills[0]).varianceCents,500);
  assert.equal(act(s,otherAdmin,{kind:"bill.approve",id:s.bills[0].id}).ok,false);
});
test("matched bill can be independently approved, paid and credited without transferring money",()=>{
  let s=approvedPurchase();const id=s.orders[0].id;
  s=success(s,warehouse,receipt(id,10));
  s=success(s,admin,bill(id,10,16000));
  assert.equal(threeWayMatch(s,s.bills[0]).matched,true);
  assert.equal(act(s,admin,{kind:"bill.approve",id:s.bills[0].id}).ok,false);
  s=success(s,otherAdmin,{kind:"bill.approve",id:s.bills[0].id});
  const billId=s.bills[0].id;
  assert.equal(billDueCents(s,s.bills[0]),16000);
  assert.equal(act(s,admin,{kind:"payment.record",billId,reference:"DEMO-PAY",amountCents:17000}).ok,false);
  s=success(s,admin,{kind:"payment.record",billId,reference:"DEMO-PAY",amountCents:6000});
  assert.equal(s.payments[0].externalSettlementVerified,false);
  assert.equal(billDueCents(s,s.bills[0]),16000,"Unverified payment notes must not lower real payable.");
  assert.equal(act(s,admin,{kind:"payment.record",billId,reference:"demo-pay",amountCents:100}).ok,false);
  assert.equal(act(s,admin,{kind:"credit.record",billId,reference:"DEMO-CREDIT",reason:"Illustrative adjustment",amountCents:11000}).ok,false);
  s=success(s,admin,{kind:"credit.record",billId,reference:"DEMO-CREDIT",reason:"Illustrative adjustment",amountCents:10000});
  assert.equal(billDueCents(s,s.bills[0]),16000,"Unreviewed vendor credits cannot lower payable.");
  assert.equal(act(s,admin,{kind:"credit.approve",id:s.credits[0].id}).ok,false);
  s=success(s,otherAdmin,{kind:"credit.approve",id:s.credits[0].id});
  assert.equal(billDueCents(s,s.bills[0]),6000);
  assert.equal(act(s,admin,{kind:"payment.record",billId,reference:"LATE",amountCents:100}).ok,false);
});
test("expenses need independent sign-off and preserve a who/what/when audit trail",()=>{
  let s=success(emptyPurchasingState(),operations,{kind:"expense.record",description:"Illustrative warehouse tape",amountCents:1200});
  assert.equal(act(s,operations,{kind:"expense.approve",id:s.expenses[0].id}).ok,false);
  s=success(s,admin,{kind:"expense.approve",id:s.expenses[0].id});
  assert.equal(s.audit.length,2);
  assert.equal(s.audit[1].recordId,s.expenses[0].id);
  assert.equal(s.audit[1].actorId,admin.id);
  assert.equal(s.audit[1].at,clock);
});
test("approval and receipt references do not allow cancellation of posted purchasing history",()=>{
  const s=approvedPurchase();
  const next=success(s,warehouse,receipt(s.orders[0].id,1));
  assert.equal(act(next,admin,{kind:"po.cancel",id:next.orders[0].id}).ok,false);
});
test("purchasing is gated to isolated demo and route-specific roles",()=>{
  const view=readFileSync("components/prototype/purchasing-experience.tsx","utf8");
  const routes=readFileSync("lib/navigation-route-registry.ts","utf8");
  assert.match(view,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"&&!firebaseSession/);
  assert.match(view,/useFirebaseSessionOptional/);
  assert.match(view,/useSyncExternalStore\(subscribeBrowser,clientSnapshot,serverSnapshot\)/);
  assert.match(view,/if\(run\(action\)\)/);
  assert.match(view,/inventoryPosted:false|receipts do not increase sellable stock/);
  for(const route of ["vendors","expenses","orders","receipts","bills","payments","credits"])assert.match(routes,new RegExp("/purchases/"+route));
  assert.match(routes,/if\(clean\.startsWith\("\/purchases\/"\)\)/);
});
