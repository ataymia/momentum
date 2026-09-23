"use client";

import { CalendarDays, CheckCircle2, GraduationCap, MapPin, Plus, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useBrandAmbassadors } from "../../lib/brand-ambassador-context";
import type { BrandAmbassadorEventDraft, BrandAmbassadorEventGroup } from "../../lib/brand-ambassador-engine";
import { arizonaDateKey } from "../../lib/date-time";
import { useHcm } from "../../lib/hcm-context";
import { useTrainingLibrary } from "../../lib/training-library-context";
import { useWorkspace } from "../../lib/workspace-context";
import { TrainingMaterialLink } from "../hcm/training-material-link";
import { EventRequestPanel } from "../brand-ambassadors/event-request-panel";
import { Button, Field, PageHeader, Section, StatusPill } from "../ui";

const blankDraft = (): BrandAmbassadorEventDraft => ({ title:"",date:arizonaDateKey(),startTime:"10:00",endTime:"12:00",address:"",requiredStaff:1,notes:"",ambassadorIds:[] });
const displayTime=(value:string)=>{const [hourText,minute]=value.split(":");const hour=Number(hourText);if(!Number.isFinite(hour))return value;return `${hour%12||12}:${minute} ${hour>=12?"PM":"AM"}`;};

function EventCard({ event, canManage, onStatus }: { event: BrandAmbassadorEventGroup; canManage: boolean; onStatus: (eventGroupId: string, status: "Completed" | "Cancelled") => void }) {
  const { data } = useWorkspace();
  const ambassadors = event.ambassadorIds.map((id) => data.users.find((user) => user.id === id)?.name ?? id);
  return <article className="onboarding-review-card"><span className="provisioning-avatar"><CalendarDays size={18}/></span><div className="onboarding-review-body"><strong>{event.title}</strong><p>{event.date} · {displayTime(event.startTime)}–{displayTime(event.endTime)}</p><small><MapPin size={13}/> {event.address}</small><small><UsersRound size={13}/> {ambassadors.length} assigned / {event.requiredStaff} needed · {ambassadors.join(", ")}</small>{event.notes&&<small>{event.notes}</small>}</div><StatusPill tone={event.status==="Completed"?"success":event.status==="Cancelled"?"neutral":"info"}>{event.status}</StatusPill>{canManage&&event.status==="Scheduled"&&<div className="provisioning-row-actions"><Button size="sm" variant="secondary" onClick={()=>onStatus(event.eventGroupId,"Completed")}>Mark complete</Button><Button size="sm" variant="ghost" onClick={()=>onStatus(event.eventGroupId,"Cancelled")}>Cancel</Button></div>}</article>;
}

