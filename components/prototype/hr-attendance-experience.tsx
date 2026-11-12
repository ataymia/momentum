"use client";

import {useMemo,useState} from "react";
import {ArrowUpDown,Download,Search,Clock3} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useNavigationRoute,navigateToRoute} from "../../lib/navigation-store";
import {downloadCsv} from "../../lib/browser-export";
import {canReviewApproval} from "../../lib/access";
import {arizonaDateKey} from "../../lib/date-time";
import {canSubmitWeeklyTimecard,weeklyTimecardReview} from "../../lib/weekly-timecard-review";
import {TimecardRecord} from "../hcm/timecard-record";

type SortField="date"|"employee"|"clockIn"|"clockOut"|"source"|"state";
export function HrAttendanceExperience(){
 const {scope,data,currentUser,submitTimecard,decideTimecard}=useWorkspace(),route=useNavigationRoute();
 const [query,setQuery]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [userFilter,setUserFilter]=useState("all"),[stateFilter,setStateFilter]=useState("all");
 const [sort,setSort]=useState<SortField>("date"),[desc,setDesc]=useState(true);
 const [activeCardId,setActiveCardId]=useState(()=>typeof window==="undefined"?"":window.sessionStorage.getItem("momentum-focus-record")??"");
 const [returnReason,setReturnReason]=useState("");
 const [notice,setNotice]=useState("");
 const nameFor=(id:string)=>data.users.find(u=>u.id===id)?.name??"Employee";
 const allowed=new Set(scope.timeEntries.map(t=>t.id));
 const id=route.startsWith("/people/attendance/")?decodeURIComponent(route.slice("/people/attendance/".length).split("/")[0]):undefined;
 const selected=id?scope.timeEntries.find(e=>e.id===id):undefined;
 const entries=useMemo(()=>scope.timeEntries.map(e=>({
    ...e,employee:nameFor(e.userId),state:!e.clockOut?"Open punch":e.corrections?.length?"Corrected":"Complete"
   })).filter(e=>(userFilter==="all"||e.userId===userFilter)&&(stateFilter==="all"||e.state===stateFilter)&&(!from||e.date>=from)&&(!to||e.date<=to)&&
   [e.employee,e.date,e.source,e.note,e.state].join(" ").toLowerCase().includes(query.toLowerCase()))
   .sort((a,b)=>{
    const v=(e:typeof a)=>sort==="employee"?e.employee:sort==="state"?e.state:String(e[sort]??"");
    return (desc?-1:1)*v(a).localeCompare(v(b))||a.id.localeCompare(b.id);
   }),[scope.timeEntries,query,from,to,userFilter,stateFilter,sort,desc,data.users]);
 const users=[...new Set(scope.timeEntries.map(t=>t.userId))].map(id=>({id,name:nameFor(id)})).sort((a,b)=>a.name.localeCompare(b.name));
 const visibleTimecards=scope.timecards;
 const weekly=weeklyTimecardReview(visibleTimecards,scope.timeEntries,arizonaDateKey());
 const activeCard=visibleTimecards.find(t=>t.id===activeCardId);
 const activeApproval=activeCard?data.approvals.find(a=>a.type==="Timecard"&&a.recordId===activeCard.id&&a.status==="Pending"):undefined;
 const canReview=Boolean(currentUser&&activeCard&&activeCard.status==="Submitted"&&activeCard.attested&&activeApproval&&canReviewApproval(data,currentUser,activeApproval));
 const submitCard=(card:typeof visibleTimecards[number])=>{
  if(!currentUser||card.userId!==currentUser.id||card.weekEnd>arizonaDateKey()||
    !canSubmitWeeklyTimecard(card,scope.timeEntries))return;
  submitTimecard(card.id);
  setNotice("Weekly submission requested. Verify the resulting Submitted status before treating it as received.");
 };
 const decideCard=(decision:"Manager approved"|"Returned")=>{
  if(!activeCard||!canReview)return;
  if(decision==="Returned"&&returnReason.trim().length<8)return;
  decideTimecard(activeCard.id,decision,returnReason.trim());
  setNotice(decision==="Returned"?"Correction requested. Review source status and employee notice.":"Approval requested. Verify source status before payroll release.");
  setReturnReason("");
 };
 const exportRows=()=>downloadCsv("momentum-visible-attendance.csv",entries.map(e=>({employee:e.employee,date:e.date,clockIn:e.clockIn,clockOut:e.clockOut??"",mealStart:e.mealStart??"",mealEnd:e.mealEnd??"",breakMinutes:e.breakMinutes,source:e.source,state:e.state,correctionCount:e.corrections?.length??0})),["employee","date","clockIn","clockOut","mealStart","mealEnd","breakMinutes","source","state","correctionCount"]);
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee authentication required.</div>;
 if(id&&!allowed.has(id))return <div className="prototype-domain"><h1>Attendance record unavailable</h1><p>This punch does not exist in your employee/management scope.</p><button onClick={()=>navigateToRoute("/people/attendance")}>Back to attendance</button></div>;
 return <div className="prototype-domain prototype-domain--people">
 <header className="prototype-heading"><h1><Clock3 size={18}/> {selected?"Attendance record":"Attendance & timecards"}</h1><p>Scoped punch evidence, corrections and weekly submission states. Payroll hours and overtime are not inferred from incomplete clock records.</p></header>
 {selected?<><section className="prototype-panel"><h2>{nameFor(selected.userId)} · {selected.date}</h2>
 <dl className="prototype-facts"><div><dt>Clock in</dt><dd>{selected.clockIn}</dd></div><div><dt>Clock out</dt><dd>{selected.clockOut??"Open"}</dd></div><div><dt>Meal start / end</dt><dd>{selected.mealStart??"—"} / {selected.mealEnd??"—"}</dd></div><div><dt>Unpaid break minutes</dt><dd>{selected.breakMinutes}</dd></div><div><dt>Recording source</dt><dd>{selected.source}</dd></div></dl>
 <h3>Correction history</h3>{(selected.corrections??[]).map((c,i)=><div key={c.at+"-"+i} className="prototype-work-list"><strong>{c.reason}</strong><span>Recorded {c.at} by {nameFor(c.by)}</span><span>Previous in {c.before.clockIn} · out {c.before.clockOut??"Open"} · break {c.before.breakMinutes} min</span></div>)}
 {!selected.corrections?.length&&<p className="prototype-note">No correction events recorded. Raw punches are not the same as approved payroll time.</p>}</section>
 <button type="button" onClick={()=>navigateToRoute("/people/attendance")}>Back to attendance register</button></>:
 <><div className="prototype-domain-statbar"><article><small>Visible clock entries</small><strong>{scope.timeEntries.length}</strong></article><article><small>Punches without clock-out</small><strong>{scope.timeEntries.filter(e=>!e.clockOut).length}</strong></article><article><small>Corrected punches</small><strong>{scope.timeEntries.filter(e=>Boolean(e.corrections?.length)).length}</strong></article><article><small>Submitted awaiting review</small><strong>{weekly.submitted.length}</strong></article><article><small>Weekly cards due</small><strong>{weekly.due.length}</strong></article><article><small>Overdue employee submissions</small><strong>{weekly.overdue.length}</strong></article></div>
 <section className="prototype-panel"><h2>Recorded punches</h2><div className="prototype-controls">
 <label className="prototype-search"><Search size={14}/><input aria-label="Search scoped attendance" placeholder="Employee, source, date or note" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <label>Employee <select value={userFilter} onChange={e=>setUserFilter(e.target.value)}><option value="all">All visible</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
 <label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Through <input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
 <label>Status <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="all">All</option>{["Open punch","Corrected","Complete"].map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Sort <select value={sort} onChange={e=>setSort(e.target.value as SortField)}>{["date","employee","clockIn","clockOut","source","state"].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
 <button type="button" onClick={()=>setDesc(d=>!d)}><ArrowUpDown size={14}/> {desc?"Descending":"Ascending"}</button>
 <button type="button" disabled={!entries.length} onClick={exportRows}><Download size={14}/> Export visible punches</button></div>
 <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Date</th><th>In</th><th>Out</th><th>Break</th><th>Source</th><th>Status</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/people/attendance/"+encodeURIComponent(e.id))}>{e.employee}</button></td><td>{e.date}</td><td>{e.clockIn}</td><td>{e.clockOut??"Open"}</td><td>{e.breakMinutes}m</td><td>{e.source}</td><td>{e.state}</td></tr>)}</tbody></table></div>
 {!entries.length&&<p className="prototype-note">No matching punch records for your access scope.</p>}</section>
 <section className="prototype-panel" aria-label="Weekly timecard submissions and review">
  <h2>Weekly timecard submissions & approval queue</h2>
  <p className="prototype-note">Employees must attest and submit each recorded weekly timecard at week end. Unsubmitted and returned weeks remain outstanding. Do not prevent an employee from recording hours solely because a previous week is late.</p>
  {weekly.overdue.length>0&&<p role="alert" className="prototype-note">{weekly.overdue.length} employee timecard(s) are past their recorded week end without a completed submission. These require follow-up, not automatic approval.</p>}
  {weekly.unmatchedPunches.length>0&&<p role="alert" className="prototype-note">{weekly.unmatchedPunches.length} recorded punch(es) do not match any accessible weekly card. HR must reconcile coverage before treating the timecard register as complete.</p>}
  {weekly.uncoveredWeeks.length>0&&<div role="alert" className="prototype-note" aria-label="Missing weekly timecard coverage">
    <strong>{weekly.uncoveredWeeks.length} ended week(s) contain punches but no matching weekly card.</strong>
    <p>Missing source records require HR reconciliation. This does not create an employee submission or payroll approval.</p>
    <ul>{weekly.uncoveredWeeks.map(period=><li key={period.userId+":"+period.weekStart}>{nameFor(period.userId)} · {period.weekStart} to {period.weekEnd} · {period.entryIds.length} uncovered punch(es)</li>)}</ul>
  </div>
  {notice&&<p role="status" className="prototype-note">{notice}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table">
   <thead><tr><th>Employee</th><th>Week</th><th>Workflow</th><th>Attestation</th><th>Submitted</th><th>Approval</th><th>Open record</th></tr></thead>
   <tbody>{[...visibleTimecards].sort((a,b)=>b.weekStart.localeCompare(a.weekStart)).map(t=><tr key={t.id}>
    <td>{nameFor(t.userId)}</td><td>{t.weekStart} – {t.weekEnd}</td>
    <td>{t.status}{["Open","Returned"].includes(t.status)&&t.weekEnd<arizonaDateKey()?" · Overdue":""}</td>
    <td>{t.attested?"Recorded":"Not attested"}</td>
    <td>{t.submittedAt?.slice(0,10)??"Not submitted"}</td>
    <td>{t.approvedAt?.slice(0,10)??"Not approved"}</td>
    <td><button type="button" className="prototype-link" onClick={()=>{setActiveCardId(t.id);setReturnReason("");setNotice("");}}>Review week</button></td>
   </tr>)}</tbody></table></div>
  {!visibleTimecards.length&&<p className="prototype-note">No authorized weekly cards are recorded. Punches without cards still require timekeeping reconciliation.</p>}
  {activeCard&&<section className="prototype-panel" aria-label="Selected weekly timecard">
   <h3>{nameFor(activeCard.userId)} · {activeCard.weekStart} to {activeCard.weekEnd}</h3>
   <p className="prototype-note">Current status: {activeCard.status}. The full punch record, corrections and source history remain visible below.</p>
   {activeCard.returnReason&&<p role="status" className="prototype-note">Manager correction: {activeCard.returnReason}</p>}
   <TimecardRecord timecardId={activeCard.id}/>
   {activeCard.userId===currentUser?.id&&["Open","Returned"].includes(activeCard.status)&&
    <div className="prototype-controls">
      <button type="button" className="prototype-primary-action" disabled={activeCard.weekEnd>arizonaDateKey()||
        !canSubmitWeeklyTimecard(activeCard,scope.timeEntries)} onClick={()=>submitCard(activeCard)}>Attest & submit this week</button>
      {activeCard.weekEnd>arizonaDateKey()&&<p className="prototype-note">Weekly submission opens at the recorded week end ({activeCard.weekEnd}).</p>}
      {activeCard.weekEnd<=arizonaDateKey()&&!canSubmitWeeklyTimecard(activeCard,scope.timeEntries)&&<p className="prototype-note">Resolve open punches or incomplete meals before submitting.</p>}
    </div>}
   {canReview&&<div className="prototype-controls">
     <button type="button" className="prototype-primary-action" onClick={()=>decideCard("Manager approved")}>Approve submitted card</button>
     <label>Return reason <textarea aria-label="Timecard correction instructions" rows={2} value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="Explain the precise correction required (8+ characters)"/></label>
     <button type="button" disabled={returnReason.trim().length<8} onClick={()=>decideCard("Returned")}>Return for correction</button>
    </div>}
   <button type="button" onClick={()=>setActiveCardId("")}>Close weekly record</button>
  </section>}
  <p className="prototype-note">A recorded punch is not a submitted timecard. Manager approval and payroll readiness are separate status transitions; this review does not post earnings.</p></section></>}
 </div>;
}
