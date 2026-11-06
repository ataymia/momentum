"use client";

import {useMemo,useState} from "react";
import {ArrowUpDown,Download,Search,Clock3} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useNavigationRoute,navigateToRoute} from "../../lib/navigation-store";
import {downloadCsv} from "../../lib/browser-export";

type SortField="date"|"employee"|"clockIn"|"clockOut"|"source"|"state";
export function HrAttendanceExperience(){
 const {scope,data,currentUser}=useWorkspace(),route=useNavigationRoute();
 const [query,setQuery]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [userFilter,setUserFilter]=useState("all"),[stateFilter,setStateFilter]=useState("all");
 const [sort,setSort]=useState<SortField>("date"),[desc,setDesc]=useState(true);
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
 <><div className="prototype-domain-statbar"><article><small>Visible clock entries</small><strong>{scope.timeEntries.length}</strong></article><article><small>Punches without clock-out</small><strong>{scope.timeEntries.filter(e=>!e.clockOut).length}</strong></article><article><small>Corrected punches</small><strong>{scope.timeEntries.filter(e=>Boolean(e.corrections?.length)).length}</strong></article><article><small>Submitted timecards</small><strong>{visibleTimecards.filter(t=>t.status==="Submitted").length}</strong></article></div>
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
 <section className="prototype-panel"><h2>Weekly timecard status</h2><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Week</th><th>Status</th><th>Attested</th><th>Approval</th></tr></thead><tbody>{visibleTimecards.sort((a,b)=>b.weekStart.localeCompare(a.weekStart)).map(t=><tr key={t.id}><td>{nameFor(t.userId)}</td><td>{t.weekStart} – {t.weekEnd}</td><td>{t.status}</td><td>{t.attested?"Yes":"No"}</td><td>{t.approvedAt??"Not approved"}</td></tr>)}</tbody></table></div>
 <p className="prototype-note">Editing, timecard attestation, location evidence and payroll approval remain in their controlled source workflows. This directory does not post earnings.</p></section></>}
 </div>;
}
