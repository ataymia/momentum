import type { WorkspaceData, WorkspaceUser } from "./types";

export const AUDIT_STORAGE_KEY = "momentum-audit-v1";
export type AuditSensitivity = "operational" | "manager" | "admin";
export type AuditChange = { field: string; before?: string; after?: string };
export type AuditEvent = { id: string; at: string; actorId: string; actorRole: string; action: "Created" | "Updated" | "Deleted"; module: string; collection: string; entityType: string; entityId: string; label: string; summary: string; sensitivity: AuditSensitivity; relatedAccountId?: string; relatedUserId?: string; changes: AuditChange[] };
export type AuditState = { version: 1; events: AuditEvent[] };
export type AuditSnapshot = { key: string; module: string; collection: string; entityType: string; entityId: string; label: string; sensitivity: AuditSensitivity; relatedAccountId?: string; relatedUserId?: string; payload: Record<string, unknown> };
export const createAuditSeed = (): AuditState => ({ version: 1, events: [] });
export function normalizeAuditState(input: unknown): AuditState { if (!input || typeof input !== "object") return createAuditSeed(); const state = input as Partial<AuditState>; return { version: 1, events: Array.isArray(state.events) ? state.events : [] }; }
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const display = (value: unknown) => { if (value === undefined) return undefined; if (value === null) return "null"; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).slice(0, 180); try { return JSON.stringify(value).slice(0, 180); } catch { return "[unavailable]"; } };
function sensitivityFor(module: string, collection: string): AuditSensitivity { if (["Payroll", "Accounting", "HCM"].includes(module)) return "admin"; if (["Finance", "Performance", "Period locks"].includes(module) || ["approvals", "timecards"].includes(collection)) return "manager"; if (module === "Commerce" && ["payments", "allocations", "credits", "refunds", "notes"].includes(collection)) return "manager"; return "operational"; }
function recordLabel(record: Record<string, unknown>, id: string) { return text(record.number) || text(record.name) || text(record.title) || text(record.lotCode) || text(record.email) || id; }
function relatedAccount(record: Record<string, unknown>, module: string, collection: string, id: string) { if (module === "Workspace" && collection === "accounts") return id; return text(record.accountId) || text(record.locationId); }
function relatedUser(record: Record<string, unknown>, module: string, collection: string, id: string) { if (module === "Workspace" && collection === "users") return id; return text(record.userId) || text(record.employeeId) || text(record.requesterId) || text(record.ownerId); }

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
  const records = new Map<string, AuditSnapshot>(); if (!state || typeof state !== "object") return records; const root = state as Record<string, unknown>;
  for (const [collection, value] of Object.entries(root)) {
    if (!Array.isArray(value) || collection === "notifications") continue;
    for (const item of value) { if (!item || typeof item !== "object") continue; const record = item as Record<string, unknown>; const id = text(record.id); if (!id) continue; const entityType = `${module}.${collection}`; const key = `${entityType}:${id}`; const directAccount = relatedAccount(record, module, collection, id); const relatedAccountId = directAccount ?? (module === "Commerce" ? commerceRelatedAccount(root, collection, record) : undefined); records.set(key, { key, module, collection, entityType, entityId: id, label: recordLabel(record, id), sensitivity: sensitivityFor(module, collection), relatedAccountId, relatedUserId: relatedUser(record, module, collection, id), payload: record }); }
  }
  return records;
}
export function mergeAuditSnapshots(...maps: Map<string, AuditSnapshot>[]) { const merged = new Map<string, AuditSnapshot>(); for (const map of maps) for (const [key, value] of map) merged.set(key, value); return merged; }
function changeList(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): AuditChange[] { const keys = new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])]); const changes: AuditChange[] = []; for (const field of keys) { if (field === "updatedAt") continue; const beforeValue = before?.[field]; const afterValue = after?.[field]; let same = false; try { same = JSON.stringify(beforeValue) === JSON.stringify(afterValue); } catch { same = beforeValue === afterValue; } if (!same) changes.push({ field, before: display(beforeValue), after: display(afterValue) }); } return changes.slice(0, 20); }
export function diffAuditableRecords(previous: Map<string, AuditSnapshot>, current: Map<string, AuditSnapshot>, actor: { id: string; role: string }, at = new Date().toISOString()): AuditEvent[] { const events: AuditEvent[] = []; const keys = new Set([...previous.keys(), ...current.keys()]); let sequence = 0; for (const key of keys) { const before = previous.get(key); const after = current.get(key); if (before && after) { let same = false; try { same = JSON.stringify(before.payload) === JSON.stringify(after.payload); } catch { same = false; } if (same) continue; } const snapshot = after ?? before; if (!snapshot) continue; const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated"; const changes = changeList(before?.payload, after?.payload); const changedFields = changes.map((item) => item.field).join(", "); events.push({ id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`, at, actorId: actor.id, actorRole: actor.role, action, module: snapshot.module, collection: snapshot.collection, entityType: snapshot.entityType, entityId: snapshot.entityId, label: snapshot.label, summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`, sensitivity: snapshot.sensitivity, relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId, relatedUserId: after?.relatedUserId ?? before?.relatedUserId, changes }); } return events; }

export function visibleAuditEvents(user: WorkspaceUser | null, data: WorkspaceData, events: AuditEvent[]) {
  if (!user || user.role === "Customer") return [];
  if (user.role === "Administrator") return events;
  const managedIds = new Set(data.users.filter((candidate) => candidate.id === user.id || candidate.managerId === user.id || (user.managedTeams ?? []).includes(candidate.team)).map((candidate) => candidate.id));
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
