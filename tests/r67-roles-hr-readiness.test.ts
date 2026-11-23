import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {MENU_GROUPS,canVisitRoute,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const user=(role:WorkspaceUser["role"])=>({id:role,email:"x@example.invalid",name:"Test",
 firstName:"Test",title:"Test",initials:"TE",accent:"#abc",team:"Operations",role}) as WorkspaceUser;
test("R67 Users & Roles is a real administrator-only source-linked route",()=>{
 const all=MENU_GROUPS.flatMap(g=>g.entries);
 assert(all.some(entry=>entry.path==="/admin/access"&&entry.state==="prototype"));
 assert(requiresPrototypePage("/admin/access"));
 assert(canVisitRoute(user("Administrator"),"/admin/access"));
 assert(!canVisitRoute(user("Sales Representative"),"/admin/access"));
 assert(!canVisitRoute(user("Customer"),"/admin/access"));
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const ui=readFileSync("components/prototype/users-roles-experience.tsx","utf8");
 assert(hub.includes('if(path==="/admin/access")return <UsersRolesExperience/>'));
 assert(ui.includes("firebase?.accessRecords"));
 assert(ui.includes("<FirebaseAccessPanel/>"));
 assert(ui.includes("Directory/access conflicts"));
 assert(ui.includes("No live access change is available"));
});
test("R38/R40 administrative HR overview displays source-linked compliance blockers without certifying hires",()=>{
 const ui=readFileSync("components/prototype/hr-payroll-experiences.tsx","utf8");
 assert(ui.includes("hiringReadiness(employee,hcm.documents)"));
 assert(ui.includes("Records needing compliance review"));
 assert(ui.includes('path="/people/compliance"'));
 assert(ui.includes("would not certify legal onboarding"));
 const newHire=readFileSync("components/prototype/hr-new-hire-experience.tsx","utf8");
 assert(newHire.includes('navigateToRoute("/admin/employees")'));
});
