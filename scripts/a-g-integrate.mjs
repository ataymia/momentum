import fs from "node:fs";
import cp from "node:child_process";

const integration = "integration/a-g-unified-2026-11-07";
const sources = {
  F: "1e3a8fc7efe01cd3f2636c3dcf2dab0f90f5d4d2",
  C: "ad4eb26562038ca04dfe577a745d7ee7b6a9a110",
  A: "e6df6688fc1f5b5fdad133a9c32fd57a9984d2ee",
  B: "8d3fb4d61c5fd6ce1450fce54c6d06cc2775918b",
  D: "212d7f1f36c90061aa824c5a8bb744061a78057f",
  E: "c703d4a1053e7de0e00771dccb01d3ee6fd08101",
  G: "0daa104a78e7349cf892cde2e70ca3517170614d",
};
const exec = (args,opts={}) => {
  const r=cp.spawnSync("git",args,{encoding:"utf8",maxBuffer:16*1024*1024,...opts});
  if(r.status!==0)throw new Error("git "+args.join(" ")+" failed: "+(r.stderr||r.stdout).slice(-3000));
  return (r.stdout||"").trim();
};
const gitShow = (sha,path) => exec(["show",sha+":"+path]);
const routePath = "lib/navigation-route-registry.ts";

const groupNames = ["Workspace","Sales & CRM","Commerce","Operations","Human Resources","Marketing","Insights & Support","Administration"];
const groupPriority = {
  "Workspace":["B","A","F","C","D","E","G"],
  "Sales & CRM":["C","E","A","F","D","B","G"],
  "Commerce":["D","A","F","C","B","E","G"],
  "Operations":["E","A","F","D","B","C","G"],
  "Human Resources":["F","A","B","C","D","E","G"],
  "Marketing":["F","A","B","C","D","E","G"],
  "Insights & Support":["F","A","B","C","D","E","G"],
  "Administration":["F","A","B","C","D","E","G"],
};
const expectedGroups={};
for(const [letter,sha] of Object.entries(sources)){
  const s=gitShow(sha,routePath);
  const start=s.indexOf("export const MENU_GROUPS: MenuGroup[] = [");
  const end=s.indexOf("\n];",start);
  if(start<0||end<0)throw new Error("Could not parse "+letter+" menu groups");
  const lines=s.slice(start,end).split("\n");
  const groups={};let active="";
  for(const line of lines){
    const head=line.match(/^\s*\{ label: "([^"]+)", entries: \[$/);
    if(head){active=head[1];groups[active]=[];continue;}
    const route=line.match(/^\s*\{ label: "([^"]+)", path: "(\/[^"]+)", permission: "([^"]+)", state: "(existing|prototype|planned)" \},?\s*$/);
    if(route&&active)groups[active].push({label:route[1],path:route[2],permission:route[3],state:route[4]});
  }
  expectedGroups[letter]=groups;
}
const allExpectedRoutes=new Set();
function generateMenu(){
  const result=["export const MENU_GROUPS: MenuGroup[] = ["];
  for(const group of groupNames){
    const entries=new Map();
    for(const source of groupPriority[group]){
      for(const entry of expectedGroups[source][group]||[]){
        allExpectedRoutes.add(entry.path);
        if(!entries.has(entry.path))entries.set(entry.path,entry);
      }
    }
    // Specialist C is preferred for CRM, but E is authoritative for the active rep-delivery redesign.
    if(group==="Sales & CRM"){
      const improved=(expectedGroups.E[group]||[]).find(x=>x.path==="/crm/self-delivery");
      if(improved&&entries.has(improved.path))entries.set(improved.path,improved);
    }
    let values=[...entries.values()];
    if(group==="Workspace"){
      const front=["/","/self-service","/self-service/leave","/self-service/pay","/people/timekeeping","/people/materials"];
      const remaining=values.filter(v=>!front.includes(v.path));
      values=[...front.flatMap(path=>values.filter(v=>v.path===path)),...remaining];
    }
    result.push('  { label: "'+group+'", entries: [');
    for(const e of values)result.push('    { label: '+JSON.stringify(e.label)+', path: '+JSON.stringify(e.path)+', permission: '+JSON.stringify(e.permission)+', state: '+JSON.stringify(e.state)+' },');
    result.push("  ] },");
  }
  result.push("];");
  return result.join("\n");
}

