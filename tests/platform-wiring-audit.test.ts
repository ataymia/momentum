import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access=readFileSync("lib/access.ts","utf8");
const shell=readFileSync("components/app-shell-v4.tsx","utf8");
const reports=readFileSync("components/pages/reports.tsx","utf8");
const providers=readFileSync("components/momentum-app.tsx","utf8");
const baseTools=readFileSync("components/pages/operations-tools-base.tsx","utf8");
const kpi=readFileSync("components/performance/management-kpi-dashboard.tsx","utf8");

function pageAccessKeys(){
  const block=access.match(/const pageAccess:[\s\S]*?\n};/)?.[0]??"";
  return new Set([...block.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((match)=>match[1]).filter((value)=>!["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Delivery Driver","Customer"].includes(value)));
}
function renderedKeys(){
  return new Set([...shell.matchAll(/case "([A-Za-z][A-Za-z0-9]*)":/g)].map((match)=>match[1]));
}
function reachableKeys(){
  const beforeNavButton=shell.split("function NavButton")[0]??shell;
  return new Set([...beforeNavButton.matchAll(/key:"([A-Za-z][A-Za-z0-9]*)"/g)].map((match)=>match[1]));
}

test("every role-accessible page has a renderer",()=>{
  const rendered=renderedKeys();
  for(const page of pageAccessKeys())assert.ok(rendered.has(page),`${page} is accessible but has no PageView renderer`);
});

test("every role-accessible page is reachable from primary, secondary, or section navigation",()=>{
  const reachable=reachableKeys();
  for(const page of pageAccessKeys())assert.ok(reachable.has(page),`${page} is accessible but has no visible navigation path`);
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

test("Products is no longer a hidden accessible page",()=>{
  assert.match(shell,/inventory: \[\{key:"inventory"[\s\S]*\{key:"products",label:"Products"\}\]/);
  assert.match(shell,/products:"inventory"/);
});
