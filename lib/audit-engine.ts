import { canManageUser } from "./access";
import type { WorkspaceData, WorkspaceUser } from "./types";

export const AUDIT_STORAGE_KEY = "momentum-audit-v1";
export type AuditSensitivity = "operational" | "manager" | "admin";
export type AuditChange = { field: string; before?: string; after?: string };
export type AuditEvent = { id: string; at: string; actorId: string; actorRole: string; action: "Created" | "Updated" | "Deleted"; module: string; collection: string; entityType: string; entityId: string; label: string; summary: string; sensitivity: AuditSensitivity; relatedAccountId?: string; relatedUserId?: string; changes: AuditChange[] };
export type AuditState = { version: 1; events: AuditEvent[] };
export type AuditSnapshot = { key: string; module: string; collection: string; entityType: string; entityId: string; label: string; sensitivity: AuditSensitivity; relatedAccountId?: string; relatedUserId?: string; payload: Record<string, unknown> };

export const createAuditSeed = (): AuditState => ({ version: 1, events: [] });

const text = (value: unknown) => typeof value === "string" ? value : undefined;
const validInstant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const auditActions = new Set<AuditEvent["action"]>(["Created", "Updated", "Deleted"]);
const display = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).slice(0, 180);
  try { return JSON.stringify(value).slice(0, 180); } catch { return "[unavailable]"; }
};

function sensitivityFor(module: string, collection: string): AuditSensitivity {
  if (["Payroll", "Accounting", "HCM", "Identity"].includes(module)) return "admin";
  if (["Finance", "Performance", "Period locks", "Field tracking", "Brand Ambassador"].includes(module) || ["approvals", "timecards"].includes(collection)) return "manager";
  if (module === "Commerce" && ["payments", "allocations", "credits", "refunds", "notes"].includes(collection)) return "manager";
  return "operational";
}

export function auditEventFingerprint(event: Pick<AuditEvent, "module" | "collection" | "entityId" | "action" | "actorId" | "at">) {
  return [event.module, event.collection, event.entityId, event.action, event.actorId, event.at].join("|");
}

const preciseInstant = (value: string | undefined) => Boolean(value && value.includes("T") && validInstant(value));

const legacyActorTimePairs = [
  ["decidedBy","decidedAt"],["approvedBy","approvedAt"],["fulfilledBy","fulfilledAt"],["reviewedBy","reviewedAt"],
  ["resolvedBy","resolvedAt"],["returnedBy","returnedAt"],["cancelledBy","cancelledAt"],["deletedBy","deletedAt"],
  ["approverId","approvedAt"],["updatedBy","updatedAt"],["changedBy","changedAt"],["assignedBy","assignedAt"],
  ["claimedBy","claimedAt"],["completedBy","completedAt"],["settledBy","settledAt"],["failedBy","failedAt"],
  ["reversedBy","reversedAt"],["sentBy","sentAt"],["appliedBy","appliedAt"],["recordedBy","recordedAt"],
  ["uploadedBy","uploadedAt"],["provisionedBy","provisionedAt"],["createdBy","createdAt"],["submittedBy","submittedAt"],
] as const;

const legacyCreationTimeFields = [
  "at","occurredAt","createdAt","submittedAt","receivedAt","acceptedAt","assignedAt","provisionedAt",
  "responsibilityStartedAt","clockInAt","startedAt","configuredAt","publishedAt","uploadedAt",
] as const;

function legacyChangeValue(changes: AuditChange[], field: string) {
  const value = changes.find((change) => change.field === field)?.after;
  return typeof value === "string" ? value : undefined;
}

