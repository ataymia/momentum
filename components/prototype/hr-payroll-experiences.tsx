"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, ClipboardList, GraduationCap, Search, ShieldCheck, Users } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { useHcm } from "../../lib/hcm-context";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { hrWorkspaceOverview } from "../../lib/hr-workspace-overview";
import { usePayroll } from "../../lib/payroll-context";
import { navigateToRoute } from "../../lib/navigation-store";
import { formatMoney } from "../ui";

const title=(h:string,sub:string)=><header className="prototype-heading"><h1>{h}</h1><p>{sub}</p></header>;
function Pane({label,children}:{label:string;children:React.ReactNode}){
  return <section className="prototype-panel"><h2>{label}</h2>{children}</section>;
}
function NavTile({label,path,detail}:{label:string;path:string;detail:string}){
  return <button type="button" className="prototype-domain-card" onClick={()=>navigateToRoute(path)}>
    <strong>{label}</strong><span>{detail}</span><span aria-hidden="true">Open ›</span>
  </button>;
}

export function PeopleExperience(){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const firebase=useFirebaseSessionOptional();
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<"name"|"department"|"status">("name");
  const [descending,setDescending]=useState(false);
  const overview=hrWorkspaceOverview({
    viewer:currentUser,users:data.users,hcm,timecards:scope.timecards,
    accessRecords:firebase?.accessRecords,
  });
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Not authorized.</div>;
  const admin=currentUser.role==="Administrator";
  const people=overview.visibleEmployees
    .map(user=>({user,employment:hcm.employees.find(e=>e.userId===user.id)}))
    .filter(row=>[row.user.name,row.user.title,row.user.team,row.employment?.status].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const va=sort==="name"?a.user.name:sort==="department"?a.user.team:(a.employment?.status??"");
      const vb=sort==="name"?b.user.name:sort==="department"?b.user.team:(b.employment?.status??"");
      return va.localeCompare(vb)*(descending?-1:1);
    });
  return <div className="prototype-domain prototype-domain--people">
    {title(admin?"Human Resources":"My Employee Workspace",admin?"Personnel directory, onboarding, requests and review queues.":"Only your own employee records and assigned actions.")}
    <div className="prototype-domain-statbar">
      <article><Users size={18}/><small>{admin?"Active directory":"My profile"}</small><strong>{overview.visibleEmployees.length}</strong></article>
      <article><CalendarDays size={18}/><small>Submitted leave</small><strong>{overview.submittedLeave}</strong></article>
      <article><GraduationCap size={18}/><small>Incomplete training</small><strong>{overview.incompleteTraining}</strong></article>
      <article><ClipboardList size={18}/><small>Submitted timecards</small><strong>{overview.submittedTimecards}</strong></article>
    </div>
    <div className="prototype-domain-cards">
      <NavTile label="Employee Directory" path="/people/directory" detail={admin?"Active staff and reporting lines":"Authorized directory access"}/>
      {admin&&<NavTile label="Employee Profiles" path="/admin/employee-profiles" detail="Restricted personnel files and reviews"/>}
      {admin&&<NavTile label="Onboarding Queue" path="/people/onboarding" detail="Open cases and new-hire requirements"/>}
      {admin&&<NavTile label="Training Administration" path="/people/training" detail="Course and assignment controls"/>}
      {!admin&&<NavTile label="My Time & Leave" path="/people/timekeeping" detail="Timecards, requests and self-service"/>}
    </div>
    {admin&&<Pane label="HR action queues">
      <div className="prototype-domain-cards">
        <NavTile label={`Open onboarding cases · ${overview.openOnboarding}`} path="/people/onboarding" detail="Existing onboarding case records"/>
        <NavTile label={`Profile changes · ${overview.pendingProfileChanges}`} path="/admin/employee-profiles" detail="Submitted employee change requests"/>
        <NavTile label={`Workflow requests · ${overview.pendingWorkflows}`} path="/admin/employee-profiles" detail="Submitted personnel workflows"/>
        <NavTile label={`Performance reviews · ${overview.performanceForReview}`} path="/admin/employee-profiles" detail="Employee-submitted reviews"/>
        <NavTile label={`Document attention · ${overview.documentsNeedingAttention}`} path="/admin/employee-profiles" detail="Missing or acknowledgment-required records, not verified compliance"/>
      </div>
    </Pane>}
    <Pane label={admin?"Active employee register":"My employee profile"}>
      <div className="prototype-controls">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search employees" placeholder="Find employee or department" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="prototype-controls-right">
          <label>Sort by <select aria-label="Sort HR staff" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="name">Name</option><option value="department">Department</option><option value="status">Employment status</option></select></label>
          <button type="button" onClick={()=>setDescending(d=>!d)}><ArrowDownUp size={15}/>{descending?"Descending":"Ascending"}</button>
        </div>
      </div>
      <div className="prototype-people-grid">{people.map(({user,employment})=><article key={user.id} className="prototype-employee-card">
        <div className="prototype-employee-avatar" aria-hidden="true">{user.initials}</div>
        <div><strong>{user.name}</strong><span>{employment?.jobTitle??user.title}</span><small>{user.team} · {employment?.status==="Separated"?"HR status requires review":employment?.status??"Not configured"}</small></div>
      </article>)}</div>
      {!people.length&&<div className="prototype-empty">No matching active employee records.</div>}
    </Pane>
    <Pane label="My assigned HR actions">
      {overview.assignedTasks.length?overview.assignedTasks.slice(0,8).map(task=><div className="prototype-work-list" key={task.id}>
        <strong>{task.title}</strong><span>{task.dueDate?"Due "+task.dueDate:"No due date"} · {task.status}</span>
      </div>):<p className="prototype-note">No open HR tasks assigned to you.</p>}
    </Pane>
    <p className="prototype-note"><ShieldCheck size={14}/> Review-only overview. Missing forms do not suspend employment. Compensation, private documents and changes remain governed by existing server authorization; this view does not execute them.</p>
  </div>;
}

