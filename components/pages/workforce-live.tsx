"use client";

import { Clock3, LocateFixed, MapPin, Route, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { useHcm } from "../../lib/hcm-context";
import { useFieldTracking } from "../../lib/location-tracking-context";
import {
  ROUTE_PING_INTERVAL_MINUTES,
  ROUTE_RETENTION_DAYS,
  roleIsTracked,
  type RouteSample,
} from "../../lib/location-tracking-engine";
import type { TimeEntry, WorkspaceUser } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { PageHeader, Section, StatusPill, formatDate } from "../ui";

const FRESH_PING_MS = 20 * 60_000;

function newestEntry(entries: TimeEntry[]) {
  return [...entries].sort((a, b) => `${b.date}T${b.clockIn}`.localeCompare(`${a.date}T${a.clockIn}`))[0];
}

function openEntry(entries: TimeEntry[]) {
  return newestEntry(entries.filter((entry) => !entry.clockOut));
}

function clockStatus(entries: TimeEntry[], today: string) {
  const open = openEntry(entries);
  if (open) return { label: "Clocked in", tone: "success" as const, entry: open };
  const todayEntries = entries.filter((entry) => entry.date === today);
  const latest = newestEntry(todayEntries);
  if (latest) return { label: "Clocked out", tone: "neutral" as const, entry: latest };
  return { label: "Not clocked today", tone: "warning" as const, entry: undefined };
}

function punchLabel(entry: TimeEntry | undefined) {
  if (!entry) return "No punch today";
  return `${entry.clockIn} → ${entry.clockOut ?? "Open"}`;
}

function routeProjection(samples: RouteSample[], width = 760, height = 280, padding = 26) {
  if (!samples.length) return [];
  if (samples.length === 1) return [{ x: width / 2, y: height / 2, sample: samples[0] }];
  const latitudes = samples.map((sample) => sample.latitude);
  const longitudes = samples.map((sample) => sample.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  return samples.map((sample) => ({
    sample,
    x: padding + ((sample.longitude - minLng) / lngSpan) * (width - padding * 2),
    y: height - padding - ((sample.latitude - minLat) / latSpan) * (height - padding * 2),
  }));
}

function googleMapsUrl(samples: RouteSample[]) {
  if (!samples.length) return undefined;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (samples.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${last.latitude},${last.longitude}`)}`;
  }
  const middle = samples.slice(1, -1);
  const stride = Math.max(1, Math.ceil(middle.length / 8));
  const waypoints = middle.filter((_, index) => index % stride === 0).slice(0, 8);
  const params = new URLSearchParams({
    api: "1",
    origin: `${first.latitude},${first.longitude}`,
    destination: `${last.latitude},${last.longitude}`,
    travelmode: "driving",
  });
  if (waypoints.length) params.set("waypoints", waypoints.map((sample) => `${sample.latitude},${sample.longitude}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function userEntries(data: ReturnType<typeof useWorkspace>["data"], userId: string) {
  return data.timeEntries.filter((entry) => entry.userId === userId);
}

function employeeLabel(user: WorkspaceUser) {
  return `${user.title} · ${user.team}`;
}

export function WorkforceLivePage() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const tracking = useFieldTracking();
  const today = arizonaDateKey();
  const [selectedId, setSelectedId] = useState("");

  const employees = useMemo(() => data.users
    .filter((user) => user.role !== "Customer")
    .filter((user) => {
      const employment = hcm.employees.find((record) => record.userId === user.id);
      return !employment || employment.status === "Active";
    })
    .sort((a, b) => a.name.localeCompare(b.name)), [data.users, hcm.employees]);

  if (!currentUser || currentUser.role !== "Administrator") return null;

  const selected = employees.find((user) => user.id === selectedId) ?? employees[0];
  const employeeRows = employees.map((user) => {
    const entries = userEntries(data, user.id);
    const status = clockStatus(entries, today);
    const shift = hcm.shifts.find((item) => item.userId === user.id && item.date === today && item.status !== "Cancelled");
    const latest = roleIsTracked(user.role) ? tracking.latestSampleForUser(user.id) : undefined;
    const pingAge = latest ? Date.now() - new Date(latest.at).getTime() : Number.POSITIVE_INFINITY;
    const pingState = !roleIsTracked(user.role) ? "Not tracked" : !status.entry || status.label !== "Clocked in" ? "Off duty" : !latest ? "Waiting for location" : pingAge <= FRESH_PING_MS ? "Fresh" : "Stale";
    return { user, entries, status, shift, latest, pingState };
  });

  const clockedIn = employeeRows.filter((row) => row.status.label === "Clocked in").length;
  const notClocked = employeeRows.length - clockedIn;
  const trackedOnClock = employeeRows.filter((row) => roleIsTracked(row.user.role) && row.status.label === "Clocked in");
  const freshRoutes = trackedOnClock.filter((row) => row.pingState === "Fresh").length;

  const selectedRow = employeeRows.find((row) => row.user.id === selected?.id);
  const selectedTodayEntries = selectedRow?.entries.filter((entry) => entry.date === today).sort((a, b) => b.clockIn.localeCompare(a.clockIn)) ?? [];
  const route = selected && roleIsTracked(selected.role) ? tracking.routeSamplesForUserDay(selected.id, today) : [];
  const points = routeProjection(route);
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const mapsUrl = googleMapsUrl(route);

  return <div className="page">
    <PageHeader
      eyebrow="Administration"
      title="Workforce live"
      description={`Clock status for active employees and Administrator-only field location evidence. Sales-rep route points are sampled about every ${ROUTE_PING_INTERVAL_MINUTES} minutes only while the rep is clocked in.`}
    />

    <div className="company-grid company-grid--two">
      <Section title="Live clock status">
        <div className="company-rule-facts">
          <div><span>Clocked in</span><strong>{clockedIn}</strong><small>Open time entry right now</small></div>
          <div><span>Not clocked in</span><strong>{notClocked}</strong><small>Clocked out or no punch today</small></div>
          <div><span>Field reps clocked in</span><strong>{trackedOnClock.length}</strong><small>Eligible for work-route pings</small></div>
          <div><span>Fresh field locations</span><strong>{freshRoutes}</strong><small>Latest ping within 20 minutes</small></div>
        </div>
      </Section>
      <Section title="Tracking control" description="Tracking stops when the time entry closes. No off-duty route collection is intended.">
        <div className="form-callout"><LocateFixed size={17}/><p>Regular route history is retained for {ROUTE_RETENTION_DAYS} days. Appointment arrival/departure evidence remains part of the field-control record. Browser location permission is required on the employee device.</p></div>
      </Section>
    </div>

    <Section title="Employee clock board" description="Select an employee to inspect today's punches and, for tracked field roles, Administrator-only route evidence.">
      <div className="company-request-list">
        {employeeRows.map((row) => <article key={row.user.id} onClick={() => setSelectedId(row.user.id)} style={{cursor:"pointer",outline:selected?.id===row.user.id?"2px solid var(--border-strong, var(--border))":"none"}}>
          <span><UsersRound size={17}/></span>
          <div>
            <small>{employeeLabel(row.user)}</small>
            <strong>{row.user.name}</strong>
            <p>{row.shift ? `Scheduled ${row.shift.startTime}–${row.shift.endTime} · ` : "No published shift today · "}{punchLabel(row.status.entry)}{roleIsTracked(row.user.role) ? ` · Location: ${row.pingState}` : ""}</p>
          </div>
          <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
        </article>)}
        {!employeeRows.length && <div className="review-empty"><p>No active employees are available.</p></div>}
      </div>
    </Section>

    {selected && selectedRow && <div className="company-grid company-grid--two">
      <Section title={`${selected.name} · today's time`} description="Clock-in and clock-out evidence comes from the same time-entry records used for timecards.">
        <div className="company-rule-facts">
          <div><span>Status</span><strong>{selectedRow.status.label}</strong><small>{punchLabel(selectedRow.status.entry)}</small></div>
          <div><span>Scheduled shift</span><strong>{selectedRow.shift ? `${selectedRow.shift.startTime}–${selectedRow.shift.endTime}` : "Not scheduled"}</strong><small>{selectedRow.shift?.location ?? "No published shift record"}</small></div>
        </div>
        <div className="company-request-list">
          {selectedTodayEntries.map((entry) => <article key={entry.id}><span><Clock3 size={16}/></span><div><strong>{entry.clockIn} → {entry.clockOut ?? "Open"}</strong><p>{entry.source} · {entry.breakMinutes} break min{entry.clockInAt ? ` · punched ${formatDate(entry.clockInAt,{hour:"numeric",minute:"2-digit"})}` : ""}</p></div><StatusPill tone={entry.clockOut?"neutral":"success"}>{entry.clockOut?"Closed":"Open"}</StatusPill></article>)}
          {!selectedTodayEntries.length && <div className="review-empty"><p>No time entry today.</p></div>}
        </div>
      </Section>

      <Section title={roleIsTracked(selected.role) ? "Clocked-in route" : "Location tracking"} description={roleIsTracked(selected.role) ? "Administrator-only route trace. Coordinates stay out of the screen; Google Maps can open the actual route when location evidence exists." : "This role is not configured for route tracking."}>
        {roleIsTracked(selected.role) ? <>
          <div className="company-rule-facts">
            <div><span>Tracking session</span><strong>{selectedRow.status.label==="Clocked in" ? "Clock controls active" : "Off duty"}</strong><small>{selectedRow.pingState}</small></div>
            <div><span>Saved route pings</span><strong>{route.length}</strong><small>Approximately every {ROUTE_PING_INTERVAL_MINUTES} minutes while active</small></div>
            <div><span>Latest ping</span><strong>{selectedRow.latest ? formatDate(selectedRow.latest.at,{hour:"numeric",minute:"2-digit"}) : "None"}</strong><small>{selectedRow.latest ? `Accuracy ±${Math.round(selectedRow.latest.accuracyMeters)} m` : "Waiting for device permission/location"}</small></div>
          </div>
          {points.length > 0 ? <div style={{border:"1px solid var(--border)",borderRadius:16,padding:10,overflow:"hidden"}}>
            <svg viewBox="0 0 760 280" role="img" aria-label="Relative route trace for selected employee" style={{width:"100%",height:"auto",display:"block"}}>
              <rect x="0" y="0" width="760" height="280" rx="12" fill="transparent"/>
              {points.length > 1 && <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity=".55"/>}
              {points.map((point,index) => <circle key={point.sample.id} cx={point.x} cy={point.y} r={index===points.length-1?7:4} fill="currentColor" opacity={index===points.length-1?1:.55}/>)}
            </svg>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:12,opacity:.72}}><span>Start {formatDate(route[0].at,{hour:"numeric",minute:"2-digit"})}</span><span>Latest {formatDate(route[route.length-1].at,{hour:"numeric",minute:"2-digit"})}</span></div>
          </div> : <div className="review-empty"><MapPin size={22}/><p>No route ping has been recorded for this employee today.</p></div>}
          {mapsUrl && <div className="account-detail__actions"><a href={mapsUrl} target="_blank" rel="noreferrer"><Route size={15}/> Open route in Google Maps</a></div>}
          {route.length > 0 && <div className="company-request-list">{[...route].reverse().slice(0,12).map((sample) => <article key={sample.id}><span><MapPin size={15}/></span><div><strong>{formatDate(sample.at,{hour:"numeric",minute:"2-digit"})}</strong><p>{sample.source} · accuracy ±{Math.round(sample.accuracyMeters)} m</p></div></article>)}</div>}
        </> : <div className="review-empty"><LocateFixed size={24}/><p>Clock status is visible, but route tracking is intentionally limited to designated field roles.</p></div>}
      </Section>
    </div>}

    <Section title="What 'live' means" description="The system never fabricates a location.">
      <div className="form-callout"><MapPin size={17}/><p>On supported browsers the app records a route point about every {ROUTE_PING_INTERVAL_MINUTES} minutes while the employee remains clocked in. If the browser or phone suspends the web app, disables location, loses service, or the user denies permission, the board shows the last real ping as stale instead of pretending the employee is still there.</p></div>
    </Section>
  </div>;
}
