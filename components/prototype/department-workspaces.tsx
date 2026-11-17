"use client";

/** Consolidated department workspaces preserve source workflows rather than
 * replacing accounting, training or data exchange with attractive no-op buttons.
 * Every display count is limited to authorized loaded records.
 */
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {useAccounting} from "../../lib/accounting-context";
import {unprocessedSourceEvents} from "../../lib/accounting-engine";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";

import {arizonaDateKey} from "../../lib/date-time";
import {navigateToRoute} from "../../lib/navigation-store";
import {TrainingAdminPage} from "../hcm/training-admin";
import {WorkforceLivePage} from "../pages/workforce-live";
import {AccountingWorkspacePage,DataExchangePage} from "../pages/focused-workspace-pages";

export function TrainingWorkspaceExperience(){
 const {data,currentUser}=useWorkspace(),{hcm}=useHcm();
 const [tab,setTab]=useState<"review"|"courses">("review"),[query,setQuery]=useState("");
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Training administration requires Administrator access.</div>;
 const now=arizonaDateKey();
 const records=hcm.training.map(a=>({assignment:a,employee:data.users.find(u=>u.id===a.userId),
  course:hcm.courses.find(c=>c.id===a.courseId)}));
 const outstanding=records.filter(x=>x.assignment.status!=="Complete");
 const overdue=outstanding.filter(x=>x.assignment.dueDate&&x.assignment.dueDate<now);
 const rows=records.filter(x=>[x.employee?.name,x.course?.title,x.assignment.status].join(" ").toLowerCase().includes(query.toLowerCase()))
  .sort((a,b)=>(a.assignment.dueDate??"9999-12-31").localeCompare(b.assignment.dueDate??"9999-12-31")||a.assignment.id.localeCompare(b.assignment.id));
 return <div className="prototype-domain prototype-domain--people">
  <header className="prototype-heading"><h1>Training & Development</h1>
    <p>Assigned learning, due dates, course materials and administrator training controls. Employee completion status comes from the existing HCM register.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>Active courses</small><strong>{hcm.courses.filter(c=>c.active).length}</strong></article>
   <article><small>Assignments still open</small><strong>{outstanding.length}</strong></article>
   <article><small>Open past due</small><strong>{overdue.length}</strong></article>
  </div>
  <nav className="prototype-tabs" aria-label="Training workstreams">
   <button type="button" className={tab==="review"?"is-active":""} aria-current={tab==="review"?"page":undefined} onClick={()=>setTab("review")}>Assignment review</button>
   <button type="button" className={tab==="courses"?"is-active":""} aria-current={tab==="courses"?"page":undefined} onClick={()=>setTab("courses")}>Course & material administration</button>
  </nav>
  {tab==="courses"?<TrainingAdminPage/>:<section className="prototype-panel">
    <div className="prototype-controls"><label>Search assigned learning <input type="search" aria-label="Search training assignments" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, course or status"/></label></div>
    <div className="prototype-table-scroll"><table className="prototype-table">
     <thead><tr><th>Employee</th><th>Course</th><th>Status</th><th>Due</th><th>Follow-up</th></tr></thead>
     <tbody>{rows.map(({assignment,employee,course})=><tr key={assignment.id}>
      <td>{employee?.name??"Unlinked employee ID: "+assignment.userId}</td>
      <td>{course?.title??"Unlinked course ID: "+assignment.courseId}</td>
      <td>{assignment.status}</td><td>{assignment.dueDate??"Not assigned"}</td>
      <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/admin/employee-profiles/"+encodeURIComponent(assignment.userId)+"/training")}>Review employee training</button></td>
     </tr>)}</tbody></table></div>
     {!rows.length&&<p className="prototype-note">No training assignments match this filter. An empty register does not prove everyone completed required training.</p>}
  </section>}
 </div>;
}

