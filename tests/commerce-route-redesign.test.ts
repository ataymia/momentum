import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {
  canVisitRoute,
  pageForPath,
  requiresPrototypePage,
  routeLabel,
} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";

const person=(role:WorkspaceUser["role"]):WorkspaceUser=>({
  id:"demo-"+role,name:"Example",firstName:"Example",email:"example@example.invalid",
  initials:"EX",role,team:role==="Customer"?"Customer":"Sales",
  title:"Example",accent:"#000",
});

test("each commerce directory is its own prototype route",()=>{
  for(const route of ["/sales/orders","/sales/invoices","/sales/payments"]){
    assert(requiresPrototypePage(route),route);
    assert(canVisitRoute(person("Administrator"),route));
  }
  assert.equal(pageForPath("/sales/orders"),"orders");
  assert.equal(pageForPath("/sales/invoices"),"orderCash");
  assert.equal(pageForPath("/sales/payments"),"orderCash");
});
test("shareable record paths are available to authorized staff",()=>{
  for(const [path,label] of [
    ["/sales/orders/order-safe","Order details"],
    ["/sales/invoices/invoice-safe","Invoice details"],
    ["/sales/payments/payment-safe","Payment details"],
  ]){
    assert.equal(requiresPrototypePage(path),true);
    assert.equal(canVisitRoute(person("Administrator"),path),true);
    assert.equal(routeLabel(path),label);
  }
});
test("customer cannot open internal invoice or payment records",()=>{
  const customer=person("Customer");
  for(const path of ["/sales/invoices","/sales/invoices/a","/sales/payments","/sales/payments/a"]){
    assert.equal(canVisitRoute(customer,path),false,path);
  }
  assert(canVisitRoute(customer,"/portal/orders"));
  assert(canVisitRoute(customer,"/portal/invoices"));
});
test("existing fulfillment and rep self-delivery remain accessible only by permitted users",()=>{
  const rep=person("Sales Representative");
  assert.equal(pageForPath("/sales/orders/workflow"),"orders");
  assert.equal(requiresPrototypePage("/sales/orders/workflow"),false);
  assert(canVisitRoute(rep,"/sales/orders/workflow"));
  assert(canVisitRoute(rep,"/crm/self-delivery"));
  assert(!canVisitRoute(person("Marketing"),"/sales/orders/workflow"));
});
test("commerce prototype reads authoritative records without creating, charging, or emailing",()=>{
  const src=readFileSync("components/prototype/commerce-experience.tsx","utf8");
  assert.match(src,/invoiceBalance\(commerce,invoice\)/);
  assert.match(src,/computedInvoiceStatus\(commerce,invoice\)/);
  assert.match(src,/scope\.accounts/);
  assert.match(src,/scope\.orders/);
  assert.doesNotMatch(src,/\brecordPayment\(/);
  assert.doesNotMatch(src,/\bcreateOrder\(/);
  assert.doesNotMatch(src,/\bsendEmail\(/);
});

test("phone orders render readable cards while the sortable desktop table remains",()=>{
  const src=readFileSync("components/prototype/commerce-experience.tsx","utf8");
  const css=readFileSync("app/mobile-sales-orders.css","utf8");
  const layout=readFileSync("app/layout.tsx","utf8");
  assert.match(src,/momentum-order-desktop-table/);
  assert.match(src,/momentum-mobile-order-list/);
  assert.match(src,/momentum-mobile-order-card__facts/);
  assert.match(src,/Mobile order sort/);
  assert.match(src,/sorter\.select\(sorter\.field\)/);
  assert.match(css,/@media screen and \(max-width:640px\)/);
  assert.match(css,/\.momentum-order-desktop-table\{display:none!important\}/);
  assert.match(css,/\.momentum-mobile-order-card/);
  assert.match(layout,/import "\.\/mobile-sales-orders\.css"/);
});

test("administrators have a nonblank handoff instead of a representative self-delivery form",()=>{
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  const view=readFileSync("components/orders/rep-self-delivery.tsx","utf8");
  assert(canVisitRoute(person("Administrator"),"/crm/self-delivery"));
  assert.match(hub,/currentUser\?\.role==="Sales Representative"\s*\?<RepSelfDelivery\/>/);
  assert.match(hub,/Administrator delivery oversight/);
  assert.match(hub,/Open Delivery Operations/);
  assert.match(view,/if\(currentUser\?\.role!=="Sales Representative"\)return null/);
});
