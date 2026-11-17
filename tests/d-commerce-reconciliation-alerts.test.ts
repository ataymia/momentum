import assert from "node:assert/strict";
import test from "node:test";
import * as library from "../lib/commerce-reconciliation-audit";
const reconcile=(library as unknown as {default?:typeof library}).default??library;
const invoice={id:"i",number:"INV",orderId:"o",accountId:"a",issuedAt:"2026-11-07",createdAt:"2026-11-07",terms:"COD" as const,status:"Open" as const,total:200};
const payment={id:"p",accountId:"a",amount:100,receivedAt:"2026-11-07",createdAt:"2026-11-07",createdBy:"admin",method:"ACH" as const,status:"Cleared" as const,settledAt:"2026-11-07"};
const state={version:1 as const,invoices:[invoice],payments:[payment],allocations:[{id:"al",invoiceId:"i",paymentId:"p",amount:100,createdBy:"admin",createdAt:"2026-11-07"}],credits:[],refunds:[],notes:[]};
test("D09 healthy invoice allocation does not create a fabricated discrepancy",()=>{
 assert.deepEqual(reconcile.invoiceReconciliationAlerts(state,invoice),[]);
});
test("D09 shared payment refund cannot count as reconciled across invoices",()=>{
 const issues=reconcile.invoiceReconciliationAlerts({...state,allocations:[...state.allocations,{...state.allocations[0],id:"al2",invoiceId:"other",amount:0}],
 refunds:[{id:"r1",paymentId:"p",amount:20,reason:"Damaged",status:"Settled" as const,createdBy:"admin",createdAt:"2026-11-07"}]},invoice);
 assert.equal(issues.length,0);
 const multiple=reconcile.invoiceReconciliationAlerts({...state,allocations:[...state.allocations,{...state.allocations[0],id:"al2",invoiceId:"other",amount:10}],
 refunds:[{id:"r1",paymentId:"p",amount:20,reason:"Damaged",status:"Settled" as const,createdBy:"admin",createdAt:"2026-11-07"}]},invoice);
 assert(multiple.some(a=>a.includes("spans multiple invoices")));
});
test("D16 allocation and settlement date failures are visible",()=>{
 assert(reconcile.invoiceReconciliationAlerts({...state,allocations:[{...state.allocations[0],amount:120}]},invoice)
   .some(a=>a.includes("exceed")));
 assert(reconcile.invoiceReconciliationAlerts({...state,payments:[{...payment,settledAt:undefined}]},invoice)
   .some(a=>a.includes("without a settlement date")));
});
