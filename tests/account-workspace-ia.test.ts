import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  MENU_GROUPS,canShowModuleInMenu,canVisitRoute,pageForPath,routeLabel,
} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";

const person=(role:WorkspaceUser["role"]):WorkspaceUser=>({
  id:"employee-1",name:"Example Employee",firstName:"Example",email:"employee@example.invalid",
  initials:"EE",title:"Employee",accent:"#123456",role,team:role==="Customer"?"Customer":"Sales",
});
const workspace=MENU_GROUPS.find(group=>group.label==="Workspace");
const account=MENU_GROUPS.find(group=>group.label==="Account");

test("R01–R04 workspace starts with work and retains meeting invitations, calendar and agenda",()=>{
  assert(workspace);
  assert.deepEqual(workspace.entries.slice(0,3).map(entry=>entry.path),["/","/people/timekeeping","/work/actions"]);
  assert(workspace.entries.some(entry=>entry.path==="/calendar"));
  assert(workspace.entries.some(entry=>entry.path==="/calendar/meetings"));
  assert(workspace.entries.some(entry=>entry.path==="/calendar/invitations"));
  assert(workspace.entries.some(entry=>entry.path==="/calendar/agenda"));
  for(const personal of ["/self-service","/self-service/leave","/self-service/pay","/work/completed","/people/materials"]){
    assert(!workspace.entries.some(entry=>entry.path===personal),personal+" must not clutter Workspace");
  }
});

test("R05–R08 Account contains distinct employee-only paths, business accounts remain Sales & CRM",()=>{
  assert(account);
  assert.deepEqual(account.entries.map(entry=>entry.path),[
    "/my-account","/my-account/employee","/my-account/time-off",
    "/my-account/pay","/my-account/training","/my-account/completed",
  ]);
  assert(MENU_GROUPS.find(group=>group.label==="Sales & CRM")?.entries.some(entry=>entry.path==="/sales/customers"));
  for(const entry of account.entries)assert.equal(pageForPath(entry.path),entry.permission);
});

test("R09 personal routes permit staff self-service, never customer access or full HR administration",()=>{
  for(const role of ["Administrator","Sales Representative","Delivery Driver","Brand Ambassador","Marketing"] as const){
    const user=person(role);
    for(const entry of account!.entries)assert(canVisitRoute(user,entry.path),role+" "+entry.path);
    assert(canShowModuleInMenu(user,"/my-account"));
  }
  const customer=person("Customer");
  for(const entry of account!.entries)assert(!canVisitRoute(customer,entry.path));
  assert(!canVisitRoute(person("Sales Representative"),"/people/onboarding"));
  assert(!canShowModuleInMenu(person("Sales Representative"),"/people/new-hire"));
});

test("R09 personal Account only resolves the signed-in employee, not an arbitrary HR record ID",()=>{
  const accountUi=readFileSync("components/prototype/employee-account-experience.tsx","utf8");
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  assert.match(accountUi,/userId===currentUser\.id/);
  assert.match(accountUi,/employeeId===currentUser\.id/);
  assert.match(accountUi,/payroll\.runs\.filter\(run=>run\.status==="Released"\)/);
  assert.match(accountUi,/scope\.timecards\.filter\(item=>item\.userId===currentUser\.id\)/);
  assert.match(hub,/HrTimeOffExperience personalOnly/);
  assert.match(hub,/CompletedWorkExperience personalOnly/);
  assert.match(hub,/EmployeeAccountExperience section="pay"/);
  assert.match(hub,/if\(path==="\/my-account"/);
  for(const obsolete of ["/self-service","/self-service/leave","/self-service/pay","/work/completed"]){
    assert(canVisitRoute(person("Administrator"),obsolete),"legacy copied link must stay usable: "+obsolete);
  }
});

test("Employee profile and training statuses do not pretend to provide unrestricted original PDF files",()=>{
  const ui=readFileSync("components/prototype/employee-account-experience.tsx","utf8");
  assert.match(ui,/This is document status metadata, not an authenticated PDF download/);
  assert.match(ui,/usePayroll\(\)/);
  assert.match(ui,/useHcm\(\)/);
  assert.match(ui,/Back to My Account/);
});