export function WorkforceWorkspaceExperience(){
 const {currentUser,data}=useWorkspace();
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator workforce access required.</div>;
 const today=arizonaDateKey();
 const recorded=data.timeEntries.filter(entry=>entry.date===today);
 return <div className="prototype-domain prototype-domain--people">
  <header className="prototype-heading"><h1>Workforce Live</h1>
   <p>Recorded attendance and field-tracking sources, not an invented employee-location heartbeat or payroll approval.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>Loaded time entries today</small><strong>{recorded.length}</strong></article>
   <article><small>Entries without clock-out</small><strong>{recorded.filter(entry=>!entry.clockOut).length}</strong></article>
  </div>
  <div className="prototype-controls">
   <button type="button" onClick={()=>navigateToRoute("/people/attendance")}>Review attendance & timecards</button>
   <button type="button" onClick={()=>navigateToRoute("/admin/audit")}>Open audit evidence</button>
  </div>
  <WorkforceLivePage/>
 </div>;
}

export function DataExchangeWorkspaceExperience(){
 const {currentUser}=useWorkspace();
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator data-exchange access required.</div>;
 return <div className="prototype-domain">
  <header className="prototype-heading"><h1>Data Exchange & Import Controls</h1>
   <p>Review, import and export using the existing source-specific validation workflows. Account consolidation remains an independent review, not a bulk destructive merge.</p></header>
  <div className="prototype-controls"><button type="button" onClick={()=>navigateToRoute("/admin/accounts")}>Open Account Consolidation</button>
   <button type="button" onClick={()=>navigateToRoute("/admin/audit")}>Review audit history</button></div>
  <p className="prototype-note">A successful file parse is not proof of customer identity, payment settlement, compliance or a complete historical import. Review duplicates and references before committing changes.</p>
  <DataExchangePage/>
 </div>;
}

