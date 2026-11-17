import test from "node:test";
import assert from "node:assert/strict";
import {resolvedPaidOrderFacts,collectedCashFacts} from "../lib/commercial-source";
import type {WorkspaceData,Order} from "../lib/types";
import type {CommerceState} from "../lib/commerce-engine";

const createOrder=(id:string,accountId="store-1"):Order=>({
 id,accountId,number:"GE-"+id,cases:1,pricePerCase:24,amount:24,
 status:"Delivered",paymentStatus:"Paid",placedAt:"2026-11-01",
 ownerId:"rep-1",priceBasis:"Test source",
});
function snapshot(multiInvoice=false){
 const primary=createOrder("order-1");
 const second=createOrder("order-2");
 const data={orders:[primary,second],accounts:[],users:[]} as unknown as WorkspaceData;
 const commerce:CommerceState={
  version:1,
  invoices:[
    {id:"invoice-1",number:"INV-1",orderId:primary.id,accountId:primary.accountId,issuedAt:"2026-11-01",createdAt:"2026-11-01",terms:"COD",total:24,status:"Open"},
    {id:"invoice-2",number:"INV-2",orderId:second.id,accountId:second.accountId,issuedAt:"2026-11-01",createdAt:"2026-11-01",terms:"COD",total:24,status:"Open"},
  ],
  payments:[{id:"payment-1",accountId:primary.accountId,receivedAt:"2026-11-02",
    settledAt:"2026-11-03",settledBy:"reviewer",status:"Cleared",method:"ACH",amount:24,
    createdBy:"reviewer",createdAt:"2026-11-02"}],
  allocations:multiInvoice?
   [{id:"alloc-1",paymentId:"payment-1",invoiceId:"invoice-1",amount:12,createdAt:"2026-11-03",createdBy:"reviewer"},
    {id:"alloc-2",paymentId:"payment-1",invoiceId:"invoice-2",amount:12,createdAt:"2026-11-03",createdBy:"reviewer"}]:
   [{id:"alloc-1",paymentId:"payment-1",invoiceId:"invoice-1",amount:24,createdAt:"2026-11-03",createdBy:"reviewer"}],
  credits:[],refunds:[],notes:[],
 };
 return {data,commerce};
}
test("R30 a legacy Paid flag cannot override an unpaid invoice in a Commerce-connected read",()=>{
 const {data,commerce}=snapshot();
 commerce.payments=[];
 commerce.allocations=[];
 assert.deepEqual(resolvedPaidOrderFacts(data,commerce),[]);
 assert.deepEqual(collectedCashFacts(data,commerce),[]);
 assert.equal(resolvedPaidOrderFacts(data).length,2,"legacy no-Commerce projection remains explicitly separate");
});
test("R30 verified settlement date comes from actual source, never order date",()=>{
 const {data,commerce}=snapshot();
 assert.deepEqual(resolvedPaidOrderFacts(data,commerce).map(x=>[x.orderId,x.paidAt]),[["order-1","2026-11-03"]]);
 assert.deepEqual(collectedCashFacts(data,commerce).map(x=>[x.id,x.amount]),[["alloc-1",24]]);
});
test("R30 Cleared without settlement evidence cannot become cash or a paid order",()=>{
 const {data,commerce}=snapshot();
 delete commerce.payments[0].settledAt;
 assert.deepEqual(resolvedPaidOrderFacts(data,commerce),[]);
 assert.deepEqual(collectedCashFacts(data,commerce),[]);
});
test("R74 overlapping refunds cannot be falsely attributed to the first invoice",()=>{
 const {data,commerce}=snapshot(true);
 commerce.refunds=[{id:"refund-1",paymentId:"payment-1",amount:4,status:"Settled",reason:"Quality",
  createdAt:"2026-11-04",createdBy:"operator",settledAt:"2026-11-05",settledBy:"operator"}];
 const facts=collectedCashFacts(data,commerce);
 assert.equal(facts.some(x=>x.kind==="Refund"),false);
 assert.deepEqual(resolvedPaidOrderFacts(data,commerce),[]);
});
test("R30 a refund to one invoice is attributable when source evidence is complete",()=>{
 const {data,commerce}=snapshot();
 commerce.refunds=[{id:"refund-1",paymentId:"payment-1",amount:5,status:"Settled",reason:"Quality",
  createdAt:"2026-11-04",createdBy:"operator",settledAt:"2026-11-05",settledBy:"operator"}];
 const refunds=collectedCashFacts(data,commerce).filter(x=>x.kind==="Refund");
 assert.equal(refunds.length,1);
 assert.equal(refunds[0].orderId,"order-1");
 assert.equal(refunds[0].amount,-5);
});
