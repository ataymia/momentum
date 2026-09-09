import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuditEvent } from "../lib/audit-engine";
import {
  DEFAULT_GEOFENCE_RADIUS_MILES,
  DEPARTURE_CONFIRM_SECONDS,
  MAX_VERIFICATION_ACCURACY_METERS,
  departureConfirmed,
  distanceMiles,
  geofenceDecision,
  roleIsTracked,
  shouldPersistRouteSample,
  type GeoPoint,
  type GeofenceProfile,
  type RouteSample,
} from "../lib/location-tracking-engine";
import { auditEventCreatesNotification, notificationCopy } from "../lib/notification-engine";

const profile: GeofenceProfile = {
  id: "geo-1",
  accountId: "acc-101",
  latitude: 33.4484,
  longitude: -112.074,
  radiusMiles: DEFAULT_GEOFENCE_RADIUS_MILES,
  configuredAt: "2026-09-08T12:00:00Z",
  configuredBy: "usr-manager",
  source: "Manual coordinates",
};

const point = (latitude: number, longitude: number, accuracyMeters = 20, at = "2026-09-08T13:00:00Z"): GeoPoint => ({ latitude, longitude, accuracyMeters, at });

test("sales-rep arrival is allowed only inside the fixed two-mile geofence", () => {
  assert.equal(DEFAULT_GEOFENCE_RADIUS_MILES, 2);
  const inside = geofenceDecision(profile, point(33.4684, -112.074));
  const outside = geofenceDecision(profile, point(33.4884, -112.074));
  assert.equal(inside.allowed, true);
  assert.equal(inside.within, true);
  assert.ok((inside.distanceMiles ?? 99) < 2);
  assert.equal(outside.allowed, false);
  assert.equal(outside.within, false);
  assert.ok((outside.distanceMiles ?? 0) > 2);
});

test("missing geofence and weak GPS accuracy both block arrival verification", () => {
  const location = point(profile.latitude, profile.longitude);
  const missing = geofenceDecision(undefined, location);
  assert.equal(missing.allowed, false);
  assert.equal(missing.reason, "Location lock not configured");

  const weak = geofenceDecision(profile, point(profile.latitude, profile.longitude, MAX_VERIFICATION_ACCURACY_METERS + 1));
  assert.equal(weak.allowed, false);
  assert.equal(weak.reason, "Location accuracy too low");
});

test("haversine distance is symmetric and zero at the same location", () => {
  const a = point(33.4484, -112.074);
  const b = point(33.4584, -112.064);
  assert.equal(distanceMiles(a, a), 0);
  assert.ok(Math.abs(distanceMiles(a, b) - distanceMiles(b, a)) < 0.000001);
});

test("passive route sampling retains meaningful time or distance changes without storing every GPS callback", () => {
  const previous: RouteSample = {
    ...point(33.4484, -112.074, 15, "2026-09-08T13:00:00Z"),
    id: "route-1",
    sessionId: "session-1",
    userId: "usr-rep",
    source: "Route",
  };
  assert.equal(shouldPersistRouteSample(previous, point(33.44841, -112.07401, 15, "2026-09-08T13:00:30Z")), false);
  assert.equal(shouldPersistRouteSample(previous, point(33.44841, -112.07401, 15, "2026-09-08T13:01:00Z")), true);
  assert.equal(shouldPersistRouteSample(previous, point(33.451, -112.074, 15, "2026-09-08T13:00:20Z")), true);
});

test("departure needs sustained outside-radius evidence instead of one GPS wobble", () => {
  assert.equal(DEPARTURE_CONFIRM_SECONDS, 30);
  assert.equal(departureConfirmed(undefined, "2026-09-08T13:00:40Z"), false);
  assert.equal(departureConfirmed("2026-09-08T13:00:00Z", "2026-09-08T13:00:29Z"), false);
  assert.equal(departureConfirmed("2026-09-08T13:00:00Z", "2026-09-08T13:00:30Z"), true);
});

test("continuous work-device tracking is scoped to sales representatives", () => {
  assert.equal(roleIsTracked("Sales Representative"), true);
  assert.equal(roleIsTracked("Sales Manager"), false);
  assert.equal(roleIsTracked("Administrator"), false);
  assert.equal(roleIsTracked("Operations"), false);
  assert.equal(roleIsTracked("Warehouse"), false);
  assert.equal(roleIsTracked("Customer"), false);
});

test("tracked field context requires an active clock and a location-verified closeout", () => {
  const source = readFileSync(new URL("../lib/location-tracking-context.tsx", import.meta.url), "utf8");
  assert.match(source, /roleIsTracked\(currentUser\.role\) && hasActiveClock/);
  assert.match(source, /Clock in before recording tracked field activity/);
  assert.match(source, /Location verification is required before a tracked sales appointment can close/);
  assert.match(source, /recordAppointmentEvent\(appointment, "Closeout recorded", "Closeout", point/);
  assert.doesNotMatch(source, /catch \{ point = undefined; \}/);
});

test("field tracking notifications interrupt managers only for a newly confirmed departure", () => {
  const base: AuditEvent = {
    id: "audit-field-1",
    at: "2026-09-08T13:00:00Z",
    actorId: "usr-rep",
    actorRole: "Sales Representative",
    action: "Created",
    module: "Field tracking",
    collection: "appointmentEvents",
    entityType: "Field tracking.appointmentEvents",
    entityId: "event-1",
    label: "event-1",
    summary: "event-1 created",
    sensitivity: "manager",
    relatedAccountId: "acc-101",
    relatedUserId: "usr-rep",
    changes: [],
  };
  assert.equal(auditEventCreatesNotification(base), false);
  const departure = { ...base, id: "audit-field-2", collection: "departureAlerts", entityType: "Field tracking.departureAlerts", entityId: "alert-1", label: "alert-1" };
  assert.equal(auditEventCreatesNotification(departure), true);
  assert.equal(notificationCopy(departure).tone, "warning");
  assert.equal(auditEventCreatesNotification({ ...departure, action: "Updated" }), false);
});
