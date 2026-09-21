/**
 * Territory management.
 *
 * A territory is a named geographic definition plus a set of assignment records. Nothing here knows any
 * employee, name, headcount, or role holder: eligibility is decided by role, employment status, the
 * reporting line, and the assignment records themselves, so the same code serves any future org chart.
 *
 * Territory answers exactly one question — "is this employee authorized to work this business location?"
 * It is deliberately separate from field geofencing, which answers whether a signed-in device is
 * physically close enough to an appointment. The two may read the same stored coordinates; they share no
 * permission, no decision, and no audit event.
 *
 * Changing a territory assignment never rewrites account ownership, sales credit, orders, compensation,
 * completed appointments, or field activity. Those records reference a territory; they are not derived
 * from one.
 */

import { addressFingerprint, distanceMiles, distanceToPolygonMiles, hasCoordinates, pointInPolygon, type GeocodeAddress, type LocationGeocode } from "./geocoding";
import type { Role, WorkspaceUser } from "./types";

export const TERRITORY_STORAGE_KEY = "momentum-territory-v2";

// --- configuration ---------------------------------------------------------------------------------

export type TerritoryEnforcementMode =
  /** Record the deviation and let the work continue. */
  | "Advisory"
  /** Refuse until an approved exception exists, but let the employee request one. */
  | "RequireException"
  /** Refuse outright. Only an Administrator or manager can act. */
  | "Block";

export type UnassignedAreaPolicy = "Open" | "RequireException" | "Block";

export type TerritorySettings = {
  version: 1;
  /**
   * Organization-wide boundary buffer, in miles. Deliberately configuration: no distance is hard-coded
   * anywhere in this engine, and a territory may override it.
   */
  defaultBufferMiles: number;
  enforcement: TerritoryEnforcementMode;
  /** Roles that may hold a territory assignment. Driven by role, never by a person. */
  eligibleRoles: Role[];
  /** Roles that may work any location regardless of territory (management oversight). */
  unrestrictedRoles: Role[];
  /** A manager may work locations inside the territories of the employees they supervise. */
  managerInheritsSupervisedTerritories: boolean;
  /** What happens where no active territory covers the location. */
  unassignedAreaPolicy: UnassignedAreaPolicy;
  /** Locations flagged strategic are owned by management and sit outside normal territory ownership. */
  strategicAccountsBypassTerritory: boolean;
};

export const DEFAULT_TERRITORY_SETTINGS: TerritorySettings = {
  version: 1,
  defaultBufferMiles: 0,
  enforcement: "RequireException",
  eligibleRoles: ["Sales Representative"],
  unrestrictedRoles: ["Administrator", "Sales Manager"],
  managerInheritsSupervisedTerritories: true,
  unassignedAreaPolicy: "RequireException",
  strategicAccountsBypassTerritory: true,
};

// --- territory records -----------------------------------------------------------------------------

export type TerritoryStatusV2 = "Draft" | "Active" | "Suspended" | "Retired";

export type GeoPoint = { latitude: number; longitude: number };

/**
 * How a territory's geography is described.
 *
 * ZIP works today with no external dependency. Cities, radius, and polygon are all evaluated by the same
 * engine and start working the moment locations carry coordinates, so adding geocoding is configuration
 * rather than a redesign.
 */
export type TerritoryDefinition =
  | { kind: "postalCodes"; postalCodes: string[] }
  | { kind: "cities"; cities: string[]; state?: string }
  | { kind: "radius"; center: GeoPoint; radiusMiles: number }
  | { kind: "polygon"; points: GeoPoint[] };

export type TerritoryAssignmentRole =
  /** The employee who normally works the territory. */
  | "Primary"
  /** A permanent second holder, for split or overlapping coverage. */
  | "Shared"
  /** Temporary cover, typically with an end date. */
  | "Coverage";

export type TerritoryAssignment = {
  id: string;
  territoryId: string;
  userId: string;
  role: TerritoryAssignmentRole;
  effectiveDate: string;
  /** Absent means open-ended. Temporary coverage expires on its own. */
  endDate?: string;
  reason?: string;
  assignedBy: string;
  assignedAt: string;
  /** Set when an assignment is ended early; the record is kept for history. */
  endedBy?: string;
  endedAt?: string;
};

