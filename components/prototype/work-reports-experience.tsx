"use client";
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {usePerformance} from "../../lib/performance-context";
import {reportVisibleTo,weeklyReportingObligations} from "../../lib/performance-engine";
import {arizonaDateKey} from "../../lib/date-time";
import {ReportingCenter} from "../performance/reporting-center";

export function WorkReportsExperience(){
 const {data,currentUser}=useWorkspace();
 const {performance}=usePerformance();
 const [tab,setTab]=useState<"overview"|"editor">("overview");
 const [query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[owner,setOwner]=useState("all");
 if(!currentUser||currentUser.role==="Customer")
  return <div className="prototype-empty">Employee reporting access required.</div>;
 const visible=performance.reports.filter(report=>reportVisibleTo(currentUser,report,data));
 const my=visible.filter(r=>r.userId===currentUser.id);
 const waiting=visible.filter(r=>r.status==="Submitted"&&r.userId!==currentUser.id);
 const due=weeklyReportingObligations(performance,currentUser.id,arizonaDateKey());
 const users=[...new Set(visible.map(r=>r.userId))].map(id=>({id,name:data.users.find(u=>u.id===id)?.name??"Unlinked employee"}))
   .sort((a,b)=>a.name.localeCompare(b.name));
 const rows=visible.filter(r=>(filter==="all"||r.status===filter)&&
   (owner==="all"||r.userId===owner)&&
   [r.type,r.summary,r.status,data.users.find(u=>u.id===r.userId)?.name??""].join(" ").toLowerCase().includes(query.toLowerCase()))
   .sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||a.id.localeCompare(b.id));
 const open=(id?:string)=>{
   if(id&&typeof window!=="undefined")window.sessionStorage.setItem("momentum-focus-record",id);
   setTab("editor");
 };
 return <div className="prototype-domain prototype-domain--performance">
  <header className="prototype-heading"><h1>Work Reports</h1>
   <p>Submit daily work, prepare weekly progress, and review team reports in a compact source-linked workspace. Report metrics are not automatically proof of cash collection.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>My submitted reports</small><strong>{my.length}</strong></article>
   <article><small>Team submissions awaiting review</small><strong>{waiting.length}</strong></article>
   <article><small>My unsubmitted weekly periods</small><strong>{due.length}</strong></article>
  </div>
  <nav className="prototype-tabs" aria-label="Work reporting views">
   <button type="button" className={tab==="overview"?"is-active":""} aria-current={tab==="overview"?"page":undefined} onClick={()=>setTab("overview")}>Report overview</button>
   <button type="button" className={tab==="editor"?"is-active":""} aria-current={tab==="editor"?"page":undefined} onClick={()=>setTab("editor")}>Submit & review reports</button>
  </nav>
  {tab==="overview"?<section className="prototype-panel">
    <div className="prototype-controls"><button type="button" className="prototype-primary-action" onClick={()=>open()}>Create or submit work report</button>
     <label>Find reports <input type="search" aria-label="Search work reports" value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <label>Status <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All states</option><option>Submitted</option><option>Reviewed</option></select></label>
     <label>Employee <select value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">All visible staff</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    </div>
    {due.length>0&&<p role="status" className="prototype-note">You have {due.length} weekly reporting period(s) without a submitted report. Open the reporting workflow to submit; a draft does not satisfy the weekly requirement.</p>}
    <div className="prototype-table-scroll"><table className="prototype-table">
     <thead><tr><th>Submitted</th><th>Employee</th><th>Report</th><th>Work period</th><th>Status</th><th>Open</th></tr></thead>
     <tbody>{rows.map(r=><tr key={r.id}>
       <td>{r.submittedAt.slice(0,10)}</td><td>{data.users.find(u=>u.id===r.userId)?.name??"Unlinked employee"}</td>
       <td><strong>{r.type}</strong><div className="prototype-small">{r.summary.slice(0,130)||"No summary recorded"}</div></td>
       <td>{r.type==="Daily"?r.workDate:r.weekStart+" to "+r.weekEnd}</td><td>{r.status}</td>
       <td><button type="button" className="prototype-link" onClick={()=>open(r.id)}>Review report</button></td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length&&<p className="prototype-note">No recorded reports match your filters. Use the submission workflow for a new report.</p>}
   </section>:<section className="prototype-panel"><div className="prototype-controls">
     <button type="button" onClick={()=>setTab("overview")}>Back to report overview</button></div>
     <ReportingCenter/>
   </section>}
 </div>;
}
