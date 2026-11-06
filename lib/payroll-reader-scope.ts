import type {WorkspaceUser} from "./types";
import {createPayrollSeed,type PayrollState} from "./payroll-engine";
/** Publish only the signed-in employee's pay records. Firebase rules must independently enforce privacy. */
export function payrollForViewer(state:PayrollState,user:WorkspaceUser|null|undefined):PayrollState{
 if(!user||user.role==="Customer")return createPayrollSeed();
 if(user.role==="Administrator")return state;
 const employees=state.employees.filter(e=>e.userId===user.id);
 const payGroupIds=new Set(employees.map(e=>e.payGroupId));
 const runs=state.runs.map(run=>({...run,lines:run.lines.filter(line=>line.employeeId===user.id)})).filter(run=>run.lines.length>0);
 const runIds=new Set(runs.map(run=>run.id));
 return {...state,
   payGroups:state.payGroups.filter(group=>payGroupIds.has(group.id)),
   employees,withholdingProfiles:state.withholdingProfiles.filter(p=>p.userId===user.id),
   employerTaxRules:[],benefitTaxRules:[],runs,liabilities:[],
   disbursements:state.disbursements.filter(d=>d.userId===user.id&&runIds.has(d.payRunId))
 };
}
