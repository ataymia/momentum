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
 assert.equal(sales.visitedAccountsThatPaid,1);
 assert.equal(sales.visitToPaidPercent,50);
 assert.equal(sales.newAccountsThatPaid,1);
 assert.equal(sales.newAccountToPaidPercent,50);
 assert.equal(sales.ownedAccountsThatPaid,1);
 assert.equal(sales.ownedBookBuyingPercent,33.3);
 assert.equal(report.accounts.length,1);
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
 assert.equal(result.sales[0].visitToPaidPercent,null);
 assert.equal(result.sales[0].ownedBookBuyingPercent,null);
 const pdf=adminAuditPdf(audit());
 assert.equal(pdf.type,"application/pdf");
 const bytes=await pdf.text();
 assert.ok(bytes.startsWith("%PDF-1.4"));
 assert.ok(bytes.includes("SALES FUNNEL"));
 assert.ok(!bytes.includes("33.5"));
 assert.ok(!bytes.includes("-112"));
});
