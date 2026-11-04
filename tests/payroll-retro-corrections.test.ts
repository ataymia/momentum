import assert from "node:assert/strict";
import test from "node:test";
import {createHcmSeed} from "../lib/hcm-engine";
import {createPayrollSeed,normalizePayrollState,type PayrollState} from "../lib/payroll-engine";
import {createSpecialPayDraft} from "../lib/payroll-special-runs";
import {
  proposeRetroCorrection,reviewRetroCorrection,approveRetroCorrection,
  draftRetroSupplement,closeRecoveryReview,retroDelta,
} from "../lib/payroll-retro-corrections";
import {payrollRunControlIssues} from "../lib/payroll-controls";
import type {WorkspaceData} from "../lib/types";

const clock=(id:string,actorId="admin-1")=>({id,actorId,at:"2026-11-04T20:00:00.000Z"});
const fixture=()=>{
 const d={users:[{id:"worker-1",role:"Sales Representative",name:"Worker",title:"Representative",team:"Sales"}],
  timecards:[],timeEntries:[],accounts:[],orders:[],inventory:[]} as unknown as WorkspaceData;
 const h=createHcmSeed(d),p=createPayrollSeed();
 h.compensation=[{id:"rate-1",userId:"worker-1",basis:"Hourly",rate:20,effectiveDate:"2026-10-01",status:"Active",
  reason:"Verified wage rate",approvedBy:"admin-1",createdAt:"2026-10-01T12:00:00.000Z"}];
 p.payGroups=[{id:"weekly",name:"Weekly",frequency:"Weekly",overtimeThresholdHours:40,active:true}];
 p.employees=[{userId:"worker-1",payGroupId:"weekly",paymentMethod:"ACH",paymentTokenLabel:"****1234",active:true}];
 p.withholdingProfiles=[{userId:"worker-1",federalPercent:10,statePercent:5,localPercent:0,
  additionalWithholding:0,postTaxDeduction:0,effectiveDate:"2026-10-01"}];
 p.employerTaxRules=[{id:"tax-rule",name:"Synthetic tax",percent:7,effectiveDate:"2026-10-01",active:true}];
 const draft=createSpecialPayDraft(p,d,h,{kind:"Off-cycle",employeeId:"worker-1",
  periodStart:"2026-10-26",periodEnd:"2026-10-26",payDate:"2026-10-30",
  amount:100,reason:"Verified supplemental earnings",evidenceReference:"original-source"},clock("original-run"));
 assert(draft.ok);
 if(!draft.ok)throw Error("Test fixture failed");
 const run={...draft.run,status:"Released" as const,approvedAt:"2026-10-29T12:00:00.000Z",
  approvedBy:"admin-1",releasedAt:"2026-10-30T12:00:00.000Z",releasedBy:"admin-1"};
 p.runs=[run];
 p.disbursements=[{id:"payment-1",payRunId:run.id,userId:"worker-1",amount:run.lines[0].netPay,
  method:"ACH",tokenLabel:"****1234",status:"Settled",createdAt:"2026-10-30T12:00:00.000Z",
  settledAt:"2026-10-30"}];
 return{d,h,p};
};
const input=(gross:number)=>({sourceRunId:"original-run",employeeId:"worker-1",
  correctedGross:gross,reason:"Corrected earnings confirmed with payroll records",
  evidenceReference:"review-case-123"});
