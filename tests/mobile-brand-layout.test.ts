import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const ui = readFileSync("components/ui.tsx", "utf8");
const login = readFileSync("components/login-screen.tsx", "utf8");
const driver = readFileSync("components/delivery-driver-shell.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/mobile-platform.css", "utf8");

test("shared branding and login hero use verified artwork, not the M or broken WebP", () => {
  assert.ok(ui.includes("momentum-invoice-brand.jpg"));
  assert.ok(ui.includes("brand__art"));
  assert.ok(!ui.includes('className="brand__mark"'));
  assert.ok(login.includes("momentum-invoice-brand.jpg"));
  assert.ok(!login.includes("momentum-golden-eagle.webp"));
});

test("mobile viewport and sign-in screen keep login accessible at phone widths", () => {
  assert.ok(layout.includes('width: "device-width", initialScale: 1'));
  assert.ok(layout.includes('"./mobile-platform.css"'));
  assert.ok(css.includes("@media screen and (max-width:900px)"));
  assert.ok(css.includes(".login-page { display:flex; flex-direction:column"));
  assert.ok(css.includes(".login-form input { font-size:16px"));
});

test("driver shell uses constrained header, accessible scroll tabs, and preserves all workflows", () => {
  assert.ok(driver.includes("driver-shell-header"));
  assert.ok(driver.includes("driver-shell-nav"));
  assert.ok(driver.includes('aria-current={tab===key?"page":undefined}'));
  assert.ok(driver.includes("driver-shell-signout"));
  assert.ok(css.includes(".driver-shell-nav {"));
  assert.ok(css.includes("overflow-x:auto"));
  assert.ok(css.includes(".driver-shell-nav .driver-shell-tab {"));
  assert.ok(css.includes("min-width:max-content"));
  for (const name of ["DeliveriesPage", "DeliveryRequestsPage", "InventoryPage", "PeoplePage", "EmployeeDirectory", "HelpPage"]) {
    assert.ok(driver.includes(name), name);
  }
});

test("invoice table and preview remain scrollable within phone width", () => {
  assert.ok(css.includes(".invoice-register {"));
  assert.ok(css.includes(".invoice-preview-shell {"));
  assert.ok(css.includes("max-height:calc(100dvh - 20px)"));
});
