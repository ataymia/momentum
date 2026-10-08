import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ui=readFileSync("components/ui.tsx","utf8");
const login=readFileSync("components/login-screen.tsx","utf8");
const driver=readFileSync("components/delivery-driver-shell.tsx","utf8");
const layout=readFileSync("app/layout.tsx","utf8");
const css=readFileSync("app/mobile-platform.css","utf8");

test("shared site branding and login hero use verified uploaded artwork, never M placeholder or malformed WebP",()=>{
  assert.match(ui,/momentum-invoice-brand\\.jpg/);
  assert.match(ui,/brand__art/);
  assert.doesNotMatch(ui,/className="brand__mark"/);
  assert.match(login,/momentum-invoice-brand\\.jpg/);
  assert.doesNotMatch(login,/momentum-golden-eagle\\.webp/);
});
test("mobile devices receive viewport sizing and narrow sign-in form",()=>{
  assert.match(layout,/width: "device-width", initialScale: 1/);
  assert.match(layout,/mobile-platform\\.css/);
  assert.match(css,/@media screen and \\(max-width:900px\\)/);
  assert.match(css,/\\.login-page \\{ display:flex; flex-direction:column/);
  assert.match(css,/\\.login-form input \\{ font-size:16px/);
});
test("delivery shell header and tabs use constrained mobile layout without affecting tab modules",()=>{
  assert.match(driver,/driver-shell-header/);
  assert.match(driver,/driver-shell-nav/);
  assert.match(driver,/aria-current=\\{tab===key/);
  assert.match(driver,/driver-shell-signout/);
  assert.match(css,/\\.driver-shell-nav \\{/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/\\.driver-shell-nav \\.driver-shell-tab \\{[\\s\\S]*min-width:max-content/);
  for (const name of ["DeliveriesPage","DeliveryRequestsPage","InventoryPage","PeoplePage","EmployeeDirectory","HelpPage"]) {
    assert.ok(driver.includes(name));
  }
});
test("invoice registers and modal previews scroll locally on narrow screens",()=>{
  assert.match(css,/\\.invoice-register \\{[^}]*overflow-x:auto/);
  assert.match(css,/\\.invoice-preview-shell \\{[^}]*overflow-x:auto/);
  assert.match(css,/max-height:calc\\(100dvh - 20px\\)/);
});
