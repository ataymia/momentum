import type { AuditEvent, AuditChange } from "./audit-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export const NOTIFICATION_STORAGE_KEY = "momentum-notification-rules-v1";
export type NotificationChannel = "In app" | "Email" | "SMS";
export type NotificationPreference = { userId: string; inApp: boolean; email: boolean; sms: boolean; emailAddress?: string; smsNumber?: string };
export type NotificationDelivery = { id: string; sourceEventId: string; recipientUserId: string; channel: NotificationChannel; title: string; detail: string; tone: "info" | "warning" | "success"; createdAt: string; status: "Unread" | "Read" | "Awaiting integration" | "Sent" | "Failed"; readAt?: string; escalatedAt?: string; escalationOf?: string };
export type NotificationState = { version: 1; escalationHours: number; preferences: NotificationPreference[]; deliveries: NotificationDelivery[] };
export const defaultNotificationPreference = (user: WorkspaceUser): NotificationPreference => ({ userId: user.id, inApp: user.role !== "Customer", email: false, sms: false, emailAddress: user.email });
export function createNotificationSeed(users: WorkspaceUser[]): NotificationState { return { version: 1, escalationHours: 24, preferences: users.map(defaultNotificationPreference), deliveries: [] }; }

const channels = new Set<NotificationChannel>(["In app", "Email", "SMS"]);
const tones = new Set<NotificationDelivery["tone"]>(["info", "warning", "success"]);
const statuses = new Set<NotificationDelivery["status"]>(["Unread", "Read", "Awaiting integration", "Sent", "Failed"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));

export function normalizeNotificationState(input: unknown, users: WorkspaceUser[]): NotificationState {
  const seed = createNotificationSeed(users); if (!input || typeof input !== "object") return seed; const state = input as Partial<NotificationState>;
  const userById = new Map(users.map((user) => [user.id, user]));
  const storedPreferences = Array.isArray(state.preferences) ? state.preferences : [];
  const preferences = users.map((user) => {
    const stored = storedPreferences.find((item) => item?.userId === user.id);
    if (!stored) return defaultNotificationPreference(user);
    const emailAddress = typeof stored.emailAddress === "string" && stored.emailAddress.trim() ? stored.emailAddress.trim() : user.email;
    const smsNumber = typeof stored.smsNumber === "string" && stored.smsNumber.trim() ? stored.smsNumber.trim() : undefined;
    return { userId: user.id, inApp: user.role !== "Customer" && stored.inApp === true, email: stored.email === true && Boolean(emailAddress), sms: stored.sms === true && Boolean(smsNumber), emailAddress, smsNumber };
  });
  const seen = new Set<string>();
  const deliveries = (Array.isArray(state.deliveries) ? state.deliveries : []).filter((delivery): delivery is NotificationDelivery => {
    if (!delivery?.id || seen.has(delivery.id) || !delivery.sourceEventId || !userById.has(delivery.recipientUserId) || !channels.has(delivery.channel) || !tones.has(delivery.tone) || !statuses.has(delivery.status) || !delivery.title?.trim() || !delivery.detail?.trim() || !validInstant(delivery.createdAt) || (delivery.readAt && !validInstant(delivery.readAt)) || (delivery.escalatedAt && !validInstant(delivery.escalatedAt))) return false;
    if (delivery.channel === "In app" && !["Unread", "Read"].includes(delivery.status)) return false;
    if (delivery.channel !== "In app" && !["Awaiting integration", "Sent", "Failed"].includes(delivery.status)) return false;
    if (delivery.status === "Read" && !delivery.readAt) return false;
    seen.add(delivery.id); return true;
  });
  const escalationHours = typeof state.escalationHours === "number" && Number.isFinite(state.escalationHours) && state.escalationHours >= 1 && state.escalationHours <= 168 ? Math.round(state.escalationHours) : 24;
  return { version: 1, escalationHours, preferences, deliveries };
}

