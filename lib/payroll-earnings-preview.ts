import { evaluateSalesRepAccountBonuses } from "./bonus-engine";
import type { HCMState, CompensationRecord } from "./hcm-engine";
import { consumedBonuses, consumedTimecards, payrollHourBreakdown, regularPayrollSource, timeEntryHours, type PayrollState } from "./payroll-engine";
import { salesCommissionPolicyProblem } from "./sales-commission-policy";
import type { WorkspaceData } from "./types";

/** Figures for review, not a payroll run, pay stub, or an authorization to pay. */
export type EarningsSnapshot={
  regularHours:number;
  overtimeHours:number;
  estimatedGross:number|null;
  pendingApprovalHours:number;
  approvedTimecards:number;
  flaggedBonusAmount:number;
  flaggedBonusCount:number;
  blockers:string[];
};

function rateOnDate(hcm:HCMState,userId:string,date:string):CompensationRecord|undefined{
  return hcm.compensation
    .filter((record)=>record.userId===userId&&record.effectiveDate<=date&&(!record.endDate||record.endDate>=date))
    .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];
}
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

export function employeeEarningsSnapshot(data:WorkspaceData,hcm:HCMState,payroll:PayrollState,userId:string):EarningsSnapshot {
  const usedCards=consumedTimecards(payroll);
  const ready=data.timecards.filter((card)=>card.userId===userId&&["Manager approved","Payroll ready"].includes(card.status)&&!usedCards.has(card.id));
  const employee=payroll.employees.find((item)=>item.userId===userId&&item.active);
  const group=employee?payroll.payGroups.find((item)=>item.id===employee.payGroupId&&item.active):undefined;
  const issues=new Set<string>();
  let regularHours=0,overtimeHours=0,estimatedGross=0;
  if(!group)issues.add("Pay group not configured.");
  for(const card of ready){
    if(!group)continue;
    const source=regularPayrollSource(data,userId,card.weekStart,card.weekEnd,[card.id]);
    const hours=source?payrollHourBreakdown(data,userId,source,group.overtimeThresholdHours):null;
    if(!hours){issues.add("Approved timecard needs review.");continue;}
    const startRate=rateOnDate(hcm,userId,card.weekStart);
    const endRate=rateOnDate(hcm,userId,card.weekEnd);
    if(!startRate||!endRate){issues.add("Pay rate missing for an approved week.");continue;}
    if(startRate.id!==endRate.id||startRate.basis!==endRate.basis){
      issues.add("Pay rate changed during a week. Payroll must split the effective rates.");continue;
    }
    if(startRate.basis!=="Hourly"){
      issues.add("Salary pay is calculated in a payroll run, not as weekly hourly wages.");continue;
    }
    if(!Number.isFinite(startRate.rate)||startRate.rate<=0){
      issues.add("An hourly rate is invalid.");continue;
    }
    regularHours+=hours.regularHours;
    overtimeHours+=hours.overtimeHours;
    estimatedGross+=hours.regularHours*startRate.rate+hours.overtimeHours*startRate.rate*1.5;
  }
  const covered=data.timecards.filter((card)=>card.userId===userId&&["Manager approved","Payroll ready"].includes(card.status));
  const unapproved=data.timeEntries.filter((entry)=>entry.userId===userId&&entry.clockOut&&!covered.some((card)=>entry.date>=card.weekStart&&entry.date<=card.weekEnd));
  const pendingApprovalHours=unapproved.reduce((sum,entry)=>sum+timeEntryHours(entry),0);
  const usedBonuses=consumedBonuses(payroll);
  const milestones=evaluateSalesRepAccountBonuses(data).filter((item)=>item.repId===userId&&item.status==="Earned"&&!usedBonuses.has(item.id));
  // Launch-to-date eligibility is approved, but the collected-sales commission
  // ledger and consumption safeguards have not been integrated with payroll.
  const employeeRole=data.users.find((user)=>user.id===userId)?.role;
  if(employeeRole==="Sales Representative"){
    const policyIssue=salesCommissionPolicyProblem();
    issues.add(policyIssue??"Percentage commissions await qualifying-sales reconciliation and verified payroll integration; launch-to-date sales remain eligible.");
  }
  return {
    regularHours:money(regularHours),overtimeHours:money(overtimeHours),
    estimatedGross:ready.length===0||issues.has("Pay group not configured.")||regularHours+overtimeHours===0?null:money(estimatedGross),
    pendingApprovalHours:money(pendingApprovalHours),
    approvedTimecards:ready.length,
    flaggedBonusCount:milestones.length,
    flaggedBonusAmount:money(milestones.reduce((sum,item)=>sum+item.amount,0)),
    blockers:[...issues],
  };
}
