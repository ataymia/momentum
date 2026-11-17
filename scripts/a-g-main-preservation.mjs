import cp from "node:child_process";
import fs from "node:fs";

const MAIN="881a2396fa7357cae5300c49305f59d227d7e261";
const exec=(args)=>{
  const result=cp.spawnSync("git",args,{encoding:"utf8",maxBuffer:12*1024*1024});
  if(result.status!==0)throw new Error("git "+args.join(" ")+"\n"+(result.stdout||"")+"\n"+(result.stderr||""));
  return (result.stdout||"").trim();
};
const currentBranch=exec(["branch","--show-current"]);
if(currentBranch!=="integration/a-g-unified-2026-11-07")throw new Error("Refusing to modify unexpected branch: "+currentBranch);
exec(["config","user.name","Momentum Main-Parity Integrator"]);
exec(["config","user.email","momentum-main-parity@users.noreply.github.com"]);
const before=exec(["rev-parse","HEAD"]);
console.log("PRESERVATION BASE "+before+" MAIN "+MAIN);
exec(["fetch","--no-tags","origin",MAIN]);
const attempt=cp.spawnSync("git",["merge","--no-ff","--no-commit","-X","ours",MAIN],{encoding:"utf8"});
if(attempt.status!==0){
  const unmerged=cp.spawnSync("git",["diff","--name-only","--diff-filter=U"],{encoding:"utf8"});
  throw new Error("Manual main-integration conflict review required. "+(unmerged.stdout||"")+"\n"+(attempt.stdout||"")+"\n"+(attempt.stderr||""));
}
const manifest=JSON.parse(fs.readFileSync("package.json","utf8"));
const mainManifest=JSON.parse(exec(["show",MAIN+":package.json"]));
const suite=(s)=>s?.match(/tests\/[\w/-]+\.test\.[cm]?[jt]sx?/g)||[];
const union=[...new Set([...suite(manifest.scripts["test:logic"]),...suite(mainManifest.scripts["test:logic"])])];
for(const name of union)if(!fs.existsSync(name))throw new Error("Lost registered regression test "+name);
manifest.scripts["test:logic"]="node --import tsx --test "+union.join(" ");
for(const scope of ["dependencies","devDependencies"]){
  manifest[scope]||={};
  for(const [name,version] of Object.entries(mainManifest[scope]||{})){
    if(!Object.hasOwn(manifest[scope],name))manifest[scope][name]=version;
  }
}
fs.writeFileSync("package.json",JSON.stringify(manifest,null,2)+"\n");
const source="functions/src/sales-inactivity-core.ts";
if(!fs.existsSync(source))throw new Error("Main's saved CRM activity evaluation module missing");
let core=fs.readFileSync(source,"utf8");
const old="/** Return the latest valid saved CRM event or fresh sign-in after shift start. */";
const revised=[
"/**",
" * Return the latest persisted CRM/work event or fresh sign-in after shift start.",
" * @param {string} userId Firebase UID of the employee being evaluated.",
" * @param {number} clockInMs Millisecond timestamp of the current shift start.",
" * @param {number} signInMs Millisecond timestamp of the last interactive sign-in.",
" * @param {SavedCRMEvent[]} crmEvents Saved CRM activity records.",
" * @param {SavedCRMEvent[]} workEvents Saved workspace activity records.",
" * @param {number} nowMs Millisecond timestamp of the server evaluation.",
" * @return {number} Most recent qualifying activity timestamp in milliseconds.",
" */"
].join("\n");
if(core.includes(old))core=core.replace(old,revised);
if(!core.includes("@param {string} userId"))throw new Error("Unverified main Functions documentation layout");
fs.writeFileSync(source,core);
const expected=[
  "components/field-tracking/location-permission-help.tsx",
  "components/field-tracking/location-permission-reminder.tsx",
  "components/field-tracking/sales-inactivity-guard.tsx",
  "functions/src/location-permission-request.ts",
  "functions/src/sales-inactivity-core.ts",
  "functions/src/sales-inactivity.ts",
  "lib/location-permission-requests.ts",
  "lib/sales-inactivity-client.ts",
  "tests/location-permission-recovery.test.ts",
  "tests/sales-auto-clockout.test.ts"
];
for(const file of expected)if(!fs.existsSync(file))throw new Error("Missing production main feature: "+file);
const invoice=fs.readFileSync("components/finance/invoice-print-center.tsx","utf8");
const startPrint=invoice.slice(invoice.indexOf("const startPrint ="),invoice.indexOf("const invoiceSheet ="));
if(/missing\.length|archived\.length/.test(startPrint))throw new Error("Main P0 invoice print regression: restored legacy print blocker");
if(!invoice.includes('legalBillingName(customer) ?? customer?.name ?? location?.name'))
  throw new Error("Missing main P0 invoice legal-display fallback");
const routes=fs.readFileSync("lib/navigation-route-registry.ts","utf8");
for(const token of ["/calendar/meetings","/crm/deals","/commerce/price-books","/inventory/locations","/purchases/receipts"])
  if(!routes.includes(token))throw new Error("Main merge discarded A-G route "+token);
const rules=fs.readFileSync("scripts/generate-firestore-rules.ts","utf8");
for(const token of ["staffMeetings","notificationReadReceipts"])
  if(!rules.includes(token))throw new Error("Main merge discarded A-G security rules "+token);
exec(["add","-A"]);
exec(["commit","-m","merge(integration): preserve latest main production changes at "+MAIN.slice(0,12)]);
exec(["merge-base","--is-ancestor",MAIN,"HEAD"]);
const head=exec(["rev-parse","HEAD"]);
console.log("MERGED AND PRESERVED MAIN "+head+" logic suites="+union.length);
console.log("NO DEPLOY OR MAIN WRITE");
