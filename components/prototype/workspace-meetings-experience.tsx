"use client";
import {useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowUpDown,CalendarDays,CalendarPlus,ExternalLink} from "lucide-react";
import {addCalendarDays,arizonaDateKey,startOfLocalWeek} from "../../lib/date-time";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import {useMeetingWorkspace} from "../../lib/workspace-meetings-store";
import {meetingCalendarFile,meetingConflicts,meetingNotices,meetingHomeReminders,meetingHasEnded,upcomingMeetings,type MeetingInput,type TeamMeeting,type Rsvp} from "../../lib/workspace-meetings";

const url=(id:string)=>"/calendar/meetings/"+encodeURIComponent(id);
function Go({to,children}:{to:string;children:React.ReactNode}){return <button type="button" className="prototype-link" onClick={()=>navigateToRoute(to)}>{children}<ExternalLink size={13}/></button>}
function Heading({title,description}:{title:string;description:string}){return <header className="prototype-heading"><h1>{title}</h1><p>{description}</p></header>}
function NoResults({children}:{children:React.ReactNode}){return <p className="prototype-empty">{children}</p>}
function azTimeLabel(value:string){const hour=Number(value.slice(0,2));return (hour%12||12)+":"+value.slice(3)+" "+(hour<12?"AM":"PM");}
function meetingLabel(m:TeamMeeting){return m.date+" · "+azTimeLabel(m.startTime)+"–"+azTimeLabel(m.endTime)+" (Arizona)";}
function shiftedMonth(anchor:string,delta:number){
 const [year,month]=anchor.split("-").map(Number);
 return new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,10);
}
function downloadIcs(m:TeamMeeting){
  if(typeof window==="undefined"||!window.URL?.createObjectURL)return;
  const blob=new Blob([meetingCalendarFile(m)],{type:"text/calendar;charset=utf-8"});
  const link=document.createElement("a"),objectUrl=URL.createObjectURL(blob);
  link.href=objectUrl;link.download="momentum-meeting-"+m.id.replace(/[^a-zA-Z0-9_-]/g,"")+".ics";
  document.body.append(link);try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
}
function MeetingForm({meeting}:{meeting?:TeamMeeting}){
  const {users,currentUser,appointments,meetings,allowed,isLocal,create,revise}=useMeetingWorkspace();
  const [saving,setSaving]=useState(false);
  const [title,setTitle]=useState(meeting?.title??"");
  const [agenda,setAgenda]=useState(meeting?.agenda??"");
  const [location,setLocation]=useState(meeting?.location??"");
  const [date,setDate]=useState(meeting?.date??arizonaDateKey());
  const [startTime,setStartTime]=useState(meeting?.startTime??"10:00");
  const [endTime,setEndTime]=useState(meeting?.endTime??"10:30");
  const [selected,setSelected]=useState<string[]>(meeting?.attendeeIds??[]);
  const [error,setError]=useState("");
  const input:MeetingInput={title,agenda,location,date,startTime,endTime,attendeeIds:selected};
  const potential=allowed&&currentUser?meetingConflicts(meetings,input,currentUser.id,meeting?.id,appointments):[];
  const available=users.filter(u=>u.id!==currentUser?.id).sort((a,b)=>a.name.localeCompare(b.name));
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(saving)return;
    setSaving(true);
    try{
      const result=await (meeting?revise(meeting.id,input):create(input));
      if(!result.ok){setError(result.message??"Unable to save meeting.");return;}
      navigateToRoute(url(result.id??meeting!.id));
    }finally{setSaving(false);}
  };
  return <main className="prototype-domain">
    <Heading title={meeting?"Edit meeting":"Schedule meeting"} description={"Arizona time · active employees · "+(isLocal?"local demonstration":"secure staff meeting register")+" · external email invitations not enabled"}/>
    <section className="prototype-panel"><div className="prototype-controls"><Go to={meeting?url(meeting.id):"/calendar/meetings"}>Back to meetings</Go></div>
      {!allowed&&<p role="status" className="prototype-note">Meeting creation is not available for this role or the secure meeting service has not loaded.</p>}
      <form onSubmit={submit} aria-label={meeting?"Update team meeting":"Create team meeting"}>
        <div className="prototype-controls">
          <label>Title <input aria-label="Meeting title" maxLength={160} required value={title} disabled={!allowed} onChange={e=>setTitle(e.target.value)}/></label>
          <label>Arizona date <input aria-label="Meeting date" type="date" min={arizonaDateKey()} required value={date} disabled={!allowed} onChange={e=>setDate(e.target.value)}/></label>
          <label>Start <input aria-label="Meeting start time" type="time" required value={startTime} disabled={!allowed} onChange={e=>setStartTime(e.target.value)}/></label>
          <label>End <input aria-label="Meeting end time" type="time" required value={endTime} disabled={!allowed} onChange={e=>setEndTime(e.target.value)}/></label>
          <label>Meeting place or call link description <input aria-label="Meeting location" required maxLength={240} value={location} disabled={!allowed} onChange={e=>setLocation(e.target.value)}/></label>
        </div>
        <label>Agenda <textarea aria-label="Meeting agenda" value={agenda} minLength={5} maxLength={4000} required rows={4} disabled={!allowed} onChange={e=>setAgenda(e.target.value)}/></label>
        <fieldset disabled={!allowed} className="prototype-panel"><legend>Invite employees ({selected.length} selected)</legend>
          <p className="prototype-note">Only active employee identities appear. Customers and separated workers are excluded. Invitations appear inside each attendee’s Momentum workspace; no external email is sent.</p>
          <div className="prototype-controls">{available.map(user=><label key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,user.id]:current.filter(id=>id!==user.id))}/>{user.name} · {user.role}</label>)}</div>
          {!available.length&&<NoResults>No eligible employees available to invite.</NoResults>}
        </fieldset>
        {potential.length>0&&<p role="alert" className="prototype-note">Scheduling conflict with visible calendar data: {potential.join("; ")}. External calendars and off-scope field appointments cannot be checked.</p>}
        {error&&<p role="alert">{error}</p>}
        <div className="prototype-controls"><button type="submit" disabled={!allowed||saving||selected.length===0||potential.length>0}>{meeting?"Save changes for invitees":"Create meeting for invitees"}</button><Go to="/calendar/meetings">Cancel editing</Go></div>
      </form>
    </section>
  </main>;
}
function MeetingRecord({id}:{id:string}){
  const {data}=useWorkspace();
  const {meetings,currentUser,rsvp,cancel,seen,isLocal,cloudReady,cloudError}=useMeetingWorkspace();
  const meeting=meetings.find(m=>m.id===id);
  const [error,setError]=useState("");
  if(!meeting||!currentUser)return <main><Heading title="Meeting unavailable" description={!isLocal&&!cloudReady?(cloudError||"Loading authorized meeting records."): "Not found or outside this employee's authorized meeting visibility."}/><Go to="/calendar/meetings">Back to meetings</Go></main>;
  const organizer=meeting.organizerId===currentUser.id;
  const invited=meeting.attendeeIds.includes(currentUser.id);
  const changed=(meeting.seenRevision[currentUser.id]??0)<meeting.revision;
  const status=invited?meeting.rsvps[currentUser.id]:undefined;
  const name=(id:string)=>data.users.find(u=>u.id===id)?.name??"Employee";
  const doRsvp=async(choice:Exclude<Rsvp,"Pending">)=>{const result=await rsvp(meeting.id,choice);setError(result.ok?"Response recorded.":(result.message??"Response rejected."));};
  const doCancel=async()=>{if(!window.confirm("Cancel this meeting for all invited employees?"))return;const result=await cancel(meeting.id);setError(result.ok?"Meeting cancelled for invitees.":(result.message??"Cancellation rejected."));};
  return <main className="prototype-domain"><Heading title={meeting.title} description={meetingLabel(meeting)+" · "+meeting.status}/>
    <section className="prototype-panel">
      <div className="prototype-controls"><Go to="/calendar/meetings">All meetings</Go><Go to="/calendar">Calendar</Go>
        <button type="button" onClick={()=>downloadIcs(meeting)}>Save personal calendar file (.ics)</button>
        {organizer&&meeting.status==="Scheduled"&&(isLocal||cloudReady)&&<><Go to={url(id)+"/edit"}>Edit meeting</Go><button type="button" onClick={doCancel}>Cancel meeting</button></>}
      </div>
      <dl className="prototype-facts"><div><dt>Organizer</dt><dd>{name(meeting.organizerId)}</dd></div><div><dt>Date and time</dt><dd>{meetingLabel(meeting)}</dd></div>
        <div><dt>Location</dt><dd>{meeting.location}</dd></div><div><dt>Agenda</dt><dd>{meeting.agenda}</dd></div>
        <div><dt>Revision</dt><dd>{meeting.revision}</dd></div><div><dt>Updated</dt><dd>{meeting.updatedAt}</dd></div></dl>
      <p className="prototype-note">Personal calendar file import does not email attendees or modify an external calendar. Changes to a meeting require downloading the updated file. In-app invitations appear when the authenticated meeting service synchronizes; email delivery is not enabled.</p>
      {changed&&<button type="button" onClick={()=>{void Promise.resolve(seen(meeting.id)).then(result=>{if(!result.ok)setError(result.message??"Unable to acknowledge update.");});}}>Mark invitation / update reviewed</button>}
      {invited&&meeting.status==="Scheduled"&&!meetingHasEnded(meeting)&&<div className="prototype-controls" aria-label="Respond to invitation"><strong>Your response: {status}</strong>
        {(["Accepted","Tentative","Declined"] as const).map(choice=><button key={choice} type="button" aria-pressed={status===choice} onClick={()=>doRsvp(choice)}>{choice}</button>)}
      </div>}
      {error&&<p role="status">{error}</p>}
    </section>
    <section className="prototype-panel"><h2>Invited employees</h2><div className="prototype-table-scroll"><table className="prototype-table">
      <thead><tr><th>Employee</th><th>Response</th></tr></thead><tbody>{meeting.attendeeIds.map(id=><tr key={id}><td>{name(id)}</td><td>{meeting.rsvps[id]}</td></tr>)}</tbody></table></div>
    </section>
    <section className="prototype-panel"><h2>Meeting change history</h2>
      {meeting.history.slice().reverse().map((entry,i)=><div className="prototype-activity" key={entry.at+":"+i}><strong>{entry.action} · {name(entry.actorId)}</strong><span>{entry.at} · {entry.detail}</span></div>)}
      <p className="prototype-note">History is associated with the meeting record. A separate immutable compliance audit has not been verified.</p>
    </section>
  </main>;
}
function MeetingDirectory({kind}:{kind:"meetings"|"invitations"|"agenda"}){
  const {data,scope}=useWorkspace();
  const {meetings,currentUser,allowed,isLocal,cloudReady,cloudError}=useMeetingWorkspace();
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState(kind==="invitations"?"all":"active");
  const [sort,setSort]=useState<"date"|"name">("date");
  const [ascending,setAscending]=useState(true);
  const rows=useMemo(()=>{
    const input=meetings.filter(m=>kind!=="invitations"||Boolean(currentUser&&m.attendeeIds.includes(currentUser.id)&&((m.status==="Scheduled"&&m.rsvps[currentUser.id]==="Pending")||(m.seenRevision[currentUser.id]??0)<m.revision)))
      .filter(m=>status==="all"||(status==="active"?m.status==="Scheduled"&&m.date>=arizonaDateKey():status==="cancelled"?m.status==="Cancelled":m.status==="Scheduled"&&m.date<arizonaDateKey()))
      .filter(m=>[m.title,m.location,m.agenda,data.users.find(u=>u.id===m.organizerId)?.name].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
    return input.sort((a,b)=>(ascending?1:-1)*(sort==="date"?(a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)):a.title.localeCompare(b.title))||a.id.localeCompare(b.id));
  },[meetings,kind,currentUser,status,query,sort,ascending,data.users]);
  const [showField,setShowField]=useState(kind==="agenda");
  const appointments=scope.appointments.filter(a=>a.date>=arizonaDateKey()&&a.status!=="Completed").sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  return <main className="prototype-domain">
    <Heading title={kind==="invitations"?"My meeting invitations":kind==="agenda"?"My agenda":"Staff meetings"} description="Only meetings you organize or are invited to appear. Meeting status is not a payroll attendance record."/>
    <section className="prototype-panel">
      <div className="prototype-controls">
        <Go to="/calendar">Shared calendar</Go><Go to="/calendar/meetings">Meetings</Go><Go to="/calendar/invitations">My invitations</Go><Go to="/calendar/agenda">My agenda</Go>
        {allowed&&<Go to="/calendar/meetings/new">Create meeting</Go>}
      </div>
      {!isLocal&&!cloudReady&&<p className="prototype-note" role="status">Secure meeting service unavailable: {cloudError||"Loading authorized records."} Connected accounts never fall back to local demo meetings.</p>}
      <div className="prototype-controls">
        <label>Search meetings <input aria-label="Search meetings" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, organizer or agenda"/></label>
        <label>Status <select aria-label="Filter meeting status" value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Upcoming</option><option value="past">Past</option><option value="cancelled">Cancelled</option><option value="all">All</option></select></label>
        <button type="button" onClick={()=>{setSort(value=>value==="date"?"name":"date");setAscending(true);}}>Sort by {sort==="date"?"title":"date"}</button>
        <button type="button" onClick={()=>setAscending(value=>!value)}><ArrowUpDown size={13}/> {ascending?"Ascending":"Descending"}</button>
        {kind==="agenda"&&<label><input type="checkbox" checked={showField} onChange={e=>setShowField(e.target.checked)}/> Include field appointments</label>}
      </div>
      <p role="status" className="prototype-note">{rows.length} matching meetings</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Meeting</th><th>Arizona time</th><th>Organizer</th><th>My response</th><th>Status</th></tr></thead>
        <tbody>{rows.map(m=><tr key={m.id}><td><Go to={url(m.id)}>{m.title}</Go></td><td>{meetingLabel(m)}</td>
          <td>{data.users.find(u=>u.id===m.organizerId)?.name??"Employee"}</td>
          <td>{m.attendeeIds.includes(currentUser?.id??"")?m.rsvps[currentUser!.id]:"Organizer"}</td><td>{m.status}</td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<NoResults>No accessible meetings match the current filters.</NoResults>}
    </section>
    {showField&&<section className="prototype-panel"><h2>Existing field appointments</h2>
      <p className="prototype-note">Field appointment visibility comes from your existing authorized workspace scope. It is separate from meeting attendee access.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Assigned employee</th><th>Business</th></tr></thead>
        <tbody>{appointments.map(a=><tr key={a.id}><td>{a.date}</td><td>{azTimeLabel(a.startTime)}</td><td>{a.type}</td>
          <td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td>{scope.accounts.find(ac=>ac.id===a.accountId)?.name??"Restricted"}</td></tr>)}</tbody></table></div>
      {!appointments.length&&<NoResults>No upcoming authorized field appointments.</NoResults>}
    </section>}
  </main>;
}
export function SharedCalendarExperience(){
  const {meetings,currentUser,allowed,isLocal,cloudReady,cloudError}=useMeetingWorkspace(),{scope,data}=useWorkspace();
  const [anchor,setAnchor]=useState(arizonaDateKey());
  const [length,setLength]=useState<"week"|"month">("week");
  const start=length==="week"?startOfLocalWeek(anchor):anchor.slice(0,7)+"-01";
  const days=length==="week"?7:Number(new Date(Number(anchor.slice(0,4)),Number(anchor.slice(5,7)),0).getDate());
  const calendar=upcomingMeetings(meetings,currentUser,start).filter(m=>m.date<addCalendarDays(start,days));
  const field=scope.appointments.filter(a=>a.date>=start&&a.date<addCalendarDays(start,days)&&a.status!=="Completed");
  return <main className="prototype-domain"><Heading title="Shared calendar" description="Arizona company calendar. Employee invitations are private to the organizer and invited attendees."/>
    <section className="prototype-panel">
      <div className="prototype-controls"><Go to="/calendar/meetings">Meetings</Go><Go to="/calendar/invitations">Invitations</Go><Go to="/calendar/agenda">My agenda</Go>{allowed&&<Go to="/calendar/meetings/new">Schedule meeting</Go>}</div>
      {!isLocal&&!cloudReady&&<p className="prototype-note">Secure staff meeting service unavailable: {cloudError||"Loading authorized meetings."} Field appointments remain visible according to their existing role restrictions.</p>}
      <div className="prototype-controls"><label>View date <input type="date" aria-label="Calendar anchor date" value={anchor} onChange={e=>setAnchor(e.target.value)}/></label>
        <label>View <select aria-label="Calendar view" value={length} onChange={e=>setLength(e.target.value as "week"|"month")}><option value="week">Week</option><option value="month">Month</option></select></label>
        <button type="button" onClick={()=>setAnchor(length==="week"?addCalendarDays(anchor,-7):shiftedMonth(anchor,-1))}>Previous</button>
        <button type="button" onClick={()=>setAnchor(arizonaDateKey())}>Today</button>
        <button type="button" onClick={()=>setAnchor(length==="week"?addCalendarDays(anchor,7):shiftedMonth(anchor,1))}>Next</button>
      </div>
      <div className={"momentum-calendar-grid "+(length==="month"?"is-month":"is-week")} role="list" aria-label="Calendar days">
        {Array.from({length:days},(_,i)=>addCalendarDays(start,i)).map(date=>{
          const own=calendar.filter(m=>m.date===date),appts=field.filter(a=>a.date===date);
          return <section className="momentum-calendar-day" role="listitem" key={date}><h2><span>{new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"short",timeZone:"UTC"})}</span> {date}</h2>
            {own.map(m=><div key={m.id} className="prototype-activity"><Go to={url(m.id)}>{m.title}</Go><small>{azTimeLabel(m.startTime)} · {m.attendeeIds.includes(currentUser?.id??"")?m.rsvps[currentUser!.id]:"Organizer"}</small></div>)}
            {appts.map(a=><div key={a.id} className="prototype-activity"><strong>{a.type} · {azTimeLabel(a.startTime)}</strong><small>{scope.accounts.find(ac=>ac.id===a.accountId)?.name??"Authorized field appointment"}</small></div>)}
            {!own.length&&!appts.length&&<small>No scheduled events</small>}
          </section>;
        })}
      </div>
      <p className="prototype-note">Conflict checking uses staff meetings and field appointments visible to the organizer; the authenticated meeting service independently reserves staff time slots and checks recorded field appointments across company registers. External calendars and unsynchronized appointments are not checked. Calendar export is a user-triggered .ics file, not direct third-party synchronization.</p>
    </section>
  </main>;
}
export function MeetingWorkspaceExperience({view,id}:{view:"meetings"|"agenda"|"invitations"|"new"|"record"|"edit";id?:string}){
  const {meetings,currentUser}=useMeetingWorkspace();
  if(!currentUser||currentUser.role==="Customer"||currentUser.employmentStatus==="Separated")return <NoResults>Employee meeting access is unavailable for this session.</NoResults>;
  if(view==="new")return <MeetingForm/>;
  if(view==="record")return <MeetingRecord id={id??""}/>;
  if(view==="edit"){
    const meeting=meetings.find(m=>m.id===id&&m.organizerId===currentUser.id&&m.status==="Scheduled");
    return meeting?<MeetingForm key={meeting.id} meeting={meeting}/>:<NoResults>Only the meeting organizer may edit an active authorized meeting.</NoResults>;
  }
  return <MeetingDirectory kind={view}/>;
}
export function MeetingHomePanel(){
  const {meetings,currentUser,isLocal,cloudReady}=useMeetingWorkspace();
  const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const timer=window.setInterval(()=>setClock(new Date()),60000);return()=>window.clearInterval(timer);},[]);
  if((!isLocal&&!cloudReady)||!currentUser||currentUser.role==="Customer")return null;
  const notices=meetingNotices(meetings,currentUser).slice(0,4);
  const reminders=meetingHomeReminders(meetings,currentUser,clock).slice(0,3);
  const soon=upcomingMeetings(meetings,currentUser).slice(0,5);
  return <section className="momentum-home-panel"><header className="momentum-home-panel-head"><div><CalendarDays size={17}/><h2>My meetings and invitations</h2></div><Go to="/calendar/invitations">Invitations</Go></header>
    {notices.map(n=><button type="button" className="momentum-home-actionrow" key={n.id} onClick={()=>navigateToRoute(url(n.meetingId))}><strong>{n.title}</strong><small>{n.date} · {azTimeLabel(n.time)}</small></button>)}
    {reminders.map(m=><div key={"reminder:"+m.id} className="momentum-home-minirow"><span><strong>Starting within 24 hours: {m.title}</strong><small>{meetingLabel(m)}</small></span><Go to={url(m.id)}>Review</Go></div>)}
    {soon.map(m=><div key={m.id} className="momentum-home-minirow"><span><strong>{m.title}</strong><small>{meetingLabel(m)}</small></span><Go to={url(m.id)}>Open</Go></div>)}
    {!notices.length&&!soon.length&&<NoResults>No invitations or upcoming meetings assigned to you.</NoResults>}
    <p className="momentum-home-panel-context">In-app invitations and source-based reminders only. Email, SMS, push, and external calendar updates are not enabled.</p>
  </section>;
}
export function MeetingActionQueue(){
  const {meetings,currentUser,isLocal,cloudReady}=useMeetingWorkspace();
  if((!isLocal&&!cloudReady)||!currentUser||currentUser.role==="Customer")return null;
  const notices=meetingNotices(meetings,currentUser);
  return <section className="prototype-panel" aria-label="Meeting invitations requiring attention"><h2>Meeting invitations & updates ({notices.length})</h2>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Meeting</th><th>Arizona date</th><th>Action</th></tr></thead><tbody>{notices.map(n=><tr key={n.id}><td>{n.title}</td><td>{n.date} · {azTimeLabel(n.time)}</td><td><Go to={url(n.meetingId)}>Respond / review</Go></td></tr>)}</tbody></table></div>
    {!notices.length&&<NoResults>No unreviewed meeting invitations or updates.</NoResults>}
    <p className="prototype-note">Derived from your authorized meeting records. Clearing a bell alert does not change an invitation response.</p>
  </section>;
}
