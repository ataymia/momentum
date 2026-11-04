import assert from "node:assert/strict";
import test from "node:test";
import {createPayrollSeed,type PayrollState,type PayRun} from "../lib/payroll-engine";
import {
  addFilingCase,compareProviderTotals,decideFilingCase,prepareProviderPacket,
  providerExportRows,providerTotalsMatch,reconcileProviderPay,reviewProviderPacket,
  submitFilingCase,submitProviderPacket,totalsForRun,
} from "../lib/payroll-provider-lifecycle";

const clock={actorId:"admin-1",at:"2026-11-04T18:00:00.000Z",id:"audit-1"};
const run:PayRun={
 id:"pay-1",kind:"Regular",periodStart:"2026-10-19",periodEnd:"2026-11-01",payDate:"2026-11-06",
 createdAt:"2026-11-02T18:00:00.000Z",status:"Approved",approvedAt:"2026-11-03T18:00:00.000Z",approvedBy:"admin-1",
 lines:[{employeeId:"emp-1",regularHours:5,overtimeHours:0,regularPay:100,overtimePay:0,bonusPay:0,
 grossPay:100,benefitDeduction:0,preTaxBenefitDeduction:0,postTaxBenefitDeduction:0,taxableWages:100,
 federalTax:10,stateTax:3,localTax:0,additionalWithholding:0,postTaxDeduction:0,
 employeeTaxes:13,employerTaxes:7,netPay:87,sourceTimecardIds:["card-1"],sourceBonusIds:[]}],
};
const seed=():PayrollState=>({...createPayrollSeed(),runs:[{...run}]});
const next=(state:PayrollState,id:string)=>({...clock,id});
const prepared=()=>prepareProviderPacket(seed(),"pay-1","PayrollCo",clock).state;
const submitted=()=>submitProviderPacket(prepared(),"pay-1","export-123",next(prepared(),"audit-2")).state;
const accepted=()=>reviewProviderPacket(submitted(),"pay-1","provider-run-789",totalsForRun(run),next(submitted(),"audit-3")).state;

test("provider packet requires approval, preserves canonical pay lines and records audit",()=>{
 const draft={...seed(),runs:[{...run,status:"Draft" as const,approvedAt:undefined,approvedBy:undefined}]};
 assert.equal(prepareProviderPacket(draft,"pay-1","Vendor",clock).ok,false);
 const result=prepareProviderPacket(seed(),"pay-1"," PayrollCo ",clock);
 assert(result.ok);
 assert.equal(result.state.runs[0].lines[0].netPay,87);
 assert.equal(result.state.runs[0].providerHandoff?.status,"Prepared");
 assert.equal(result.state.runs[0].providerHandoff?.providerName,"PayrollCo");
 assert.equal(result.state.runs[0].workflowEvents?.length,1);
 assert.equal(prepareProviderPacket(result.state,"pay-1","Vendor",clock).ok,false);
});
test("submitted, accepted and disputed provider totals are distinct stages",()=>{
 const s=submitted();
 assert.equal(s.runs[0].providerHandoff?.status,"Submitted to provider");
 const expected=totalsForRun(run);
 assert(providerTotalsMatch(expected,expected));
 assert.deepEqual(compareProviderTotals(expected,{...expected,net:86}),{grossCents:0,netCents:-100,employeeTaxCents:0,employerTaxCents:0,employeeCount:0});
 assert.equal(reviewProviderPacket(s,"pay-1","ref",{...expected,net:86},next(s,"audit-3")).ok,false);
 const disputed=reviewProviderPacket(s,"pay-1","ref",{...expected,net:86},next(s,"audit-3"),"Provider tax change");
 assert(disputed.ok);
 assert.equal(disputed.state.runs[0].providerHandoff?.status,"Returned for correction");
 assert.equal(disputed.state.runs[0].lines[0].netPay,87,"source payrun must not be overwritten");
 assert.equal(reconcileProviderPay(disputed.state,"pay-1",next(s,"audit-4")).ok,false);
 const approved=reviewProviderPacket(s,"pay-1","ref",expected,next(s,"audit-3"));
 assert(approved.ok);
 assert.equal(approved.state.runs[0].providerHandoff?.status,"Accepted by provider");
});
test("pay reconciliation requires real settled employee evidence, independent of provider acceptance",()=>{
 const a=accepted();
 const release={...a,runs:a.runs.map(r=>({...r,status:"Released" as const,createdAt:r.createdAt,
   releasedAt:"2026-11-04T18:00:00.000Z",releasedBy:"admin-1"}))};
 assert.equal(reconcileProviderPay(release,"pay-1",next(release,"audit-4")).ok,false);
 const unsettled={...release,disbursements:[{id:"p1",payRunId:"pay-1",userId:"emp-1",amount:87,method:"ACH" as const,tokenLabel:"****1234",status:"Released" as const,createdAt:clock.at}]};
 assert.equal(reconcileProviderPay(unsettled,"pay-1",next(release,"audit-4")).ok,false);
 const settled={...unsettled,disbursements:unsettled.disbursements.map(d=>({...d,status:"Settled" as const,settledAt:"2026-11-04"}))};
 const result=reconcileProviderPay(settled,"pay-1",next(settled,"audit-4"));
 assert(result.ok);
 assert.equal(result.state.runs[0].providerHandoff?.status,"Pay reconciled");
 assert.equal(result.state.liabilities.length,0,"filing/tax state must not be inferred from wages");
});
test("tax filing cannot be labeled filed until external submission and acknowledgment",()=>{
 const a=accepted();
 const released={...a,runs:a.runs.map(r=>({...r,status:"Released" as const,releasedAt:clock.at,releasedBy:"admin-1"}))};
 const draft={id:"filing-1",formCode:"941",agency:"IRS",periodStart:"2026-10-01",periodEnd:"2026-12-31",dueDate:"2027-01-31"};
 const planned=addFilingCase(released,"pay-1",draft,next(released,"audit-5"));
 assert(planned.ok);
 assert.equal(planned.state.runs[0].filingCases?.[0].status,"Planned");
 assert.equal(addFilingCase(planned.state,"pay-1",{...draft,id:"duplicate"},next(released,"audit-6")).ok,false);
 assert.equal(decideFilingCase(planned.state,"pay-1",draft.id,"Filed","receipt","2026-11-04",next(released,"audit-7")).ok,false);
 const sent=submitFilingCase(planned.state,"pay-1",draft.id,"PayrollCo","provider-submit-1",next(released,"audit-6"));
 assert(sent.ok);
 assert.equal(sent.state.runs[0].filingCases?.[0].status,"Sent to provider");
 assert.equal(decideFilingCase(sent.state,"pay-1",draft.id,"Filed","","2026-11-04",next(released,"audit-7")).ok,false);
 const filed=decideFilingCase(sent.state,"pay-1",draft.id,"Filed","agency-ack","2026-11-04",next(released,"audit-7"));
 assert(filed.ok);
 assert.equal(filed.state.runs[0].filingCases?.[0].status,"Filed");
 assert.equal(filed.state.runs[0].filingCases?.[0].acknowledgmentReference,"agency-ack");
});
test("provider export contains amounts and source IDs but no bank routing information",()=>{
 const rows=providerExportRows(run);
 assert.equal(rows.length,1);
 assert.equal(rows[0].employeeId,"emp-1");
 assert.equal(rows[0].net,87);
 assert(!JSON.stringify(rows).includes("****1234"));
});
