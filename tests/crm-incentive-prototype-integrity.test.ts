import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {accountBonusProgress} from "../lib/bonus-progress";
import {evaluateSalesRepAccountBonuses} from "../lib/bonus-engine";
import type {WorkspaceData} from "../lib/types";

test("CRM incentive prototype displays separate bars for separate selling locations sharing one parent",()=>{
 const d={
  users:[{id:"rep-1",role:"Sales Representative"}],
  accounts:[{id:"store-1",customerId:"billing-parent",ownerId:"rep-1"},{id:"store-2",customerId:"billing-parent",ownerId:"rep-1"}],
  orders:[
   {id:"o1",accountId:"store-1",ownerId:"rep-1",number:"MD-1",cases:20,status:"Delivered",paymentStatus:"Paid",placedAt:"2026-10-01",firstSettledAt:"2026-10-02"},
   {id:"o2",accountId:"store-2",ownerId:"rep-1",number:"MD-2",cases:20,status:"Delivered",paymentStatus:"Paid",placedAt:"2026-10-01",firstSettledAt:"2026-10-02"},
  ],activities:[],
 } as unknown as WorkspaceData;
 const bars=accountBonusProgress(evaluateSalesRepAccountBonuses(d,new Date("2026-11-07T12:00:00Z")));
 assert.equal(bars.length,2);
 assert.deepEqual(bars.map(x=>x.settledCases),[20,20]);
 assert.equal(bars.some(x=>x.percent===100),false);
 assert.equal(bars.every(x=>x.sustained.status!=="Earned"),true);
});

test("prototype is wired to canonical per-location milestone engine, not parent pooled order totals",()=>{
 const page=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const begin=page.indexOf("function IncentivePreview()"),end=page.indexOf("type ContactSortField=",begin);
 const excerpt=page.slice(begin,end);
 assert.ok(begin>0&&end>begin);
 assert.match(excerpt,/evaluateSalesRepAccountBonuses\(data\)/);
 assert.match(excerpt,/accountBonusProgress\(signals/);
 assert.match(excerpt,/acquisitionBonusHeldAccountIds\(data\)/);
 assert.match(excerpt,/bonusHeldAccountIds|held\.has\(row\.accountId\)/);
 assert.match(excerpt,/no 20-case bonus/i);
 assert.doesNotMatch(excerpt,/groups\.set\(key,group\)|g\.ids\.has\(o\.accountId\)/);
});
