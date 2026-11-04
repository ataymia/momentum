"use client";

import {useState} from "react";
import {Download} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {downloadPayrollCsv} from "../../lib/payroll-download";
import {TimecardRecord} from "./timecard-record";
import {Button,Field,Section,StatusPill,hoursBetween} from "../ui";

/** Backdated corrections must remain accessible for employee re-attestation. */
export function EmployeeTimecardHistory(){
 const {data,currentUser,submitTimecard}=useWorkspace();
 const [selectedId,setSelectedId]=useState("");
 const [attest,setAttest]=useState(false);
 const [note,setNote]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 if(!currentUser||currentUser.role==="Customer")return null;
 const myCards=data.timecards.filter(c=>c.userId===currentUser.id).sort((a,b)=>b.weekEnd.localeCompare(a.weekEnd));
 const selected=myCards.find(c=>c.id===selectedId);
 const entries=selected?data.timeEntries.filter(e=>e.userId===currentUser.id&&e.date>=selected.weekStart&&e.date<=selected.weekEnd):[];
 const incomplete=entries.some(e=>!e.clockOut||Boolean(e.mealStart&&!e.mealEnd)||
   Boolean(e.note?.includes("Automatically closed at Arizona midnight")&&e.source!=="Manual correction"));
 const submit=()=>{
  if(!selected||!["Open","Returned"].includes(selected.status)||!attest)return;
  if(incomplete){setError("Resolve missing clock-outs and unfinished meals before submitting this week.");return;}
  if(selected.status==="Returned"&&note.trim().length<8){setError("Explain the change or confirm what you reviewed before re-attesting.");return;}
  submitTimecard(selected.id,note.trim());
  setError("");setNotice("Submission requested. Confirm the card changes to Submitted; a manager must approve it again.");
  setAttest(false);setNote("");
 };
 const exportHistory=()=>downloadPayrollCsv("my-timecards.csv",myCards.map(card=>{
  const rows=data.timeEntries.filter(e=>e.userId===currentUser.id&&e.date>=card.weekStart&&e.date<=card.weekEnd);
  return {weekStart:card.weekStart,weekEnd:card.weekEnd,status:card.status,
   hours:Math.round(rows.reduce((n,e)=>n+hoursBetween(e.clockIn,e.clockOut,e.breakMinutes),0)*100)/100,
   attested:card.attested?"Yes":"No",returnedReason:card.returnReason??"",
   submittedAt:card.submittedAt??"",approvedAt:card.approvedAt??""};
 }),["weekStart","weekEnd","status","hours","attested","returnedReason","submittedAt","approvedAt"]);
 return <Section title="My timecard history" description="Open any previous week, review corrected shifts, and re-attest cards returned by management.">
  <div className="request-actions">
    <Button variant="secondary" size="sm" icon={<Download size={14}/>} disabled={!myCards.length} onClick={exportHistory}>Download my timecards</Button>
  </div>
  <div className="company-request-list">
   {myCards.slice(0,80).map(card=><article key={card.id}>
     <div><small>{card.weekStart} to {card.weekEnd}</small>
       <strong>{card.status==="Returned"?"Needs your review":"Weekly timecard"}</strong>
       <p>{card.returnReason??(card.attested?"Employee attested":"Awaiting attestation")}</p></div>
     <StatusPill tone={card.status==="Returned"?"warning":card.status==="Manager approved"||card.status==="Payroll ready"?"success":"info"}>{card.status}</StatusPill>
     <Button size="sm" variant="secondary" onClick={()=>{
       setSelectedId(value=>value===card.id?"":card.id);setAttest(false);setNote("");setError("");setNotice("");
     }}>{selectedId===card.id?"Close":"View week"}</Button>
   </article>)}
   {!myCards.length&&<p>You have no recorded timecards.</p>}
   {myCards.length>80&&<p className="form-hint">Showing the most recent 80 weeks.</p>}
  </div>
  {selected&&<div className="timecard-employee-history">
    <TimecardRecord timecardId={selected.id}/>
    {["Open","Returned"].includes(selected.status)&&<div className="form-grid">
      {selected.status==="Returned"&&<Field label="What did you verify or correct?">
        <textarea rows={3} value={note} onChange={event=>setNote(event.target.value)}
          placeholder="I reviewed my corrected shifts and confirmed the times."/>
      </Field>}
      <label className="field--full"><input type="checkbox" checked={attest} onChange={event=>setAttest(event.target.checked)}/>
        I reviewed these entries and confirm they accurately reflect my worked time.</label>
      <Button disabled={!attest||incomplete||(selected.status==="Returned"&&note.trim().length<8)}
        onClick={submit}>{selected.status==="Returned"?"Re-attest and submit corrected week":"Attest and submit week"}</Button>
      {incomplete&&<p className="form-hint">This week has incomplete punch records. Correct those first.</p>}
    </div>}
  </div>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {notice&&<p className="form-notice" role="status">{notice}</p>}
 </Section>;
}
