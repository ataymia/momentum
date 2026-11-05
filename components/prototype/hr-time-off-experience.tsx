"use client";
import {type FormEvent,useState} from "react";
import {Download,CalendarDays} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useHcm} from "../../lib/hcm-context";
import {activePtoAssignment,appendAudit,ptoBalance,type LeaveRequest} from "../../lib/hcm-engine";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";

const newLeaveRequestId=()=>`leave-${crypto.randomUUID()}`;

export function HrTimeOffExperience(){
 const {currentUser,data}=useWorkspace();const {hcm,setHcm}=useHcm();
 const runtime=useRuntimeMode();const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local";
 const [start,setStart]=useState("");const [end,setEnd]=useState("");
 const [hours,setHours]=useState("");const [reason,setReason]=useState("");
 const [notice,setNotice]=useState("");const [error,setError]=useState("");
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee access required.</div>;
 const assignment=activePtoAssignment(hcm,currentUser.id);
 const balance=assignment?ptoBalance(hcm,currentUser.id,assignment.policyId):null;
 const myRequests=hcm.leaveRequests.filter(r=>r.userId===currentUser.id).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt));
 const rows=currentUser.role==="Administrator"?hcm.leaveRequests:myRequests;
 const submit=(event:FormEvent)=>{
  event.preventDefault();setError("");setNotice("");
  if(!writeEnabled){setError("Read-only prototype: submitting leave requires isolated local demo mode.");return;}
  const requestedHours=Number(hours);
  if(!start||!end||end<start||!Number.isFinite(requestedHours)||requestedHours<=0||!reason.trim()){setError("Enter valid dates, hours and a reason.");return;}
  const id=newLeaveRequestId();
  const record:LeaveRequest={id,userId:currentUser.id,policyId:assignment?.policyId,startDate:start,endDate:end,requestedHours,reason:reason.trim(),submittedAt:new Date().toISOString(),status:"Submitted"};
  setHcm(s=>appendAudit({...s,leaveRequests:[record,...s.leaveRequests]},{actorId:currentUser.id,action:"Time-off request submitted",entityType:"LeaveRequest",entityId:id,reason:reason.trim()}));
  setStart("");setEnd("");setHours("");setReason("");
  setNotice("Local demo request submitted to HR validation. Verify the recorded status below; no live employer notification was sent.");
 };
 const exportHistory=()=>downloadCsv("momentum-leave-register.csv",rows.map(r=>({employee:data.users.find(u=>u.id===r.userId)?.name??"Employee",start:r.startDate,end:r.endDate,hours:r.requestedHours,status:r.status,reason:r.reason,submittedAt:r.submittedAt,decision:r.decisionNote??""})),["employee","start","end","hours","status","reason","submittedAt","decision"]);
 return <div className="prototype-domain prototype-domain--people">
 <header className="prototype-heading"><h1>Time-off requests</h1><p>Employee leave requests, balances and auditable history. Managers review and approve from the existing controlled HR workflow.</p></header>
 <div className="prototype-domain-statbar">
  <article><CalendarDays size={18}/><small>Available PTO</small><strong>{balance===null?"Not configured":balance.toFixed(2)+" hours"}</strong></article>
  <article><small>My pending requests</small><strong>{myRequests.filter(r=>r.status==="Submitted").length}</strong></article>
 </div>
 <div className="prototype-columns">
  <section className="prototype-panel"><h2>Request time off</h2><form className="prototype-controls" onSubmit={submit}>
  <label>Start <input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
  <label>End <input type="date" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
  <label>Hours <input type="number" min="0.25" step="0.25" required value={hours} onChange={e=>setHours(e.target.value)}/></label>
  <label>Reason <textarea required rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <button type="submit" disabled={!writeEnabled}>Submit request</button></form>
  {!writeEnabled&&<p className="prototype-note">Connected environments are read-only in this redesign prototype.</p>}</section>
  <section className="prototype-panel"><h2>My request history</h2>{myRequests.map(r=><div className="prototype-work-list" key={r.id}><strong>{r.startDate} to {r.endDate}</strong><span>{r.requestedHours} hours · {r.status}</span></div>)}{!myRequests.length&&<p>No requests recorded.</p>}</section>
 </div>
 <section className="prototype-panel"><h2>Records & controls</h2><button type="button" disabled={!rows.length} onClick={exportHistory}><Download size={15}/> Export authorized leave history</button>
 <button type="button" onClick={()=>navigateToRoute("/people")}>HR review and self-service</button>
 <p className="prototype-note">A submitted request is not approved leave. Approval and PTO ledger changes require the existing authorized review workflow.</p></section>
 {notice&&<p role="status" className="prototype-note">{notice}</p>}{error&&<p role="alert" className="prototype-note">{error}</p>}
 </div>;
}
