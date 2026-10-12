import { arizonaDateKey, arizonaHour } from "./date-time";
import { weeklyReportingObligations, type PerformanceState } from "./performance-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export type NotificationImportance = "critical" | "action" | "status" | "reminder";

export type NotificationIntent = {
  id: string;
  recipientUserId: string;
  title: string;
  detail: string;
  importance: NotificationImportance;
  targetPage?: "orders" | "reportingCenter" | "people" | "work";
  targetRecordId?: string;
};

export function sundayWeeklyReminderIntent(performance: PerformanceState, user: WorkspaceUser, now = new Date()): NotificationIntent | null {
  if (!["Sales Representative","Sales Manager"].includes(user.role)) return null;
  const today = arizonaDateKey(now);
  const weekday = new Date(`${today}T12:00:00-07:00`).getDay();
  if (weekday !== 0 || arizonaHour(now) < 19) return null;
  const obligation = weeklyReportingObligations(performance, user.id, today)[0];
  if (!obligation || obligation.overdue) return null;
  return {
    id: `weekly-sunday-reminder:${user.id}:${obligation.weekStart}`,
    recipientUserId: user.id,
    title: "Weekly summary reminder",
    detail: "Your weekly report is due tomorrow. Submit the summary and next week's goals before Monday closes.",
    importance: "reminder",
    targetPage: "reportingCenter",
  };
}

export function orderMilestoneIntents(data: WorkspaceData, user: WorkspaceUser): NotificationIntent[] {
  const intents: NotificationIntent[] = [];
  for (const order of data.orders) {
    const ownsOrder = order.ownerId === user.id || order.creditedRepId === user.id;
    const customerOrder = user.role === "Customer" && (user.accountIds ?? []).includes(order.accountId);
    if (!ownsOrder && !customerOrder) continue;

    if (order.status === "Approved" && customerOrder) {
      intents.push({ id:`order-confirmed:${order.id}`, recipientUserId:user.id, title:"Order confirmed", detail:`${order.number} has been confirmed and is moving into fulfillment.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
    }
    if (order.status === "Out for delivery" && customerOrder) {
      intents.push({ id:`order-out-for-delivery:${order.id}`, recipientUserId:user.id, title:"Order out for delivery", detail:`${order.number} is on the way.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
    }
    if (["Delivered","Paid"].includes(order.status)) {
      if (customerOrder) intents.push({ id:`order-delivered-customer:${order.id}`, recipientUserId:user.id, title:"Order delivered", detail:`${order.number} has been delivered. Your invoice is available with the order record.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
      if (ownsOrder) intents.push({ id:`order-delivered-rep:${order.id}`, recipientUserId:user.id, title:"Your order was delivered", detail:`${order.number} has been delivered to the customer.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
    }
  }
  return intents;
}
