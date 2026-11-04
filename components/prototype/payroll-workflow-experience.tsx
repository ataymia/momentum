"use client";

import {useMemo,useState} from "react";
import {CalendarDays,Download,FileCheck2,ShieldAlert,WalletCards} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {usePayroll} from "../../lib/payroll-context";
import {useHcm} from "../../lib/hcm-context";
import {payrollRunControlIssues} from "../../lib/payroll-controls";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const fields=["runId","employee","periodStart","periodEnd","payDate","status","regularHours","overtimeHours","regularPay","overtimePay","bonusPay","grossPay","benefits","employeeTaxes","otherDeductions","netPay"];

export function PayrollWorkflowExperience(){
  const {data,currentUser}=useWorkspace();
  const runtime=useRuntimeMode();const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local";
  const {hcm}=useHcm();
  const {payroll,buildRegularRun,setRunStatus}=usePayroll();
  const admin=currentUser?.role==="Administrator";
  const ownId=currentUser?.id??"";
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [sort,setSort]=useState<"payDate"|"periodStart"|"status"|"kind">("payDate");
  const [descending,setDescending]=useState(true);
  const [periodStart,setPeriodStart]=useState("");
  const [periodEnd,setPeriodEnd]=useState("");
  const [payDate,setPayDate]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const visibleRuns=useMemo(()=>payroll.runs.filter(run=>admin||run.lines.some(line=>line.employeeId===ownId))
    .filter(run=>status==="all"||run.status===status)
    .filter(run=>[run.id,run.kind,run.status,run.periodStart,run.periodEnd,run.payDate].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>String(a[sort]).localeCompare(String(b[sort]))*(descending?-1:1)),
    [payroll.runs,admin,ownId,status,query,sort,descending]);
  const selected=visibleRuns.find(run=>run.id===selectedId)??visibleRuns[0];
  const lines=selected?(admin?selected.lines:selected.lines.filter(line=>line.employeeId===ownId)):[];
  const issues=selected&&admin?payrollRunControlIssues(payroll,data,hcm,selected):[];
  const employeeName=(id:string)=>data.users.find(user=>user.id===id)?.name??"Employee not found";
  const exportRows=(runIds?:string[])=>visibleRuns.filter(run=>!runIds||runIds.includes(run.id)).flatMap(run=>
    (admin?run.lines:run.lines.filter(line=>line.employeeId===ownId)).map(line=>({
      runId:run.id,employee:employeeName(line.employeeId),periodStart:run.periodStart,periodEnd:run.periodEnd,
      payDate:run.payDate,status:run.status,regularHours:line.regularHours,overtimeHours:line.overtimeHours,
      regularPay:line.regularPay,overtimePay:line.overtimePay,bonusPay:line.bonusPay,grossPay:line.grossPay,
      benefits:line.benefitDeduction,employeeTaxes:line.employeeTaxes,
      otherDeductions:line.postTaxDeduction,netPay:line.netPay
    })));
  const exportRun=(ids?:string[])=>{
    const rows=exportRows(ids);if(!rows.length){setError("No pay lines are visible for export.");return;}
    downloadCsv(ids?.length===1?"momentum-payrun-"+ids[0]+".csv":"momentum-payroll-register.csv",rows,fields);
  };
  const createDraft=()=>{
    setNotice("");setError("");
    if(!writeEnabled){setError("Read-only prototype: payroll draft creation requires isolated local demo mode.");return;}
    if(!periodStart||!periodEnd||!payDate||periodStart>periodEnd){setError("Select a valid start date, end date and payday.");return;}
    const id=buildRegularRun(periodStart,periodEnd,payDate);
    if(!id){setError("No draft was created. Check approved, unused timecards; effective compensation; withholding configuration; payroll locks and dates in the existing payroll controls.");return;}
    setSelectedId(id);setNotice("Regular payroll draft calculated from approved source records. Review every line and exception before approval.");
  };
  const approve=()=>{
    if(!writeEnabled){setError("Read-only prototype: payroll approval requires isolated local demo mode.");return;}
    if(!selected||selected.status!=="Draft"||issues.length)return;
    if(!window.confirm("Approve this payroll draft after reviewing hours, employee setup, taxes and deductions? This approval is recorded but does not pay employees."))return;
    setNotice("");setError("");
    if(setRunStatus(selected.id,"Approved"))setNotice("Payroll run approved. No funds have been disbursed. Use controlled release and settlement workflow.");
    else setError("Run not approved. A payroll source, permission or period-lock control rejected the action.");
  };
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Payroll access is restricted.</div>;

  return <div className="prototype-domain prototype-domain--payroll">
    <header className="prototype-heading"><h1>{admin?"Payroll operations":"My pay records"}</h1><p>{admin?"Calculate drafts, inspect pay lines, review exceptions, export registers and hand approved runs to settlement.":"Your own recorded pay lines and their status. Internal approval is not proof of bank settlement."}</p></header>
    <div className="prototype-domain-statbar">
      <article><WalletCards size={18}/><small>Visible pay runs</small><strong>{visibleRuns.length}</strong></article>
      {admin&&<article><FileCheck2 size={18}/><small>Drafts awaiting review</small><strong>{payroll.runs.filter(run=>run.status==="Draft").length}</strong></article>}
      {admin&&<article><ShieldAlert size={18}/><small>Released, unsettled disbursements</small><strong>{payroll.disbursements.filter(row=>row.status==="Released").length}</strong></article>}
      {admin&&<article><CalendarDays size={18}/><small>Active pay groups</small><strong>{payroll.payGroups.filter(group=>group.active).length}</strong></article>}
    </div>
    {admin&&<section className="prototype-panel">
      <h2>1. Calculate regular payroll draft</h2>
      <p className="prototype-note">Calculates from approved, unconsumed timecards and current HR/payroll configuration. Missing or invalid sources block the draft. This is an internal calculation, not certified tax payroll.</p>
      <div className="prototype-controls">
        <label>Period begins <input type="date" value={periodStart} onChange={event=>setPeriodStart(event.target.value)}/></label>
        <label>Period ends <input type="date" value={periodEnd} onChange={event=>setPeriodEnd(event.target.value)}/></label>
        <label>Payday <input type="date" value={payDate} onChange={event=>setPayDate(event.target.value)}/></label>
        <button type="button" disabled={!writeEnabled} onClick={createDraft}>Calculate draft</button>
      </div>
      <p className="prototype-note">Bonus payroll, pay-group setup, withholding, controlled release, payment evidence, liabilities, and corrections remain operational in the existing engine.</p>
      <button type="button" disabled={!writeEnabled} onClick={()=>navigateToRoute("/people/payroll/workflow")}>Open full payroll processing &amp; settings</button>
      {!writeEnabled&&<p className="prototype-note">Connected environments are read-only in this redesign prototype. Use isolated local demo mode for payroll write testing.</p>}
    </section>}
    <section className="prototype-panel">
      <h2>{admin?"2. Pay-run register":"Pay history"}</h2>
      <div className="prototype-controls">
        <label className="prototype-search"><input aria-label="Search payroll runs" placeholder="Search periods, run ID or status" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <label>Status <select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All</option>{(["Draft","Approved","Released","Voided"] as const).map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Sort <select value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="payDate">Pay date</option><option value="periodStart">Period start</option><option value="status">Status</option><option value="kind">Run type</option></select></label>
        <button type="button" onClick={()=>setDescending(v=>!v)}>{descending?"Newest first":"Oldest first"}</button>
        <button type="button" disabled={!visibleRuns.length} onClick={()=>exportRun()}><Download size={14}/> Export visible CSV</button>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Run / select</th><th>Payday</th><th>Period</th><th>Type</th><th>Status</th><th>{admin?"Employees":"My net"}</th></tr></thead><tbody>
        {visibleRuns.map(run=><tr key={run.id}><td><button type="button" className="prototype-link" aria-pressed={selected?.id===run.id} onClick={()=>setSelectedId(run.id)}>{run.id}</button></td><td>{run.payDate}</td><td>{run.periodStart} to {run.periodEnd}</td><td>{run.kind}</td><td>{run.status}</td><td>{admin?run.lines.length:money(sum(run.lines.filter(line=>line.employeeId===ownId).map(line=>line.netPay)))}</td></tr>)}
      </tbody></table></div>
      {!visibleRuns.length&&<p className="prototype-note">No matching pay runs have been recorded. A blank register does not imply pay has been processed.</p>}
    </section>
    {selected&&<section className="prototype-panel">
      <h2>3. Review {selected.id} · {selected.status}</h2>
      <div className="prototype-domain-statbar">
        <article><small>Gross wages / earnings</small><strong>{money(sum(lines.map(line=>line.grossPay)))}</strong></article>
        <article><small>Employee taxes</small><strong>{money(sum(lines.map(line=>line.employeeTaxes)))}</strong></article>
        <article><small>Benefits / deductions</small><strong>{money(sum(lines.map(line=>line.benefitDeduction+line.postTaxDeduction)))}</strong></article>
        <article><small>Calculated net</small><strong>{money(sum(lines.map(line=>line.netPay)))}</strong></article>
      </div>
      {admin&&issues.length>0&&<div role="alert" className="prototype-empty"><strong>Source-control issues: approval blocked.</strong>{issues.map((issue,index)=><p key={index}>{issue.detail}</p>)}</div>}
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Regular hrs</th><th>Overtime hrs</th><th>Gross</th><th>Benefits</th><th>Taxes</th><th>Net</th></tr></thead><tbody>
        {lines.map(line=><tr key={line.employeeId}><td>{admin?employeeName(line.employeeId):"My earnings"}</td><td>{line.regularHours.toFixed(2)}</td><td>{line.overtimeHours.toFixed(2)}</td><td>{money(line.grossPay)}</td><td>{money(line.benefitDeduction)}</td><td>{money(line.employeeTaxes)}</td><td>{money(line.netPay)}</td></tr>)}
      </tbody></table></div>
      <div className="prototype-controls">
        <button type="button" onClick={()=>exportRun([selected.id])}><Download size={14}/> Download pay-run CSV</button>
        {admin&&selected.status==="Draft"&&<button type="button" disabled={issues.length>0||!writeEnabled} onClick={approve}>Approve reviewed draft</button>}
      </div>
      <p className="prototype-note">Amounts follow the configured internal calculation rules, which are not a substitute for verified US payroll tax tables, filings or external disbursement confirmation. An approved/released run is not a settled payment.</p>
    </section>}
    {admin&&<section className="prototype-panel"><h2>4. Settlement &amp; liabilities</h2><p>Recorded disbursement states: {payroll.disbursements.filter(row=>row.status==="Released").length} released, {payroll.disbursements.filter(row=>row.status==="Settled").length} settled, {payroll.disbursements.filter(row=>row.status==="Failed").length} failed. Open the controlled payroll workflow to reconcile payment references, record failures and review tax liabilities.</p><button type="button" disabled={!writeEnabled} onClick={()=>navigateToRoute("/people/payroll/workflow")}>Review settlement records</button></section>}
    {notice&&<p className="prototype-note" role="status">{notice}</p>}
    {error&&<p role="alert" className="prototype-note">{error}</p>}
  </div>;
}
