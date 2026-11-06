"use client";
import {useMemo,useState} from "react";
import {Target,Download,Search} from "lucide-react";
import {useHcm} from "../../lib/hcm-context";
import {useWorkspace} from "../../lib/workspace-context";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute,useNavigationRoute} from "../../lib/navigation-store";

export function HrPerformanceExperience(){
 const {currentUser,data,scope}=useWorkspace(),{hcm}=useHcm(),path=useNavigationRoute();
 const [query,setQuery]=useState(""),[type,setType]=useState("all"),[status,setStatus]=useState("all");
 const [asc,setAsc]=useState(false);
 const admin=currentUser?.role==="Administrator";
 const allowedIds=useMemo(()=>new Set(admin?data.users.filter(u=>u.role!=="Customer").map(u=>u.id):currentUser?.role==="Sales Manager"?scope.users.map(u=>u.id):currentUser?[currentUser.id]:[]),[admin,currentUser,scope.users,data.users]);
 const names=new Map(data.users.map(u=>[u.id,u.name]));
 const rows=useMemo(()=>{
   const goals=hcm.goals.filter(g=>allowedIds.has(g.userId)).map(g=>({id:g.id,kind:"Goal" as const,userId:g.userId,title:g.title,status:g.status,period:g.periodStart+" to "+g.periodEnd,detail:g.measure+" · target: "+g.target,note:g.progressNote??""}));
   const reviews=hcm.reviews.filter(r=>allowedIds.has(r.userId)).map(r=>({id:r.id,kind:"Review" as const,userId:r.userId,title:hcm.reviewCycles.find(c=>c.id===r.cycleId)?.name??"Performance review",status:r.status,period:hcm.reviewCycles.find(c=>c.id===r.cycleId)?.periodEnd??"",detail:r.rating===undefined?"No approved rating":"Recorded rating "+r.rating,note:admin||r.userId===currentUser?.id?(r.employeeSummary??""):""}));
   return [...goals,...reviews].filter(r=>(type==="all"||r.kind===type)&&(status==="all"||r.status===status)&&[r.title,names.get(r.userId),r.detail,r.period].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(asc?1:-1)*a.period.localeCompare(b.period)||a.id.localeCompare(b.id));
 },[hcm.goals,hcm.reviews,hcm.reviewCycles,allowedIds,admin,currentUser,type,status,query,asc,data.users]);
 const recordId=path.startsWith("/people/performance/")?decodeURIComponent(path.slice("/people/performance/".length).split("/")[0]):undefined;
 const selected=recordId?rows.find(r=>r.id===recordId):undefined;
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee access is required.</div>;
 const exportVisible=()=>downloadCsv("momentum-visible-performance-register.csv",rows.map(r=>({employee:names.get(r.userId)??"Employee",record:r.kind,title:r.title,status:r.status,period:r.period,measure:r.detail})),["employee","record","title","status","period","measure"]);
 return <div className="prototype-domain prototype-domain--people"><header className="prototype-heading"><h1><Target size={18}/> Performance & development</h1><p>Employee and authorized manager views of recorded goals and review cycles. No invented scores or automatic bonus entitlements.</p></header>
 {recordId&&!selected?<p className="prototype-note">The record is not available in your permission scope or current filters.</p>:selected&&<section className="prototype-panel"><h2>{selected.title}</h2><p>{names.get(selected.userId)} · {selected.kind} · {selected.status}</p><p>{selected.period} · {selected.detail}</p>{selected.note&&<p>Recorded note: {selected.note}</p>}<button onClick={()=>navigateToRoute("/people/performance")}>Return to performance</button></section>}
 <div className="prototype-domain-statbar"><article><small>Visible goals</small><strong>{hcm.goals.filter(g=>allowedIds.has(g.userId)).length}</strong></article><article><small>Recorded reviews</small><strong>{hcm.reviews.filter(r=>allowedIds.has(r.userId)).length}</strong></article><article><small>Review cycles</small><strong>{hcm.reviewCycles.length}</strong></article></div>
 <section className="prototype-panel"><h2>Goal and review register</h2><div className="prototype-controls">
 <label className="prototype-search"><Search size={14}/><input aria-label="Search authorized performance" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Employee, goal or measure"/></label>
 <label>Record <select value={type} onChange={e=>setType(e.target.value)}><option value="all">All</option><option>Goal</option><option>Review</option></select></label>
 <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All</option>{[...new Set(rows.map(r=>r.status))].map(s=><option key={s}>{s}</option>)}</select></label>
 <button onClick={()=>setAsc(a=>!a)}>Period {asc?"oldest first":"newest first"}</button>
 <button disabled={!rows.length} onClick={exportVisible}><Download size={14}/> Export scoped records</button></div>
 <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Employee</th><th>Record</th><th>Goal / cycle</th><th>Status</th><th>Period</th><th>Measure / rating</th></tr></thead><tbody>{rows.map(r=><tr key={r.kind+"-"+r.id}><td>{names.get(r.userId)??"Employee"}</td><td>{r.kind}</td><td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/people/performance/"+encodeURIComponent(r.id))}>{r.title}</button></td><td>{r.status}</td><td>{r.period}</td><td>{r.detail}</td></tr>)}</tbody></table></div>
 {!rows.length&&<p className="prototype-note">No matching authorized goals or reviews.</p>}</section>
 <p className="prototype-note">Administrative review decisions and edits stay in their authorized source workflows. These previews cannot post pay, calculate a bonus or override employee privacy.</p></div>;
}
