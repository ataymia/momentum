import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {matchQuickVisitAccount,quickVisitLocationId,quickVisitSuggestions} from "../lib/quick-visit";
import type {Account} from "../lib/types";

const records=[
  {id:"a",name:"Corner Market",location:"Phoenix",locationName:"Corner Market",streetAddress:"100 Main St"},
  {id:"b",name:"Corner Market",location:"Tempe",locationName:"Corner Market",streetAddress:"200 West Ave"},
  {id:"c",name:"Grocer",location:"Phoenix",locationName:"Grocer",streetAddress:"55 First St"},
] as Account[];

test("ambiguous business names cannot silently link a visit to the wrong customer",()=>{
 assert.equal(matchQuickVisitAccount(records,"Corner Market"),undefined);
 assert.equal(matchQuickVisitAccount(records,"Corner Market · 100 Main St")?.id,"a");
 assert.deepEqual(quickVisitSuggestions(records,"corner").map(a=>a.id),["a","b"]);
 assert.equal(quickVisitLocationId("Unlisted   Business"),quickVisitLocationId("unlisted business"));
});

test("Quick Visit is independent, authorized, requires physical attestation and saves CRM interaction",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const page=readFileSync("components/prototype/crm-quick-visit.tsx","utf8");
 assert.match(hub,/if\(path==="\/crm\/quick-visit"\)return <CrmQuickVisit\/>/);
 assert.match(page,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(page,/currentUser\.role/);
 assert.match(page,/if\(!physical\|\|!name\)/);
 assert.match(page,/addInteraction\(\{/);
 assert.match(page,/physicalVisit:true/);
 assert.match(page,/type:"Sample"/);
 assert.match(page,/sampleInventoryLinked:false/);
 assert.match(page,/employeePhysicalVisits\(crm,currentUser\.id\)/);
 assert.match(page,/navigateToRoute\("\/sales\/customers\/"\+encodeURIComponent\(matched\.id\)\)/);
 assert.doesNotMatch(page,/navigator\.geolocation|sendEmail\(|createOrder\(/);
});

test("a freehand physical stop has a stable location key without creating an account",()=>{
 const page=readFileSync("components/prototype/crm-quick-visit.tsx","utf8");
 assert.match(page,/quickVisitLocationId\(name\)/);
 assert.match(page,/No matching account selected/);
 assert.doesNotMatch(page,/createAccount\(|setData\(/);
});