const advance=(p:PayrollState,gross:number)=>{
 const created=proposeRetroCorrection(p,input(gross),clock("retro-case-1"));assert(created.ok);
 if(!created.ok)throw Error("case draft");
 const review=reviewRetroCorrection(created.state,created.case.id,clock("review-1"));assert(review.ok);
 if(!review.ok)throw Error("case review");
 const approved=approveRetroCorrection(review.state,review.case.id,clock("approve-1"));assert(approved.ok);
 if(!approved.ok)throw Error("case approval");
 return{created,review,approved};
};
test("positive retroactive gross variance creates exactly one linked processor draft without altering settled history",()=>{
 const {d,h,p}=fixture();
 const original=JSON.stringify(p.runs[0]);
 const a=advance(p,150);
 assert.equal(a.created.case.originalGross,100);
 assert.equal(a.created.case.deltaGross,50);
 assert.equal(a.approved.case.status,"Approved");
 const result=draftRetroSupplement(a.approved.state,d,h,"retro-case-1","2026-11-06",clock("retro-run-1"));
 assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.runId,"retro-run-1");
 assert.equal(result.case.status,"Supplemental drafted");
 assert.equal(result.state.runs[0].status,"Draft");
 assert.equal(result.state.runs[0].special?.amount,50);
 assert.equal(result.state.runs[0].special?.retroCaseId,"retro-case-1");
 assert.equal(result.state.runs[0].special?.originalRunId,"original-run");
 assert.equal(result.state.runs[0].lines[0].grossPay,50);
 assert.equal(result.state.runs[0].lines[0].netPay,42.5);
 assert.equal(result.state.runs[0].lines[0].sourceTimecardIds.length,0);
 assert.equal(JSON.stringify(result.state.runs[1]),original);
 assert.deepEqual(payrollRunControlIssues(result.state,d,h,result.state.runs[0]),[]);
 assert.equal(draftRetroSupplement(result.state,d,h,"retro-case-1","2026-11-06",clock("retro-run-2")).ok,false);
 const normalized=normalizePayrollState(result.state);
 assert.equal(normalized.runs.length,2);
 assert.equal(normalized.runs[0].special?.retroCaseId,"retro-case-1");
 assert.equal(normalized.retroCases[0].supplementalRunId,"retro-run-1");
});
test("negative corrections never create an automatic employee deduction or negative payroll run",()=>{
 const {d,h,p}=fixture();
 const a=advance(p,75);
 assert.equal(a.approved.case.deltaGross,-25);
 assert.equal(a.approved.case.status,"Recovery review");
 assert.equal(a.approved.state.runs.length,1);
 assert.equal(draftRetroSupplement(a.approved.state,d,h,"retro-case-1","2026-11-06",clock("run-2")).ok,false);
 assert.equal(closeRecoveryReview(a.approved.state,"retro-case-1","",clock("close-1")).ok,false);
 const closed=closeRecoveryReview(a.approved.state,"retro-case-1","processor-resolution-verified",clock("close-1"));
 assert(closed.ok);
 if(!closed.ok)return;
 assert.equal(closed.case.status,"Closed");
 assert.equal(closed.case.resolutionReference,"processor-resolution-verified");
 assert.equal(closed.state.runs.length,1);
 assert.equal(normalizePayrollState(closed.state).retroCases[0].status,"Closed");
});
test("no difference closes with documented zero variance and no new wage payment",()=>{
 const {p}=fixture();const a=advance(p,100);
 assert.equal(a.approved.case.status,"Closed");
 assert.equal(a.approved.case.deltaGross,0);
 assert.equal(a.approved.state.runs.length,1);
});
test("unsettled or failed original disbursement blocks retroactive correction",()=>{
 const {p}=fixture();
 p.disbursements[0].status="Released";
 assert.equal(proposeRetroCorrection(p,input(150),clock("new-case")).ok,false);
 p.disbursements[0].status="Failed";
 assert.equal(proposeRetroCorrection(p,input(150),clock("new-case")).ok,false);
 p.disbursements[0].status="Settled";
 p.runs[0].status="Voided";
 assert.equal(proposeRetroCorrection(p,input(150),clock("new-case")).ok,false);
});
test("duplicate IDs and evidence, malformed cents, and changed original source are blocked",()=>{
 const {p}=fixture();
 assert.equal(retroDelta(100,100.25),0.25);
 assert.equal(retroDelta(100,100.001),null);
 assert.equal(proposeRetroCorrection(p,input(130.009),clock("case-1")).ok,false);
 const first=proposeRetroCorrection(p,input(130),clock("case-1"));assert(first.ok);
 if(!first.ok)return;
 assert.equal(proposeRetroCorrection(first.state,input(140),clock("case-1")).ok,false);
 assert.equal(proposeRetroCorrection(first.state,input(140),clock("case-2")).ok,false);
 assert.equal(proposeRetroCorrection(first.state,{...input(140),evidenceReference:"entirely-new-evidence"},clock("case-3")).ok,false);
 first.state.runs[0].lines[0].grossPay=120;
 assert.equal(reviewRetroCorrection(first.state,"case-1",clock("review-2")).ok,false);
});
test("correction evidence requires valid effective payroll configuration before supplemental calculation",()=>{
 const {d,h,p}=fixture();const a=advance(p,180);
 a.approved.state.withholdingProfiles=[];
 assert.equal(draftRetroSupplement(a.approved.state,d,h,"retro-case-1","2026-11-06",clock("run-2")).ok,false);
});
