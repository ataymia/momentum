import assert from "node:assert/strict";
import test from "node:test";

import { calculateManagementKpi } from "../lib/management-kpi";
import type { CommerceState } from "../lib/commerce-engine";
import type { CrmState } from "../lib/crm-engine";
import { createDemoData } from "../lib/demo-data";

function sourceFixture(){
  const data=createDemoData();
  const rep=data.users.find((user)=>user.role==="Sales Representative")!;
  const account=data.accounts[0]!;
  const order={
    id:"order-kpi-live",
    number:"GE-KPI-LIVE",
    accountId:account.id,
    cases:10,
    pricePerCase:24,
    amount:240,
    status:"Delivered" as const,
    placedAt:"2026-10-01",
    ownerId:rep.id,
    creditedRepId:rep.id,
    priceBasis:"Test",
    paymentStatus:"Open" as const,
  };
  data.orders=[order];
  const commerce:CommerceState={
    version:1,
    invoices:[{id:"invoice-kpi-live",number:"INV-KPI-LIVE",orderId:order.id,accountId:account.id,issuedAt:"2026-10-01",terms:"COD",total:240,status:"Open",createdAt:"2026-10-01T12:00:00Z"}],
    payments:[{id:"payment-kpi-live",accountId:account.id,receivedAt:"2026-10-05",amount:240,method:"ACH",status:"Cleared",createdBy:"admin",createdAt:"2026-10-05T12:00:00Z",settledAt:"2026-10-05",settledBy:"admin"}],
    allocations:[{id:"allocation-kpi-live",paymentId:"payment-kpi-live",invoiceId:"invoice-kpi-live",amount:240,createdAt:"2026-10-05T12:00:00Z",createdBy:"admin"}],
    credits:[],refunds:[],notes:[],
  };
  const crm:CrmState={
    version:1,contacts:[],opportunities:[],responsibilityHistory:[],
    interactions:[
      {id:"visit-live",locationId:"quick-visit:test",userId:rep.id,type:"Visit",occurredAt:"2026-10-05T16:00:00Z",summary:"Physical stop",physicalVisit:true},
      {id:"call-live",locationId:account.id,userId:rep.id,type:"Call",occurredAt:"2026-10-05T17:00:00Z",summary:"Call"},
    ],
  };
  return{data,rep,commerce,crm};
}

test("KPI Center reads cleared commerce evidence even before workspace payment status catches up",()=>{
  const{data,rep,commerce,crm}=sourceFixture();
  const period={start:"2026-10-01",end:"2026-10-07"};
  const paidCases=calculateManagementKpi("paid_cases",data,period,[rep.id],undefined,commerce,crm);
  const paidOrders=calculateManagementKpi("paid_orders",data,period,[rep.id],undefined,commerce,crm);
  const collected=calculateManagementKpi("collected_revenue",data,period,[rep.id],undefined,commerce,crm);
  assert.equal(data.orders[0].paymentStatus,"Open");
  assert.equal(paidCases.value,10);
  assert.equal(paidOrders.value,1);
  assert.equal(collected.value,240);
  assert.deepEqual(collected.sourceRecordIds,["allocation-kpi-live"]);
});

test("Net collected sales subtracts settled refunds from the commerce ledger",()=>{
  const{data,rep,commerce,crm}=sourceFixture();
  commerce.refunds.push({id:"refund-kpi-live",paymentId:"payment-kpi-live",amount:40,reason:"Verified quality issue",basis:"Verified quality issue",evidence:"Customer return",status:"Settled",createdAt:"2026-10-06T12:00:00Z",createdBy:"admin",approvedAt:"2026-10-06T12:10:00Z",approvedBy:"admin",sentReference:"REF-1",sentAt:"2026-10-06T12:20:00Z",sentBy:"admin",settledAt:"2026-10-06",settledBy:"admin"});
  const period={start:"2026-10-01",end:"2026-10-07"};
  const result=calculateManagementKpi("collected_revenue",data,period,[rep.id],undefined,commerce,crm);
  assert.equal(result.value,200);
  assert.deepEqual(new Set(result.sourceRecordIds),new Set(["allocation-kpi-live","refund-kpi-live"]));
});

test("KPI Center counts physical Quick Visits from CRM without requiring an account",()=>{
  const{data,rep,commerce,crm}=sourceFixture();
  const result=calculateManagementKpi("physical_visits",data,{start:"2026-10-05",end:"2026-10-05"},[rep.id],undefined,commerce,crm);
  assert.equal(result.value,1);
  assert.deepEqual(result.sourceRecordIds,["visit-live"]);
});
