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
