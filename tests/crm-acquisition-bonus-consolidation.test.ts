import assert from "node:assert/strict";
import test from "node:test";
import {acquisitionBonusConsolidationHolds,acquisitionBonusHeldAccountIds} from "../lib/acquisition-bonus-consolidation";
import {applyAccountAssociation} from "../lib/account-association-engine";
import {earnedBonusesForMonth,invalidBonusSourcesForRun} from "../lib/payroll-engine";
import type {PayRun,PayrollState} from "../lib/payroll-engine";
import type {WorkspaceData,Account,Order} from "../lib/types";

const loc=(id:string,streetAddress:string,parent="parent-1"):Account=>({
 id,name:"Store "+id,location:"Phoenix, AZ",streetAddress,postalCode:"85018",
 customerId:parent,stage:"Placed",ownerId:"rep-1",
} as Account);
const order=(id:string,accountId:string,number=id,extra:Partial<Order>={}):Order=>({
 id,accountId,number,cases:10,pricePerCase:24,amount:240,status:"Delivered",
 placedAt:"2026-10-01",ownerId:"rep-1",creditedRepId:"rep-1",
 paymentStatus:"Paid",firstSettledAt:"2026-10-04T10:00:00Z",...extra,
});
const data=(accounts:Account[],orders:Order[]=[]):WorkspaceData=>({
 users:[{id:"rep-1",role:"Sales Representative"}],accounts,orders,activities:[],
 customers:[{id:"parent-1",name:"Verified parent"}],
} as unknown as WorkspaceData);
const state={runs:[]} as unknown as PayrollState;

test("legitimate distinct physical stores of one billing parent retain separate bonuses",()=>{
 const d=data([loc("a","101 West Market St"),loc("b","102 West Market St")],[order("one","a"),order("two","b")]);
 assert.deepEqual(acquisitionBonusConsolidationHolds(d),[]);
 assert.equal(earnedBonusesForMonth(state,d,"2026-10").length,2);
});

test("same parent and exact same physical store blocks both new bonus claims",()=>{
 const d=data([loc("a","101 West Market St"),loc("b","101 W Market Street")],[order("one","a"),order("two","b")]);
 const holds=acquisitionBonusConsolidationHolds(d);
 assert.equal(holds.length,1);
 assert.deepEqual(holds[0].accountIds,["a","b"]);
 assert.equal(holds[0].reason,"Duplicate physical address");
 assert.deepEqual([...acquisitionBonusHeldAccountIds(d)].sort(),["a","b"]);
 assert.equal(earnedBonusesForMonth(state,d,"2026-10").length,0);
 const run={kind:"Monthly bonus",lines:[{sourceBonusIds:["bonus-a-opening","bonus-b-opening"]}]} as PayRun;
 assert.deepEqual(invalidBonusSourcesForRun(run,d),["bonus-a-opening","bonus-b-opening"]);
});

test("same parent and reused real order identity blocks automatic second acquisition",()=>{
 const d=data([loc("a","101 West Market St"),loc("b","102 West Market St")],[order("one","a","MD-001"),order("two","b","MD-001")]);
 const holds=acquisitionBonusConsolidationHolds(d);
 assert.equal(holds.length,1);
 assert.equal(holds[0].reason,"Duplicate order identity");
 assert.equal(earnedBonusesForMonth(state,d,"2026-10").length,0);
});

test("canceled/test orders cannot create false consolidation hold",()=>{
 const d=data([loc("a","101 West Market St"),loc("b","102 West Market St")],[
  order("one","a","MD-001"),
  order("two","b","MD-001",{status:"Cancelled"}),
  order("three","b","MD-001",{testOnly:true}),
 ]);
 assert.deepEqual(acquisitionBonusConsolidationHolds(d),[]);
});

test("distinct suite addresses preserve different verified locations at one building",()=>{
 const d=data([loc("a","101 Market St Suite 100"),loc("b","101 Market St Suite 200")],[order("one","a"),order("two","b")]);
 assert.equal(acquisitionBonusConsolidationHolds(d).length,0);
});

test("parent association rejects reused real order identity without mutating original records",()=>{
 const original=data([loc("a","101 Market St",""),loc("b","102 Market St","")],[
  order("order-1","a","MD-001"),order("order-2","b","MD-001"),
 ]);
 original.accounts=original.accounts.map(account=>({...account,customerId:undefined}));
 original.customers=[];
 const result=applyAccountAssociation(original,{
   accountIds:["a","b"],parent:{kind:"new",id:"parent-1",name:"Verified Group"},
   operatorId:"admin",recordedAt:"2026-11-07T12:00:00Z",operationId:"audit-1",
   reason:"Verified same billing owner with source documents",verifiedCommonBillingOwner:true,
 });
 assert.equal(result.ok,false);
 assert.equal(original.accounts.every(account=>account.customerId===undefined),true);
 assert.equal(original.orders[0].creditedRepId,"rep-1");
});
