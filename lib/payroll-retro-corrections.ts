import {isValidCalendarDateKey} from "./date-time";
import {type HCMState} from "./hcm-engine";
import {type PayRun,type PayrollState} from "./payroll-engine";
import {createSpecialPayDraft} from "./payroll-special-runs";
import type {WorkspaceData} from "./types";

/**
 * Auditable review of a wage discrepancy AFTER the original disbursement is
 * actually settled. No original timecard, pay line, tax liability, or settled
 * disbursement is rewritten. This is a correction case, not an authorization to
 * recover money or create a real provider payment.
 */
export type RetroCaseStatus=
  "Draft"|"Reviewed"|"Approved"|"Supplemental drafted"|"Recovery review"|"Closed";
export type RetroCorrectionCase={
 id:string;sourceRunId:string;employeeId:string;
 originalGross:number;correctedGross:number;deltaGross:number;
 reason:string;evidenceReference:string;
 status:RetroCaseStatus;createdAt:string;createdBy:string;
 reviewedAt?:string;reviewedBy?:string;approvedAt?:string;approvedBy?:string;
 supplementalRunId?:string;resolutionReference?:string;resolvedAt?:string;resolvedBy?:string;
};
export type RetroInput={sourceRunId:string;employeeId:string;correctedGross:number;reason:string;evidenceReference:string};
export type RetroClock={id:string;actorId:string;at:string};
export type RetroResult={ok:true;state:PayrollState;case:RetroCorrectionCase;runId?:string}|{ok:false;error:string};

