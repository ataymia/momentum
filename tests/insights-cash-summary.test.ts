import assert from "node:assert/strict";
import test from "node:test";
import type {CollectedCashFact,PaidOrderFact} from "../lib/commercial-source";
import {insightCashSummary} from "../lib/insights-cash-summary";
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
