import assert from "node:assert/strict";
import test from "node:test";

import type { CrmInteraction } from "../lib/crm-engine";
import {
  QUICK_VISIT_LOCATION_PREFIX,
  matchQuickVisitAccount,
  normalizeQuickVisitSamples,
  quickVisitBusinessLabel,
  quickVisitLocationId,
  quickVisitSuggestions,
} from "../lib/quick-visit";
import { weeklyVisitSummary } from "../lib/sales-field-engine";
import type { Account } from "../lib/types";

const account=(id:string,name:string,streetAddress:string)=>({id,name,locationName:name,streetAddress,location:"Phoenix, AZ",channel:"Independent retail"} as Account);

test("Quick Visit predicts existing businesses but still supports freehand names",()=>{
  const accounts=[account("acct-1","Ground Shaker Coffee Bar","123 Main St"),account("acct-2","Golden Market","456 Oak Ave")];
  const suggestions=quickVisitSuggestions(accounts,"ground shak");
  assert.equal(suggestions[0]?.id,"acct-1");
  const label=quickVisitBusinessLabel(accounts[0]);
  assert.equal(matchQuickVisitAccount(accounts,label)?.id,"acct-1");
  assert.equal(matchQuickVisitAccount(accounts,"Brand New Corner Store"),undefined);
});

test("freehand businesses receive a stable non-account Quick Visit location id",()=>{
  const first=quickVisitLocationId("  Brand New Corner Store  ");
  const second=quickVisitLocationId("brand new corner store");
  assert.equal(first,second);
  assert.ok(first.startsWith(QUICK_VISIT_LOCATION_PREFIX));
});

test("multiple sample rows are logged in cans and duplicate SKUs aggregate",()=>{
  const samples=normalizeQuickVisitSamples([
    {product:"Golden Eagle Original",quantity:2},
    {product:"Golden Eagle SugarFree",quantity:3},
    {product:"Golden Eagle Original",quantity:4},
    {product:"",quantity:12},
  ]);
  assert.deepEqual(samples,[
    {product:"Golden Eagle Original",quantity:6},
    {product:"Golden Eagle SugarFree",quantity:3},
  ]);
});

test("a freehand physical Quick Visit still counts toward the weekly visit target",()=>{
  const occurredAt=new Date().toISOString();
  const interaction:CrmInteraction={
    id:"visit-freehand-1",
    locationId:quickVisitLocationId("Walk-in Test Business"),
    userId:"rep-1",
    type:"Visit",
    occurredAt,
    summary:"Physical business visit · Walk-in Test Business",
    physicalVisit:true,
    prospectRating:5,
    visitUnsuccessful:true,
  };
  const asOf=occurredAt.slice(0,10);
  assert.equal(weeklyVisitSummary([interaction],"rep-1",asOf).completed,1);
});