function repairLegacyProvenance(event: Pick<AuditEvent,"at"|"actorId"|"actorRole"|"action">, changes: AuditChange[]) {
  for (const [actorField,timeField] of legacyActorTimePairs) {
    const actorId = legacyChangeValue(changes, actorField);
    const at = legacyChangeValue(changes, timeField);
    if (actorId && preciseInstant(at)) return { actorId, actorRole: actorId === event.actorId ? event.actorRole : "Recorded user", at: at! };
  }

  if (event.action === "Created") {
    const explicitActor =
      legacyChangeValue(changes, "actorId") ||
      legacyChangeValue(changes, "createdBy") ||
      legacyChangeValue(changes, "submittedBy") ||
      legacyChangeValue(changes, "requesterId") ||
      legacyChangeValue(changes, "userId") ||
      legacyChangeValue(changes, "provisionedBy") ||
      event.actorId;
    for (const field of legacyCreationTimeFields) {
      const at = legacyChangeValue(changes, field);
      if (preciseInstant(at)) return { actorId: explicitActor, actorRole: explicitActor === event.actorId ? event.actorRole : "Recorded user", at: at! };
    }
  }

  if (event.action === "Updated") {
    const changedTimes = changes
      .filter((change) => change.field.endsWith("At") && preciseInstant(change.after))
      .map((change) => change.after!)
      .sort()
      .reverse();
    if (changedTimes[0]) return { actorId: event.actorId, actorRole: event.actorRole, at: changedTimes[0] };
  }

  return { actorId: event.actorId, actorRole: event.actorRole, at: event.at };
}

export function normalizeAuditState(input: unknown): AuditState {
  if (!input || typeof input !== "object") return createAuditSeed();
  const state = input as Partial<AuditState>;
  const seenIds = new Set<string>();
  const seenFacts = new Set<string>();
  const events: AuditEvent[] = [];
  for (const candidate of Array.isArray(state.events) ? state.events : []) {
    if (!candidate || typeof candidate !== "object") continue;
    const event = candidate as Partial<AuditEvent>;
    if (!event.id || seenIds.has(event.id) || !validInstant(event.at) || !event.actorId || !event.actorRole || !event.action || !auditActions.has(event.action) || !event.module || !event.collection || !event.entityType || !event.entityId || !event.label || !event.summary || !Array.isArray(event.changes)) continue;

    // Legacy passive-diff events used "system/System" when the application merely noticed a refresh.
    // Those records never proved who changed the source or when it actually happened, so they are not valid history.
    if (event.actorId === "system" && event.actorRole === "System") continue;

    const changes = event.changes
      .filter((change): change is AuditChange => Boolean(change && typeof change.field === "string" && change.field.trim() && (change.before === undefined || typeof change.before === "string") && (change.after === undefined || typeof change.after === "string")))
      .slice(0, 20);
    const repaired = repairLegacyProvenance({ at:event.at!, actorId:event.actorId, actorRole:event.actorRole, action:event.action }, changes);
    const normalized: AuditEvent = {
      id: event.id,
      at: repaired.at,
      actorId: repaired.actorId,
      actorRole: repaired.actorRole,
      action: event.action,
      module: event.module,
      collection: event.collection,
      entityType: event.entityType,
      entityId: event.entityId,
      label: event.label,
      summary: event.summary,
      sensitivity: sensitivityFor(event.module, event.collection),
      relatedAccountId: typeof event.relatedAccountId === "string" ? event.relatedAccountId : undefined,
      relatedUserId: typeof event.relatedUserId === "string" ? event.relatedUserId : undefined,
      changes,
    };
    const fact = auditEventFingerprint(normalized);
    if (seenFacts.has(fact)) continue;
    seenIds.add(event.id);
    seenFacts.add(fact);
    events.push(normalized);
  }
  return { version: 1, events: events.sort((left, right) => right.at.localeCompare(left.at)).slice(0, 10000) };
}

function recordLabel(record: Record<string, unknown>, id: string) {
  return text(record.number) || text(record.name) || text(record.title) || text(record.action) || text(record.legalName) || text(record.lotCode) || text(record.email) || text(record.workEmail) || id;
}

function relatedAccount(record: Record<string, unknown>, module: string, collection: string, id: string) {
  if (module === "Workspace" && collection === "accounts") return id;
  if (module === "Workspace" && collection === "approvals" && text(record.type) === "Territory exception") return text(record.recordId);
  return text(record.accountId) || text(record.locationId);
}

function relatedUser(record: Record<string, unknown>, module: string, collection: string, id: string) {
  if (module === "Workspace" && collection === "users") return id;
  return text(record.userId) || text(record.employeeId) || text(record.ambassadorId) || text(record.driverId) || text(record.requesterId) || text(record.ownerId) || text(record.linkedUserId);
}

