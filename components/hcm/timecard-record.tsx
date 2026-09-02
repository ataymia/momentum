"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, Pencil, UserRound } from "lucide-react";
import { useState } from "react";
import { useHcm } from "../../lib/hcm-context";
import { useWorkspace } from "../../lib/workspace-context";
import type { TimeEntry } from "../../lib/types";
import { RecordHistory } from "../audit/record-history";
import { Button, Field, Modal, StatusPill, formatDate, hoursBetween } from "../ui";

const tone=(status:string)=>["Manager approved","Payroll ready"].includes(status)?"success" as const:status==="Returned"?"danger" as const:status==="Submitted"?"info" as const:"neutral" as const;
type CorrectionForm={clockIn:string;mealStart:string;mealEnd:string;clockOut:string;breakMinutes:string;reason:string};
const blank:CorrectionForm={clockIn:"",mealStart:"",mealEnd:"",clockOut:"",breakMinutes:"0",reason:""};
const minutes=(value:string)=>{const[hour,minute]=value.split(":").map(Number);return hour*60+minute;};

export function TimecardRecord({timecardId,history=true}:{timecardId:string;history?:boolean}){
  const {data,currentUser,correctTimeEntry}=useWorkspace();
  const {hcm}=useHcm();
  const [editingId,setEditingId]=useState<string|null>(null);
  const [form,setForm]=useState<CorrectionForm>(blank);
  const [error,setError]=useState("");
  const card=data.timecards.find((item)=>item.id===timecardId);
  if(!card)return <div className="review-empty"><AlertTriangle size={24}/><h3>Timecard not found</h3><p>The source record is no longer available in this workspace.</p></div>;
  const employee=data.users.find((user)=>user.id===card.userId);
  const approver=data.users.find((user)=>user.id===card.approverId);
  const returnedBy=data.users.find((user)=>user.id===card.returnedBy);
  const reviewEvents=hcm.audit.filter((event)=>event.entityType==="TimecardReview"&&event.entityId===card.id).sort((a,b)=>b.at.localeCompare(a.at));
  const lastReturn=reviewEvents.find((event)=>event.action==="Timecard returned");
  const lastResubmission=reviewEvents.find((event)=>event.action==="Timecard resubmitted");
  const entries=data.timeEntries.filter((entry)=>entry.userId===card.userId&&entry.date>=card.weekStart&&entry.date<=card.weekEnd).sort((a,b)=>a.date.localeCompare(b.date));
  const total=entries.reduce((sum,entry)=>sum+hoursBetween(entry.clockIn,entry.clockOut,entry.breakMinutes),0);
  const incomplete=entries.filter((entry)=>!entry.clockOut||Boolean(entry.mealStart&&!entry.mealEnd));
  const corrected=entries.filter((entry)=>entry.source==="Manual correction"||Boolean(entry.corrections?.length));
  const returnReason=card.returnReason||lastReturn?.reason;
  const returnedActor=returnedBy??data.users.find((user)=>user.id===lastReturn?.actorId);
  const canCorrect=Boolean(currentUser&&currentUser.id===card.userId&&(card.status==="Returned"||card.status==="Open"));
  const editing=entries.find((entry)=>entry.id===editingId);
  const openCorrection=(entry:TimeEntry)=>{setEditingId(entry.id);setError("");setForm({clockIn:entry.clockIn,mealStart:entry.mealStart??"",mealEnd:entry.mealEnd??"",clockOut:entry.clockOut??"",breakMinutes:String(entry.breakMinutes),reason:""});};
  const saveCorrection=()=>{
    if(!editing)return;
    if(!form.reason.trim()){setError("Explain why this punch is being corrected.");return;}
    if(!form.clockIn){setError("Clock-in time is required.");return;}
    if(Boolean(form.mealStart)!==Boolean(form.mealEnd)){setError("Meal start and meal end must both be entered or both be blank.");return;}
    if(form.clockOut&&minutes(form.clockOut)<minutes(form.clockIn)){setError("Clock-out cannot be earlier than clock-in.");return;}
    if(form.mealStart&&form.mealEnd&&(minutes(form.mealStart)<minutes(form.clockIn)||minutes(form.mealEnd)<minutes(form.mealStart)||(form.clockOut&&minutes(form.mealEnd)>minutes(form.clockOut)))){setError("Meal times must fall between clock-in and clock-out in the correct order.");return;}
    const breakMinutes=Number(form.breakMinutes||0);
    if(!Number.isFinite(breakMinutes)||breakMinutes<0){setError("Break minutes must be zero or greater.");return;}
    const same=editing.clockIn===form.clockIn&&(editing.mealStart??"")===form.mealStart&&(editing.mealEnd??"")===form.mealEnd&&(editing.clockOut??"")===form.clockOut&&editing.breakMinutes===breakMinutes;
    if(same){setError("Change at least one time or break value before saving.");return;}
    correctTimeEntry(editing.id,{clockIn:form.clockIn,mealStart:form.mealStart||undefined,mealEnd:form.mealEnd||undefined,clockOut:form.clockOut||undefined,breakMinutes},form.reason.trim());
    setEditingId(null);setForm(blank);setError("");
  };
  return <div className="timecard-record">
    <section className="timecard-record__summary">
      <div className="timecard-record__person"><span><UserRound size={20}/></span><div><small>Employee</small><strong>{employee?.name??"Employee"}</strong><p>{formatDate(card.weekStart,{month:"short",day:"numeric"})} – {formatDate(card.weekEnd,{month:"short",day:"numeric",year:"numeric"})}</p></div></div>
      <div className="timecard-record__metric"><small>Total hours</small><strong>{total.toFixed(2)}</strong><span>{entries.length} daily record{entries.length===1?"":"s"}</span></div>
      <div className="timecard-record__metric"><small>Status</small><StatusPill tone={tone(card.status)}>{card.status}</StatusPill><span>{card.status==="Returned"?"Re-attestation required":card.attested?"Employee attested":"Attestation required"}</span></div>
      <div className="timecard-record__metric"><small>Review checks</small><strong>{incomplete.length===0?"Complete":"Needs attention"}</strong><span>{corrected.length} corrected entr{corrected.length===1?"y":"ies"}</span></div>
    </section>
    {card.status==="Returned"&&<div className="timecard-return-banner"><AlertTriangle size={18}/><div><strong>Returned for correction</strong><p>{returnReason||"The manager returned this timecard for correction. Review the daily entries before resubmitting."}</p><small>{card.returnedAt?formatDate(card.returnedAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):lastReturn?formatDate(lastReturn.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"Return date not recorded"}{returnedActor?` · ${returnedActor.name}`:""}</small></div></div>}
    {lastResubmission?.reason&&card.status!=="Returned"&&<div className="timecard-resubmit-note"><CheckCircle2 size={17}/><div><strong>Employee resubmission note</strong><p>{lastResubmission.reason}</p><small>{formatDate(lastResubmission.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</small></div></div>}
    <div className="timecard-record__checks"><div><CheckCircle2 size={16}/><span>Employee attestation</span><strong>{card.status==="Returned"?"Required again":card.attested?"Complete":"Required"}</strong></div><div><Clock3 size={16}/><span>Open or incomplete punches</span><strong>{incomplete.length}</strong></div><div><FileCheck2 size={16}/><span>Manual corrections</span><strong>{corrected.length}</strong></div></div>
    <div className="record-review__table-wrap"><table className="record-review__table timecard-record__table"><thead><tr><th>Date</th><th>Clock in</th><th>Meal</th><th>Clock out</th><th>Hours</th><th>Source</th><th>Note</th>{canCorrect&&<th/>}</tr></thead><tbody>{entries.map((entry)=><tr key={entry.id}><td>{formatDate(entry.date,{weekday:"short",month:"short",day:"numeric"})}</td><td>{entry.clockIn}</td><td>{entry.mealStart&&entry.mealEnd?`${entry.mealStart}–${entry.mealEnd}`:`${entry.breakMinutes} min`}</td><td>{entry.clockOut??"Missing"}</td><td>{hoursBetween(entry.clockIn,entry.clockOut,entry.breakMinutes).toFixed(2)}</td><td>{entry.source}</td><td>{entry.note??(entry.corrections?.length?`${entry.corrections.length} correction${entry.corrections.length===1?"":"s"}`:"—")}</td>{canCorrect&&<td><Button size="sm" variant="ghost" icon={<Pencil size={13}/>} onClick={()=>openCorrection(entry)}>Correct</Button></td>}</tr>)}</tbody></table></div>
    {corrected.length>0&&<div className="timecard-correction-history"><h4>Correction history</h4>{corrected.flatMap((entry)=>(entry.corrections??[]).map((correction,index)=><article key={`${entry.id}-${correction.at}-${index}`}><div><strong>{formatDate(entry.date,{weekday:"short",month:"short",day:"numeric"})}</strong><p>{correction.reason}</p></div><small>Before: {correction.before.clockIn} · {correction.before.mealStart&&correction.before.mealEnd?`${correction.before.mealStart}–${correction.before.mealEnd}`:`${correction.before.breakMinutes} min break`} · {correction.before.clockOut??"missing clock-out"}<br/>{formatDate(correction.at,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})} · {data.users.find((user)=>user.id===correction.by)?.name??"Employee"}</small></article>)))}</div>}
    <div className="timecard-record__decision"><div><small>Submitted</small><strong>{card.submittedAt?formatDate(card.submittedAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"Not submitted"}</strong></div><div><small>Manager decision</small><strong>{card.status==="Manager approved"||card.status==="Payroll ready"?`${approver?.name??"Manager"} approved`:card.status==="Returned"?"Returned for correction":"Pending"}</strong></div></div>
    {history&&<RecordHistory entityType="Workspace.timecards" entityId={card.id} limit={10}/>} 
    <Modal open={Boolean(editing)} title={editing?`Correct ${formatDate(editing.date,{weekday:"long",month:"short",day:"numeric"})}`:"Correct time entry"} description="Corrections are preserved with the prior values, employee, timestamp, and reason." onClose={()=>{setEditingId(null);setError("")}} footer={<><Button variant="ghost" onClick={()=>{setEditingId(null);setError("")}}>Cancel</Button><Button onClick={saveCorrection}>Save correction</Button></>}><div className="form-grid"><Field label="Clock in"><input type="time" value={form.clockIn} onChange={(event)=>setForm({...form,clockIn:event.target.value})}/></Field><Field label="Clock out"><input type="time" value={form.clockOut} onChange={(event)=>setForm({...form,clockOut:event.target.value})}/></Field><Field label="Meal start"><input type="time" value={form.mealStart} onChange={(event)=>setForm({...form,mealStart:event.target.value})}/></Field><Field label="Meal end"><input type="time" value={form.mealEnd} onChange={(event)=>setForm({...form,mealEnd:event.target.value})}/></Field><Field label="Break minutes"><input type="number" min="0" step="1" value={form.breakMinutes} onChange={(event)=>setForm({...form,breakMinutes:event.target.value})}/></Field><Field label="Reason for correction" className="field--full"><textarea rows={3} value={form.reason} onChange={(event)=>setForm({...form,reason:event.target.value})} placeholder="What was wrong and what was corrected?"/></Field>{error&&<div className="form-callout field--full"><AlertTriangle size={16}/><p>{error}</p></div>}</div></Modal>
  </div>;
}