const packageSources=Object.fromEntries(Object.entries(sources).map(([letter,sha])=>[letter,JSON.parse(gitShow(sha,"package.json"))]));
function reconcileShared(){
  const original=fs.readFileSync(routePath,"utf8");
  const start=original.indexOf("export const MENU_GROUPS: MenuGroup[] = [");
  const end=original.indexOf("\n];",start);
  if(start<0||end<0)throw new Error("Missing route registry section");
  const combined=original.slice(0,start)+generateMenu()+original.slice(end+3);
  fs.writeFileSync(routePath,combined);
  const manifest=JSON.parse(fs.readFileSync("package.json","utf8"));
  const logicFiles=[];
  for(const p of [manifest,...Object.values(packageSources)]){
    const files=p.scripts?.["test:logic"]?.match(/tests\/[\w/-]+\.test\.[cm]?[jt]sx?/g)||[];
    for(const file of files)if(!logicFiles.includes(file))logicFiles.push(file);
    for(const [key,value] of Object.entries(p.scripts||{}))if(!Object.hasOwn(manifest.scripts,key))manifest.scripts[key]=value;
    for(const scope of ["dependencies","devDependencies"]){
      manifest[scope]||={};
      for(const [name,version] of Object.entries(p[scope]||{})){
        if(!Object.hasOwn(manifest[scope],name))manifest[scope][name]=version;
      }
    }
  }
  // Some branch-owned test files are added later in the sequential merge; verify existence at the end.
  manifest.scripts["test:logic"]="node --import tsx --test "+logicFiles.join(" ");
  fs.writeFileSync("package.json",JSON.stringify(manifest,null,2)+"\n");
  console.log("RECONCILED "+allExpectedRoutes.size+" expected sidebar routes, "+logicFiles.length+" logic test suites");
}
function assertFeatureWiring(){
  const reg=fs.readFileSync(routePath,"utf8");
  for(const route of allExpectedRoutes)if(!reg.includes('path: "'+route+'"'))throw new Error("Lost route "+route);
  const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
  for(const p of Object.values(packageSources)){
    const files=p.scripts?.["test:logic"]?.match(/tests\/[\w/-]+\.test\.[cm]?[jt]sx?/g)||[];
    for(const file of files){
      if(!pkg.scripts["test:logic"].includes(file))throw new Error("Lost test "+file);
      if(!fs.existsSync(file))throw new Error("Missing branch regression test "+file);
    }
  }
  const hub=fs.readFileSync("components/prototype/operations-hub.tsx","utf8");
  for(const file of [
    "crm-commission-only-review","crm-account-map","crm-account-health",
    "workspace-meetings-experience","price-books-experience",
    "purchasing-experience","inventory-locations-experience",
    "insights-explorer-experience","support-cases-experience"
  ])if(!hub.includes(file))throw new Error("Missing route-to-component wiring: "+file);
  const rules=fs.readFileSync("scripts/generate-firestore-rules.ts","utf8");
  for(const token of ["staffMeetings","notificationReadReceipts"])if(!rules.includes(token))throw new Error("Lost Firestore rule generator: "+token);
}
console.log("Beginning surgical local-only merge on "+integration);
console.log("Source pin "+JSON.stringify(sources));
exec(["config","user.name","Momentum Consolidation"]);
exec(["config","user.email","momentum-integration@users.noreply.github.com"]);
for(const letter of ["C","A","B","D","E","G"]){
  const sha=sources[letter];
  const res=cp.spawnSync("git",["merge","--no-ff","--no-commit","-X","ours",sha],{encoding:"utf8",maxBuffer:16*1024*1024});
  if(res.status!==0){
    const unresolved=cp.spawnSync("git",["diff","--name-only","--diff-filter=U"],{encoding:"utf8"}).stdout;
    throw new Error(letter+" merge requires manual resolution. Unmerged:\n"+unresolved+"\n"+res.stdout+"\n"+res.stderr);
  }
  // Build a canonical superset after every merge, not last-writer-wins routing.
  reconcileShared();
  exec(["add","-A"]);
  // Legacy review Markdown contains intentional Markdown hard-break spaces; do not reject source history solely for that.
  exec(["commit","-m","merge(integration): preserve "+letter+" workstream at "+sha.slice(0,12)]);
  console.log("INTEGRATED "+letter+" HEAD="+exec(["rev-parse","HEAD"]));
}
// Merge overlapping product/ledger imports without dropping the CRM or Commerce variants.
{
  const path="components/prototype/operations-hub.tsx";
  let hub=fs.readFileSync(path,"utf8");
  const source='import { GOLDEN_EAGLE_SKUS, skuForProductName } from "../../lib/product-catalog";';
  const merged='import { GOLDEN_EAGLE_SKUS, skuForProductName, skuForTraceableProduct } from "../../lib/product-catalog";';
  if(hub.includes(source))hub=hub.replace(source,merged);
  else if(!hub.includes('skuForTraceableProduct } from "../../lib/product-catalog"')){
    throw new Error("Review unexpected merged SKU imports before continuing.");
  }
  const requirements=[
    'import {nodeLotBalance,reservedQuantity,warehouseAvailable,warehouseNodeId} from "../../lib/inventory-ledger";',
    'import {useInventoryLedger} from "../../lib/inventory-ledger-context";',
    'import {canAccessPage} from "../../lib/access";'
  ];
  for(const line of requirements)if(!hub.includes(line))hub=hub.replace(merged,merged+"\n"+line);
  fs.writeFileSync(path,hub);
  exec(["add",path]);
  exec(["commit","-m","fix(integration): retain CRM product aliases and D traceable-inventory imports"]);
}
assertFeatureWiring();
for(const [letter,sha] of Object.entries(sources)){
  exec(["merge-base","--is-ancestor",sha,"HEAD"]);
  console.log("ANCESTRY VERIFIED "+letter+" "+sha);
}
for(const p of ["lib/navigation-route-registry.ts","package.json"]){
  const value=fs.readFileSync(p,"utf8");
  if(/^(<{7}|={7}|>{7})/m.test(value))throw new Error("Unresolved conflict marker in "+p);
}
console.log("MERGED HEAD "+exec(["rev-parse","HEAD"]));
console.log("No remote write by this script. Workflow owns the final push gate.");