export type Territory = {
  id: string;
  name: string;
  code?: string;
  definition: TerritoryDefinition;
  /** Oversight for the territory. Independent of who is assigned to work it. */
  managerId?: string;
  status: TerritoryStatusV2;
  effectiveDate: string;
  /** Scheduled retirement or reassignment date. */
  expiresAt?: string;
  /** Overrides `TerritorySettings.defaultBufferMiles` for this territory only. */
  bufferMiles?: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

// --- exceptions ------------------------------------------------------------------------------------

export type TerritoryExceptionState = "Pending" | "Approved" | "Denied" | "Withdrawn" | "Expired";

export type TerritoryExceptionScope =
  /** One business location. */
  | "Location"
  /** Every location inside one territory. */
  | "Territory";

export type TerritoryException = {
  id: string;
  /** The employee being granted access. Also the per-user shard key. */
  userId: string;
  scope: TerritoryExceptionScope;
  /** Present for a location-scoped exception. */
  accountId?: string;
  /** The territory the location normally belongs to, captured when the request was filed. */
  normalTerritoryId?: string;
  /** The territory being requested for a territory-scoped exception. */
  requestedTerritoryId?: string;
  reason: string;
  effectiveStart: string;
  /** Absent means permanent. A dated exception expires without anybody having to revoke it. */
  effectiveEnd?: string;
  state: TerritoryExceptionState;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
};

// --- history ---------------------------------------------------------------------------------------

export type TerritoryChangeType =
  | "Territory created"
  | "Territory updated"
  | "Territory status changed"
  | "Assignment added"
  | "Assignment ended"
  | "Assignment reassigned"
  | "Exception requested"
  | "Exception decided"
  | "Exception expired"
  | "Settings updated";

export type TerritoryChangeEvent = {
  id: string;
  at: string;
  actorId: string;
  type: TerritoryChangeType;
  territoryId?: string;
  /** The employee the change concerns, when there is one. */
  subjectUserId?: string;
  accountId?: string;
  before?: string;
  after?: string;
  reason?: string;
};

export type TerritoryState = {
  version: 2;
  settings: TerritorySettings;
  territories: Territory[];
  assignments: TerritoryAssignment[];
  exceptions: TerritoryException[];
  history: TerritoryChangeEvent[];
};

export const createTerritorySeed = (): TerritoryState => ({
  version: 2,
  settings: { ...DEFAULT_TERRITORY_SETTINGS },
  territories: [],
  assignments: [],
  exceptions: [],
  history: [],
});

// --- normalization ---------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ZIP = /^\d{5}$/;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const instant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const date = (value: unknown) => typeof value === "string" && DATE.test(value);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const point = (value: unknown): value is GeoPoint => Boolean(value && typeof value === "object" && finite((value as GeoPoint).latitude) && finite((value as GeoPoint).longitude));

export const normalizePostalCode = (value: string | undefined | null) => (value ?? "").trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1] ?? "";
export const normalizePostalCodes = (values: string[]) => [...new Set(values.map(normalizePostalCode).filter(Boolean))].sort();
export const normalizeCity = (value: string | undefined | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const STATUSES = new Set<TerritoryStatusV2>(["Draft", "Active", "Suspended", "Retired"]);
const ASSIGNMENT_ROLES = new Set<TerritoryAssignmentRole>(["Primary", "Shared", "Coverage"]);
const EXCEPTION_STATES = new Set<TerritoryExceptionState>(["Pending", "Approved", "Denied", "Withdrawn", "Expired"]);
const ENFORCEMENT = new Set<TerritoryEnforcementMode>(["Advisory", "RequireException", "Block"]);
const UNASSIGNED = new Set<UnassignedAreaPolicy>(["Open", "RequireException", "Block"]);
const ROLES = new Set<Role>(["Administrator", "Sales Manager", "Sales Representative", "Brand Ambassador", "Operations", "Warehouse", "Customer"]);

function normalizeDefinition(input: unknown): TerritoryDefinition | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { kind?: string; postalCodes?: unknown; cities?: unknown; state?: unknown; center?: unknown; radiusMiles?: unknown; points?: unknown };
  if (raw.kind === "postalCodes") {
    const postalCodes = normalizePostalCodes(Array.isArray(raw.postalCodes) ? raw.postalCodes.filter((item): item is string => typeof item === "string") : []);
    return postalCodes.length ? { kind: "postalCodes", postalCodes } : null;
  }
  if (raw.kind === "cities") {
    const cities = [...new Set((Array.isArray(raw.cities) ? raw.cities : []).filter((item): item is string => typeof item === "string").map(normalizeCity).filter(Boolean))].sort();
    return cities.length ? { kind: "cities", cities, state: text(raw.state).toUpperCase() || undefined } : null;
  }
  if (raw.kind === "radius") {
    if (!point(raw.center) || !finite(raw.radiusMiles) || (raw.radiusMiles as number) <= 0) return null;
    return { kind: "radius", center: { latitude: raw.center.latitude, longitude: raw.center.longitude }, radiusMiles: raw.radiusMiles as number };
  }
  if (raw.kind === "polygon") {
    const points = (Array.isArray(raw.points) ? raw.points : []).filter(point).map((item) => ({ latitude: item.latitude, longitude: item.longitude }));
    return points.length >= 3 ? { kind: "polygon", points } : null;
  }
  return null;
}