const fail=(error:string):RetroResult=>({ok:false,error});
const money=(v:number)=>Math.round(v*100)/100;
const cents=(v:number)=>Number.isFinite(v)&&v>=0&&v<=1_000_000&&Math.abs(v*100-Math.round(v*100))<0.00001;
const atValid=(x:string)=>Boolean(x&&!Number.isNaN(Date.parse(x)));
const clockValid=(c:RetroClock)=>Boolean(c.id.trim()&&c.actorId.trim()&&atValid(c.at));
const reference=(s:string)=>s.trim().toLowerCase();
const findLine=(state:PayrollState,runId:string,employeeId:string)=>{
 const run=state.runs.find(r=>r.id===runId&&r.status==="Released");
 if(!run||run.special?.retroCaseId)return null;
 const matches=run.lines.filter(l=>l.employeeId===employeeId);
 if(matches.length!==1)return null;
 const line=matches[0];
 const settled=state.disbursements.filter(d=>d.payRunId===run.id&&d.userId===employeeId&&d.status==="Settled");
 if(settled.length!==1||Math.abs(settled[0].amount-line.netPay)>=0.005)return null;
 return{run,line};
};
export function retroDelta(originalGross:number,correctedGross:number):number|null{
 if(!cents(originalGross)||!cents(correctedGross))return null;
 return money(correctedGross-originalGross);
}
export function retroCasesValid(input:unknown):input is RetroCorrectionCase[]{
 if(!Array.isArray(input))return false;
 const seen=new Set<string>();
 return input.every(c=>{
  if(!c||typeof c!=="object"||Array.isArray(c))return false;
  const row=c as RetroCorrectionCase;
  if(!row.id||seen.has(row.id)||!row.sourceRunId||!row.employeeId||
    !row.reason?.trim()||!row.evidenceReference?.trim()||
    !cents(row.originalGross)||!cents(row.correctedGross)||
    !Number.isFinite(row.deltaGross)||Math.abs(row.deltaGross-(row.correctedGross-row.originalGross))>0.005||
    !["Draft","Reviewed","Approved","Supplemental drafted","Recovery review","Closed"].includes(row.status)||
    !atValid(row.createdAt)||!row.createdBy)return false;
  if(row.reviewedAt&&!atValid(row.reviewedAt)||row.approvedAt&&!atValid(row.approvedAt)||
    row.resolvedAt&&!atValid(row.resolvedAt))return false;
  if(["Reviewed","Approved","Supplemental drafted","Recovery review","Closed"].includes(row.status)&&
    (!row.reviewedAt||!row.reviewedBy))return false;
  if(["Approved","Supplemental drafted","Recovery review","Closed"].includes(row.status)&&
    (!row.approvedAt||!row.approvedBy))return false;
  if(row.status==="Supplemental drafted"&&(row.deltaGross<=0||!row.supplementalRunId))return false;
  seen.add(row.id);
  return true;
 });
}
export function proposeRetroCorrection(state:PayrollState,input:RetroInput,clock:RetroClock):RetroResult{
 if(!clockValid(clock))return fail("Authenticated author, case identifier and timestamp are required.");
 if(!cents(input.correctedGross))return fail("The corrected gross must be a valid USD amount to the cent.");
 if(input.reason.trim().length<8||input.evidenceReference.trim().length<5)
   return fail("A specific reason and a verified source reference are required.");
 if(state.retroCases.some(c=>c.id===clock.id))return fail("Duplicate correction case ID.");
 const source=findLine(state,input.sourceRunId,input.employeeId);
 if(!source)return fail("Choose an employee with one confirmed settled payment in a released payroll run.");
 const originalGross=source.line.grossPay;
 const delta=retroDelta(originalGross,input.correctedGross);
 if(delta===null)return fail("Original payroll amount is not valid.");
 if(state.retroCases.some(c=>c.sourceRunId===input.sourceRunId&&c.employeeId===input.employeeId&&c.status!=="Closed"))
   return fail("An unresolved correction already exists for this employee and original paycheck. Reconcile that case before starting another.");
 const item:RetroCorrectionCase={
   id:clock.id,sourceRunId:input.sourceRunId,employeeId:input.employeeId,
   originalGross,correctedGross:money(input.correctedGross),deltaGross:delta,
   reason:input.reason.trim(),evidenceReference:input.evidenceReference.trim(),
   status:"Draft",createdAt:clock.at,createdBy:clock.actorId,
 };
 return{ok:true,state:{...state,retroCases:[item,...state.retroCases]},case:item};
}
const changedSource=(state:PayrollState,c:RetroCorrectionCase)=>{
 const match=findLine(state,c.sourceRunId,c.employeeId);
 return !match||Math.abs(match.line.grossPay-c.originalGross)>0.005;
};
export function reviewRetroCorrection(state:PayrollState,id:string,clock:RetroClock):RetroResult{
 if(!clockValid(clock))return fail("Authenticated reviewer is required.");
 const c=state.retroCases.find(x=>x.id===id);
 if(!c||c.status!=="Draft")return fail("Only a draft correction can be reviewed.");
 if(changedSource(state,c))return fail("Original settlement has changed. Reconcile the payroll source before reviewing.");
 const next:RetroCorrectionCase={...c,status:"Reviewed",reviewedAt:clock.at,reviewedBy:clock.actorId};
 return{ok:true,state:{...state,retroCases:state.retroCases.map(x=>x.id===id?next:x)},case:next};
}
export function approveRetroCorrection(state:PayrollState,id:string,clock:RetroClock):RetroResult{
 if(!clockValid(clock))return fail("Authenticated approver is required.");
 const c=state.retroCases.find(x=>x.id===id);
 if(!c||c.status!=="Reviewed")return fail("Review the correction before approving it.");
 if(changedSource(state,c))return fail("Original settlement has changed. Reconcile the payroll source first.");
 const next:RetroCorrectionCase={...c,approvedAt:clock.at,approvedBy:clock.actorId,
   status:c.deltaGross<0?"Recovery review":c.deltaGross>0?"Approved":"Closed",
   ...(c.deltaGross===0?{resolvedAt:clock.at,resolvedBy:clock.actorId,
     resolutionReference:"Verified: no wage difference"}:{})};
 return{ok:true,state:{...state,retroCases:state.retroCases.map(x=>x.id===id?next:x)},case:next};
}
/** Positive wage difference only. The current payroll date is the supplemental period, not the closed source period. */
export function draftRetroSupplement(state:PayrollState,data:WorkspaceData,hcm:HCMState,id:string,
 payDate:string,clock:RetroClock):RetroResult{
 if(!clockValid(clock)||!isValidCalendarDateKey(payDate))return fail("A verified new payday and author are required.");
 if(state.runs.some(r=>r.id===clock.id))return fail("Duplicate payroll run identifier.");
 const c=state.retroCases.find(x=>x.id===id);
 if(!c||c.status!=="Approved"||c.deltaGross<=0||c.supplementalRunId)
   return fail("Only one approved positive correction can produce a supplemental run.");
 if(changedSource(state,c))return fail("The original settled payroll source changed. Re-review the correction.");
 if(state.runs.some(r=>r.status!=="Voided"&&r.special?.retroCaseId===id))
   return fail("This correction has already funded a payroll run.");
 const created=createSpecialPayDraft(state,data,hcm,{
   kind:"Off-cycle",employeeId:c.employeeId,periodStart:payDate,periodEnd:payDate,payDate,
   amount:c.deltaGross,reason:"Retroactive wage correction: "+c.reason,
   evidenceReference:"retro:"+id+":"+c.evidenceReference,
 },clock);
 if(!created.ok)return fail(created.reason);
 const run:PayRun={...created.run,special:{
   ...created.run.special!,retroCaseId:id,originalRunId:c.sourceRunId,
 }};
 const next:RetroCorrectionCase={...c,status:"Supplemental drafted",supplementalRunId:run.id};
 return{ok:true,state:{...state,runs:[run,...state.runs],
   retroCases:state.retroCases.map(x=>x.id===id?next:x)},case:next,runId:run.id};
}
/** A recovery decision is documentary only: never initiate an automatic deduction or ACH debit. */
export function closeRecoveryReview(state:PayrollState,id:string,externalReference:string,clock:RetroClock):RetroResult{
 if(!clockValid(clock)||externalReference.trim().length<5)
   return fail("Record an external processor/HR resolution reference.");
 const c=state.retroCases.find(x=>x.id===id);
 if(!c||c.status!=="Recovery review")return fail("Only an approved overpayment review can be closed.");
 const next:RetroCorrectionCase={...c,status:"Closed",
   resolvedAt:clock.at,resolvedBy:clock.actorId,resolutionReference:externalReference.trim()};
 return{ok:true,state:{...state,retroCases:state.retroCases.map(x=>x.id===id?next:x)},case:next};
}