export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {
  if (event.collection === "approvals" && event.action === "Created") {
    return data.users.filter((user) => user.role === "Administrator" && user.id !== event.actorId).map((user) => user.id);
  }
  if (event.collection === "approvals" && event.action === "Updated" && event.relatedUserId) {
    return event.relatedUserId === event.actorId ? [] : [event.relatedUserId];
  }
  if (event.sensitivity === "admin") {
    const admins = data.users.filter((user) => user.role === "Administrator").map((user) => user.id);
    const otherAdmins = admins.filter((id) => id !== event.actorId);
    if (otherAdmins.length) return otherAdmins;
    return admins.includes(event.actorId) ? [event.actorId] : [];
  }
  const recipients = new Set<string>(); if (event.relatedUserId) recipients.add(event.relatedUserId);
  if (event.relatedAccountId) { const account = data.accounts.find((item) => item.id === event.relatedAccountId); if (account) { recipients.add(account.ownerId); if (account.accountManagerId) recipients.add(account.accountManagerId); const owner = data.users.find((item) => item.id === account.ownerId); if (owner?.managerId) recipients.add(owner.managerId); for (const user of data.users.filter((item) => item.role === "Customer" && (item.accountIds ?? []).includes(account.id))) if (["orders", "appointments"].includes(event.collection)) recipients.add(user.id); } }
  if (!recipients.size) for (const admin of data.users.filter((user) => user.role === "Administrator")) recipients.add(admin.id);
  recipients.delete(event.actorId); if (!recipients.size && data.users.some((user) => user.id === event.actorId)) recipients.add(event.actorId); return [...recipients].filter((id) => data.users.some((user) => user.id === id));
}

const changedTo = (event: AuditEvent, field: string, value: string) => event.changes.some((change) => change.field === field && change.after === value);

/** The bell is an action queue. Routine activity stays in Audit and never becomes an in-app/email/SMS action. */
export function auditEventCreatesNotification(event: AuditEvent) {
  if (event.module === "Field tracking") return event.collection === "departureAlerts" && event.action === "Created";
  if (event.collection === "approvals") {
    if (event.action === "Created") return changedTo(event, "status", "Pending");
    return event.action === "Updated" && changedTo(event, "status", "Returned");
  }
  if (event.collection === "timecards") return event.action === "Updated" && (changedTo(event, "status", "Submitted") || changedTo(event, "status", "Returned"));
  if (event.module === "Marketing" && event.collection === "requests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));
  if (event.module === "HCM" && event.collection === "leaveRequests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));
  return false;
}

const collectionNames: Record<string, string> = {
  accounts: "account",
  appointments: "appointment",
  approvals: "approval request",
  orders: "order",
  placements: "retail placement",
  inventory: "inventory record",
  inventoryLots: "inventory lot",
  timeEntries: "time entry",
  timecards: "timecard",
  users: "employee account",
  employees: "employee record",
  privateProfiles: "employee profile",
  documents: "employee document",
  training: "training assignment",
  courses: "training module",
  lifecycleCases: "onboarding record",
  compensation: "compensation record",
  compensationChanges: "compensation request",
  shifts: "schedule",
  leaveRequests: "leave request",
  invoices: "invoice",
  payments: "payment",
  allocations: "payment allocation",
  credits: "credit",
  refunds: "refund",
  expenses: "expense",
  campaigns: "campaign",
  materials: "marketing material",
  territories: "territory suggestion",
  events: "event",
  brandAmbassadorEvents: "Brand Ambassador event",
};

const fieldLabels: Record<string, string> = {
  startTime: "time",
  endTime: "end time",
  date: "date",
  status: "status",
  ownerId: "owner",
  managerId: "manager",
  accountManagerId: "account manager",
  creditedRepId: "credited sales representative",
  assignedBy: "assigned by",
  accountState: "account access",
  nextAction: "next action",
  nextActionDate: "next-action date",
  streetAddress: "address",
  postalCode: "ZIP code",
  pricePerCase: "price per case",
  paymentStatus: "payment status",
  payGroup: "pay group",
  standardWeeklyHours: "standard weekly hours",
  jobTitle: "job title",
  workLocation: "work location",
  requiredStaff: "people needed",
  ambassadorIds: "assigned Brand Ambassadors",
  courseIds: "assigned training",
  requiredForRoles: "role audience",
  requiredForTeams: "team audience",
};

const ignoredNotificationFields = new Set(["id", "updatedAt", "createdAt", "readBy", "acknowledgedBy", "passwordChangedAt", "provisionedAt"]);

const titleCase = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const entityName = (event: AuditEvent) => collectionNames[event.collection] ?? titleCase(event.collection || event.entityType).toLowerCase();
const actorName = (event: AuditEvent, data?: WorkspaceData) => data?.users.find((user) => user.id === event.actorId)?.firstName || data?.users.find((user) => user.id === event.actorId)?.name || "A team member";
const accountName = (event: AuditEvent, data?: WorkspaceData) => {
  const account = event.relatedAccountId ? data?.accounts.find((item) => item.id === event.relatedAccountId) : undefined;
  return account?.locationName || account?.name;
};
const relatedUserName = (event: AuditEvent, data?: WorkspaceData) => event.relatedUserId ? data?.users.find((user) => user.id === event.relatedUserId)?.name : undefined;
const looksLikeTechnicalId = (value: string) => value === "" || /^(?:[a-z]+-){1,4}[a-z0-9]{5,}$/i.test(value) || /^[A-Za-z0-9_-]{18,}$/.test(value);

const formatClock = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]); const minute = match[2]; if (!Number.isFinite(hour) || hour > 23) return value;
  const suffix = hour >= 12 ? "PM" : "AM"; const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
};

const formatCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(`${value}T12:00:00`); if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
};

const maybeJsonList = (value: string) => {
  if (!value.startsWith("[")) return null;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map((item) => String(item)) : null; } catch { return null; }
};

function formatChangeValue(field: string, raw: string | undefined, data?: WorkspaceData) {
  if (raw === undefined || raw === "undefined" || raw === "null" || raw === "") return "not set";
  if (["startTime", "endTime", "clockIn", "clockOut", "mealStart", "mealEnd"].includes(field)) return formatClock(raw);
  if (/date$/i.test(field) || ["date", "effectiveDate", "startDate", "endDate", "dueDate"].includes(field)) return formatCalendarDate(raw);
  if (["pricePerCase", "amount", "rate", "total", "subtotal", "tax", "shipping"].includes(field) && Number.isFinite(Number(raw))) return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:2 }).format(Number(raw));
  if (["ownerId", "managerId", "accountManagerId", "creditedRepId", "assignedBy", "reviewerId", "approvedBy", "userId", "employeeId"].includes(field)) return data?.users.find((user) => user.id === raw)?.name ?? "another team member";
  if (["true", "false"].includes(raw.toLowerCase())) return raw.toLowerCase() === "true" ? "Yes" : "No";
  const list = maybeJsonList(raw);
  if (list) return list.map((item) => data?.users.find((user) => user.id === item)?.name ?? item).join(", ") || "none";
  return raw;
}

function changeSentence(change: AuditChange, event: AuditEvent, data?: WorkspaceData) {
  if (ignoredNotificationFields.has(change.field)) return null;
  const field = fieldLabels[change.field] ?? titleCase(change.field).toLowerCase();
  const before = formatChangeValue(change.field, change.before, data);
  const after = formatChangeValue(change.field, change.after, data);

  if (change.field === "startTime") return before === "not set" ? `Appointment time set to ${after}.` : `Appointment time changed from ${before} to ${after}.`;
  if (change.field === "endTime") return `End time changed to ${after}.`;
  if (change.field === "date") return `Date changed to ${after}.`;
  if (change.field === "status") return `Status changed from ${before} to ${after}.`;
  if (change.field === "nextAction") return `Next action is now “${after}”.`;
  if (change.field === "nextActionDate") return `Next action is due ${after}.`;
  if (change.field === "duration") return `Duration changed to ${after} minutes.`;
  if (change.field === "cases") return `Case quantity changed to ${after}.`;
  if (change.field === "requiredStaff") return `Staffing changed to ${after} people needed.`;
  if (change.field === "accountState") return `Account access changed to ${after}.`;
  if (change.field === "active") return `${entityName(event).replace(/^./, (letter) => letter.toUpperCase())} is now ${after === "Yes" ? "active" : "inactive"}.`;
  if (before === "not set") return `${field.replace(/^./, (letter) => letter.toUpperCase())} set to ${after}.`;
  if (after === "not set") return `${field.replace(/^./, (letter) => letter.toUpperCase())} was cleared.`;
  return `${field.replace(/^./, (letter) => letter.toUpperCase())} changed from ${before} to ${after}.`;
}