export function normalizeTerritorySettings(input: unknown): TerritorySettings {
  const raw = (input ?? {}) as Partial<TerritorySettings>;
  const roles = (values: unknown, fallback: Role[]) => {
    const list = Array.isArray(values) ? [...new Set(values.filter((item): item is Role => typeof item === "string" && ROLES.has(item as Role)))] : [];
    return list.length ? list : fallback;
  };
  return {
    version: 1,
    defaultBufferMiles: finite(raw.defaultBufferMiles) && raw.defaultBufferMiles! >= 0 ? raw.defaultBufferMiles! : DEFAULT_TERRITORY_SETTINGS.defaultBufferMiles,
    enforcement: ENFORCEMENT.has(raw.enforcement as TerritoryEnforcementMode) ? raw.enforcement! : DEFAULT_TERRITORY_SETTINGS.enforcement,
    eligibleRoles: roles(raw.eligibleRoles, DEFAULT_TERRITORY_SETTINGS.eligibleRoles),
    unrestrictedRoles: roles(raw.unrestrictedRoles, DEFAULT_TERRITORY_SETTINGS.unrestrictedRoles),
    managerInheritsSupervisedTerritories: typeof raw.managerInheritsSupervisedTerritories === "boolean" ? raw.managerInheritsSupervisedTerritories : DEFAULT_TERRITORY_SETTINGS.managerInheritsSupervisedTerritories,
    unassignedAreaPolicy: UNASSIGNED.has(raw.unassignedAreaPolicy as UnassignedAreaPolicy) ? raw.unassignedAreaPolicy! : DEFAULT_TERRITORY_SETTINGS.unassignedAreaPolicy,
    strategicAccountsBypassTerritory: typeof raw.strategicAccountsBypassTerritory === "boolean" ? raw.strategicAccountsBypassTerritory : DEFAULT_TERRITORY_SETTINGS.strategicAccountsBypassTerritory,
  };
}

