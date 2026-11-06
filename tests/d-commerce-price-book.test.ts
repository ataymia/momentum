import assert from "node:assert/strict";
import test from "node:test";
import {assessRetailPriceBook,followingQuarterStart,quarterEnd,tierForMonthlyCases} from "../lib/retail-price-book";
const order=(id:string,day:string,cases:number,status="Paid")=>({id,accountId:"store",placedAt:day,cases,paymentStatus:status,status:"Delivered"});
test("retailer tiers follow monthly cases",()=>{
  assert.equal(tierForMonthlyCases(9),"C");assert.equal(tierForMonthlyCases(10),"B");
  assert.equal(tierForMonthlyCases(19),"B");assert.equal(tierForMonthlyCases(20),"A");
});
test("calendar-quarter dates roll over at year end",()=>{
  assert.equal(followingQuarterStart("2026-12-31"),"2027-01-01");
  assert.equal(quarterEnd("2026-06-01"),"2026-06-30");
});
test("intro is 60 days and pending/cancelled/test orders do not qualify",()=>{
  const o=[order("first","2026-01-01",10),order("pending","2026-02-01",20,"Open"),{...order("cancel","2026-02-01",30),status:"Cancelled"},{...order("qa","2026-02-01",30),testOnly:true}];
  const assessed=assessRetailPriceBook("store",o,"2026-02-15");
  assert.equal(assessed.status,"Introductory");assert.equal(assessed.paidCases,10);
  assert.deepEqual(assessed.evidenceOrderIds,["first"]);
  assert.equal(assessed.nextReview,"2026-03-02");
});
test("20 paid cases extend the launch offer through next full quarter",()=>{
  const o=[order("first","2026-01-01",10),order("second","2026-02-10",10)];
  const extended=assessRetailPriceBook("store",o,"2026-06-30");
  assert.equal(extended.status,"Launch extension");assert.equal(extended.pricePerCase,24);
  assert.equal(assessRetailPriceBook("store",o,"2026-07-01").pricePerCase,30);
});
test("quarterly prices use prior calendar quarter instead of rolling 90-day windows",()=>{
  const o=[order("first","2026-01-01",10),order("april","2026-04-07",60)];
  const result=assessRetailPriceBook("store",o,"2026-07-01");
  assert.equal(result.basis,"Prior calendar-quarter monthly average");
  assert.equal(result.averageMonthlyCases,20);assert.equal(result.pricePerCase,24);
});

test("intro requires first approved opening order with at least ten cases",()=>{
 const short=[order("short","2026-01-01",2),order("later","2026-01-05",10)];
 const result=assessRetailPriceBook("store",short,"2026-02-01");
 assert.equal(result.status,"Not started");assert.equal(result.pricePerCase,null);
 const draft=[{...order("pending","2026-01-01",10),status:"Awaiting approval"}];
 assert.equal(assessRetailPriceBook("store",draft,"2026-02-01").status,"Not started");
 const future=[order("future","2027-01-01",10)];
 assert.equal(assessRetailPriceBook("store",future,"2026-12-31").status,"Not started");
});
