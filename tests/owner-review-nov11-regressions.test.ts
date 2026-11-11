import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {visibleActiveEmployees} from "../lib/employee-directory-visibility";
import {MENU_GROUPS,canVisitRoute,pageForPath,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const user=(id:string,employmentStatus?:"Active"|"Separated"):WorkspaceUser=>({
 id,role:"Sales Representative",name:id,firstName:id,initials:"AB",accent:"#123",
 title:"Sales",team:"Sales",email:id+"@example.invalid",employmentStatus,
});
test("Owner review: suspended, separated and unverified staff are absent from active directory",()=>{
 const people=[user("active","Active"),user("suspended","Active"),user("separated","Separated"),user("unverified","Active")];
 const access={active:{accountState:"Active" as const},
  suspended:{accountState:"Suspended" as const},separated:{accountState:"Active" as const}};
 assert.deepEqual(visibleActiveEmployees(people,access).map(p=>p.id),["active"]);
 assert.deepEqual(visibleActiveEmployees(people).map(p=>p.id),["active","suspended","unverified"]);
});
test("Owner review: leads default to complete directory, not qualified-only pipeline",()=>{
 const ui=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const lead=ui.slice(ui.indexOf("function AccountsDirectory"),ui.indexOf("function ",ui.indexOf("function AccountsDirectory")+20));
 assert(lead.includes('useState<"table"|"followups">("table")'));
 assert(!lead.includes('["Prospect","Qualified","Sampled"].includes(a.stage)'));
 assert(!lead.includes("Lead pipeline"));
 assert(lead.includes("All accessible leads in one list"));
});
test("Owner review: rep self-delivery lists undelivered orders and preserves cloud signature sequence",()=>{
 const ui=readFileSync("components/orders/rep-self-delivery.tsx","utf8");
 assert(ui.includes('["Awaiting approval","Approved","Allocated","Out for delivery"].includes(order.status)'));
 assert(!ui.includes('["Approved","Allocated","Out for delivery","Delivered"].includes(order.status)'));
 assert(ui.includes("Deliver this order"));
 assert(ui.includes("DeliverySignaturePad"));
 assert(ui.includes('firebaseFunctionUrl("repSelfDelivery")'));
});
test("Owner review: CRM menu eliminates Deals and duplicate territory tab, preserves safe aliases",()=>{
 const links=MENU_GROUPS.flatMap(g=>g.entries);
 assert(!links.some(l=>l.path==="/crm/deals"||l.path==="/crm/territories"||l.path==="/crm/commission-only"));
 assert(links.some(l=>l.path==="/crm/account-map"));
 assert(links.some(l=>l.path==="/admin/commission-readiness"));
 assert(!links.some(l=>l.path==="/reports/explorer"));
 assert(pageForPath("/crm/territories")==="salesMap");
 assert(requiresPrototypePage("/crm/territories"));
 const admin={...user("administrator"),role:"Administrator" as const};
 assert(canVisitRoute(admin,"/admin/commission-readiness"));
});
test("Owner review: approval queue has direct interactive entry point",()=>{
 const ui=readFileSync("components/prototype/action-center-experience.tsx","utf8");
 assert(ui.includes("Start with work waiting on you"));
 assert(ui.includes('onClick={()=>navigateToRoute("/work/approvals")}'));
 assert(ui.includes("Open approval queue"));
});

test("Owner review R85: Audit Center supports actor, action, period and departmental investigation",()=>{
 const audit=readFileSync("components/audit/audit-center.tsx","utf8");
 assert(audit.includes("Audit Center"));
 for(const field of ["Filter audit actor","Filter audit action","Audit start date","Audit end date",
   "Filter record history by area","Search audit history"]){
  assert(audit.includes(field),field);
 }
 assert(audit.includes("auditWriteBlocked"),"Unsafe audit source must remain protected");
 assert(audit.includes("auditRecoveryArchive"),"Legacy evidence recovery must remain available");
 assert(audit.includes("up to 250 events")||audit.includes("limited to 250 events"),
  "History pagination limitation must be disclosed, not claimed complete");
});
test("Owner review R63: Help routes to consolidated work, reports and week review destinations",()=>{
 const help=readFileSync("components/pages/help.tsx","utf8");
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 for(const path of ["/work/actions","/crm/account-map","/operations/field-schedule",
   "/reports/center","/people/attendance"])assert(help.includes(path),path);
 assert(hub.includes('if(path==="/help")return'));
 assert(!help.includes('label:"Territories & Map",path:"/crm/territories"'));
});
