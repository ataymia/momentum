import type { AuditEvent } from "./audit-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export const NOTIFICATION_STORAGE_KEY = "momentum-notification-rules-v1";
export type NotificationChannel = "In app" | "Email" | "SMS";
export type NotificationPreference = { userId: string; inApp: boolean; email: boolean; sms: boolean; emailAddress?: string; smsNumber?: string };
export type NotificationDelivery = { id: string; sourceEventId: string; recipientUserId: string; channel: NotificationChannel; title: string; detail: string; tone: "info" | "warning" | "success"; createdAt: string; status: "Unread" | "Read" | "Awaiting integration" | "Sent" | "Failed"; readAt?: string; escalatedAt?: string; escalationOf?: string };
export type NotificationState = { version: 1; escalationHours: number; preferences: NotificationPreference[]; deliveries: NotificationDelivery[] };
export const defaultNotificationPreference = (user: WorkspaceUser): NotificationPreference => ({ userId: user.id, inApp: user.role !== "Customer", email: false, sms: false, emailAddress: user.email });
export function createNotificationSeed(users: WorkspaceUser[]): NotificationState { return { version: 1, escalationHours: 24, preferences: users.map(defaultNotificationPreference), deliveries: [] }; }
export function normalizeNotificationState(input: unknown, users: WorkspaceUser[]): NotificationState { const seed = createNotificationSeed(users); if (!input || typeof input !== "object") return seed; const state = input as Partial<NotificationState>; const preferences = Array.isArray(state.preferences) ? [...state.preferences] : []; for (const user of users) if (!preferences.some((item) => item.userId === user.id)) preferences.push(defaultNotificationPreference(user)); return { version: 1, escalationHours: typeof state.escalationHours === "number" && state.escalationHours >= 1 ? state.escalationHours : 24, preferences, deliveries: Array.isArray(state.deliveries) ? state.deliveries : [] }; }

export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {
  const recipients = new Set<string>(); if (event.relatedUserId) recipients.add(event.relatedUserId);
  if (event.relatedAccountId) { const account = data.accounts.find((item) => item.id === event.relatedAccountId); if (account) { recipients.add(account.ownerId); if (account.accountManagerId) recipients.add(account.accountManagerId); const owner = data.users.find((item) => item.id === account.ownerId); if (owner?.managerId) recipients.add(owner.managerId); for (const user of data.users.filter((item) => item.role === "Customer" && (item.accountIds ?? []).includes(account.id))) if (["orders", "appointments"].includes(event.collection)) recipients.add(user.id); } }
  if (!recipients.size || event.sensitivity === "admin") for (const admin of data.users.filter((user) => user.role === "Administrator")) recipients.add(admin.id);
  recipients.delete(event.actorId); if (!recipients.size) recipients.add(event.actorId); return [...recipients];
}
export function notificationCopy(event: AuditEvent) { const high = ["approvals", "payroll", "journals", "inventory"].some((token) => `${event.collection} ${event.entityType}`.toLowerCase().includes(token)); return { title: `${event.label}: ${event.action.toLowerCase()}`, detail: event.summary, tone: high ? "warning" as const : "info" as const }; }
export function enabledChannels(preference: NotificationPreference): NotificationChannel[] { return [preference.inApp ? "In app" : null, preference.email ? "Email" : null, preference.sms ? "SMS" : null].filter((item): item is NotificationChannel => Boolean(item)); }
export const deliveryKey = (eventId: string, userId: string, channel: NotificationChannel) => `${eventId}:${userId}:${channel}`;
