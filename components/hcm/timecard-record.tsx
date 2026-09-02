"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, UserRound } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { RecordHistory } from "../audit/record-history";
import { StatusPill, formatDate, hoursBetween } from "../ui";

const tone=(status:string)=>["Manager approved","Payroll ready"].includes(status)?"success" as const:status==="Returned"?"danger" as const:status==="Submitted"?"info" as const:"neutral" as const;

export function TimecardRecord({timecardId,history=true}:{timecardId:string;history?:boolean}){
  const {data}=useWorkspace();
  const card=data.timecards.find((item)=>item.id===timecardId);
  if(!card)return <div className="review-empty"><AlertTriangle size={24}/><h3>Timecard not found</h3><p>The source record is no longer available in this workspace.</p></div>;
  const employee=data.users.find((user)=>user.id===card.userId);
  const approver=data.users.find((user)=>user.id===card.approverId);
  const returnedBy=data.users.find((user)=>user.id===card.returnedBy);
  const entries=data.timeEntries.filter((entry)=>entry.userId===card.userId&&entry.date>=card.weekStart&&entry.date<=card.weekEnd).sort((a,b)=>a.date.localeCompare(b.date));
  const total=entries.reduce((sum,entry)=>sum+hoursBetween(entry.clockIn,entry.clockOut,entry.breakMinutes),0);
  const incomplete=entries.filter((entry)=>!entry.clockOut||Boolean(entry.mealStart&&!entry.mealEnd));
  const corrected=entries.filter((entry)=>entry.source==="Manual correction"||Boolean(entry.corrections?.length));
  return <div className="timecard-record">
    <section className="timecard-record__summary">
      <div className="timecard-record__person"><span><UserRound size={20}/></span><div><small>Employee</small><strong>{employee?.name??"Employee"}</strong><p>{formatDate(card.weekStart,{month:"short",day:"numeric"})} – {formatDate(card.weekEnd,{month:"short",day:"numeric",year:"numeric"})}</p></div></div>
      <div className="timecard-record__metric"><small>Total hours</small><strong>{total.toFixed(2)}</strong><span>{entries.length} daily record{entries.length===1?"":"s"}</span></div>
      <div className="timecard-record__metric"><small>Status</small><StatusPill tone={tone(card.status)}>{card.status}</StatusPill><span>{card.attested?"Employee attested":"Attestation required"}</span></div>
      <div className="timecard-record__metric"><small>Review checks</small><strong>{incomplete.length===0?"Complete":"Needs attention"}</strong><span>{corrected.length} corrected entr{corrected.length===1?"y":"ies"}</span></div>
    </section>
    {card.status==="Returned"&&<div className="timecard-return-banner"><AlertTriangle size={18}/><div><strong>Returned for correction</strong><p>{card.returnReason||"The manager returned this timecard for correction. Review the daily entries before resubmitting."}</p><small>{card.returnedAt?formatDate(card.returnedAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"Return date not recorded"}{returnedBy?` · ${returnedBy.name}`:""}</small></div></div>}
    <div className="timecard-record__checks"><div><CheckCircle2 size={16}/><span>Employee attestation</span><strong>{card.attested?"Complete":"Required"}</strong></div><div><Clock3 size={16}/><span>Open or incomplete punches</span><strong>{incomplete.length}</strong></div><div><FileCheck2 size={16}/><span>Manual corrections</span><strong>{corrected.length}</strong></div></div>
    <div className="record-review__table-wrap"><table className="record-review__table timecard-record__table"><thead><tr><th>Date</th><th>Clock in</th><th>Meal</th><th>Clock out</th><th>Hours</th><th>Source</th><th>Note</th></tr></thead><tbody>{entries.map((entry)=><tr key={entry.id}><td>{formatDate(entry.date,{weekday:"short",month:"short",day:"numeric"})}</td><td>{entry.clockIn}</td><td>{entry.mealStart&&entry.mealEnd?`${entry.mealStart}–${entry.mealEnd}`:`${entry.breakMinutes} min`}</td><td>{entry.clockOut??"Missing"}</td><td>{hoursBetween(entry.clockIn,entry.clockOut,entry.breakMinutes).toFixed(2)}</td><td>{entry.source}</td><td>{entry.note??(entry.corrections?.length?`${entry.corrections.length} correction${entry.corrections.length===1?"":"s"}`:"—")}</td></tr>)}</tbody></table></div>
    <div className="timecard-record__decision"><div><small>Submitted</small><strong>{card.submittedAt?formatDate(card.submittedAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"Not submitted"}</strong></div><div><small>Manager decision</small><strong>{card.status==="Manager approved"||card.status==="Payroll ready"?`${approver?.name??"Manager"} approved`:card.status==="Returned"?"Returned for correction":"Pending"}</strong></div></div>
    {history&&<RecordHistory entityType="Workspace.timecards" entityId={card.id} limit={10}/>} 
  </div>;
}
