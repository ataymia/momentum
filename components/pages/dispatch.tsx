"use client";

import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, GripVertical, MapPin, Navigation, Plus, Route, Store, UserRoundCheck, UsersRound } from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { canCreateScheduleItem, canManageSchedule } from "../../lib/access";
import { customerForLocation, customerLocations, customersForLocations, locationLabel } from "../../lib/crm-hierarchy";
import type { Appointment, AppointmentOutcome, AppointmentStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

const BOARD_START_MINUTES=7*60;
const BOARD_END_MINUTES=20*60;
const BOARD_TOTAL_MINUTES=BOARD_END_MINUTES-BOARD_START_MINUTES;
const SNAP_MINUTES=15;
const HOUR_LABELS=Array.from({length:14},(_,index)=>7+index);
const nextLabel:Record<AppointmentStatus,string>={Scheduled:"Dispatch",Dispatched:"Start route","En route":"Mark arrived",Arrived:"Close visit",Completed:"Completed","Needs follow-up":"Follow-up required"};
const tone=(status:AppointmentStatus)=>status==="Completed"?"success" as const:["Arrived","En route","Dispatched"].includes(status)?"info" as const:status==="Needs follow-up"?"warning" as const:"neutral" as const;
const priorityTone=(priority:Appointment["priority"])=>priority==="Urgent"?"danger" as const:priority==="High"?"warning" as const:"neutral" as const;
const dateOffset=(offset:number)=>{const date=new Date();date.setDate(date.getDate()+offset);return date.toISOString().slice(0,10);};
const timeToMinutes=(value:string)=>{const[h,m]=value.split(":").map(Number);return h*60+m;};
const minutesToTime=(minutes:number)=>`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const todayKey=()=>new Date().toISOString().slice(0,10);

type ContextMenu={appointmentId:string;x:number;y:number}|null;

export function DispatchPage(){
  const {data,scope,currentUser,createAppointment,advanceAppointment,completeAppointment,reassignAppointment,moveAppointment,navigate}=useWorkspace();
  const focus=typeof window!=="undefined"?sessionStorage.getItem("momentum-focus-record"):null;
  const focusAppointment=scope.appointments.find((item)=>item.id===focus);
  const focusLocation=scope.accounts.find((item)=>item.id===focus);
  const operationsMode=currentUser?.role==="Operations";
  const [selectedDate,setSelectedDate]=useState(focusAppointment?.date??dateOffset(0));
  const [selectedId,setSelectedId]=useState(focusAppointment?.id??scope.appointments[0]?.id??"");
  const [createOpen,setCreateOpen]=useState(Boolean(focusLocation));
  const [closeoutOpen,setCloseoutOpen]=useState(false);
  const [error,setError]=useState("");
  const [dragId,setDragId]=useState<string|null>(null);
  const [contextMenu,setContextMenu]=useState<ContextMenu>(null);
  const [technicianFilter,setTechnicianFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"scheduled"|"active"|"closed">("all");
  const [clock,setClock]=useState(()=>new Date());
  const boardRef=useRef<HTMLDivElement|null>(null);
  const canManage=canManageSchedule(currentUser);
  const canCreate=canCreateScheduleItem(currentUser);
  const dates=useMemo(()=>Array.from({length:7},(_,index)=>dateOffset(index)),[]);
  const workTypes:Appointment["type"][]=operationsMode?["Delivery"]:["First visit","Sample drop","Placement check","Reorder","Delivery"];

  useEffect(()=>{const handle=window.setInterval(()=>setClock(new Date()),60000);return()=>window.clearInterval(handle);},[]);
  useEffect(()=>{const close=()=>setContextMenu(null);window.addEventListener("click",close);window.addEventListener("scroll",close,true);return()=>{window.removeEventListener("click",close);window.removeEventListener("scroll",close,true);};},[]);

  const assignable=data.users.filter((user)=>{
    if(user.role==="Customer")return false;
    if(currentUser?.role==="Administrator")return ["Sales","Operations","Leadership"].includes(user.team);
    if(currentUser?.role==="Operations")return user.team==="Operations";
    if(currentUser?.role==="Sales Manager")return scope.users.some((item)=>item.id===user.id)&&user.team==="Sales";
    return user.id===currentUser?.id;
  });
  const technicians=assignable.filter((user)=>technicianFilter==="all"||user.id===technicianFilter);
  const allForDate=scope.appointments.filter((item)=>item.date===selectedDate);
  const filteredForDate=allForDate.filter((item)=>statusFilter==="all"||statusFilter==="scheduled"&&item.status==="Scheduled"||statusFilter==="active"&&["Dispatched","En route","Arrived"].includes(item.status)||statusFilter==="closed"&&["Completed","Needs follow-up"].includes(item.status));
  const unassigned=filteredForDate.filter((item)=>!item.ownerId);
  const selected=scope.appointments.find((item)=>item.id===selectedId)??filteredForDate[0];
  const selectedLocation=selected?scope.accounts.find((item)=>item.id===selected.accountId):undefined;
  const selectedCustomer=selectedLocation?customerForLocation(data,selectedLocation):undefined;
  const selectedOwner=data.users.find((item)=>item.id===selected?.ownerId);
  const canOperate=Boolean(selected&&currentUser&&selected.ownerId&&(selected.ownerId===currentUser.id||canManage));
  const visibleCustomers=customersForLocations(data,scope.accounts);
  const initialCustomer=focusLocation?customerForLocation(data,focusLocation).id:visibleCustomers[0]?.id??"";
  const initialLocation=focusLocation?.id??customerLocations(data,initialCustomer,scope.accounts)[0]?.id??scope.accounts[0]?.id??"";
  const [appointmentForm,setAppointmentForm]=useState({customerId:initialCustomer,accountId:initialLocation,ownerId:currentUser?.role==="Sales Representative"?currentUser.id:"",date:selectedDate,startTime:"10:00",duration:30,type:(operationsMode?"Delivery":"First visit") as Appointment["type"],priority:"Normal" as NonNullable<Appointment["priority"]>,arrivalWindow:"",objective:"",tags:""});
  const [closeout,setCloseout]=useState({outcome:"Follow-up scheduled" as AppointmentOutcome,closeoutNote:"",nextAction:"",nextActionDate:dateOffset(1)});
  const formLocations=customerLocations(data,appointmentForm.customerId,scope.accounts);

  useEffect(()=>{if(!formLocations.some((location)=>location.id===appointmentForm.accountId)&&formLocations[0])setAppointmentForm((current)=>({...current,accountId:formLocations[0].id}));},[appointmentForm.accountId,formLocations]);

  const currentMinutes=clock.getHours()*60+clock.getMinutes();
  const currentLineVisible=selectedDate===todayKey()&&currentMinutes>=BOARD_START_MINUTES&&currentMinutes<=BOARD_END_MINUTES;
  const currentLineLeft=`${((currentMinutes-BOARD_START_MINUTES)/BOARD_TOTAL_MINUTES)*100}%`;

  const submitAppointment=(event:FormEvent)=>{
    event.preventDefault();const id=createAppointment({accountId:appointmentForm.accountId,ownerId:appointmentForm.ownerId||undefined,date:appointmentForm.date,startTime:appointmentForm.startTime,duration:appointmentForm.duration,type:appointmentForm.type,objective:appointmentForm.objective,priority:appointmentForm.priority,arrivalWindow:appointmentForm.arrivalWindow||undefined,tags:appointmentForm.tags.split(",").map((item)=>item.trim()).filter(Boolean)});
    if(!id){setError("Choose a customer location in your scope and complete all required fields.");return;}
    setSelectedId(id);setSelectedDate(appointmentForm.date);setCreateOpen(false);setError("");sessionStorage.removeItem("momentum-focus-record");
  };
  const submitCloseout=(event:FormEvent)=>{event.preventDefault();if(!selected)return;if(!completeAppointment(selected.id,closeout)){setError("Outcome, note, next action, and next-action date are required.");return;}setCloseoutOpen(false);setError("");setCloseout({outcome:"Follow-up scheduled",closeoutNote:"",nextAction:"",nextActionDate:dateOffset(1)});};

  const openContext=(event:MouseEvent,appointmentId:string)=>{if(!canManage)return;event.preventDefault();event.stopPropagation();setContextMenu({appointmentId,x:event.clientX,y:event.clientY});};
  const assignmentAllowed=(appointment:Appointment)=>appointment.status==="Scheduled";
  const dropOnTechnician=(event:React.DragEvent<HTMLDivElement>,ownerId:string)=>{
    event.preventDefault();if(!dragId||!canManage)return;const target=event.currentTarget.getBoundingClientRect();const relative=clamp(event.clientX-target.left,0,target.width);const rawMinutes=BOARD_START_MINUTES+(relative/target.width)*BOARD_TOTAL_MINUTES;const snapped=clamp(Math.round(rawMinutes/SNAP_MINUTES)*SNAP_MINUTES,BOARD_START_MINUTES,BOARD_END_MINUTES-SNAP_MINUTES);moveAppointment(dragId,ownerId,selectedDate,minutesToTime(snapped));setDragId(null);
  };
  const dropInHolding=(event:React.DragEvent<HTMLDivElement>)=>{event.preventDefault();if(!dragId||!canManage)return;reassignAppointment(dragId,"");setDragId(null);};
  const cardPosition=(appointment:Appointment)=>{const start=clamp(timeToMinutes(appointment.startTime),BOARD_START_MINUTES,BOARD_END_MINUTES);const left=((start-BOARD_START_MINUTES)/BOARD_TOTAL_MINUTES)*100;const width=Math.max(3,(appointment.duration/BOARD_TOTAL_MINUTES)*100);return{left:`${left}%`,width:`${width}%`};};
  const openLocationRecord=()=>{if(!selectedLocation)return;sessionStorage.setItem("momentum-focus-record",selectedLocation.id);navigate("accounts");};

  const appointmentCard=(appointment:Appointment)=>{
    const location=scope.accounts.find((item)=>item.id===appointment.accountId);if(!location)return null;const customer=customerForLocation(data,location);const owner=data.users.find((item)=>item.id===appointment.ownerId);const draggable=canManage&&assignmentAllowed(appointment);
    return <button type="button" draggable={draggable} onDragStart={()=>setDragId(appointment.id)} onDragEnd={()=>setDragId(null)} onContextMenu={(event)=>openContext(event,appointment.id)} onClick={()=>setSelectedId(appointment.id)} className={`dispatch-time-card dispatch-time-card--${appointment.status.toLowerCase().replaceAll(" ","-")} ${selected?.id===appointment.id?"is-selected":""} ${draggable?"is-draggable":""}`} style={cardPosition(appointment)} title={`${customer.name} · ${locationLabel(location)} · ${appointment.startTime}`}>
      {draggable&&<GripVertical size={12}/>}<span className="dispatch-time-card__time">{appointment.startTime}</span><strong>{customer.name}</strong><small>{locationLabel(location)}</small><span>{appointment.type}</span>{appointment.priority!=="Normal"&&<i>{appointment.priority}</i>}{owner&&<em>{owner.firstName}</em>}
    </button>;
  };

  return <div className="page page--dispatch dispatch-v2">
    <PageHeader eyebrow="Field operations" title="Dispatch board" description="Customer account, service location, job assignment, time, and execution stay separate. Schedule work against the exact location and assign the right field employee without transferring an entire customer relationship." actions={canCreate?<Button variant="gold" icon={<Plus size={17}/>} onClick={()=>setCreateOpen(true)}>{operationsMode?"Schedule delivery":"New appointment"}</Button>:undefined}/>

    <div className="dispatch-summary"><div><span className="summary-icon summary-icon--blue"><CalendarDays size={19}/></span><span><strong>{allForDate.length}</strong><small>appointments</small></span></div><i/><div><span className="summary-icon summary-icon--gold"><UsersRound size={19}/></span><span><strong>{unassigned.length}</strong><small>unassigned</small></span></div><i/><div><span className="summary-icon summary-icon--green"><Route size={19}/></span><span><strong>{allForDate.filter((item)=>["Dispatched","En route","Arrived"].includes(item.status)).length}</strong><small>in motion</small></span></div><i/><div className="dispatch-summary__policy"><Navigation size={17}/><span><strong>Location-level assignment</strong><small>Customer parent account is not transferred with a job</small></span></div></div>

    <div className="dispatch-toolbar-v2"><div className="date-tabs dispatch-date-tabs">{dates.map((date,index)=><button key={date} className={selectedDate===date?"is-active":""} onClick={()=>setSelectedDate(date)}><span>{index===0?"Today":formatDate(date,{weekday:"short"})}</span><strong>{formatDate(date,{month:"short",day:"numeric"})}</strong><i>{scope.appointments.filter((item)=>item.date===date).length}</i></button>)}</div><div className="dispatch-filters"><label>Field employee<select value={technicianFilter} onChange={(event)=>setTechnicianFilter(event.target.value)}><option value="all">All</option>{assignable.map((user)=><option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Status<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All</option><option value="scheduled">Scheduled</option><option value="active">In motion</option><option value="closed">Closed</option></select></label></div></div>

    <section className="dispatch-timeline-shell" ref={boardRef}>
      <header className="dispatch-board-heading"><div><strong>Daily schedule</strong><span>{formatDate(selectedDate,{weekday:"long",month:"long",day:"numeric"})}</span></div><p>Drag scheduled appointments to a field employee and time. Right-click for fast assignment. Active work is locked against accidental reassignment.</p></header>
      <div className="dispatch-timeline-scroll">
        <div className="dispatch-timeline-board">
          <div className="dispatch-time-header"><div className="dispatch-tech-header">Field employee</div><div className="dispatch-time-axis">{HOUR_LABELS.map((hour)=><span key={hour} style={{left:`${((hour*60-BOARD_START_MINUTES)/BOARD_TOTAL_MINUTES)*100}%`}}>{hour===12?"12 PM":hour>12?`${hour-12} PM`:`${hour} AM`}</span>)}</div></div>
          {technicians.map((tech)=><div className="dispatch-tech-row" key={tech.id}><div className="dispatch-tech-cell"><Avatar initials={tech.initials} color={tech.accent} size="sm"/><div><strong>{tech.name}</strong><small>{tech.title}</small></div></div><div className="dispatch-tech-timeline" onDragOver={(event)=>{if(canManage)event.preventDefault();}} onDrop={(event)=>dropOnTechnician(event,tech.id)}>{HOUR_LABELS.map((hour)=><i className="dispatch-hour-gridline" key={hour} style={{left:`${((hour*60-BOARD_START_MINUTES)/BOARD_TOTAL_MINUTES)*100}%`}}/>)}{currentLineVisible&&<span className="dispatch-now-line" style={{left:currentLineLeft}}><b>{clock.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</b></span>}{filteredForDate.filter((item)=>item.ownerId===tech.id).map(appointmentCard)}</div></div>)}
          {technicians.length===0&&<div className="dispatch-board-empty"><UsersRound size={24}/><strong>No field employees in this filter</strong><p>Change the employee filter or role scope.</p></div>}
        </div>
      </div>
    </section>

    <section className="dispatch-holding" onDragOver={(event)=>{if(canManage)event.preventDefault();}} onDrop={dropInHolding}><header><div><strong>Unassigned work</strong><span>{unassigned.length} appointment{unassigned.length===1?"":"s"} waiting for assignment</span></div><StatusPill tone={unassigned.length?"warning":"success"}>{unassigned.length?"Needs dispatch":"Clear"}</StatusPill></header><div className="dispatch-holding-grid">{unassigned.map((appointment)=>{const location=scope.accounts.find((item)=>item.id===appointment.accountId);const customer=location?customerForLocation(data,location):undefined;return <button draggable={canManage&&assignmentAllowed(appointment)} onDragStart={()=>setDragId(appointment.id)} onDragEnd={()=>setDragId(null)} onContextMenu={(event)=>openContext(event,appointment.id)} onClick={()=>setSelectedId(appointment.id)} key={appointment.id} className="dispatch-holding-card"><GripVertical size={15}/><div><small>{appointment.startTime} · {appointment.duration}m · {appointment.type}</small><strong>{customer?.name}</strong><p>{location?locationLabel(location):"Location"} · {appointment.location}</p></div><StatusPill tone={priorityTone(appointment.priority)}>{appointment.priority??"Normal"}</StatusPill></button>;})}{unassigned.length===0&&<div className="dispatch-board-empty"><CheckCircle2 size={23}/><strong>No unassigned work for this day</strong><p>New work can still be created as unassigned when the right field employee is not yet known.</p></div>}</div></section>

    <Section className="dispatch-detail dispatch-detail-v2" title="Appointment details" description="Quick view with separate customer, location, assignment, and execution records">{selected&&selectedLocation&&selectedCustomer? <div className="dispatch-detail__body"><div className="dispatch-detail__status"><StatusPill tone={tone(selected.status)}>{selected.status}</StatusPill><StatusPill tone={priorityTone(selected.priority)}>{selected.priority??"Normal"}</StatusPill><span>{selected.startTime} · {selected.duration} min</span></div><div className="dispatch-record-pair"><article><small>Customer account</small><strong>{selectedCustomer.name}</strong><p>{selectedCustomer.accountType}</p></article><article><small>Service location</small><strong>{locationLabel(selectedLocation)}</strong><p>{selectedLocation.streetAddress||selectedLocation.location}</p></article></div><div className="objective-card"><span>Appointment objective</span><p>{selected.objective}</p></div><dl className="detail-list"><div><dt><Store size={15}/> Location contact</dt><dd>{selectedLocation.contactName||"Not recorded"} · {selectedLocation.contactRole}</dd></div><div><dt><UserRoundCheck size={15}/> Assigned to</dt><dd>{selectedOwner?.name??"Unassigned"}</dd></div><div><dt><Clock3 size={15}/> Scheduled</dt><dd>{formatDate(selected.date,{month:"short",day:"numeric"})} at {selected.startTime}{selected.arrivalWindow?` · window ${selected.arrivalWindow}`:""}</dd></div><div><dt><MapPin size={15}/> Address</dt><dd>{selected.location}</dd></div></dl><div className="account-detail__actions"><Button variant="secondary" size="sm" onClick={openLocationRecord}>Open customer/location record</Button>{canManage&&assignmentAllowed(selected)&&<label className="reassign-field"><span>Quick assignment</span><select value={selected.ownerId??""} onChange={(event)=>reassignAppointment(selected.id,event.target.value)}><option value="">Unassigned</option>{assignable.map((user)=><option value={user.id} key={user.id}>{user.name} · {user.title}</option>)}</select></label>}</div>{canOperate&&!["Completed","Needs follow-up"].includes(selected.status)&&<Button size="lg" icon={<ArrowRight size={17}/>} onClick={()=>selected.status==="Arrived"?setCloseoutOpen(true):advanceAppointment(selected.id)}>{nextLabel[selected.status]}</Button>}{selected.status==="Completed"&&<div className="completed-closeout"><div><CheckCircle2 size={17}/><strong>{selected.outcome??"Work completed"}</strong></div>{selected.closeoutNote&&<p>{selected.closeoutNote}</p>}{selected.nextAction&&<small>Next: {selected.nextAction} · {selected.nextActionDate?formatDate(selected.nextActionDate):"date not set"}</small>}</div>}</div>:<div className="dispatch-empty"><p>Select an appointment.</p></div>}</Section>

    {contextMenu&&(()=>{const appointment=scope.appointments.find((item)=>item.id===contextMenu.appointmentId);if(!appointment)return null;return <div className="dispatch-context-menu" style={{left:contextMenu.x,top:contextMenu.y}} onClick={(event)=>event.stopPropagation()}><strong>Quick assign</strong>{appointment.status!=="Scheduled"?<p>Assignment is locked once work starts.</p>:<><button onClick={()=>{reassignAppointment(appointment.id,"");setContextMenu(null);}}>Move to unassigned</button>{assignable.map((user)=><button key={user.id} onClick={()=>{reassignAppointment(appointment.id,user.id);setContextMenu(null);}}><Avatar initials={user.initials} color={user.accent} size="sm"/><span>{user.name}</span></button>)}</>}</div>;})()}

    <Modal open={createOpen} title={operationsMode?"Schedule delivery":"Schedule appointment"} description="Choose the customer account and exact service location separately. The assignment can remain unassigned until dispatch knows who should take it." onClose={()=>{setCreateOpen(false);sessionStorage.removeItem("momentum-focus-record");}} footer={<><Button variant="ghost" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" form="appointment-form">Schedule</Button></>} wide>
      <form id="appointment-form" className="form-grid" onSubmit={submitAppointment}><Field label="Customer account"><select required value={appointmentForm.customerId} onChange={(event)=>setAppointmentForm({...appointmentForm,customerId:event.target.value,accountId:customerLocations(data,event.target.value,scope.accounts)[0]?.id??""})}>{visibleCustomers.map((customer)=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Service location"><select required value={appointmentForm.accountId} onChange={(event)=>setAppointmentForm({...appointmentForm,accountId:event.target.value})}>{formLocations.map((location)=><option key={location.id} value={location.id}>{locationLabel(location)} · {location.location}</option>)}</select></Field><Field label="Assigned to"><select value={appointmentForm.ownerId} disabled={!canManage&&currentUser?.role!=="Sales Representative"} onChange={(event)=>setAppointmentForm({...appointmentForm,ownerId:event.target.value})}>{canManage&&<option value="">Unassigned / holding area</option>}{assignable.map((user)=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Field><Field label="Priority"><select value={appointmentForm.priority} onChange={(event)=>setAppointmentForm({...appointmentForm,priority:event.target.value as NonNullable<Appointment["priority"]>})}><option>Normal</option><option>High</option><option>Urgent</option></select></Field><Field label="Date"><input type="date" required value={appointmentForm.date} onChange={(event)=>setAppointmentForm({...appointmentForm,date:event.target.value})}/></Field><Field label="Start time"><input type="time" required value={appointmentForm.startTime} onChange={(event)=>setAppointmentForm({...appointmentForm,startTime:event.target.value})}/></Field><Field label="Arrival window" hint="Optional customer-facing window"><input value={appointmentForm.arrivalWindow} onChange={(event)=>setAppointmentForm({...appointmentForm,arrivalWindow:event.target.value})} placeholder="Example: 10–11 AM"/></Field><Field label="Duration (minutes)"><input type="number" min={15} step={5} required value={appointmentForm.duration} onChange={(event)=>setAppointmentForm({...appointmentForm,duration:Number(event.target.value)})}/></Field><Field label="Work type"><select value={appointmentForm.type} onChange={(event)=>setAppointmentForm({...appointmentForm,type:event.target.value as Appointment["type"]})}>{workTypes.map((type)=><option key={type}>{type}</option>)}</select></Field><Field label="Tags" hint="Comma separated"><input value={appointmentForm.tags} onChange={(event)=>setAppointmentForm({...appointmentForm,tags:event.target.value})} placeholder="Example: cooler, buyer meeting"/></Field><Field label="Objective" className="field--full"><textarea rows={3} required value={appointmentForm.objective} onChange={(event)=>setAppointmentForm({...appointmentForm,objective:event.target.value})} placeholder="What must be accomplished before this appointment can be closed?"/></Field>{error&&<p className="form-error field--full" role="alert">{error}</p>}</form>
    </Modal>

    <Modal open={closeoutOpen} title="Close the appointment" description="An outcome and dated next action are required so work cannot disappear between stages." onClose={()=>setCloseoutOpen(false)} footer={<><Button variant="ghost" onClick={()=>setCloseoutOpen(false)}>Keep open</Button><Button type="submit" form="closeout-form">Complete work</Button></>}>
      <form id="closeout-form" className="form-grid" onSubmit={submitCloseout}><Field label="Outcome"><select value={closeout.outcome} onChange={(event)=>setCloseout({...closeout,outcome:event.target.value as AppointmentOutcome})}><option>Order placed</option><option>Follow-up scheduled</option><option>Placement verified</option><option>No decision</option><option>Closed lost</option><option>Delivery completed</option></select></Field><Field label="Next-action date"><input type="date" required value={closeout.nextActionDate} onChange={(event)=>setCloseout({...closeout,nextActionDate:event.target.value})}/></Field><Field label="Work note" className="field--full"><textarea rows={4} required value={closeout.closeoutNote} onChange={(event)=>setCloseout({...closeout,closeoutNote:event.target.value})} placeholder="What happened and what must the next person know?"/></Field><Field label="Next action" className="field--full"><input required value={closeout.nextAction} onChange={(event)=>setCloseout({...closeout,nextAction:event.target.value})} placeholder="Specific owner action"/></Field>{error&&<p className="form-error field--full" role="alert">{error}</p>}</form>
    </Modal>
  </div>;
}
