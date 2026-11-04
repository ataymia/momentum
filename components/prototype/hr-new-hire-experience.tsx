"use client";

import {BadgeCheck,BriefcaseBusiness,FileCheck2,UserRoundPlus} from "lucide-react";
import {useHcm} from "../../lib/hcm-context";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {NewHireProvisioning} from "../hcm/new-hire-provisioning";

export function HrNewHireExperience(){
 const {currentUser}=useWorkspace();const {hcm}=useHcm();
 if(currentUser?.role!=="Administrator")return <div className="prototype-empty">New-hire provisioning requires Administrator access.</div>;
 return <div className="prototype-domain prototype-domain--people prototype-hr-hire">
  <header className="prototype-heading"><h1>New employee setup</h1><p>Move from candidate to authorized employee record without bypassing identity, pay, training, document or approval gates.</p></header>
  <div className="prototype-domain-statbar">
    <article><UserRoundPlus size={18}/><small>Accepted candidate offers</small><strong>{hcm.offers.filter(o=>o.status==="Accepted").length}</strong></article>
    <article><BriefcaseBusiness size={18}/><small>Employees in prehire</small><strong>{hcm.employees.filter(e=>e.status==="Prehire").length}</strong></article>
    <article><BadgeCheck size={18}/><small>Open onboarding cases</small><strong>{hcm.lifecycleCases.filter(c=>c.type==="Onboarding"&&c.status==="Open").length}</strong></article>
  </div>
  <div className="prototype-domain-cards">
   <div className="prototype-domain-card prototype-domain-card--static"><strong>01 · Identity</strong><span>Legal name, contact, start date and account identity</span></div>
   <div className="prototype-domain-card prototype-domain-card--static"><strong>02 · Employment</strong><span>Job, manager, team, classification, work location</span></div>
   <div className="prototype-domain-card prototype-domain-card--static"><strong>03 · Compensation</strong><span>Approved pay and pay group; no placeholder payroll</span></div>
   <div className="prototype-domain-card prototype-domain-card--static"><strong>04 · Readiness</strong><span>Training, credentials, official form evidence and activation review</span></div>
  </div>
  <div className="prototype-controls"><button type="button" onClick={()=>navigateToRoute("/people/onboarding")}>Review onboarding cases</button><button type="button" onClick={()=>navigateToRoute("/admin/employee-profiles")}>Employee roster</button></div>
  <section className="prototype-panel prototype-onboarding-wizard"><h2><FileCheck2 size={18}/> Secure new-hire wizard</h2><p className="prototype-note">The form below runs the original verified identity and provisioning workflow. The redesign does not directly create an employee or issue credentials by displaying these steps.</p><NewHireProvisioning view="create"/></section>
 </div>;
}
