"use client";

import {useMemo,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {usePayroll} from "../../lib/payroll-context";
import {consumedTimecards} from "../../lib/payroll-engine";
import {arizonaDateKey} from "../../lib/date-time";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import {Button,Field,Section} from "../ui";
import type {SpecialPayDraftInput} from "../../lib/payroll-special-runs";

export function SpecialPayrollPanel(){
 const {data,currentUser}=useWorkspace();const {hcm}=useHcm();const {payroll,createSpecialDraft}=usePayroll();
 const runtime=useRuntimeMode();
 const [kind,setKind]=useState<SpecialPayDraftInput["kind"]>("Off-cycle");
 const [employeeId,setEmployeeId]=useState("");
 const [periodStart,setPeriodStart]=useState("");
 const [periodEnd,setPeriodEnd]=useState("");
 const [payDate,setPayDate]=useState(arizonaDateKey());
 const [amount,setAmount]=useState("");
 const [reason,setReason]=useState("");
 const [evidenceReference,setEvidenceReference]=useState("");
 const [selectedCards,setSelectedCards]=useState<string[]>([]);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const admin=currentUser?.role==="Administrator";
 const localDemo=runtime.isDemo&&momentumStorage.mode()==="local";
 const employees=useMemo(()=>data.users.filter(u=>u.role!=="Customer").filter(u=>{
   const e=hcm.employees.find(record=>record.userId===u.id);
   return kind==="Final pay"?e?.status==="Separated":e?.status==="Active"||e?.status==="Leave";
 }).sort((a,b)=>a.name.localeCompare(b.name)),[data.users,hcm.employees,kind]);
 const employee=employees.find(u=>u.id===employeeId);
 const separationDate=hcm.employees.find(e=>e.userId===employeeId)?.separationDate??"";
 const consumed=consumedTimecards(payroll);
 const readyCards=useMemo(()=>data.timecards.filter(card=>card.userId===employeeId&&
   ["Manager approved","Payroll ready"].includes(card.status)&&
   (!periodStart||card.weekStart>=periodStart)&&(!periodEnd||card.weekEnd<=periodEnd)&&
   !consumed.has(card.id)).sort((a,b)=>a.weekStart.localeCompare(b.weekStart)),
   [data.timecards,employeeId,periodStart,periodEnd,consumed]);
 const readyIds=new Set(readyCards.map(c=>c.id));
 const selected=selectedCards.filter(id=>readyIds.has(id));
 const makeDraft=()=>{
   setError("");setNotice("");
   if(!localDemo){setError("Read-only connected preview. Open isolated local demo mode to test draft creation.");return;}
   const value=Number(amount);
   if(amount.trim()===""||!Number.isFinite(value)||value<0){setError("Enter the reviewed taxable amount, including zero for a final-pay run based on timecards only.");return;}
   if(!employee){setError("Choose an employee with a matching HR employment status.");return;}
   const result=createSpecialDraft({
     kind,employeeId:employee.id,periodStart,periodEnd,payDate,
     amount:value,reason,evidenceReference,separationDate:kind==="Final pay"?separationDate:undefined,
     sourceTimecardIds:kind==="Final pay"?selected:[],
   });
   if(!result.ok){setError(result.error??"Draft rejected by payroll controls.");return;}
   setNotice("Draft creation requested in isolated local demo: "+result.id+
     ". Check the pay-run register and source control issues before approval. No payment was made.");
 };
 if(!admin)return null;
 return <Section title="Special payroll | off-cycle and final pay"
   description="Separate evidence-backed runs for supplemental taxable earnings or employment separation. These follow the same draft, review, approval, provider-handoff and settlement controls as regular payroll.">
   {!localDemo&&<div className="payroll-control-alert"><p>Connected-data preview is read-only. Special payroll creation is available only in isolated local demo mode until acceptance testing and release approval.</p></div>}
   <div className="company-grid company-grid--two">
     <div className="form-grid">
       <Field label="Payroll type"><select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setEmployeeId("");setSelectedCards([]);}}>
         <option value="Off-cycle">Off-cycle taxable earnings</option>
         <option value="Final pay">Termination / final pay</option>
       </select></Field>
       <Field label="Employee"><select value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setSelectedCards([]);}}>
         <option value="">Select eligible employee</option>
         {employees.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}
       </select></Field>
       <Field label="Payroll period start"><input type="date" value={periodStart} onChange={e=>{setPeriodStart(e.target.value);setSelectedCards([]);}}/></Field>
       <Field label="Payroll period end"><input type="date" value={periodEnd} onChange={e=>{setPeriodEnd(e.target.value);setSelectedCards([]);}}/></Field>
       <Field label="Pay date"><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></Field>
       {kind==="Final pay"&&<p className="form-hint">HR separation date: <strong>{separationDate||"Not recorded"}</strong>. Final pay is blocked without a matching separated employment record.</p>}
       <Field label={kind==="Final pay"?"Additional taxable final earnings (USD)":"Taxable supplemental earnings (USD)"}>
         <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/>
       </Field>
       <Field label="Reason / earning category"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Document the bonus, correction or final adjustment"/></Field>
       <Field label="Approved source / document reference"><input value={evidenceReference} onChange={e=>setEvidenceReference(e.target.value)} placeholder="Secure approval reference (not SSN or bank data)"/></Field>
       <Button disabled={!localDemo||!employee} onClick={makeDraft}>Calculate special payroll draft</Button>
     </div>
     <div>
       <h3>What this draft will calculate</h3>
       <p className="form-hint">The taxable amount is subject to the existing configured withholding estimates. No recurring employee benefit deductions or additional fixed withholding are duplicated on a supplemental-only run. The payroll provider must validate actual federal, FICA, state and local taxes.</p>
       {kind==="Final pay"?<>
         <p className="form-hint">Select exact approved, unconsumed timecards to calculate hourly final wages. Taxable adjustments are added to wages. If no cards are selected, the adjustment must be greater than zero. Salary proration and non-taxable reimbursements require separate documented processor review.</p>
         <div className="tax-ledger">
           {readyCards.map(card=><label key={card.id} className="payroll-line-row">
             <input type="checkbox" checked={selected.includes(card.id)} onChange={e=>
               setSelectedCards(s=>e.target.checked?[...s,card.id]:s.filter(id=>id!==card.id))}/>
             <span>{card.weekStart} to {card.weekEnd}</span><span>{card.status}</span>
           </label>)}
           {!readyCards.length&&<p>No unconsumed, payroll-ready timecards match the selected employee and period.</p>}
         </div>
       </>:<p className="form-hint">Use this for a single approved taxable supplemental earning not already included in regular or bonus payroll. The evidence reference is checked for duplicate use per employee.</p>}
       <p className="form-hint">This creates a Draft only. Approval, provider submission, tax filings and actual settlement remain separate recorded actions.</p>
     </div>
   </div>
   {error&&<p role="alert" className="form-error">{error}</p>}
   {notice&&<p role="status" className="form-notice">{notice}</p>}
 </Section>;
}
