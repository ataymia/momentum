import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import type {Opportunity} from "../lib/crm-engine";
import {visibleDeals} from "../lib/crm-deals-view";
const deal=(id:string,locationId:string,other:Partial<Opportunity>={}):Opportunity=>({
  id,locationId,customerId:"cust-"+locationId,name:"Deal "+id,stage:"Qualified",ownerId:"rep",
  nextAction:"Call buyer",nextActionDate:"2026-11-07",status:"Open",
  createdAt:"2026-11-01T00:00:00Z",createdBy:"rep",updatedAt:"2026-11-02T00:00:00Z",...other,
});
test("deal view denies foreign locations before filtering, counting and sorting",()=>{
  const original=[deal("own","owned"),deal("foreign","other",{updatedAt:"2026-11-09T00:00:00Z"}),deal("old","owned",{name:"Older",status:"Lost",stage:"Lost",lossReason:"Not ready"})];
  const visible=visibleDeals(original,new Set(["owned"]));
  assert.deepEqual(visible.map(item=>item.id),["own","old"],"default descending ties use stable record ID in descending order");
  assert.deepEqual(visibleDeals(original,new Set()),[]);
  assert.deepEqual(visibleDeals(original,new Set(["owned"]),{query:"foreign"}),[]);
  assert.equal(original[0].id,"own");
});
test("deal view supports status, owner, stage and stable sorting",()=>{
  const rows=[deal("a","owned",{estimatedCases:1}),deal("b","owned",{estimatedCases:20,ownerId:"rep2",stage:"Prospecting"})];
  assert.deepEqual(visibleDeals(rows,new Set(["owned"]),{stage:"Prospecting"}).map(item=>item.id),["b"]);
  assert.deepEqual(visibleDeals(rows,new Set(["owned"]),{ownerId:"rep2"}).map(item=>item.id),["b"]);
  assert.deepEqual(visibleDeals(rows,new Set(["owned"]),{status:"Lost"}),[]);
  assert.deepEqual(visibleDeals(rows,new Set(["owned"]),{sort:"cases",ascending:false}).map(item=>item.id),["b","a"]);
});
test("Deals URL routes render real directory, create and record views rather than a planned placeholder",()=>{
  const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
  const ui=readFileSync("components/prototype/crm-deals-experience.tsx","utf8");
  assert.match(hub,/if\(path==="\/crm\/deals\/new"\)return <DealEditor\/>/);
  assert.match(hub,/if\(segments\[0\]==="crm"&&segments\[1\]==="deals"&&segments\[2\]\)return <DealEditor id=/);
  assert.match(hub,/if\(path==="\/crm\/deals"\)return <DealsDirectory\/>/);
  assert.match(ui,/addOpportunity\(/);
  assert.match(ui,/updateOpportunity\(/);
  assert.match(ui,/canWrite=runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
  assert.match(ui,/scope\.accounts\.filter\(account=>Boolean\(account\.customerId\)\)/);
  assert.match(ui,/scope\.orders\.filter\(order=>!order\.testOnly&&order\.accountId===deal\.locationId\)/);
  assert.match(ui,/Deal creation rejected/);
  assert.match(ui,/A specific loss reason is required/);
});

test("direct CRM record, create and lead URLs are permitted by the correct role",async()=>{
  const {canVisitRoute,requiresPrototypePage,pageForPath}=await import("../lib/navigation-route-registry");
  const role=(role:"Administrator"|"Sales Representative"|"Customer")=>({
    id:role,name:role,role,team:"Sales",email:"demo@example.invalid",firstName:"Demo",initials:"DM",title:"Demo",accent:"#111",
  }) as import("../lib/types").WorkspaceUser;
  for(const path of ["/crm/deals/new","/crm/deals/deal-123","/crm/leads/lead-1","/crm/contacts/contact-1"]){
    assert.equal(pageForPath(path),"accounts",path);
    assert.equal(requiresPrototypePage(path),true,path);
    assert.equal(canVisitRoute(role("Sales Representative"),path),true,path);
    assert.equal(canVisitRoute(role("Customer"),path),false,path);
  }
});

test("every Deals register data column can sort by its visible representation",()=>{
 const sample=[
  deal("a","loc1",{name:"Zulu",stage:"Prospecting",status:"Open",ownerId:"rep-a",estimatedCases:12,nextActionDate:"2026-11-08"}),
  deal("b","loc2",{name:"Alpha",stage:"Qualified",status:"Open",ownerId:"rep-b",estimatedCases:8,nextActionDate:"2026-11-06"}),
  deal("foreign","forbidden",{name:"Foreign",updatedAt:"2027-01-01T00:00:00Z"}),
 ];
 const locationNames=new Map([["loc1","Omega Market"],["loc2","Beta Mart"],["forbidden","Fake"]]);
 const representativeNames=new Map([["rep-a","Zoe"],["rep-b","Alex"]]);
 for(const sort of ["name","location","stage","status","owner","cases","nextAction","updated"] as const){
  const result=visibleDeals(sample,new Set(["loc1","loc2"]),{sort,ascending:true,accountNames:locationNames,representativeNames});
  assert.equal(result.length,2);
  assert.ok(result.every(deal=>deal.id!=="foreign"));
  const descending=visibleDeals(sample,new Set(["loc1","loc2"]),{sort,ascending:false,accountNames:locationNames,representativeNames});
  assert.deepEqual(descending.map(d=>d.id),[...result].reverse().map(d=>d.id));
 }
 const ui=readFileSync("components/prototype/crm-deals-experience.tsx","utf8");
 for(const key of ["name","location","stage","status","owner","cases","nextAction","updated"])assert.match(ui,new RegExp('header\\("'+key+'"'));
 assert.match(ui,/Deals updated from/);
 assert.match(ui,/Deals updated through/);
});
