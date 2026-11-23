import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {auditCanonicalIntakePairs} from "../lib/order-intake-link-proof";

const order={id:"order-1",sourceIntakeId:"intake-1",accountId:"account-1",amount:192};
const invoice={id:"invoice-1",sourceIntakeId:"intake-1",orderId:"order-1",accountId:"account-1",total:192};
const record={id:"intake-1",status:"Approved",orderId:"order-1",invoiceId:"invoice-1"};

test("read-only batch audit checks each prepared request and excludes unapproved and incomplete rows",()=>{
 const rows=[
  record,
  {id:"intake-old",status:"Approved"},
  {id:"intake-half",status:"Approved",orderId:"order-half"},
  {id:"intake-no",status:"Declined",orderId:"order-no",invoiceId:"invoice-no"},
 ];
 assert.deepEqual(auditCanonicalIntakePairs(rows,[order],[invoice]),{
  checked:1,verifiedIds:["intake-1"],unresolvedIds:[],
 });
 assert.deepEqual(auditCanonicalIntakePairs(rows,[order],[]),{
  checked:1,verifiedIds:[],unresolvedIds:["intake-1"],
 });
});

test("read-only batch audit catches missing, conflicting and duplicate canonical sources",()=>{
 const withTwo=[record,{id:"intake-2",status:"Approved",orderId:"order-2",invoiceId:"invoice-2"}];
 const clean=auditCanonicalIntakePairs(withTwo,[order],[invoice]);
 assert.equal(clean.checked,2);
 assert.deepEqual(clean.verifiedIds,["intake-1"]);
 assert.deepEqual(clean.unresolvedIds,["intake-2"]);
 assert.deepEqual(auditCanonicalIntakePairs([record],[order,{...order,id:"order-duplicate"}],[invoice]).unresolvedIds,["intake-1"]);
 assert.deepEqual(auditCanonicalIntakePairs([record],[order],[{...invoice,total:193}]).unresolvedIds,["intake-1"]);
 const repeated=auditCanonicalIntakePairs([record,record],[order],[invoice]);
 assert.deepEqual(repeated,{checked:1,verifiedIds:[],unresolvedIds:["intake-1"]});
});

test("Administrator verification reads both registers in one batch without creating order or invoice",()=>{
 const api=readFileSync("lib/firebase-order-intake.ts","utf8");
 const start=api.indexOf("export async function auditConnectedApprovedIntakePairs(");
 const end=api.indexOf("/** Verified Administrator decision",start);
 assert(start>=0&&end>start,"Connected read-only audit must exist");
 const body=api.slice(start,end);
 assert.match(body,/activeIntakeSession\(session\)/);
 assert.match(body,/getFirestoreSnapshot/);
 assert.match(body,/domains\/commercial\/fields\/orders/);
 assert.match(body,/domains\/commerce\/fields\/invoices/);
 assert.match(body,/auditCanonicalIntakePairs\(records,orderItems,invoiceItems\)/);
 assert.doesNotMatch(body,/\b(update|create|commit|setFirestoreDocument|deleteFirestoreDocument)\(/);
});

test("Administrator sees verified/unresolved links, respects page limits and does not automatically repair",()=>{
 const ui=readFileSync("components/orders/approved-intake-orders.tsx","utf8");
 assert.match(ui,/onClick=\{\(\)=>void verifyLoaded\(\)\}/);
 assert.match(ui,/auditConnectedApprovedIntakePairs\(session,records\)/);
 assert.match(ui,/setShowPrepared\(true\)/);
 assert.match(ui,/linkAudit\?\.unresolvedIds\.includes\(r\.id\)/);
 assert.match(ui,/linkAudit\?\.verifiedIds\.includes\(r\.id\)/);
 assert.match(ui,/Do not create or approve another order/);
 assert.match(ui,/No orders or invoices were changed/);
});
