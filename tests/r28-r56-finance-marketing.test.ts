import test from "node:test";import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MENU_GROUPS,pageForPath,requiresPrototypePage,canVisitRoute} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const user=(role:WorkspaceUser["role"])=>({id:"test",name:"Test",firstName:"Test",
 initials:"TE",email:"test@example.invalid",title:"Test",role,team:"Sales",accent:"#abc"}) as WorkspaceUser;
test("R28 finance overview integrates source projections and preserves existing demo reimbursement workflow",()=>{
 const s=readFileSync("components/prototype/finance-workspace-experience.tsx","utf8");
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 assert(s.includes("financeOverviewSource(data,commerce,scope.orders)"));
 assert(s.includes("<FinancePage/>"));
 assert(s.includes("Reconciliation required"));
 assert(s.includes('currentUser.role==="Sales Manager"&&canManageUser'));
 assert(s.includes("bank reconciliation"));
 assert(hub.includes('if(path==="/finance")return <FinanceWorkspaceExperience/>'));
 assert(requiresPrototypePage("/finance"));
});
test("R28/R75 finance changes cannot be emitted by connected browser sessions",()=>{
 const s=readFileSync("lib/finance-context.tsx","utf8");
 assert(s.includes('const localDemoWrite = runtime.isDemo && momentumStorage.mode() === "local";'));
 assert(s.includes('if (localDemoWrite && typeof window !== "undefined") momentumStorage.setItem'));
 for(const name of ["submitExpense","managerDecision","financeDecision","markExpensePaid"]){
  const a=s.indexOf("const "+name+" =");
  assert(a>=0,name);
  assert(s.slice(a,a+230).includes("if (!localDemoWrite)"),name);
 }
});
test("R56 Campaigns and Marketing Operations share one navigation entry without killing secure legacy editor",()=>{
 const all=MENU_GROUPS.flatMap(g=>g.entries);
 assert(!all.some(e=>e.path==="/marketing/workflow"));
 assert(all.some(e=>e.path==="/marketing"));
 assert(pageForPath("/marketing/workflow")==="settings");
 assert(requiresPrototypePage("/marketing/workflow"));
 assert(canVisitRoute(user("Administrator"),"/marketing/workflow"));
 assert(!canVisitRoute(user("Sales Representative"),"/marketing/workflow"));
 const page=readFileSync("components/prototype/marketing-workspace-experience.tsx","utf8");
 assert(page.includes('navigateToRoute("/marketing/workflow")'));
});
