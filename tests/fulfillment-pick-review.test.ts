import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {buildPickListReview} from "../lib/fulfillment-pick-review";
import {createInventoryLedgerSeed,type InventoryLedgerState,type InventoryReservation} from "../lib/inventory-ledger";
import {GOLDEN_EAGLE_SKUS} from "../lib/product-catalog";
import type {InventoryLot,Order,WorkspaceData} from "../lib/types";

const ORIGINAL=GOLDEN_EAGLE_SKUS[0].description;
const SUGAR=GOLDEN_EAGLE_SKUS[1].description;
const clock="2026-11-07";
const sampleOrder=()=>({
  id:"review-fixture-order",number:"SAMPLE-NOT-REAL",product:ORIGINAL,cases:7,
  pricePerCase:24,amount:168,status:"Approved",placedAt:"2026-11-06T08:00:00Z",
  lines:[
    {id:"line-original",product:ORIGINAL,cases:4,pricePerCase:24,amount:96},
    {id:"line-sugar",product:SUGAR,cases:3,pricePerCase:24,amount:72},
  ],
} as unknown as Order);
const lot=(id:string,product:string,options:Partial<InventoryLot>={}):InventoryLot=>({
  id,lotCode:"QA-"+id,product,receivedAt:"2026-10-01",bestBy:"2027-06-01",
  onHand:12,reserved:0,available:12,status:"Available",location:"QA-only warehouse",
  ...options,
});
const reserve=(orderId:string,lotId:string,quantity:number,status:"Active"|"Released"|"Fulfilled"="Active"):InventoryReservation=>({
  id:"reservation-"+lotId+"-"+status,orderId,lotId,quantity,status,
  createdAt:"2026-11-06T10:00:00Z",createdBy:"qa-user",
  ...(status==="Released"?{releasedAt:"2026-11-06T11:00:00Z"}:{}),
  ...(status==="Fulfilled"?{fulfilledAt:"2026-11-06T11:00:00Z"}:{}),
});
const prepare=(order:Order,lots:InventoryLot[],reservations:InventoryReservation[]):InventoryLedgerState=>{
  const data={users:[],accounts:[],orders:[order],inventory:lots} as unknown as WorkspaceData;
  return {...createInventoryLedgerSeed(data),reservations};
};
test("no active allocation cannot be mistaken for physically packed stock",()=>{
  const o=sampleOrder();const lots=[lot("original",ORIGINAL),lot("sugar",SUGAR)];
  const s=buildPickListReview(o,lots,prepare(o,lots,[]),clock);
  assert.equal(s.lines.length,2);
  assert.equal(s.hasExceptions,true);
  assert(s.lines.every(row=>row.status==="Needs allocation"&&row.reservedCases===0));
  assert.match(s.description,/No physical pick/);
});
test("review matches both SKUs independently with exact reserved quantities and FEFO lot ordering",()=>{
  const o=sampleOrder();const lots=[
    lot("o-early",ORIGINAL,{bestBy:"2027-01-20"}),
    lot("o-late",ORIGINAL,{bestBy:"2027-04-20"}),
    lot("sugar",SUGAR,{bestBy:"2027-02-20"}),
  ];
  const reservations=[reserve(o.id,"o-late",2),reserve(o.id,"sugar",3),reserve(o.id,"o-early",2)];
  const snapshot=prepare(o,lots,reservations);
  const original=JSON.stringify(snapshot);
  const s=buildPickListReview(o,lots,snapshot,clock);
  assert.equal(JSON.stringify(snapshot),original,"Review must not mutate ledger");
  assert.equal(s.hasExceptions,false);
  assert.deepEqual(s.lines.map(row=>[row.orderedCases,row.reservedCases,row.unallocatedCases]),[[4,4,0],[3,3,0]]);
  assert.deepEqual(s.lines[0].reservations.map(row=>row.lotId),["o-early","o-late"]);
  assert(s.lines.every(row=>row.status==="Exact reservation · review lots"));
});
test("partial or extra reservations are flagged instead of silently reallocated",()=>{
  const o=sampleOrder();const lots=[lot("original",ORIGINAL),lot("sugar",SUGAR)];
  const partial=buildPickListReview(o,lots,prepare(o,lots,[reserve(o.id,"original",2),reserve(o.id,"sugar",3)]),clock);
  assert.equal(partial.lines[0].unallocatedCases,2);
  assert.equal(partial.lines[0].status,"Partially allocated");
  assert.equal(partial.hasExceptions,true);
  const extra=buildPickListReview(o,lots,prepare(o,lots,[reserve(o.id,"original",5),reserve(o.id,"sugar",3)]),clock);
  assert.equal(extra.lines[0].status,"Over-allocated");
  assert(extra.lines[0].issues.some(x=>x.includes("exceed ordered")));
});
test("held, expired, missing best-by and over-reserved custody lots require review",()=>{
  const o=sampleOrder();const lots=[
    lot("hold",ORIGINAL,{status:"Quality hold",bestBy:"2026-11-01"}),
    lot("unknown",SUGAR,{bestBy:"",onHand:2,available:2}),
  ];
  const result=buildPickListReview(o,lots,prepare(o,lots,[reserve(o.id,"hold",4),reserve(o.id,"unknown",3)]),clock);
  assert.equal(result.hasExceptions,true);
  assert.equal(result.lines[0].status,"Lot exception");
  assert(result.lines[0].reservations[0].issues.includes("Quality hold"));
  assert(result.lines[0].reservations[0].issues.includes("Past best-by"));
  assert(result.lines[1].reservations[0].issues.includes("Missing best-by"));
  assert(result.lines[1].reservations[0].issues.includes("Over-reserved"));
  assert(result.lines[1].reservations[0].issues.includes("Reserved cases exceed recorded warehouse custody"));
});
test("orphan reservations are surfaced, not falsely attributed to a SKU",()=>{
  const o=sampleOrder();const lots=[lot("original",ORIGINAL),lot("sugar",SUGAR)];
  const reservations=[reserve(o.id,"original",4),reserve(o.id,"sugar",3),reserve(o.id,"missing-product",1)];
  const result=buildPickListReview(o,lots,prepare(o,lots,reservations),clock);
  assert.equal(result.lines[0].reservedCases,4);
  assert.equal(result.lines[1].reservedCases,3);
  assert.deepEqual(result.unmatchedReservationIds,["reservation-missing-product-Active"]);
  assert.equal(result.hasExceptions,true);
});
test("released/fulfilled reservations are not mislabeled current picks",()=>{
  const o=sampleOrder();const lots=[lot("original",ORIGINAL)];
  const result=buildPickListReview(o,lots,prepare(o,lots,[
    reserve(o.id,"original",4,"Released"),reserve(o.id,"original",4,"Fulfilled"),
  ]),clock);
  assert.equal(result.lines[0].reservedCases,0);
  assert.equal(result.lines[0].status,"Needs allocation");
});
test("shipment detail exposes read-only SKU and lot view without reimplementing stock posts",()=>{
  const view=readFileSync("components/prototype/fulfillment-experience.tsx","utf8");
  assert.match(view,/buildPickListReview\(order,lots,ledger,arizonaDateKey\(\)\)/);
  assert.match(view,/<PickListPanel order=\{order\} lots=\{scope\.inventory\} ledger=\{ledger\}\/>/);
  assert.match(view,/NOT a physical packing slip/);
  assert.doesNotMatch(view,/postMovement\(/);
});
