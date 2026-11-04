import {isValidCalendarDateKey} from "./date-time";
import {type HCMState} from "./hcm-engine";
import {
  calculateFinalLine,calculateSupplementalLine,consumedTimecards,
  type PayRun,type PayrollState,type SpecialPayrollSource,
} from "./payroll-engine";
import type {WorkspaceData} from "./types";

/** Payrun draft source, not an authorization to transfer funds. */
export type SpecialPayDraftInput={
  kind:"Off-cycle"|"Final pay";employeeId:string;
  periodStart:string;periodEnd:string;payDate:string;
  amount:number;reason:string;evidenceReference:string;
  separationDate?:string;sourceTimecardIds?:string[];
};
export type SpecialDraftResult={ok:true;run:PayRun}|{ok:false;reason:string};

const validPeriod=(input:SpecialPayDraftInput)=>
  [input.periodStart,input.periodEnd,input.payDate].every(isValidCalendarDateKey)&&
  input.periodStart<=input.periodEnd;
const validCents=(value:number)=>Number.isFinite(value)&&value>=0&&Math.abs(value*100-Math.round(value*100))<0.00001;

/**
 * Off-cycle runs only include explicitly documented *taxable* extra earnings.
 * They do not include non-taxable reimbursement or negative recovery amounts.
 * Final payroll can include unconsumed approved timecards and a documented
 * taxable final adjustment; salary proration remains processor-reviewed.
 */
export function createSpecialPayDraft(
 state:PayrollState,data:WorkspaceData,hcm:HCMState,
 input:SpecialPayDraftInput,clock:{id:string;actorId:string;at:string}
):SpecialDraftResult{
 if(!clock.id?.trim()||!clock.actorId?.trim()||Number.isNaN(Date.parse(clock.at)))
   return{ok:false,reason:"Authenticated actor, draft identifier and timestamp required."};
 if(!validPeriod(input))return{ok:false,reason:"Payroll period and payday are invalid."};
 if(!data.users.some(u=>u.id===input.employeeId&&u.role!=="Customer"))
   return{ok:false,reason:"Employee identity is not found."};
 if(!input.reason.trim()||!input.evidenceReference.trim())
   return{ok:false,reason:"Documented earning reason and approved source reference are required."};
 if(!validCents(input.amount)||(input.kind==="Off-cycle"&&input.amount===0))
   return{ok:false,reason:"Enter a valid taxable supplemental amount in dollars and cents."};
 const employment=hcm.employees.find(e=>e.userId===input.employeeId);
 if(!employment)return{ok:false,reason:"A verified HR employment record is required."};
 if(input.kind==="Off-cycle"&&!["Active","Leave"].includes(employment.status))
   return{ok:false,reason:"Off-cycle earnings require an active or on-leave employee. Use Final pay for separation."};
 if(input.kind==="Final pay"&&
   (employment.status!=="Separated"||!isValidCalendarDateKey(input.separationDate??"")||
    employment.separationDate!==input.separationDate||input.separationDate!<input.periodStart||
    input.separationDate!>input.periodEnd))
   return{ok:false,reason:"Final pay must match HR's verified separation date within the payroll period."};
 const sourceTimecardIds=[...new Set(input.sourceTimecardIds??[])];
 if((input.sourceTimecardIds??[]).length!==sourceTimecardIds.length)
   return{ok:false,reason:"Duplicate timecard source."};
 if(input.kind==="Off-cycle"&&sourceTimecardIds.length)
   return{ok:false,reason:"Off-cycle taxable earnings do not consume ordinary timecards."};
 if(sourceTimecardIds.some(id=>consumedTimecards(state).has(id)))
   return{ok:false,reason:"An approved timecard has already been consumed by another active payroll run."};
 if(state.runs.some(r=>r.status!=="Voided"&&r.special?.employeeId===input.employeeId&&
   r.special.evidenceReference.trim().toLowerCase()===input.evidenceReference.trim().toLowerCase()))
   return{ok:false,reason:"This employee's evidence reference has already been used in an active payroll run."};
 const line=input.kind==="Off-cycle"?
   calculateSupplementalLine(state,hcm,input.employeeId,input.payDate,input.amount,2):
   calculateFinalLine(state,data,hcm,input.employeeId,input.periodStart,input.periodEnd,
     input.separationDate??"",input.payDate,sourceTimecardIds,input.amount,2);
 if(!line)return{ok:false,reason:"Calculation blocked. Verify employee payroll setup, withholding, approved timecards, compensation, or final-pay evidence."};
 const special:SpecialPayrollSource={
   id:"special-"+clock.id,employeeId:input.employeeId,amount:input.amount,
   reason:input.reason.trim(),evidenceReference:input.evidenceReference.trim(),
   enteredBy:clock.actorId,enteredAt:clock.at,
   ...(input.kind==="Final pay"?{separationDate:input.separationDate}:{}),
 };
 return{ok:true,run:{
  id:clock.id,kind:input.kind,createdAt:clock.at,periodStart:input.periodStart,
  periodEnd:input.periodEnd,payDate:input.payDate,calculationVersion:2,
  status:"Draft",special,lines:[line],
 }};
}
