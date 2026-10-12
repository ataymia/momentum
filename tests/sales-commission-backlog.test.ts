import assert from "node:assert/strict";
import test from "node:test";
import {reviewSalesCommissionBacklog} from "../lib/sales-commission-backlog";
import type {CommerceState} from "../lib/commerce-engine";
import type {WorkspaceData} from "../lib/types";

const data={
  users:[{id:"rep-1",role:"Sales Representative"},{id:"admin",role:"Administrator"}],
  orders:[
    {id:"old",number:"GE-OLD",placedAt:"2026-09-20",accountId:"a",ownerId:"rep-1",status:"Delivered",amount:240},
    {id:"today",number:"GE-TODAY",placedAt:"2026-10-10",accountId:"a",ownerId:"rep-1",status:"Approved",amount:240},
    {id:"no-owner",number:"GE-MISSING",placedAt:"2026-10-01",accountId:"a",ownerId:"admin",status:"Delivered",amount:100},
  ],
} as unknown as WorkspaceData;
const commerce={
  version:1,
  invoices:[
    {id:"inv-old",orderId:"old",accountId:"a",total:240,status:"Partially paid"},
    {id:"inv-today",orderId:"today",accountId:"a",total:240,status:"Open"},
    {id:"inv-missing",orderId:"no-owner",accountId:"a",total:100,status:"Open"},
  ],
  payments:[
    {id:"p1",status:"Cleared",amount:150},
    {id:"p2",status:"Pending",amount:90},
  ],
  allocations:[
    {id:"alloc-1",invoiceId:"inv-old",paymentId:"p1",amount:150},
    {id:"alloc-2",invoiceId:"inv-today",paymentId:"p2",amount:90},
  ],
  refunds:[{id:"r1",paymentId:"p1",status:"Settled",amount:30}],
  credits:[],
  notes:[],
} as unknown as CommerceState;

test("historical orders are included regardless of a fabricated launch cutoff",()=>{
  const rows=reviewSalesCommissionBacklog(data,commerce);
  assert.deepEqual(rows.map((x)=>x.orderId),["old","no-owner","today"]);
  assert.ok(rows.every((x)=>x.eligibleSinceLaunch===true));
  assert.ok(rows.every((x)=>x.payableCents===0));
});

test("cleared partial payment less settled refund is evidence, pending money is not",()=>{
  const rows=reviewSalesCommissionBacklog(data,commerce);
  const old=rows.find((x)=>x.orderId==="old")!;
  assert.equal(old.collectedEvidenceCents,12000);
  assert.equal(old.invoiceGrossCents,24000);
  assert.equal(old.reviewStatus,"Collected; exclusions and payroll consumption unverified");
  assert.equal(rows.find((x)=>x.orderId==="today")?.collectedEvidenceCents,0);
});

test("unverified sales attribution is held, not credited to an Administrator",()=>{
  const rows=reviewSalesCommissionBacklog(data,commerce);
  const missing=rows.find((x)=>x.orderId==="no-owner")!;
  assert.equal(missing.creditedRepresentativeId,undefined);
  assert.equal(missing.reviewStatus,"Attribution review");
});

test("reversed collection and settled refund cannot create a payable commission",()=>{
  const reversed={...commerce,payments:commerce.payments.map((x)=>({...x,status:"Reversed"}))} as CommerceState;
  const old=reviewSalesCommissionBacklog(data,reversed).find((x)=>x.orderId==="old")!;
  assert.equal(old.collectedEvidenceCents,0);
  assert.equal(old.payableCents,0);
});
