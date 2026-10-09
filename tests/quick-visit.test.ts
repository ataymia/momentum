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
import { isEmployeeOwnPhysicalTrip, employeePhysicalVisits } from "../lib/employee-admin";
import { readFileSync } from "node:fs";
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

test("sales reps see their own physical trips, including transferred-account trips, but not other employees' trips",()=>{
  const own:CrmInteraction={id:"own",locationId:"account-transferred",userId:"rep-one",type:"Visit",physicalVisit:true,occurredAt:"2026-10-09T13:00:00.000Z",summary:"Physical stop"};
  const coworker={...own,id:"other",userId:"rep-two"};
  const call={...own,id:"phone",type:"Call" as const,physicalVisit:false};
  assert.equal(isEmployeeOwnPhysicalTrip(own,"rep-one"),true);
  assert.equal(isEmployeeOwnPhysicalTrip(coworker,"rep-one"),false);
  assert.equal(isEmployeeOwnPhysicalTrip(call,"rep-one"),false);
  const records=employeePhysicalVisits({interactions:[coworker,own,call]} as never,"rep-one");
  assert.deepEqual(records.map((item)=>item.id),["own"]);
  const crmSource=readFileSync("lib/crm-context.tsx","utf8");
  assert.ok(crmSource.includes("isEmployeeOwnPhysicalTrip(interaction, currentUser.id)"));
});

test("retail execution is hidden from current navigation without deleting placement records",()=>{
  for(const path of ["components/app-shell-v3.tsx","components/app-shell-v4.tsx"]){
    const source=readFileSync(path,"utf8");
    assert.ok(!source.includes('key: "retail", label: "Retail execution"'));
    assert.ok(source.includes('case "retail": return <RetailPage/>;'));
  }
});
