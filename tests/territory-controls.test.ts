import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemoData } from "../lib/demo-data";
import { accountTerritoryState, canAssignRepToAccountTerritory, canSalesRepWorkAccount, normalizePostalCode, normalizeTerritories, territoryForPostalCode, validateTerritoryDraft } from "../lib/territory-engine";
import type { SalesTerritory, WorkspaceData } from "../lib/types";

const base=createDemoData();
const rep=base.users.find((user)=>user.role==="Sales Representative")!;
const otherRep={...rep,id:"usr-territory-rep-2",name:"Territory Rep Two",firstName:"Territory",email:"territory2@momentum.demo"};
const admin=base.users.find((user)=>user.role==="Administrator")!;
const stamp="2026-09-11T18:00:00.000Z";
const territory=(overrides:Partial<SalesTerritory>={}):SalesTerritory=>({id:"territory-1",name:"Phoenix North",ownerId:rep.id,postalCodes:["85016","85018"],status:"Active",createdAt:stamp,createdBy:admin.id,updatedAt:stamp,updatedBy:admin.id,...overrides});
const withTerritories=(territories:SalesTerritory[]):WorkspaceData=>({...base,users:[...base.users,otherRep],territories});

test("ZIP+4 normalizes to the five-digit territory key",()=>{
  assert.equal(normalizePostalCode("85016-1234"),"85016");
  assert.equal(normalizePostalCode(" 85018 "),"85018");
  assert.equal(normalizePostalCode("8501"),"");
});

test("active territories reject overlapping ZIP coverage",()=>{
  const data=withTerritories([territory()]);
  const result=validateTerritoryDraft(data,{name:"Phoenix East",ownerId:otherRep.id,postalCodes:["85018","85032"],status:"Active"});
  assert.equal(result.ok,false);
  assert.match(result.message??"",/85018.*already active/i);
});

test("draft territory planning may overlap but activation must resolve the overlap",()=>{
  const data=withTerritories([territory()]);
  const draft=validateTerritoryDraft(data,{name:"Possible East",ownerId:otherRep.id,postalCodes:["85018"],status:"Draft"});
  assert.equal(draft.ok,true);
  const active=validateTerritoryDraft(data,{name:"Possible East",ownerId:otherRep.id,postalCodes:["85018"],status:"Active"});
  assert.equal(active.ok,false);
});

test("an active territory can only belong to a Sales Representative",()=>{
  const data=withTerritories([]);
  const result=validateTerritoryDraft(data,{name:"Leadership territory",ownerId:admin.id,postalCodes:["85016"],status:"Active"});
  assert.equal(result.ok,false);
  assert.match(result.message??"",/Sales Representative/);
});

test("sales reps are restricted to their own territory after territory controls are activated",()=>{
  const data=withTerritories([territory()]);
  const own={...base.accounts[0],postalCode:"85016"};
  const other={...base.accounts[0],postalCode:"85032"};
  assert.equal(canSalesRepWorkAccount(data,rep,own),true);
  assert.equal(canSalesRepWorkAccount(data,rep,other),false);
  assert.equal(canAssignRepToAccountTerritory(data,own,rep.id),true);
  assert.equal(canAssignRepToAccountTerritory(data,own,otherRep.id),false);
});

test("territory restrictions stay dormant until an active territory exists",()=>{
  const data=withTerritories([territory({status:"Draft"})]);
  const outside={...base.accounts[0],postalCode:"99999"};
  assert.equal(canSalesRepWorkAccount(data,rep,outside),true);
  assert.equal(canAssignRepToAccountTerritory(data,outside,otherRep.id),true);
});

test("account territory state exposes missing ZIP, uncovered ZIP, and owner mismatch instead of guessing",()=>{
  const data=withTerritories([territory()]);
  assert.equal(accountTerritoryState(data,{...base.accounts[0],postalCode:undefined}),"Unresolved");
  assert.equal(accountTerritoryState(data,{...base.accounts[0],postalCode:"85032"}),"Outside coverage");
  assert.equal(accountTerritoryState(data,{...base.accounts[0],postalCode:"85016",ownerId:otherRep.id}),"Owner mismatch");
  assert.equal(accountTerritoryState(data,{...base.accounts[0],postalCode:"85016",ownerId:rep.id}),"Owned");
  assert.equal(territoryForPostalCode(data,"85016")?.id,"territory-1");
});

test("territory hydration fails closed when persisted active territories overlap",()=>{
  const users=[...base.users,otherRep];
  const normalized=normalizeTerritories([
    territory(),
    territory({id:"territory-2",name:"Overlap",ownerId:otherRep.id,postalCodes:["85018","85032"]}),
  ],users);
  assert.deepEqual(normalized.map((item)=>item.id),["territory-1"]);
});

test("CRM mutation boundaries enforce territory ownership instead of relying on UI warnings",()=>{
  const workspace=readFileSync(new URL("../lib/workspace-context.tsx",import.meta.url),"utf8");
  const accounts=readFileSync(new URL("../components/pages/accounts.tsx",import.meta.url),"utf8");
  assert.match(workspace,/validateTerritoryDraft\(data/);
  assert.match(workspace,/canSalesRepWorkAccount\(data,currentUser,account\)/);
  assert.match(workspace,/canAssignRepToAccountTerritory\(data,account,ownerId\)/);
  assert.match(workspace,/territory\.ownerId!==toUserId/);
  assert.match(workspace,/postalCode=normalizePostalCode\(account\.postalCode\)/);
  assert.match(accounts,/<TerritoryPanel\/>/);
  assert.match(accounts,/label="ZIP code"/);
});
