import assert from "node:assert/strict";
import test from "node:test";
import type {Account} from "../lib/types";
import type {CrmContact} from "../lib/crm-engine";
import {sortAccountsDirectory,compareDirectoryValues} from "../lib/crm-directory-sort";
import {visibleCrmContacts} from "../lib/crm-contacts-view";

const account=(id:string,patch:Partial<Account>={}):Account=>({
  id,name:"Test "+id,location:"Phoenix",channel:"Retail",stage:"Prospect",
  ownerId:"rep-1",contactName:"",contactRole:"Owner",phone:"",email:"",
  lastActivity:"",nextAction:"",nextActionDate:"",health:"New",
  lifetimeCases:0,reorderCount:0,notes:"",...patch,
});
const contact=(id:string,patch:Partial<CrmContact>={}):CrmContact=>({
  id,scope:"Location",locationId:"loc-1",customerId:"customer-1",name:"Test "+id,
  role:"Buyer",decisionRole:"Decision maker",primary:false,active:true,
  createdAt:"2026-11-06T00:00:00Z",createdBy:"rep",...patch,
});
const ids=(list:readonly {id:string}[])=>list.map(item=>item.id);

test("CRM natural sorting compares numbers within business names rather than alphabetically",()=>{
  const values=[account("ten",{name:"Store 10"}),account("two",{name:"Store 2"}),account("one",{name:"Store 1"})];
  const owner=new Map<string,string>();
  assert.deepEqual(ids(sortAccountsDirectory(values,"name",true,owner)),["one","two","ten"]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"name",false,owner)),["ten","two","one"]);
  assert.deepEqual(ids(values),["ten","two","one"],"sorting must not mutate authoritative lists");
});

test("CRM sorting treats ZIP as a postal code, dates chronologically and missing values last",()=>{
  const values=[
    account("missing",{postalCode:undefined,nextActionDate:""}),
    account("b",{postalCode:"85002",nextActionDate:"2026-11-10"}),
    account("a",{postalCode:"08501",nextActionDate:"2026-11-03"}),
    account("c",{postalCode:"85001",nextActionDate:"2026-11-07"}),
  ];
  const names=new Map<string,string>();
  assert.deepEqual(ids(sortAccountsDirectory(values,"postalCode",true,names)),["a","c","b","missing"]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"postalCode",false,names)),["b","c","a","missing"]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"nextActionDate",true,names)),["a","c","b","missing"]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"nextActionDate",false,names)),["b","c","a","missing"]);
});

test("CRM business stages follow the sales lifecycle, not alphabetical order",()=>{
  const values=[
    account("placed",{stage:"Placed"}),
    account("prospect",{stage:"Prospect"}),
    account("sampled",{stage:"Sampled"}),
    account("qualified",{stage:"Qualified"}),
  ];
  assert.deepEqual(ids(sortAccountsDirectory(values,"stage",true,new Map())),["prospect","qualified","sampled","placed"]);
});

test("Representative names sort by visible names, missing representative assignments remain last",()=>{
  const values=[account("unassigned",{ownerId:"missing"}),account("jane",{ownerId:"rep-2"}),account("amy",{ownerId:"rep-1"})];
  const names=new Map([["rep-1","Amy Z."],["rep-2","Jane P."]]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"ownerId",true,names)),["amy","jane","unassigned"]);
  assert.deepEqual(ids(sortAccountsDirectory(values,"ownerId",false,names)),["jane","amy","unassigned"]);
});

test("Contact emails and businesses stay last when missing; ties have deterministic direction",()=>{
  const contacts=[
    contact("z",{email:undefined,locationId:"loc-2"}),
    contact("b",{email:"b@example.invalid"}),
    contact("a",{email:"a@example.invalid"}),
    contact("empty",{email:""}),
  ];
  const allowed=new Set(["loc-1","loc-2"]),customerIds=new Set(["customer-1"]);
  const companyNames=new Map([["loc-1","Acme 2"],["loc-2",""]]);
  const sorted=(asc:boolean)=>visibleCrmContacts(contacts,allowed,customerIds,companyNames,{sort:"email",ascending:asc,active:"all"});
  assert.deepEqual(ids(sorted(true)),["a","b","empty","z"]);
  assert.deepEqual(ids(sorted(false)),["b","a","z","empty"]);
  assert.equal(compareDirectoryValues("same","same","natural",true,"a","b")<0,true);
  assert.equal(compareDirectoryValues("same","same","natural",false,"a","b")>0,true);
});
