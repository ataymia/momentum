import assert from "node:assert/strict";
import test from "node:test";
import type { Role, WorkspaceUser } from "../lib/types";
import {
  CUSTOMER_MENU,
  DRIVER_MENU,
  MENU_GROUPS,
  canShowModuleInMenu,
  canVisitRoute,
  pageForPath,
  requiresPrototypePage,
} from "../lib/navigation-route-registry";

const person=(role:Role):WorkspaceUser=>({
  id:"test-"+role,email:"test@example.invalid",role,team:role==="Customer"?"Customer":"Sales",
  name:"Test Person",firstName:"Test",initials:"TP",title:"Test",accent:"#000",
});

test("all required departments are distinct and customer routes are not staff modules",()=>{
  const labels=MENU_GROUPS.map(g=>g.label);
  assert(labels.includes("Human Resources"));
  assert(labels.includes("Marketing"));
  assert(labels.includes("Sales & CRM"));
  assert(labels.includes("Administration"));
  assert(!labels.includes("People & Marketing"));
  assert(CUSTOMER_MENU.find(item=>item.path==="/portal/payments"));
  assert(DRIVER_MENU.find(item=>item.path==="/driver/deliveries"));
});

test("customer self-service is strictly separate from internal administration",()=>{
  const customer=person("Customer");
  assert(canVisitRoute(customer,"/portal/account"));
  assert(canVisitRoute(customer,"/portal/invoices"));
  assert(canVisitRoute(customer,"/portal/orders"));
  assert(!canVisitRoute(customer,"/admin"));
  assert(!canVisitRoute(customer,"/admin/employee-profiles"));
  assert(!canVisitRoute(customer,"/crm/territories"));
  assert(!canVisitRoute(customer,"/crm/leads"));
  assert(!canVisitRoute(customer,"/items"));
  assert(!canVisitRoute(customer,"/some-unknown-route"));
});

test("Human Resources and Marketing menus do not cross departmental roles",()=>{
  assert(canShowModuleInMenu(person("Administrator"),"/admin/employee-profiles"));
  assert(canShowModuleInMenu(person("Administrator"),"/people"));
  assert(canShowModuleInMenu(person("Marketing"),"/marketing"));
  assert(!canShowModuleInMenu(person("Marketing"),"/people"));
  assert(!canShowModuleInMenu(person("Sales Representative"),"/people"));
  assert(!canShowModuleInMenu(person("Sales Representative"),"/marketing"));
  assert(!canShowModuleInMenu(person("Operations"),"/marketing"));
});

test("retained rep self-delivery, account map, and quick visits route to existing screens",()=>{
  const rep=person("Sales Representative");
  assert(canVisitRoute(rep,"/crm/self-delivery"));
  assert(canVisitRoute(rep,"/crm/account-map"));
  assert(canVisitRoute(rep,"/crm/quick-visit"));
  assert.equal(pageForPath("/crm/self-delivery"),"orders");
  assert.equal(pageForPath("/crm/account-map"),"salesMap");
  assert.equal(pageForPath("/crm/quick-visit"),"quickVisit");
  assert(!requiresPrototypePage("/crm/self-delivery"));
  assert(!requiresPrototypePage("/portal/orders"));
  assert(requiresPrototypePage("/portal/account"));
});

test("planned modules are identified without authorizing hidden or unknown paths",()=>{
  const paths=MENU_GROUPS.flatMap(group=>group.entries.map(entry=>entry.path));
  assert.equal(new Set(paths).size,paths.length,"No module path may be duplicated");
  assert.equal(pageForPath("/admin/access"),"settings");
  assert(!canVisitRoute(person("Sales Representative"),"/admin/access"));
  assert(canVisitRoute(person("Administrator"),"/admin/access"));
  assert(!canVisitRoute(person("Administrator"),"/not-real"));
});
