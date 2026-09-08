"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GEOFENCE_RADIUS_MILES,
  FIELD_TRACKING_STORAGE_KEY,
  MAX_ROUTE_SAMPLES,
  MAX_VERIFICATION_ACCURACY_METERS,
  AppointmentLocationEvent,
  AppointmentLocationEventType,
  FieldTrackingState,
  GeoPoint,
  GeofenceDecision,
  GeofenceProfile,
  LocationSampleSource,
  OffsiteContinuationException,
  RouteSample,
  TrackingPermission,
  TrackingSession,
  TrackingSessionEndReason,
  activeTrackingSession,
  createFieldTrackingSeed,
  currentGeofence,
  departureConfirmed,
  geofenceDecision,
  latestUserSample,
  normalizeFieldTrackingState,
  openDepartureAlert,
  roleIsTracked,
  samplesForUserDay,
  shouldPersistRouteSample,
  validCoordinate,
} from "./location-tracking-engine";
import type { Appointment } from "./types";
import { useWorkspace } from "./workspace-context";

const DEVICE_KEY = "momentum-managed-device-id-v1";
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const FRESH_EVENT_SAMPLE_MS = 20_000;

type Workspace = ReturnType<typeof useWorkspace>;
type AppointmentCloseout = Parameters<Workspace["completeAppointment"]>[1];
type ActionResult = { ok: boolean; message?: string; decision?: GeofenceDecision };

type FieldTrackingContextValue = {
  state: FieldTrackingState;
  permission: TrackingPermission;
  currentSample?: RouteSample;
  currentSession?: TrackingSession;
  currentUserTrackingActive: boolean;
  transitionAppointment: (appointmentId: string) => Promise<ActionResult>;
  completeTrackedAppointment: (appointmentId: string, closeout: AppointmentCloseout) => Promise<ActionResult>;
  captureGeofence: (accountId: string) => Promise<ActionResult>;
  configureGeofence: (accountId: string, latitude: number, longitude: number) => ActionResult;
  geofenceForAccount: (accountId: string) => GeofenceProfile | undefined;
  decisionForAppointment: (appointment: Appointment) => GeofenceDecision | undefined;
  openAlertForAppointment: (appointmentId: string) => ReturnType<typeof openDepartureAlert>;
  documentOffsiteContinuation: (appointmentId: string, reason: string) => ActionResult;
  routeSamplesForUserDay: (userId: string, dateKey: string) => RouteSample[];
  eventsForAppointment: (appointmentId: string) => AppointmentLocationEvent[];
  latestSampleForUser: (userId: string) => RouteSample | undefined;
  canViewUserTracking: (userId: string) => boolean;
  resetTracking: () => boolean;
};

const FieldTrackingContext = createContext<FieldTrackingContextValue | null>(null);

function readState() {
  if (typeof window === "undefined") return createFieldTrackingSeed();
  try { return normalizeFieldTrackingState(JSON.parse(window.localStorage.getItem(FIELD_TRACKING_STORAGE_KEY) ?? "null")); }
  catch { return createFieldTrackingSeed(); }
}

function managedDeviceId() {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  window.localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function pointFromPosition(position: GeolocationPosition): GeoPoint {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, at: new Date(position.timestamp || Date.now()).toISOString() };
}

function requestBrowserPoint(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { reject(new Error("Location services are not available in this browser.")); return; }
    navigator.geolocation.getCurrentPosition((position) => resolve(pointFromPosition(position)), (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? "Location permission is required for field work." : "Could not verify the device location. Try again.")), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 });
  });
}

