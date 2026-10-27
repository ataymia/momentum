import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(file:string)=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
test("device navigation is wired to role-filtered menu with accessible mobile destinations",()=>{
  const shell=read("components/app-shell-v4.tsx");
  const component=read("components/navigation/device-navigation.tsx");
  assert.match(shell,/DeviceNavigation items=\{\[\.\.\.allowedPrimary,\.\.\.allowedSecondary\]\}/);
  assert.match(component,/aria-label="Mobile main navigation"/);
  assert.match(component,/aria-current=\{active\?"page":undefined\}/);
  assert.match(component,/aria-haspopup="dialog"/);
  assert.match(component,/aria-expanded=\{expanded\}/);
  assert.match(component,/event\.key==="Escape"/);
  assert.match(component,/setSidebarOpen\(false\)/);
  assert.match(component,/currentUser\.role==="Sales Representative"/);
  assert.match(component,/currentUser\.role==="Customer"/);
});
test("adaptive CSS is strictly confined to touch breakpoints and preserves desktop/print",()=>{
  const css=read("app/device-adaptive.css");
  const layout=read("app/layout.tsx");
  assert.match(layout,/import "\.\/device-adaptive\.css";/);
  assert.match(css,/@media screen and \(max-width:1023px\)/);
  assert.match(css,/@media screen and \(min-width:700px\) and \(max-width:1023px\)/);
  assert.match(css,/@media screen and \(max-width:699px\)/);
  assert.match(css,/\.device-bottom-nav/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table/);
  assert.match(css,/\.page--orders \.order-table-body>button\.order-table/);
  assert.match(css,/\.modal__body\{flex:1 1 auto/);
  assert.match(css,/font-size:16px/);
  assert.doesNotMatch(css,/@media print/);
});
test("delivery-driver independent shell and canonical viewport are preserved",()=>{
  const css=read("app/mobile-platform.css");
  const layout=read("app/layout.tsx");
  assert.match(css,/\.delivery-driver-shell/);
  assert.match(layout,/export const viewport/);
  assert.match(layout,/width: "device-width"/);
});

test("CRM mobile filters omit unverified stage queues without modifying account records",()=>{
  const accounts=read("components/pages/accounts.tsx");
  assert.match(accounts,/const stages=\["All","Prospect","Opening order"\] as const/);
  assert.match(accounts,/stageFilterDisplay=\(stage:/);
  assert.match(accounts,/"Prospects":"Open accounts"/);
  assert.match(accounts,/account\.stage===stage/);
  assert.doesNotMatch(accounts,/stages=\["All","Prospect","Qualified"/);
});

test("navigation and CRM browsing defer expensive sales calculations until requested",()=>{
  const shell=read("components/app-shell-v4.tsx");
  const accounts=read("components/pages/accounts.tsx");
  assert.doesNotMatch(shell,/evaluateSalesRepAccountBonuses/);
  assert.match(accounts,/tab==="incentives"\?evaluateSalesRepAccountBonuses/);
  assert.match(accounts,/tab==="pricing"\?scope\.accounts\.map/);
  assert.match(accounts,/selected&&\(accountPageId\|\|isCustomer\(currentUser\)\)\?evaluatePartnerPricing/);
});

test("CRM cards never inherit a wide desktop table on touch viewports",()=>{
  const css=read("app/device-adaptive.css");
  assert.match(css,/@media screen and \(max-width:1023px\)\{[\s\S]*?\.page--accounts \.account-list-panel\{min-width:0!important/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table\{\s*display:grid!important/);
  assert.match(css,/\.page--accounts \.account-table-body>button\.account-table \.account-name-cell :is\(strong,small\)\{/);
  assert.match(css,/white-space:normal;overflow-wrap:anywhere/);
});
