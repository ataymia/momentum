import test from "node:test";
import assert from "node:assert/strict";
import type {CommerceState,Invoice,Payment,PaymentAllocation,Refund} from "../lib/commerce-engine";
import {refundCanRequest,refundHasSingleInvoiceAllocation} from "../lib/commerce-engine";
import {invoiceReconciliationAlerts} from "../lib/commerce-reconciliation-audit";
import {readFileSync} from "node:fs";

function fixture(multiInvoice:boolean){
 const invoice1={id:"inv-1",orderId:"order-1",accountId:"account-1",status:"Open",total:100} as Invoice;
 const invoice2={id:"inv-2",orderId:"order-2",accountId:"account-1",status:"Open",total:100} as Invoice;
 const payment={id:"payment-1",accountId:"account-1",amount:100,status:"Cleared",settledAt:"2026-11-01",settledBy:"server"} as Payment;
 const a1={id:"allocate-1",paymentId:"payment-1",invoiceId:"inv-1",amount:multiInvoice?50:100} as PaymentAllocation;
 const a2={id:"allocate-2",paymentId:"payment-1",invoiceId:"inv-2",amount:50} as PaymentAllocation;
 const state={version:1,invoices:[invoice1,invoice2],payments:[payment],
   allocations:multiInvoice?[a1,a2]:[a1],refunds:[],credits:[],notes:[]} as CommerceState;
 return {state,invoice1,invoice2,payment};
}
test("single-invoice cleared payment remains eligible for a quality-evidenced refund",()=>{
 const {state}=fixture(false);
 assert.equal(refundHasSingleInvoiceAllocation(state,"payment-1"),true);
 assert.equal(refundCanRequest(state,"payment-1",25,"Quality issue","Photos and returned stock record"),true);
});
test("multi-invoice source payment cannot create an unallocatable refund",()=>{
 const {state,invoice1}=fixture(true);
 assert.equal(refundHasSingleInvoiceAllocation(state,"payment-1"),false);
 assert.equal(refundCanRequest(state,"payment-1",10,"Quality issue","Photos and returned stock record"),false);
 state.refunds.push({id:"refund-legacy",paymentId:"payment-1",amount:10,status:"Requested",createdBy:"operator",createdAt:"2026-11-02",reason:"Quality",evidence:"Photo"} as Refund);
 assert.match(invoiceReconciliationAlerts(state,invoice1).join(" "),/spans multiple invoices/);
});
test("orphan, void, mismatched and overallocated payments cannot be refunded",()=>{
 const {state,invoice1}=fixture(false);
 const payment=state.payments[0];
 state.allocations=[];assert.equal(refundHasSingleInvoiceAllocation(state,payment.id),false);
 state.allocations=[{id:"a",paymentId:payment.id,invoiceId:invoice1.id,amount:120} as PaymentAllocation];
 assert.equal(refundHasSingleInvoiceAllocation(state,payment.id),false);
 state.allocations[0].amount=100;
 invoice1.status="Void";assert.equal(refundHasSingleInvoiceAllocation(state,payment.id),false);
 invoice1.status="Open";invoice1.accountId="foreign";assert.equal(refundHasSingleInvoiceAllocation(state,payment.id),false);
});
test("each refund transition requires verified single-invoice source",()=>{
 const source=readFileSync("lib/commerce-context.tsx","utf8");
 assert.match(source,/refundCanRequest\(commerce, paymentId/);
 assert.match(source,/!refundHasSingleInvoiceAllocation\(commerce,refund.paymentId\) \|\| !refundCanApprove/);
 assert.match(source,/!refundHasSingleInvoiceAllocation\(commerce,refund.paymentId\) \|\| !refundCanSend/);
 assert.match(source,/!refundHasSingleInvoiceAllocation\(commerce,refund.paymentId\) \|\| !refundCanSettle/);
});
