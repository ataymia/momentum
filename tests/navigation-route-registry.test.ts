import test from "node:test";
import assert from "node:assert/strict";
import type { Role, WorkspaceUser } from "../lib/types";
import {
  MENU_GROUPS, canShowModuleInMenu, canVisitRoute, pageForPath, permissionForPath,
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


test("deep-linked records retain their parent active page instead of Home",()=>{
  for(const [path,expected] of [
    ["/sales/customers/account-1/comments","accounts"],
    ["/sales/orders/order-1","orders"],
    ["/sales/invoices/invoice-1","orderCash"],
    ["/sales/payments/payment-1","orderCash"],
    ["/inventory/lots/lot-1","inventory"],
    ["/items/item-1/transactions","products"],
  ] as const){
    assert.equal(pageForPath(path),expected,path);
  }
  assert.equal(pageForPath("/inventory/workflow"),"inventory");
  assert.equal(pageForPath("/sales/orders/workflow"),"orders");
});

test("new module routes retain a meaningful active page and unknown paths stay unresolved",()=>{
  for(const [path,expected] of [
    ["/calendar","work"],
    ["/calendar/meetings","work"],
    ["/crm/leads","accounts"],
    ["/crm/incentives","accounts"],
    ["/purchases/vendors","accounting"],
    ["/portal/orders","orders"],
    ["/portal/account","accounts"],
  ] as const)assert.equal(pageForPath(path),expected,path);
  assert.equal(pageForPath("/this-module-does-not-exist"),null);
});

test("redesigned HR record routes preserve Administrator access and block other employees",()=>{
  const admin=makeUser("Administrator"),rep=makeUser("Sales Representative");
  assert.equal(canVisitRoute(admin,"/admin/employee-profiles/employee-opaque-id/compensation"),true);
  assert.equal(canVisitRoute(rep,"/admin/employee-profiles/employee-opaque-id/compensation"),false);
  assert.equal(permissionForPath("/admin/employee-profiles/employee-opaque-id/time"),"settings");
  assert.equal(pageForPath("/admin/employee-profiles/employee-opaque-id"),"settings");
  assert.equal(requiresPrototypePage("/admin/employee-profiles/employee-opaque-id/documents"),true);
  assert.equal(requiresPrototypePage("/people/payroll/workflow"),true);
  assert.equal(requiresPrototypePage("/people/onboarding/workflow"),true);
  assert.equal(canVisitRoute(admin,"/people/leave"),true);
});

test("HR administration deep links do not grant access just because a page key is broadly readable",()=>{
  const rep=makeUser("Sales Representative"),admin=makeUser("Administrator");
  for(const route of ["/people/onboarding","/people/new-hire","/people/payroll","/people/training"]){
    assert.equal(canVisitRoute(rep,route),false,route);
    assert.equal(canVisitRoute(admin,route),true,route);
  }
});

test("F07: copying a Campaigns URL cannot bypass the Marketing department access policy",()=>{
 const marketer=makeUser("Marketing"),admin=makeUser("Administrator");
 assert.equal(canVisitRoute(marketer,"/marketing/campaigns"),false);
 assert.equal(canVisitRoute(admin,"/marketing/campaigns"),true);
});
