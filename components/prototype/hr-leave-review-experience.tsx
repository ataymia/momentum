"use client";

import {useRef,useState} from "react";
import {useHcm} from "../../lib/hcm-context";
import {activePtoAssignment,appendAudit,canManageEmployee,ptoBalance,type LeaveRequest} from "../../lib/hcm-engine";
import {HCM_STORAGE_KEY} from "../../lib/hcm-engine";
import {useWorkspace} from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {momentumStorage} from "../../lib/persistence";
import {decideConnectedLeaveRequest,type TrustedLeaveDecisionPayload} from "../../lib/firebase-hr-leave";
import {navigateToRoute} from "../../lib/navigation-store";
import {arizonaDateKey} from "../../lib/date-time";

/** HR review owns manager decisions. Employee leave submission belongs exclusively
 * to personal Account and keeps its existing authenticated source workflow.
 */
export function HrLeaveReviewExperience(){
 const {data,currentUser}=useWorkspace();
 const {hcm,setHcm}=useHcm();
 const runtime=useRuntimeMode();
 const firebase=useFirebaseSessionOptional();
 const demo=runtime.isDemo&&momentumStorage.mode()==="local";
 const connected=!runtime.isDemo&&momentumStorage.mode()==="firestore"&&firebase?.status==="ready"&&Boolean(firebase.session);
 const [filter,setFilter]=useState("Submitted"),[query,setQuery]=useState("");
 const [selectedId,setSelectedId]=useState("");
 const [note,setNote]=useState(""),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const requestRef=useRef<{fingerprint:string;id:string}|null>(null);
 if(!currentUser||!["Administrator","Sales Manager"].includes(currentUser.role))
  return <div className="prototype-empty">Authorized HR review is required. Submit your own leave from My Account.</div>;
 const assigned=hcm.leaveRequests.filter(request=>request.userId!==currentUser.id&&
   (currentUser.role==="Administrator"||canManageEmployee(currentUser,request.userId,data)));
 const records=assigned.filter(r=>(filter==="all"||r.status===filter)&&
   [r.reason,r.id,r.status,data.users.find(u=>u.id===r.userId)?.name??""].join(" ").toLowerCase().includes(query.toLowerCase()))
   .sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||a.id.localeCompare(b.id));
 const selected=assigned.find(r=>r.id===selectedId)??records[0];
 const pending=assigned.filter(r=>r.status==="Submitted");
 const unresolved=assigned.filter(r=>r.status==="Returned");
 const currentBalance=selected?.policyId?ptoBalance(hcm,selected.userId,selected.policyId,selected.startDate):null;
 const assignment=selected?activePtoAssignment(hcm,selected.userId,selected.startDate):undefined;
 const paidReady=Boolean(selected?.policyId&&assignment?.policyId===selected.policyId&&
   currentBalance!==null&&Number.isFinite(currentBalance)&&currentBalance>=selected.requestedHours&&
   Number.isFinite(selected.requestedHours)&&selected.requestedHours>0);
 const canReview=selected?.status==="Submitted"&&Boolean(demo||connected);
 const decision=async(status:"Approved"|"Returned")=>{
  if(!selected||!canReview||busy)return;
  const reason=note.trim();
  if(reason.length<5){setError("Enter at least five characters explaining the decision.");return;}
  if(status==="Approved"&&!paidReady){
   setError("Cannot approve paid leave without a matching active PTO policy and sufficient verified balance. Return the request for clarification.");return;
  }
  setError("");setMessage("");
  const payload:TrustedLeaveDecisionPayload={employeeUid:selected.userId,
   leaveId:selected.id,submittedAt:selected.submittedAt,status,note:reason};
  if(connected&&firebase?.session){
   const fingerprint=JSON.stringify(payload);
   const requestId=requestRef.current?.fingerprint===fingerprint?requestRef.current.id:crypto.randomUUID();
   requestRef.current={fingerprint,id:requestId};
   setBusy(true);
   try{
    const receipt=await decideConnectedLeaveRequest(firebase.session,payload,requestId);
    requestRef.current=null;
    const sync=await momentumStorage.refreshKeys([HCM_STORAGE_KEY]);
    setMessage(sync.ok?
      "HR confirmed "+receipt.status.toLowerCase()+" leave "+receipt.leaveId+". Source records refreshed; payroll approval is separate.":
      "HR committed leave "+receipt.leaveId+", but this device has not refreshed the authoritative record. Do not repeat the decision.");
    setNote("");
   }catch(e){
    setError(e instanceof Error?e.message:"HR did not confirm the decision. Review source history before retrying.");
   }finally{setBusy(false);}
   return;
  }
  if(!demo)return;
  const reviewerId=currentUser.id;
  const now=new Date().toISOString();
  setHcm(state=>{
   const current=state.leaveRequests.find(r=>r.id===selected.id&&r.userId===selected.userId);
   if(!current||current.status!=="Submitted")return state;
   if(status==="Approved"&&(!current.policyId||
     !Number.isFinite(ptoBalance(state,current.userId,current.policyId,current.startDate))||
     ptoBalance(state,current.userId,current.policyId,current.startDate)<current.requestedHours||
     state.ptoLedger.some(entry=>entry.type==="Used"&&entry.requestId===current.id)))return state;
   const leaveRequests=state.leaveRequests.map(row=>row.id!==current.id?row:{
     ...row,status,reviewerId,decidedAt:now,decisionNote:reason,
   });
   const ptoLedger=status==="Approved"&&current.policyId?
     [{id:"pto-used-"+crypto.randomUUID(),userId:current.userId,policyId:current.policyId,
       date:current.startDate,type:"Used" as const,hours:-Math.abs(current.requestedHours),
       requestId:current.id,note:"Approved leave "+current.startDate+" through "+current.endDate,
       createdBy:reviewerId,createdAt:now},...state.ptoLedger]:state.ptoLedger;
   return appendAudit({...state,leaveRequests,ptoLedger},{
     actorId:reviewerId,entityType:"LeaveRequest",entityId:current.id,
     action:"Leave request "+status.toLowerCase(),reason});
  });
  setNote("");
  setMessage("Local demo decision requested. Verify the source request and PTO ledger before treating it as saved.");
 };
 return <div className="prototype-domain prototype-domain--people">
  <header className="prototype-heading"><h1>HR · Time Off & Leave Review</h1>
    <p>Manage employee leave requests, manager decisions and recorded PTO usage. Staff submit their own time-off requests under My Account, not in this administration queue.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>Submitted awaiting HR review</small><strong>{pending.length}</strong></article>
   <article><small>Returned for employee correction</small><strong>{unresolved.length}</strong></article>
   <article><small>Approved in visible history</small><strong>{assigned.filter(r=>r.status==="Approved").length}</strong></article>
  </div>
  <section className="prototype-panel"><h2>Employee leave request queue</h2>
   <div className="prototype-controls">
    <label>Search requests <input type="search" aria-label="Search HR leave requests" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, ID or reason"/></label>
    <label>Status <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>
      {["Submitted","Approved","Returned","Cancelled"].map(v=><option key={v}>{v}</option>)}</select></label>
    <button type="button" onClick={()=>navigateToRoute("/people/attendance")}>Review submitted timecards</button>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table">
    <thead><tr><th>Employee</th><th>Dates</th><th>Hours</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
    <tbody>{records.map(r=><tr key={r.id}>
      <td>{data.users.find(u=>u.id===r.userId)?.name??"Unlinked employee"}</td>
      <td>{r.startDate} to {r.endDate}</td><td>{r.requestedHours}</td>
      <td>{r.status}</td><td>{r.submittedAt.slice(0,10)}</td>
      <td><button type="button" className="prototype-link" onClick={()=>{setSelectedId(r.id);setError("");setMessage("");setNote("");}}>Review request</button></td>
    </tr>)}</tbody></table></div>
   {!records.length&&<p className="prototype-note">No employee leave requests match this search. An empty queue does not establish that all employees have submitted weekly timecards.</p>}
  </section>
  {selected&&<section className="prototype-panel">
    <h2>Review {data.users.find(u=>u.id===selected.userId)?.name??"employee"} · {selected.id}</h2>
    <dl className="prototype-facts">
     <div><dt>Requested</dt><dd>{selected.startDate} through {selected.endDate}</dd></div>
     <div><dt>Hours</dt><dd>{selected.requestedHours}</dd></div>
     <div><dt>Policy</dt><dd>{selected.policyId??"No paid PTO policy linked"}</dd></div>
     <div><dt>Available verified hours</dt><dd>{currentBalance===null?"Not configured":currentBalance.toFixed(2)}</dd></div>
     <div><dt>Current status</dt><dd>{selected.status}</dd></div>
     <div><dt>Reviewer</dt><dd>{selected.reviewerId?data.users.find(u=>u.id===selected.reviewerId)?.name??selected.reviewerId:"Not reviewed"}</dd></div>
    </dl>
    <p><strong>Employee reason:</strong> {selected.reason}</p>
    {selected.decisionNote&&<p><strong>Decision record:</strong> {selected.decisionNote}</p>}
    {canReview&&<div className="prototype-controls">
      <label>Decision explanation <textarea aria-label="HR leave decision explanation" value={note} onChange={e=>setNote(e.target.value)} rows={3} placeholder="Explain approval evidence or required correction"/></label>
      <button type="button" className="prototype-primary-action" disabled={busy||note.trim().length<5||!paidReady} onClick={()=>void decision("Approved")}>{busy?"Confirming…":"Approve verified paid leave"}</button>
      <button type="button" disabled={busy||note.trim().length<5} onClick={()=>void decision("Returned")}>Return for correction</button>
    </div>}
    {!paidReady&&selected.status==="Submitted"&&<p role="status" className="prototype-note">Paid leave approval is held until an active matching policy and sufficient PTO ledger evidence exist. No allowance is assumed from a request alone.</p>}
    {error&&<p role="alert" className="prototype-note">{error}</p>}
    {message&&<p role="status" className="prototype-note">{message}</p>}
  </section>}
  {!demo&&<p className="prototype-note">Connected manager decisions require the authenticated HR backend and a confirmed server receipt. Staging deployment and notification provider verification remain pending.</p>}
  <p className="prototype-note">As of {arizonaDateKey()}, submitted does not mean approved. Leave approval, PTO deduction, scheduling, and payroll settlement have distinct sources.</p>
 </div>;
}
