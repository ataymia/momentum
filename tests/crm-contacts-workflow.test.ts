import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import type {CrmContact} from "../lib/crm-engine";
import {visibleCrmContacts} from "../lib/crm-contacts-view";
const contact=(id:string,locationId:string,patch:Partial<CrmContact>={}):CrmContact=>({
 id,scope:"Location",locationId,customerId:"customer-"+locationId,name:"Contact "+id,role:"Buyer",
 decisionRole:"Decision maker",primary:false,active:true,createdAt:"2026-11-06T00:00:00Z",createdBy:"rep",...patch,
});
test("contact directory excludes foreign locations before any text/status filtering or export",()=>{
 const all=[contact("owned","loc1"),contact("foreign","loc2"),contact("inactive","loc1",{active:false})];
 const rows=visibleCrmContacts(all,new Set(["loc1"]),new Set(["customer-loc1"]),new Map([["loc1","Owned"],["loc2","Foreign"]]),{active:"true"});
 assert.deepEqual(rows.map(c=>c.id),["owned"]);
 assert.deepEqual(visibleCrmContacts(all,new Set(),new Set(),new Map()),[]);
 assert.deepEqual(visibleCrmContacts(all,new Set(["loc1"]),new Set(),new Map(),{query:"foreign"}),[]);
 assert.equal(all.length,3);
});
test("customer-scope contact is accessible only to linked authorized customer",()=>{
 const all=[contact("wide","",{scope:"Customer",customerId:"linked",locationId:undefined})];
 assert.deepEqual(visibleCrmContacts(all,new Set(),new Set(["linked"]),new Map()).map(c=>c.id),["wide"]);
 assert.deepEqual(visibleCrmContacts(all,new Set(),new Set(["unrelated"]),new Map()),[]);
});
test("new independent contacts use authenticated CRM store, local-demo guard, and correct record IDs",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const ui=readFileSync("components/prototype/crm-contacts-experience.tsx","utf8");
 const ctx=readFileSync("lib/crm-context.tsx","utf8");
 assert.match(hub,/path==="\/crm\/contacts\/new"/);
 assert.match(hub,/return <ContactRoute id=\{id\}\/>/);
 assert.match(hub,/CrmContactEditor key=\{id\} id=\{id\}/);
 assert.match(hub,/path==="\/crm\/contacts"\)return <CrmContactsDirectory\/>/);
 assert.match(ui,/addContact\(/);
 assert.match(ui,/updateContact\(/);
 assert.match(ui,/runtime\.isDemo&&momentumStorage\.mode\(\)==="local"/);
 assert.match(ctx,/const updateContact\s*=/);
 assert.match(ctx,/existing\.createdBy==="system"/);
 assert.match(ui,/scope\.orders\.filter\(o=>!o\.testOnly&&o\.accountId===contact\.locationId\)/);
});

test("contact sort supports every visible data field while keeping scope first",()=>{
 const all=[
  contact("a","loc1",{name:"Zelda",email:"z@example.test",phone:"900",decisionRole:"Influencer",active:false}),
  contact("b","loc1",{name:"Asha",email:"a@example.test",phone:"100",decisionRole:"Decision maker",active:true}),
  contact("foreign","loc2",{name:"Foreign",email:"0@example.test",phone:"000"}),
 ];
 const ids=new Set(["loc1"]),customers=new Set(["customer-loc1"]),names=new Map([["loc1","Actual Location"],["loc2","Foreign Location"]]);
 for(const sort of ["name","business","role","decisionRole","email","phone","active","created"] as const){
  const entries=visibleCrmContacts(all,ids,customers,names,{active:"all",sort,ascending:true});
  assert.equal(entries.length,2);
  assert.ok(entries.every(x=>x.id!=="foreign"));
  assert.deepEqual(visibleCrmContacts(all,ids,customers,names,{active:"all",sort,ascending:false}).map(x=>x.id),[...entries].reverse().map(x=>x.id));
 }
 const ui=readFileSync("components/prototype/crm-contacts-experience.tsx","utf8");
 for(const k of ["name","business","role","decisionRole","email","phone","active","created"])assert.match(ui,new RegExp('heading\\("'+k+'"'));
});
