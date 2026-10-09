import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {personalVisitHistory} from "../lib/sales-field-engine";
import type {CrmInteraction} from "../lib/crm-engine";

const visit=(id:string,userId:string,occurredAt:string,physicalVisit=true):CrmInteraction=>
({id,userId,locationId:"account-1",type:"Visit",occurredAt,summary:"Visited store",physicalVisit});
test("representative sees only their own physical visits, newest first",()=>{
 const rows=[visit("older","rep-1","2026-10-08T14:00:00Z"),visit("other","rep-2","2026-10-09T17:00:00Z"),visit("newer","rep-1","2026-10-09T16:00:00Z"),{...visit("call","rep-1","2026-10-09T16:30:00Z"),type:"Call" as const,physicalVisit:undefined}];
 assert.deepEqual(personalVisitHistory(rows,"rep-1").map((row)=>row.id),["newer","older"]);
});
test("retail execution is no longer a main navigation item but remains in routing and data",()=>{
 for(const path of ["components/app-shell-v3.tsx","components/app-shell-v4.tsx"]){
  const src=readFileSync(path,"utf8");
  assert.ok(!src.includes('label: "Retail execution"'));
  assert.ok(src.includes('case "retail":'));
 }
});
test("quick visit includes paginated self-service history without exposing other reps",()=>{
 const src=readFileSync("components/pages/quick-visit.tsx","utf8");
 assert.ok(src.includes("personalVisitHistory(crm.interactions,currentUser.id)"));
 assert.ok(src.includes('title="My visits"'));
 assert.ok(src.includes("Show more visits"));
 assert.ok(src.includes("weeklyVisitSummary(crm.interactions,currentUser.id)"));
});
