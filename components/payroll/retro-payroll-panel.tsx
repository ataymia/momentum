"use client";

import {useMemo,useState} from "react";
import {arizonaDateKey} from "../../lib/date-time";
import {usePayroll} from "../../lib/payroll-context";
import {useWorkspace} from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {downloadPayrollCsv} from "../../lib/payroll-download";
import {Button,Field,Section,StatusPill,formatMoney} from "../ui";

export function RetroPayrollPanel(){
 const {payroll,createRetroCase,reviewRetroCase,approveRetroCase,draftRetroSupplement,closeRetroRecovery}=usePayroll();
 const {data,currentUser}=useWorkspace();
 const runtime=useRuntimeMode();
 const demo=runtime.isDemo&&momentumStorage.mode()==="local";
 const [runId,setRunId]=useState("");
 const [employeeId,setEmployeeId]=useState("");
 const [correctedGross,setCorrectedGross]=useState("");
 const [evidence,setEvidence]=useState("");
 const [reason,setReason]=useState("");
 const [payDate,setPayDate]=useState(arizonaDateKey());
 const [resolution,setResolution]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const runs=useMemo(()=>payroll.runs.filter(run=>run.status==="Released"&&
   run.lines.some(line=>payroll.disbursements.some(d=>d.payRunId===run.id&&
     d.userId===line.employeeId&&d.status==="Settled"&&Math.abs(d.amount-line.netPay)<0.005))),
   [payroll.runs,payroll.disbursements]);
 const selectedRun=runs.find(r=>r.id===runId);
 const payable=selectedRun?.lines.filter(line=>payroll.disbursements.some(d=>d.payRunId===runId&&
   d.userId===line.employeeId&&d.status==="Settled"&&Math.abs(d.amount-line.netPay)<0.005))??[];
 const original=payable.find(l=>l.employeeId===employeeId);
 const value=correctedGross.trim()?Number(correctedGross):NaN;
 const delta=original&&Number.isFinite(value)?Math.round((value-original.grossPay)*100)/100:null;
 const act=(fn:()=>{ok:boolean;error?:string;id?:string},success:string)=>{
   setError("");setNotice("");
   const result=fn();
   if(!result.ok){setError(result.error??"Payroll correction was not recorded.");return;}
   setNotice(success+(result.id?" ("+result.id+")":""));
 };
 const download=()=>{
   downloadPayrollCsv("momentum-retro-payroll-corrections.csv",payroll.retroCases.map(c=>({
     caseId:c.id,sourceRunId:c.sourceRunId,employeeId:c.employeeId,
     originalGross:c.originalGross,correctedGross:c.correctedGross,deltaGross:c.deltaGross,
     classification:c.deltaGross>0?"Additional wages":c.deltaGross<0?"Overpayment review":"No difference",
     status:c.status,reason:c.reason,evidenceReference:c.evidenceReference,
     createdAt:c.createdAt,createdBy:c.createdBy,reviewedAt:c.reviewedAt??"",
     reviewedBy:c.reviewedBy??"",approvedAt:c.approvedAt??"",approvedBy:c.approvedBy??"",
     supplementalRunId:c.supplementalRunId??"",resolutionReference:c.resolutionReference??"",
     resolvedAt:c.resolvedAt??""
   })),["caseId","sourceRunId","employeeId","originalGross","correctedGross","deltaGross",
     "classification","status","reason","evidenceReference","createdAt","createdBy",
     "reviewedAt","reviewedBy","approvedAt","approvedBy","supplementalRunId",
     "resolutionReference","resolvedAt"]);
 };
 if(currentUser?.role!=="Administrator")return null;
 return <Section title="Retroactive payroll corrections"
   description="Resolve settled paycheck discrepancies without changing the original timecard, paid wage ledger or historical tax evidence. Supplemental payments require a separate approved provider run.">
    {!demo&&<p className="form-hint">Connected payroll correction decisions are read-only until the server and provider reconciliation workflow are approved. This isolated demo supports end-to-end testing without payments.</p>}
    <div className="company-grid company-grid--two">
      <div className="form-grid">
        <Field label="Original released and settled payroll"><select value={runId}
          onChange={e=>{setRunId(e.target.value);setEmployeeId("");setCorrectedGross("");}}>
          <option value="">Choose verified paid run</option>
          {runs.map(r=><option value={r.id} key={r.id}>{r.id} | {r.payDate} | {r.kind}</option>)}
        </select></Field>
        <Field label="Employee"><select value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setCorrectedGross("");}}>
          <option value="">Choose employee from settled run</option>
          {payable.map(l=><option key={l.employeeId} value={l.employeeId}>
            {data.users.find(u=>u.id===l.employeeId)?.name??l.employeeId}
          </option>)}
        </select></Field>
        {original&&<p className="form-hint">Original settled gross: {formatMoney(original.grossPay)}. Original net: {formatMoney(original.netPay)}. Original hours: {original.regularHours} regular / {original.overtimeHours} overtime. Use source evidence to verify the corrected gross; taxes and net correction are recalculated for processor review.</p>}
        <Field label="Corrected total gross for that original paycheck (USD)">
          <input type="number" min="0" step="0.01" value={correctedGross}
            onChange={e=>setCorrectedGross(e.target.value)} placeholder="0.00"/>
        </Field>
        {delta!==null&&<p className="form-hint">Calculated gross difference: <strong>{formatMoney(Math.abs(delta))}</strong> {delta>0?"additional wages to review":delta<0?"potential overpayment, recovery review only":"no change"}. This is a gross amount, not a final net payment calculation.</p>}
        <Field label="Verified evidence reference"><input value={evidence}
          onChange={e=>setEvidence(e.target.value)} placeholder="Timecard dispute or processor case reference"/></Field>
        <Field label="Reason and calculation basis"><textarea rows={3} value={reason}
          onChange={e=>setReason(e.target.value)}
          placeholder="Record what changed and how the revised gross amount was verified."/></Field>
        <Button disabled={!demo||!original||correctedGross.trim()===""||!Number.isFinite(value)||
          reason.trim().length<8||evidence.trim().length<5}
          onClick={()=>act(()=>createRetroCase({sourceRunId:runId,employeeId,
            correctedGross:value,reason,evidenceReference:evidence}),
            "Retroactive discrepancy opened for review")}>Create correction case</Button>
      </div>
      <div>
        <h3>Correction safeguards</h3>
        <p className="form-hint">The source run must be Released and its employee disbursement must be Settled. The corrected gross is compared with the recorded original gross to calculate the difference. This stage does not rewrite payroll history.</p>
        <p className="form-hint">Each case goes through Draft, Reviewed, and Approved. A positive approved difference may create one linked off-cycle supplemental Draft. That draft still requires payroll approval, processor acceptance, payment settlement, and tax review.</p>
        <p className="form-hint">An overpayment produces a recovery-review case only. It cannot trigger an employee deduction, negative paycheck, ACH debit, or cash recovery. Record the external decision and resolution reference separately.</p>
        <Field label="New supplemental pay date"><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></Field>
        <Button size="sm" variant="secondary" disabled={!payroll.retroCases.length} onClick={download}>
          Download correction register (CSV)</Button>
      </div>
    </div>
    <div className="company-request-list">
      {payroll.retroCases.map(c=><article key={c.id}>
        <div>
          <small>Source {c.sourceRunId} | {data.users.find(u=>u.id===c.employeeId)?.name??c.employeeId}</small>
          <strong>{c.deltaGross>0?"Additional wages":c.deltaGross<0?"Potential overpayment":"No wage difference"}: {formatMoney(Math.abs(c.deltaGross))}</strong>
          <p>{c.reason} | Evidence: {c.evidenceReference}</p>
          <p>Original gross {formatMoney(c.originalGross)} → corrected {formatMoney(c.correctedGross)}</p>
          {c.supplementalRunId&&<p>Supplemental payroll draft: {c.supplementalRunId}</p>}
          {c.resolutionReference&&<p>Resolution: {c.resolutionReference}</p>}
        </div>
        <StatusPill tone={c.status==="Approved"?"gold":c.status==="Recovery review"?"warning":
          c.status==="Supplemental drafted"?"success":"info"}>{c.status}</StatusPill>
        {demo&&<div className="request-actions">
          {c.status==="Draft"&&<Button size="sm" variant="secondary"
            onClick={()=>act(()=>reviewRetroCase(c.id),"Correction reviewed")}>Review</Button>}
          {c.status==="Reviewed"&&<Button size="sm"
            onClick={()=>act(()=>approveRetroCase(c.id),"Correction approved and classified")}>Approve</Button>}
          {c.status==="Approved"&&c.deltaGross>0&&<Button size="sm"
            onClick={()=>act(()=>draftRetroSupplement(c.id,payDate),"Linked supplemental draft created")}>
              Create off-cycle draft</Button>}
          {c.status==="Recovery review"&&<div>
            <Field label="External recovery resolution / processor reference"><input
              value={resolution[c.id]??""} onChange={e=>setResolution(s=>({...s,[c.id]:e.target.value}))}
              placeholder="Document approved resolution, without taking money"/></Field>
            <Button size="sm" variant="secondary" disabled={(resolution[c.id]??"").trim().length<5}
              onClick={()=>act(()=>closeRetroRecovery(c.id,resolution[c.id]??""),
                "Recovery investigation resolved in the ledger")}>Close documented review</Button>
          </div>}
        </div>}
      </article>)}
      {!payroll.retroCases.length&&<p>No retroactive corrections recorded. Start with a verified settled paycheck above.</p>}
    </div>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {notice&&<p role="status" className="form-notice">{notice}</p>}
 </Section>;
}