export function FieldTrackingProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const { data, currentUser, ready, advanceAppointment, completeAppointment } = workspace;
  const [state, setState] = useState<FieldTrackingState>(() => readState());
  const [permission, setPermission] = useState<TrackingPermission>("Idle");
  const stateRef = useRef(state);
  const outsideSinceRef = useRef<Record<string, string>>({});
  const watchRef = useRef<number | null>(null);
  const previousUserRef = useRef<string | null>(null);

  useEffect(() => { stateRef.current = state; if (typeof window !== "undefined") window.localStorage.setItem(FIELD_TRACKING_STORAGE_KEY, JSON.stringify(state)); }, [state]);

  const todayEntries = useMemo(() => currentUser ? data.timeEntries.filter((entry) => entry.userId === currentUser.id && entry.date === today()) : [], [currentUser, data.timeEntries]);
  const hasActiveClock = todayEntries.some((entry) => !entry.clockOut);
  const clockedOutToday = todayEntries.some((entry) => Boolean(entry.clockOut)) && !hasActiveClock;
  const shouldTrack = Boolean(ready && currentUser && roleIsTracked(currentUser.role) && !clockedOutToday);
  const currentSession = currentUser ? activeTrackingSession(state, currentUser.id) : undefined;
  const currentSample = currentUser ? latestUserSample(state, currentUser.id) : undefined;

  const closeActiveSessions = (userId: string, reason: TrackingSessionEndReason) => {
    const at = now();
    setState((current) => ({ ...current, sessions: current.sessions.map((session) => session.userId === userId && !session.endedAt ? { ...session, endedAt: at, endReason: reason } : session) }));
  };

  const ensureSession = (userId: string) => {
    const existing = activeTrackingSession(stateRef.current, userId);
    if (existing) return existing.id;
    const session: TrackingSession = { id: uid("track-session"), userId, deviceId: managedDeviceId(), startedAt: now() };
    setState((current) => ({ ...current, sessions: [session, ...current.sessions] }));
    stateRef.current = { ...stateRef.current, sessions: [session, ...stateRef.current.sessions] };
    return session.id;
  };

  const visibleUserIds = useMemo(() => {
    if (!currentUser) return new Set<string>();
    if (currentUser.role === "Administrator") return new Set(data.users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
    if (currentUser.role === "Sales Manager") return new Set(data.users.filter((user) => user.role === "Sales Representative" && (user.managerId === currentUser.id || (currentUser.managedTeams ?? []).includes(user.team))).map((user) => user.id));
    if (currentUser.role === "Sales Representative") return new Set([currentUser.id]);
    return new Set<string>();
  }, [currentUser, data.users]);

  const canViewUserTracking = (userId: string) => visibleUserIds.has(userId);

  const appendRouteSample = (userId: string, point: GeoPoint, source: LocationSampleSource, appointment?: Appointment, force = false) => {
    const sessionId = ensureSession(userId);
    const previous = latestUserSample(stateRef.current, userId);
    if (!force && !shouldPersistRouteSample(previous, point)) return previous;
    const sample: RouteSample = { ...point, id: uid("route"), sessionId, userId, source, appointmentId: appointment?.id, accountId: appointment?.accountId };
    setState((current) => ({ ...current, samples: [sample, ...current.samples].slice(0, MAX_ROUTE_SAMPLES) }));
    stateRef.current = { ...stateRef.current, samples: [sample, ...stateRef.current.samples].slice(0, MAX_ROUTE_SAMPLES) };
    return sample;
  };

  const recordAppointmentEvent = (appointment: Appointment, event: AppointmentLocationEventType, source: LocationSampleSource, point: GeoPoint, decision?: GeofenceDecision, exceptionId?: string) => {
    if (!currentUser) return undefined;
    const sample = appendRouteSample(currentUser.id, point, source, appointment, true);
    if (!sample) return undefined;
    const record: AppointmentLocationEvent = { ...point, id: uid("location-event"), sessionId: sample.sessionId, userId: currentUser.id, appointmentId: appointment.id, accountId: appointment.accountId, event, sampleId: sample.id, distanceMiles: decision?.distanceMiles, withinGeofence: decision?.within, radiusMiles: decision?.radiusMiles, exceptionId };
    setState((current) => ({ ...current, appointmentEvents: [record, ...current.appointmentEvents] }));
    stateRef.current = { ...stateRef.current, appointmentEvents: [record, ...stateRef.current.appointmentEvents] };
    return record;
  };

  const getEventPoint = async () => {
    if (!currentUser) throw new Error("Sign in before recording field activity.");
    const latest = latestUserSample(stateRef.current, currentUser.id);
    if (latest && Date.now() - new Date(latest.at).getTime() <= FRESH_EVENT_SAMPLE_MS) return { latitude: latest.latitude, longitude: latest.longitude, accuracyMeters: latest.accuracyMeters, at: latest.at };
    setPermission("Requesting");
    try { const point = await requestBrowserPoint(); setPermission("Active"); return point; }
    catch (error) { setPermission(error instanceof Error && error.message.includes("permission") ? "Denied" : "Unavailable"); throw error; }
  };

  useEffect(() => {
    if (!ready) return;
    const previous = previousUserRef.current;
    const next = currentUser?.id ?? null;
    if (previous && previous !== next) closeActiveSessions(previous, "Logout");
    previousUserRef.current = next;
  }, [currentUser?.id, ready]);

  useEffect(() => {
    if (!ready || !currentUser) return;
    if (clockedOutToday) { closeActiveSessions(currentUser.id, "Clock out"); setPermission("Stopped"); return; }
    if (!roleIsTracked(currentUser.role)) { closeActiveSessions(currentUser.id, "Role not tracked"); setPermission("Stopped"); return; }
    if (shouldTrack) ensureSession(currentUser.id);
  }, [clockedOutToday, currentUser, ready, shouldTrack]);

  useEffect(() => {
    if (!shouldTrack || !currentUser) {
      if (watchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) { setPermission("Unavailable"); closeActiveSessions(currentUser.id, "Browser unavailable"); return; }
    setPermission("Requesting");
    const userId = currentUser.id;
    watchRef.current = navigator.geolocation.watchPosition((position) => {
      setPermission("Active");
      const point = pointFromPosition(position);
      appendRouteSample(userId, point, "Route");
      const snapshot = stateRef.current;
      for (const appointment of data.appointments.filter((item) => item.ownerId === userId && item.status === "Arrived")) {
        if (snapshot.exceptions.some((exception) => exception.appointmentId === appointment.id) || openDepartureAlert(snapshot, appointment.id)) continue;
        const profile = currentGeofence(snapshot, appointment.accountId);
        const decision = geofenceDecision(profile, point);
        if (!decision.configured || !decision.accuracyOk) continue;
        if (decision.within) { delete outsideSinceRef.current[appointment.id]; continue; }
        const firstOutside = outsideSinceRef.current[appointment.id];
        if (!firstOutside) { outsideSinceRef.current[appointment.id] = point.at; continue; }
        if (!departureConfirmed(firstOutside, point.at)) continue;
        const event = recordAppointmentEvent(appointment, "Departure detected", "Departure", point, decision);
        if (!event) continue;
        const alert = { id: uid("departure-alert"), appointmentId: appointment.id, accountId: appointment.accountId, userId, triggeredAt: point.at, eventId: event.id, status: "Open" as const };
        setState((current) => ({ ...current, departureAlerts: [alert, ...current.departureAlerts] }));
        stateRef.current = { ...stateRef.current, departureAlerts: [alert, ...stateRef.current.departureAlerts] };
        delete outsideSinceRef.current[appointment.id];
      }
    }, (error) => {
      if (error.code === error.PERMISSION_DENIED) { setPermission("Denied"); closeActiveSessions(userId, "Permission denied"); }
      else setPermission("Unavailable");
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    return () => { if (watchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; };
  }, [currentUser, data.appointments, shouldTrack]);

  const transitionAppointment = async (appointmentId: string): Promise<ActionResult> => {
    const appointment = data.appointments.find((item) => item.id === appointmentId);
    if (!currentUser || !appointment || appointment.ownerId !== currentUser.id || currentUser.role !== "Sales Representative") return { ok: false, message: "Only the assigned sales rep can record field status from the tracked device." };
    if (!["Scheduled", "Dispatched", "En route"].includes(appointment.status)) return { ok: false, message: "This appointment is not ready for another field status." };
    let point: GeoPoint;
    try { point = await getEventPoint(); }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Location is required for this field action." }; }

    if (appointment.status === "En route") {
      const profile = currentGeofence(stateRef.current, appointment.accountId);
      const decision = geofenceDecision(profile, point);
      if (!decision.allowed) {
        const distance = decision.distanceMiles === undefined ? "" : ` Current distance: ${decision.distanceMiles.toFixed(2)} mi.`;
        return { ok: false, message: decision.reason === "Location lock not configured" ? "This customer location does not have a location lock yet. A manager must configure it before arrival can be verified." : decision.reason === "Location accuracy too low" ? `The GPS fix is not accurate enough to verify arrival. Accuracy must be within ${MAX_VERIFICATION_ACCURACY_METERS} meters.` : `Arrival is locked outside the ${decision.radiusMiles}-mile radius.${distance}`, decision };
      }
      advanceAppointment(appointment.id);
      recordAppointmentEvent(appointment, "Arrival verified", "Arrival", point, decision);
      return { ok: true, decision };
    }

    advanceAppointment(appointment.id);
    recordAppointmentEvent(appointment, appointment.status === "Scheduled" ? "Dispatched" : "Route started", appointment.status === "Scheduled" ? "Dispatch" : "Route start", point);
    return { ok: true };
  };

  const completeTrackedAppointment = async (appointmentId: string, closeout: AppointmentCloseout): Promise<ActionResult> => {
    const appointment = data.appointments.find((item) => item.id === appointmentId);
    if (!currentUser || !appointment || appointment.ownerId !== currentUser.id) return { ok: false, message: "Only the assigned field rep can submit this closeout." };
    let point: GeoPoint | undefined;
    try { point = await getEventPoint(); } catch { point = undefined; }
    const ok = completeAppointment(appointment.id, closeout);
    if (!ok) return { ok: false, message: "Outcome, note, next action, and next-action date are required before this appointment can close." };
    if (point) {
      const decision = geofenceDecision(currentGeofence(stateRef.current, appointment.accountId), point);
      recordAppointmentEvent(appointment, "Closeout recorded", "Closeout", point, decision.configured ? decision : undefined);
    }
    const resolvedAt = now();
    setState((current) => ({ ...current, departureAlerts: current.departureAlerts.map((alert) => alert.appointmentId === appointment.id && alert.status === "Open" ? { ...alert, status: "Closeout completed", resolvedAt } : alert) }));
    return { ok: true };
  };

  const captureGeofence = async (accountId: string): Promise<ActionResult> => {
    if (!currentUser || !["Administrator", "Sales Manager"].includes(currentUser.role)) return { ok: false, message: "Manager access is required to configure a location lock." };
    if (!data.accounts.some((account) => account.id === accountId)) return { ok: false, message: "Customer location not found." };
    let point: GeoPoint;
    try { point = await requestBrowserPoint(); }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not capture this location." }; }
    if (point.accuracyMeters > MAX_VERIFICATION_ACCURACY_METERS) return { ok: false, message: `GPS accuracy is ${Math.round(point.accuracyMeters)} m. Move to a clearer position and retry.` };
    const profile: GeofenceProfile = { id: uid("geofence"), accountId, latitude: point.latitude, longitude: point.longitude, radiusMiles: DEFAULT_GEOFENCE_RADIUS_MILES, configuredAt: now(), configuredBy: currentUser.id, source: "Captured device location" };
    setState((current) => ({ ...current, geofences: [profile, ...current.geofences] }));
    return { ok: true };
  };

  const configureGeofence = (accountId: string, latitude: number, longitude: number): ActionResult => {
    if (!currentUser || !["Administrator", "Sales Manager"].includes(currentUser.role)) return { ok: false, message: "Manager access is required to configure a location lock." };
    if (!data.accounts.some((account) => account.id === accountId) || !validCoordinate(latitude, longitude)) return { ok: false, message: "Enter valid latitude and longitude coordinates." };
    const profile: GeofenceProfile = { id: uid("geofence"), accountId, latitude, longitude, radiusMiles: DEFAULT_GEOFENCE_RADIUS_MILES, configuredAt: now(), configuredBy: currentUser.id, source: "Manual coordinates" };
    setState((current) => ({ ...current, geofences: [profile, ...current.geofences] }));
    return { ok: true };
  };

  const documentOffsiteContinuation = (appointmentId: string, reason: string): ActionResult => {
    const appointment = data.appointments.find((item) => item.id === appointmentId);
    const alert = openDepartureAlert(stateRef.current, appointmentId);
    if (!currentUser || !appointment || appointment.ownerId !== currentUser.id || !alert) return { ok: false, message: "No active departure exception is available for this appointment." };
    if (reason.trim().length < 8) return { ok: false, message: "Explain why the appointment is continuing outside the location radius." };
    const exception: OffsiteContinuationException = { id: uid("offsite-exception"), appointmentId, accountId: appointment.accountId, userId: currentUser.id, reason: reason.trim(), createdAt: now(), departureEventId: alert.eventId };
    const departureEvent = stateRef.current.appointmentEvents.find((event) => event.id === alert.eventId);
    if (departureEvent) recordAppointmentEvent(appointment, "Offsite continuation", "Departure", departureEvent, undefined, exception.id);
    const resolvedAt = now();
    setState((current) => ({ ...current, exceptions: [exception, ...current.exceptions], departureAlerts: current.departureAlerts.map((item) => item.id === alert.id ? { ...item, status: "Offsite continuation documented", resolvedAt } : item) }));
    return { ok: true };
  };

  const decisionForAppointment = (appointment: Appointment) => {
    if (!currentUser) return undefined;
    const sample = latestUserSample(state, appointment.ownerId ?? currentUser.id);
    if (!sample) return geofenceDecision(currentGeofence(state, appointment.accountId), { latitude: 0, longitude: 0, accuracyMeters: Number.POSITIVE_INFINITY, at: now() });
    return geofenceDecision(currentGeofence(state, appointment.accountId), sample);
  };

  const routeSamplesForUserDay = (userId: string, dateKey: string) => canViewUserTracking(userId) ? samplesForUserDay(state, userId, dateKey) : [];
  const eventsForAppointment = (appointmentId: string) => state.appointmentEvents.filter((event) => event.appointmentId === appointmentId && canViewUserTracking(event.userId)).sort((a, b) => b.at.localeCompare(a.at));
  const latestSampleForUser = (userId: string) => canViewUserTracking(userId) ? latestUserSample(state, userId) : undefined;
  const geofenceForAccount = (accountId: string) => currentGeofence(state, accountId);
  const openAlertForAppointment = (appointmentId: string) => openDepartureAlert(state, appointmentId);
  const resetTracking = () => { if (currentUser?.role !== "Administrator") return false; setState(createFieldTrackingSeed()); return true; };

  const value: FieldTrackingContextValue = { state, permission, currentSample, currentSession, currentUserTrackingActive: Boolean(currentSession && permission === "Active"), transitionAppointment, completeTrackedAppointment, captureGeofence, configureGeofence, geofenceForAccount, decisionForAppointment, openAlertForAppointment, documentOffsiteContinuation, routeSamplesForUserDay, eventsForAppointment, latestSampleForUser, canViewUserTracking, resetTracking };
  return <FieldTrackingContext.Provider value={value}>{children}</FieldTrackingContext.Provider>;
}

export function useFieldTracking() {
  const value = useContext(FieldTrackingContext);
  if (!value) throw new Error("useFieldTracking must be used inside FieldTrackingProvider");
  return value;
}
