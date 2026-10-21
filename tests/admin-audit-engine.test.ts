import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminAudit } from "../lib/admin-audit-engine";
import { adminAuditPdf } from "../lib/admin-audit-pdf";
import type { WorkspaceData } from "../lib/types";
import type { CrmState } from "../lib/crm-engine";
import type { CommerceState } from "../lib/commerce-engine";
import type { FieldTrackingState } from "../lib/location-tracking-engine";

const from="2026-10-19",to="2026-10-20";
const baseData={
 users:[{id:"rep-1",name:"Rep One",role:"Sales Representative",employmentStatus:"Active"}],
 accounts:[
  {id:"store-a",name:"Store A",ownerId:"rep-1",stage:"Placed",createdByUid:"rep-1",createdAt:"2026-10-19T09:00:00-07:00",nextActionDate:"2026-10-30"},
  {id:"store-b",name:"Store B",ownerId:"rep-1",stage:"Prospect",createdAt:"2026-10-19T09:00:00-07:00",nextActionDate:"2026-10-18"},
  {id:"store-c",name:"Store C",ownerId:"rep-1",stage:"Prospect",createdByUid:"rep-1",createdAt:"2026-10-19T12:00:00-07:00",nextActionDate:"2026-10-30"},
 ],
 timeEntries:[
  {id:"p-1",userId:"rep-1",date:from,clockIn:"08:30",clockInAt:"2026-10-19T08:30:00-07:00",clockOut:"16:30",clockOutAt:"2026-10-19T16:30:00-07:00",breakMinutes:0,source:"Web clock"},
  {id:"p-2",userId:"rep-1",date:to,clockIn:"08:00",clockOut:"23:59",clockOutAt:"2026-10-21T00:00:00-07:00",note:"Automatically closed at Arizona midnight. Actual departure time not verified; manager/payroll review required.",breakMinutes:0,source:"Web clock"},
 ],
 activities:[{id:"work-1",userId:"rep-1",at:"2026-10-19T14:00:00-07:00",type:"call"}],
 orders:[{id:"order-1",number:"GE-1",accountId:"store-a",ownerId:"rep-1",creditedRepId:"rep-1",status:"Paid",placedAt:"2026-10-19T14:30:00-07:00",paidAt:"2026-10-20T13:00:00-07:00",paymentStatus:"Paid",cases:10,pricePerCase:24,amount:240}],
 appointments:[],placements:[],inventory:[],approvals:[],timecards:[],notifications:[],bulletins:[],
} as unknown as WorkspaceData;
const crm={interactions:[
 {id:"visit-1",userId:"rep-1",locationId:"store-a",type:"Visit",physicalVisit:true,occurredAt:"2026-10-19T13:00:00-07:00"},
 {id:"visit-2",userId:"rep-1",locationId:"store-a",type:"Visit",physicalVisit:true,occurredAt:"2026-10-19T13:15:00-07:00"},
 {id:"visit-3",userId:"rep-1",locationId:"store-b",type:"Visit",physicalVisit:true,occurredAt:"2026-10-19T12:00:00-07:00"},
]} as unknown as CrmState;
const gps={samples:[{id:"gps-1",userId:"rep-1",at:"2026-10-19T15:00:00-07:00",latitude:33.5,longitude:-112,accuracyMeters:20}]} as FieldTrackingState;
const commerce={version:1 as const,invoices:[],payments:[],allocations:[],credits:[],refunds:[],notes:[]} as CommerceState;
const audit=()=>buildAdminAudit(baseData,crm,gps,commerce,from,to,["rep-1"]);

