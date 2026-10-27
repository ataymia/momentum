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

test("phone accounts keep full-width business names and only approved stage filters",()=>{
  const accounts=read("components/pages/accounts.tsx");
  const css=read("app/device-adaptive.css");
  assert.match(accounts,/const stages=\["All","Prospect","Opening order"\] as const/);
  assert.match(accounts,/stage==="Prospect"\?"Prospects"/);
  assert.match(accounts,/stage==="Opening order"\?"Open Accounts"/);
  assert.match(accounts,/\{stageFilterDisplay\(item\)\}/);
  assert.doesNotMatch(accounts,/const stages=.*"Reordered"/);
  assert.doesNotMatch(accounts,/const stages=.*"At risk"/);
  assert.match(css,/\.account-name-cell\{[\s\S]*?grid-column:1\/-1;display:flex;flex-direction:row/);
  assert.match(css,/\.account-name-cell :is\(strong,small\)\{[\s\S]*?white-space:normal/);
  assert.match(css,/\.account-table-body>button\.account-table>span:nth-child\(2\)\{\s*grid-column:1/);
});
