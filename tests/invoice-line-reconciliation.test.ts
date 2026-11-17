import test from "node:test";
import assert from "node:assert/strict";
import {reconcileInvoicePdfLines} from "../functions/src/invoice-line-reconciliation";

const order={product:"Stale order product",cases:10,pricePerCase:24,amount:240};

test("amended invoices print their saved snapshot, never outdated order lines",()=>{
 const result=reconcileInvoicePdfLines({total:144,linesSnapshot:[
  {product:"Approved replacement product",cases:6,pricePerCase:24,amount:144},
 ]},order);
 assert.deepEqual(result,{ok:true,source:"Invoice snapshot",lines:[
  {product:"Approved replacement product",cases:6,pricePerCase:24,amount:144},
 ]});
});

test("legacy invoices only use order fallback when amounts fully reconcile",()=>{
 assert.equal(reconcileInvoicePdfLines({total:240},order).ok,true);
 assert.deepEqual(reconcileInvoicePdfLines({total:216},order),{
  ok:false,reason:"Saved invoice total does not match the authoritative invoice line items.",
 });
});

test("malformed invoice snapshot must not silently fall back to old order",()=>{
 for(const linesSnapshot of [[],[{product:"Changed",cases:3,pricePerCase:24,amount:80}],
  [{product:"",cases:3,pricePerCase:24,amount:72}]]){
  assert.equal(reconcileInvoicePdfLines({total:240,linesSnapshot},order).ok,false);
 }
 assert.equal(reconcileInvoicePdfLines({total:240},{...order,product:""}).ok,false);
});

test("round currency to cents and reject invented product and dangerous values",()=>{
 assert.equal(reconcileInvoicePdfLines({total:30.3},{product:"SKU",cases:3,
  pricePerCase:10.1,amount:30.3}).ok,true);
 assert.equal(reconcileInvoicePdfLines({total:240}, {...order,cases:3.5}).ok,false);
 assert.equal(reconcileInvoicePdfLines({total:240}, {...order,amount:-240}).ok,false);
 assert.equal(reconcileInvoicePdfLines({total:240}, {...order,product:""}).ok,false);
});
