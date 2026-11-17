import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {projectCustomerFinance} from "../lib/customer-finance-registers";
import type {Order} from "../lib/types";
import type {CommerceState} from "../lib/commerce-engine";

const order=(id:string,accountId:string):Order=>({id,accountId,number:"GE-"+id,cases:1,pricePerCase:20,amount:20,status:"Delivered",placedAt:"2026-11-05T10:00:00Z",ownerId:"rep",priceBasis:"Approved price",paymentStatus:"Open"});
const invoice=(id:string,orderId:string,accountId:string)=>({id,number:"INV-"+id,orderId,accountId,issuedAt:"2026-11-05",terms:"COD" as const,total:20,status:"Open" as const,createdAt:"2026-11-05"});
test("customer finance register excludes foreign invoices, payments and unfulfilled orders",()=>{
 const state:CommerceState={version:1,invoices:[invoice("a","a","owned"),invoice("b","b","foreign"),invoice("c","c","owned")],payments:[
 {id:"pay-a",accountId:"owned",receivedAt:"2026-11-05",amount:20,method:"ACH",status:"Cleared",settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"test",createdAt:"2026-11-05"},
 {id:"pay-b",accountId:"foreign",receivedAt:"2026-11-05",amount:20,method:"Card",status:"Cleared",settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"test",createdAt:"2026-11-05"},
 {id:"pay-pending",accountId:"owned",receivedAt:"2026-11-05",amount:5,method:"ACH",status:"Pending",createdBy:"test",createdAt:"2026-11-05"},
 ],allocations:[
 {id:"alloc-a",paymentId:"pay-a",invoiceId:"a",amount:20,createdAt:"2026-11-05",createdBy:"test"},
 {id:"alloc-b",paymentId:"pay-b",invoiceId:"b",amount:20,createdAt:"2026-11-05",createdBy:"test"},
 {id:"alloc-pending",paymentId:"pay-pending",invoiceId:"c",amount:5,createdAt:"2026-11-05",createdBy:"test"},
 ],credits:[],refunds:[],notes:[]};
 const unfulfilled={...order("c","owned"),status:"Draft" as const};
 const result=projectCustomerFinance(state,[order("a","owned"),order("b","foreign"),unfulfilled],new Set(["owned"]),new Map([["owned","Store A"]]));
 assert.deepEqual(result.invoices.map(i=>i.id),["a"]);
 assert.equal(result.payments.length,1);
 assert.equal(result.payments[0].amount,20);
 assert.deepEqual(result.statement.map(r=>r.type).sort(),["Cleared payment","Invoice"]);
 assert.equal(result.openBalance,0);
 assert.equal(JSON.stringify(result).includes("foreign"),false);
 assert.equal(JSON.stringify(result).includes("pay-b"),false);
});
test("customer finance register excludes all records when no authorized accounts exist",()=>{
 const empty:CommerceState={version:1,invoices:[invoice("a","a","owned")],payments:[],allocations:[],credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(empty,[order("a","owned")],new Set(),new Map());
 assert.deepEqual(result,{invoices:[],payments:[],statement:[],openBalance:0,reconciliationRequired:0});
});
test("customer finance portal is disabled for connected data and exports only scoped projections",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert.match(hub,/section==="payments"\|\|section==="statements"/);
 assert.match(hub,/!runtime\.isDemo\|\|momentumStorage\.mode\(\)!=="local"/);
 assert.match(hub,/projectCustomerFinance\(commerce,orders,accountIds,locationNames\)/);
 assert.match(hub,/downloadCsv\("momentum-my-payments\.csv",finance\.payments,customerPaymentColumns\)/);
 assert.match(hub,/downloadCsv\("momentum-my-statement\.csv",finance\.statement,customerStatementColumns\)/);
});

