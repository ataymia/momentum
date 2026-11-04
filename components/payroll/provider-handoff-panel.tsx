"use client";

import {useState} from "react";
import {Download,Landmark,ShieldAlert} from "lucide-react";
import {usePayroll} from "../../lib/payroll-context";
import {useWorkspace} from "../../lib/workspace-context";
import {arizonaDateKey} from "../../lib/date-time";
import {PAYROLL_STORAGE_KEY} from "../../lib/payroll-engine";
import {downloadPayrollCsv} from "../../lib/payroll-download";
import {PROVIDER_EXPORT_COLUMNS,providerExportRows,totalsForRun,
  type ExtendedPayRun,type PayrollFilingCase,type ProviderTotals} from "../../lib/payroll-provider-lifecycle";
import {momentumStorage} from "../../lib/persistence";
import {Button,Field,Section,StatusPill,formatMoney} from "../ui";

const today=()=>arizonaDateKey();
const num=(s:string)=>s.trim()===""?NaN:Number(s);
const filingExportColumns=["runId","formCode","agency","periodStart","periodEnd","dueDate","status","providerName","submissionReference","acknowledgmentReference","filedDate","rejectionReason"] as const;

export function PayrollProviderPanel(){
 const {currentUser}=useWorkspace();
 const {payroll,prepareProviderPacket,submitProviderPacket,reviewProviderPacket,reconcileProviderPay,
   addFilingCase,submitFilingCase,decideFilingCase}=usePayroll();
 const [selectedId,setSelectedId]=useState("");
 const [provider,setProvider]=useState("");
 const [submissionRef,setSubmissionRef]=useState("");
 const [providerRunRef,setProviderRunRef]=useState("");
 const [gross,setGross]=useState("");const[net,setNet]=useState("");
 const [employeeTaxes,setEmployeeTaxes]=useState("");const[employerTaxes,setEmployerTaxes]=useState("");
 const [employeeCount,setEmployeeCount]=useState("");
 const [discrepancy,setDiscrepancy]=useState("");
 const [formCode,setFormCode]=useState("941");const[agency,setAgency]=useState("IRS");
 const [periodStart,setPeriodStart]=useState("");const[periodEnd,setPeriodEnd]=useState("");
 const [dueDate,setDueDate]=useState("");const[amendmentOf,setAmendmentOf]=useState("");
 const [filingId,setFilingId]=useState("");
 const [filingReference,setFilingReference]=useState("");
 const [filingDate,setFilingDate]=useState(today());
 const [filingReason,setFilingReason]=useState("");
 const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const admin=currentUser?.role==="Administrator";
 const runs=payroll.runs.filter(r=>r.status!=="Voided").sort((a,b)=>b.payDate.localeCompare(a.payDate));
 const run=(runs.find(r=>r.id===selectedId)??runs[0]) as ExtendedPayRun|undefined;
 const handoff=run?.providerHandoff;
 const allFilings=payroll.runs.flatMap(r=>(r as ExtendedPayRun).filingCases?.map(f=>({runId:r.id,...f}))??[]);
 const selectedFiling=run?.filingCases?.find(f=>f.id===filingId)??run?.filingCases?.[0];
 const expected=run?totalsForRun(run):undefined;
 const statusTone=(s:string)=>["Filed","Pay reconciled","Accepted by provider"].includes(s)?"success" as const:
     ["Rejected","Returned for correction"].includes(s)?"danger" as const:"warning" as const;

 const show=(result:{ok:boolean;error?:string},action:string)=>{
   if(!result.ok){setError(result.error??"Change rejected by payroll controls.");setNotice("");return;}
   setError("");setNotice(action+" recorded in the local payroll state. Verify remote sync before treating this as final.");
 };
 const exportRun=()=>{
   if(!run||!["Approved","Released"].includes(run.status)){setError("Only approved or released runs may be exported for provider handoff.");return;}
   downloadPayrollCsv("momentum-provider-"+run.id+".csv",providerExportRows(run),PROVIDER_EXPORT_COLUMNS);
 };
 const exportFilings=()=>{
   downloadPayrollCsv("momentum-tax-filings.csv",allFilings.map(f=>({
     runId:f.runId,formCode:f.formCode,agency:f.agency,periodStart:f.periodStart,periodEnd:f.periodEnd,
     dueDate:f.dueDate,status:f.status,providerName:f.providerName??"",submissionReference:f.submissionReference??"",
     acknowledgmentReference:f.acknowledgmentReference??"",filedDate:f.filedDate??"",rejectionReason:f.rejectionReason??""
   })),filingExportColumns);
 };
 const exportLiabilities=()=>downloadPayrollCsv("momentum-tax-liabilities.csv",payroll.liabilities.map(l=>({
   runId:l.payRunId,type:l.type,amount:l.amount,dueDate:l.dueDate??"",status:l.status,
   reference:"paymentReference" in l?String(l.paymentReference??""):""
 })),["runId","type","amount","dueDate","status","reference"]);

 const review=()=>{
   if(!run)return;
   const amounts=[gross,net,employeeTaxes,employerTaxes,employeeCount];
   if(amounts.some(v=>!v.trim())){setError("Enter every amount and employee count from the provider review.");return;}
   const reported:ProviderTotals={gross:num(gross),net:num(net),employeeTaxes:num(employeeTaxes),
     employerTaxes:num(employerTaxes),employeeCount:num(employeeCount)};
   show(reviewProviderPacket(run.id,providerRunRef,reported,discrepancy),"Provider review");
 };
 const createFiling=()=>{
   if(!run)return;
   const id="filing-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
   const input:Pick<PayrollFilingCase,"id"|"formCode"|"agency"|"periodStart"|"periodEnd"|"dueDate">={
     id,formCode,agency,periodStart,periodEnd,dueDate};
   const result=addFilingCase(run.id,input,amendmentOf||undefined);
   show(result,"Filing plan");
   if(result.ok)setFilingId(id);
 };
 const recordResult=(decision:"Filed"|"Rejected")=>{
   if(!run||!selectedFiling)return;
   show(decideFilingCase(run.id,selectedFiling.id,decision,filingReference,filingDate,filingReason),
     decision==="Filed"?"Agency filing acknowledgment":"Provider filing rejection");
 };
 if(!admin)return null;

 return <div className="payroll-provider-workspace">
   <Section title="External processor control center" description="Momentum prepares and approves payroll; a verified payroll processor executes disbursements and submits tax filings. No external transfer is initiated from this screen.">
     <div className="form-grid">
       <Field label="Select payroll run"><select value={run?.id??""} onChange={e=>{setSelectedId(e.target.value);setError("");setNotice("");}}>
         {runs.map(r=><option key={r.id} value={r.id}>{r.id} · {r.payDate} · {r.status}</option>)}
       </select></Field>
       {run&&<div className="payroll-setup-status">
         <div><span>Internal gross</span><strong>{formatMoney(expected?.gross??0)}</strong></div>
         <div><span>Internal net</span><strong>{formatMoney(expected?.net??0)}</strong></div>
         <div><span>Estimated employee taxes</span><strong>{formatMoney(expected?.employeeTaxes??0)}</strong></div>
         <div><span>Estimated employer taxes</span><strong>{formatMoney(expected?.employerTaxes??0)}</strong></div>
         <div><span>Employees</span><strong>{expected?.employeeCount??0}</strong></div>
       </div>}
     </div>
     {run?<div className="request-actions">
       <Button variant="secondary" icon={<Download size={15}/>} disabled={run.status==="Draft"} onClick={exportRun}>Download approved-run CSV</Button>
       <StatusPill tone={statusTone(handoff?.status??"Prepared")}>{handoff?.status??"No handoff"}</StatusPill>
     </div>:<p>No payroll runs exist. Create and approve a run in Payroll Processing first.</p>}
     <p className="form-hint">The CSV carries internal calculations, source identifiers and no bank routing or Social Security numbers. The processor must use its securely maintained employee identity/payment mapping. A downloaded CSV is not evidence of transmission.</p>
   </Section>
   {run&&<div className="company-grid company-grid--two">
     <Section title="1. Prepare and submit" description="Name your provider, prepare a locked snapshot and record the external transmission reference.">
       <div className="form-grid">
         <Field label="Processor name"><input value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Name of actual payroll company"/></Field>
         <Button onClick={()=>show(prepareProviderPacket(run.id,provider),"Handoff preparation")} disabled={Boolean(handoff)||run.status!=="Approved"&&run.status!=="Released"}>Prepare provider packet</Button>
         <Field label="External submission reference"><input value={submissionRef} onChange={e=>setSubmissionRef(e.target.value)} placeholder="Upload / delivery acknowledgment ID"/></Field>
         <Button variant="secondary" disabled={handoff?.status!=="Prepared"} onClick={()=>show(submitProviderPacket(run.id,submissionRef),"Provider submission")}>Record submission</Button>
       </div>
     </Section>
     <Section title="2. Record provider review" description="Capture returned payroll totals. Mismatches become explicit correction cases; approved pay lines are never silently overwritten.">
       <div className="form-grid">
         <Field label="Provider run reference"><input value={providerRunRef} onChange={e=>setProviderRunRef(e.target.value)}/></Field>
         <Field label="Provider gross"><input type="number" min="0" step="0.01" value={gross} onChange={e=>setGross(e.target.value)}/></Field>
         <Field label="Provider net"><input type="number" min="0" step="0.01" value={net} onChange={e=>setNet(e.target.value)}/></Field>
         <Field label="Employee taxes"><input type="number" min="0" step="0.01" value={employeeTaxes} onChange={e=>setEmployeeTaxes(e.target.value)}/></Field>
         <Field label="Employer taxes"><input type="number" min="0" step="0.01" value={employerTaxes} onChange={e=>setEmployerTaxes(e.target.value)}/></Field>
         <Field label="Employees included"><input type="number" min="1" step="1" value={employeeCount} onChange={e=>setEmployeeCount(e.target.value)}/></Field>
         <Field label="Discrepancy reason (required when totals differ)" className="field--full"><textarea rows={2} value={discrepancy} onChange={e=>setDiscrepancy(e.target.value)}/></Field>
         <Button disabled={handoff?.status!=="Submitted to provider"} onClick={review}>Record processor decision</Button>
       </div>
     </Section>
   </div>}
   {run&&<Section title="3. Payroll disbursement reconciliation" description="Provider acceptance alone does not mean an employee was paid. Match provider-accepted payroll against individual settled payment records.">
     <div className="payroll-setup-status">
       <div><span>Payment instructions</span><strong>{payroll.disbursements.filter(d=>d.payRunId===run.id).length}</strong></div>
       <div><span>Settled</span><strong>{payroll.disbursements.filter(d=>d.payRunId===run.id&&d.status==="Settled").length}</strong></div>
       <div><span>Failed</span><strong>{payroll.disbursements.filter(d=>d.payRunId===run.id&&d.status==="Failed").length}</strong></div>
       <div><span>Unpaid tax liabilities</span><strong>{payroll.liabilities.filter(l=>l.payRunId===run.id&&l.status!=="Paid"&&l.status!=="Reversed").length}</strong></div>
     </div>
     <div className="request-actions">
       <Button disabled={run.status!=="Released"||handoff?.status!=="Accepted by provider"} onClick={()=>show(reconcileProviderPay(run.id),"Employee settlement reconciliation")}>
         Reconcile employee payments</Button>
       <span className="form-hint">Record actual disbursement and tax deposit references in the Tax / Disbursement tab first.</span>
     </div>
   </Section>}
   <Section title="4. Tax forms and filing evidence" description="Plan forms from verified deadlines, hand them to the payroll provider, and record actual agency acceptance or rejection. The portal never generates a government-approved return or files automatically.">
     <div className="company-grid company-grid--two">
       <div className="form-grid">
         <Field label="Form ID / code"><input value={formCode} onChange={e=>setFormCode(e.target.value)} placeholder="941, 940, W-2, state agency form"/></Field>
         <Field label="Agency"><input value={agency} onChange={e=>setAgency(e.target.value)} placeholder="IRS, SSA, Arizona DES"/></Field>
         <Field label="Reporting period start"><input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/></Field>
         <Field label="Reporting period end"><input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/></Field>
         <Field label="Confirmed filing deadline"><input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Field>
         <Field label="Amends filed case ID (optional)"><input value={amendmentOf} onChange={e=>setAmendmentOf(e.target.value)} placeholder="Existing filed record ID"/></Field>
         <Button disabled={!run||run.status!=="Released"} onClick={createFiling}>Add tax filing</Button>
       </div>
       <div>
         <label>Selected filing <select value={selectedFiling?.id??""} onChange={e=>setFilingId(e.target.value)}>
           {run?.filingCases?.map(f=><option value={f.id} key={f.id}>{f.formCode} · {f.periodEnd} · {f.status}</option>)}
         </select></label>
         {selectedFiling&&<div className="tax-ledger"><article><div><strong>{selectedFiling.formCode} / {selectedFiling.agency}</strong><p>{selectedFiling.periodStart} to {selectedFiling.periodEnd} · due {selectedFiling.dueDate}</p><p>Provider reference: {selectedFiling.submissionReference??"Not recorded"}</p><p>Agency acknowledgment: {selectedFiling.acknowledgmentReference??"Not received"}</p></div><StatusPill tone={statusTone(selectedFiling.status)}>{selectedFiling.status}</StatusPill></article></div>}
         <div className="form-grid">
           <Field label="Provider filing submission / agency acknowledgment reference"><input value={filingReference} onChange={e=>setFilingReference(e.target.value)}/></Field>
           <Button variant="secondary" disabled={!selectedFiling||selectedFiling.status!=="Planned"} onClick={()=>run&&selectedFiling&&show(submitFilingCase(run.id,selectedFiling.id,provider||handoff?.providerName||"",filingReference),"Filing submission")}>Record sent to provider</Button>
           <Field label="Confirmed filing date"><input type="date" value={filingDate} onChange={e=>setFilingDate(e.target.value)}/></Field>
           <Field label="Rejection reason"><textarea value={filingReason} rows={2} onChange={e=>setFilingReason(e.target.value)}/></Field>
           <div className="request-actions">
             <Button disabled={!selectedFiling||selectedFiling.status!=="Sent to provider"} onClick={()=>recordResult("Filed")}>Record filing accepted</Button>
             <Button variant="danger" disabled={!selectedFiling||selectedFiling.status!=="Sent to provider"} onClick={()=>recordResult("Rejected")}>Record rejected</Button>
           </div>
         </div>
       </div>
     </div>
     <div className="request-actions">
       <Button icon={<Download size={15}/>} variant="secondary" disabled={!allFilings.length} onClick={exportFilings}>Export filing register</Button>
       <Button icon={<Download size={15}/>} variant="secondary" disabled={!payroll.liabilities.length} onClick={exportLiabilities}>Export tax deposit ledger</Button>
     </div>
     <div className="tax-ledger">{allFilings.map(f=><article key={f.id}><div><small>{f.agency} · {f.periodStart} to {f.periodEnd}</small><strong>{f.formCode}{f.amendmentOf?" (amendment)":""}</strong><p>{f.status} · due {f.dueDate} · payrun {f.runId}</p></div><StatusPill tone={statusTone(f.status)}>{f.status}</StatusPill></article>)}</div>
     <p className="form-hint">Deadlines must be entered from confirmed jurisdiction and employer filing requirements. A provider confirmation is recorded as evidence and is not independently verified against an agency through this screen.</p>
   </Section>
   <Section title="5. Audit and exceptions" description="Recorded handoffs, provider responses, filing decisions, and employee pay reconciliation stay in the run audit history.">
     {run?.workflowEvents?.map(e=><div key={e.id} className="payroll-line-row"><span>{e.at.slice(0,10)}</span><span>{e.action}</span><span>{e.actorId}</span><span>{e.reference??"No reference"}</span></div>)}
     {!run?.workflowEvents?.length&&<p>No provider workflow actions recorded for this pay run.</p>}
     {run?.providerHandoff?.returnedReason&&<div className="payroll-control-alert"><ShieldAlert size={18}/><div><strong>Provider discrepancy requires correction</strong><p>{run.providerHandoff.returnedReason}</p></div></div>}
     <p className="form-hint"><Landmark size={14}/> Provider tax calculations and jurisdiction tax returns must be verified by the authorized payroll processor. This module tracks human approvals, external evidence and exceptions without fabricating a filed return or bank transfer.</p>
   </Section>
   {error&&<p className="form-error" role="alert">{error}</p>}
   {notice&&<p className="form-notice" role="status">{notice}</p>}
   <p className="form-hint">Payroll domain: {PAYROLL_STORAGE_KEY} · Persistence: {momentumStorage.mode()==="firestore"?"Connected storage":"Local demo storage"}.</p>
 </div>;
}
