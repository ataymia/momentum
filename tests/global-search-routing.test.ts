import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {globalSearchDestination} from "../lib/global-search-routing";
import {canVisitRoute} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";

const actor=(role:WorkspaceUser["role"]):WorkspaceUser=>({
  id:"demo-user",name:"Test User",firstName:"Test",email:"test@example.invalid",
  role,team:"Sales",initials:"TU",title:"Tester",accent:"#234567",
});

test("global search opens actual staff records instead of generic module lists",()=>{
  assert.equal(globalSearchDestination("Administrator","Location","store-1"),"/sales/customers/store-1");
  assert.equal(globalSearchDestination("Sales Representative","Contact","contact-1"),"/crm/contacts/contact-1");
  assert.equal(globalSearchDestination("Administrator","Order","order-1"),"/sales/orders/order-1");
  assert.equal(globalSearchDestination("Administrator","Invoice","invoice-1"),"/sales/invoices/invoice-1");
  assert.equal(globalSearchDestination("Administrator","Person","staff-1"),"/admin/employee-profiles/staff-1");
  assert.equal(globalSearchDestination("Administrator","Inventory lot","lot-1"),"/inventory/lots/lot-1");
});

test("customer search resolves to portal routes and never internal invoice, CRM or staff pages",()=>{
  for(const [type,id,expected] of [
    ["Location","loc-1","/portal/account"],
    ["Order","order-1","/portal/orders/order-1"],
    ["Invoice","inv-1","/portal/invoices"],
  ] as const){
    const route=globalSearchDestination("Customer",type,id);
    assert.equal(route,expected);
    assert.equal(canVisitRoute(actor("Customer"),route!),true);
  }
  for(const type of ["Contact","Person","Appointment","Inventory lot"]){
    assert.equal(globalSearchDestination("Customer",type,"private-1"),null);
  }
  assert.equal(globalSearchDestination("Sales Representative","Person","coworker-1"),null);
  assert.equal(canVisitRoute(actor("Customer"),"/sales/invoices"),false);
});

test("search route encoding and explicit authorization checks remain applied at call-site",()=>{
  const encoded=globalSearchDestination("Sales Representative","Order","opaque/1");
  assert.equal(encoded,"/sales/orders/opaque%2F1");
  assert.equal(canVisitRoute(actor("Sales Representative"),encoded!),false);
  assert.equal(globalSearchDestination("Administrator","Invoice",""),null);
  assert.equal(globalSearchDestination("Administrator","Unknown module","anything"),null);
  const source=readFileSync("components/global-search-modal.tsx","utf8");
  assert.match(source,/canVisitRoute\(currentUser,target\)/);
  assert.match(source,/navigateToRoute\(target\)/);
  assert.match(source,/recordId: invoice\.id/);
  assert.doesNotMatch(source,/navigate\(page\)/);
});
