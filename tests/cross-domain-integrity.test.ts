import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scanCrossDomainIntegrity} from "../lib/cross-domain-integrity";
import type {WorkspaceData} from "../lib/types";
import type {CrmState} from "../lib/crm-engine";
import type {CommerceState} from "../lib/commerce-engine";
import type {InventoryLedgerState} from "../lib/inventory-ledger";

function sample(){
 const data={accounts:[{id:"acc-1",customerId:"customer-1"}],customers:[{id:"customer-1"}],
  orders:[{id:"order-1",accountId:"acc-1",cases:4,amount:96,paymentStatus:"Open",status:"Approved"}]} as unknown as WorkspaceData;
 const crm={contacts:[],interactions:[],opportunities:[]} as unknown as CrmState;
 const commerce={invoices:[{id:"inv-1",orderId:"order-1",accountId:"acc-1",status:"Open",total:96,number:"I-1"}],
  payments:[],allocations:[],credits:[],refunds:[]} as unknown as CommerceState;
 const ledger={nodes:[],movements:[],reservations:[]} as unknown as InventoryLedgerState;
 return {data,crm,commerce,ledger};
}
test("cross-domain scan leaves valid referenced records untouched",()=>{
 const {data,crm,commerce,ledger}=sample();
 const before=JSON.stringify({data,crm,commerce,ledger});
 assert.deepEqual(scanCrossDomainIntegrity(data,crm,commerce,ledger),[]);
 assert.equal(JSON.stringify({data,crm,commerce,ledger}),before);
});
test("foreign CRM, missing invoice sources and orphaned stock are visible blockers",()=>{
 const {data,crm,commerce,ledger}=sample();
 crm.interactions.push({id:"bad-crm",locationId:"foreign",userId:"rep",type:"Visit"} as CrmState["interactions"][number]);
 commerce.invoices.push({id:"bad-inv",orderId:"absent",accountId:"acc-1",status:"Open",total:2} as CommerceState["invoices"][number]);
 ledger.movements.push({id:"bad-movement",relatedOrderId:"absent",type:"Delivery",quantity:2} as InventoryLedgerState["movements"][number]);
 const issues=scanCrossDomainIntegrity(data,crm,commerce,ledger);
 assert(issues.some(issue=>issue.code==="CRM_LOCATION_MISSING"&&issue.recordId==="bad-crm"));
 assert(issues.some(issue=>issue.code==="INVOICE_ORDER_LINK_INVALID"&&issue.recordId==="bad-inv"));
 assert(issues.some(issue=>issue.code==="CUSTODY_ORDER_MISSING"&&issue.recordId==="bad-movement"));
});
test("cross-customer payment allocation, overallocated amounts and ambiguous refund are flagged",()=>{
 const {data,crm,commerce,ledger}=sample();
 commerce.invoices.push({id:"inv-2",orderId:"order-2",accountId:"acc-1",status:"Open",total:96} as CommerceState["invoices"][number]);
 data.orders.push({id:"order-2",accountId:"acc-1",cases:4,amount:96,paymentStatus:"Open",status:"Approved"} as WorkspaceData["orders"][number]);
 commerce.payments.push({id:"p1",accountId:"acc-1",amount:100,status:"Cleared",settledAt:"2026-11-01",settledBy:"rep"} as CommerceState["payments"][number]);
 commerce.allocations.push({id:"al1",paymentId:"p1",invoiceId:"inv-1",amount:80} as CommerceState["allocations"][number]);
 commerce.allocations.push({id:"al2",paymentId:"p1",invoiceId:"inv-2",amount:80} as CommerceState["allocations"][number]);
 commerce.refunds.push({id:"r1",paymentId:"p1",amount:20,status:"Requested"} as CommerceState["refunds"][number]);
 const issues=scanCrossDomainIntegrity(data,crm,commerce,ledger);
 assert(issues.some(issue=>issue.code==="PAYMENT_OVERALLOCATED"&&issue.recordId==="p1"));
 assert(issues.some(issue=>issue.code==="REFUND_INVOICE_AMBIGUOUS"&&issue.recordId==="r1"));
 assert(issues.some(issue=>issue.code==="INVOICE_RECONCILIATION"));
});
test("only Administrator sees cross-domain provenance panel on actual Audit page",()=>{
 const panel=readFileSync("components/audit/cross-domain-integrity-panel.tsx","utf8");
 const route=readFileSync("components/pages/focused-workspace-pages.tsx","utf8");
 assert.match(panel,/currentUser\?\.role!=="Administrator"/);
 assert.match(panel,/scanCrossDomainIntegrity\(data,crm,commerce,ledger,\{delivery,marketing,hcm,performance\}\)/);
 assert.match(panel,/Does not certify bank settlement/);
 assert.match(route,/<CrossDomainIntegrityPanel\/><AuditCenter\/>/);
});

