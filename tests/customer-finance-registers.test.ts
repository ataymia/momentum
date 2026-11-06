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
 {id:"alloc-pending",paymentId:"pay-pending",invoiceId:"a",amount:5,createdAt:"2026-11-05",createdBy:"test"},
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
 assert.deepEqual(result,{invoices:[],payments:[],statement:[],openBalance:0});
});
test("customer finance portal is disabled for connected data and exports only scoped projections",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert.match(hub,/section==="payments"\|\|section==="statements"/);
 assert.match(hub,/!runtime\.isDemo\|\|momentumStorage\.mode\(\)!=="local"/);
 assert.match(hub,/projectCustomerFinance\(commerce,orders,accountIds,locationNames\)/);
 assert.match(hub,/downloadCsv\("momentum-my-payments\.csv",finance\.payments,customerPaymentColumns\)/);
 assert.match(hub,/downloadCsv\("momentum-my-statement\.csv",finance\.statement,customerStatementColumns\)/);
});

test("duplicate allocation identifiers do not duplicate cleared payment credits",()=>{
 const state:CommerceState={version:1,invoices:[invoice("a","a","owned")],payments:[
 {id:"pay-a",accountId:"owned",receivedAt:"2026-11-05",amount:20,method:"ACH",status:"Cleared",settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"test",createdAt:"2026-11-05"}
 ],allocations:[
 {id:"same",paymentId:"pay-a",invoiceId:"a",amount:10,createdAt:"2026-11-05",createdBy:"test"},
 {id:"same",paymentId:"pay-a",invoiceId:"a",amount:10,createdAt:"2026-11-05",createdBy:"test"}
 ],credits:[],refunds:[],notes:[]};
 const result=projectCustomerFinance(state,[order("a","owned")],new Set(["owned"]),new Map());
 assert.equal(result.payments[0].amount,10);
 assert.equal(result.statement.filter(row=>row.type==="Cleared payment").length,1);
});
test("settled refunds are capped by allocated cleared funds and duplicate IDs are ignored",()=>{
 const state:CommerceState={version:1,invoices:[invoice("a","a","owned")],payments:[
 {id:"pay-a",accountId:"owned",receivedAt:"2026-11-05",amount:20,method:"ACH",status:"Cleared",settledAt:"2026-11-05",settledBy:"reviewer",createdBy:"test",createdAt:"2026-11-05"}
 ],allocations:[{id:"alloc",paymentId:"pay-a",invoiceId:"a",amount:10,createdAt:"2026-11-05",createdBy:"test"}],
 credits:[],refunds:[
 {id:"refund-one",paymentId:"pay-a",amount:6,reason:"Test correction",status:"Settled",settledAt:"2026-11-05",createdAt:"2026-11-05",createdBy:"test"},
 {id:"refund-one",paymentId:"pay-a",amount:6,reason:"Test correction",status:"Settled",settledAt:"2026-11-05",createdAt:"2026-11-05",createdBy:"test"},
 {id:"refund-over",paymentId:"pay-a",amount:8,reason:"Test correction",status:"Settled",settledAt:"2026-11-05",createdAt:"2026-11-05",createdBy:"test"}
 ],notes:[]};
 const result=projectCustomerFinance(state,[order("a","owned")],new Set(["owned"]),new Map());
 assert.deepEqual(result.statement.filter(row=>row.type==="Settled refund").map(row=>row.debit),[6]);
});