function commerceRelatedAccount(state: Record<string, unknown>, collection: string, record: Record<string, unknown>) {
  const invoices = Array.isArray(state.invoices) ? state.invoices as Record<string, unknown>[] : [];
  const payments = Array.isArray(state.payments) ? state.payments as Record<string, unknown>[] : [];
  const allocations = Array.isArray(state.allocations) ? state.allocations as Record<string, unknown>[] : [];
  if (collection === "credits" || collection === "notes") {
    const invoice = invoices.find((item) => text(item.id) === text(record.invoiceId));
    return invoice ? text(invoice.accountId) : undefined;
  }
  if (collection === "allocations") {
    const invoice = invoices.find((item) => text(item.id) === text(record.invoiceId));
    return invoice ? text(invoice.accountId) : undefined;
  }
  if (collection === "refunds") {
    const payment = payments.find((item) => text(item.id) === text(record.paymentId));
    if (payment) return text(payment.accountId);
    const allocation = allocations.find((item) => text(item.paymentId) === text(record.paymentId));
    const invoice = allocation ? invoices.find((item) => text(item.id) === text(allocation.invoiceId)) : undefined;
    return invoice ? text(invoice.accountId) : undefined;
  }
  return undefined;
}

export function collectAuditableRecords(module: string, state: unknown): Map<string, AuditSnapshot> {
  const records = new Map<string, AuditSnapshot>();
  if (!state || typeof state !== "object") return records;
  const root = state as Record<string, unknown>;
  for (const [collection, value] of Object.entries(root)) {
    if (!Array.isArray(value) || collection === "notifications") continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = text(record.id);
      if (!id) continue;
      const entityType = `${module}.${collection}`;
      const key = `${entityType}:${id}`;
      const directAccount = relatedAccount(record, module, collection, id);
      const relatedAccountId = directAccount ?? (module === "Commerce" ? commerceRelatedAccount(root, collection, record) : undefined);
      records.set(key, {
        key,
        module,
        collection,
        entityType,
        entityId: id,
        label: recordLabel(record, id),
        sensitivity: sensitivityFor(module, collection),
        relatedAccountId,
        relatedUserId: relatedUser(record, module, collection, id),
        payload: record,
      });
    }
  }
  return records;
}

export function mergeAuditSnapshots(...maps: Map<string, AuditSnapshot>[]) {
  const merged = new Map<string, AuditSnapshot>();
  for (const map of maps) for (const [key, value] of map) merged.set(key, value);
  return merged;
}

function sameValue(left: unknown, right: unknown) {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return left === right; }
}

function changeList(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): AuditChange[] {
  const keys = new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]);
  const changes: AuditChange[] = [];
  for (const field of keys) {
    if (field === "updatedAt") continue;
    const beforeValue = before?.[field];
    const afterValue = after?.[field];
    if (!sameValue(beforeValue, afterValue)) changes.push({ field, before: display(beforeValue), after: display(afterValue) });
  }
  return changes.slice(0, 20);
}

type Provenance = { actorId: string; at: string };

const createdPairs = [
  ["actorId", "at"],
  ["createdBy", "createdAt"],
  ["submittedBy", "submittedAt"],
  ["requesterId", "submittedAt"],
  ["provisionedBy", "provisionedAt"],
  ["recordedBy", "recordedAt"],
  ["authorId", "createdAt"],
  ["acceptedBy", "acceptedAt"],
  ["assignedBy", "assignedAt"],
  ["uploadedBy", "uploadedAt"],
  ["approvedBy", "createdAt"],
] as const;

const updatedPairs = [
  ["updatedBy", "updatedAt"],
  ["changedBy", "changedAt"],
  ["decidedBy", "decidedAt"],
  ["approvedBy", "approvedAt"],
  ["fulfilledBy", "fulfilledAt"],
  ["reviewedBy", "reviewedAt"],
  ["resolvedBy", "resolvedAt"],
  ["returnedBy", "returnedAt"],
  ["cancelledBy", "cancelledAt"],
  ["deletedBy", "deletedAt"],
  ["approverId", "approvedAt"],
  ["assignedBy", "assignedAt"],
  ["claimedBy", "claimedAt"],
  ["completedBy", "completedAt"],
  ["settledBy", "settledAt"],
  ["failedBy", "failedAt"],
  ["reversedBy", "reversedAt"],
  ["sentBy", "sentAt"],
  ["appliedBy", "appliedAt"],
  ["recordedBy", "recordedAt"],
  ["uploadedBy", "uploadedAt"],
  ["provisionedBy", "provisionedAt"],
] as const;

