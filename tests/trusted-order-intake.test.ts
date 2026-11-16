import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GOLDEN_EAGLE_SKUS} from "../lib/product-catalog";

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
