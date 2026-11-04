import assert from "node:assert/strict";
import test from "node:test";
import {createHcmSeed,type HCMState} from "../lib/hcm-engine";
import {createPayrollSeed,normalizePayrollState,type PayrollState} from "../lib/payroll-engine";
import {createSpecialPayDraft,type SpecialPayDraftInput} from "../lib/payroll-special-runs";
import {payrollRunControlIssues,payrollCorrectionBlockers} from "../lib/payroll-controls";
import type {WorkspaceData} from "../lib/types";

const data=()=>({
  users:[{id:"employee-1",role:"Sales Representative",name:"Employee Example",title:"Representative",team:"Sales"}],
  timecards:[{id:"tc-1",userId:"employee-1",weekStart:"2026-10-26",weekEnd:"2026-11-01",status:"Manager approved",attested:true}],
  timeEntries:[{id:"time-1",userId:"employee-1",date:"2026-10-29",clockIn:"08:00",clockOut:"18:00",breakMinutes:0,source:"Manual correction"}],
  accounts:[],orders:[],inventory:[],
}) as unknown as WorkspaceData;
const prepared=()=>{
 const d=data(),h=createHcmSeed(d),p=createPayrollSeed();
 h.compensation=[{id:"rate-1",userId:"employee-1",basis:"Hourly",rate:20,effectiveDate:"2026-10-01",status:"Active"}];
 p.payGroups=[{id:"weekly",name:"Weekly",frequency:"Weekly",overtimeThresholdHours:40,active:true}];
 p.employees=[{userId:"employee-1",payGroupId:"weekly",paymentMethod:"ACH",paymentTokenLabel:"****1234",active:true}];
 p.withholdingProfiles=[{userId:"employee-1",federalPercent:10,statePercent:5,localPercent:0,
   additionalWithholding:4,postTaxDeduction:6,effectiveDate:"2026-10-01"}];
 p.employerTaxRules=[{id:"test",name:"Synthetic employer rate",percent:7,effectiveDate:"2026-10-01",active:true}];
 return {d,h,p};
};
const clock=(id:string)=>({id,actorId:"admin-1",at:"2026-11-04T20:00:00.000Z"});
const offcycle:SpecialPayDraftInput={
 kind:"Off-cycle",employeeId:"employee-1",periodStart:"2026-10-26",
 periodEnd:"2026-11-01",payDate:"2026-11-06",
 amount:100,reason:"Previously approved bonus correction",evidenceReference:"approved-source-001",
};
const final=(amount=50):SpecialPayDraftInput=>({
 ...offcycle,kind:"Final pay",amount,separationDate:"2026-10-30",
 reason:"Final taxable adjustment documented by HR",evidenceReference:"approved-final-002",
 sourceTimecardIds:["tc-1"],
});

test("off-cycle draft computes taxable wages without repeating regular-period fixed deductions",()=>{
 const {d,h,p}=prepared();
 const result=createSpecialPayDraft(p,d,h,offcycle,clock("special-1"));
 assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.run.kind,"Off-cycle");
 assert.equal(result.run.status,"Draft");
 assert.equal(result.run.lines[0].grossPay,100);
 assert.equal(result.run.lines[0].federalTax,10);
 assert.equal(result.run.lines[0].stateTax,5);
 assert.equal(result.run.lines[0].additionalWithholding,0);
 assert.equal(result.run.lines[0].postTaxDeduction,0);
 assert.equal(result.run.lines[0].netPay,85);
 assert.equal(result.run.lines[0].sourceTimecardIds.length,0);
 assert.equal(result.run.calculationVersion,2);
 assert.deepEqual(payrollRunControlIssues({...p,runs:[result.run]},d,h,result.run),[]);
 const normalized=normalizePayrollState({...p,runs:[result.run]});
 assert.equal(normalized.runs.length,1);
 assert.equal(normalized.runs[0].special?.evidenceReference,"approved-source-001");
});
test("off-cycle draft rejects missing evidence, malformed money and duplicated source reference",()=>{
 const {d,h,p}=prepared();
 assert.equal(createSpecialPayDraft(p,d,h,{...offcycle,evidenceReference:""},clock("a")).ok,false);
 assert.equal(createSpecialPayDraft(p,d,h,{...offcycle,amount:12.345},clock("b")).ok,false);
 const first=createSpecialPayDraft(p,d,h,offcycle,clock("c"));assert(first.ok);
 if(!first.ok)return;
 assert.equal(createSpecialPayDraft({...p,runs:[first.run]},d,h,offcycle,clock("d")).ok,false);
 assert.equal(createSpecialPayDraft({...p,runs:[first.run]},d,h,{...offcycle,evidenceReference:"different"},clock("c")).ok,false);
});
test("final pay must match confirmed HR separation; computes approved hourly wages and extra earnings",()=>{
 const {d,h,p}=prepared();
 assert.equal(createSpecialPayDraft(p,d,h,final(),clock("final-1")).ok,false);
 h.employees[0].status="Separated";
 h.employees[0].separationDate="2026-10-30";
 p.employees[0].active=false; // separation must not silently suppress final owed wages
 const result=createSpecialPayDraft(p,d,h,final(),clock("final-2"));
 assert(result.ok);
 if(!result.ok)return;
 assert.equal(result.run.lines[0].regularPay,200);
 assert.equal(result.run.lines[0].bonusPay,50);
 assert.equal(result.run.lines[0].grossPay,250);
 assert.equal(result.run.lines[0].sourceTimecardIds[0],"tc-1");
 assert.equal(result.run.special?.separationDate,"2026-10-30");
 assert.deepEqual(payrollRunControlIssues({...p,runs:[result.run]},d,h,result.run),[]);
 const second=createSpecialPayDraft({...p,runs:[result.run]},d,h,{...final(),evidenceReference:"other"},clock("final-3"));
 assert.equal(second.ok,false,"same approved timecard cannot fund a second final payroll");
});
test("final salary payroll must not silently issue an unprorated period salary",()=>{
 const {d,h,p}=prepared();
 h.employees[0].status="Separated";h.employees[0].separationDate="2026-10-30";
 h.compensation[0].basis="Salary per pay period";
 assert.equal(createSpecialPayDraft(p,d,h,final(),clock("salary-1")).ok,false);
 const evidenceOnly=createSpecialPayDraft(p,d,h,{...final(250),sourceTimecardIds:[]},clock("salary-2"));
 assert(evidenceOnly.ok,"manual reviewed taxable final earnings may be drafted but not automatically prorated");
});
test("provider and filed-return evidence blocks unsafe payroll void/reissue",()=>{
 const {d,h,p}=prepared();
 const first=createSpecialPayDraft(p,d,h,offcycle,clock("special-5"));assert(first.ok);
 if(!first.ok)return;
 const {run}=first;
 const withProvider={...run,status:"Released" as const,
   providerHandoff:{providerName:"Payroll Vendor",status:"Submitted to provider" as const,
     preparedAt:clock("a").at,preparedBy:"admin-1",expected:{gross:100,net:85,employeeTaxes:15,employerTaxes:7,employeeCount:1}},
 };
 assert(payrollCorrectionBlockers({...p,runs:[withProvider]},withProvider).some(x=>x.includes("Provider")));
});
