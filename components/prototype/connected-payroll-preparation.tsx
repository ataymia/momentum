"use client";
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {usePayroll} from "../../lib/payroll-context";
import {usePeriodLocks} from "../../lib/period-lock-context";
import {preparePayrollSources} from "../../lib/payroll-preparation";
import {downloadCsv} from "../../lib/browser-export";

export function ConnectedPayrollPreparation(){
 const {data,currentUser}=useWorkspace(),{hcm}=useHcm(),{payroll}=usePayroll(),locks=usePeriodLocks();
 const [start,setStart]=useState(""),[end,setEnd]=useState(""),[payDate,setPayDate]=useState(""),[requested,setRequested]=useState(false),[error,setError]=useState("");
 const [selection,setSelection]=useState<{start:string;end:string;payDate:string}|null>(null);
 if(currentUser?.role!=="Administrator")return null;
 const locked=selection&&(locks.isRangeLocked("Payroll",selection.start,selection.end)||locks.isLocked("Payroll",selection.payDate));
 const records=selection&&!locked?preparePayrollSources(payroll,data,hcm,selection.start,selection.end,selection.payDate):[];
 const columns=["employeeId","employee","periodStart","periodEnd","payDate","taxRoute","approvedTimecards","hours","preliminaryGross","status"] as const;
 const clear=()=>{setRequested(false);setSelection(null);setError("");};
 return <section className="prototype-panel"><h2>Prepare external payroll worksheet</h2>
 <p>Review approved, unconsumed timecards and existing compensation setup. This worksheet does not create a pay run, consume timecards, certify tax withholding or initiate payment. W-2 and contractor sources remain separate.</p>
 <form className="prototype-controls" onSubmit={e=>{e.preventDefault();setError("");try{preparePayrollSources(payroll,data,hcm,start,end,payDate);setSelection({start,end,payDate});setRequested(true);}catch(err){setError(err instanceof Error?err.message:String(err));}}}>
 <label>Period begins <input type="date" required value={start} onChange={e=>{clear();setStart(e.target.value);}}/></label>
 <label>Period ends <input type="date" required value={end} onChange={e=>{clear();setEnd(e.target.value);}}/></label>
 <label>Payday <input type="date" required value={payDate} onChange={e=>{clear();setPayDate(e.target.value);}}/></label>
 <button type="submit">Prepare payroll worksheet</button></form>
 {error&&<p role="alert">{error}</p>}{locked&&<p role="alert">This period or payday is locked. No worksheet is released.</p>}
 {requested&&!locked&&<><p role="status">{records.length} employee source records. Gross estimates are preliminary and exclude separately reviewed bonuses and other adjustments.</p><button type="button" disabled={!records.length} onClick={()=>downloadCsv("momentum-payroll-preparation-not-a-payrun.csv",records,columns)}>Export preparation CSV</button>
 <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Classification route</th><th>Approved timecards</th><th>Hours</th><th>Preliminary gross</th><th>Review outcome</th></tr></thead><tbody>{records.map(r=><tr key={r.employeeId}><td>{r.employee}</td><td>{r.taxRoute}</td><td>{r.approvedTimecards}</td><td>{r.hours===null?"Unconfirmed":r.hours.toFixed(2)}</td><td>{r.preliminaryGross===null?"Not calculated":r.preliminaryGross.toFixed(2)}</td><td>{r.status}</td></tr>)}</tbody></table></div>
 {!records.length&&<p>No approved, unconsumed timecards match the period.</p>}</>}</section>;
}