function meaningfulChangeDetail(event: AuditEvent, data?: WorkspaceData) {
  const sentences = event.changes.map((change) => changeSentence(change, event, data)).filter((item): item is string => Boolean(item));
  if (!sentences.length) return null;
  const visible = sentences.slice(0, 3);
  const remaining = sentences.length - visible.length;
  return `${visible.join(" ")}${remaining > 0 ? ` Plus ${remaining} other ${remaining === 1 ? "change" : "changes"}.` : ""}`;
}

function targetPhrase(event: AuditEvent, data?: WorkspaceData) {
  const account = accountName(event, data);
  if (account) return ` for ${account}`;
  const relatedUser = relatedUserName(event, data);
  if (relatedUser && ["employees","privateProfiles","documents","training","compensation","compensationChanges","lifecycleCases","timecards","timeEntries","leaveRequests"].includes(event.collection)) return ` for ${relatedUser}`;
  if (event.label && event.label !== event.entityId && !looksLikeTechnicalId(event.label)) return ` “${event.label}”`;
  return "";
}

function actionVerb(event: AuditEvent) {
  if (event.collection === "appointments") return event.action === "Created" ? "scheduled" : event.action === "Deleted" ? "cancelled" : "updated";
  if (event.collection === "accounts") return event.action === "Created" ? "added" : event.action === "Deleted" ? "removed" : "updated";
  if (event.collection === "orders") return event.action === "Created" ? "created" : event.action === "Deleted" ? "removed" : "updated";
  if (event.collection === "approvals") return event.action === "Created" ? "submitted" : event.action === "Deleted" ? "removed" : "updated";
  if (event.collection === "payments") return event.action === "Created" ? "recorded" : event.action === "Deleted" ? "removed" : "updated";
  return event.action === "Created" ? "created" : event.action === "Deleted" ? "removed" : "updated";
}

export function notificationCopy(event: AuditEvent, data?: WorkspaceData) {
  if (event.module === "Field tracking" && event.collection === "departureAlerts") {
    return { title: "Customer-radius departure", detail: "A tracked sales-rep appointment left its 2-mile customer radius. Open Dispatch to review the closeout or documented offsite continuation.", tone: "warning" as const };
  }
  if (event.collection === "approvals" && event.label.startsWith("Territory exception")) {
    return { title: event.action === "Created" ? "Territory exception needs review" : "Territory exception updated", detail: "A sales representative is working outside the account's geographic suggestion. The reason is documented in My Work. This does not block sales activity; it requires management validation.", tone: "warning" as const };
  }

  const actor = actorName(event, data);
  const entity = entityName(event);
  const target = targetPhrase(event, data);
  const verb = actionVerb(event);
  const detail = meaningfulChangeDetail(event, data) ?? (event.action === "Created" ? `A new ${entity} was added to Momentum.` : event.action === "Deleted" ? `The ${entity} was removed from Momentum.` : `The ${entity} was updated.`);
  const high = ["approvals", "payroll", "journals", "inventory", "compensation", "refunds"].some((token) => `${event.collection} ${event.entityType}`.toLowerCase().includes(token));

  return {
    title: `${actor} ${verb} ${entity}${target}`,
    detail,
    tone: high ? "warning" as const : event.action === "Created" ? "success" as const : "info" as const,
  };
}

export function enabledChannels(preference: NotificationPreference): NotificationChannel[] { return [preference.inApp ? "In app" : null, preference.email && preference.emailAddress?.trim() ? "Email" : null, preference.sms && preference.smsNumber?.trim() ? "SMS" : null].filter((item): item is NotificationChannel => Boolean(item)); }
export const deliveryKey = (eventId: string, userId: string, channel: NotificationChannel) => `${eventId}:${userId}:${channel}`;
