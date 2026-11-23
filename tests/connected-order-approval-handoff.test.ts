import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {approvedIntakeRefState,visibleApprovedIntakes} from "../lib/approved-intake-visibility";
import {canonicalOrderInvoiceLinked} from "../lib/order-intake-link-proof";

const request=(id:string,status:string,orderId?:string,invoiceId?:string)=>({
 id,status,orderId,invoiceId,totalCases:8,
});
test("approved source needs BOTH canonical references before it can be called prepared",()=>{
 assert.equal(approvedIntakeRefState(request("pending","Needs commercial review")),"not-approved");
 assert.equal(approvedIntakeRefState(request("old","Approved")),"needs-preparation");
 assert.equal(approvedIntakeRefState(request("orphan-order","Approved","ord-1")),"partial-linkage");
 assert.equal(approvedIntakeRefState(request("orphan-invoice","Approved",undefined,"inv-1")),"partial-linkage");
 assert.equal(approvedIntakeRefState(request("complete","Approved","ord-1","inv-1")),"prepared");
 assert.equal(approvedIntakeRefState(request("blank","Approved","  ","  ")),"needs-preparation");
});

test("approved recovery shows legacy and partial records; completed order remains inspectable on demand",()=>{
 const rows=[
  request("old","Approved"),
  request("order-only","Approved","ord-a"),
  request("invoice-only","Approved",undefined,"inv-b"),
  request("complete","Approved","ord-c","inv-c"),
  request("declined","Declined"),
  request("pending","Needs commercial review"),
 ];
 assert.deepEqual(visibleApprovedIntakes(rows).map(x=>x.id),["old","order-only","invoice-only"]);
 assert.deepEqual(visibleApprovedIntakes(rows,true).map(x=>x.id),["old","order-only","invoice-only","complete"]);
 assert.deepEqual(visibleApprovedIntakes([],true),[]);
});

test("connected Administrator approval must refresh BOTH order and invoice stores before claiming local sync",()=>{
 const queue=readFileSync("components/commerce/connected-order-intake-queue.tsx","utf8");
 assert.match(queue,/momentumStorage\.refreshKeys\(\[COMMERCIAL_KEY,COMMERCE_STORAGE_KEY\]\)/);
 assert.match(queue,/const sync=status==="Approved"/);
 assert.match(queue,/if\(readback\.status!==status\|\|readback\.reviewRevision!==receipt\.reviewRevision/);
 assert.match(queue,/sync\.ok/);
 assert.match(queue,/Do not approve or submit the request again/);
});

test("old approved source stays navigable after preparation and partial linkage never offers a blind duplicate",()=>{
 const recovery=readFileSync("components/orders/approved-intake-orders.tsx","utf8");
 assert.match(recovery,/visibleApprovedIntakes\(records,showPrepared\)/);
 assert.match(recovery,/setShowPrepared\(true\)/);
 assert.match(recovery,/Show prepared requests too/);
 assert.match(recovery,/approvedIntakeRefState\(r\)==="partial-linkage"/);
 assert.match(recovery,/Reconcile the original source with the canonical records/);
 assert.match(recovery,/momentumStorage\.refreshKeys\(\[COMMERCIAL_KEY,COMMERCE_STORAGE_KEY\]\)/);
 assert.match(recovery,/Open sales order/);
 assert.match(recovery,/Open invoice draft/);
});

test("canonical Firestore readback rejects partial links, duplicates, wrong accounts and mismatched totals",()=>{
 const orders=[{id:"order-1",sourceIntakeId:"intake-1",accountId:"location-a",amount:240}];
 const invoices=[{id:"invoice-1",sourceIntakeId:"intake-1",orderId:"order-1",accountId:"location-a",total:240}];
 const verify=(o:typeof orders|undefined,i:typeof invoices|undefined)=>
  canonicalOrderInvoiceLinked(o,i,"intake-1","order-1","invoice-1");
 assert.equal(verify(orders,invoices),true);
 assert.equal(verify(undefined,invoices),false);
 assert.equal(verify(orders,undefined),false);
 assert.equal(verify([],invoices),false);
 assert.equal(verify(orders,[]),false);
 assert.equal(verify([...orders,...orders],invoices),false);
 assert.equal(verify(orders,[...invoices,...invoices]),false);
 assert.equal(verify(orders,[{...invoices[0],orderId:"other-order"}]),false);
 assert.equal(verify(orders,[{...invoices[0],accountId:"other-location"}]),false);
 assert.equal(verify(orders,[{...invoices[0],total:241}]),false);
 assert.equal(verify([{...orders[0],amount:240.001}],invoices),false);
 assert.equal(verify([{...orders[0],sourceIntakeId:"other-intake"}],invoices),false);
 assert.equal(canonicalOrderInvoiceLinked(orders,invoices,"intake-1","other","invoice-1"),false);
 assert.equal(canonicalOrderInvoiceLinked(orders,invoices,"intake-1","order-1","other"),false);
});

test("approval and recovery prove the canonical pair independently, not just the source links",()=>{
 const api=readFileSync("lib/firebase-order-intake.ts","utf8");
 const queue=readFileSync("components/commerce/connected-order-intake-queue.tsx","utf8");
 const recovery=readFileSync("components/orders/approved-intake-orders.tsx","utf8");
 assert.match(api,/getFirestoreSnapshot<\{items\?:SourceLinkedOrder\[\]\}>\("domains\/commercial\/fields\/orders"\)/);
 assert.match(api,/getFirestoreSnapshot<\{items\?:SourceLinkedInvoice\[\]\}>\("domains\/commerce\/fields\/invoices"\)/);
 assert.match(api,/canonicalOrderInvoiceLinked\(/);
 assert.match(queue,/await verifyConnectedOrderInvoicePair\(/);
 assert.match(recovery,/await verifyConnectedOrderInvoicePair\(/);
 assert.match(queue,/momentumStorage\.mode\(\)==="firestore"/);
 assert.match(recovery,/momentumStorage\.mode\(\)==="firestore"/);
});
