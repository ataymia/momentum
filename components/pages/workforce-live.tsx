"use client";

import { Clock3, ExternalLink, LocateFixed, MapPin, Route, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { arizonaDateKey } from "../../lib/date-time";
import { routeReviewDates, routeDateWithinRetention, ROUTE_RETENTION_DAYS } from "../../lib/route-retention";
import { useHcm } from "../../lib/hcm-context";
import { visibleActiveEmployees } from "../../lib/employee-directory-visibility";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { AdminEmployeeProfiles } from "../hcm/admin-employee-profiles";
import { useFieldTracking } from "../../lib/location-tracking-context";
import {
  ROUTE_PING_INTERVAL_MINUTES,
  roleIsTracked,
  type RouteSample,
} from "../../lib/location-tracking-engine";
import type { TimeEntry, WorkspaceUser } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

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

function googleMapsPointUrl(sample: RouteSample) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${sample.latitude},${sample.longitude}`)}`;
}

function googleMapsEmbedUrl(sample: RouteSample) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${sample.latitude},${sample.longitude}`)}&z=15&output=embed`;
}

function googleMapsRouteUrl(samples: RouteSample[]) {
  if (!samples.length) return undefined;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (samples.length === 1) return googleMapsPointUrl(last);
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

function openExternal(url: string | undefined) {
  if (!url || typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function WorkforceLivePage() {
  const { data, currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const tracking = useFieldTracking();
  const today = arizonaDateKey();
  const [selectedId, setSelectedId] = useState("");
  const [reviewDate, setReviewDate] = useState(arizonaDateKey());
  const [view, setView] = useState<"live" | "profiles">("live");
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const firebase = useFirebaseSessionOptional();
  const employees = useMemo(() => visibleActiveEmployees(data.users,firebase?.accessRecords)
    .sort((a, b) => a.name.localeCompare(b.name)), [data.users, firebase?.accessRecords]);

  if (!currentUser || currentUser.role !== "Administrator") return null;

  const employeeRows = employees.map((user) => {
    const entries = userEntries(data, user.id);
    const status = clockStatus(entries, today);
    const shift = hcm.shifts.find((item) => item.userId === user.id && item.date === today && item.status !== "Cancelled");
    const latest = roleIsTracked(user.role) ? tracking.latestSampleForUser(user.id) : undefined;
    const pingAge = latest && nowMs ? nowMs - new Date(latest.at).getTime() : Number.POSITIVE_INFINITY;
    const pingState = !roleIsTracked(user.role)
      ? "Not tracked"
      : status.label !== "Clocked in"
        ? "Off duty"
        : !latest
          ? "Waiting for location"
          : !nowMs
            ? "Checking"
            : pingAge <= FRESH_PING_MS
              ? "Fresh"
              : "Stale";
    return { user, entries, status, shift, latest, pingState };
  });

  const clockedIn = employeeRows.filter((row) => row.status.label === "Clocked in").length;
  const notClocked = employeeRows.length - clockedIn;
  const trackedOnClock = employeeRows.filter((row) => roleIsTracked(row.user.role) && row.status.label === "Clocked in");
  const freshRoutes = trackedOnClock.filter((row) => row.pingState === "Fresh").length;

  const selected = employees.find((user) => user.id === selectedId);
  const selectedRow = employeeRows.find((row) => row.user.id === selectedId);
  const route = selected && roleIsTracked(selected.role) && routeDateWithinRetention(reviewDate) ? tracking.routeSamplesForUserDay(selected.id, reviewDate) : [];
  const historicalEntries = selectedRow?.entries.filter((entry) => entry.date === reviewDate).sort((a,b) => b.clockIn.localeCompare(a.clockIn)) ?? [];
  const mapsUrl = googleMapsRouteUrl(route);
  const latestRoutePing = route.at(-1);

  return <div className="page page--workforce-live">
    <PageHeader
      eyebrow="Administration"
      title={view==="live"?"Workforce live":"Employee profiles"}
      description={view==="live"
        ? `See who is clocked in, who is off clock, and the latest Administrator-only field location evidence. Sales Representative route points are sampled about every ${ROUTE_PING_INTERVAL_MINUTES} minutes while clocked in.`
        : "Open one employee and review their current status, contact information, time, pay, trips, account activity, delivery work, HR records, and audit history from one Administrator-only surface."}
    />
    <div className="company-tabs workforce-live__tabs">
      <button type="button" className={view==="live"?"is-active":""} onClick={()=>setView("live")}>Live board</button>
      <button type="button" className={view==="profiles"?"is-active":""} onClick={()=>setView("profiles")}>Employee profiles</button>
    </div>

    {view==="profiles"?<AdminEmployeeProfiles/>:<>
    <Section title="Live clock status" description="Clock status comes from the same source records used for timecards.">
      <div className="company-rule-facts workforce-live__metrics">
        <div><span>Clocked in</span><strong>{clockedIn}</strong><small>Open time entry right now</small></div>
        <div><span>Not clocked in</span><strong>{notClocked}</strong><small>Clocked out or no punch today</small></div>
        <div><span>Field reps clocked in</span><strong>{trackedOnClock.length}</strong><small>Eligible for work-route pings</small></div>
        <div><span>Fresh field locations</span><strong>{freshRoutes}</strong><small>Latest ping within 20 minutes</small></div>
      </div>
      <div className="form-callout workforce-live__notice"><LocateFixed size={17}/><p>Tracking stops when the employee clocks out. Browser location permission is required on the employee device. If a browser is suspended, Momentum shows the last real ping as stale instead of inventing a location.</p></div>
    </Section>

    <Section title="Employee clock board" description="Use View to open that employee's time and route detail without stretching the page.">
      <div className="workforce-roster">
        {employeeRows.map((row) => <article key={row.user.id}>
          <span className="workforce-roster__icon"><UsersRound size={17}/></span>
          <div className="workforce-roster__copy">
            <small>{employeeLabel(row.user)}</small>
            <strong>{row.user.name}</strong>
            <p>{row.shift ? `Scheduled ${row.shift.startTime}–${row.shift.endTime} · ` : "No published shift today · "}{punchLabel(row.status.entry)}</p>
            {roleIsTracked(row.user.role) && <em>Location: {row.pingState}{row.latest ? ` · latest ${formatDate(row.latest.at,{hour:"numeric",minute:"2-digit"})}` : ""}</em>}
          </div>
          <div className="workforce-roster__actions">
            <StatusPill tone={row.status.tone}>{row.status.label}</StatusPill>
            <Button type="button" size="sm" variant="secondary" onClick={() => { setSelectedId(row.user.id); setReviewDate(arizonaDateKey()); }}>View</Button>
          </div>
        </article>)}
        {!employeeRows.length && <div className="review-empty"><p>No active employees are available.</p></div>}
      </div>
    </Section>

    <Modal
      open={Boolean(selected && selectedRow)}
      title={selected ? `${selected.name} · workforce detail` : "Workforce detail"}
      description={selected ? employeeLabel(selected) : undefined}
      onClose={() => setSelectedId("")}
      wide
      footer={<>
        <Button variant="ghost" onClick={() => setSelectedId("")}>Close</Button>
        {mapsUrl && <Button variant="secondary" icon={<Route size={15}/>} onClick={() => openExternal(mapsUrl)}>Open route in Google Maps</Button>}
      </>}
    >
      {selected && selectedRow && <div className="workforce-detail">
        <div className="company-rule-facts workforce-detail__facts">
          <div><span>Status</span><strong>{selectedRow.status.label}</strong><small>{punchLabel(selectedRow.status.entry)}</small></div>
          <div><span>Scheduled shift</span><strong>{selectedRow.shift ? `${selectedRow.shift.startTime}–${selectedRow.shift.endTime}` : "Not scheduled"}</strong><small>{selectedRow.shift?.location ?? "No published shift record"}</small></div>
          {roleIsTracked(selected.role) && <div><span>Route pings</span><strong>{route.length}</strong><small>About every {ROUTE_PING_INTERVAL_MINUTES} minutes while clocked in</small></div>}
          {roleIsTracked(selected.role) && <div><span>Latest location</span><strong>{selectedRow.latest ? formatDate(selectedRow.latest.at,{hour:"numeric",minute:"2-digit"}) : "None"}</strong><small>{selectedRow.latest ? `Accuracy ±${Math.round(selectedRow.latest.accuracyMeters)} m · ${selectedRow.pingState}` : "Waiting for device permission/location"}</small></div>}
        </div>

        <Section title="Route and punch history" description={`Select one of the last ${ROUTE_RETENTION_DAYS} Arizona dates to review recorded punches and GPS pings. Missing pings are gaps, not proof of absence from work.`}>
          <label className="workforce-review-date-label" htmlFor="workforce-review-date">Review date</label>
          <select id="workforce-review-date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)}>
            {routeReviewDates().map((date) => <option key={date} value={date}>{date}</option>)}
          </select>
          <div className="workforce-detail__list">
            {historicalEntries.map((entry) => <article key={entry.id}>
              <span><Clock3 size={16}/></span>
              <div><strong>{entry.clockIn} → {entry.clockOut ?? "Open"}</strong><p>{entry.source} · {entry.breakMinutes} break min{entry.clockInAt ? ` · punched ${formatDate(entry.clockInAt,{hour:"numeric",minute:"2-digit"})}` : ""}{entry.note?.includes("Automatically closed at Arizona midnight") ? " · Auto-closed at midnight, correction required" : ""}</p></div>
              <StatusPill tone={entry.clockOut?"neutral":"success"}>{entry.clockOut?"Closed":"Open"}</StatusPill>
            </article>)}
            {!historicalEntries.length && <div className="review-empty"><p>No time entry recorded for this date.</p></div>}
          </div>
        </Section>

        {roleIsTracked(selected.role) && <Section title="Recorded route" description="Saved device pings for the selected date. Tracking only occurs while the device is permitted to report and an eligible work clock is open.">
          {latestRoutePing ? <div className="workforce-map">
            <iframe
              title={`Latest location for ${selected.name}`}
              src={googleMapsEmbedUrl(latestRoutePing)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="workforce-map__caption">
              <div><strong>Latest ping</strong><p>{formatDate(latestRoutePing.at,{hour:"numeric",minute:"2-digit"})} · accuracy ±{Math.round(latestRoutePing.accuracyMeters)} m</p></div>
              <Button size="sm" variant="secondary" icon={<ExternalLink size={14}/>} onClick={() => openExternal(googleMapsPointUrl(latestRoutePing))}>View latest ping</Button>
            </div>
          </div> : <div className="review-empty"><MapPin size={22}/><p>No route ping was recorded for this employee on this date. This does not prove they were not working.</p></div>}

          {route.length > 0 && <div className="workforce-pings">
            {[...route].reverse().map((sample,index) => <article key={sample.id}>
              <span className="workforce-pings__number">{route.length-index}</span>
              <div><strong>{formatDate(sample.at,{hour:"numeric",minute:"2-digit"})}</strong><p>{sample.source} · accuracy ±{Math.round(sample.accuracyMeters)} m</p></div>
              <Button type="button" size="sm" variant="ghost" icon={<MapPin size={14}/>} onClick={() => openExternal(googleMapsPointUrl(sample))}>Map</Button>
            </article>)}
          </div>}
        </Section>}
      </div>}
    </Modal>
    </>}
  </div>;
}
