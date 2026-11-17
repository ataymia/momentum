import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as source from "../functions/src/inventory-lot-quality";
const commonJsCompatible=source as typeof source & {default?:typeof source};
const lotEligibleForAutomaticDelivery=commonJsCompatible.default?.lotEligibleForAutomaticDelivery
 ?? commonJsCompatible.lotEligibleForAutomaticDelivery;
const phoenixDateKey=commonJsCompatible.default?.phoenixDateKey
 ?? commonJsCompatible.phoenixDateKey;
test("trusted allocation rejects past or unverifiable best-by, uses Phoenix business date",()=>{
 const day="2026-11-15";
 assert.equal(lotEligibleForAutomaticDelivery({status:"Available",bestBy:day},day),true);
 assert.equal(lotEligibleForAutomaticDelivery({status:"Low stock",bestBy:"2027-12-31"},day),true);
 for(const lot of [
  {status:"Quality hold",bestBy:"2027-12-31"},
  {status:"Available",bestBy:"2026-11-14"},
  {status:"Available",bestBy:"2026-02-30"},
  {status:"Available",bestBy:""},
  {status:"Unknown",bestBy:"2027-12-31"},
 ])assert.equal(lotEligibleForAutomaticDelivery(lot,day),false);
 assert.equal(phoenixDateKey(new Date("2026-11-16T05:00:00Z")),"2026-11-15");
 const rep=readFileSync("functions/src/rep-self-delivery.ts","utf8");
 const admin=readFileSync("functions/src/admin-delivery-inventory.ts","utf8");
 assert(rep.includes("lotEligibleForAutomaticDelivery(lot,localDay)"));
 assert(admin.includes("lotEligibleForAutomaticDelivery(lot,asOfDate)"));
});
