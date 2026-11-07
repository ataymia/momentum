import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {canVisitRoute,pageForPath,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";

const user=(role:WorkspaceUser["role"]):WorkspaceUser=>({
 id:"role-"+role,email:"role@example.invalid",role,team:"Marketing",
 name:"Test User",firstName:"Test",initials:"TU",title:"Tester",accent:"#111",
});

test("Saturday sprint keeps single and bulk invoice printing within authorized invoice pages",()=>{
 const source=readFileSync("components/prototype/commerce-experience.tsx","utf8");
 assert.match(source,/Print \/ Save PDF \(single or bulk\)/);
 assert.match(source,/allowedInvoiceIds=\{rows\.map\(x=>x\.invoice\.id\)\}/);
 assert.match(source,/allowedInvoiceIds=\{\[invoice\.id\]\}/);
 assert.match(source,/InvoicePrintCenter/);
 assert.match(source,/downloadCsv/);
 assert.equal(canVisitRoute(user("Customer"),"/sales/invoices"),false);
 assert.equal(canVisitRoute(user("Administrator"),"/sales/invoices"),true);
});
test("Administrator weekly-report obligations are excluded from action policy while manager review remains",()=>{
 const source=readFileSync("lib/action-center-policy-v2.ts","utf8");
 assert.match(source,/admin\?\[\]:weeklyReportingObligations\(performance,currentUser\.id,today\)/);
 assert.match(source,/rep-weekly-overdue/);
 assert.match(source,/weekly\.delinquent\.manager/);
});
test("Marketing role opens redesigned requests only; administrator owns spend, campaign, and attribution actions",()=>{
 const source=readFileSync("components/prototype/marketing-workspace-experience.tsx","utf8");
 assert.equal(pageForPath("/marketing"),"marketing");
 assert(requiresPrototypePage("/marketing"));
 assert(canVisitRoute(user("Marketing"),"/marketing"));
 assert(!canVisitRoute(user("Marketing"),"/marketing/workflow"));
 assert(canVisitRoute(user("Administrator"),"/marketing/workflow"));
 assert(!canVisitRoute(user("Customer"),"/marketing"));
 assert.match(source,/admin\?state\.requests:state\.requests\.filter\(r=>r\.requesterId===currentUser\.id\)/);
 assert.match(source,/admin\?state\.campaigns/);
 assert.match(source,/admin\?state\.spend/);
 assert.match(source,/demo&&/);
 assert.match(source,/submitRequest\(/);
 assert.match(source,/createCampaign\(/);
 assert.match(source,/decideCampaign\(/);
 assert.match(source,/decideSpend\(/);
 assert.match(source,/reviewAttribution\(/);
 assert.match(source,/downloadCsv\(/);
});
test("Marketing and HR workstreams remain separate yet preserve controlled operational legacy paths",()=>{
 const source=readFileSync("components/prototype/operations-hub.tsx","utf8");
 for(const marker of [
  'if(path==="/marketing")return <MarketingWorkspaceExperience/>;',
  'if(path==="/marketing/workflow")return currentUser?.role==="Administrator"&&writeEnabled?',
  'if(path==="/people/onboarding")return <HrOnboardingExperience/>;',
  'if(path==="/people/payroll")return <PayrollWorkflowExperience/>;',
  'if(path==="/admin/employee-profiles")return <HrPersonnelDirectory/>;',
 ])assert(source.includes(marker),marker);
 assert(canVisitRoute(user("Administrator"),"/people/payroll/workflow"));
 assert(!canVisitRoute(user("Marketing"),"/people/payroll/workflow"));
 assert(requiresPrototypePage("/people/payroll/workflow"));
});


test("Customer invoice portal uses authorized fulfilled order and matching account before print",()=>{
 const portal=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const center=readFileSync("components/finance/invoice-print-center.tsx","utf8");
 assert.match(portal,/if\(section==="invoices"\)/);
 assert.match(portal,/if\(section==="invoices"&&\(!runtime\.isDemo\|\|momentumStorage\.mode\(\)!=="local"\)\)/);
 assert.match(portal,/accountIds\.has\(o\.accountId\)/);
 assert.match(portal,/order\.accountId===invoice\.accountId/);
 assert.match(portal,/allowedInvoiceIds=\{visibleIds\}/);
 assert.match(portal,/downloadCsv\("momentum-my-invoices.csv",visibleRegister/);
 assert.match(portal,/invoiceBalance\(commerce,invoice\)/);
 assert.match(portal,/allowedOrderIds=\{\[\.\.\.new Set\(visibleInvoices\.map\(invoice=>invoice\.orderId\)\)\]\}/);
 assert.match(center,/accountIds\.has\(invoice\.accountId\)/);
 assert.match(center,/orderAccounts\.get\(invoice\.orderId\)===invoice\.accountId/);
 assert.match(center,/window\.print\(\)/);
 assert(canVisitRoute(user("Customer"),"/portal/invoices"));
 assert(!canVisitRoute(user("Customer"),"/sales/invoices/cross-account-id"));
});


test("employee leave creation uses event-generated IDs and authorized Firestore persistence, without render-time random sources",()=>{
 const src=readFileSync("components/prototype/hr-time-off-experience.tsx","utf8");
 assert.match(src,/newLeaveRequestId\(\)/);
 assert.doesNotMatch(src,/Date\.now\(\)|Math\.random\(\)/);
 assert.match(src,/writeEnabled=\(runtime\.isDemo&&storageMode==="local"\)\|\|storageMode==="firestore"/);
 assert.match(src,/flushAndConfirm\(HCM_STORAGE_KEY\)/);
});
