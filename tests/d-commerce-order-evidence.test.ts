import assert from "node:assert/strict";
import test from "node:test";
import {buildOrderCommerceEvidence} from "../lib/order-commerce-evidence";
import type {Order} from "../lib/types";
import type {CommerceState} from "../lib/commerce-engine";
import type {InventoryLedgerState} from "../lib/inventory-ledger";
const order:Order={id:"ord-1",number:"GE-1",accountId:"a1",cases:10,pricePerCase:24,amount:240,status:"Delivered",placedAt:"2026-11-01",ownerId:"rep-1",priceBasis:"Approved",paymentStatus:"Paid"};
const invoice={id:"i1",number:"INV1",orderId:"ord-1",accountId:"a1",issuedAt:"2026-11-01",terms:"COD" as const,total:240,status:"Open" as const,createdAt:"2026-11-01"};
const payment={id:"p1",accountId:"a1",receivedAt:"2026-11-02",amount:100,method:"ACH" as const,status:"Cleared" as const,createdBy:"user",createdAt:"2026-11-02",settledAt:"2026-11-03",settledBy:"user"};
const commerce:CommerceState={version:1,invoices:[invoice],payments:[payment],allocations:[{id:"al1",paymentId:"p1",invoiceId:"i1",amount:100,createdAt:"2026-11-03",createdBy:"user"}],credits:[],refunds:[],notes:[]};
const ledger:InventoryLedgerState={version:1,nodes:[{id:"customer",name:"Customer a1",type:"Customer",active:true},{id:"truck",name:"Truck",type:"Vehicle",active:true},{id:"warehouse",name:"Warehouse",type:"Warehouse",active:true}],movements:[
 {id:"delivery",lotId:"lot1",product:"Original",quantity:6,type:"Delivery",fromNodeId:"truck",toNodeId:"customer",relatedOrderId:"ord-1",reason:"POD",at:"2026-11-04",actorId:"driver"},
 {id:"return",lotId:"lot1",product:"Original",quantity:2,type:"Return",fromNodeId:"customer",toNodeId:"warehouse",relatedOrderId:"ord-1",reason:"Damage",at:"2026-11-05",actorId:"driver"},
 {id:"other",lotId:"lot1",product:"Original",quantity:99,type:"Delivery",fromNodeId:"truck",toNodeId:"customer",relatedOrderId:"ord-2",reason:"Unrelated",at:"2026-11-06",actorId:"driver"}
],reservations:[{id:"r1",orderId:"ord-1",lotId:"lot1",quantity:4,status:"Active",createdAt:"2026-11-02",createdBy:"operator"}],counts:[]};
test("D05/D09 order ledger evidence is source-linked and does not conflate funds with movement",()=>{
  const r=buildOrderCommerceEvidence(order,commerce,ledger);
  assert.equal(r.deliveredToCustomerCases,6);assert.equal(r.returnedFromCustomerCases,2);
  assert.equal(r.activeReservations,4);assert.equal(r.custodyEvents.length,2);
  assert.equal(r.clearedAmount,100);assert.equal(r.receivableBalance,140);
  assert.equal(r.paymentRecords.length,1);
  assert(r.warnings.some(w=>w.includes("marked Paid")));
});
test("D09 do not infer collected payments from pending allocations",()=>{
  const r=buildOrderCommerceEvidence({...order,paymentStatus:"Open"},{
    ...commerce,payments:[{...payment,status:"Pending",settledAt:undefined,settledBy:undefined}]
  },ledger);
  assert.equal(r.receivableBalance,240);assert.equal(r.clearedAmount,0);assert.equal(r.pendingAmount,100);
});
test("D06 ambiguous active invoices fail closed rather than silently selecting first",()=>{
  const r=buildOrderCommerceEvidence(order,{
    ...commerce,invoices:[invoice,{...invoice,id:"i2",number:"INV2"}]
  },ledger);
  assert.equal(r.activeInvoice,null);assert.equal(r.receivableBalance,null);
  assert(r.warnings.some(w=>w.includes("Multiple active invoices")));
});
test("D08 customer returns do not imply financial refunds or credits",()=>{
  const r=buildOrderCommerceEvidence(order,commerce,ledger);
  assert.equal(r.returnedFromCustomerCases,2);
  assert.equal(r.appliedCredits,0);assert.equal(r.clearedAmount,100);
});