export function normalizeTerritoryState(input: unknown, users: WorkspaceUser[]): TerritoryState {
  const seed = createTerritorySeed();
  if (!input || typeof input !== "object") return seed;
  const raw = input as Partial<TerritoryState>;
  const actorIds = new Set(users.filter((user) => user.role !== "Customer").map((user) => user.id));
  const settings = normalizeTerritorySettings(raw.settings);

  const seenTerritories = new Set<string>();
  const territories = (Array.isArray(raw.territories) ? raw.territories : []).flatMap((item): Territory[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Territory;
    const id = text(value.id);
    const name = text(value.name);
    const definition = normalizeDefinition(value.definition);
    if (!id || seenTerritories.has(id) || !name || !definition || !STATUSES.has(value.status) || !date(value.effectiveDate)) return [];
    if (!actorIds.has(text(value.createdBy)) || !actorIds.has(text(value.updatedBy)) || !instant(value.createdAt) || !instant(value.updatedAt)) return [];
    if (value.expiresAt && !date(value.expiresAt)) return [];
    if (value.bufferMiles !== undefined && (!finite(value.bufferMiles) || value.bufferMiles < 0)) return [];
    seenTerritories.add(id);
    return [{
      id, name, code: text(value.code) || undefined, definition,
      managerId: actorIds.has(text(value.managerId)) ? text(value.managerId) : undefined,
      status: value.status, effectiveDate: value.effectiveDate, expiresAt: value.expiresAt,
      bufferMiles: value.bufferMiles, notes: text(value.notes) || undefined,
      createdAt: value.createdAt, createdBy: value.createdBy, updatedAt: value.updatedAt, updatedBy: value.updatedBy,
    }];
  });

  const territoryIds = new Set(territories.map((territory) => territory.id));
  const seenAssignments = new Set<string>();
  const assignments = (Array.isArray(raw.assignments) ? raw.assignments : []).flatMap((item): TerritoryAssignment[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as TerritoryAssignment;
    const id = text(value.id);
    if (!id || seenAssignments.has(id) || !territoryIds.has(text(value.territoryId)) || !actorIds.has(text(value.userId))) return [];
    if (!ASSIGNMENT_ROLES.has(value.role) || !date(value.effectiveDate) || !actorIds.has(text(value.assignedBy)) || !instant(value.assignedAt)) return [];
    if (value.endDate && !date(value.endDate)) return [];
    seenAssignments.add(id);
    return [{ ...value, id, reason: text(value.reason) || undefined }];
  });

  const seenExceptions = new Set<string>();
  const exceptions = (Array.isArray(raw.exceptions) ? raw.exceptions : []).flatMap((item): TerritoryException[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as TerritoryException;
    const id = text(value.id);
    if (!id || seenExceptions.has(id) || !actorIds.has(text(value.userId)) || !EXCEPTION_STATES.has(value.state)) return [];
    if (!["Location", "Territory"].includes(value.scope) || text(value.reason).length < 5) return [];
    if (!date(value.effectiveStart) || (value.effectiveEnd && !date(value.effectiveEnd))) return [];
    if (!actorIds.has(text(value.requestedBy)) || !instant(value.requestedAt)) return [];
    if (value.scope === "Territory" && !territoryIds.has(text(value.requestedTerritoryId))) return [];
    if (value.scope === "Location" && !text(value.accountId)) return [];
    seenExceptions.add(id);
    return [{ ...value, id, reason: text(value.reason) }];
  });

  const history = (Array.isArray(raw.history) ? raw.history : []).flatMap((item): TerritoryChangeEvent[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as TerritoryChangeEvent;
    if (!text(value.id) || !instant(value.at) || !actorIds.has(text(value.actorId)) || !text(value.type)) return [];
    return [value];
  });

  return { version: 2, settings, territories, assignments, exceptions, history };
}

// --- eligibility and lookup ------------------------------------------------------------------------

/** A location, in the shape the territory engine needs. Any record with an address can satisfy it. */
export type TerritoryLocation = GeocodeAddress & LocationGeocode & {
  id: string;
  /** Marks a strategic or national account that sits outside normal territory ownership. */
  strategic?: boolean;
};

export const territoryLocationAddress = (location: TerritoryLocation): GeocodeAddress => ({
  streetAddress: location.streetAddress, city: location.city, state: location.state, postalCode: location.postalCode, country: location.country,
});
export const territoryLocationFingerprint = (location: TerritoryLocation) => addressFingerprint(territoryLocationAddress(location));

/** Whether a role may hold a territory assignment at all. Never a person, always a role. */
export const roleIsTerritoryEligible = (settings: TerritorySettings, role: Role) => settings.eligibleRoles.includes(role);
/** Whether a role may work any location without a territory assignment. */
export const roleIsTerritoryUnrestricted = (settings: TerritorySettings, role: Role) => settings.unrestrictedRoles.includes(role);
/** Roles the engine governs at all. A Warehouse or Customer identity is simply out of scope. */
export const roleIsTerritoryGoverned = (settings: TerritorySettings, role: Role) => roleIsTerritoryEligible(settings, role) || roleIsTerritoryUnrestricted(settings, role);

const withinDates = (start: string, end: string | undefined, on: string) => start <= on && (!end || on <= end);

export function activeTerritories(state: TerritoryState, on: string): Territory[] {
  return state.territories.filter((territory) => territory.status === "Active" && withinDates(territory.effectiveDate, territory.expiresAt, on));
}

/** Assignments in force on a given day, after temporary coverage has lapsed. */
export function activeAssignments(state: TerritoryState, on: string): TerritoryAssignment[] {
  return state.assignments.filter((assignment) => !assignment.endedAt && withinDates(assignment.effectiveDate, assignment.endDate, on));
}