export function BrandAmbassadorsPage() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const trainingLibrary = useTrainingLibrary();
  const ba = useBrandAmbassadors();
  const [form, setForm] = useState<BrandAmbassadorEventDraft>(blankDraft);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canSchedule = currentUser?.role === "Administrator";
  const today = arizonaDateKey();
  const upcoming = ba.visibleEvents.filter((event) => event.status === "Scheduled" && event.date >= today);
  const history = ba.visibleEvents.filter((event) => event.status !== "Scheduled" || event.date < today).slice().reverse();
  const myTraining = useMemo(() => currentUser?.role === "Brand Ambassador" ? hcm.training.filter((assignment) => assignment.userId === currentUser.id).map((assignment) => ({ assignment, course: hcm.courses.find((course) => course.id === assignment.courseId) })).filter((item) => item.course) : [], [currentUser, hcm.courses, hcm.training]);
  const toggleAmbassador=(id:string)=>setForm((current)=>({...current,ambassadorIds:current.ambassadorIds.includes(id)?current.ambassadorIds.filter((item)=>item!==id):[...current.ambassadorIds,id]}));

  const submit=(event:FormEvent)=>{event.preventDefault();setError("");setNotice("");const result=ba.scheduleEvent(form);if(!result.ok){setError(result.message);return}setNotice("Brand Ambassador event scheduled. Everyone assigned will see it in their own schedule.");setForm(blankDraft());};
  const setStatus=(eventGroupId:string,status:"Completed"|"Cancelled")=>{setNotice("");if(!ba.setEventStatus(eventGroupId,status)){setError("Momentum could not update that event. Check that the Brand Ambassadors are still assigned to you.");return}setError("");setNotice(status==="Completed"?"Event marked complete.":"Event cancelled.");};

  return <div className="page page--focused-tool">
    <PageHeader eyebrow="Field marketing" title={currentUser?.role==="Brand Ambassador"?"My Brand Ambassador schedule":"Brand Ambassadors"} description={currentUser?.role==="Brand Ambassador"?"Your assigned Golden Eagle events and training. There is no open-job marketplace here, only work Momentum has actually scheduled for you.":"A lightweight event board for sampling and activations. Schedule the Brand Ambassadors you supervise without exposing HR, pay, or private employee records."}/>

    {currentUser?.role==="Sales Representative"&&<EventRequestPanel/>}
    {canSchedule&&<Section title="Schedule an event" description="Create the event once, assign the Brand Ambassadors, and Momentum puts it directly on their schedule." action={<StatusPill tone="gold"><Plus size={14}/> Direct assignment</StatusPill>}><form className="provisioning-form" onSubmit={submit}><div className="form-grid"><Field label="Event name"><input required value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})} placeholder="Golden Eagle sampling"/></Field><Field label="Date"><input required type="date" value={form.date} onChange={(event)=>setForm({...form,date:event.target.value})}/></Field><Field label="Start time"><input required type="time" value={form.startTime} onChange={(event)=>setForm({...form,startTime:event.target.value})}/></Field><Field label="End time"><input required type="time" value={form.endTime} onChange={(event)=>setForm({...form,endTime:event.target.value})}/></Field><Field label="Address / venue" className="field--full"><input required value={form.address} onChange={(event)=>setForm({...form,address:event.target.value})} placeholder="Venue name or full address"/></Field><Field label="People needed"><input required type="number" min="1" step="1" value={form.requiredStaff} onChange={(event)=>setForm({...form,requiredStaff:Number(event.target.value)})}/></Field><Field label="Event notes" className="field--full"><textarea rows={3} value={form.notes??""} onChange={(event)=>setForm({...form,notes:event.target.value})} placeholder="Setup instructions, contact name, arrival notes, etc."/></Field></div><div className="training-picker"><strong>Assign Brand Ambassadors</strong>{ba.availableAmbassadors.map((ambassador)=>{const supervisor=data.users.find((user)=>user.id===ambassador.managerId);return <label key={ambassador.id}><input type="checkbox" checked={form.ambassadorIds.includes(ambassador.id)} onChange={()=>toggleAmbassador(ambassador.id)}/><span><strong>{ambassador.name}</strong><small>{currentUser?.role==="Administrator"?`Assigned rep: ${supervisor?.name??"Unassigned"}`:"Your Brand Ambassador"}</small></span></label>;})}{ba.availableAmbassadors.length===0&&<p>No Brand Ambassadors are assigned to your scheduling scope yet.</p>}</div>{error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-notice" role="status">{notice}</p>}<div className="provisioning-actions"><Button type="submit" disabled={!ba.availableAmbassadors.length}>Schedule event</Button></div></form></Section>}

    <Section title="Upcoming events" description={currentUser?.role==="Brand Ambassador"?"These events are assigned to you. Date, time, address and staffing are the source of truth.":"Scheduled Brand Ambassador work in your scope."} action={<StatusPill tone={upcoming.length?"info":"neutral"}>{upcoming.length} upcoming</StatusPill>}><div className="provisioning-queue onboarding-approval-list">{upcoming.map((event)=><EventCard key={event.eventGroupId} event={event} canManage={Boolean(canSchedule)} onStatus={setStatus}/>)}{upcoming.length===0&&<div className="review-empty"><CalendarDays size={24}/><h3>No upcoming Brand Ambassador events</h3><p>{currentUser?.role==="Brand Ambassador"?"When your rep schedules you, the event will appear here.":"Schedule an event above when field activation work is ready."}</p></div>}</div></Section>

    {currentUser?.role==="Brand Ambassador"&&<Section title="Training" description="Training assigned by Momentum. Open the linked videos and materials for each module." action={<StatusPill tone="neutral"><GraduationCap size={14}/> {myTraining.length} module{myTraining.length===1?"":"s"}</StatusPill>}><div className="provisioning-queue">{myTraining.map(({assignment,course})=>{const materials=trainingLibrary.materialsForCourse(course!.id);return <article key={assignment.id}><span className="provisioning-avatar"><GraduationCap size={18}/></span><div><strong>{course!.title}</strong><p>{course!.description}</p>{materials.map((item)=><TrainingMaterialLink key={item.id} material={item}/>)}</div><StatusPill tone={assignment.status==="Complete"?"success":"warning"}>{assignment.status}</StatusPill></article>;})}{myTraining.length===0&&<div className="review-empty"><CheckCircle2 size={24}/><h3>No training assigned</h3><p>Your assigned modules will appear here.</p></div>}</div></Section>}

    {history.length>0&&<Section title="Event history" description="Completed and cancelled assignments."><div className="provisioning-queue onboarding-approval-list">{history.map((event)=><EventCard key={event.eventGroupId} event={event} canManage={false} onStatus={setStatus}/>)}</div></Section>}
  </div>;
}
