import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {consolidationCandidates,manualConsolidationCandidate,normalizedBusinessName} from "../lib/account-consolidation-review";
import type {Account} from "../lib/types";

const location=(id:string,name:string,address:string,customerId?:string,ownerId="rep-a"):Account=>({
  id,name,location:"Phoenix, AZ",channel:"Convenience",stage:"Prospect",ownerId,
  contactName:"",contactRole:"",phone:"",email:"",lastActivity:"",nextAction:"",
  nextActionDate:"2026-11-10",health:"New",lifetimeCases:0,reorderCount:0,
  notes:"",streetAddress:address,postalCode:"85016",customerId,
});

test("case and location number variants can be flagged for human review",()=>{
  assert.equal(normalizedBusinessName(" Corner  Market #2 "),normalizedBusinessName("corner market"));
  const records=[location("1","Corner Market","101 Main St"),location("2","Corner Market #2","202 Main St")];
  const [group]=consolidationCandidates(records);
  assert.equal(group.locations.length,2);
  assert.equal(group.existingCustomerIds.length,0);
  assert.equal(group.sameAddressPairs.length,0);
});
test("same address flags a possible duplicate physical store but does not merge anything",()=>{
  const originals=[
    location("1","Corner Market","101 Main St","parent-one","rep-a"),
    location("2","Corner Market","101 Main St","parent-two","rep-b"),
  ];
  const [group]=consolidationCandidates(originals);
  assert.deepEqual(group.sameAddressPairs,[["1","2"]]);
  assert.equal(group.existingCustomerIds.length,2);
  assert.equal(group.conflicts.length,3);
  assert.equal(originals[0].customerId,"parent-one");
  assert.equal(originals[1].customerId,"parent-two");
});
test("different names, single records and blank business labels are not grouped",()=>{
  const result=consolidationCandidates([
    location("1","Corner Market","101 Main St"),
    location("2","Corner Mart","202 Main St"),
    location("3"," ","303 Main St"),
  ]);
  assert.equal(result.length,0);
});

test("a user can manually review differently named MMA and sports fitness accounts without any similarity threshold",()=>{
  const accounts=[
    location("two-knuckles-a","Two Knuckle Sports and Fitness","121 Training Lane","verified-a","rep-a"),
    location("two-knuckles-b","Two Knuckles Sports MMA and Fitness","232 Training Lane",undefined,"rep-b"),
    location("unrelated","Entirely Different Retail Shop","444 Retail Drive"),
  ];
  assert.equal(consolidationCandidates(accounts).length,0);
  const selected=manualConsolidationCandidate(accounts,["two-knuckles-b","two-knuckles-a"]);
  assert(selected);
  assert.equal(selected.locations.length,2);
  assert.deepEqual(selected.locations.map(a=>a.id).sort(),["two-knuckles-a","two-knuckles-b"]);
  assert(selected.conflicts.some(message=>message.includes("Different business names")));
  assert(selected.conflicts.some(message=>message.includes("representatives")));
  assert.equal(accounts[0].customerId,"verified-a");
  assert.equal(accounts[1].customerId,undefined);
  assert.equal(selected.locations.some(a=>a.id==="unrelated"),false);
});
test("manual selections survive duplicate entries but reject ghost account IDs and groups smaller than two",()=>{
  const accounts=[location("a","A","10 Main"),location("b","B","11 Main")];
  assert.equal(manualConsolidationCandidate(accounts,["a"]),null);
  assert.equal(manualConsolidationCandidate(accounts,["a","unknown"]),null);
  assert.equal(manualConsolidationCandidate(accounts,["a","a"]),null);
  assert.equal(manualConsolidationCandidate(accounts,["a","b","b"])?.locations.length,2);
});
test("admin picker searches every CRM location, even outside suggested groups",()=>{
  const source=readFileSync("components/prototype/account-consolidation-review.tsx","utf8");
  assert.match(source,/manualConsolidationCandidate\(data\.accounts,selectedIds\)/);
  assert.match(source,/data\.accounts\.filter\(a=>/);
  assert.match(source,/checked=\{selectedSet\.has\(a\.id\)\}/);
  assert.match(source,/setSelectedIds\(current=>current\.includes\(id\)/);
  assert.doesNotMatch(source,/createCustomer\(/);
  assert.doesNotMatch(source,/setCommercial\(/);
});
