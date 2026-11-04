"use client";

import {useMemo,useState} from "react";
import {ArrowLeft,Download,FileText,UserRound,WalletCards} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {activeCompensation} from "../../lib/hcm-engine";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const profilePath=(id:string,section?:string)=>"/admin/employee-profiles/"+encodeURIComponent(id)+(section?"/"+section:"");
const sections=["overview","time","documents","training","compensation"] as const;
type Section=typeof sections[number];

export function HrPersonnelDirectory(){
  const {data,currentUser}=useWorkspace();const {hcm}=useHcm();
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [sort,setSort]=useState<"name"|"team"|"status"|"hireDate">("name");
  const [reverse,setReverse]=useState(false);
  const list=useMemo(()=>data.users.filter(u=>u.role!=="Customer").map(user=>({
    user,employment:hcm.employees.find(e=>e.userId===user.id)
  })).filter(x=>status==="all"||(x.employment?.status??x.user.employmentStatus)===status)
    .filter(x=>[x.user.name,x.user.email,x.user.team,x.employment?.jobTitle,x.employment?.employeeNumber].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      const value=(r:typeof a)=>sort==="name"?r.user.name:sort==="team"?r.user.team:sort==="status"?(r.employment?.status??""):(r.employment?.hireDate??"");
      return value(a).localeCompare(value(b))*(reverse?-1:1);
    }),[data.users,hcm.employees,query,status,sort,reverse]);
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Personnel records require Administrator access.</div>;
  const exportRoster=()=>downloadCsv("momentum-employee-roster.csv",list.map(({user,employment})=>({
    employeeNumber:employment?.employeeNumber??"",name:user.name,department:employment?.department??user.team,jobTitle:employment?.jobTitle??user.title,location:employment?.location??"",role:user.role,employmentStatus:employment?.status??"Not configured",hireDate:employment?.hireDate??"",manager:data.users.find(u=>u.id===employment?.managerId)?.name??""
  })),["employeeNumber","name","department","jobTitle","location","role","employmentStatus","hireDate","manager"]);
  return <div className="prototype-domain prototype-domain--people">
    <header className="prototype-heading"><h1>Employee records</h1><p>People directory, employment status, reporting lines, HR files, training and detailed profiles. Compensation exports require a separate deliberate action.</p></header>
    <div className="prototype-domain-statbar">
      <article><UserRound size={18}/><small>Employees in directory</small><strong>{data.users.filter(u=>u.role!=="Customer").length}</strong></article>
      <article><UserRound size={18}/><small>Active employment records</small><strong>{hcm.employees.filter(e=>e.status==="Active").length}</strong></article>
      <article><FileText size={18}/><small>Missing HR documents</small><strong>{hcm.documents.filter(d=>d.status==="Missing").length}</strong></article>
    </div>
    <section className="prototype-panel">
      <div className="prototype-controls">
        <label className="prototype-search"><input aria-label="Search employee directory" placeholder="Find employee, email, team, employee number" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <label>Status <select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All</option>{(["Prehire","Active","Leave","Separated"] as const).map(s=><option key={s}>{s}</option>)}</select></label>
        <label>Sort <select value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="name">Employee name</option><option value="team">Department</option><option value="status">Employment status</option><option value="hireDate">Hire date</option></select></label>
        <button type="button" onClick={()=>setReverse(v=>!v)}>{reverse?"Descending":"Ascending"}</button>
        <button type="button" disabled={!list.length} onClick={exportRoster}><Download size={15}/> Export visible roster</button>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>Employee</th><th>Number</th><th>Department</th><th>Job title</th><th>Status</th><th>Hire date</th><th>Profile</th></tr></thead><tbody>
        {list.map(({user,employment})=><tr key={user.id}><td><strong>{user.name}</strong><small className="prototype-description">{user.email}</small></td><td>{employment?.employeeNumber??"Not assigned"}</td><td>{employment?.department??user.team}</td><td>{employment?.jobTitle??user.title}</td><td>{employment?.status??"Not configured"}</td><td>{employment?.hireDate??"Not recorded"}</td><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute(profilePath(user.id))}>Open profile</button></td></tr>)}
        </tbody></table></div>
        {!list.length&&<div className="prototype-empty">No employee records match these filters.</div>}
    </section>
    <p className="prototype-note">Roster exports intentionally exclude private contact details, identification numbers, benefits and compensation. Employee records are sourced from existing HR/identity records, not synthesized by the redesign.</p>
  </div>;
}

