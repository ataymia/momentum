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

test("server-backed rep self-delivery is redesigned while account map and quick visits retain existing workflow",()=>{
  const rep=person("Sales Representative");
  assert(canVisitRoute(rep,"/crm/self-delivery"));
  assert(canVisitRoute(rep,"/crm/account-map"));
  assert(canVisitRoute(rep,"/crm/quick-visit"));
  assert.equal(pageForPath("/crm/self-delivery"),"orders");
  assert.equal(pageForPath("/crm/account-map"),"salesMap");
  assert.equal(pageForPath("/crm/quick-visit"),"quickVisit");
  assert(requiresPrototypePage("/crm/self-delivery"));
  assert(!canVisitRoute(person("Operations"),"/crm/self-delivery"));
  assert(!canVisitRoute(person("Sales Manager"),"/crm/self-delivery"));
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

test("F05 F13 F14: private HR routes are denied to non-admin roles even by direct link",()=>{
  const admin=person("Administrator"),rep=person("Sales Representative"),marketer=person("Marketing");
  for(const path of ["/people/new-hire","/people/onboarding","/people/onboarding/workflow","/people/payroll","/people/payroll/workflow","/people/training"]){
    assert(canVisitRoute(admin,path),path);
    assert(!canVisitRoute(rep,path),path);
    assert(!canVisitRoute(marketer,path),path);
  }
  assert(canVisitRoute(rep,"/people/leave"));
  assert(canVisitRoute(rep,"/people/timekeeping"));
  assert(canVisitRoute(marketer,"/marketing"));
  const labels=MENU_GROUPS.flatMap(g=>g.entries.map(e=>e.label.toLowerCase()));
  for(const excluded of ["calls","solutions","internal instant messaging","gmail inbox"]) assert(!labels.includes(excluded));
});

test("F07/R56: Campaigns bookmark remains admin-only without duplicate sidebar link",()=>{
 const admin=person("Administrator"),marketing=person("Marketing");
 assert(canVisitRoute(admin,"/marketing/campaigns"));
 assert(!canShowModuleInMenu(admin,"/marketing/campaigns"),"Campaigns is a tab within Marketing, not a duplicate top-level menu link");
 assert(!canVisitRoute(marketing,"/marketing/campaigns"));
 assert(!canShowModuleInMenu(marketing,"/marketing/campaigns"));
 assert(canVisitRoute(marketing,"/marketing"));
});

test("F08 F13: warehouse, driver, and ambassador cannot open commercial cash forecasts",()=>{
 for(const role of ["Warehouse","Delivery Driver","Brand Ambassador"] as const)
   assert(!canVisitRoute(person(role),"/reports/forecasts"),role);
 for(const role of ["Administrator","Sales Manager","Sales Representative","Operations"] as const)
   assert(canVisitRoute(person(role),"/reports/forecasts"),role);
});
test("F08 F13: reporting summaries and manager KPI scopes do not leak global cash counts",async()=>{
 const fs=await import("node:fs");
 const report=fs.readFileSync("components/pages/reports.tsx","utf8");
 const dashboard=fs.readFileSync("components/performance/management-kpi-dashboard.tsx","utf8");
 assert(report.includes("visibleClearedPayments"));
 assert(report.includes("showCommercial?"));
 assert(report.includes("showKpiCenter&&!refundAllocationBlocked&&<ManagementKpiDashboard/>"));
 assert(dashboard.includes("currentUser ? [currentUser.id] : []"));
});

test("R05–R09 staff see their own Account rather than the HR administration menu",()=>{
  for(const role of ["Sales Representative","Sales Manager","Marketing","Operations","Warehouse"] as const){
    const employee=person(role);
    for(const path of ["/my-account","/my-account/employee","/my-account/time-off","/my-account/pay","/my-account/training"]){
      assert(canShowModuleInMenu(employee,path),role+" "+path);
    }
    assert(!canShowModuleInMenu(employee,"/people/leave"),role+" HR administration must be hidden");
    assert(!canShowModuleInMenu(employee,"/people/attendance"),role+" HR attendance must be hidden");
    assert(!canShowModuleInMenu(employee,"/people/performance"),role+" HR performance must be hidden");
    assert(!canShowModuleInMenu(employee,"/people/onboarding"),role+" onboarding");
    assert(!canShowModuleInMenu(employee,"/people/payroll"),role+" payroll");
  }
});
