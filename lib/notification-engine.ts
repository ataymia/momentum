import type { AuditEvent } from "./audit-engine";
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
  if (event.sensitivity === "admin") {
    const admins = data.users.filter((user) => user.role === "Administrator").map((user) => user.id).filter((id) => id !== event.actorId);
    return admins.length ? admins : [event.actorId];
  }
  const recipients = new Set<string>(); if (event.relatedUserId) recipients.add(event.relatedUserId);
  if (event.relatedAccountId) { const account = data.accounts.find((item) => item.id === event.relatedAccountId); if (account) { recipients.add(account.ownerId); if (account.accountManagerId) recipients.add(account.accountManagerId); const owner = data.users.find((item) => item.id === account.ownerId); if (owner?.managerId) recipients.add(owner.managerId); for (const user of data.users.filter((item) => item.role === "Customer" && (item.accountIds ?? []).includes(account.id))) if (["orders", "appointments"].includes(event.collection)) recipients.add(user.id); } }
  if (!recipients.size) for (const admin of data.users.filter((user) => user.role === "Administrator")) recipients.add(admin.id);
  recipients.delete(event.actorId); if (!recipients.size) recipients.add(event.actorId); return [...recipients].filter((id) => data.users.some((user) => user.id === id));
}

export function auditEventCreatesNotification(event: AuditEvent) {
  if (event.module !== "Field tracking") return true;
  return event.collection === "departureAlerts" && event.action === "Created";
}

export function notificationCopy(event: AuditEvent) {
  if (event.module === "Field tracking" && event.collection === "departureAlerts") {
    return { title: "Customer-radius departure", detail: "A tracked sales-rep appointment left its 2-mile customer radius. Open Dispatch to review the closeout or documented offsite continuation.", tone: "warning" as const };
  }
  const high = ["approvals", "payroll", "journals", "inventory"].some((token) => `${event.collection} ${event.entityType}`.toLowerCase().includes(token));
  return { title: `${event.label}: ${event.action.toLowerCase()}`, detail: event.summary, tone: high ? "warning" as const : "info" as const };
}
export function enabledChannels(preference: NotificationPreference): NotificationChannel[] { return [preference.inApp ? "In app" : null, preference.email && preference.emailAddress?.trim() ? "Email" : null, preference.sms && preference.smsNumber?.trim() ? "SMS" : null].filter((item): item is NotificationChannel => Boolean(item)); }
export const deliveryKey = (eventId: string, userId: string, channel: NotificationChannel) => `${eventId}:${userId}:${channel}`;