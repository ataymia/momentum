import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GOLDEN_EAGLE_SKUS} from "../lib/product-catalog";
import {validateCustomerOrderDraft} from "../lib/customer-order-request-draft";

test("R33 source-owned order intake accepts all and only approved catalog product identities",()=>{
 const server=readFileSync("functions/src/trusted-order-intake.ts","utf8");
 const serverCatalog=server.slice(server.indexOf("const catalog=["),server.indexOf("] as const;"));
 for(const sku of GOLDEN_EAGLE_SKUS.filter(x=>x.active&&!x.testOnly)){
  assert(serverCatalog.includes('skuId:"'+sku.id+'"'),sku.id);
  assert(serverCatalog.includes('description:"'+sku.description+'"'),sku.description);
  assert(serverCatalog.includes('casePack:'+sku.casePack),String(sku.casePack));
 }
 const ids=[...serverCatalog.matchAll(/skuId:"([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(ids.sort(),GOLDEN_EAGLE_SKUS.filter(x=>x.active&&!x.testOnly)
  .map(x=>x.id).sort(),"Server must not silently introduce an unverified sellable SKU");
});

test("R33 authenticated only, readback-safe and no financial or inventory mutation",()=>{
 const src=readFileSync("functions/src/trusted-order-intake.ts","utf8");
 const endpoints=readFileSync("functions/src/index.ts","utf8");
 const client=readFileSync("lib/firebase-order-intake.ts","utf8");
 const form=readFileSync("components/commerce/connected-order-intake-form.tsx","utf8");
 const queue=readFileSync("components/commerce/connected-order-intake-queue.tsx","utf8");
 const orderActions=readFileSync("components/prototype/order-actions.tsx","utf8");
 for(const marker of ["db.runTransaction","commerceOrderIntakeKeys","commerceOrderIntakes",
  "commerceOrderIntakeAudit","Needs commercial review","requestedByUid"]){
  assert(src.includes(marker),marker);
 }
 assert(!src.includes('tx.set(db.doc("domains/commercial/fields/orders"'));
 assert(!src.includes('tx.set(db.doc("domains/commerce/fields/invoices"'));
 assert(!src.includes('tx.set(db.doc("domains/commerce/fields/payments"'));
 assert(endpoints.includes("export const submitOrderIntake=onRequest"));
 assert(endpoints.includes("export const reviewOrderIntake=onRequest"));
 assert(endpoints.includes("verifyIdToken(token,true)"));
 assert(client.includes('firebaseFunctionUrl(endpoint)'));
 assert(client.includes("readbackVerified"));
 assert(form.includes("submitConnectedOrderIntake"));
 assert(form.includes("nonbinding review request"));
 assert(queue.includes("listConnectedOrderIntakes"));
 assert(queue.includes("Load older source requests"));
 assert(queue.includes("getConnectedOrderIntake"));
 assert(src.includes("pageTrustedOrderIntakes"));
 assert(endpoints.includes("pageTrustedOrderIntakes(actor,payload.cursor)"));
 assert(client.includes("nextCursor"));
 assert(queue.includes("setNextCursor"));
 assert(queue.includes("setRecords(current=>current.map(row=>row.id===selected.id?readback:row))"));
 assert(orderActions.includes("<ConnectedOrderIntakeForm/>"));
 assert(orderActions.includes("<ConnectedOrderIntakeQueue/>"));
});


test("Customer portal composes a canonical multi-product request without creating a financial order",()=>{
 const accountIds=["location-a"];
 const valid=validateCustomerOrderDraft("location-a",accountIds,[
  {skuId:"ge-original-250ml-24",cases:"8"},
  {skuId:"ge-tropical-250ml-24",cases:"3"},
 ],"Urgent review");
 assert.deepEqual(valid,{
  ok:true,draft:{accountId:"location-a",lines:[
   {skuId:"ge-original-250ml-24",cases:8},
   {skuId:"ge-tropical-250ml-24",cases:3},
  ],note:"Urgent review"},totalCases:11,
 });
 for(const row of [
  [{skuId:"ge-original-250ml-24",cases:"2"},{skuId:"ge-original-250ml-24",cases:"3"}],
  [{skuId:"ge-original-250ml-24",cases:"0"}],
  [{skuId:"ge-original-250ml-24",cases:"1.2"}],
  [{skuId:"ge-original-250ml-24",cases:"1e2"}],
  [{skuId:"ge-original-250ml-24",cases:"10001"}],
  [{skuId:"ge-original-250ml-24",cases:"9999"},{skuId:"ge-tropical-250ml-24",cases:"2"}],
  [{skuId:"unknown-product",cases:"1"}],
 ])assert.equal(validateCustomerOrderDraft("location-a",accountIds,row,"").ok,false);
 assert.equal(validateCustomerOrderDraft("other",accountIds,[
  {skuId:"ge-original-250ml-24",cases:"1"}],"").ok,false);
 assert.equal(validateCustomerOrderDraft("location-a",accountIds,[
  {skuId:"ge-original-250ml-24",cases:"1"}],"x".repeat(1001)).ok,false);
 const ui=readFileSync("components/prototype/customer-order-request.tsx","utf8");
 assert.match(ui,/lines\.map\(/);
 assert.match(ui,/validateCustomerOrderDraft\(/);
 assert.match(ui,/remaining\.length/);
 assert.match(ui,/submittedFingerprint/);
 assert.match(ui,/reviewOrderIntake/);
 assert.doesNotMatch(ui,/paymentsReceived|pricePerCase|createOrder|cardNumber/);
});
