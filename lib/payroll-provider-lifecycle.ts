/**
 * Human-controlled payroll-provider handoff and tax-filing evidence ledger.
 *
 * This never initiates money movement, prepares an official tax return, files a
 * form, or treats a provider submission as a government acknowledgment.
 * Records are nested on the canonical PayRun to reuse the existing
 * Administrator-only payroll document and retain payroll history.
 */
import {isValidCalendarDateKey} from "./date-time";
import type {PayrollState,PayRun} from "./payroll-engine";

export type ProviderStatus="Prepared"|"Submitted to provider"|"Accepted by provider"|"Returned for correction"|"Pay reconciled";
export type ProviderTotals={gross:number;net:number;employeeTaxes:number;employerTaxes:number;employeeCount:number};
export type ProviderHandoff={
  providerName:string;status:ProviderStatus;preparedAt:string;preparedBy:string;
  expected:ProviderTotals;submittedAt?:string;submittedBy?:string;submissionReference?:string;
  providerRunReference?:string;providerReported?:ProviderTotals;providerReviewedAt?:string;
  returnedReason?:string;payReconciledAt?:string;payReconciledBy?:string;
};
export type FilingStatus="Planned"|"Sent to provider"|"Filed"|"Rejected";
export type PayrollFilingCase={
  id:string;formCode:string;agency:string;periodStart:string;periodEnd:string;dueDate:string;
  status:FilingStatus;createdAt:string;createdBy:string;
  providerName?:string;submissionReference?:string;submittedAt?:string;submittedBy?:string;
  acknowledgmentReference?:string;filedDate?:string;decidedAt?:string;decidedBy?:string;rejectionReason?:string;
  amendmentOf?:string;
};
export type PayrollWorkflowEvent={
  id:string;at:string;actorId:string;action:string;runId:string;reference?:string;detail?:string;
};
export type PayrollRunExtension={providerHandoff?:ProviderHandoff;filingCases?:PayrollFilingCase[];workflowEvents?:PayrollWorkflowEvent[]};
export type ExtendedPayRun=PayRun&PayrollRunExtension;
type Result={state:PayrollState;ok:boolean;error?:string};
type Clock={actorId:string;at:string;id:string};
const fail=(state:PayrollState,error:string):Result=>({state,ok:false,error});
const clean=(x:string)=>x.trim();
const validDate=(s:string)=>isValidCalendarDateKey(s);
const validInstant=(s:string)=>!Number.isNaN(Date.parse(s));
const numeric=(n:number)=>Number.isFinite(n)&&n>=0&&Math.abs(n-Math.round(n*100)/100)<0.00001;
const dateOnly=(at:string)=>at.slice(0,10);
const event=(runId:string,c:Clock,action:string,reference?:string,detail?:string):PayrollWorkflowEvent=>({
  id:c.id,at:c.at,actorId:c.actorId,action,runId,reference,detail,
});
const actorValid=(c:Clock)=>Boolean(clean(c.actorId)&&clean(c.id)&&validInstant(c.at));
const cents=(n:number)=>Math.round(n*100);
const sum=(run:PayRun,key:"grossPay"|"netPay"|"employeeTaxes"|"employerTaxes")=>Math.round(run.lines.reduce((n,l)=>n+l[key],0)*100)/100;
export function totalsForRun(run:PayRun):ProviderTotals{
  return {gross:sum(run,"grossPay"),net:sum(run,"netPay"),employeeTaxes:sum(run,"employeeTaxes"),
    employerTaxes:sum(run,"employerTaxes"),employeeCount:run.lines.length};
}
const validTotals=(v:ProviderTotals)=>Number.isSafeInteger(v.employeeCount)&&v.employeeCount>0&&
  [v.gross,v.net,v.employeeTaxes,v.employerTaxes].every(numeric);
