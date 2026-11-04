"use client";

import {useMemo,useState} from "react";
import {ClipboardCheck,Download,FileWarning,UserRoundPlus} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {appendAudit,type LifecycleCase} from "../../lib/hcm-engine";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";

export function HrOnboardingExperience(){
  const {data,currentUser}=useWorkspace();
  const runtime=useRuntimeMode();const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local";
  const {hcm,setHcm}=useHcm();
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"Open"|"Complete"|"Cancelled">("Open");
  const [selectedId,setSelectedId]=useState("");
  const [taskEvidence,setTaskEvidence]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const admin=currentUser?.role==="Administrator";
  const candidates=useMemo(()=>new Map(hcm.candidates.map(c=>[c.id,c])),[hcm.candidates]);
  const employeeName=(record:LifecycleCase)=>{
    const user=data.users.find(u=>u.id===record.userId);
    return user?.name??candidates.get(record.candidateId??"")?.name??"Unlinked prehire";
  };
  const cases=hcm.lifecycleCases.filter(c=>c.type==="Onboarding")
    .filter(c=>filter==="all"||c.status===filter)
    .filter(c=>[employeeName(c),c.id,c.effectiveDate,c.status].join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate));
  const selected=cases.find(c=>c.id===selectedId)??cases[0];
  const openCases=hcm.lifecycleCases.filter(c=>c.type==="Onboarding"&&c.status==="Open");
  const remaining=openCases.reduce((count,c)=>count+c.tasks.filter(t=>t.status!=="Complete").length,0);
  const exportRegister=()=>downloadCsv("momentum-onboarding-checklist.csv",cases.flatMap(c=>c.tasks.length?
    c.tasks.map(t=>({caseId:c.id,employee:employeeName(c),effectiveDate:c.effectiveDate,caseStatus:c.status,task:t.title,taskStatus:t.status,owner:data.users.find(u=>u.id===t.ownerId)?.name??"",dueDate:t.dueDate??"",completedAt:t.completedAt??"",evidence:t.evidence??""})):
    [{caseId:c.id,employee:employeeName(c),effectiveDate:c.effectiveDate,caseStatus:c.status,task:"",taskStatus:"",owner:"",dueDate:"",completedAt:"",evidence:""}]),["caseId","employee","effectiveDate","caseStatus","task","taskStatus","owner","dueDate","completedAt","evidence"]);
  const confirmTask=(caseId:string,taskId:string)=>{
    if(!currentUser||!admin||!writeEnabled){setError("Read-only prototype: onboarding task completion requires isolated local demo mode.");return;}
    const evidence=(taskEvidence[taskId]??"").trim();
    if(evidence.length<8){setError("Document where the completed step was verified. At least 8 characters of specific evidence are required.");return;}
    const c=hcm.lifecycleCases.find(item=>item.id===caseId),task=c?.tasks.find(item=>item.id===taskId);
    if(!c||c.status!=="Open"||!task||task.status==="Complete"){setError("This task is no longer open.");return;}
    if(/(i-9|w-4|tax|work authorization|employment form)/i.test(task.title)
       &&!window.confirm("This records a manually reviewed task only. Confirm that the actual signed official form or external verification evidence exists in the secure HR system. It does not electronically complete an I-9 or W-4."))return;
    setError("");setNotice("");
    setHcm(state=>appendAudit({
      ...state,
      lifecycleCases:state.lifecycleCases.map(item=>item.id!==caseId?item:{
        ...item,tasks:item.tasks.map(row=>row.id!==taskId?row:{...row,status:"Complete",completedAt:new Date().toISOString(),evidence})
      })
    },{actorId:currentUser.id,action:"Onboarding task evidence recorded",entityType:"LifecycleCase",entityId:caseId,reason:task.title+" · "+evidence}));
    setTaskEvidence(prev=>({...prev,[taskId]:""}));
    setNotice("Task completion submitted to the existing HR audit and persistence controls.");
  };
  if(!admin)return <div className="prototype-empty">Onboarding case administration is restricted to Administrators.</div>;
  return <div className="prototype-domain prototype-domain--people">
    <header className="prototype-heading"><h1>Onboarding operations</h1><p>Employee intake, verified tasks, deadlines and audit evidence. New-hire identity provisioning and official documents remain in their secure existing workflows.</p></header>
    <div className="prototype-domain-statbar">
      <article><ClipboardCheck size={18}/><small>Open onboarding cases</small><strong>{openCases.length}</strong></article>
      <article><FileWarning size={18}/><small>Open checklist steps</small><strong>{remaining}</strong></article>
      <article><UserRoundPlus size={18}/><small>Candidates in hiring pipeline</small><strong>{hcm.candidates.filter(c=>!["Hired","Rejected","Withdrawn"].includes(c.stage)).length}</strong></article>
    </div>
    <div className="prototype-controls">
      <button type="button" disabled={!writeEnabled} onClick={()=>navigateToRoute("/people/new-hire")}>Start new-hire provisioning</button>
      <button type="button" disabled={!writeEnabled} onClick={()=>navigateToRoute("/people/onboarding/workflow")}>Open full onboarding controls</button>
      <button type="button" onClick={exportRegister} disabled={!cases.length}><Download size={14}/> Export visible checklists</button>
    </div>
    <div className="prototype-columns">
      <section className="prototype-panel"><h2>Onboarding queue</h2>
        <div className="prototype-controls"><label className="prototype-search"><input aria-label="Find onboarding case" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search employee or case"/></label>
          <label>Status <select value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}><option value="all">All</option><option value="Open">Open</option><option value="Complete">Complete</option><option value="Cancelled">Cancelled</option></select></label>
        </div>
        {cases.map(c=><button type="button" className="prototype-domain-card" key={c.id} aria-pressed={selected?.id===c.id} onClick={()=>{setSelectedId(c.id);setNotice("");setError("");}}>
          <strong>{employeeName(c)}</strong><span>{c.status} · Start {c.effectiveDate}</span><span>{c.tasks.filter(t=>t.status==="Complete").length}/{c.tasks.length} steps documented</span>
        </button>)}
        {!cases.length&&<div className="prototype-empty">No onboarding cases match. Use New Hire to create one through the existing provisioning workflow.</div>}
      </section>
      <section className="prototype-panel"><h2>{selected?employeeName(selected):"Select an onboarding case"}</h2>
        {selected&&<><p className="prototype-note">Case {selected.id} · {selected.status} · Effective {selected.effectiveDate}. A checked task means the reviewer recorded completion evidence, not that a government form was filed or approved.</p>
          {selected.tasks.map(task=><article key={task.id} className="prototype-work-list">
            <div><strong>{task.title}</strong><small className="prototype-description">{task.status}{task.dueDate?" · Due "+task.dueDate:""}</small>
              {task.evidence&&<p className="prototype-note">Evidence: {task.evidence}</p>}
              {task.status!=="Complete"&&selected.status==="Open"&&<>
                <label>Verification record <input aria-label={"Evidence for "+task.title} value={taskEvidence[task.id]??""} onChange={event=>setTaskEvidence(v=>({...v,[task.id]:event.target.value}))} placeholder="Secure file reference or verified completion note"/></label>
                <button type="button" disabled={!writeEnabled} onClick={()=>confirmTask(selected.id,task.id)}>Record verified completion</button>
              </>}
            </div>
          </article>)}
          {selected.tasks.length===0&&<div className="prototype-empty">No checklist steps recorded. Review the case in the full onboarding workflow.</div>}
        </>}
      </section>
    </div>
    {notice&&<p className="prototype-note" role="status">{notice}</p>}
    {error&&<p role="alert" className="prototype-note">{error}</p>}
    <p className="prototype-note">Compliance gate: this workspace never creates, signs, or verifies an I-9, W-4, Arizona tax form, or employment eligibility by itself. Use the authorized form workflow and retain evidence securely before recording task completion.</p>
  </div>;
}
