import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { Role, WorkspaceUser } from "../lib/types";
import { activeMenuPath, recordRouteMatch, routeHref } from "../lib/navigation-route-contract";
import { canVisitRoute, MENU_GROUPS, pageForPath, requiresPrototypePage, routeLabel } from "../lib/navigation-route-registry";
import { getNavigationRoute, navigateToRoute, startRouteNavigation } from "../lib/navigation-store";

const user = (role: Role): WorkspaceUser => ({
  id:"u",email:"u@example.invalid",name:"Person",firstName:"Person",
  initials:"PP",title:"Tester",role,team:"Sales",accent:"#123456",
});

test("all eight approved groups remain in one authenticated sidebar", () => {
  assert.deepEqual(MENU_GROUPS.map(group => group.label), [
    "Workspace","Sales & CRM","Commerce","Operations","Human Resources",
    "Marketing","Insights & Support","Administration",
  ]);
  const shell = readFileSync("components/app-shell-v4.tsx","utf8");
  assert.match(shell, /<NavigationGroups\/>/);
  assert.match(shell, /<SidebarRouteLink/);
  assert.doesNotMatch(shell, /<DeviceNavigation/);
  assert.match(shell, /if\(!canVisitRoute\(currentUser,route\)\)/);
  assert.match(shell, /aria-controls="momentum-primary-sidebar"/);
});

test("record contract covers CRM, customer, order, SKU, HR and portal direct links", () => {
  for (const [url, page] of [
    ["/crm/deals/id-1","accounts"],["/crm/deals/id-1/edit","accounts"],
    ["/crm/deals/new","accounts"],["/crm/contacts/id-1","accounts"],
    ["/sales/customers/id-1/transactions","accounts"],
    ["/sales/orders/id-1","orders"],["/sales/orders/id-1/edit","orders"],
    ["/sales/invoices/id-1","orderCash"],["/sales/payments/id-1","orderCash"],
    ["/sales/returns/id-1","orders"],["/sales/credit-notes/id-1","orderCash"],
    ["/items/sku-id/history","products"],["/inventory/lots/lot-id","inventory"],
    ["/inventory/shipments/ship-id","inventory"],
    ["/admin/employee-profiles/uid-1/documents","settings"],
    ["/portal/orders/id-1","orders"],["/portal/deliveries/id-1","orders"],
  ] as const) {
    assert.equal(recordRouteMatch(url)?.page,page,url);
    assert.equal(pageForPath(url),page,url);
    assert.equal(requiresPrototypePage(url),true,url);
  }
  assert.equal(routeLabel("/crm/deals/op-1"),"Deal details");
  assert.equal(routeLabel("/crm/contacts/contact-1"),"Contact details");
  assert.equal(routeLabel("/crm/deals/new"),"New deal");
  assert.equal(routeLabel("/sales/orders/new"),"Create sales order");
});

test("no unregistered nested URL can show privileged or unrelated legacy workspace", () => {
  for (const url of [
    "/crm/deals/id-1/arbitrary/extra","/crm/contacts/id-1/edit",
    "/items/sku-id/unknown","/sales/orders/order-1/not-real",
    "/admin/employee-profiles/uid-1/private/extra",
    "/portal/orders/id-1/edit","/portal/deliveries/id-1/other",
    "/not-a-real-module",
  ]) {
    assert.equal(pageForPath(url),null,url);
    assert.equal(canVisitRoute(user("Administrator"),url),false,url);
    assert.equal(canVisitRoute(user("Customer"),url),false,url);
  }
});

