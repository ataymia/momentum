import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {skuForTraceableProduct} from "../lib/product-catalog";
test("strict catalog matching links known aliases without guessing unknown SKUs",()=>{
  assert.equal(skuForTraceableProduct("Golden Eagle SugarFree")?.id,"ge-sugarfree-250ml-24");
  assert.equal(skuForTraceableProduct("fizzy strawberry drink"),undefined);
  assert.equal(skuForTraceableProduct("unverified golden eagle tropical mystery"),undefined);
});
test("product records use authorized custody calculations, not stale imported lot balances",()=>{
  const source=readFileSync("components/prototype/operations-hub.tsx","utf8");
  assert.match(source,/canAccessPage\(currentUser,"inventory"\)/);
  assert.match(source,/warehouseAvailable\(ledger,l.id\)/);
  assert.match(source,/reservedQuantity\(ledger,l.id\)/);
  assert.match(source,/nodeLotBalance\(ledger,warehouseNodeId,l.id\)/);
  assert.doesNotMatch(source,/\{l\.onHand\}<\/td>/);
  assert.doesNotMatch(source,/\{l\.available\}<\/td>/);
});
