import assert from "node:assert/strict";
import test from "node:test";
import {consolidationCandidates,normalizedBusinessName} from "../lib/account-consolidation-review";
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
