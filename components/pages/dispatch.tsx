"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  Route,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Appointment, AppointmentStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, PageHeader, Section, StatusPill, formatDate } from "../ui";

const nextLabel: Record<AppointmentStatus, string> = {
  Scheduled: "Dispatch",
  Dispatched: "Start route",
  "En route": "Mark arrived",
  Arrived: "Complete visit",
  Completed: "Create follow-up",
  "Needs follow-up": "Mark resolved",
};

const toneForStatus = (status: AppointmentStatus) => {
  if (status === "Completed") return "success" as const;
  if (status === "Arrived" || status === "En route" || status === "Dispatched") return "info" as const;
  if (status === "Needs follow-up") return "warning" as const;
  return "neutral" as const;
};

function dateOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const columns: Array<{ title: string; description: string; statuses: AppointmentStatus[] }> = [
  { title: "Ready", description: "Scheduled and waiting", statuses: ["Scheduled"] },
  { title: "In motion", description: "Dispatched or on site", statuses: ["Dispatched", "En route", "Arrived"] },
  { title: "Closed", description: "Complete or needs action", statuses: ["Completed", "Needs follow-up"] },
];

export function DispatchPage() {
  const { data, advanceAppointment, reassignAppointment } = useWorkspace();
  const [selectedDate, setSelectedDate] = useState(dateOffset(0));
  const [selectedId, setSelectedId] = useState(data.appointments[0]?.id ?? "");
  const dates = useMemo(() => Array.from({ length: 5 }, (_, index) => dateOffset(index)), []);
  const appointments = data.appointments
    .filter((appointment) => appointment.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selected = data.appointments.find((appointment) => appointment.id === selectedId) ?? appointments[0];

  const renderAppointment = (appointment: Appointment) => {
    const account = data.accounts.find((item) => item.id === appointment.accountId);
    const owner = data.users.find((item) => item.id === appointment.ownerId);
    return (
      <button
        className={`dispatch-card ${selected?.id === appointment.id ? "is-selected" : ""}`}
        key={appointment.id}
        onClick={() => setSelectedId(appointment.id)}
      >
        <div className="dispatch-card__time"><Clock3 size={14} /><span>{appointment.startTime}</span><small>{appointment.duration}m</small></div>
        <strong>{account?.name}</strong>
        <p>{appointment.type}</p>
        <div className="dispatch-card__location"><MapPin size={13} /> {appointment.location}</div>
        <div className="dispatch-card__foot">
          {owner && <><Avatar initials={owner.initials} color={owner.accent} size="sm" /><span>{owner.firstName}</span></>}
          <StatusPill tone={toneForStatus(appointment.status)} dot={false}>{appointment.status}</StatusPill>
        </div>
      </button>
    );
  };

  return (
    <div className="page page--dispatch">
      <PageHeader
        eyebrow="Field operations"
        title="Schedule & dispatch"
        description="Plan the work, preserve ownership history, and close every visit with a real result."
      />

      <div className="dispatch-summary">
        <div><span className="summary-icon summary-icon--blue"><CalendarDays size={19} /></span><span><strong>{appointments.length}</strong><small>appointments</small></span></div>
        <i />
        <div><span className="summary-icon summary-icon--gold"><Route size={19} /></span><span><strong>{appointments.filter((item) => ["Dispatched", "En route", "Arrived"].includes(item.status)).length}</strong><small>in motion</small></span></div>
        <i />
        <div><span className="summary-icon summary-icon--green"><CheckCircle2 size={19} /></span><span><strong>{appointments.filter((item) => item.status === "Completed").length}</strong><small>completed</small></span></div>
        <i />
        <div className="dispatch-summary__policy"><Navigation size={17} /><span><strong>Event-based location</strong><small>Live tracking is off in V1</small></span></div>
      </div>

      <div className="date-tabs">
        {dates.map((date, index) => (
          <button key={date} className={selectedDate === date ? "is-active" : ""} onClick={() => setSelectedDate(date)}>
            <span>{index === 0 ? "Today" : formatDate(date, { weekday: "short" })}</span>
            <strong>{formatDate(date, { month: "short", day: "numeric" })}</strong>
            <i>{data.appointments.filter((appointment) => appointment.date === date).length}</i>
          </button>
        ))}
      </div>

      <div className="dispatch-layout">
        <div className="dispatch-board">
          {columns.map((column) => {
            const items = appointments.filter((appointment) => column.statuses.includes(appointment.status));
            return (
              <section className="dispatch-column" key={column.title}>
                <header><div><h2>{column.title}</h2><p>{column.description}</p></div><span>{items.length}</span></header>
                <div className="dispatch-column__cards">
                  {items.map(renderAppointment)}
                  {items.length === 0 && <div className="dispatch-empty"><Route size={20} /><span>No work in this lane</span></div>}
                </div>
              </section>
            );
          })}
        </div>

        <Section className="dispatch-detail" title="Work details" description="Operational truth, separate from payroll time">
          {selected ? (() => {
            const account = data.accounts.find((item) => item.id === selected.accountId);
            const owner = data.users.find((item) => item.id === selected.ownerId);
            return (
              <div className="dispatch-detail__body">
                <div className="dispatch-detail__status"><StatusPill tone={toneForStatus(selected.status)}>{selected.status}</StatusPill><span>{selected.startTime} · {selected.duration} min</span></div>
                <h3>{account?.name}</h3>
                <p className="dispatch-detail__type">{selected.type}</p>
                <div className="objective-card"><span>Visit objective</span><p>{selected.objective}</p></div>
                <dl className="detail-list">
                  <div><dt><MapPin size={15} /> Location</dt><dd>{selected.location}</dd></div>
                  <div><dt><UserRoundCheck size={15} /> Assigned to</dt><dd>{owner?.name}</dd></div>
                  <div><dt><Clock3 size={15} /> Scheduled</dt><dd>{formatDate(selected.date, { month: "short", day: "numeric" })} at {selected.startTime}</dd></div>
                </dl>
                <label className="reassign-field">
                  <span>Reassign with audit history</span>
                  <select value={selected.ownerId} onChange={(event) => reassignAppointment(selected.id, event.target.value)}>
                    {data.users.filter((user) => ["Administrator", "Sales Representative", "Operations"].includes(user.role)).map((user) => (
                      <option value={user.id} key={user.id}>{user.name} · {user.title}</option>
                    ))}
                  </select>
                </label>
                <Button size="lg" icon={<ArrowRight size={17} />} onClick={() => advanceAppointment(selected.id)}>
                  {nextLabel[selected.status]}
                </Button>
                {selected.status === "Completed" && (
                  <div className="closeout-warning"><CheckCircle2 size={17} /><p>Completion is timestamped. A disposition and next action remain required before full closeout.</p></div>
                )}
              </div>
            );
          })() : <div className="dispatch-empty"><p>Select an appointment.</p></div>}
        </Section>
      </div>
    </div>
  );
}
