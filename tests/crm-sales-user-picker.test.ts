import assert from "node:assert/strict";
import test from "node:test";
import { selectableSalesUsers, selectedSalesUserId } from "../lib/sales-user-picker";
import type { WorkspaceUser } from "../lib/types";

const fake = (id: string, name: string, role: WorkspaceUser["role"], status?: WorkspaceUser["employmentStatus"]): WorkspaceUser => ({
  id,name,role,employmentStatus:status,firstName:name.split(" ")[0],email:id+"@momentum.test",
  initials:"MU",title:role,team:role==="Administrator"?"Leadership":"Sales",accent:"#000",
});

const people=[
  fake("rep-1","Morgan Smith","Sales Representative","Active"),
  fake("mgr-1","Alex Chen","Sales Manager","Active"),
  fake("rep-2","Former Rep","Sales Representative","Separated"),
  fake("admin-1","Admin User","Administrator","Active"),
  fake("client-1","Retail Buyer","Customer","Active"),
];

test("search accepts only real, active directory sales identities",()=>{
  assert.deepEqual(selectableSalesUsers(people,"").map(x=>x.id),["mgr-1","rep-1"]);
  assert.deepEqual(selectableSalesUsers(people,"Morgan").map(x=>x.id),["rep-1"]);
  assert.deepEqual(selectableSalesUsers(people,"CHEN").map(x=>x.id),["mgr-1"]);
  assert.deepEqual(selectableSalesUsers(people,"former"),[]);
  assert.deepEqual(selectableSalesUsers(people,"@momentum.test").map(x=>x.id),["mgr-1","rep-1"]);
});

test("forged, separated and non-sales UIDs cannot be selected",()=>{
  for(const id of ["forged","rep-2","admin-1","client-1"]){
    assert.equal(selectedSalesUserId(people,id),"");
  }
  assert.equal(selectedSalesUserId(people,"rep-1"),"rep-1");
  assert.equal(selectedSalesUserId(people,"mgr-1"),"mgr-1");
});

test("empty list or unmatched search never invents assignment options",()=>{
  assert.deepEqual(selectableSalesUsers([],"someone"),[]);
  assert.deepEqual(selectableSalesUsers(people,"not-there"),[]);
  assert.equal(selectedSalesUserId([],"rep-1"),"");
});
