"use client";

import {BookOpen,CalendarDays,CheckCircle2,ChevronRight,Clock3,FileText,UserRound,WalletCards} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {usePayroll} from "../../lib/payroll-context";
import {navigateToRoute} from "../../lib/navigation-store";

type AccountSection="overview"|"employee"|"pay"|"training";
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const actions=[
  {path:"/my-account/employee",label:"My Employee Profile",description:"My work identity, employment record and document statuses",icon:UserRound},
  {path:"/my-account/time-off",label:"My Time Off",description:"Request leave and follow my requests",icon:CalendarDays},
  {path:"/my-account/pay",label:"My Pay History",description:"My pay-run entries and their recorded release status",icon:WalletCards},
  {path:"/my-account/training",label:"My Training",description:"Assigned courses and learning progress",icon:BookOpen},
  {path:"/my-account/completed",label:"Completed Work",description:"My recorded reviews and proof-linked deliveries",icon:CheckCircle2},
] as const;

/**
 * Personal employee account screens. No employeeId comes from the URL;
 * every record is filtered to the authenticated workspace user.
 * Server identity and data access policies remain the final authority.
 */
export function EmployeeAccountExperience({section="overview"}:{section?:AccountSection}){
  const {currentUser,data,scope}=useWorkspace();
  const {hcm}=useHcm();
  const {payroll}=usePayroll();
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee account access only.</div>;
  const employee=hcm.employees.find(item=>item.userId===currentUser.id);
  const documents=hcm.documents.filter(item=>item.userId===currentUser.id);
  const ownLeave=hcm.leaveRequests.filter(item=>item.userId===currentUser.id);
  const courses=hcm.training.filter(item=>item.userId===currentUser.id);
  const ownTimecards=scope.timecards.filter(item=>item.userId===currentUser.id);
  const payEntries=payroll.runs.flatMap(run=>run.lines.filter(line=>line.employeeId===currentUser.id)
    .map(line=>({id:run.id,period:run.periodStart+" to "+run.periodEnd,payDate:run.payDate,status:run.status,netPay:line.netPay,grossPay:line.grossPay,runKind:run.kind})))
    .sort((a,b)=>b.payDate.localeCompare(a.payDate)||a.id.localeCompare(b.id));
  const manager=data.users.find(item=>item.id===(employee?.managerId??currentUser.managerId));
  const availableDocuments=documents.filter(item=>item.status==="Available").length;
  const head=(title:string,description:string)=><header className="prototype-heading">
    <h1>{title}</h1><p>{description}</p>
  </header>;
  const tiles=<div className="prototype-domain-cards momentum-personal-account-links">
    {actions.map(item=><button type="button" key={item.path} className="prototype-domain-card momentum-personal-account-tile" onClick={()=>navigateToRoute(item.path)}>
      <item.icon size={19}/><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={16}/>
    </button>)}
  </div>;
  const back=<button type="button" className="prototype-back" onClick={()=>navigateToRoute("/my-account")}>Back to My Account</button>;
  if(section==="pay")return <div className="prototype-domain prototype-domain--people">
    {back}{head("My Pay History","Only pay-run entries assigned to your employee identity are displayed. A released pay run is not proof of bank settlement.")}
    <section className="prototype-panel"><h2>My recorded pay</h2>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Pay date</th><th>Pay period</th><th>Type</th><th>Status</th><th>Gross</th><th>Net</th></tr></thead>
        <tbody>{payEntries.map(item=><tr key={item.id}><td>{item.payDate}</td><td>{item.period}</td><td>{item.runKind}</td><td>{item.status}</td><td>{money(item.grossPay)}</td><td>{money(item.netPay)}</td></tr>)}</tbody>
      </table></div>
      {!payEntries.length&&<p className="prototype-empty">No pay-run entries are recorded for your employee account.</p>}
    </section>
  </div>;
  if(section==="training")return <div className="prototype-domain prototype-domain--people">
    {back}{head("My Training","Assigned learning and completion evidence for your own employee account.")}
    <section className="prototype-panel"><h2>Assigned learning</h2>
      {courses.map(item=><div className="prototype-work-list" key={item.id}>
        <strong>{hcm.courses.find(course=>course.id===item.courseId)?.title??"Training course"}</strong>
        <span>{item.status}{item.dueDate?" · Due "+item.dueDate:""}{item.completedAt?" · Completed "+item.completedAt.slice(0,10):""}</span>
      </div>)}
      {!courses.length&&<p className="prototype-empty">No training assignments are recorded for your account.</p>}
      <button type="button" onClick={()=>navigateToRoute("/people/materials")}>Open training resources</button>
    </section>
  </div>;
  if(section==="employee")return <div className="prototype-domain prototype-domain--people">
    {back}{head("My Employee Profile","Your own work identity, reporting line and recorded HR document statuses.")}
    <section className="prototype-panel"><h2>Employment details</h2>
      <dl className="momentum-personal-facts">
        <div><dt>Employee</dt><dd>{currentUser.name}</dd></div>
        <div><dt>Work email</dt><dd>{currentUser.email}</dd></div>
        <div><dt>Department</dt><dd>{employee?.department??currentUser.team}</dd></div>
        <div><dt>Position</dt><dd>{employee?.jobTitle??currentUser.title}</dd></div>
        <div><dt>Manager</dt><dd>{manager?.name??"Not recorded"}</dd></div>
        <div><dt>Employment status</dt><dd>{employee?.status??currentUser.employmentStatus??"Not configured"}</dd></div>
        <div><dt>Hire date</dt><dd>{employee?.hireDate??"Not recorded"}</dd></div>
        <div><dt>Employee number</dt><dd>{employee?.employeeNumber??"Not assigned"}</dd></div>
      </dl></section>
    <section className="prototype-panel"><h2>My document register</h2>
      {documents.map(item=><div className="prototype-work-list" key={item.id}>
        <strong><FileText size={15}/> {item.title}</strong><span>{item.category} · {item.status} · Version {item.version}</span>
      </div>)}
      {!documents.length&&<p className="prototype-empty">No employee documents are currently listed.</p>}
      <p className="prototype-note">This is document status metadata, not an authenticated PDF download or completed e-signature. Originals require the restricted HR document workflow.</p>
    </section>
  </div>;
  return <div className="prototype-domain prototype-domain--people">
    {head("My Account","Your personal employee information and completed-work history, kept separate from company HR administration.")}
    <div className="prototype-domain-statbar">
      <article><UserRound size={18}/><small>Employee</small><strong>{currentUser.firstName}</strong></article>
      <article><Clock3 size={18}/><small>My timecards</small><strong>{ownTimecards.length}</strong></article>
      <article><CalendarDays size={18}/><small>My pending leave</small><strong>{ownLeave.filter(item=>item.status==="Submitted").length}</strong></article>
      <article><FileText size={18}/><small>My available documents</small><strong>{availableDocuments}</strong></article>
    </div>
    {tiles}
    <section className="prototype-panel"><h2>My access & security</h2>
      <p>Signed in as <strong>{currentUser.email}</strong>. Change your sign-in email or password from the avatar menu at the top right. Account access is scoped to your identity.</p>
      <p className="prototype-note">Employee profile, leave and pay history are personal records. Supervisory and organizational HR controls remain in Human Resources and Administration.</p>
    </section>
  </div>;
}
