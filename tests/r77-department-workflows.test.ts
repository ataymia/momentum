import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MENU_GROUPS,canVisitRoute,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const admin={id:"admin",name:"Admin",firstName:"Admin",role:"Administrator" as const,title:"Admin",
 email:"admin@example.invalid",initials:"AD",accent:"#abc",team:"Leadership"} as WorkspaceUser;
test("R29/R51/R68/R71 preserve canonical accounting, training, workforce and data-exchange actions",()=>{
 const registry=MENU_GROUPS.flatMap(group=>group.entries);
 const wrapper=readFileSync("components/prototype/department-workspaces.tsx","utf8");
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 for(const route of ["/finance/accounting","/people/training","/admin/workforce","/admin/data-exchange"]){
  assert(registry.some(entry=>entry.path===route&&entry.state==="prototype"),route);
  assert(canVisitRoute(admin,route),route);
  assert(requiresPrototypePage(route),route);
  assert(hub.includes('path==="'+route+'"'),route);
 }
 for(const component of ["AccountingWorkspacePage","TrainingAdminPage","WorkforceLivePage","DataExchangePage"])
  assert(wrapper.includes("<"+component+"/>"),component);
 assert(wrapper.includes("Account Consolidation"));
 assert(wrapper.includes("Search training assignments"));
});
test("R57/R75 Marketing connected state can never be re-published or mutated by the browser",()=>{
 const provider=readFileSync("lib/marketing-context.tsx","utf8");
 const event=readFileSync("components/brand-ambassadors/event-request-panel.tsx","utf8");
 assert(provider.includes('localDemoWrite=runtime.isDemo&&momentumStorage.mode()==="local"'));
 assert(provider.includes('if(localDemoWrite&&typeof window!=="undefined")momentumStorage.setItem'));
 for(const fn of ["submitRequest","decideRequest","fulfillRequest","createCampaign","decideCampaign","setCampaignStatus",
  "recordSpend","decideSpend","reconcileSpend","addAsset","setAssetStatus","addMaterial","moveMaterial",
  "addTouch","addAttribution","reviewAttribution","addPartnership"]){
  const at=provider.indexOf("const "+fn+"=");
  assert(at>=0,fn+" must exist");
  const body=provider.slice(at,at+470);
  assert(body.includes("if(!localDemoWrite)"),fn+" must deny connected browser mutations");
 }
 assert(event.includes("Connected event requests require server authorization"));
 assert(event.includes("disabled={!demoWrite}"));
});
