import test from "node:test";
import assert from "node:assert/strict";
import type { Role, WorkspaceUser } from "../lib/types";
import {
  MENU_GROUPS, canShowModuleInMenu, pageForPath, permissionForPath,
  requiresPrototypePage, routeForPage,
} from "../lib/navigation-route-registry";

function makeUser(role:Role):WorkspaceUser {
  return { id: "test-"+role, name: "Test User", firstName: "Test", email:"test@example.invalid",
    initials:"TU",title:"Demo",role,team:role==="Marketing"?"Marketing":"Leadership",accent:"#123456" };
}

test("department groups have distinct Human Resources and Marketing entries",()=>{
  assert.deepEqual(MENU_GROUPS.map(g=>g.label),[
    "Workspace","Sales & CRM","Commerce","Operations","Human Resources",
    "Marketing","Insights & Support","Administration"
  ]);
  assert.equal(MENU_GROUPS.some(g=>g.label==="People & Marketing"),false);
});

test("existing module destinations resolve to legacy page keys",()=>{
  for(const group of MENU_GROUPS){
    for(const entry of group.entries.filter(e=>e.state==="existing")){
      assert.notEqual(pageForPath(entry.path),null,
        "Existing module must be routable: "+group.label+" / "+entry.path);
    }
  }
  assert.equal(routeForPage("accounts"),"/sales/customers");
  assert.equal(pageForPath("/sales/payments"),"orderCash");
});

test("item, customer and order record URLs are recognized as record views",()=>{
  assert.equal(requiresPrototypePage("/items/ge-original-250ml-24/transactions"),true);
  assert.equal(requiresPrototypePage("/sales/customers/opaque-account-id/comments"),true);
  assert.equal(requiresPrototypePage("/sales/orders/opaque-order-id"),true);
  assert.equal(permissionForPath("/items/opaque-id"),"products");
  assert.equal(permissionForPath("/sales/customers/opaque-id"),"accounts");
  assert.equal(permissionForPath("/sales/orders/opaque-id"),"orders");
});

test("HR and Marketing department menu visibility are kept apart",()=>{
  const admin=makeUser("Administrator");
  const marketer=makeUser("Marketing");
  const rep=makeUser("Sales Representative");
  assert.equal(canShowModuleInMenu(admin,"/people"),true);
  assert.equal(canShowModuleInMenu(marketer,"/people"),false);
  assert.equal(canShowModuleInMenu(marketer,"/marketing"),true);
  assert.equal(canShowModuleInMenu(rep,"/marketing"),false);
  assert.equal(canShowModuleInMenu(rep,"/sales/customers"),true);
});

test("unbuilt workflows remain visibly identified and never appear as existing",()=>{
  const planned=MENU_GROUPS.flatMap(group=>group.entries).filter(e=>e.state==="planned");
  assert.ok(planned.length>0);
  for(const item of planned)assert.equal(requiresPrototypePage(item.path),true);
});