test("role restrictions apply to internal and customer deep links", () => {
  assert(canVisitRoute(user("Sales Representative"),"/crm/deals/op-1"));
  assert(canVisitRoute(user("Administrator"),"/admin/employee-profiles/u-1/documents"));
  assert(!canVisitRoute(user("Sales Representative"),"/admin/employee-profiles/u-1/documents"));
  assert(!canVisitRoute(user("Marketing"),"/crm/deals/op-1"));
  assert(!canVisitRoute(user("Customer"),"/crm/deals/op-1"));
  assert(canVisitRoute(user("Customer"),"/portal/orders/order-1"));
  assert(!canVisitRoute(user("Sales Representative"),"/portal/orders/order-1"));
  assert(!canVisitRoute(user("Customer"),"/sales/orders/new"));
  assert(!canVisitRoute(user("Customer"),"/sales/orders/order-1/edit"));
});

test("most specific sidebar entry wins, notably Calendar versus Meetings", () => {
  const paths=["/","/calendar","/calendar/meetings","/crm/deals","/sales/customers"];
  assert.equal(activeMenuPath("/calendar",paths),"/calendar");
  assert.equal(activeMenuPath("/calendar/meetings",paths),"/calendar/meetings");
  assert.equal(activeMenuPath("/calendar/meetings/one",paths),"/calendar/meetings");
  assert.equal(activeMenuPath("/crm/deals/one",paths),"/crm/deals");
  assert.equal(activeMenuPath("/sales/customers/one",paths),"/sales/customers");
  assert.equal(activeMenuPath("/unregistered",paths),null);
});

test("URL links remain native copyable anchors with an optional build basePath", () => {
  assert.equal(routeHref("/crm/deals/id-1"),"/crm/deals/id-1");
  assert.equal(routeHref("/crm/deals/id-1","/app/"),"/app/crm/deals/id-1");
  assert.equal(routeHref("/","/app"),"/app/");
  assert.equal(routeHref("//foreign.invalid"),"/");
  const links=readFileSync("components/navigation/sidebar-route-link.tsx","utf8");
  assert.match(links, /<a href=\{href\}/);
  assert.match(links,/event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(links,/navigateToRoute\(path\)/);
});

test("history navigation adopts copied URLs, popstate and cleans its listener", () => {
  const original = (globalThis as typeof globalThis & { window?: unknown }).window;
  let path = "/calendar";
  const listeners = new Map<string,() => void>();
  const fake = {
    location: {get pathname(){return path;}},
    history: {
      pushState: (_:unknown, _title:string, value:string) => { path=value; },
      replaceState: (_:unknown, _title:string, value:string) => { path=value; },
    },
    addEventListener: (name:string,fn:()=>void) => {listeners.set(name,fn);},
    removeEventListener: (name:string,fn:()=>void) => {if(listeners.get(name)===fn)listeners.delete(name);},
  };
  Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:fake});
  try {
    const stop = startRouteNavigation();
    assert.equal(getNavigationRoute(),"/calendar");
    navigateToRoute("/calendar/meetings");
    assert.equal(path,"/calendar/meetings");
    assert.equal(getNavigationRoute(),"/calendar/meetings");
    path="/crm/deals/a-1";
    listeners.get("popstate")?.();
    assert.equal(getNavigationRoute(),"/crm/deals/a-1");
    stop();
    assert.equal(listeners.has("popstate"),false);
  } finally {
    Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:original});
  }
});

test("static export and Firebase Hosting fallback preserve deep route entry points", () => {
  const next=readFileSync("next.config.ts","utf8");
  const hosting=JSON.parse(readFileSync("firebase.json","utf8")) as {hosting:{rewrites:{source:string;destination:string}[]}};
  const css=readFileSync("app/architecture-navigation.css","utf8");
  const layout=readFileSync("app/layout.tsx","utf8");
  assert.match(next,/output: "export"/);
  assert(hosting.hosting.rewrites.some(item=>item.source==="**"&&item.destination==="/index.html"));
  assert.match(layout,/import "\.\/architecture-navigation\.css"/);
  assert.match(css, /@media screen and \(max-width:1023px\)/);
  assert.match(css,/\.app-layout>\.sidebar\.is-open/);
  assert.match(css,/\.topbar \.menu-button/);
  assert.match(css,/prefers-reduced-motion/);
});
