import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("placement-sourced reorders preserve exact source lineage from Retail through order creation", () => {
  const retail = source("../components/pages/retail.tsx");
  const orders = source("../components/pages/orders.tsx");
  const workspace = source("../lib/workspace-context.tsx");
  const types = source("../lib/types.ts");

  assert.match(retail, /momentum-order-product/);
  assert.match(retail, /momentum-order-source-placement/);
  assert.match(orders, /sourcePlacementId:sourcePlacement\?\.id/);
  assert.match(workspace, /sourcePlacementId\?: string/);
  assert.match(workspace, /sourcePlacement\.accountId !== accountId/);
  assert.match(workspace, /sourcePlacement\.product !== selectedProduct/);
  assert.match(workspace, /sourcePlacementId: sourcePlacement\?\.id/);
  assert.match(types, /sourcePlacementId\?:string/);
});

test("internal order view can drill back to the exact source placement", () => {
  const orders = source("../components/pages/orders.tsx");
  assert.match(orders, /selectedSourcePlacement/);
  assert.match(orders, /Open source placement/);
  assert.match(orders, /momentum-focus-record",selectedSourcePlacement\.id/);
  assert.match(orders, /navigate\("retail"\)/);
});

test("customer order view keeps internal inventory, sales-credit, and placement-lineage controls behind internal-only guards", () => {
  const orders = source("../components/pages/orders.tsx");
  assert.match(orders, /selectedStock = !customerMode/);
  assert.match(orders, /creditedRep = !customerMode/);
  assert.match(orders, /selectedSourcePlacement = !customerMode/);
  assert.match(orders, /stock&&!customerMode/);
  assert.match(orders, /selected\.lowStockApprovalRequired/);
  assert.match(orders, /customerMode\?<><div><dt>Price per case<\/dt>/);
  assert.doesNotMatch(orders, /customerMode\?<><div><dt>Pricing at order<\/dt>/);
});
