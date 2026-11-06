import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {MENU_GROUPS, LEGACY_PATHS} from "../lib/navigation-route-registry";
import type {PageKey} from "../lib/types";

const access=readFileSync("lib/access.ts","utf8");
const shell=readFileSync("components/app-shell-v4.tsx","utf8");
const reports=readFileSync("components/pages/reports.tsx","utf8");
const providers=readFileSync("components/momentum-app.tsx","utf8");
const baseTools=readFileSync("components/pages/operations-tools-base.tsx","utf8");
const kpi=readFileSync("components/performance/management-kpi-dashboard.tsx","utf8");
const settings=readFileSync("components/pages/settings-v3.tsx","utf8");

function pageAccessKeys(){
  const block=access.match(/const pageAccess:[\s\S]*?\n};/)?.[0]??"";
  const arrays=[...block.matchAll(/^\s*(?:Administrator|"Sales Manager"|"Sales Representative"|"Brand Ambassador"|Operations|Warehouse|"Delivery Driver"|Marketing|Customer):\s*\[([^\]]*)\]/gm)].map((match)=>match[1]);
  return new Set(arrays.flatMap((row)=>[...row.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((match)=>match[1])));
}
function renderedKeys(){
  return new Set([...shell.matchAll(/case "([A-Za-z][A-Za-z0-9]*)":/g)].map((match)=>match[1]));
}
function routeableKeys(){
  const sidebarKeys=MENU_GROUPS.flatMap(group=>group.entries).map(entry=>entry.permission);
  return new Set([...sidebarKeys,...Object.keys(LEGACY_PATHS)] as PageKey[]);
}

test("every role-accessible page has a renderer",()=>{
  const rendered=renderedKeys();
  for(const page of pageAccessKeys())assert.ok(rendered.has(page),`${page} is accessible but has no PageView renderer`);
});

test("every role-accessible page has a dedicated URL or current sidebar destination",()=>{
  const reachable=routeableKeys();
  for(const page of pageAccessKeys())assert.ok(reachable.has(page as PageKey),`${page} is accessible but has no route or sidebar destination`);
  // Visibility completion is separately tracked under A05/A07/G09; legacy URL fallback
  // is not proof that an obsolete page layout has been redesigned or accepted.
});

test("commerce wraps performance so source-linked report calculations can read the payment ledger",()=>{
  assert.match(providers,/<CommerceProvider><PerformanceProvider>/);
  assert.match(providers,/<\/PerformanceProvider><\/CommerceProvider>/);
});

test("Reports and KPI Center no longer claim production data is fictional or disconnected",()=>{
  assert.doesNotMatch(reports,/Sample data/);
  assert.doesNotMatch(reports,/No live source systems are connected/);
  assert.doesNotMatch(reports,/fictional browser records/);
  assert.match(reports,/KPI sources are connected to Momentum records/);
  assert.match(kpi,/useCommerce/);
  assert.match(kpi,/useCrm/);
  assert.match(kpi,/physical_visits/);
});

test("only the current freehand Quick Visit implementation remains wired",()=>{
  assert.doesNotMatch(baseTools,/export function QuickVisitPage/);
  assert.match(shell,/case "quickVisit": return <QuickVisitPage\/>/);
});

test("Products has a dedicated Commerce sidebar destination rather than header tabs",()=>{
  const products=MENU_GROUPS.find(group=>group.label==="Commerce")?.entries
    .find(entry=>entry.permission==="products"&&entry.path==="/items");
  assert.ok(products,"Products needs a visible, routable Commerce destination");
  assert.match(shell,/products:"inventory"/);
  assert.doesNotMatch(shell,/const sectionTabs:/);
});


test("production integration status copy does not advertise already-resolved setup as missing",()=>{
  assert.doesNotMatch(settings,/Integration remaining/);
  assert.doesNotMatch(settings,/Rail not selected/);
  assert.match(settings,/provider:"Cloudflare"[\s\S]*status:"Connected"/);
  assert.match(settings,/provider:"Helcim"[\s\S]*Processor selected; live rail integration pending/);
});