function pairProvenance(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, action: AuditEvent["action"], pairs: readonly (readonly [string, string])[]): Provenance | undefined {
  const source = action === "Deleted" ? before : after;
  if (!source) return undefined;
  for (const [actorField, timeField] of pairs) {
    const actorId = text(source[actorField]);
    const at = text(source[timeField]);
    if (!actorId || !validInstant(at)) continue;
    if (action === "Updated" && sameValue(before?.[actorField], after?.[actorField]) && sameValue(before?.[timeField], after?.[timeField])) continue;
    return { actorId, at: at! };
  }
  return undefined;
}

function dynamicByAtProvenance(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, action: AuditEvent["action"]): Provenance | undefined {
  const source = action === "Deleted" ? before : after;
  if (!source) return undefined;
  for (const actorField of Object.keys(source)) {
    if (!actorField.endsWith("By") || actorField.length <= 2) continue;
    const timeField = `${actorField.slice(0, -2)}At`;
    const actorId = text(source[actorField]);
    const at = text(source[timeField]);
    if (!actorId || !validInstant(at)) continue;
    if (action === "Updated" && sameValue(before?.[actorField], after?.[actorField]) && sameValue(before?.[timeField], after?.[timeField])) continue;
    return { actorId, at: at! };
  }
  return undefined;
}

function newestDeliveryHistoryProvenance(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): Provenance | undefined {
  if (!Array.isArray(after?.history)) return undefined;
  const beforeIds = new Set((Array.isArray(before?.history) ? before!.history : [])
    .flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === "string" ? [String((item as Record<string, unknown>).id)] : []));
  const candidates = after.history
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .filter((item) => {
      const id = text(item.id);
      return !id || !beforeIds.has(id);
    })
    .flatMap((item) => {
      const actorId = text(item.actorId);
      const at = text(item.at);
      return actorId && validInstant(at) ? [{ actorId, at: at! }] : [];
    })
    .sort((left, right) => right.at.localeCompare(left.at));
  return candidates[0];
}

function newestCorrection(payload: Record<string, unknown> | undefined): Provenance | undefined {
  if (!Array.isArray(payload?.corrections)) return undefined;
  const candidates = payload.corrections
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .flatMap((item) => {
      const actorId = text(item.by);
      const at = text(item.at);
      return actorId && validInstant(at) ? [{ actorId, at: at! }] : [];
    })
    .sort((left, right) => right.at.localeCompare(left.at));
  return candidates[0];
}

function specialProvenance(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"]): Provenance | undefined {
  const snapshot = after ?? before;
  const source = action === "Deleted" ? before?.payload : after?.payload;
  if (!snapshot || !source) return undefined;

  if (snapshot.module === "Workspace" && snapshot.collection === "activities") {
    const actorId = text(source.userId);
    const at = text(source.at);
    return actorId && validInstant(at) ? { actorId, at: at! } : undefined;
  }

  if (snapshot.module === "CRM" && snapshot.collection === "interactions") {
    const actorId = text(source.userId);
    const at = text(source.occurredAt);
    return actorId && validInstant(at) ? { actorId, at: at! } : undefined;
  }

  if (snapshot.module === "Workspace" && snapshot.collection === "timeEntries") {
    if (action === "Updated") {
      const correction = newestCorrection(source);
      const beforeCorrections = before?.payload.corrections;
      if (correction && !sameValue(beforeCorrections, after?.payload.corrections)) return correction;
      const actorId = text(source.userId);
      const clockOutAt = text(source.clockOutAt);
      if (actorId && validInstant(clockOutAt) && !sameValue(before?.payload.clockOutAt, after?.payload.clockOutAt)) return { actorId, at: clockOutAt! };
    }
    if (action === "Created") {
      const actorId = text(source.userId);
      const clockInAt = text(source.clockInAt);
      if (actorId && validInstant(clockInAt)) return { actorId, at: clockInAt! };
    }
  }

  if (snapshot.module === "Field tracking") {
    const actorId = text(source.userId) || text(source.configuredBy);
    if (!actorId) return undefined;
    const timestampFields = action === "Updated"
      ? ["resolvedAt", "endedAt", "createdAt", "triggeredAt", "at", "startedAt", "configuredAt"]
      : ["at", "createdAt", "triggeredAt", "startedAt", "configuredAt"];
    for (const field of timestampFields) {
      const at = text(source[field]);
      if (!validInstant(at)) continue;
      if (action === "Updated" && sameValue(before?.payload[field], after?.payload[field])) continue;
      return { actorId, at: at! };
    }
  }

  if (snapshot.module === "Delivery" && snapshot.collection === "tasks" && action === "Updated") {
    return newestDeliveryHistoryProvenance(before?.payload, after?.payload);
  }

  return undefined;
}

