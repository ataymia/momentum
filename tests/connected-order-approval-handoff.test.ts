import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {approvedIntakeRefState,visibleApprovedIntakes} from "../lib/approved-intake-visibility";

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