export function HrPersonnelRecord({id,section="overview"}:{id:string;section?:string}){
  const {data,currentUser}=useWorkspace();const {hcm}=useHcm();
  if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Employee records require Administrator access.</div>;
  const user=data.users.find(u=>u.id===id&&u.role!=="Customer");
  if(!user)return <div className="prototype-empty">Employee not found.</div>;
  const employment=hcm.employees.find(e=>e.userId===id);
  const compensation=activeCompensation(hcm,id);
  const docs=hcm.documents.filter(d=>d.userId===id);
  const timecards=data.timecards.filter(t=>t.userId===id).sort((a,b)=>b.weekEnd.localeCompare(a.weekEnd));
  const training=hcm.training.filter(t=>t.userId===id);
  const leave=hcm.leaveRequests.filter(t=>t.userId===id).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
  const area:Section=sections.includes(section as Section)?section as Section:"overview";
  const exportProfile=()=>downloadCsv("momentum-employee-"+id+"-profile.csv",[
    {field:"Employee number",value:employment?.employeeNumber??""},
    {field:"Employee name",value:user.name},
    {field:"Department",value:employment?.department??user.team},
    {field:"Position",value:employment?.jobTitle??user.title},
    {field:"Employment status",value:employment?.status??""},
    {field:"Hire date",value:employment?.hireDate??""},
    {field:"Work location",value:employment?.location??""},
    {field:"Reports to",value:data.users.find(u=>u.id===employment?.managerId)?.name??""},
    {field:"HR documents total",value:docs.length},
    {field:"Training assigned",value:training.length}
  ],["field","value"]);
  const exportPaySetup=()=>{if(!compensation)return;downloadCsv("momentum-employee-"+id+"-compensation.csv",[
    {employee:user.name,employeeId:id,basis:compensation.basis,rate:compensation.rate,effectiveDate:compensation.effectiveDate,status:compensation.status,approvedBy:compensation.approvedBy}
  ],["employee","employeeId","basis","rate","effectiveDate","status","approvedBy"]);};
  return <div className="prototype-domain prototype-domain--people">
    <header className="prototype-heading">
      <button type="button" className="prototype-back" onClick={()=>navigateToRoute("/admin/employee-profiles")}><ArrowLeft size={15}/> Back to employee records</button>
      <h1>{user.name}</h1><p>{employment?.jobTitle??user.title} · {employment?.department??user.team} · {employment?.status??"Employment not configured"}</p>
    </header>
    <div className="prototype-controls"><button type="button" onClick={exportProfile}><Download size={14}/> Download profile summary</button><button type="button" onClick={()=>{if(typeof window!=="undefined")window.sessionStorage.setItem("momentum-employee-profile-focus",id);navigateToRoute("/admin/employee-profiles/workflow");}}>Open secure profile editor</button></div>
    <nav className="prototype-tabs" aria-label="Employee record sections">{sections.map(s=><button key={s} type="button" className={area===s?"is-active":""} aria-current={area===s?"page":undefined} onClick={()=>navigateToRoute(profilePath(id,s==="overview"?undefined:s))}>{s[0].toUpperCase()+s.slice(1)}</button>)}</nav>
    {area==="overview"&&<div className="prototype-columns"><section className="prototype-panel"><h2>Employment</h2><dl className="prototype-facts">
      <div><dt>Employee number</dt><dd>{employment?.employeeNumber??"Not configured"}</dd></div>
      <div><dt>Classification</dt><dd>{employment?.classification??"Not configured"}</dd></div>
      <div><dt>Hire date</dt><dd>{employment?.hireDate??"Not recorded"}</dd></div>
      <div><dt>Location</dt><dd>{employment?.location??"Not recorded"}</dd></div>
      <div><dt>Manager</dt><dd>{data.users.find(u=>u.id===employment?.managerId)?.name??"Not assigned"}</dd></div>
    </dl></section>
    <section className="prototype-panel"><h2>Open personnel work</h2><div className="prototype-work-list"><span>Missing documents</span><strong>{docs.filter(d=>d.status==="Missing").length}</strong></div><div className="prototype-work-list"><span>Incomplete training</span><strong>{training.filter(t=>t.status!=="Complete").length}</strong></div><div className="prototype-work-list"><span>Submitted leave requests</span><strong>{leave.filter(l=>l.status==="Submitted").length}</strong></div><div className="prototype-work-list"><span>Submitted timecards</span><strong>{timecards.filter(t=>t.status==="Submitted").length}</strong></div></section></div>}
    {area==="time"&&<section className="prototype-panel"><h2>Attendance & time-off</h2>{timecards.map(t=><div className="prototype-work-list" key={t.id}><strong>{t.weekStart} to {t.weekEnd}</strong><span>{t.status}</span></div>)}{leave.map(l=><div className="prototype-work-list" key={l.id}><strong>Leave {l.startDate} to {l.endDate}</strong><span>{l.requestedHours} hours · {l.status}</span></div>)}{!timecards.length&&!leave.length&&<p>No time or leave records.</p>}<button type="button" onClick={()=>navigateToRoute("/people/timekeeping")}>Open timekeeping controls</button></section>}
    {area==="documents"&&<section className="prototype-panel"><h2>HR document register</h2>{docs.map(d=><div key={d.id} className="prototype-work-list"><strong>{d.title} · v{d.version}</strong><span>{d.category} · {d.status} · {d.fileName??"No file stored"}</span></div>)}{!docs.length&&<p>No HR document metadata recorded.</p>}<p className="prototype-note">Only file metadata is shown here. Download verified originals through their authorized secure document source, not reconstructed HTML.</p></section>}
    {area==="training"&&<section className="prototype-panel"><h2>Learning & development</h2>{training.map(t=><div key={t.id} className="prototype-work-list"><strong>{hcm.courses.find(c=>c.id===t.courseId)?.title??"Course unavailable"}</strong><span>{t.status}{t.dueDate?" · Due "+t.dueDate:""}</span></div>)}{!training.length&&<p>No training assigned.</p>}<button type="button" onClick={()=>navigateToRoute("/people/training")}>Open training administration</button></section>}
    {area==="compensation"&&<section className="prototype-panel"><h2><WalletCards size={18}/> Restricted compensation</h2>{compensation?<dl className="prototype-facts">
      <div><dt>Basis</dt><dd>{compensation.basis}</dd></div><div><dt>Effective pay rate</dt><dd>{money(compensation.rate)}</dd></div><div><dt>Effective date</dt><dd>{compensation.effectiveDate}</dd></div><div><dt>Status</dt><dd>{compensation.status}</dd></div>
    </dl>:<p>Compensation has not been configured.</p>}{compensation&&<button type="button" onClick={exportPaySetup}><Download size={14}/> Download compensation setup</button>}<p className="prototype-note">Rate is per the configured pay basis. This is not an annualized salary estimate or a payroll payment record.</p></section>}
  </div>;
}