test("staff customer record statement uses only verified local demo and account-scoped finance",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const start=hub.indexOf("function CustomerRecord("),end=hub.indexOf("function matchingLines(");
 assert.ok(start>0&&end>start);
 const record=hub.slice(start,end);
 assert.match(record,/scope\.accounts\.find\(a=>a\.id===id\)/);
 assert.match(record,/new Set\(locations\.map\(a=>a\.id\)\)/);
 assert.match(record,/currentUser\?\.role!=="Customer"/);
 assert.match(record,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(record,/projectCustomerFinance\(commerce,orders,ids,/);
 assert.match(record,/statementRows/);
 assert.match(record,/downloadCsv\("momentum-customer-statement-"/);
 assert.match(record,/No amount is estimated from order totals/);
});

test("R23 current revised invoices replace superseded versions without double billing",()=>{
 const prior={...invoice("old","o","owned"),supersededByInvoiceId:"new"};
 const current={...invoice("new","o","owned"),previousInvoiceId:"old"};
 const state:CommerceState={version:1,invoices:[prior,current],payments:[],allocations:[],credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("o","owned")],new Set(["owned"]),new Map([["owned","Store A"]]));
 assert.deepEqual(result.invoices.map(i=>i.id),["new"]);
 assert.equal(result.openBalance,20);
 assert.equal(result.reconciliationRequired,0);
 assert.deepEqual(result.statement.map(row=>row.reference),["INV-new"]);
});

test("R23 prior allocations hold the revised invoice for accounting review",()=>{
 const prior={...invoice("old","o","owned"),supersededByInvoiceId:"new"};
 const current={...invoice("new","o","owned"),previousInvoiceId:"old"};
 const payment={id:"p",accountId:"owned",receivedAt:"2026-11-05",amount:5,method:"ACH" as const,
   status:"Cleared" as const,settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"reviewer",createdAt:"2026-11-05"};
 const state:CommerceState={version:1,invoices:[prior,current],payments:[payment],
   allocations:[{id:"a",invoiceId:"old",paymentId:"p",amount:5,createdAt:"2026-11-05",createdBy:"reviewer"}],
   credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("o","owned")],new Set(["owned"]),new Map());
 assert.deepEqual(result.invoices,[]);
 assert.deepEqual(result.payments,[]);
 assert.deepEqual(result.statement,[]);
 assert.equal(result.openBalance,0);
 assert.equal(result.reconciliationRequired,1);
});

test("R23 two simultaneous current invoices for one order never become two receivables",()=>{
 const state:CommerceState={version:1,invoices:[invoice("a","o","owned"),invoice("b","o","owned")],
   payments:[],allocations:[],credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("o","owned")],new Set(["owned"]),new Map());
 assert.deepEqual(result.invoices,[]);
 assert.equal(result.reconciliationRequired,2);
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert.match(hub,/finance\.reconciliationRequired>0/);
 assert.match(hub,/Ask accounting to review the originals before collecting payment/);
});

test("R30 cleared payment with no recorded settlement must not extinguish the customer receivable",()=>{
 const missingSettlement={id:"pay",accountId:"owned",receivedAt:"2026-11-05",amount:20,
   method:"ACH" as const,status:"Cleared" as const,createdBy:"operator",createdAt:"2026-11-05"};
 const state:CommerceState={version:1,invoices:[invoice("i","o","owned")],
   payments:[missingSettlement],allocations:[{id:"a",paymentId:"pay",invoiceId:"i",amount:20,createdAt:"2026-11-05",createdBy:"operator"}],
   credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("o","owned")],new Set(["owned"]),new Map());
 assert.deepEqual(result.invoices,[]);
 assert.deepEqual(result.payments,[]);
 assert.equal(result.reconciliationRequired,1);
});

test("R30 pending plus cleared reservations exceeding invoice amount require review",()=>{
 const base={id:"p1",accountId:"owned",receivedAt:"2026-11-05",amount:20,method:"ACH" as const,
   status:"Cleared" as const,settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"test",createdAt:"2026-11-05"};
 const state:CommerceState={version:1,invoices:[invoice("i","o","owned")],
   payments:[base,{...base,id:"p2",status:"Pending",settledAt:undefined,settledBy:undefined}],
   allocations:[{id:"a",paymentId:"p1",invoiceId:"i",amount:20,createdAt:"2026-11-05",createdBy:"test"},
     {id:"b",paymentId:"p2",invoiceId:"i",amount:5,createdAt:"2026-11-05",createdBy:"test"}],
   credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("o","owned")],new Set(["owned"]),new Map());
 assert.deepEqual(result.invoices,[]);
 assert.equal(result.reconciliationRequired,1);
});
