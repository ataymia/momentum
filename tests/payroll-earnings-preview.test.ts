import assert from "node:assert/strict";
import test from "node:test";
import { employeeEarningsSnapshot } from "../lib/payroll-earnings-preview";
import { readFileSync } from "node:fs";
import { createPayrollSeed, hourlyWagesForApprovedTimecards, regularPayrollSource } from "../lib/payroll-engine";
import type { WorkspaceData } from "../lib/types";
import type { HCMState } from "../lib/hcm-engine";

const asBase=(status:"Manager approved"|"Submitted"="Manager approved")=>{
 const data={users:[{id:"rep-1",role:"Sales Representative"}],accounts:[],orders:[],inventory:[],
   timecards:[{id:"tc-1",userId:"rep-1",weekStart:"2026-09-28",weekEnd:"2026-10-04",status}],
   timeEntries:[{id:"entry-1",userId:"rep-1",date:"2026-09-29",clockIn:"08:00",clockOut:"18:00",breakMinutes:0,source:"Manual correction"}]} as unknown as WorkspaceData;
 const hcm={compensation:[{id:"rate-1",userId:"rep-1",basis:"Hourly",rate:20,effectiveDate:"2026-09-01",status:"Active"}]} as HCMState;
 const payroll=createPayrollSeed();
 payroll.payGroups.push({id:"weekly",name:"Weekly",frequency:"Weekly",overtimeThresholdHours:40,active:true});
 payroll.employees.push({userId:"rep-1",payGroupId:"weekly",paymentMethod:"Manual",paymentTokenLabel:"",active:true});
 return {data,hcm,payroll};
};
test("hourly earnings calculated from approved timecards without a finalized pay run",()=>{
 const {data,hcm,payroll}=asBase();
 const summary=employeeEarningsSnapshot(data,hcm,payroll,"rep-1");
 assert.equal(summary.regularHours,10);
 assert.equal(summary.overtimeHours,0);
 assert.equal(summary.estimatedGross,200);
 assert.equal(summary.pendingApprovalHours,0);
 assert.ok(summary.blockers.some((message)=>message.includes("qualifying-sales reconciliation")));
});
test("unapproved time must not enter the wage estimate",()=>{
 const {data,hcm,payroll}=asBase("Submitted");
 const summary=employeeEarningsSnapshot(data,hcm,payroll,"rep-1");
 assert.equal(summary.estimatedGross,null);
 assert.equal(summary.pendingApprovalHours,10);
});
test("configured weekly overtime is counted separately",()=>{
 const {data,hcm,payroll}=asBase();
 data.timeEntries[0].clockOut="23:00";
 data.timeEntries.push(...["2026-09-30","2026-10-01","2026-10-02"].map((date,n)=>({...data.timeEntries[0],id:`extra-${n}`,date,clockIn:"08:00",clockOut:"18:00"})));
 const summary=employeeEarningsSnapshot(data,hcm,payroll,"rep-1");
 assert.equal(summary.regularHours,40);
 assert.equal(summary.overtimeHours,5);
 assert.equal(summary.estimatedGross,950);
});
test("midweek wage change cannot be silently priced at one rate",()=>{
 const {data,hcm,payroll}=asBase();
 hcm.compensation.push({id:"new",userId:"rep-1",basis:"Hourly",rate:25,effectiveDate:"2026-10-02",status:"Active"} as HCMState["compensation"][number]);
 const summary=employeeEarningsSnapshot(data,hcm,payroll,"rep-1");
 assert.equal(summary.estimatedGross,null);
 assert.ok(summary.blockers.some((message)=>message.includes("changed during a week")));
});

test("different effective hourly rates are applied separately to different approved weeks",()=>{
 const {data,hcm}=asBase();
 hcm.compensation[0].endDate="2026-10-04";
 hcm.compensation.push({id:"rate-2",userId:"rep-1",basis:"Hourly",rate:30,effectiveDate:"2026-10-05",status:"Active"} as HCMState["compensation"][number]);
 data.timecards.push({id:"tc-2",userId:"rep-1",weekStart:"2026-10-05",weekEnd:"2026-10-11",status:"Payroll ready",attested:true});
 data.timeEntries.push({id:"entry-2",userId:"rep-1",date:"2026-10-06",clockIn:"08:00",clockOut:"18:00",breakMinutes:0,source:"Manual correction"});
 const source=regularPayrollSource(data,"rep-1","2026-09-28","2026-10-11",["tc-1","tc-2"]);
 assert.ok(source);
 const totals=hourlyWagesForApprovedTimecards(data,hcm,"rep-1",source!,40);
 assert.equal(totals?.regularPay,500);
 assert.equal(totals?.overtimePay,0);
});
test("hourly payroll refuses one blended rate for a midweek pay change",()=>{
 const {data,hcm}=asBase();
 hcm.compensation[0].endDate="2026-10-01";
 hcm.compensation.push({id:"new",userId:"rep-1",basis:"Hourly",rate:25,effectiveDate:"2026-10-02",status:"Active"} as HCMState["compensation"][number]);
 const source=regularPayrollSource(data,"rep-1","2026-09-28","2026-10-04",["tc-1"]);
 assert.ok(source);
 assert.equal(hourlyWagesForApprovedTimecards(data,hcm,"rep-1",source!,40),null);
});

test("earnings UI identifies orders and account bonuses without implying paid commissions",()=>{
  const ui=readFileSync("components/pages/payroll-v2.tsx","utf8");
  assert.ok(ui.includes("Account bonus milestones"));
  assert.ok(ui.includes("Sales awaiting commission review"));
  assert.ok(ui.includes("Percentage commission not calculated"));
  assert.ok(ui.includes("My sales bonuses"));
});