export const assignmentsForUser = (state: TerritoryState, userId: string, on: string) => activeAssignments(state, on).filter((assignment) => assignment.userId === userId);
export const assignmentsForTerritory = (state: TerritoryState, territoryId: string, on: string) => activeAssignments(state, on).filter((assignment) => assignment.territoryId === territoryId);

/** Exceptions in force on a given day. A dated exception lapses without anybody revoking it. */
export function activeExceptions(state: TerritoryState, on: string): TerritoryException[] {
  return state.exceptions.filter((exception) => exception.state === "Approved" && withinDates(exception.effectiveStart, exception.effectiveEnd, on));
}

/** Approved exceptions whose end date has passed. Callers move them to `Expired` and record the event. */
export function lapsedExceptions(state: TerritoryState, on: string): TerritoryException[] {
  return state.exceptions.filter((exception) => exception.state === "Approved" && exception.effectiveEnd !== undefined && exception.effectiveEnd < on);
}

// --- geographic matching ---------------------------------------------------------------------------

export type TerritoryMatch = {
  territory: Territory;
  /** True when the location is inside the definition rather than inside the buffer around it. */
  inside: boolean;
  /** Undefined when the location has no coordinates and the match came from ZIP or city. */
  distanceMiles?: number;
  /** The match was made from postal/city data because coordinates were unavailable. */
  degraded: boolean;
};

export const bufferForTerritory = (settings: TerritorySettings, territory: Territory) =>
  territory.bufferMiles !== undefined ? territory.bufferMiles : settings.defaultBufferMiles;

/**
 * How a location relates to one territory.
 *
 * Coordinate definitions need coordinates; without them the location cannot be matched and the caller is
 * told the decision was degraded rather than being handed a false negative.
 */
export function matchLocationToTerritory(territory: Territory, location: TerritoryLocation, settings: TerritorySettings): TerritoryMatch | null {
  const buffer = bufferForTerritory(settings, territory);
  const coordinates = hasCoordinates(location) ? { latitude: location.latitude, longitude: location.longitude } : null;

  if (territory.definition.kind === "postalCodes") {
    const zip = normalizePostalCode(location.postalCode);
    if (zip && territory.definition.postalCodes.includes(zip)) return { territory, inside: true, degraded: !coordinates };
    return null;
  }
  if (territory.definition.kind === "cities") {
    const city = normalizeCity(location.city);
    const state = (location.state ?? "").trim().toUpperCase();
    if (!city || !territory.definition.cities.includes(city)) return null;
    if (territory.definition.state && state && territory.definition.state !== state) return null;
    return { territory, inside: true, degraded: !coordinates };
  }
  if (!coordinates) return null;
  if (territory.definition.kind === "radius") {
    const distance = distanceMiles(coordinates, territory.definition.center);
    const inside = distance <= territory.definition.radiusMiles;
    if (inside || distance <= territory.definition.radiusMiles + buffer) return { territory, inside, distanceMiles: distance, degraded: false };
    return null;
  }
  const distance = distanceToPolygonMiles(coordinates, territory.definition.points);
  const inside = pointInPolygon(coordinates, territory.definition.points);
  if (inside || distance <= buffer) return { territory, inside, distanceMiles: distance, degraded: false };
  return null;
}

