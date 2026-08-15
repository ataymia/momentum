"use client";

import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MapPin, Navigation, Plus, Route, UserRoundCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { canCreateScheduleItem, canManageSchedule } from "../../lib/access";
import type { Appointment, AppointmentOutcome, AppointmentStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

const nextLabel: Record<AppointmentStatus,string> = { Scheduled:"Dispatch", Dispatched:"Start route", "En route":"Mark arrived", Arrived:"Close visit", Completed:"Completed", "Needs follow-up":"Follow-up required" };
const tone = (status: AppointmentStatus) => status === "Completed" ? "success" as const : ["Arrived","En route","Dispatched"].includes(status) ? "info" as const : status === "Needs follow-up" ? "warning" as const : "neutral" as const;
const dateOffset = (offset: number) => { const date = new Date(); date.setDate(date.getDate()+offset); return date.toISOString().slice(0,10); };
const columns: Array<{title:string;description:string;statuses:AppointmentStatus[]}> = [
  {title:"Ready",description:"Scheduled and waiting",statuses:["Scheduled"]},
  {title:"In motion",description:"Dispatched or on site",statuses:["Dispatched","En route","Arrived"]},
  {title:"Closed",description:"Completed with outcome",statuses:["Completed","Needs follow-up"]},
];

export function DispatchPage() {
  const { data, scope, currentUser, createAppointment, advanceAppointment, completeAppointment, reassignAppointment } = useWorkspace();
  const focus = typeof window !== "undefined" ? sessionStorage.getItem("momentum-focus-record") : null;
  const focusAppointment = scope.appointments.find(item => item.id === focus); const focusAccount = scope.accounts.find(item => item.id === focus);
  const [selectedDate,setSelectedDate] = useState(focusAppointment?.date ?? dateOffset(0));
  const [selectedId,setSelectedId] = useState(focusAppointment?.id ?? scope.appointments[0]?.id ?? "");
  const [createOpen,setCreateOpen] = useState(Boolean(focusAccount)); const [closeoutOpen,setCloseoutOpen] = useState(false); const [error,setError] = useState("");
  const [appointmentForm,setAppointmentForm] = useState({ accountId:focusAccount?.id ?? scope.accounts[0]?.id ?? "", ownerId:currentUser?.id ?? "", date:selectedDate, startTime:"10:00", duration:30, type:"First visit" as Appointment["type"], objective:"" });
  const [closeout,setCloseout] = useState({ outcome:"Follow-up scheduled" as AppointmentOutcome, closeoutNote:"", nextAction:"", nextActionDate:dateOffset(1) });
  const dates = useMemo(() => Array.from({length:5},(_,index) => dateOffset(index)),[]);
  const appointments = scope.appointments.filter(item => item.date === selectedDate).sort((a,b) => a.startTime.localeCompare(b.startTime));
  const selected = scope.appointments.find(item => item.id === selectedId) ?? appointments[0];
  const canManage = canManageSchedule(currentUser); const canCreate = canCreateScheduleItem(currentUser);
  const canOperate = Boolean(selected && currentUser && (selected.ownerId === currentUser.id || canManage));
  const assignable = data.users.filter(user => {
    if (user.role === "Customer") return false;
    if (currentUser?.role === "Administrator" || currentUser?.role === "Operations") return true;
    if (currentUser?.role === "Sales Manager") return scope.users.some(item => item.id === user.id);
    return user.id === currentUser?.id;
  });

  const submitAppointment = (event: FormEvent) => {
    event.preventDefault(); const id = createAppointment(appointmentForm);
    if (!id) { setError("Choose an account in your scope and complete all required fields."); return; }
    setSelectedId(id); setSelectedDate(appointmentForm.date); setCreateOpen(false); setError(""); sessionStorage.removeItem("momentum-focus-record");
  };
  const submitCloseout = (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    if (!completeAppointment(selected.id,closeout)) { setError("Outcome, note, next action, and next-action date are required."); return; }
    setCloseoutOpen(false); setError(""); setCloseout({outcome:"Follow-up scheduled",closeoutNote:"",nextAction:"",nextActionDate:dateOffset(1)});
  };
  const card = (appointment: Appointment) => {
    const account = scope.accounts.find(item => item.id === appointment.accountId); const owner = data.users.find(item => item.id === appointment.ownerId);
    return <button className={`dispatch-card ${selected?.id === appointment.id ? "is-selected" : ""}`} key={appointment.id} onClick={() => setSelectedId(appointment.id)}>
      <div className="dispatch-card__time"><Clock3 size={14}/><span>{appointment.startTime}</span><small>{appointment.duration}m</small></div><strong>{account?.name}</strong><p>{appointment.type}</p><div className="dispatch-card__location"><MapPin size={13}/> {appointment.location}</div>
      <div className="dispatch-card__foot">{owner && <><Avatar initials={owner.initials} color={owner.accent} size="sm"/><span>{owner.firstName}</span></>}<StatusPill tone={tone(appointment.status)} dot={false}>{appointment.status}</StatusPill></div>
    </button>;
  };

  return <div className="page page--dispatch">
    <PageHeader eyebrow="Field operations" title="Schedule & dispatch" description="Plan assigned work, preserve ownership, and close every visit with an outcome and dated next action." actions={canCreate ? <Button variant="gold" icon={<Plus size={17}/>} onClick={() => setCreateOpen(true)}>Schedule work</Button> : undefined}/>
    <div className="dispatch-summary"><div><span className="summary-icon summary-icon--blue"><CalendarDays size={19}/></span><span><strong>{appointments.length}</strong><small>appointments</small></span></div><i/><div><span className="summary-icon summary-icon--gold"><Route size={19}/></span><span><strong>{appointments.filter(item => ["Dispatched","En route","Arrived"].includes(item.status)).length}</strong><small>in motion</small></span></div><i/><div><span className="summary-icon summary-icon--green"><CheckCircle2 size={19}/></span><span><strong>{appointments.filter(item => item.status === "Completed").length}</strong><small>completed</small></span></div><i/><div className="dispatch-summary__policy"><Navigation size={17}/><span><strong>Event-based status</strong><small>Live location tracking is off</small></span></div></div>
    <div className="date-tabs">{dates.map((date,index) => <button key={date} className={selectedDate === date ? "is-active" : ""} onClick={() => setSelectedDate(date)}><span>{index === 0 ? "Today" : formatDate(date,{weekday:"short"})}</span><strong>{formatDate(date,{month:"short",day:"numeric"})}</strong><i>{scope.appointments.filter(item => item.date === date).length}</i></button>)}</div>
    <div className="dispatch-layout"><div className="dispatch-board">{columns.map(column => { const items = appointments.filter(item => column.statuses.includes(item.status)); return <section className="dispatch-column" key={column.title}><header><div><h2>{column.title}</h2><p>{column.description}</p></div><span>{items.length}</span></header><div className="dispatch-column__cards">{items.map(card)}{items.length === 0 && <div className="dispatch-empty"><Route size={20}/><span>No work in this lane</span></div>}</div></section>; })}</div>
      <Section className="dispatch-detail" title="Work details" description="Operational result, separate from payroll time">{selected ? (() => {
        const account = scope.accounts.find(item => item.id === selected.accountId); const owner = data.users.find(item => item.id === selected.ownerId);
        return <div className="dispatch-detail__body"><div className="dispatch-detail__status"><StatusPill tone={tone(selected.status)}>{selected.status}</StatusPill><span>{selected.startTime} · {selected.duration} min</span></div><h3>{account?.name}</h3><p className="dispatch-detail__type">{selected.type}</p><div className="objective-card"><span>Visit objective</span><p>{selected.objective}</p></div>
          <dl className="detail-list"><div><dt><MapPin size={15}/> Location</dt><dd>{selected.location}</dd></div><div><dt><UserRoundCheck size={15}/> Assigned to</dt><dd>{owner?.name}</dd></div><div><dt><Clock3 size={15}/> Scheduled</dt><dd>{formatDate(selected.date,{month:"short",day:"numeric"})} at {selected.startTime}</dd></div></dl>
          {canManage && <label className="reassign-field"><span>Reassign with audit history</span><select value={selected.ownerId} onChange={event => reassignAppointment(selected.id,event.target.value)}>{assignable.map(user => <option value={user.id} key={user.id}>{user.name} · {user.title}</option>)}</select></label>}
          {canOperate && !["Completed","Needs follow-up"].includes(selected.status) && <Button size="lg" icon={<ArrowRight size={17}/>} onClick={() => selected.status === "Arrived" ? setCloseoutOpen(true) : advanceAppointment(selected.id)}>{nextLabel[selected.status]}</Button>}
          {selected.status === "Completed" && <div className="completed-closeout"><div><CheckCircle2 size={17}/><strong>{selected.outcome ?? "Visit completed"}</strong></div>{selected.closeoutNote && <p>{selected.closeoutNote}</p>}{selected.nextAction && <small>Next: {selected.nextAction} · {selected.nextActionDate ? formatDate(selected.nextActionDate) : "date not set"}</small>}</div>}
        </div>;
      })() : <div className="dispatch-empty"><p>Select an appointment.</p></div>}</Section>
    </div>

    <Modal open={createOpen} title="Schedule field work" description="Create a dated assignment with one clear objective." onClose={() => { setCreateOpen(false); sessionStorage.removeItem("momentum-focus-record"); }} footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="appointment-form">Schedule</Button></>}>
      <form id="appointment-form" className="form-grid" onSubmit={submitAppointment}>
        <Field label="Account"><select required value={appointmentForm.accountId} onChange={event => setAppointmentForm({...appointmentForm,accountId:event.target.value})}>{scope.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
        <Field label="Assigned to"><select value={appointmentForm.ownerId} disabled={!canManage} onChange={event => setAppointmentForm({...appointmentForm,ownerId:event.target.value})}>{assignable.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
        <Field label="Date"><input type="date" required value={appointmentForm.date} onChange={event => setAppointmentForm({...appointmentForm,date:event.target.value})}/></Field>
        <Field label="Start time"><input type="time" required value={appointmentForm.startTime} onChange={event => setAppointmentForm({...appointmentForm,startTime:event.target.value})}/></Field>
        <Field label="Work type"><select value={appointmentForm.type} onChange={event => setAppointmentForm({...appointmentForm,type:event.target.value as Appointment["type"]})}><option>First visit</option><option>Sample drop</option><option>Placement check</option><option>Reorder</option><option>Delivery</option></select></Field>
        <Field label="Duration (minutes)"><input type="number" min={15} step={5} required value={appointmentForm.duration} onChange={event => setAppointmentForm({...appointmentForm,duration:Number(event.target.value)})}/></Field>
        <Field label="Objective" className="field--full"><textarea rows={3} required value={appointmentForm.objective} onChange={event => setAppointmentForm({...appointmentForm,objective:event.target.value})} placeholder="What must be accomplished before this work can be closed?"/></Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
    <Modal open={closeoutOpen} title="Close the visit" description="An outcome and dated next action are required so work cannot disappear between stages." onClose={() => setCloseoutOpen(false)} footer={<><Button variant="ghost" onClick={() => setCloseoutOpen(false)}>Keep open</Button><Button type="submit" form="closeout-form">Complete visit</Button></>}>
      <form id="closeout-form" className="form-grid" onSubmit={submitCloseout}>
        <Field label="Outcome"><select value={closeout.outcome} onChange={event => setCloseout({...closeout,outcome:event.target.value as AppointmentOutcome})}><option>Order placed</option><option>Follow-up scheduled</option><option>Placement verified</option><option>No decision</option><option>Closed lost</option><option>Delivery completed</option></select></Field>
        <Field label="Next-action date"><input type="date" required value={closeout.nextActionDate} onChange={event => setCloseout({...closeout,nextActionDate:event.target.value})}/></Field>
        <Field label="Visit note" className="field--full"><textarea rows={4} required value={closeout.closeoutNote} onChange={event => setCloseout({...closeout,closeoutNote:event.target.value})} placeholder="What happened and what did the customer say?"/></Field>
        <Field label="Next action" className="field--full"><input required value={closeout.nextAction} onChange={event => setCloseout({...closeout,nextAction:event.target.value})} placeholder="Specific owner action"/></Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  </div>;
}