test("flags scheduled Phoenix-midnight auto-close even with clockOut set",()=>{
 const report=audit(),day=report.days.find(row=>row.date===to)!;
 assert.equal(day.autoClosed,true);
 assert.equal(day.incompletePunch,false);
 assert.ok(day.flags.some(f=>f.category==="Timekeeping"&&f.reason.includes("missed a clock-out")));
});
test("keeps distinct visits and buying accounts separate, without attributing legacy creators",()=>{
 const report=audit(),sales=report.sales[0];
 assert.equal(sales.physicalVisits,3);
 assert.equal(sales.distinctVisitedAccounts,2);
 assert.equal(sales.newAccountsOpened,2);
 assert.equal(sales.accountsOwnedNow,3);
 assert.equal(sales.accountsSold,1);
 assert.equal(sales.firstTimeBuyingAccounts,1);
 assert.equal(sales.visitedAccountsThatOrdered,1);
 assert.equal(sales.visitToOrderPercent,50);
 assert.equal(sales.newAccountsThatOrdered,1);
 assert.equal(sales.newAccountToOrderPercent,50);
 assert.equal(sales.ownedAccountsThatOrdered,1);
 assert.equal(sales.ownedBookOrderingPercent,33.3);
});
test("reports distinct last-visit, last-work and GPS gaps, not work duration",()=>{
 const day=audit().days.find(row=>row.date===from)!;
 assert.equal(day.visitToOutMinutes,195);
 assert.equal(day.workToOutMinutes,150);
 assert.equal(day.gpsToOutMinutes,90);
 assert.ok(day.flags.some(flag=>flag.category==="Field"));
});
test("zero denominators produce n/a, PDF contains header but no GPS coordinates",async()=>{
 const empty={...baseData,accounts:[],orders:[],activities:[],timeEntries:[]} as WorkspaceData;
 const emptyCrm={version:1 as const,contacts:[],interactions:[],opportunities:[],responsibilityHistory:[]} as CrmState;
 const emptyGps={version:1 as const,geofences:[],sessions:[],samples:[],appointmentEvents:[],exceptions:[],departureAlerts:[]} as FieldTrackingState;
 const result=buildAdminAudit(empty,emptyCrm,emptyGps,commerce,from,to,["rep-1"]);
 assert.equal(result.sales[0].visitToOrderPercent,null);
 assert.equal(result.sales[0].ownedBookOrderingPercent,null);
 const pdf=adminAuditPdf(audit());
 assert.equal(pdf.type,"application/pdf");
 const bytes=await pdf.text();
 assert.ok(bytes.startsWith("%PDF-1.4"));
 assert.ok(bytes.includes("SALES FUNNEL"));
 assert.ok(!bytes.includes("33.5"));
 assert.ok(!bytes.includes("-112"));
});

test("net collected subtracts already-signed settled refunds exactly once",()=>{
 const at="2026-10-20T13:00:00-07:00";
 const ledger={
   ...commerce,
   invoices:[{id:"inv-1",number:"INV-1",orderId:"order-1",accountId:"store-a",issuedAt:at,terms:"COD",total:240,status:"Paid",createdAt:at}],
   payments:[{id:"payment-1",accountId:"store-a",receivedAt:at,settledAt:at,settledBy:"system",amount:240,method:"ACH",status:"Cleared",createdBy:"system",createdAt:at}],
   allocations:[{id:"allocation-1",paymentId:"payment-1",invoiceId:"inv-1",amount:240,createdAt:at,createdBy:"system"}],
   refunds:[{id:"refund-1",paymentId:"payment-1",amount:30,reason:"Approved credit",status:"Settled",settledAt:at,createdAt:at,createdBy:"system"}],
 } as CommerceState;
 const result=buildAdminAudit(baseData,crm,gps,ledger,from,to,["rep-1"]);
 assert.equal(result.sales[0].netCollected,210);
});

