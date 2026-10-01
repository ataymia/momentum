import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("critical commercial order lifecycle changes enter persistence synchronously",()=>{
  const source=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(source,/const commitCommercialState =/);
  assert.match(source,/momentumStorage\.setItem\(COMMERCIAL_KEY, JSON\.stringify\(next\)\)/);
  assert.match(source,/commercialRef\.current = next/);
  assert.match(source,/void commitCommercialState\(next\)/);
  assert.match(source,/void commitCommercialState\(nextCommercial\)/);
});

test("legacy workspace approval and fulfillment mutations use the same durable write boundary",()=>{
  const source=readFileSync("lib/workspace-context-v5.tsx","utf8");
  assert.match(source,/const commitWorkspaceData =/);
  assert.match(source,/momentumStorage\.setItem\(DATA_KEY, JSON\.stringify\(next\)\)/);
  assert.match(source,/dataRef\.current = next/);
  assert.match(source,/void commitWorkspaceData\(next\)/);
});

test("approval UI waits for cloud confirmation and names the original order creator",()=>{
  const source=readFileSync("components/pages/work-v2.tsx","utf8");
  assert.match(source,/flushAndConfirm\(COMMERCIAL_KEY\)/);
  assert.match(source,/Placed by/);
  assert.match(source,/Approval submitted by/);
  assert.match(source,/Sales credit/);
  assert.match(source,/linkedOrder\.ownerId/);
});

test("all primary order surfaces retain creator attribution",()=>{
  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");
  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");
  assert.match(orders,/Placed by/);
  assert.match(delivery,/Placed by/);
});

test("delivery actions require cloud confirmation of delivery inventory and commercial records",()=>{
  const source=readFileSync("components/pages/deliveries.tsx","utf8");
  assert.match(source,/flushAndConfirm\(DELIVERY_STORAGE_KEY\)/);
  assert.match(source,/flushAndConfirm\(INVENTORY_LEDGER_STORAGE_KEY\)/);
  assert.match(source,/flushAndConfirm\(COMMERCIAL_KEY\)/);
});