export function AccountingWorkspaceExperience(){
 const {currentUser}=useWorkspace();
 const {accounting,events}=useAccounting();
 const runtime=useRuntimeMode();
 const demo=runtime.isDemo&&momentumStorage.mode()==="local";
 const [tab,setTab]=useState<"review"|"controls">("review");
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("all");
 if(currentUser?.role!=="Administrator")
  return <div className="prototype-empty">Administrator accounting access required.</div>;
 const pending=unprocessedSourceEvents(accounting,events);
 const blocked=pending.filter(event=>Boolean(event.blockedReason));
 const journals=accounting.journals.filter(entry=>
  (status==="all"||entry.status===status)&&
  [entry.number,entry.memo,entry.sourceType,entry.sourceId].join(" ").toLowerCase().includes(search.toLowerCase()))
  .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id))
  .slice(0,100);
 const money=(amount:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount);
 return <div className="prototype-domain prototype-domain--finance">
  <header className="prototype-heading"><h1>Accounting & Reconciliation</h1>
   <p>Review the recorded chart of accounts, journals and reconciliation exceptions. Financial postings are not proof of an external bank deposit, card settlement or a completed refund.</p></header>
  <div className="prototype-domain-statbar">
    <article><small>Posted journals</small><strong>{accounting.journals.filter(j=>j.status==="Posted").length}</strong></article>
    <article><small>Draft journals</small><strong>{accounting.journals.filter(j=>j.status==="Draft").length}</strong></article>
    <article><small>Unprocessed source events</small><strong>{pending.length}</strong></article>
    <article><small>Blocked source events</small><strong>{blocked.length}</strong></article>
    <article><small>Open reconciliations</small><strong>{accounting.reconciliations.filter(r=>r.status==="Open").length}</strong></article>
  </div>
  <div className="prototype-controls">
   <button type="button" onClick={()=>navigateToRoute("/finance")}>Finance Overview</button>
   <button type="button" onClick={()=>navigateToRoute("/sales/invoices")}>Invoice register</button>
   <button type="button" onClick={()=>navigateToRoute("/sales/payments")}>Payment register</button>
   <button type="button" onClick={()=>navigateToRoute("/admin/audit")}>Audit Center</button>
  </div>
  {!demo&&<p className="prototype-note" role="status">Connected accounting is read-only until journal posting, approvals and reconciliation are handled by trusted server transactions with external settlement evidence. This screen never silently posts an entry from browser state.</p>}
  <nav className="prototype-tabs" aria-label="Accounting workspaces">
   <button type="button" className={tab==="review"?"is-active":""} aria-current={tab==="review"?"page":undefined} onClick={()=>setTab("review")}>Accounting overview</button>
   {demo&&<button type="button" className={tab==="controls"?"is-active":""} aria-current={tab==="controls"?"page":undefined} onClick={()=>setTab("controls")}>Journal and reconciliation controls</button>}
  </nav>
  {tab==="review"&&<>
   <section className="prototype-panel"><h2>Recorded journals</h2>
    <div className="prototype-controls">
     <label>Find journal <input type="search" aria-label="Find accounting journals" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Number, memo, event or source ID"/></label>
     <label>Status <select aria-label="Filter accounting journal status" value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="all">All statuses</option><option>Draft</option><option>Posted</option><option>Voided</option>
     </select></label>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
     <th>Journal</th><th>Posting date</th><th>Source</th><th>Memo</th><th>Total debits</th><th>Status</th>
    </tr></thead><tbody>{journals.map(entry=><tr key={entry.id}>
     <td>{entry.number}</td><td>{entry.date}</td><td>{entry.sourceType}</td><td>{entry.memo}</td>
     <td>{money(entry.lines.reduce((total,line)=>total+line.debit,0))}</td><td>{entry.status}</td>
    </tr>)}</tbody></table></div>
    {!journals.length&&<p className="prototype-note">No journals match these filters. A blank register does not establish that all financial source events were posted.</p>}
    {journals.length===100&&<p className="prototype-note">Only the first 100 sorted journals are displayed. Historical reconciliation requires the original ledger.</p>}
   </section>
   <section className="prototype-panel"><h2>Accounting exceptions & unposted sources</h2>
    <p className="prototype-note">These are source records that do not have a matching non-voided journal. Some are blocked by missing policy or incomplete provenance; do not auto-post.</p>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead>
     <tr><th>Event</th><th>Date</th><th>Source ID</th><th>Amount</th><th>Review state</th></tr></thead>
     <tbody>{pending.slice(0,100).map(event=><tr key={event.id}>
      <td>{event.type}</td><td>{event.date}</td><td>{event.sourceId}</td>
      <td>{event.amount===undefined?"Unverified":money(event.amount)}</td>
      <td>{event.blockedReason??"Requires accounting rule and source review"}</td>
     </tr>)}</tbody>
    </table></div>
    {!pending.length&&<p className="prototype-note">No unprocessed events were found in the loaded source snapshot. This is not a complete general-ledger reconciliation.</p>}
   </section>
   <section className="prototype-panel"><h2>Chart and reconciliations</h2>
    <p className="prototype-note">{accounting.accounts.filter(a=>a.active).length} active chart accounts · {accounting.rules.filter(r=>r.active).length} active source rules · {accounting.reconciliations.length} recorded reconciliations. These are configuration and book records, not external bank evidence.</p>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
     <th>Account</th><th>Type</th><th>State</th><th>Designated role</th></tr></thead>
     <tbody>{accounting.accounts.map(a=><tr key={a.id}>
      <td>{a.code} · {a.name}</td><td>{a.type}</td><td>{a.active?"Active":"Inactive"}</td><td>{a.systemRole??"No designated role"}</td>
     </tr>)}</tbody></table></div>
   </section>
  </>}
  {demo&&tab==="controls"&&<section className="prototype-panel">
    <p className="prototype-note">Local demonstration only. Journal posting, account setup and reconciliation below are not production financial actions.</p>
    <AccountingWorkspacePage/>
  </section>}
 </div>;
}
