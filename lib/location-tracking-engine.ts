import { arizonaDateKey } from "./date-time";
import type { Role } from "./types";

export const FIELD_TRACKING_STORAGE_KEY = "momentum-field-tracking-v1";
export const DEFAULT_GEOFENCE_RADIUS_MILES = 2;
export const MAX_VERIFICATION_ACCURACY_METERS = 500;
export const ROUTE_SAMPLE_MIN_SECONDS = 60;
export const ROUTE_SAMPLE_MIN_MILES = 0.1;
export const DEPARTURE_CONFIRM_SECONDS = 30;
export const MAX_ROUTE_SAMPLES = 10000;

export type TrackingPermission = "Idle" | "Requesting" | "Active" | "Denied" | "Unavailable" | "Stopped";
export type TrackingSessionEndReason = "Logout" | "Clock out" | "No active clock" | "Role not tracked" | "Permission denied" | "Browser unavailable" | "Manual stop";
export type LocationSampleSource = "Route" | "Dispatch" | "Route start" | "Arrival" | "Departure" | "Closeout" | "Geofence setup";
export type AppointmentLocationEventType = "Dispatched" | "Route started" | "Arrival verified" | "Departure detected" | "Closeout recorded" | "Offsite continuation";

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  at: string;
};

export type GeofenceProfile = {
  id: string;
  accountId: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  configuredAt: string;
  configuredBy: string;
  source: "Captured device location" | "Manual coordinates" | "Future geocoder";
};

export type TrackingSession = {
  id: string;
  userId: string;
  deviceId: string;
  startedAt: string;
  endedAt?: string;
  endReason?: TrackingSessionEndReason;
};

export type RouteSample = GeoPoint & {
  id: string;
  sessionId: string;
  userId: string;
  source: LocationSampleSource;
  appointmentId?: string;
  accountId?: string;
};

export type AppointmentLocationEvent = GeoPoint & {
  id: string;
  sessionId: string;
  userId: string;
  appointmentId: string;
  accountId: string;
  event: AppointmentLocationEventType;
  sampleId: string;
  distanceMiles?: number;
  withinGeofence?: boolean;
  radiusMiles?: number;
  exceptionId?: string;
};

export type OffsiteContinuationException = {
  id: string;
  appointmentId: string;
  accountId: string;
  userId: string;
  reason: string;
  createdAt: string;
  departureEventId: string;
};

export type DepartureAlert = {
  id: string;
  appointmentId: string;
  accountId: string;
  userId: string;
  triggeredAt: string;
  eventId: string;
  status: "Open" | "Closeout completed" | "Offsite continuation documented";
  resolvedAt?: string;
};

export type FieldTrackingState = {
  version: 1;
  geofences: GeofenceProfile[];
  sessions: TrackingSession[];
  samples: RouteSample[];
  appointmentEvents: AppointmentLocationEvent[];
  exceptions: OffsiteContinuationException[];
  departureAlerts: DepartureAlert[];
};

export type GeofenceDecision = {
  configured: boolean;
  accuracyOk: boolean;
  within: boolean;
  allowed: boolean;
  radiusMiles: number;
  distanceMiles?: number;
  reason: "Inside radius" | "Outside radius" | "Location accuracy too low" | "Location lock not configured";
};

export const createFieldTrackingSeed = (): FieldTrackingState => ({ version: 1, geofences: [], sessions: [], samples: [], appointmentEvents: [], exceptions: [], departureAlerts: [] });

export function normalizeFieldTrackingState(input: unknown): FieldTrackingState {
  if (!input || typeof input !== "object") return createFieldTrackingSeed();
  const state = input as Partial<FieldTrackingState>;
  return {
    version: 1,
    geofences: Array.isArray(state.geofences) ? state.geofences.filter((item) => validCoordinate(item.latitude, item.longitude) && item.radiusMiles > 0) : [],
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    samples: Array.isArray(state.samples) ? state.samples.filter((item) => validCoordinate(item.latitude, item.longitude)).slice(0, MAX_ROUTE_SAMPLES) : [],
    appointmentEvents: Array.isArray(state.appointmentEvents) ? state.appointmentEvents : [],
    exceptions: Array.isArray(state.exceptions) ? state.exceptions : [],
    departureAlerts: Array.isArray(state.departureAlerts) ? state.departureAlerts : [],
  };
}

export function roleIsTracked(role?: Role | null) {
  return role === "Sales Representative";
}

export function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function distanceMiles(a: Pick<GeoPoint, "latitude" | "longitude">, b: Pick<GeoPoint, "latitude" | "longitude">) {
  const earthRadiusMiles = 3958.7613;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geofenceDecision(profile: GeofenceProfile | undefined, point: GeoPoint): GeofenceDecision {
  if (!profile) return { configured: false, accuracyOk: false, within: false, allowed: false, radiusMiles: DEFAULT_GEOFENCE_RADIUS_MILES, reason: "Location lock not configured" };
  const distance = distanceMiles(profile, point);
  const accuracyOk = Number.isFinite(point.accuracyMeters) && point.accuracyMeters >= 0 && point.accuracyMeters <= MAX_VERIFICATION_ACCURACY_METERS;
  const within = distance <= profile.radiusMiles;
  if (!accuracyOk) return { configured: true, accuracyOk: false, within, allowed: false, radiusMiles: profile.radiusMiles, distanceMiles: distance, reason: "Location accuracy too low" };
  return { configured: true, accuracyOk: true, within, allowed: within, radiusMiles: profile.radiusMiles, distanceMiles: distance, reason: within ? "Inside radius" : "Outside radius" };
}

export function shouldPersistRouteSample(previous: RouteSample | undefined, next: GeoPoint) {
  if (!previous) return true;
  const seconds = Math.max(0, (new Date(next.at).getTime() - new Date(previous.at).getTime()) / 1000);
  if (seconds >= ROUTE_SAMPLE_MIN_SECONDS) return true;
  return distanceMiles(previous, next) >= ROUTE_SAMPLE_MIN_MILES;
}

export function departureConfirmed(firstOutsideAt: string | undefined, currentAt: string) {
  if (!firstOutsideAt) return false;
  return new Date(currentAt).getTime() - new Date(firstOutsideAt).getTime() >= DEPARTURE_CONFIRM_SECONDS * 1000;
}

export function latestUserSample(state: FieldTrackingState, userId: string, appointmentId?: string) {
  return state.samples
    .filter((sample) => sample.userId === userId && (!appointmentId || sample.appointmentId === appointmentId))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function activeTrackingSession(state: FieldTrackingState, userId: string) {
  return state.sessions.filter((session) => session.userId === userId && !session.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export function currentGeofence(state: FieldTrackingState, accountId: string) {
  return state.geofences.filter((profile) => profile.accountId === accountId).sort((a, b) => b.configuredAt.localeCompare(a.configuredAt))[0];
}

export function openDepartureAlert(state: FieldTrackingState, appointmentId: string) {
  return state.departureAlerts.find((alert) => alert.appointmentId === appointmentId && alert.status === "Open");
}

export function samplesForUserDay(state: FieldTrackingState, userId: string, dateKey: string) {
  return state.samples.filter((sample) => sample.userId === userId && arizonaDateKey(sample.at) === dateKey).sort((a, b) => a.at.localeCompare(b.at));
}
