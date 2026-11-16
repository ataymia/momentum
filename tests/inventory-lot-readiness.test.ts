import test from "node:test";
import assert from "node:assert/strict";
import {lotEligibleForAutomaticAllocation} from "../lib/inventory-ledger";
test("lot auto-allocation requires known, current best-by date and no quality hold",()=>{
 const date="2026-11-15";
 assert.equal(lotEligibleForAutomaticAllocation({status:"Available",bestBy:"2027-01-01"},date),true);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Low stock",bestBy:date},date),true);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Quality hold",bestBy:"2027-01-01"},date),false);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Available",bestBy:"2026-11-14"},date),false);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Available",bestBy:""},date),false);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Available",bestBy:"2026-02-30"},date),false);
 assert.equal(lotEligibleForAutomaticAllocation({status:"Available",bestBy:"01/02/2027"},date),false);
});
