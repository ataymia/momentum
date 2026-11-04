"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, ClipboardList, GraduationCap, Search, ShieldCheck, Users } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { useHcm } from "../../lib/hcm-context";
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
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<"name"|"department"|"status">("name");
  const [descending,setDescending]=useState(false);
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Not authorized.</div>;
  const admin=currentUser.role==="Administrator";
  const people=(admin?data.users.filter(u=>u.role!=="Customer"):data.users.filter(u=>u.id===currentUser.id))
    .map(user=>({user,employment:hcm.employees.find(e=>e.userId===user.id)}))
    .filter(row=>[row.user.name,row.user.title,row.user.team,row.employment?.status].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const va=sort==="name"?a.user.name:sort==="department"?a.user.team:(a.employment?.status??"");
      const vb=sort==="name"?b.user.name:sort==="department"?b.user.team:(b.employment?.status??"");
      return va.localeCompare(vb)*(descending?-1:1);
    });
  const leave=hcm.leaveRequests.filter(r=>admin||r.userId===currentUser.id);
  const training=hcm.training.filter(r=>admin||r.userId===currentUser.id);
  const requests=hcm.tasks.filter(r=>(admin||r.ownerId===currentUser.id)&&r.status==="Open");
  // Scope self-service summaries to the signed-in employee, not the whole workspace.
  const visibleTimecards=scope.timecards.filter(r=>admin||r.userId===currentUser.id);
  const pendingTimecards=visibleTimecards.filter(r=>r.status==="Submitted");
  return <div className="prototype-domain prototype-domain--people">
    {title(admin?"Human Resources":"My Employee Workspace",admin?"Personnel records, requests, attendance and learning.":"Authorized self-service information and tasks.")}
    <div className="prototype-domain-statbar">
      <article><Users size={18}/><small>Visible employees</small><strong>{people.length}</strong></article>
      <article><CalendarDays size={18}/><small>Leave awaiting review</small><strong>{leave.filter(r=>r.status==="Submitted").length}</strong></article>
      <article><GraduationCap size={18}/><small>Incomplete learning</small><strong>{training.filter(r=>r.status!=="Complete").length}</strong></article>
      <article><ClipboardList size={18}/><small>Pending timecards</small><strong>{pendingTimecards.length}</strong></article>
    </div>
    <div className="prototype-domain-cards">
      <NavTile label="Employee Directory" path="/people/directory" detail="Identity and reporting lines"/>
      {admin&&<NavTile label="Employee Profiles" path="/admin/employee-profiles" detail="Authorized personnel records"/>}
      {admin&&<NavTile label="Onboarding Queue" path="/people/onboarding" detail="New-hire requirements"/>}
      {admin&&<NavTile label="Training administration" path="/people/training" detail="Manage training and resources"/>}
      <NavTile label="Attendance & timecards" path="/people/timekeeping" detail="Recorded attendance and submitted time"/>
      <NavTile label="Time off & leave" path="/people/leave" detail="Submit requests and review balances"/>
    </div>
    <Pane label={admin?"Employee register":"My employee profile"}>
      <div className="prototype-controls">
        <label className="prototype-search"><Search size={16}/><input aria-label="Search employees" placeholder="Find employee or department" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <div className="prototype-controls-right">
          <label>Sort by <select aria-label="Sort HR staff" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="name">Name</option><option value="department">Department</option><option value="status">Employment status</option></select></label>
          <button type="button" onClick={()=>setDescending(d=>!d)}><ArrowDownUp size={15}/>{descending?"Descending":"Ascending"}</button>
        </div>
      </div>
      <div className="prototype-people-grid">{people.map(({user,employment})=><article key={user.id} className="prototype-employee-card">
        <div className="prototype-employee-avatar" aria-hidden="true">{user.initials}</div>
        <div><strong>{user.name}</strong><span>{employment?.jobTitle??user.title}</span><small>{user.team} · {employment?.status??"Not configured"}</small></div>
      </article>)}</div>
      {!people.length&&<div className="prototype-empty">No matching employee records.</div>}
    </Pane>
    <div className="prototype-domain-cards">
      <Pane label={admin?"Time-off review":"My time-off requests"}>
        <p className="prototype-note">Submitted requests are awaiting a decision. This preview does not approve leave.</p>
        {leave.length?leave.slice(0,6).map(request=><div className="prototype-work-list" key={request.id}>
          <strong>{request.status}</strong><span>{request.startDate} to {request.endDate}</span>
        </div>):<p className="prototype-note">No visible leave requests.</p>}
      </Pane>
      <Pane label={admin?"Learning assignments":"My training"}>
        {training.length?training.slice(0,6).map(item=><div className="prototype-work-list" key={item.id}>
          <strong>{hcm.courses.find(course=>course.id===item.courseId)?.title??"Training assignment"}</strong><span>{item.status}</span>
        </div>):<p className="prototype-note">No visible learning assignments.</p>}
        {admin&&<button type="button" onClick={()=>navigateToRoute("/people/training")}>Manage training</button>}
      </Pane>
    </div>
    <Pane label={admin?"Timecard review queue":"My submitted timecards"}>
      <p className="prototype-note">{pendingTimecards.length} submitted timecard{pendingTimecards.length===1?"":"s"} visible to this account. Timecard approval and payroll remain in their existing controlled workflows.</p>
      <button type="button" onClick={()=>navigateToRoute("/people/timekeeping")}>Open timecards</button>
    </Pane>
    <Pane label="Requests and next actions">
      {requests.length?requests.slice(0,8).map(task=><div className="prototype-work-list" key={task.id}>
        <strong>{task.title}</strong><span>{task.dueDate?"Due "+task.dueDate:"No due date"} · {task.status}</span>
      </div>):<p className="prototype-note">No open tasks visible to your account.</p>}
    </Pane>
    <p className="prototype-note"><ShieldCheck size={14}/> Preview only. Private documents, compensation and employee changes remain subject to existing authorization.</p>
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
