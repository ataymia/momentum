import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {accountHealthSnapshot} from "../lib/account-health";
import type {Account,Order,WorkspaceData} from "../lib/types";
const account={id:"acc-1",name:"Store",location:"Phoenix"} as Account;
const order=(id:string,cases:number,extra:Partial<Order>={}):Order=>({
 id,number:id,accountId:"acc-1",cases,pricePerCase:24,amount:cases*24,
 status:"Delivered",placedAt:"2026-10-02T09:00:00Z",
 ownerId:"rep-1",priceBasis:"Approved price",paymentStatus:"Paid",...extra,
});
const data=(orders:Order[]):WorkspaceData=>({orders,activities:[]} as unknown as WorkspaceData);
const today=new Date("2026-11-06T19:00:00Z");
test("Paid status without settlement evidence is not a paid case or paid account",()=>{
 const snap=accountHealthSnapshot(data([order("unverified",10)]),account,today);
 assert.equal(snap.lastOrderDate,"2026-10-02");
 assert.equal(snap.rolling90PaidCases,0);
 assert.equal(snap.rolling90PaidOrderCount,0);
 assert.equal(snap.lastPaidOrderDate,undefined);
});
test("only verified settlements from real noncancelled accounts contribute",()=>{
 const snap=accountHealthSnapshot(data([
  order("settled",12,{firstSettledAt:"2026-10-06T19:00:00Z"}),
  order("void",100,{status:"Cancelled",firstSettledAt:"2026-10-03T09:00:00Z"}),
  order("qa",100,{testOnly:true,firstSettledAt:"2026-10-04T09:00:00Z"}),
  order("unpaid",10,{paymentStatus:"Open"}),
 ]),account,today);
 assert.equal(snap.rolling90PaidCases,12);
 assert.equal(snap.rolling90PaidOrderCount,1);
 assert.equal(snap.lastPaidOrderDate,"2026-10-06");
 assert.equal(snap.rolling3MonthMonthlyAverage,4);
});
test("paid volume uses actual settlement date, not order placement date",()=>{
 const snap=accountHealthSnapshot(data([
  order("old",20,{placedAt:"2026-06-01T10:00:00Z",paidAt:"2026-10-30T12:00:00Z"}),
  order("late",50,{placedAt:"2026-10-20T12:00:00Z",firstSettledAt:"2026-12-01T12:00:00Z"}),
 ]),account,today);
 assert.equal(snap.rolling90PaidCases,20);
 assert.equal(snap.lastPaidOrderDate,"2026-10-30");
});

test("account health is an independent routed page with actual scoped actions",()=>{
 const hub=readFileSync("components/prototype/operations-hub.tsx","utf8");
 const page=readFileSync("components/prototype/crm-account-health.tsx","utf8");
 assert.match(hub,/if\(path==="\/crm\/account-health"\)return <CrmAccountHealth\/>/);
 assert.match(page,/scope\.accounts\.map\(account=>\(\{account,health:accountHealthSnapshot/);
 assert.match(page,/currentUser\.role==="Customer"/);
 assert.match(page,/downloadCsv\("momentum-account-health\.csv",exported,columns\)/);
 assert.match(page,/navigateToRoute\("\/sales\/customers\/"\+encodeURIComponent\(account\.id\)\)/);
});
