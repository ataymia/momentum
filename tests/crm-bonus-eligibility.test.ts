import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSalesRepAccountBonuses, orderFirstSettlementDate } from "../lib/bonus-engine";
import type { WorkspaceData, Order } from "../lib/types";

const order = (id:string, casesCount:number, extra:Partial<Order>={}):Order=>({
  id, number:"GE-"+id, accountId:"location-1",
  cases:casesCount,pricePerCase:24,amount:casesCount*24,
  status:"Delivered",placedAt:"2026-10-01",ownerId:"rep-2",
  priceBasis:"Approved pricing",paymentStatus:"Paid",
  ...extra,
});

const dataWith=(orders:Order[]):WorkspaceData=>({
  users:[
    {id:"rep-1",role:"Sales Representative"},
    {id:"rep-2",role:"Sales Representative"},
    {id:"admin",role:"Administrator"},
  ],
  accounts:[{id:"location-1",originatorId:"rep-1",ownerId:"rep-2"}],
  orders,activities:[],
} as unknown as WorkspaceData);

const asOf=new Date("2026-11-06T12:00:00Z");

test("a Paid display flag without verified settlement does not earn either bonus",()=>{
  const ten=order("opening",10,{creditedRepId:"rep-1",firstSettledAt:undefined,paidAt:undefined});
  assert.equal(orderFirstSettlementDate(dataWith([ten]),ten),undefined);
  const signals=evaluateSalesRepAccountBonuses(dataWith([ten]),asOf);
  assert.equal(signals.find(s=>s.milestone==="Opening order")?.status,"Awaiting payment");
  assert.equal(signals.find(s=>s.milestone==="Sustained account")?.observedCases,0);
});

test("verified cleared opening and later settled orders reach 40 once, with only 10/40 milestones",()=>{
  const history=[
    order("opening",10,{creditedRepId:"rep-1",firstSettledAt:"2026-10-03T16:00:00Z"}),
    order("second",30,{placedAt:"2026-10-10",firstSettledAt:"2026-10-11T18:00:00Z"}),
    order("cancelled",100,{status:"Cancelled",placedAt:"2026-10-05",firstSettledAt:"2026-10-05T18:00:00Z"}),
    order("qa-only",100,{testOnly:true,placedAt:"2026-10-04",firstSettledAt:"2026-10-04T18:00:00Z"}),
  ];
  const signals=evaluateSalesRepAccountBonuses(dataWith(history),asOf);
  assert.equal(signals.length,2);
  assert.deepEqual(signals.map(s=>s.thresholdCases),[10,40]);
  assert.deepEqual(signals.map(s=>s.status),["Earned","Earned"]);
  assert.equal(signals[1].observedCases,40);
  assert.deepEqual(signals[1].evidenceOrderIds,["opening","second"]);
  assert.ok(signals.every(s=>s.repId==="rep-1"),"Credited representative is historical, not current location owner");
});

test("explicit credited UID missing from directory cannot be silently reassigned",()=>{
  const signals=evaluateSalesRepAccountBonuses(dataWith([order("opening",10,{creditedRepId:"forged-rep",firstSettledAt:"2026-10-03T16:00:00Z"})]),asOf);
  assert.equal(signals.length,0);
});

test("settlements after a 90-day window never backdate sustained qualification",()=>{
  const records=[
    order("opening",10,{firstSettledAt:"2026-10-01T12:00:00Z"}),
    order("late",30,{placedAt:"2026-10-15",firstSettledAt:"2027-02-01T12:00:00Z"}),
  ];
  const rows=evaluateSalesRepAccountBonuses(dataWith(records),new Date("2027-02-06T12:00:00Z"));
  assert.equal(rows.find(s=>s.milestone==="Sustained account")?.status,"Window expired");
  assert.equal(rows.find(s=>s.milestone==="Sustained account")?.observedCases,10);
});

test("first partial cash receipt cannot earn all order cases before final Paid settlement",()=>{
 const partial=order("opening",10,{placedAt:"2026-10-01T08:30:00Z",paymentStatus:"Partially paid",firstSettledAt:"2026-10-03T12:00:00Z"});
 const pending=evaluateSalesRepAccountBonuses(dataWith([partial]),new Date("2026-11-06T12:00:00Z"));
 assert.equal(pending.find(s=>s.milestone==="Opening order")?.status,"Awaiting payment");
 assert.equal(pending.find(s=>s.milestone==="Sustained account")?.observedCases,0);
 const final={...partial,paymentStatus:"Paid" as const,paidAt:"2026-10-08T10:00:00Z"};
 const approved=evaluateSalesRepAccountBonuses(dataWith([final]),new Date("2026-11-06T12:00:00Z"));
 assert.equal(approved.find(s=>s.milestone==="Opening order")?.status,"Earned");
 assert.equal(approved.find(s=>s.milestone==="Sustained account")?.observedCases,10);
 assert.equal(approved.find(s=>s.milestone==="Opening order")?.windowStart,"2026-10-01");
 assert.equal(approved.find(s=>s.milestone==="Opening order")?.windowEnd,"2026-12-30");
});

test("full settlement after 90-day deadline cannot backdate 40-case eligibility",()=>{
 const late=order("opening",40,{
   placedAt:"2026-07-01T10:00:00Z",firstSettledAt:"2026-07-02T10:00:00Z",
   paymentStatus:"Paid",paidAt:"2026-11-01T10:00:00Z",
 });
 const signals=evaluateSalesRepAccountBonuses(dataWith([late]),new Date("2026-11-07T12:00:00Z"));
 assert.equal(signals.find(s=>s.milestone==="Sustained account")?.status,"Window expired");
 assert.equal(signals.find(s=>s.milestone==="Sustained account")?.observedCases,0);
});
