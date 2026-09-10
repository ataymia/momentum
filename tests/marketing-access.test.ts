import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canManageMarketing } from "../lib/access";
import { createDemoData } from "../lib/demo-data";
import { campaignSpend, materialBalance, normalizeMarketingState, type MarketingState } from "../lib/marketing-engine";

const data=createDemoData();
const role=(name:string)=>data.users.find((user)=>user.role===name)!;

test("current role model reserves marketing administration for the administrator",()=>{
  assert.equal(canManageMarketing(role("Administrator")),true);
  assert.equal(canManageMarketing(role("Sales Manager")),false);
  assert.equal(canManageMarketing(role("Sales Representative")),false);
  assert.equal(canManageMarketing(role("Operations")),false);
  assert.equal(canManageMarketing(role("Customer")),false);
});

test("marketing context keeps employee support requests separate from administrative mutations",()=>{
  const source=readFileSync(new URL("../lib/marketing-context.tsx",import.meta.url),"utf8");
  assert.match(source,/const isEmployee=Boolean\(currentUser&&currentUser\.role!=="Customer"\)/);
  assert.match(source,/const isAdmin=canManageMarketing\(currentUser\)/);
  assert.match(source,/const submitRequest=[\s\S]*?if\(!isEmployee\|\|!currentUser/);
  assert.match(source,/const createCampaign=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const recordSpend=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addTouch=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addAttribution=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
  assert.match(source,/const addPartnership=[\s\S]*?if\(!isAdmin\|\|!currentUser/);
});

test("marketing mutation boundaries validate actual dates finite quantities and approved budget",()=>{
  const source=readFileSync(new URL("../lib/marketing-context.tsx",import.meta.url),"utf8");
  assert.match(source,/isValidCalendarDateKey\(input\.startDate\)/);
  assert.match(source,/isValidCalendarDateKey\(input\.endDate\)/);
  assert.match(source,/isValidCalendarDateKey\(input\.date\)/);
  assert.match(source,/!Number\.isFinite\(input\.quantity\)\|\|input\.quantity<=0/);
  assert.match(source,/campaign\.approvedBudget===undefined\|\|!Number\.isFinite\(campaign\.approvedBudget\)/);
  assert.match(source,/committed\+input\.amount>campaign\.approvedBudget/);
  assert.match(source,/input\.materialItemId&&input\.quantity===undefined/);
});

test("marketing normalization drops corrupted dates and numeric records",()=>{
  const normalized=normalizeMarketingState({version:3,
    requests:[{id:"request-bad",requesterId:"usr-a",type:"Collateral",title:"Bad",detail:"Bad",quantity:null,neededBy:"2026-02-30",status:"Submitted",submittedAt:"2026-09-10T00:00:00Z"}],
    campaigns:[{id:"campaign-bad",name:"Bad",objective:"Bad",audience:"Bad",startDate:"2026-02-30",endDate:"2026-03-01",requestedBudget:null,ownerId:"usr-a",status:"Approved",successMeasure:"Bad",createdAt:"2026-09-10T00:00:00Z"}],
    spend:[{id:"spend-bad",campaignId:"campaign-bad",date:"2026-02-30",vendor:"Vendor",category:"Ad",amount:null,businessPurpose:"Bad",status:"Submitted",submittedBy:"usr-a",submittedAt:"2026-09-10T00:00:00Z"}],
    assets:[],materials:[],materialMovements:[],touches:[],attributions:[],partnerships:[]
  } as unknown);
  assert.equal(normalized.requests.some((item)=>item.id==="request-bad"),false);
  assert.equal(normalized.campaigns.some((item)=>item.id==="campaign-bad"),false);
  assert.equal(normalized.spend.some((item)=>item.id==="spend-bad"),false);
});

test("marketing rollups ignore non-finite corrupted financial quantities",()=>{
  const state={version:3,requests:[],campaigns:[],spend:[
    {id:"s1",campaignId:"c1",date:"2026-09-01",vendor:"V",category:"Ad",amount:25,businessPurpose:"Purpose",status:"Approved",submittedBy:"u",submittedAt:"2026-09-01T00:00:00Z"},
    {id:"s2",campaignId:"c1",date:"2026-09-01",vendor:"V",category:"Ad",amount:Number.NaN,businessPurpose:"Purpose",status:"Approved",submittedBy:"u",submittedAt:"2026-09-01T00:00:00Z"},
  ],assets:[],materials:[{id:"m1",name:"Sheets",unit:"sheet",active:true,reorderPoint:0,openingQty:10}],materialMovements:[
    {id:"mv1",itemId:"m1",type:"Issue",quantity:2,reason:"issue",at:"2026-09-01T00:00:00Z",actorId:"u"},
    {id:"mv2",itemId:"m1",type:"Issue",quantity:Number.POSITIVE_INFINITY,reason:"bad",at:"2026-09-01T00:00:00Z",actorId:"u"},
  ],touches:[],attributions:[],partnerships:[]} as MarketingState;
  assert.equal(campaignSpend(state,"c1"),25);
  assert.equal(materialBalance(state,"m1"),8);
});

test("non-admin marketing UI exposes request self-service without company budgets or control tabs",()=>{
  const source=readFileSync(new URL("../components/pages/marketing.tsx",import.meta.url),"utf8");
  assert.match(source,/admin\?state\.requests:state\.requests\.filter\(\(item\)=>item\.requesterId===currentUser\?\.id\)/);
  assert.match(source,/\{admin&&<div className="company-rule-facts">/);
  assert.match(source,/\{admin&&<div className="company-tabs">/);
  assert.match(source,/\{admin&&tab==="campaigns"/);
  assert.match(source,/\{admin&&tab==="spend"/);
  assert.match(source,/\{admin&&tab==="assets"/);
  assert.match(source,/\{admin&&tab==="attribution"/);
  assert.match(source,/\{admin&&tab==="partnerships"/);
});

test("marketing focus links resolve exact record types before scrolling",()=>{
  const source=readFileSync(new URL("../components/pages/marketing.tsx",import.meta.url),"utf8");
  assert.match(source,/state\.requests\.some\(\(item\)=>item\.id===focus\)\?"requests"/);
  assert.match(source,/state\.campaigns\.some\(\(item\)=>item\.id===focus\)\?"campaigns"/);
  assert.match(source,/document\.getElementById\(`marketing-\$\{focus\}`\)\?\.scrollIntoView/);
  assert.match(source,/id=\{`marketing-\$\{item\.id\}`\}/);
});
