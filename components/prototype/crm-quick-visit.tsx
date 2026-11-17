"use client";

import {useMemo,useRef,useState} from "react";
import type {FormEvent} from "react";
import {canClaimUnassignedProspect} from "../../lib/access";
import {employeePhysicalVisits,employeeVisitLabel} from "../../lib/employee-admin";
import {GOLDEN_EAGLE_SKUS} from "../../lib/product-catalog";
import {matchQuickVisitAccount,quickVisitBusinessLabel,quickVisitLocationId,quickVisitSuggestions} from "../../lib/quick-visit";
import {momentumStorage} from "../../lib/persistence";
import {CRM_STORAGE_KEY} from "../../lib/crm-engine";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {recordTrustedFieldVisit,type TrustedFieldVisitPayload} from "../../lib/firebase-crm-field-visit";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";
import {useCrm} from "../../lib/crm-context";
import {navigateToRoute} from "../../lib/navigation-store";

/**
 * A physical field visit is user-attested, not GPS-verified. It is never
 * inferred from meeting, route or page events. Samples are recorded as field
 * logs without inventory removal. Connected saves require a trusted server receipt.
 */
export function CrmQuickVisit(){
  const {scope,data,currentUser,claimUnassignedProspect}=useWorkspace();
  const {crm,addInteraction}=useCrm();
  const runtime=useRuntimeMode();
  const firebase=useFirebaseSessionOptional();
  const requestRef=useRef<{payload:string;id:string}|null>(null);
  const [saving,setSaving]=useState(false);
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
  const [historySearch,setHistorySearch]=useState("");
  const [historyFrom,setHistoryFrom]=useState("");
  const [historyThrough,setHistoryThrough]=useState("");
  const [historySort,setHistorySort]=useState<"when"|"business"|"score"|"outcome"|"notes">("when");
  const [historyAscending,setHistoryAscending]=useState(false);
  const localDemo=runtime.isDemo&&momentumStorage.mode()==="local";
  const connected=!runtime.isDemo&&momentumStorage.mode()==="firestore"&&firebase?.status==="ready"&&Boolean(firebase.session);
  const canWrite=Boolean(currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)&&(localDemo||connected));
  const matched=scope.accounts.find(a=>a.id===selectedId)??matchQuickVisitAccount(scope.accounts,business);
  const suggestions=useMemo(()=>business.trim()&&!matched?quickVisitSuggestions(scope.accounts,business):[],[scope.accounts,business,matched]);
  const visits=useMemo(()=>currentUser?employeePhysicalVisits(crm,currentUser.id):[],[crm,currentUser]);
  const filteredVisits=useMemo(()=>visits.filter(v=>
    (!historyFrom||v.occurredAt.slice(0,10)>=historyFrom)&&
    (!historyThrough||v.occurredAt.slice(0,10)<=historyThrough)&&
    [employeeVisitLabel(v,data),v.summary,v.type,v.visitUnsuccessful?"Unsuccessful":"Recorded"].join(" ")
      .toLowerCase().includes(historySearch.trim().toLowerCase()))
    .sort((a,b)=>{
      const field=(v:typeof a):string|number=>{
        if(historySort==="business")return employeeVisitLabel(v,data);
        if(historySort==="score")return v.prospectRating??-1;
        if(historySort==="outcome")return v.visitUnsuccessful?"Unsuccessful":"Recorded";
        if(historySort==="notes")return v.summary;
        return v.occurredAt;
      };
      const x=field(a),y=field(b);
      const cmp=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
      return (historyAscending?1:-1)*(cmp||a.id.localeCompare(b.id));
    }),[visits,data,historySearch,historyFrom,historyThrough,historySort,historyAscending]);
  if(!currentUser||!["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role))return <div className="prototype-empty">An authorized Sales employee session is required.</div>;

  const choose=(id:string)=>{
    const account=scope.accounts.find(a=>a.id===id);
    if(account){setSelectedId(account.id);setBusiness(quickVisitBusinessLabel(account));setFeedback("");}
  };
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!canWrite){setFeedback("Connected CRM write requires trusted server authorization.");return;}
    const name=business.trim();
    if(!physical||!name){setFeedback("Confirm you physically visited the business and provide its name.");return;}
    if(!Number.isInteger(score)||score<1||score>10){setFeedback("A prospect score must be between 1 and 10.");return;}
    if(sampleProduct&&(!Number.isInteger(sampleQuantity)||sampleQuantity<1||sampleQuantity>1000)){setFeedback("Sample cans must be a positive whole number up to 1000.");return;}
    const linked=scope.accounts.find(a=>a.id===selectedId)??matchQuickVisitAccount(scope.accounts,name);
    if(connected&&firebase?.session){
      if(saving)return;
      const visit:TrustedFieldVisitPayload={
        businessName:name,accountId:linked?.id,
        physicallyVisited:true,unsuccessful,score,
        summary:summary.trim()||"Physical business visit",
        nextAction:nextAction.trim()||undefined,
        nextActionDate:nextActionDate||undefined,
        sampleProduct:sampleProduct||undefined,
        sampleQuantity:sampleProduct?sampleQuantity:undefined,
      };
      const fingerprint=JSON.stringify(visit);
      const requestId=requestRef.current?.payload===fingerprint?
        requestRef.current.id:crypto.randomUUID();
      requestRef.current={payload:fingerprint,id:requestId};
      setSaving(true);
      setFeedback("");
      try{
        const receipt=await recordTrustedFieldVisit(firebase.session,visit,requestId);
        // Never infer persistence from a React state update. Confirm cloud
        // refresh separately; server receipt already proves the write.
        const sync=await momentumStorage.refreshKeys([CRM_STORAGE_KEY]);
        setFeedback(sync.ok?
          "Company CRM confirmed this physical visit"+(receipt.sampleId?" and sample log":"")+
          ". No account, order, payment or inventory movement was created.":
          "CRM server confirmed the save, but this device has not refreshed the record. Check synchronization before entering another visit.");
        requestRef.current=null;
        setPhysical(false);setSummary("");setNextAction("");
        setNextActionDate("");setSampleProduct("");setSampleQuantity(1);
        setUnsuccessful(false);setScore(5);
      }catch(error){
        setFeedback(error instanceof Error?error.message:
          "CRM could not confirm the visit. Check history before retrying.");
      }finally{setSaving(false);}
      return;
    }
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
  return <section className="prototype-workspace"><header className="prototype-heading"><h1>Quick visit</h1>
    <p>Record a physical stop, prospect outcome, product sampling and a real follow-up date. Your existing business and visit history remain linked.</p>
  </header>
    <section className="prototype-panel"><h2>Log field visit</h2>
      {!canWrite&&<p className="prototype-note" role="status">A ready, authorized employee session is required to save connected visits. Unsaved form entries are not company records.</p>}
      <form aria-label="Record physical sales visit" onSubmit={submit}>
        <fieldset className="prototype-field-step">
          <legend><span className="prototype-field-step-number">1</span> Business visited</legend>
          <div className="prototype-columns">
            <label>Business or store name <input value={business} required  onChange={e=>{setBusiness(e.target.value);setSelectedId("");setFeedback("");}} placeholder="Search a location or enter an unlisted business"/></label>
            <div className="prototype-field-match"><strong>{matched?"Matching customer record":"Account match"}</strong>
              {matched?<div><p>{matched.name} · {matched.location}</p><button className="prototype-link" type="button" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(matched.id))}>Open linked customer record</button></div>
              :<p className="prototype-note">This visit is not yet linked to an existing account. Entering a name will not create a new customer.</p>}
              {suggestions.length>0&&<div role="group" aria-label="Matching authorized business locations">{suggestions.map(a=><button key={a.id} type="button" onClick={()=>choose(a.id)} className="prototype-link">{quickVisitBusinessLabel(a)}</button>)}</div>}
            </div>
          </div>
        </fieldset>
        <fieldset className="prototype-field-step">
          <legend><span className="prototype-field-step-number">2</span> Visit outcome</legend>
          <div className="prototype-columns">
            <label>Visit outcome <select  value={unsuccessful?"unsuccessful":"successful"} onChange={e=>setUnsuccessful(e.target.value==="unsuccessful")}><option value="successful">Contact made or visit attempted</option><option value="unsuccessful">Unsuccessful physical visit</option></select></label>
            <label>Prospect score (1–10) <input required  type="number" min={1} max={10} step={1} value={score} onChange={e=>setScore(Number(e.target.value))}/></label>
            <label className="prototype-field-full">Visit notes <textarea  value={summary} onChange={e=>setSummary(e.target.value)} placeholder="What happened, who was present and what needs attention?"/></label>
          </div>
          <label className="prototype-field-confirmation"><input type="checkbox" checked={physical}  onChange={e=>setPhysical(e.target.checked)}/> <span>I confirm that I physically visited this business. This is an employee attestation, not GPS verification.</span></label>
        </fieldset>
        <fieldset className="prototype-field-step">
          <legend><span className="prototype-field-step-number">3</span> Follow-up and sampling</legend>
          <div className="prototype-columns">
            <label>Next action <input  value={nextAction} onChange={e=>setNextAction(e.target.value)} placeholder="Call buyer, schedule tasting, return with samples"/></label>
            <label>Follow-up date <input type="date"  value={nextActionDate} onChange={e=>setNextActionDate(e.target.value)}/></label>
            <label>Golden Eagle sample (optional) <select  value={sampleProduct} onChange={e=>setSampleProduct(e.target.value)}><option value="">No sample provided</option>{GOLDEN_EAGLE_SKUS.map(sku=><option key={sku.id} value={sku.description}>{sku.shortName}</option>)}</select></label>
            {sampleProduct&&<label>Cans provided <input required  min={1} max={1000} step={1} type="number" value={sampleQuantity} onChange={e=>setSampleQuantity(Number(e.target.value))}/></label>}
          </div>
        </fieldset>
        <p className="prototype-note">Samples are field logs only and do not deduct warehouse inventory. Do not log calls, route plans or virtual meetings as physical visits. No external messages are sent.</p>
        {feedback&&<p role="status">{feedback}</p>}
        {canWrite&&<div className="prototype-controls"><button type="submit" disabled={!physical||saving}>{saving?"Saving to CRM…":"Save field visit"}</button>{matched&&canClaimUnassignedProspect(currentUser,matched)&&<button type="button" onClick={()=>{if(claimUnassignedProspect(matched.id))setFeedback("Unassigned prospect claimed in local demo. Original visit and account IDs retained.");else setFeedback("Prospect claim rejected.");}}>Claim unassigned prospect</button>}</div>}
      </form>
    </section>
    <section className="prototype-panel"><h2>My recorded physical visits</h2>
      <div className="prototype-controls">
        <label>Search visit <input type="search" aria-label="Search my visit history" value={historySearch} onChange={e=>{setHistorySearch(e.target.value);setHistoryCount(20);}} placeholder="Business, outcome or notes"/></label>
        <label>From <input type="date" aria-label="Visit history from" value={historyFrom} onChange={e=>setHistoryFrom(e.target.value)}/></label>
        <label>Through <input type="date" aria-label="Visit history through" value={historyThrough} onChange={e=>setHistoryThrough(e.target.value)}/></label>
        <button type="button" onClick={()=>{setHistorySearch("");setHistoryFrom("");setHistoryThrough("");setHistorySort("when");setHistoryAscending(false);}}>Clear visit filters</button>
      </div>
      <p className="prototype-note">{filteredVisits.length} of {visits.length} accessible physical visits. Original actor, notes and event times are preserved.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>{([
        ["when","When"],["business","Business"],["score","Score"],["outcome","Outcome"],["notes","Notes"]
      ] as const).map(([key,label])=><th key={key} aria-sort={historySort===key?(historyAscending?"ascending":"descending"):"none"}><button type="button" aria-label={"Sort visits by "+label}
        onClick={()=>{if(historySort===key)setHistoryAscending(v=>!v);else{setHistorySort(key);setHistoryAscending(true);}}}>{label}</button></th>)}</tr></thead>
      <tbody>{filteredVisits.slice(0,historyCount).map(visit=><tr key={visit.id}><td>{visit.occurredAt.slice(0,16).replace("T"," ")}</td><td>{employeeVisitLabel(visit,data)}</td><td>{visit.prospectRating??"Not scored"}</td><td>{visit.visitUnsuccessful?"Unsuccessful":"Recorded"}</td><td>{visit.summary}</td></tr>)}</tbody></table></div>
      {!filteredVisits.length&&<p className="prototype-empty">No matching physical visits for this employee.</p>}
      {filteredVisits.length>historyCount&&<button type="button" onClick={()=>setHistoryCount(n=>n+20)}>Show more visits</button>}
    </section>
  </section>;
}