export function compareProviderTotals(expected:ProviderTotals,actual:ProviderTotals){
  return {
    grossCents:cents(actual.gross)-cents(expected.gross),
    netCents:cents(actual.net)-cents(expected.net),
    employeeTaxCents:cents(actual.employeeTaxes)-cents(expected.employeeTaxes),
    employerTaxCents:cents(actual.employerTaxes)-cents(expected.employerTaxes),
    employeeCount:actual.employeeCount-expected.employeeCount,
  };
}
export function providerTotalsMatch(expected:ProviderTotals,actual:ProviderTotals){
  return Object.values(compareProviderTotals(expected,actual)).every(delta=>delta===0);
}
function changeRun(state:PayrollState,runId:string,fn:(run:ExtendedPayRun)=>ExtendedPayRun):PayrollState{
  return {...state,runs:state.runs.map(run=>run.id===runId?fn(run as ExtendedPayRun):run)};
}
function append(run:ExtendedPayRun,e:PayrollWorkflowEvent):ExtendedPayRun{
  return {...run,workflowEvents:[...(run.workflowEvents??[]),e]};
}
export function prepareProviderPacket(state:PayrollState,runId:string,provider:string,clock:Clock):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  if(!run||!["Approved","Released"].includes(run.status))return fail(state,"Approve the pay run before preparing a handoff.");
  if(!actorValid(clock)||!clean(provider))return fail(state,"Provider, actor and valid timestamp required.");
  if(run.providerHandoff)return fail(state,"Existing handoff must be reviewed, not overwritten.");
  const expected=totalsForRun(run);
  if(!validTotals(expected))return fail(state,"Invalid internal totals. Correct payroll before handoff.");
  const providerHandoff:ProviderHandoff={providerName:clean(provider),status:"Prepared",preparedAt:clock.at,preparedBy:clock.actorId,expected};
  return{ok:true,state:changeRun(state,runId,r=>append({...r,providerHandoff},event(runId,clock,"Provider packet prepared",undefined,clean(provider))))};
}
export function submitProviderPacket(state:PayrollState,runId:string,reference:string,clock:Clock):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  if(!run||run.status==="Voided"||run.providerHandoff?.status!=="Prepared")return fail(state,"Only a prepared active packet can be submitted.");
  if(!actorValid(clock)||!clean(reference))return fail(state,"An external submission reference is required.");
  return{ok:true,state:changeRun(state,runId,r=>append({...r,providerHandoff:{
    ...r.providerHandoff!,status:"Submitted to provider",submissionReference:clean(reference),submittedBy:clock.actorId,submittedAt:clock.at,
  }},event(runId,clock,"Handoff recorded as sent to provider",clean(reference))))};
}
export function reviewProviderPacket(state:PayrollState,runId:string,providerReference:string,reported:ProviderTotals,clock:Clock,returnReason=""):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  if(!run||run.status==="Voided"||run.providerHandoff?.status!=="Submitted to provider")return fail(state,"Provider must receive a submitted active packet first.");
  if(!actorValid(clock)||!clean(providerReference)||!validTotals(reported))return fail(state,"Provider reference and valid per-run totals required.");
  const match=providerTotalsMatch(run.providerHandoff.expected,reported);
  if(!match&&!clean(returnReason))return fail(state,"Provide a discrepancy explanation; the approved payroll cannot be silently overwritten.");
  const status:ProviderStatus=match?"Accepted by provider":"Returned for correction";
  return{ok:true,state:changeRun(state,runId,r=>append({...r,providerHandoff:{
    ...r.providerHandoff!,providerRunReference:clean(providerReference),providerReported:{...reported},
    providerReviewedAt:clock.at,status,returnedReason:match?undefined:clean(returnReason),
  }},event(runId,clock,match?"Provider totals accepted":"Provider totals disputed",clean(providerReference),match?undefined:clean(returnReason))))};
}
export function reconcileProviderPay(state:PayrollState,runId:string,clock:Clock):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  if(!run||run.status!=="Released"||run.providerHandoff?.status!=="Accepted by provider")return fail(state,"Only released provider-accepted runs can be reconciled.");
  if(!actorValid(clock))return fail(state,"Authenticated reviewer and timestamp required.");
  const payments=state.disbursements.filter(d=>d.payRunId===runId);
  const settled=payments.filter(d=>d.status==="Settled");
  const owed=run.lines.filter(l=>l.netPay>0);
  if(settled.length!==owed.length||payments.some(d=>d.status==="Released"||(d.status==="Failed"&&!("replacedBy" in d)))||
      owed.some(line=>settled.filter(d=>d.userId===line.employeeId&&cents(d.amount)===cents(line.netPay)).length!==1))
    return fail(state,"Each employee needs one matching settled payment with no unreconciled attempts.");
  if(payments.some(d=>d.amount<=0))return fail(state,"Invalid disbursement.");
  // A paid tax liability and a filed form are different evidence events, tracked separately.
  return{ok:true,state:changeRun(state,runId,r=>append({...r,providerHandoff:{
    ...r.providerHandoff!,status:"Pay reconciled",payReconciledAt:clock.at,payReconciledBy:clock.actorId,
  }},event(runId,clock,"Employee pay reconciled to settlement evidence")))};
}
export function addFilingCase(state:PayrollState,runId:string,
  draft:Pick<PayrollFilingCase,"id"|"formCode"|"agency"|"periodStart"|"periodEnd"|"dueDate">,
  clock:Clock,amendmentOf?:string):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  if(!run||run.status!=="Released")return fail(state,"Anchor filing work to a released pay run.");
  if(!actorValid(clock)||!clean(draft.id)||!clean(draft.formCode)||!clean(draft.agency)||
      ![draft.periodStart,draft.periodEnd,draft.dueDate].every(validDate)||draft.periodEnd<draft.periodStart)
    return fail(state,"Form, agency, reporting period and verified due date are required.");
  const filings=state.runs.flatMap(r=>(r as ExtendedPayRun).filingCases??[]);
  if(filings.some(f=>f.id===draft.id))return fail(state,"Duplicate filing ID.");
  const matching=filings.filter(f=>f.formCode===clean(draft.formCode)&&f.agency===clean(draft.agency)&&f.periodStart===draft.periodStart&&f.periodEnd===draft.periodEnd);
  if(amendmentOf){
    if(!matching.some(f=>f.id===amendmentOf&&f.status==="Filed"))return fail(state,"Amendments must reference a filed original in the same reporting period.");
  }else if(matching.length)return fail(state,"An original filing already exists for this form, agency and period.");
  const filing:PayrollFilingCase={
    id:clean(draft.id),formCode:clean(draft.formCode),agency:clean(draft.agency),periodStart:draft.periodStart,periodEnd:draft.periodEnd,
    dueDate:draft.dueDate,status:"Planned",createdAt:clock.at,createdBy:clock.actorId,amendmentOf,
  };
  return{ok:true,state:changeRun(state,runId,r=>append({...r,filingCases:[...(r.filingCases??[]),filing]},event(runId,clock,amendmentOf?"Filing amendment planned":"Filing planned",filing.id,filing.formCode)))};
}
export function submitFilingCase(state:PayrollState,runId:string,filingId:string,providerName:string,reference:string,clock:Clock):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  const filing=run?.filingCases?.find(f=>f.id===filingId);
  if(!run||!filing||filing.status!=="Planned"||run.status==="Voided")return fail(state,"Only a planned filing on an active pay run can be submitted.");
  if(!actorValid(clock)||!clean(providerName)||!clean(reference))return fail(state,"Provider and external submission evidence required.");
  return{ok:true,state:changeRun(state,runId,r=>append({...r,filingCases:r.filingCases!.map(f=>f.id===filingId?{
    ...f,status:"Sent to provider",providerName:clean(providerName),submissionReference:clean(reference),
    submittedAt:clock.at,submittedBy:clock.actorId,
  }:f)},event(runId,clock,"Filing handed to provider",clean(reference),filingId)))};
}
export function decideFilingCase(state:PayrollState,runId:string,filingId:string,
  decision:"Filed"|"Rejected",reference:string,filingDate:string,clock:Clock,rejectionReason=""):Result{
  const run=state.runs.find(r=>r.id===runId) as ExtendedPayRun|undefined;
  const filing=run?.filingCases?.find(f=>f.id===filingId);
  if(!run||!filing||filing.status!=="Sent to provider")return fail(state,"Only externally submitted filings can receive a provider/agency result.");
  if(!actorValid(clock)||!clean(reference))return fail(state,"External receipt/reference required.");
  if(decision==="Filed"&&(!validDate(filingDate)||filingDate>dateOnly(clock.at)))
    return fail(state,"A real filing date, not in the future, is required.");
  if(decision==="Rejected"&&!clean(rejectionReason))return fail(state,"Rejection details are required.");
  return{ok:true,state:changeRun(state,runId,r=>append({...r,filingCases:r.filingCases!.map(f=>f.id===filingId?{
    ...f,status:decision,acknowledgmentReference:clean(reference),filedDate:decision==="Filed"?filingDate:undefined,
    decidedAt:clock.at,decidedBy:clock.actorId,rejectionReason:decision==="Rejected"?clean(rejectionReason):undefined,
  }:f)},event(runId,clock,decision==="Filed"?"Filing acknowledgment recorded":"Filing rejection recorded",clean(reference),filingId)))};
}
/** Draft-derived CSV rows. Never include bank account numbers, DOB, SSNs or unverified payout status. */
export function providerExportRows(run:PayRun){
  return run.lines.map(l=>({runId:run.id,kind:run.kind,runStatus:run.status,calculationVersion:run.calculationVersion??1,withholdingBasis:"INTERNAL ESTIMATE - PROCESSOR MUST VALIDATE",periodStart:run.periodStart,periodEnd:run.periodEnd,
    payDate:run.payDate,employeeId:l.employeeId,regularHours:l.regularHours,overtimeHours:l.overtimeHours,
    gross:l.grossPay,net:l.netPay,benefitDeduction:l.benefitDeduction,taxableWages:l.taxableWages,
    federalTax:l.federalTax,stateTax:l.stateTax,localTax:l.localTax,additionalWithholding:l.additionalWithholding,
    employerTaxEstimate:l.employerTaxes,sourceTimecardIds:l.sourceTimecardIds.join("|"),
    sourceBonusIds:l.sourceBonusIds.join("|"),
    retroCaseId:run.special?.retroCaseId??"",retroOriginalRunId:run.special?.originalRunId??"",
    retroEvidenceReference:run.special?.retroCaseId?run.special.evidenceReference:"",
  }));
}
export const PROVIDER_EXPORT_COLUMNS=[
  "runId","kind","runStatus","calculationVersion","withholdingBasis","periodStart","periodEnd","payDate","employeeId","regularHours","overtimeHours",
  "gross","net","benefitDeduction","taxableWages","federalTax","stateTax","localTax",
  "additionalWithholding","employerTaxEstimate","sourceTimecardIds","sourceBonusIds",
  "retroCaseId","retroOriginalRunId","retroEvidenceReference",
] as const;