function verifiedProvenance(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"]): Provenance | undefined {
  return specialProvenance(before, after, action)
    ?? pairProvenance(before?.payload, after?.payload, action, action === "Created" ? createdPairs : updatedPairs)
    ?? dynamicByAtProvenance(before?.payload, after?.payload, action);
}

export function diffAuditableRecords(
  previous: Map<string, AuditSnapshot>,
  current: Map<string, AuditSnapshot>,
  actor: { id: string; role: string },
  at = new Date().toISOString(),
  users: WorkspaceUser[] = [],
): AuditEvent[] {
  const events: AuditEvent[] = [];
  const keys = new Set([...previous.keys(), ...current.keys()]);
  let sequence = 0;

  for (const key of keys) {
    const before = previous.get(key);
    const after = current.get(key);
    // Unchanged React/engine records preserve identity. Avoid serializing every unrelated
    // document when a field-tracking sample or another domain updates.
    if (before && after && (before.payload === after.payload || sameValue(before.payload, after.payload))) continue;
    const snapshot = after ?? before;
    if (!snapshot) continue;

    const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated";
    const changes = changeList(before?.payload, after?.payload);
    const source = verifiedProvenance(before, after, action);

    // Passive hydration, normalization, polling and derived-state refreshes are not business events.
    // If the source record cannot prove who performed the action and when, do not manufacture "System · right now" history.
    const fallbackVerified = actor.id !== "system" && validInstant(at) ? { actorId: actor.id, at } : undefined;
    const provenance = source ?? fallbackVerified;
    if (!provenance) continue;

    const inferredUser = users.find((user) => user.id === provenance.actorId);
    const actorRole = provenance.actorId === "system" ? "System automation" : inferredUser?.role ?? (actor.id === provenance.actorId ? actor.role : "Recorded user");
    const changedFields = changes.map((item) => item.field).join(", ");
    events.push({
      id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`,
      at: provenance.at,
      actorId: provenance.actorId,
      actorRole,
      action,
      module: snapshot.module,
      collection: snapshot.collection,
      entityType: snapshot.entityType,
      entityId: snapshot.entityId,
      label: snapshot.label,
      summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`,
      sensitivity: snapshot.sensitivity,
      relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId,
      relatedUserId: after?.relatedUserId ?? before?.relatedUserId,
      changes,
    });
  }
  return events;
}

export function visibleAuditEvents(user: WorkspaceUser | null, data: WorkspaceData, events: AuditEvent[]) {
  if (!user || user.role === "Customer") return [];
  if (user.role === "Administrator") return events;
  const managedIds = new Set(data.users.filter((candidate) => canManageUser(data, user, candidate.id, true)).map((candidate) => candidate.id));
  const accountIds = new Set(data.accounts.filter((account) => user.role === "Sales Manager" ? managedIds.has(account.ownerId) : user.role === "Sales Representative" ? account.ownerId === user.id : false).map((account) => account.id));
  return events.filter((event) => {
    if (user.role === "Sales Manager") {
      if (event.sensitivity === "admin") return false;
      return Boolean((event.relatedAccountId && accountIds.has(event.relatedAccountId)) || (event.relatedUserId && managedIds.has(event.relatedUserId)));
    }
    if (user.role === "Sales Representative") {
      return event.sensitivity === "operational" && Boolean((event.relatedAccountId && accountIds.has(event.relatedAccountId)) || event.relatedUserId === user.id);
    }
    if (user.role === "Operations") {
      if (event.module === "Commerce" && event.sensitivity === "manager") return true;
      if (event.sensitivity !== "operational") return false;
      if (event.module === "Inventory" || event.collection === "inventory" || event.collection === "orders") return true;
      return event.relatedUserId === user.id;
    }
    if (user.role === "Warehouse") {
      if (event.sensitivity !== "operational") return false;
      if (event.module === "Inventory" || event.collection === "inventory" || event.collection === "orders") return true;
      return event.relatedUserId === user.id;
    }
    return false;
  });
}
