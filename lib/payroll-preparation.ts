import {calculateRegularLine,consumedTimecards,regularPayrollSource,timeEntryHours,payrollTaxRoute,type PayrollState} from "./payroll-engine";
import {isValidCalendarDateKey} from "./date-time";
import type {HCMState} from "./hcm-engine";
import type {WorkspaceData} from "./types";

export function preparePayrollSources(payroll:PayrollState,data:WorkspaceData,hcm:HCMState,start:string,end:string,payDate:string){
 if(![start,end,payDate].every(isValidCalendarDateKey)||end<start||payDate<end)throw new Error("Select a valid period and payday on or after the period end.");
 const consumed=consumedTimecards(payroll);
 const cards=data.timecards.filter(c=>["Manager approved","Payroll ready"].includes(c.status)&&c.weekStart>=start&&c.weekEnd<=end&&!consumed.has(c.id));
 return [...new Set(cards.map(c=>c.userId))].sort().map(employeeId=>{
  const ids=cards.filter(c=>c.userId===employeeId).map(c=>c.id);
  const taxRoute=payrollTaxRoute(hcm,employeeId);
  const source=regularPayrollSource(data,employeeId,start,end,ids);
  const line=taxRoute==="W-2 candidate"&&source?calculateRegularLine(payroll,data,hcm,employeeId,start,end,ids):null;
  return {employeeId,employee:data.users.find(u=>u.id===employeeId)?.name??employeeId,periodStart:start,periodEnd:end,payDate,taxRoute,
   approvedTimecards:ids.join("; "),hours:source?source.entries.reduce((n,e)=>n+timeEntryHours(e),0):null,
   preliminaryGross:line?.grossPay??null,status:!source?"Source validation required":taxRoute!=="W-2 candidate"?taxRoute:line?"Calculation available; external payroll review required":"Payroll setup or calculation blocked"};
 });
}