/** Every active territory the location falls inside, or within the configured buffer of. */
export function territoriesForLocation(state: TerritoryState, location: TerritoryLocation, on: string): TerritoryMatch[] {
  return activeTerritories(state, on)
    .map((territory) => matchLocationToTerritory(territory, location, state.settings))
    .filter((match): match is TerritoryMatch => match !== null)
    .sort((a, b) => Number(b.inside) - Number(a.inside) || (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
}

export const primaryTerritoryForLocation = (state: TerritoryState, location: TerritoryLocation, on: string) => territoriesForLocation(state, location, on)[0];

// --- authorization ---------------------------------------------------------------------------------

export type TerritoryOutcome =
  | "Authorized"
  | "AuthorizedByAssignment"
  | "AuthorizedByCoverage"
  | "AuthorizedByException"
  | "AuthorizedAsManager"
  | "AuthorizedUnrestrictedRole"
  | "AuthorizedStrategicAccount"
  | "AuthorizedUnassignedArea"
  | "RequiresException"
  | "Blocked"
  | "NotGoverned";

export type TerritoryDecision = {
  outcome: TerritoryOutcome;
  /** The work may proceed. */
  allowed: boolean;
  /** The employee may file an exception request to proceed. */
  canRequestException: boolean;
  territoryId?: string;
  territoryName?: string;
  /** Distance to the matched territory when coordinates were available. */
  distanceMiles?: number;
  bufferMiles: number;
  /** The location has no coordinates, so the verdict came from postal or city data only. */
  degraded: boolean;
  /** The location has an address that cannot be matched by any configured definition. */
  unresolvedLocation: boolean;
  reason: string;
};

export type TerritoryEvaluation = {
  state: TerritoryState;
  actor: Pick<WorkspaceUser, "id" | "role" | "managerId">;
  /** Employment must be active for a territory assignment to grant anything. */
  actorIsActive: boolean;
  location: TerritoryLocation;
  /** Users supervised by the actor, for manager oversight. Supplied by the caller's access model. */
  supervisedUserIds?: Set<string>;
  on: string;
};

const decision = (partial: Omit<TerritoryDecision, "allowed" | "canRequestException"> & { allowed: boolean; canRequestException?: boolean }): TerritoryDecision => ({
  canRequestException: false,
  ...partial,
});

/**
 * The single authorization question: may this employee work this business location today?
 *
 * Everything is derived from role, employment status, the reporting line, and assignment records, so no
 * part of this depends on who currently holds a role.
 */
export function evaluateTerritoryAccess(input: TerritoryEvaluation): TerritoryDecision {
  const { state, actor, location, on } = input;
  const settings = state.settings;
  const base = { bufferMiles: settings.defaultBufferMiles, degraded: false, unresolvedLocation: false };

  if (!roleIsTerritoryGoverned(settings, actor.role)) {
    return decision({ ...base, outcome: "NotGoverned", allowed: true, reason: `${actor.role} is not governed by sales territories.` });
  }
  if (!input.actorIsActive) {
    return decision({ ...base, outcome: "Blocked", allowed: false, reason: "Territory access requires active employment." });
  }
  if (roleIsTerritoryUnrestricted(settings, actor.role)) {
    return decision({ ...base, outcome: "AuthorizedUnrestrictedRole", allowed: true, reason: `${actor.role} may work any location.` });
  }
  if (settings.strategicAccountsBypassTerritory && location.strategic) {
    return decision({ ...base, outcome: "AuthorizedStrategicAccount", allowed: true, reason: "Strategic accounts sit outside normal territory ownership." });
  }

  const matches = territoriesForLocation(state, location, on);
  const held = new Set(assignmentsForUser(state, actor.id, on).map((assignment) => assignment.territoryId));
  const coverageOnly = new Set(assignmentsForUser(state, actor.id, on).filter((assignment) => assignment.role === "Coverage").map((assignment) => assignment.territoryId));

  const exceptions = activeExceptions(state, on).filter((exception) => exception.userId === actor.id);
  const locationException = exceptions.find((exception) => exception.scope === "Location" && exception.accountId === location.id);
  if (locationException) {
    return decision({ ...base, outcome: "AuthorizedByException", allowed: true, territoryId: locationException.normalTerritoryId, reason: "An approved territory exception covers this location." });
  }

  if (matches.length === 0) {
    const geocodable = Boolean(normalizePostalCode(location.postalCode) || normalizeCity(location.city) || hasCoordinates(location));
    const unresolved = !geocodable;
    const policy = settings.unassignedAreaPolicy;
    if (policy === "Open") return decision({ ...base, unresolvedLocation: unresolved, outcome: "AuthorizedUnassignedArea", allowed: true, reason: "No active territory covers this location; unassigned areas are open." });
    return decision({
      ...base, unresolvedLocation: unresolved,
      outcome: policy === "Block" ? "Blocked" : "RequiresException",
      allowed: false,
      canRequestException: policy === "RequireException",
      reason: unresolved
        ? "This location has no usable address, so Momentum cannot determine its territory."
        : "No active territory covers this location.",
    });
  }

  const match = matches.find((item) => held.has(item.territory.id)) ?? matches[0];
  const buffer = bufferForTerritory(settings, match.territory);
  const shared = { bufferMiles: buffer, degraded: match.degraded, unresolvedLocation: false, territoryId: match.territory.id, territoryName: match.territory.name, distanceMiles: match.distanceMiles };

  if (held.has(match.territory.id)) {
    const viaCoverage = coverageOnly.has(match.territory.id);
    return decision({
      ...shared,
      outcome: viaCoverage ? "AuthorizedByCoverage" : "AuthorizedByAssignment",
      allowed: true,
      reason: viaCoverage ? `Temporary coverage of ${match.territory.name}.` : `Assigned to ${match.territory.name}.`,
    });
  }

  const territoryException = exceptions.find((exception) => exception.scope === "Territory" && exception.requestedTerritoryId === match.territory.id);
  if (territoryException) {
    return decision({ ...shared, outcome: "AuthorizedByException", allowed: true, reason: `An approved exception covers ${match.territory.name}.` });
  }

  if (settings.managerInheritsSupervisedTerritories && input.supervisedUserIds?.size) {
    const holders = assignmentsForTerritory(state, match.territory.id, on).map((assignment) => assignment.userId);
    const supervises = holders.some((userId) => input.supervisedUserIds!.has(userId)) || (match.territory.managerId === actor.id);
    if (supervises) return decision({ ...shared, outcome: "AuthorizedAsManager", allowed: true, reason: `Oversight of ${match.territory.name}.` });
  }

  const blocked = settings.enforcement === "Block";
  if (settings.enforcement === "Advisory") {
    return decision({ ...shared, outcome: "Authorized", allowed: true, reason: `${match.territory.name} is assigned to another representative. Recorded as a deviation.` });
  }
  return decision({
    ...shared,
    outcome: blocked ? "Blocked" : "RequiresException",
    allowed: false,
    canRequestException: !blocked,
    reason: `This account is outside your assigned territory. ${match.territory.name} belongs to another representative.`,
  });
}

/** Convenience wrapper for call sites that only need a yes/no. */
export const isTerritoryAuthorized = (input: TerritoryEvaluation) => evaluateTerritoryAccess(input).allowed;

// --- mutation helpers ------------------------------------------------------------------------------

export type TerritoryDraft = {
  id?: string;
  name: string;
  code?: string;
  definition: TerritoryDefinition;
  managerId?: string;
  status: TerritoryStatusV2;
  effectiveDate: string;
  expiresAt?: string;
  bufferMiles?: number;
  notes?: string;
};

export type TerritoryValidation = { ok: true } | { ok: false; message: string };

/**
 * Validates a territory before it is saved.
 *
 * Overlap is refused only between active postal-code territories, because that is the one definition kind
 * where two territories claiming the same ZIP makes ownership genuinely ambiguous.
 */
export function validateTerritory(state: TerritoryState, draft: TerritoryDraft, users: WorkspaceUser[]): TerritoryValidation {
  if (draft.name.trim().length < 2) return { ok: false, message: "Territory name is required." };
  if (!DATE.test(draft.effectiveDate)) return { ok: false, message: "Choose a valid effective date." };
  if (draft.expiresAt && (!DATE.test(draft.expiresAt) || draft.expiresAt <= draft.effectiveDate)) return { ok: false, message: "The expiration date must be after the effective date." };
  if (draft.bufferMiles !== undefined && (!Number.isFinite(draft.bufferMiles) || draft.bufferMiles < 0)) return { ok: false, message: "The boundary buffer must be zero or more miles." };
  if (draft.managerId && !users.some((user) => user.id === draft.managerId && user.role !== "Customer")) return { ok: false, message: "Choose a valid territory manager." };

  const definition = normalizeDefinition(draft.definition);
  if (!definition) return { ok: false, message: "Define the territory by ZIP codes, cities, a radius, or a map boundary." };
  if (definition.kind === "postalCodes") {
    const invalid = draft.definition.kind === "postalCodes" ? draft.definition.postalCodes.find((value) => value.trim() && !ZIP.test(normalizePostalCode(value))) : undefined;
    if (invalid) return { ok: false, message: `Invalid ZIP code: ${invalid}.` };
    if (draft.status === "Active") {
      for (const territory of state.territories) {
        if (territory.id === draft.id || territory.status !== "Active" || territory.definition.kind !== "postalCodes") continue;
        const clash = definition.postalCodes.find((zip) => territory.definition.kind === "postalCodes" && territory.definition.postalCodes.includes(zip));
        if (clash) return { ok: false, message: `ZIP ${clash} is already covered by ${territory.name}. Keep one active territory per ZIP so ownership stays unambiguous.` };
      }
    }
  }
  return { ok: true };
}

export function validateAssignment(state: TerritoryState, users: WorkspaceUser[], input: { territoryId: string; userId: string; role: TerritoryAssignmentRole; effectiveDate: string; endDate?: string }): TerritoryValidation {
  const territory = state.territories.find((item) => item.id === input.territoryId);
  if (!territory) return { ok: false, message: "Choose a territory." };
  if (territory.status === "Retired") return { ok: false, message: "A retired territory cannot take new assignments." };
  const user = users.find((item) => item.id === input.userId);
  if (!user) return { ok: false, message: "Choose an employee." };
  if (!roleIsTerritoryEligible(state.settings, user.role)) return { ok: false, message: `${user.role} is not eligible to hold a territory assignment.` };
  if (!DATE.test(input.effectiveDate)) return { ok: false, message: "Choose a valid effective date." };
  if (input.endDate && (!DATE.test(input.endDate) || input.endDate < input.effectiveDate)) return { ok: false, message: "The end date must be on or after the effective date." };
  if (input.role === "Coverage" && !input.endDate) return { ok: false, message: "Temporary coverage needs an end date so it expires on its own." };
  const overlapping = state.assignments.some((assignment) =>
    !assignment.endedAt && assignment.territoryId === input.territoryId && assignment.userId === input.userId
    && withinDates(assignment.effectiveDate, assignment.endDate, input.effectiveDate));
  if (overlapping) return { ok: false, message: "That employee already holds an active assignment to this territory." };
  return { ok: true };
}

export function validateExceptionRequest(state: TerritoryState, input: { userId: string; scope: TerritoryExceptionScope; accountId?: string; requestedTerritoryId?: string; reason: string; effectiveStart: string; effectiveEnd?: string }): TerritoryValidation {
  if (input.reason.trim().length < 5) return { ok: false, message: "Explain why the work needs to happen outside the assigned territory." };
  if (!DATE.test(input.effectiveStart)) return { ok: false, message: "Choose a valid start date." };
  if (input.effectiveEnd && (!DATE.test(input.effectiveEnd) || input.effectiveEnd < input.effectiveStart)) return { ok: false, message: "The end date must be on or after the start date." };
  if (input.scope === "Location" && !input.accountId) return { ok: false, message: "Choose the business location the exception applies to." };
  if (input.scope === "Territory" && !state.territories.some((territory) => territory.id === input.requestedTerritoryId)) return { ok: false, message: "Choose the territory the exception applies to." };
  const duplicate = state.exceptions.some((exception) =>
    exception.userId === input.userId && exception.scope === input.scope
    && (input.scope === "Location" ? exception.accountId === input.accountId : exception.requestedTerritoryId === input.requestedTerritoryId)
    && ["Pending", "Approved"].includes(exception.state));
  if (duplicate) return { ok: false, message: "An open or approved exception already exists for this request." };
  return { ok: true };
}

/** Nobody decides their own exception, whatever their role. */
export function canDecideException(actor: Pick<WorkspaceUser, "id" | "role">, exception: TerritoryException, supervisedUserIds?: Set<string>): boolean {
  if (actor.id === exception.userId || actor.id === exception.requestedBy) return false;
  if (actor.role === "Administrator") return true;
  if (actor.role !== "Sales Manager") return false;
  return Boolean(supervisedUserIds?.has(exception.userId));
}

/** Territories an employee may see: their own, those they manage, and those held by their reports. */
export function visibleTerritories(state: TerritoryState, actor: Pick<WorkspaceUser, "id" | "role">, supervisedUserIds: Set<string>, on: string): Territory[] {
  if (actor.role === "Administrator") return state.territories;
  const held = new Set(assignmentsForUser(state, actor.id, on).map((assignment) => assignment.territoryId));
  return state.territories.filter((territory) => {
    if (held.has(territory.id)) return true;
    if (territory.managerId === actor.id) return true;
    if (actor.role !== "Sales Manager") return false;
    return assignmentsForTerritory(state, territory.id, on).some((assignment) => supervisedUserIds.has(assignment.userId));
  });
}