test("groups repeat visits by employee and exact location with no duplicate team attribution",()=>{
 const secondRep={id:"rep-2",name:"Rep Two",role:"Sales Representative",employmentStatus:"Active"};
 const data={...baseData,users:[...baseData.users,secondRep]} as unknown as WorkspaceData;
 const newCrm={...crm,interactions:[
   ...crm.interactions,
   {id:"visit-rep2-storea",userId:"rep-2",locationId:"store-a",type:"Visit",physicalVisit:true,occurredAt:"2026-10-20T11:00:00-07:00"},
   {id:"visit-freehand1",userId:"rep-2",locationId:"quick-visit:local-bakery-1234",type:"Visit",physicalVisit:true,quickVisitBusinessName:"Local Bakery",occurredAt:"2026-10-19T09:00:00-07:00"},
   {id:"visit-freehand2",userId:"rep-2",locationId:"quick-visit:local-bakery-1234",type:"Visit",physicalVisit:true,quickVisitBusinessName:"Local Bakery",occurredAt:"2026-10-20T09:00:00-07:00",visitUnsuccessful:true},
 ]} as CrmState;
 const result=buildAdminAudit(data,newCrm,gps,commerce,from,to,["rep-1","rep-2"]);
 const storeARep1=result.visits.find(r=>r.userId==="rep-1"&&r.locationId==="store-a")!;
 const storeARep2=result.visits.find(r=>r.userId==="rep-2"&&r.locationId==="store-a")!;
 const bakery=result.visits.find(r=>r.userId==="rep-2"&&r.location==="Local Bakery")!;
 assert.equal(storeARep1.visits,2);
 assert.equal(storeARep1.returnVisits,1);
 assert.equal(storeARep1.distinctVisitDays,1);
 assert.equal(storeARep1.selectedTeamVisits,3);
 assert.equal(storeARep1.paidOrdersCreditedToRep,1);
 assert.equal(storeARep2.visits,1);
 assert.equal(storeARep2.returnVisits,0);
 assert.equal(storeARep2.selectedTeamVisits,3);
 assert.equal(bakery.visits,2);
 assert.equal(bakery.returnVisits,1);
 assert.equal(bakery.distinctVisitDays,2);
 assert.equal(bakery.unsuccessfulVisits,1);
 assert.equal(bakery.linkedAccount,false);
 assert.equal(bakery.paidOrdersCreditedToRep,0);
 assert.equal(result.sales.find(r=>r.userId==="rep-1")!.returnVisits,1);
 assert.equal(result.sales.find(r=>r.userId==="rep-1")!.revisitedLocations,1);
 assert.equal(result.sales.find(r=>r.userId==="rep-2")!.returnVisits,1);
 assert.equal(result.sales.find(r=>r.userId==="rep-2")!.revisitedLocations,1);
 const single=buildAdminAudit(data,newCrm,gps,commerce,from,to,["rep-1"]);
 assert.equal(single.visits.find(r=>r.locationId==="store-a")!.selectedTeamVisits,2);
});
test("repeat location detail appears in exported PDF",async()=>{
 const report=audit();
 const pdf=await adminAuditPdf(report).text();
 assert.ok(pdf.includes("VISITS BY EMPLOYEE AND BUSINESS LOCATION"));
 assert.ok(pdf.includes("Store A"));
 assert.ok(pdf.includes("return visits 1"));
 assert.ok(!pdf.includes("33.5"));
});

test("account sold counts distinct non-cancelled placed orders before payment",()=>{
 const pendingOrders=[
  {...baseData.orders[0],id:"o-2",number:"GE-2",accountId:"store-b",status:"Awaiting approval",paymentStatus:"Not invoiced",placedAt:"2026-10-19T15:00:00-07:00",paidAt:undefined},
  {...baseData.orders[0],id:"o-3",number:"GE-3",accountId:"store-b",status:"Approved",paymentStatus:"Open",placedAt:"2026-10-19T16:00:00-07:00",paidAt:undefined},
  {...baseData.orders[0],id:"o-4",number:"GE-4",accountId:"store-c",status:"Cancelled",paymentStatus:"Not invoiced",placedAt:"2026-10-19T17:00:00-07:00",paidAt:undefined},
 ];
 const report=buildAdminAudit({...baseData,orders:[...baseData.orders,...pendingOrders]} as WorkspaceData,crm,gps,commerce,from,to,["rep-1"]);
 const row=report.sales[0];
 assert.equal(row.placedOrders,3);
 assert.equal(row.accountsSold,2);
 assert.equal(row.paidOrders,1);
 assert.equal(row.visitedAccountsThatOrdered,2);
 assert.equal(row.visitToOrderPercent,100);
 assert.equal(row.newAccountsThatOrdered,1);
 assert.equal(row.newAccountToOrderPercent,50);
 assert.equal(row.ownedAccountsThatOrdered,2);
 assert.equal(row.ownedBookOrderingPercent,66.7);
 assert.equal("accounts" in report,false);
});
