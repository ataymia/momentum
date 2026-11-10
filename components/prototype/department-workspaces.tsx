"use client";

/** Consolidated department workspaces preserve source workflows rather than
 * replacing accounting, training or data exchange with attractive no-op buttons.
 * Every display count is limited to authorized loaded records.
 */
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
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
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Administrator accounting access required.</div>;
 return <div className="prototype-domain prototype-domain--finance">
  <header className="prototype-heading"><h1>Accounting & Reconciliation</h1>
   <p>Existing journal, chart-of-accounts, rule and reconciliation workflows remain in place. Source postings and bank/provider evidence are separate requirements.</p></header>
  <div className="prototype-controls">
   <button type="button" onClick={()=>navigateToRoute("/finance")}>Finance Overview</button>
   <button type="button" onClick={()=>navigateToRoute("/sales/invoices")}>Invoice register</button>
   <button type="button" onClick={()=>navigateToRoute("/sales/payments")}>Payment register</button>
  </div>
  <p className="prototype-note">Posted journal entries are accounting records. They do not independently verify an external bank deposit, refund transfer, or processor settlement.</p>
  <AccountingWorkspacePage/>
 </div>;
}
