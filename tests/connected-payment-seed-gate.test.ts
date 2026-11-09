import test from "node:test";
import assert from "node:assert/strict";
import {createDemoData} from "../lib/demo-data";
import {createCommerceSeed,normalizeCommerceState,invoicePaidAmount,computedInvoiceStatus} from "../lib/commerce-engine";

test("R30 live accounting does not fabricate cleared payment from paid order label",()=>{
 const data=createDemoData();
 const paid=data.orders.filter(order=>order.paymentStatus==="Paid"&&!order.testOnly);
 assert(paid.length>0,"Demo fixture must include a paid-labeled order");
 const demo=createCommerceSeed(data);
 assert(demo.payments.length>0,"Local demo intentionally illustrates a paid seed");
 const connected=createCommerceSeed(data,false);
 assert.equal(connected.payments.length,0);
 assert.equal(connected.allocations.length,0);
 assert(connected.invoices.every(invoice=>invoice.status!=="Paid"));
 assert(paid.every(order=>data.orders.includes(order)),"Source orders must remain intact");
});

test("R30 connected normalization drops known synthetic seed receipts but preserves source invoices",()=>{
 const data=createDemoData();
 const demo=createCommerceSeed(data);
 const live=normalizeCommerceState(demo,data,false);
 assert.equal(live.payments.filter(p=>p.note==="Seeded from paid demo order").length,0);
 assert.equal(live.allocations.filter(a=>a.id.endsWith("-seed")).length,0);
 assert(live.invoices.length>0);
 assert(live.invoices.every(invoice=>invoice.status!=="Paid"));
 assert(live.invoices.every(invoice=>invoicePaidAmount(live,invoice.id)===0));
});

test("R30 a non-synthetic recorded settlement and its matching allocation remain linked",()=>{
 const data=createDemoData();
 const base=createCommerceSeed(data);
 const seed=base.payments[0];
 const allocation=base.allocations.find(a=>a.paymentId===seed.id);
 assert(seed&&allocation);
 const record={...seed,id:"recorded-payment-1",createdBy:"finance-reviewer",
   method:"ACH" as const,processorReference:"external-reference-1",note:"Bank review receipt"};
 const link={...allocation,id:"recorded-allocation-1",paymentId:record.id,createdBy:"finance-reviewer"};
 const input={...base,payments:[...base.payments,record],allocations:[...base.allocations,link]};
 const live=normalizeCommerceState(input,data,false);
 assert.equal(live.payments.length,1);
 assert.equal(live.allocations.length,1);
 assert.equal(live.allocations[0].paymentId,record.id);
 const invoice=live.invoices.find(i=>i.id===link.invoiceId);
 assert(invoice);
 assert.equal(computedInvoiceStatus(live,invoice),"Paid");
});
