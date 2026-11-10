"use client";

/** Source-linked Administration command surface. The original Settings tools
 * remain accessible as a tab, not silently replaced with inactive mockups.
 */
import {useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {canVisitRoute} from "../../lib/navigation-route-registry";
import {navigateToRoute} from "../../lib/navigation-store";
import {SettingsPage} from "../pages/settings";

const destinations=[
  {label:"Action Center",route:"/work/actions",detail:"Approvals, returns and company exceptions"},
  {label:"Employee Directory & Profiles",route:"/admin/employees",detail:"Authorized personnel records and HR evidence"},
  {label:"New-hire onboarding",route:"/people/onboarding",detail:"Tasks, evidence and pending employee review"},
  {label:"HR compliance gate",route:"/people/compliance",detail:"Unverified forms and legal-readiness blockers"},
  {label:"Users & Roles",route:"/admin/access",detail:"Identity status and role controls"},
  {label:"Workforce Live",route:"/admin/workforce",detail:"Actual recorded workforce events"},
  {label:"Audit Center",route:"/admin/audit",detail:"Source-linked history and integrity exceptions"},
  {label:"Account Consolidation",route:"/admin/accounts",detail:"Review duplicate organizations without discarding history"},
  {label:"Data Exchange",route:"/admin/data-exchange",detail:"Controlled source imports and exports"},
  {label:"Reports & Insights",route:"/reports",detail:"Evidence-backed operational reporting"},
] as const;
export function AdminOverviewExperience(){
 const {data,currentUser}=useWorkspace();
 const {hcm}=useHcm();
 const [tab,setTab]=useState<"overview"|"systems">("overview");
 if(currentUser?.role!=="Administrator")return <p className="prototype-empty">Administrator access required.</p>;
 const employees=data.users.filter(user=>user.role!=="Customer"&&user.employmentStatus!=="Separated");
 const missing=hcm.documents.filter(doc=>doc.status==="Missing");
 const pendingLeave=hcm.leaveRequests.filter(request=>request.status==="Submitted");
 const accessible=destinations.filter(item=>canVisitRoute(currentUser,item.route));
 return <div className="prototype-domain prototype-domain--administration">
  <header className="prototype-heading"><h1>Administration</h1>
   <p>Manage permissions, personnel, onboarding, audit, integrations and controlled source workflows. Records shown below come from the currently loaded authorized state.</p>
  </header>
  <nav className="prototype-tabs" aria-label="Administration workstreams">
   <button type="button" className={tab==="overview"?"is-active":""} aria-current={tab==="overview"?"page":undefined} onClick={()=>setTab("overview")}>Control center</button>
   <button type="button" className={tab==="systems"?"is-active":""} aria-current={tab==="systems"?"page":undefined} onClick={()=>setTab("systems")}>Existing system settings</button>
  </nav>
  {tab==="systems"?<SettingsPage/>:<>
   <div className="prototype-domain-statbar">
    <article><small>Active staff in directory</small><strong>{employees.length}</strong></article>
    <article><small>Missing-document records</small><strong>{missing.length}</strong></article>
    <article><small>Submitted leave requests</small><strong>{pendingLeave.length}</strong></article>
   </div>
   <p className="prototype-note" role="status">These are visible record counts, not assertions of completed employment compliance, signed I-9 verification, live document delivery or payroll approval. Incomplete upstream data is not inferred as zero company-wide exceptions.</p>
   <section className="prototype-panel"><h2>Administrative workstreams</h2>
    <div className="prototype-columns">
     {accessible.map(item=><article className="prototype-panel" key={item.route}>
      <h3>{item.label}</h3><p>{item.detail}</p>
      <button type="button" className="prototype-link" onClick={()=>navigateToRoute(item.route)}>Open {item.label}</button>
     </article>)}
    </div>
   </section>
  </>}
 </div>;
}
