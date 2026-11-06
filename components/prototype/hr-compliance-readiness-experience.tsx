"use client";
import {useState} from "react";
import {ClipboardCheck,Download,ExternalLink,ShieldAlert} from "lucide-react";
import {useHcm} from "../../lib/hcm-context";
import {useWorkspace} from "../../lib/workspace-context";
import {HR_FORM_SOURCES} from "../../lib/hr-document-controls";
import {hiringReadiness} from "../../lib/hr-compliance-readiness";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";

const sources=[
 ...HR_FORM_SOURCES,
 {title:"Arizona new hire reporting",url:"https://des.az.gov/services/employment/unemployment-employer/employer-requirements-record-keeping",detail:"Report a newly hired or rehired Arizona worker within 20 days."},
];
export function HrComplianceReadinessExperience(){
 const {currentUser,data}=useWorkspace();const {hcm}=useHcm();
 const [filter,setFilter]=useState("all"),[query,setQuery]=useState("");
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">Only authorized administrators may review personnel compliance.</div>;
 const records=hcm.employees.filter(e=>e.status!=="Separated").map(e=>({employee:e,check:hiringReadiness(e,hcm.documents),name:data.users.find(u=>u.id===e.userId)?.name??"Unlinked employee"}));
 const rows=records.filter(r=>(filter==="all"||r.employee.classification===filter)&&[r.name,r.employee.jobTitle,r.employee.employeeNumber].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
 const exportRows=()=>downloadCsv("momentum-hr-compliance-review.csv",rows.flatMap(r=>r.check.formEvidence.length?r.check.formEvidence.map(f=>({employee:r.name,classification:r.employee.classification,hireDate:r.employee.hireDate??"",form:f.kind,evidence:f.status,release:"BLOCKED",issues:r.check.blockers.join("; ")})):[{employee:r.name,classification:r.employee.classification,hireDate:r.employee.hireDate??"",form:"Classification unresolved",evidence:"Unknown",release:"BLOCKED",issues:r.check.blockers.join("; ")}]),["employee","classification","hireDate","form","evidence","release","issues"]);
 return <div className="prototype-domain prototype-domain--people">
  <header className="prototype-heading"><h1><ShieldAlert size={20}/> HR compliance release gate</h1><p>Evidence-based readiness review, not an electronic signature engine or an employer compliance certification.</p></header>
  <div className="prototype-domain-statbar"><article><small>Records needing verification</small><strong>{records.length}</strong></article><article><small>Required form evidence missing</small><strong>{records.flatMap(r=>r.check.formEvidence).filter(f=>f.status==="Missing secure verification").length}</strong></article><article><small>Production-certified hires</small><strong>Not verified</strong></article></div>
  <section className="prototype-panel"><h2>Readiness by worker</h2><div className="prototype-controls">
  <label>Search <input aria-label="Search employee compliance records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, role or number"/></label>
  <label>Worker type <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option>{["Hourly","Salary","Contractor","Not configured"].map(s=><option key={s}>{s}</option>)}</select></label>
  <button type="button" disabled={!rows.length} onClick={exportRows}><Download size={15}/> Export evidence gaps</button></div>
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Worker type</th><th>Start</th><th>Document evidence</th><th>Outstanding safeguards</th><th>Record</th></tr></thead>
  <tbody>{rows.map(r=><tr key={r.employee.userId}><td>{r.name}</td><td>{r.employee.classification}</td><td>{r.employee.hireDate??"Unconfirmed"}</td>
  <td>{r.check.formEvidence.length?r.check.formEvidence.map(f=><div key={f.kind} className="prototype-small">{f.kind}: {f.status}</div>):"Classification first"}</td><td>{r.check.blockers.length} unresolved. Production release blocked. {r.check.retentionReviewDate?"I-9 retention review not before "+r.check.retentionReviewDate:""}</td>
  <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/admin/employee-profiles/"+encodeURIComponent(r.employee.userId)+"/documents")}>Open authorized employee file</button></td></tr>)}</tbody></table></div>
  {!rows.length&&<p className="prototype-note">No matching employee records. This is not a compliance clearance.</p>}</section>
  <section className="prototype-panel"><h2><ClipboardCheck size={17}/> Required external verification</h2>
  <p className="prototype-note">Federal I-9 Section 1 is due no later than the first paid work day, and employer Section 2 normally within three business days. Arizona A-4 is required for applicable new employees within five days; without a form Arizona generally requires 2.0% withholding. Arizona new-hire reports are generally due within 20 days. Confirm exceptions, work location, employer operating days and employee classification.</p>
  <p className="prototype-note">Even a verified uploaded PDF does not establish compliant identity examination, IRS form substitution, secure e-sign rules, employer state reporting, payroll setup, or retention. No automatic green status is permitted.</p>
  <h3>Authoritative form and employer sources</h3>{sources.map(s=><p className="prototype-activity" key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} <ExternalLink size={12}/></a><span>{s.detail}</span></p>)}
  </section></div>;
}