export function PayrollExperience(){
  const {currentUser}=useWorkspace();
  const {payroll}=usePayroll();
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<"payDate"|"periodStart"|"status"|"kind">("payDate");
  const [descending,setDescending]=useState(true);
  const admin=currentUser?.role==="Administrator";
  const ownId=currentUser?.id??"";
  const rows=useMemo(()=>payroll.runs.filter(r=>admin||r.lines.some(line=>line.employeeId===ownId))
    .filter(r=>[r.kind,r.status,r.payDate,r.periodStart,r.periodEnd].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>String(a[sort]).localeCompare(String(b[sort]))*(descending?-1:1)),
    [payroll.runs,admin,ownId,query,sort,descending]);
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Not authorized.</div>;
  return <div className="prototype-domain prototype-domain--payroll">
    {title(admin?"Payroll":"My Pay History",admin?"Pay-run review, payroll exceptions and settlement workflow.":"Only recorded earnings belonging to your identity.")}
    <div className="prototype-domain-statbar">
      <article><ClipboardList size={18}/><small>Visible pay runs</small><strong>{rows.length}</strong></article>
      {admin&&<article><CalendarDays size={18}/><small>Draft pay runs</small><strong>{payroll.runs.filter(r=>r.status==="Draft").length}</strong></article>}
      {admin&&<article><Users size={18}/><small>Active pay groups</small><strong>{payroll.payGroups.filter(r=>r.active).length}</strong></article>}
    </div>
    <Pane label={admin?"Pay-run register":"My recorded pay"}>
      <div className="prototype-controls">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search pay runs" placeholder="Search period, date or status" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="prototype-controls-right">
          <label>Sort by <select aria-label="Sort payroll runs" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="payDate">Pay date</option><option value="periodStart">Period start</option><option value="status">Status</option><option value="kind">Run type</option></select></label>
          <button type="button" onClick={()=>setDescending(d=>!d)}><ArrowDownUp size={15}/>{descending?"Descending":"Ascending"}</button>
        </div>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Pay date</th><th>Period</th><th>Run type</th><th>Status</th><th>{admin?"Employees":"My net pay"}</th></tr></thead>
        <tbody>{rows.map(r=><tr key={r.id}><td>{r.payDate}</td><td>{r.periodStart} to {r.periodEnd}</td><td>{r.kind}</td><td>{r.status}</td><td>{admin?r.lines.length:formatMoney(r.lines.find(l=>l.employeeId===ownId)?.netPay??0)}</td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<div className="prototype-empty">No matching recorded payroll runs. No projected pay or tax amounts are created.</div>}
    </Pane>
    {admin&&<div className="prototype-domain-cards">
      <div className="prototype-domain-card prototype-domain-card--static"><strong>Payroll setup</strong><span>Pay groups, verified tax settings, earnings and method settings</span><span>Existing controls retained</span></div>
      <div className="prototype-domain-card prototype-domain-card--static"><strong>Review and release</strong><span>Timecards, commissions, exceptions, approval, release and settlement</span><span>Pending workflow migration</span></div>
      <div className="prototype-domain-card prototype-domain-card--static"><strong>Corrections</strong><span>Void and reissue, liability register and payment failures</span><span>Requires audited permissions</span></div>
    </div>}
    <p className="prototype-note"><ShieldCheck size={14}/> Preview only. A released pay run does not prove funds settled. No payroll calculations, filings or payments execute from this screen.</p>
  </div>;
}