test("R74 cross-functional audit joins delivery, marketing, HR and reported orders without fabricating source records",()=>{
 const {data,crm,commerce,ledger}=sample();
 data.users=[{id:"employee-1",role:"Sales Representative"}] as WorkspaceData["users"];
 const issues=scanCrossDomainIntegrity(data,crm,commerce,ledger,{
  delivery:{tasks:[{id:"delivery-1",orderId:"not-present",driverId:"former-driver",status:"Delivered",collections:[{id:"cash-1"}]}] as unknown as import("../lib/delivery-engine").DeliveryTask[],overrides:[]},
  marketing:{campaigns:[{id:"campaign-1"}] as unknown as import("../lib/marketing-engine").Campaign[],
    attributions:[{id:"attr-1",campaignId:"campaign-1",accountId:"acc-1",sourceType:"Order",sourceId:"missing-order",reviewed:true}] as import("../lib/marketing-engine").MarketingAttribution[],
    touches:[]},
  hcm:{employees:[{userId:"employee-1",status:"Active",classification:"Hourly"}] as import("../lib/hcm-engine").EmploymentRecord[],documents:[]},
  performance:{reports:[{id:"rpt-1",type:"Daily",sourceOrderIds:["missing-order"]}] as import("../lib/performance-engine").WorkReport[]},
 });
 for(const code of ["DELIVERY_ORDER_MISSING","DELIVERY_DRIVER_MISSING",
  "DELIVERY_COLLECTION_NOT_SETTLEMENT","ATTRIBUTION_ORDER_LINK_INVALID",
  "REQUIRED_DOCUMENT_MISSING","REPORT_SOURCE_ORDER_MISSING"]){
  assert(issues.some(issue=>issue.code===code),code);
 }
 assert(issues.some(issue=>issue.code==="ATTRIBUTION_ORDER_LINK_INVALID"&&issue.severity==="blocker"));
});
test("R74 a healthy cross-department source chain is not labeled broken",()=>{
 const {data,crm,commerce,ledger}=sample();
 data.users=[{id:"employee-1",role:"Sales Representative"}] as WorkspaceData["users"];
 const issues=scanCrossDomainIntegrity(data,crm,commerce,ledger,{
   delivery:{tasks:[{id:"task-1",orderId:"order-1",driverId:"employee-1",status:"Delivered",signature:{signedAt:"2026-11-05",capturedBy:"employee-1",strokes:[]},history:[]}] as unknown as import("../lib/delivery-engine").DeliveryTask[],overrides:[]},
   marketing:{campaigns:[{id:"campaign-1"}] as unknown as import("../lib/marketing-engine").Campaign[],attributions:[{id:"attr-1",campaignId:"campaign-1",accountId:"acc-1",sourceType:"Order",sourceId:"order-1",reviewed:true}] as import("../lib/marketing-engine").MarketingAttribution[],touches:[]},
   hcm:{employees:[],documents:[]},
   performance:{reports:[]},
 });
 assert.deepEqual(issues,[]);
});
