"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  RotateCcw,
  Send,
  ShieldCheck,
  UserCheck,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Avatar, Button, PageHeader, Section, StatusPill, formatDate, hoursBetween } from "../ui";

const timecardTone = (status: string) => {
  if (["Manager approved", "Payroll ready"].includes(status)) return "success" as const;
  if (status === "Submitted") return "info" as const;
  if (status === "Returned") return "danger" as const;
  return "neutral" as const;
};

export function PeoplePage() {
  const {
    data,
    scope,
    currentUser,
    toggleClock,
    submitTimecard,
    decideTimecard,
  } = useWorkspace();
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const myTimecard = scope.timecards.find((card) => card.userId === currentUser?.id);
  const myEntries = scope.timeEntries.filter((entry) => entry.userId === currentUser?.id && (!myTimecard || (entry.date >= myTimecard.weekStart && entry.date <= myTimecard.weekEnd)));
  const activeEntry = myEntries.find((entry) => !entry.clockOut);
  const reviewCards = scope.timecards.filter((card) => card.status === "Submitted" && card.userId !== currentUser?.id);
  const canReview = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";

  const myHours = myEntries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);

  return (
    <div className="page page--people">
      <PageHeader
        eyebrow="People operations"
        title="People & time"
        description="Worked time, weekly attestations, manager review, and payroll handoff—without silent edits."
        actions={<StatusPill tone="gold">Weekly pay period · demo</StatusPill>}
      />

      <div className="payroll-control-alert">
        <ShieldCheck size={20} />
        <div><strong>Approval verifies the record; it does not make worked time payable.</strong><p>Raw punches remain preserved. Corrections create an audited record instead of rewriting history.</p></div>
      </div>

      <div className="people-tabs">
        <button className={tab === "mine" ? "is-active" : ""} onClick={() => setTab("mine")}><Clock3 size={17} /> My time</button>
        {canReview && <button className={tab === "review" ? "is-active" : ""} onClick={() => setTab("review")}><UserCheck size={17} /> Manager review <i>{reviewCards.length}</i></button>}
      </div>

      {tab === "mine" && (
        <>
          <div className="time-overview">
            <section className={`clock-card ${activeEntry ? "is-running" : ""}`}>
              <div className="clock-card__top"><span><Clock3 size={21} /></span><StatusPill tone={activeEntry ? "success" : "neutral"}>{activeEntry ? "On the clock" : "Clocked out"}</StatusPill></div>
              <p>{formatDate(new Date().toISOString(), { weekday: "long", month: "long", day: "numeric" })}</p>
              <strong className="clock-card__time">{activeEntry ? `Since ${activeEntry.clockIn}` : `${myHours.toFixed(2)} hrs`}</strong>
              <small>{activeEntry ? "Server and device times will both be retained after integration." : "Recorded in the current demo week."}</small>
              <Button variant={activeEntry ? "danger" : "primary"} size="lg" icon={activeEntry ? <X size={17} /> : <ArrowRight size={17} />} onClick={toggleClock}>
                {activeEntry ? "Clock out" : "Clock in"}
              </Button>
              <div className="clock-source"><span>Source</span><strong>Demo desktop · GPS off</strong></div>
            </section>

            <section className="weekly-card-summary">
              <div className="weekly-card-summary__head"><div><small>Current pay period</small><h2>{myTimecard ? `${formatDate(myTimecard.weekStart, { month: "short", day: "numeric" })} – ${formatDate(myTimecard.weekEnd, { month: "short", day: "numeric" })}` : "No timecard"}</h2></div>{myTimecard && <StatusPill tone={timecardTone(myTimecard.status)}>{myTimecard.status}</StatusPill>}</div>
              <div className="weekly-total"><span><strong>{myHours.toFixed(2)}</strong> hours</span><small>{myEntries.length} time events · 0 open exceptions</small></div>
              <div className="daily-bars">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
                  const dayEntries = myEntries.filter((entry) => { const weekday = new Date(`${entry.date}T12:00:00`).getDay(); return (weekday + 6) % 7 === index; });
                  const hours = dayEntries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);
                  return <div key={day}><span><i style={{ height: `${Math.max(6, hours * 8)}px` }} /></span><small>{day}</small></div>;
                })}
              </div>
              {myTimecard?.status === "Open" && (
                <Button icon={<Send size={17} />} onClick={() => submitTimecard(myTimecard.id)} disabled={Boolean(activeEntry)}>Attest & submit week</Button>
              )}
              {myTimecard?.status === "Submitted" && <div className="submitted-note"><CheckCircle2 size={17} /><span>Submitted for manager review. Ordinary editing is locked.</span></div>}
              {activeEntry && <p className="submit-blocker"><AlertTriangle size={14} /> Clock out before submitting this week.</p>}
            </section>
          </div>

          <Section title="Time events" description="Original events remain visible after corrections" className="time-events-panel">
            <div className="time-event-table time-event-table--head"><span>Date</span><span>Clock in</span><span>Clock out</span><span>Break</span><span>Hours</span><span>Source</span><span>Status</span></div>
            {myEntries.map((entry) => (
              <div className="time-event-table" key={entry.id}>
                <span><strong>{formatDate(entry.date, { weekday: "short" })}</strong><small>{formatDate(entry.date, { month: "short", day: "numeric" })}</small></span>
                <span>{entry.clockIn}</span><span>{entry.clockOut ?? "Active"}</span><span>{entry.breakMinutes} min</span><span>{entry.clockOut ? hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes).toFixed(2) : "—"}</span><span>{entry.source}</span><span><StatusPill tone={entry.clockOut ? "success" : "info"} dot={false}>{entry.clockOut ? "Complete" : "Open"}</StatusPill></span>
              </div>
            ))}
            {myEntries.length === 0 && <div className="list-empty">No time events in this demo week.</div>}
          </Section>
        </>
      )}

      {tab === "review" && canReview && (
        <div className="manager-review-layout">
          <Section title="Submitted timecards" description="No self-approval; backup approvers remain configurable" className="timecard-review-list">
            {reviewCards.map((card) => {
              const employee = data.users.find((user) => user.id === card.userId);
              const entries = scope.timeEntries.filter((entry) => entry.userId === card.userId);
              const hours = entries.reduce((sum, entry) => sum + hoursBetween(entry.clockIn, entry.clockOut, entry.breakMinutes), 0);
              return (
                <article className="review-card" key={card.id}>
                  <div className="review-card__person">{employee && <Avatar initials={employee.initials} color={employee.accent} />}<div><strong>{employee?.name}</strong><p>{employee?.title}</p></div><StatusPill tone="info">Submitted</StatusPill></div>
                  <div className="review-card__facts"><div><small>Period</small><strong>{formatDate(card.weekStart, { month: "short", day: "numeric" })} – {formatDate(card.weekEnd, { month: "short", day: "numeric" })}</strong></div><div><small>Recorded</small><strong>{hours.toFixed(2)} hrs</strong></div><div><small>Attested</small><strong>{card.attested ? "Yes" : "No"}</strong></div></div>
                  <div className="review-card__notice"><FileCheck2 size={16} /><span>Employee attestation and original time events remain available for review.</span></div>
                  <div className="review-card__actions"><Button variant="secondary" icon={<RotateCcw size={15} />} onClick={() => decideTimecard(card.id, "Returned")}>Return</Button><Button icon={<Check size={16} />} onClick={() => decideTimecard(card.id, "Manager approved")}>Approve</Button></div>
                </article>
              );
            })}
            {reviewCards.length === 0 && <div className="review-empty"><CheckCircle2 size={24} /><h3>Queue clear</h3><p>No submitted timecards need manager review.</p></div>}
          </Section>

          <Section title="Weekly payroll pipeline" description="Provider-neutral by design" className="payroll-pipeline">
            {[
              [UsersRound, "Employee submits", "Attestation and snapshot"],
              [UserCheck, "Manager reviews", "Accuracy and exceptions"],
              [ShieldCheck, "HR / payroll audit", "Pay codes and corrections"],
              [WalletCards, "Provider handoff", "Batch, acceptance, reconciliation"],
            ].map(([Icon, title, detail], index) => {
              const StepIcon = Icon as typeof UsersRound;
              return <div key={title as string}><span><StepIcon size={18} /></span><div><strong>{title as string}</strong><p>{detail as string}</p></div><i>{index + 1}</i></div>;
            })}
            <div className="payroll-pipeline__gate"><AlertTriangle size={17} /><p>Payroll configuration is restricted to administrators and must be completed before live timecards are accepted.</p></div>
          </Section>
        </div>
      )}
    </div>
  );
}
