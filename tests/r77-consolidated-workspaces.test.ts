import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MENU_GROUPS,canShowModuleInMenu,canVisitRoute,pageForPath,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const person=(role:WorkspaceUser["role"]):WorkspaceUser=>({
 id:"p-"+role,role,name:"Test",firstName:"Test",email:"test@example.invalid",
 initials:"TE",title:"Test",team:"Sales",accent:"#123"
});
test("R27/R34/R60/R65: duplicate menu destinations are removed but deep links are maintained",()=>{
 const links=MENU_GROUPS.flatMap(group=>group.entries);
 assert.equal(new Set(links.map(entry=>entry.path)).size,links.length);
 for(const absent of ["/crm/territory-map","/operations/legacy-dispatch",
   "/admin/employee-profiles","/admin/employee-profiles/workflow","/reports/performance"]){
  assert(!links.some(entry=>entry.path===absent),"Duplicate menu path: "+absent);
 }
 for(const present of ["/crm/territories","/operations/field-schedule",
   "/operations/deliveries","/admin/employees","/reports","/reports/center"]){
  assert(links.some(entry=>entry.path===present),"Missing consolidated route: "+present);
 }
 assert.equal(pageForPath("/crm/territory-map"),"salesMap");
 assert.equal(pageForPath("/operations/legacy-dispatch"),"dispatch");
 assert.equal(pageForPath("/admin/employee-profiles"),"settings");
 for(const path of ["/crm/territories","/crm/territory-map",
   "/admin/employee-profiles","/admin/employees","/reports"]){
  assert(requiresPrototypePage(path),path);
 }
 assert(canVisitRoute(person("Administrator"),"/admin/employee-profiles"));
 assert(!canVisitRoute(person("Customer"),"/admin/employee-profiles"));
 assert(!canShowModuleInMenu(person("Administrator"),"/admin/employee-profiles"));
 assert(canShowModuleInMenu(person("Administrator"),"/admin/employees"));
});
test("R34/R35 office scheduling is preserved with a modern route and actual shipment actions",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const fulfillment=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
 assert(hub.includes('if(path==="/operations/field-schedule"||path==="/operations/legacy-dispatch")'));
 assert.match(hub,/<DispatchPage\/>/);
 assert.match(fulfillment,/tab==="scheduling"/);
 assert.match(fulfillment,/Review shipment workflow/);
 assert.match(fulfillment,/ShipmentWorkflowControls/);
 assert(canVisitRoute(person("Sales Representative"),"/operations/field-schedule"));
 assert(!canVisitRoute(person("Customer"),"/operations/field-schedule"));
});
test("R55/R75 connected ambassador event edits cannot claim a successful save",()=>{
 const context=readFileSync("lib/brand-ambassador-context.tsx","utf8");
 const page=readFileSync("components/pages/brand-ambassadors.tsx","utf8");
 assert.match(context,/localDemoWrite=runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(context,/Connected event scheduling requires a trusted server workflow/);
 assert.match(context,/Connected event editing requires a trusted server workflow/);
 assert.match(context,/if\(!localDemoWrite\)return false/);
 assert.match(page,/Search Brand Ambassador events/);
 assert.match(page,/Connected Brand Ambassador events are read-only/);
});
test("R58-R61/R64 source workflows remain accessible inside consolidated reports and admin",()=>{
 const reports=readFileSync("components/prototype/reports-workspace-experience.tsx","utf8");
 const admin=readFileSync("components/prototype/admin-overview-experience.tsx","utf8");
 assert.match(reports,/<InsightsExplorerExperience\/>/);
 assert.match(reports,/<ReportsPage\/>/);
 assert.match(reports,/<PerformanceWorkspacePage\/>/);
 assert.match(reports,/bank deposits/);
 assert.match(admin,/<SettingsPage\/>/);
 assert.match(admin,/Users & Roles/);
 assert.match(admin,/Account Consolidation/);
 assert.match(admin,/Missing-document records/);
 assert(canVisitRoute(person("Administrator"),"/admin"));
 assert(!canVisitRoute(person("Sales Representative"),"/admin"));
});
