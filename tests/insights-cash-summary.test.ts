import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import type {CollectedCashFact,PaidOrderFact} from "../lib/commercial-source";
import {insightCashSummary} from "../lib/insights-cash-summary";
import {reportEligibleOrders,reportSellableWarehouseCases} from "../lib/reporting-visibility";
import {ambiguousSettledRefundIds} from "../lib/reporting-cash-reconciliation";
import type {CommerceState} from "../lib/commerce-engine";
import {canVisitRoute,requiresPrototypePage} from "../lib/navigation-route-registry";
import type {WorkspaceUser} from "../lib/types";
const cash=(id:string,kind:CollectedCashFact["kind"],amount:number,settledAt:string):CollectedCashFact=>({
 id,kind,amount,settledAt,orderId:id,accountId:"account-a",creditedUserId:"rep"
});
const paid=(id:string,accountId:string,paidAt:string,cases:number):PaidOrderFact=>({
 orderId:id,accountId,paidAt,cases,amount:cases*24,creditedUserId:"rep"
});
const role=(role:WorkspaceUser["role"]):WorkspaceUser=>({id:"test",name:"Test",firstName:"Test",email:"test@example.invalid",role,team:"Sales",title:"Test",initials:"TU",accent:"#aaa"});
test("F08: cash summary uses only cleared-source facts within the selected period",()=>{
 const facts=[
  cash("old","Collection",200,"2026-10-28"),
  cash("a","Collection",100,"2026-11-05"),
  cash("b","Collection",50,"2026-11-06"),
  cash("c","Refund",-10,"2026-11-06")
 ];
 const orders=[paid("old","account-a","2026-10-28",4),paid("b","account-a","2026-11-05",5),paid("c","account-a","2026-11-06",6),paid("other","account-b","2026-11-06",3)];
 const result=insightCashSummary(facts,orders,"2026-11-01","2026-11-30");
 assert.equal(result.collections,150);
 assert.equal(result.refunds,10);
 assert.equal(result.net,140);
 assert.equal(result.cashEventCount,3);
 assert.equal(result.markedPaidOrders,3);
 assert.equal(result.markedPaidCases,14);
 assert.equal(result.reorderAccounts,1,"The same customer's third order counts as one reordered account");
 assert.deepEqual(result.months,[{month:"2026-11",collections:150,refunds:10,net:140}]);
});
test("F08: reports explorer is a real role-protected prototype route",()=>{
 assert(requiresPrototypePage("/reports/explorer"));
 assert.equal(canVisitRoute(role("Administrator"),"/reports/explorer"),true);
 assert.equal(canVisitRoute(role("Customer"),"/reports/explorer"),false);
});

test("F08: lot quality holds never count as sellable warehouse stock",()=>{
 const ui=readFileSync("components/prototype/insights-explorer-experience.tsx","utf8");
 assert(ui.includes('available:lot.status==="Quality hold"?0:Math.max(0,warehouseAvailable(ledger,lot.id))'));
 assert(ui.includes('refundAllocationBlocked?"Needs reconciliation":money(summary.net)'));
});

// Reports and Insights must exclude intentionally synthetic orders and unsellable inventory.
test("F08: test-only orders never enter eligible reporting evidence",()=>{
 const visible=reportEligibleOrders([{id:"real",testOnly:false},{id:"synthetic",testOnly:true},{id:"legacy"}]);
 assert.deepEqual(visible.map(row=>row.id),["real","legacy"]);
});
test("F08: quality-held and negative inventory cannot inflate sellable stock",()=>{
 const lots=[{id:"released",status:"Available"},{id:"blocked",status:"Quality hold"},{id:"negative",status:"Available"}];
 const ledger=new Map([["released",8],["blocked",100],["negative",-4]]);
 assert.equal(reportSellableWarehouseCases(lots,id=>ledger.get(id)??0),8);
 assert.equal(reportSellableWarehouseCases([{id:"x",status:"Available"}],()=>Number.NaN),0);
});

// Commerce Refunds are payment-level, not invoice-level. Do not guess attribution.
test("F08: settled multi-order refunds must block cash reporting within the user's visible order scope",()=>{
 const commerce={invoices:[
  {id:"i1",orderId:"o1",status:"Paid"},{id:"i2",orderId:"o2",status:"Paid"},{id:"i3",orderId:"o3",status:"Paid"}],
  allocations:[{id:"a1",paymentId:"p1",invoiceId:"i1",amount:50},{id:"a2",paymentId:"p1",invoiceId:"i2",amount:50},
  {id:"a3",paymentId:"p2",invoiceId:"i3",amount:50}],
  refunds:[{id:"r1",paymentId:"p1",status:"Settled",settledAt:"2026-11-07",amount:10},
  {id:"r2",paymentId:"p2",status:"Settled",settledAt:"2026-11-07",amount:5},
  {id:"r3",paymentId:"p1",status:"Requested",amount:4}]
 } as CommerceState;
 assert.deepEqual(ambiguousSettledRefundIds(commerce,new Set(["o1"])),["r1"]);
 assert.deepEqual(ambiguousSettledRefundIds(commerce,new Set(["o2"]),"2026-11-08","2026-11-10"),[]);
 assert.deepEqual(ambiguousSettledRefundIds(commerce,new Set(["o3"])),[]);
 assert.deepEqual(ambiguousSettledRefundIds(commerce,new Set(["missing"])),[]);
});
