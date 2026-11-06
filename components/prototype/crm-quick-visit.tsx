"use client";

import {useMemo,useState} from "react";
import type {FormEvent} from "react";
import {canClaimUnassignedProspect} from "../../lib/access";
import {employeePhysicalVisits,employeeVisitLabel} from "../../lib/employee-admin";
import {GOLDEN_EAGLE_SKUS} from "../../lib/product-catalog";
import {matchQuickVisitAccount,quickVisitBusinessLabel,quickVisitLocationId,quickVisitSuggestions} from "../../lib/quick-visit";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";
import {useCrm} from "../../lib/crm-context";
import {navigateToRoute} from "../../lib/navigation-store";

/**
 * A physical field visit is user-attested, not GPS-verified. It is never
 * inferred from meeting, route or page events. Samples are recorded as field
 * logs without inventory removal. Connected CRM writes fail closed.
 */
export function CrmQuickVisit(){
  const {scope,data,currentUser,claimUnassignedProspect}=useWorkspace();
  const {crm,addInteraction}=useCrm();
  const runtime=useRuntimeMode();
  const [business,setBusiness]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [score,setScore]=useState(5);
  const [unsuccessful,setUnsuccessful]=useState(false);
  const [physical,setPhysical]=useState(false);
  const [summary,setSummary]=useState("");
  const [nextAction,setNextAction]=useState("");
  const [nextActionDate,setNextActionDate]=useState("");
  const [sampleProduct,setSampleProduct]=useState("");
  const [sampleQuantity,setSampleQuantity]=useState(1);
  const [feedback,setFeedback]=useState("");
  const [historyCount,setHistoryCount]=useState(20);
  const canWrite=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)&&runtime.isDemo&&momentumStorage.mode()==="local");
  const matched=scope.accounts.find(a=>a.id===selectedId)??matchQuickVisitAccount(scope.accounts,business);
  const suggestions=useMemo(()=>business.trim()&&!matched?quickVisitSuggestions(scope.accounts,business):[],[scope.accounts,business,matched]);
  const visits=useMemo(()=>currentUser?employeePhysicalVisits(crm,currentUser.id):[],[crm,currentUser]);
  if(!currentUser||!["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role))return <div className="prototype-empty">An authorized Sales employee session is required.</div>;

  const choose=(id:string)=>{
    const account=scope.accounts.find(a=>a.id===id);
    if(account){setSelectedId(account.id);setBusiness(quickVisitBusinessLabel(account));setFeedback("");}
  };
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!canWrite){setFeedback("Connected CRM write requires trusted server authorization.");return;}
    const name=business.trim();
    if(!physical||!name){setFeedback("Confirm you physically visited the business and provide its name.");return;}
    if(!Number.isInteger(score)||score<1||score>10){setFeedback("A prospect score must be between 1 and 10.");return;}
    if(sampleProduct&&(!Number.isInteger(sampleQuantity)||sampleQuantity<1||sampleQuantity>10000)){setFeedback("Sample cans must be a positive whole number.");return;}
    const linked=scope.accounts.find(a=>a.id===selectedId)??matchQuickVisitAccount(scope.accounts,name);
    const locationId=linked?.id??quickVisitLocationId(name);
    const visit=addInteraction({
      locationId,type:"Visit",physicalVisit:true,visitUnsuccessful:unsuccessful,
      prospectRating:score,summary:summary.trim()||"Physical business visit",
      quickVisitBusinessName:name,
      nextAction:nextAction.trim()||undefined,
      nextActionDate:nextActionDate||undefined,
    });
    if(!visit){setFeedback("Visit was not saved. Check account access and the follow-up date.");return;}
    if(sampleProduct){
      const sample=addInteraction({
        locationId,type:"Sample",summary:`Field sample: ${sampleQuantity} can(s) of ${sampleProduct}`,
        sampleProduct,sampleQuantity,sampleUnit:"can",sampleInventoryLinked:false,
        quickVisitBusinessName:name,
      });
      if(!sample){setFeedback("Visit saved, but the sample log failed. Sample inventory was not updated. Reconcile this visit before logging more samples.");return;}
    }
    setFeedback("Physical visit recorded in the local demonstration CRM. No account, order, charge or inventory movement was created.");
    setPhysical(false);setSummary("");setNextAction("");setNextActionDate("");setSampleProduct("");setSampleQuantity(1);setUnsuccessful(false);setScore(5);
  };
  return <main className="prototype-workspace"><header className="prototype-heading"><h1>Quick visit</h1>
    <p>Record a physical stop, prospect outcome, product sampling and a real follow-up date. Your existing business and visit history remain linked.</p>
  </header>
    <section className="prototype-panel"><h2>Log field visit</h2>
      {!canWrite&&<p className="prototype-note" role="status">Read-only connected workspace. Local CRM logs cannot be mistaken for securely saved company records.</p>}
      <form aria-label="Record physical sales visit" onSubmit={submit}>
        <div className="prototype-columns">
          <label>Business visited <input value={business} required disabled={!canWrite} onChange={e=>{setBusiness(e.target.value);setSelectedId("");setFeedback("");}} placeholder="Find store or enter an unlisted business"/></label>
          <div><strong>Match</strong>
            {matched?<div><p>{matched.name} · {matched.location}</p><button className="prototype-link" type="button" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(matched.id))}>Open customer record</button></div>
            :<p className="prototype-note">No matching account selected. Freehand visit does not create a customer or prospect.</p>}
            {suggestions.length>0&&<div role="group" aria-label="Matching authorized business locations">{suggestions.map(a=><button key={a.id} type="button" onClick={()=>choose(a.id)} className="prototype-link">{quickVisitBusinessLabel(a)}</button>)}</div>}
          </div>
          <label>Prospect score 1–10 <input required disabled={!canWrite} type="number" min={1} max={10} step={1} value={score} onChange={e=>setScore(Number(e.target.value))}/></label>
          <label>Visit outcome <select disabled={!canWrite} value={unsuccessful?"unsuccessful":"successful"} onChange={e=>setUnsuccessful(e.target.value==="unsuccessful")}><option value="successful">Contact made or visit attempted</option><option value="unsuccessful">Unsuccessful physical visit</option></select></label>
          <label>Visit notes <textarea disabled={!canWrite} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Who did you meet and what happened?"/></label>
          <label>Next action <input disabled={!canWrite} value={nextAction} onChange={e=>setNextAction(e.target.value)} placeholder="Call buyer, schedule tasting, return with samples"/></label>
          <label>Follow-up date <input type="date" disabled={!canWrite} value={nextActionDate} onChange={e=>setNextActionDate(e.target.value)}/></label>
          <label>Optional Golden Eagle sample <select disabled={!canWrite} value={sampleProduct} onChange={e=>setSampleProduct(e.target.value)}><option value="">No sample provided</option>{GOLDEN_EAGLE_SKUS.map(sku=><option key={sku.id} value={sku.description}>{sku.shortName}</option>)}</select></label>
          {sampleProduct&&<label>Cans provided <input required disabled={!canWrite} min={1} max={10000} step={1} type="number" value={sampleQuantity} onChange={e=>setSampleQuantity(Number(e.target.value))}/></label>}
        </div>
        <label><input type="checkbox" checked={physical} disabled={!canWrite} onChange={e=>setPhysical(e.target.checked)}/> I confirm that I physically visited this business. This is an employee attestation, not verified GPS evidence.</label>
        <p className="prototype-note">Samples are field logs only and do not deduct warehouse inventory. Do not log calls, route plans or virtual meetings as physical visits. No external messages are sent.</p>
        {feedback&&<p role="status">{feedback}</p>}
        {canWrite&&<div className="prototype-controls"><button type="submit" disabled={!physical}>Save field visit</button>{matched&&canClaimUnassignedProspect(currentUser,matched)&&<button type="button" onClick={()=>{if(claimUnassignedProspect(matched.id))setFeedback("Unassigned prospect claimed in local demo. Original visit and account IDs retained.");else setFeedback("Prospect claim rejected.");}}>Claim unassigned prospect</button>}</div>}
      </form>
    </section>
    <section className="prototype-panel"><h2>My recorded physical visits</h2>
      <p className="prototype-note">{visits.length} accessible visits. Existing visit records preserve their original actor and event time.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>When</th><th>Business</th><th>Score</th><th>Outcome</th><th>Notes</th></tr></thead>
      <tbody>{visits.slice(0,historyCount).map(visit=><tr key={visit.id}><td>{visit.occurredAt.slice(0,16).replace("T"," ")}</td><td>{employeeVisitLabel(visit,data)}</td><td>{visit.prospectRating??"Not scored"}</td><td>{visit.visitUnsuccessful?"Unsuccessful":"Recorded"}</td><td>{visit.summary}</td></tr>)}</tbody></table></div>
      {!visits.length&&<p className="prototype-empty">No physical visits have been recorded for this employee.</p>}
      {visits.length>historyCount&&<button type="button" onClick={()=>setHistoryCount(n=>n+20)}>Show more visits</button>}
    </section>
  </main>;
}
