import { arizonaDateKey, arizonaHour } from "./date-time";
import type { FinanceState } from "./finance-engine";
import { weeklyReportingObligations, type PerformanceState } from "./performance-engine";
import type { WorkspaceData, WorkspaceUser } from "./types";

export type NotificationImportance = "critical" | "action" | "status" | "reminder";

export type NotificationIntent = {
  id: string;
  recipientUserId: string;
  title: string;
  detail: string;
  importance: NotificationImportance;
  targetPage?: "orders" | "reportingCenter" | "people" | "work" | "finance";
  targetRecordId?: string;
};

export function sundayWeeklyReminderIntent(performance: PerformanceState, user: WorkspaceUser, now = new Date()): NotificationIntent | null {
  if (!["Sales Representative","Sales Manager"].includes(user.role)) return null;
  const today = arizonaDateKey(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
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
    if (order.status === "Delivered") {
      if (customerOrder) intents.push({ id:`order-delivered-customer:${order.id}`, recipientUserId:user.id, title:"Order delivered", detail:`${order.number} has been delivered. Your invoice is available with the order record.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
      if (ownsOrder) intents.push({ id:`order-delivered-rep:${order.id}`, recipientUserId:user.id, title:"Your order was delivered", detail:`${order.number} has been delivered to the customer.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
    }
    if (order.paymentStatus === "Paid" && customerOrder) {
      intents.push({ id:`payment-received:${order.id}`, recipientUserId:user.id, title:"Payment received", detail:`Payment for ${order.number} has been received and recorded.`, importance:"status", targetPage:"orders", targetRecordId:order.id });
    }
  }
  return intents;
}


export function expenseStatusIntents(finance: FinanceState, user: WorkspaceUser): NotificationIntent[] {
  return finance.expenses
    .filter((expense) => expense.requesterId === user.id && expense.status === "Finance approved")
    .map((expense) => ({
      id: `expense-approved:${expense.id}`,
      recipientUserId: user.id,
      title: "Expense approved",
      detail: `${expense.merchant} · $${expense.amount.toFixed(2)} has been approved for reimbursement.`,
      importance: "status" as const,
      targetPage: "finance" as const,
      targetRecordId: expense.id,
    }));
}

/** Keep accounting-policy work visible in My Work/Finance without creating one bell alert per historical event. */
export function shouldShowActionNotification(action:{category:string;title:string}):boolean{
  return !(action.category==="Accounting"&&action.title==="Accounting policy required");
}
