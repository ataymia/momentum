"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, ClipboardList, GraduationCap, Search, ShieldCheck, Users } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { useHcm } from "../../lib/hcm-context";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { hrWorkspaceOverview } from "../../lib/hr-workspace-overview";
import { hrEmployeeDetail, hrOnboardingCaseDetail, hrOnboardingQueue } from "../../lib/hr-employee-detail";
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
      <NavTile label="My Employee Profile" path="/people/me" detail="My onboarding, training, time, requests and documents"/>
      <NavTile label={admin?"HR Request Reviews":"My HR Requests"} path="/people/requests" detail="Open recorded leave and personnel requests with scoped review details"/>
      {admin&&<NavTile label="Employee Profiles" path="/admin/employee-profiles" detail="Restricted personnel files and reviews"/>}
      {admin&&<NavTile label="Onboarding Queue" path="/people/onboarding" detail="Existing onboarding administration"/>}
      {admin&&<NavTile label="Checklist Review" path="/people/onboarding/review" detail="Read-only open cases and task status"/>}
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
        <div><strong>{user.name}</strong><span>{employment?.jobTitle??user.title}</span><small>{user.team} · {employment?.status==="Separated"?"HR status requires review":employment?.status??"Not configured"}</small><button type="button" className="prototype-link" onClick={()=>navigateToRoute(admin?"/people/employees/"+encodeURIComponent(user.id):"/people/me")}>Open profile ›</button></div>
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


/** Detail views deliberately expose only sanitized metadata, never HCM raw objects. */
export function PeopleEmployeeDetail({employeeId}:{employeeId:string}){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const firebase=useFirebaseSessionOptional();
  const detail=hrEmployeeDetail({
    employeeId,viewer:currentUser,users:data.users,hcm,timecards:scope.timecards,
    accessRecords:firebase?.accessRecords,
  });
  if(!detail)return <div className="prototype-empty">Employee profile unavailable or not authorized.</div>;
  const {employee,employment}=detail;
  return <div className="prototype-domain prototype-domain--people">
    <button type="button" className="prototype-back" onClick={()=>navigateToRoute("/people")}>← Back to Human Resources</button>
    {title(employee.name+" · Employee profile","Read-only HR record sections. Only the Administrator can review another employee's profile.")}
    <div className="prototype-columns">
      <Pane label="Employment record"><dl className="prototype-facts">
        <div><dt>Work email</dt><dd>{employee.email}</dd></div>
        <div><dt>Role / department</dt><dd>{employment?.jobTitle??employee.title} · {employment?.department??employee.team}</dd></div>
        <div><dt>Employee number</dt><dd>{employment?.employeeNumber??"Not configured"}</dd></div>
        <div><dt>HR record status</dt><dd>{employment?.status??"Not configured"}</dd></div>
        <div><dt>Location</dt><dd>{employment?.location??"Not configured"}</dd></div>
        <div><dt>Worker classification</dt><dd>{employment?.classification??"Not configured"}</dd></div>
        <div><dt>Hire date</dt><dd>{employment?.hireDate??"Not recorded"}</dd></div>
      </dl></Pane>
      <Pane label="Onboarding checklists">
        {detail.onboarding.map(item=><div className="prototype-work-list" key={item.id}>
          <strong>{item.effectiveDate} · {item.status}</strong>
          {item.tasks.map(task=><span key={task.id}>{task.title} · {task.status}{task.dueDate?" · Due "+task.dueDate:""}</span>)}
          {!item.tasks.length&&<span>No recorded checklist tasks.</span>}
        </div>)}
        {!detail.onboarding.length&&<p className="prototype-note">No onboarding case recorded for this employee. This does not establish compliance.</p>}
      </Pane>
    </div>
    <div className="prototype-columns">
      <Pane label="Attendance & timecards">
        {detail.timecards.map(card=><div className="prototype-work-list" key={card.id}><strong>{card.weekStart} to {card.weekEnd}</strong><span>{card.status}</span></div>)}
        {!detail.timecards.length&&<p className="prototype-note">No recorded timecards.</p>}
      </Pane>
      <Pane label="Leave & requests">
        {detail.leave.map(item=><div className="prototype-work-list" key={item.id}><strong>{item.startDate} to {item.endDate}</strong><span>{item.requestedHours} hours · {item.status}</span></div>)}
        {detail.requests.map(item=><div className="prototype-work-list" key={item.id}><strong>{item.title}</strong><span>{item.status}</span></div>)}
        {!detail.leave.length&&!detail.requests.length&&<p className="prototype-note">No recorded leave or workflow requests.</p>}
      </Pane>
      <Pane label="Training">
        {detail.training.map(item=><div className="prototype-work-list" key={item.id}><strong>{item.title}</strong><span>{item.status}{item.dueDate?" · Due "+item.dueDate:""}</span></div>)}
        {!detail.training.length&&<p className="prototype-note">No recorded training assignments.</p>}
      </Pane>
      <Pane label="Document status">
        {detail.documents.map(item=><div className="prototype-work-list" key={item.id}><strong>{item.title}</strong><span>{item.category} · Version {item.version} · {item.status}</span></div>)}
        {!detail.documents.length&&<p className="prototype-note">No document metadata recorded.</p>}
      </Pane>
      <Pane label="Performance review status">
        {detail.reviews.map(item=><div className="prototype-work-list" key={item.id}><strong>Review</strong><span>{item.status}</span></div>)}
        {!detail.reviews.length&&<p className="prototype-note">No review cycle assigned.</p>}
      </Pane>
    </div>
    <p className="prototype-note"><ShieldCheck size={14}/> Read-only prototype. Document statuses are not proof of completed I-9, tax forms or signatures. No compensation, private contacts, review narratives, evidence text or files are exposed here.</p>
  </div>;
}

