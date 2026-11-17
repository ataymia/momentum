"use client";
import {useState} from "react";
import {addCalendarDays,arizonaDateKey} from "../../lib/date-time";
import {useWorkspace} from "../../lib/workspace-context";
import {DispatchPage} from "../pages/dispatch";
import type {Appointment} from "../../lib/types";

type View="agenda"|"board";
const active=(a:Appointment)=>a.status!=="Completed";
const end=(today:string,days:number)=>addCalendarDays(today,days-1);
export function FieldSchedulingExperience(){
 const {data,scope,currentUser}=useWorkspace();
 const today=arizonaDateKey();
 const [view,setView]=useState<View>("agenda");
 const [search,setSearch]=useState("");
 const [windowDays,setWindowDays]=useState("7");
 const [status,setStatus]=useState("open");
 const [rep,setRep]=useState("all");
 const [day,setDay]=useState("");
 if(!currentUser||currentUser.role==="Customer")
  return <div className="prototype-empty">Employee scheduling access required.</div>;
 const orders=scope.appointments.filter(a=>
   (status==="all"||status==="open"&&active(a)||status===a.status)&&
   (rep==="all"||a.ownerId===rep)&&(!day||a.date===day)&&
   (day||windowDays==="all"||a.date>=today&&a.date<=end(today,Number(windowDays)))&&
   [a.objective,a.location,a.type,a.status,data.accounts.find(c=>c.id===a.accountId)?.name??""].join(" ").toLowerCase().includes(search.toLowerCase()))
   .sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.id.localeCompare(b.id));
 const reps=[...new Set(scope.appointments.map(a=>a.ownerId).filter((x):x is string=>Boolean(x)))]
   .map(id=>({id,name:data.users.find(u=>u.id===id)?.name??"Unlinked employee"})).sort((a,b)=>a.name.localeCompare(b.name));
 const selectedDay=day||today;
 const upcoming=scope.appointments.filter(a=>active(a)&&a.date>=today).length;
 const unassigned=scope.appointments.filter(a=>active(a)&&!a.ownerId).length;
 const attention=scope.appointments.filter(a=>a.status==="Needs follow-up"||a.date<today&&active(a)).length;
 const openOnBoard=(a?:Appointment)=>{
   if(a&&typeof window!=="undefined")window.sessionStorage.setItem("momentum-focus-record",a.id);
   setView("board");
 };
 return <div className="prototype-domain prototype-domain--scheduling">
  <header className="prototype-heading"><h1>Field Scheduling</h1>
   <p>Book, assign, and follow up on field visits from one appointment calendar. The schedule is drawn from your authorized appointments, not made-up route estimates.</p></header>
  <div className="prototype-domain-statbar">
   <article><small>Upcoming open visits</small><strong>{upcoming}</strong></article>
   <article><small>Unassigned visits</small><strong>{unassigned}</strong></article>
   <article><small>Past-due or follow-up visits</small><strong>{attention}</strong></article>
  </div>
  <nav className="prototype-tabs" aria-label="Field scheduling views">
   <button type="button" className={view==="agenda"?"is-active":""} aria-current={view==="agenda"?"page":undefined} onClick={()=>setView("agenda")}>Schedule overview</button>
   <button type="button" className={view==="board"?"is-active":""} aria-current={view==="board"?"page":undefined} onClick={()=>setView("board")}>Interactive scheduling board</button>
  </nav>
  {view==="agenda"?<>
    <section className="prototype-panel"><h2>Visit schedule</h2>
     <div className="prototype-controls">
      <label className="prototype-search">Search <input type="search" aria-label="Search field appointments" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Business, address or visit type"/></label>
      <label>Window <select aria-label="Schedule date window" value={windowDays} onChange={e=>setWindowDays(e.target.value)}>
       <option value="1">Today</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="all">All recorded dates</option></select></label>
      <label>Exact date <input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
      <label>Status <select value={status} onChange={e=>setStatus(e.target.value)}>
       <option value="open">Open & follow-up</option><option value="all">Every status</option>
       {["Scheduled","Dispatched","En route","Arrived","Completed","Needs follow-up"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label>Representative <select value={rep} onChange={e=>setRep(e.target.value)}>
       <option value="all">All accessible reps</option>{reps.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <button type="button" className="prototype-primary-action" onClick={()=>openOnBoard()}>Schedule or edit a visit</button>
     </div>
     <p className="prototype-note" role="status">{orders.length} matching appointments. Changes to times, assignments, conflict checks and visit outcomes are performed in the existing authorized scheduling controls.</p>
     <div className="prototype-table-scroll"><table className="prototype-table">
      <thead><tr><th>Date & time</th><th>Business / location</th><th>Type</th><th>Representative</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{orders.map(a=><tr key={a.id}>
       <td><strong>{a.date}</strong><div>{a.startTime} · {a.duration} min</div></td>
       <td>{data.accounts.find(c=>c.id===a.accountId)?.name??"Restricted location"}<div className="prototype-small">{a.location}</div></td>
       <td>{a.type}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td>
       <td>{a.status}</td><td><button className="prototype-link" type="button" onClick={()=>openOnBoard(a)}>Open visit</button></td>
      </tr>)}</tbody></table></div>
     {!orders.length&&<p className="prototype-note">No appointments match these filters. Change the date window or open the scheduling board to create a visit.</p>}
    </section>
    <section className="prototype-panel">
     <h2>Today’s scheduling focus · {selectedDay}</h2>
     <p>Use the interactive board to create visits, resolve assignment conflicts and advance appointments. This screen does not convert customer visits into delivery custody or certify arrival without recorded evidence.</p>
    </section>
  </>:<section className="prototype-panel"><div className="prototype-controls">
    <button type="button" onClick={()=>setView("agenda")}>Back to schedule overview</button>
   </div><DispatchPage/></section>}
 </div>;
}