export function PeopleOnboardingReview(){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const firebase=useFirebaseSessionOptional();
  const cases=hrOnboardingQueue({
    viewer:currentUser,users:data.users,hcm,timecards:scope.timecards,
    accessRecords:firebase?.accessRecords,
  });
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Not authorized.</div>;
  return <div className="prototype-domain prototype-domain--people">
    <button type="button" className="prototype-back" onClick={()=>navigateToRoute("/people")}>← Back to Human Resources</button>
    {title("Onboarding checklist review","Open recorded onboarding cases. Candidate details and restricted evidence remain in existing administrative controls.")}
    <Pane label="Open cases">
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Effective date</th><th>Case</th><th>Tasks</th><th>Status</th></tr></thead>
        <tbody>{cases.map(item=><tr key={item.id}>
          <td>{item.effectiveDate}</td>
          <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/people/onboarding/cases/"+encodeURIComponent(item.id))}>Open checklist ›</button></td>
          <td>{item.tasks.filter(task=>task.status==="Complete").length} of {item.tasks.length} recorded complete</td>
          <td>{item.status}</td>
        </tr>)}</tbody>
      </table></div>
      {!cases.length&&<p className="prototype-note">No accessible open onboarding cases.</p>}
    </Pane>
    <p className="prototype-note">Task completion is not a legal verification, signature or authorization to activate or deactivate a user.</p>
  </div>;
}

export function PeopleOnboardingCase({caseId}:{caseId:string}){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const firebase=useFirebaseSessionOptional();
  const item=hrOnboardingCaseDetail({
    caseId,viewer:currentUser,users:data.users,hcm,timecards:scope.timecards,
    accessRecords:firebase?.accessRecords,
  });
  if(!item)return <div className="prototype-empty">Onboarding case unavailable or not authorized.</div>;
  return <div className="prototype-domain prototype-domain--people">
    <button type="button" className="prototype-back" onClick={()=>navigateToRoute("/people/onboarding/review")}>← Back to onboarding review</button>
    {title("Onboarding checklist","Recorded tasks and due dates, without confidential evidence or applicant details.")}
    <Pane label={"Effective "+item.effectiveDate+" · "+item.status}>
      {item.tasks.map(task=><div className="prototype-work-list" key={task.id}>
        <strong>{task.title}</strong><span>{task.status}{task.dueDate?" · Due "+task.dueDate:""}</span>
      </div>)}
      {!item.tasks.length&&<p className="prototype-note">No checklist tasks recorded.</p>}
    </Pane>
    <p className="prototype-note">Read-only. Existing administrative onboarding workflows remain the authority for task changes. No employee access state is modified.</p>
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
