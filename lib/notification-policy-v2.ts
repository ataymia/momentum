import { canManageUser } from "./access";
import type { AuditEvent } from "./audit-engine";
import { arizonaDateKey, arizonaHour } from "./date-time";
import type { CommerceState, Payment, Refund } from "./commerce-engine";
import type { DeliveryState } from "./delivery-engine";
import type { FinanceState } from "./finance-engine";
import type { MarketingState } from "./marketing-engine";
import { programPricingDaysRemaining } from "./notification-engine";
import { weeklyReportingObligations, type PerformanceState } from "./performance-engine";
import type { PageKey, WorkspaceData, WorkspaceUser } from "./types";

export type NotificationImportance = "critical" | "action" | "status" | "reminder";

export type NotificationIntent = {
  id: string;
  policyId: string;
  recipientUserId: string;
  title: string;
  detail: string;
  importance: NotificationImportance;
  targetPage?: PageKey;
  targetRecordId?: string;
  occurredAt?: string;
};

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const repOwnsOrder=(user:WorkspaceUser,order:{ownerId:string;creditedRepId?:string})=>
  user.role==="Sales Representative"&&(order.ownerId===user.id||order.creditedRepId===user.id);
const customerOwnsAccount=(user:WorkspaceUser,accountId:string)=>
  user.role==="Customer"&&(user.accountIds??[]).includes(accountId);

export function sundayWeeklyReminderIntent(
  performance: PerformanceState,
  user: WorkspaceUser,
  now = new Date(),
): NotificationIntent | null {
  if (!["Sales Representative","Sales Manager"].includes(user.role)) return null;
  const today = arizonaDateKey(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (weekday !== 0 || arizonaHour(now) < 19) return null;
  const obligation = weeklyReportingObligations(performance, user.id, today)[0];
  if (!obligation || obligation.overdue) return null;
  return {
    id: `weekly-sunday-reminder:${user.id}:${obligation.weekStart}`,
    policyId: user.role === "Sales Manager" ?
      "weekly.reminder.manager" :
      "weekly.reminder.rep",
    recipientUserId: user.id,
    title: "Weekly summary reminder",
    detail: "Your weekly report is due tomorrow. Submit the summary and next week's goals before Monday closes.",
    importance: "reminder",
    targetPage: "reportingCenter",
  };
}

/**
 * Order-level milestones only. Delivery and payment notifications are derived
 * from their own authoritative ledgers below instead of projected order status.
 */
export function orderMilestoneIntents(
  data: WorkspaceData,
  user: WorkspaceUser,
): NotificationIntent[] {
  const intents: NotificationIntent[] = [];
  for (const order of data.orders) {
    const repOrder=repOwnsOrder(user,order);
    const customerOrder=customerOwnsAccount(user,order.accountId);
    if (!repOrder && !customerOrder) continue;

    const approvalHistory=data.approvals
      .filter((approval)=>approval.recordId===order.id&&
        ["Order","Low stock sale"].includes(approval.type));
    const approvedEvidence=approvalHistory
      .filter((approval)=>approval.status==="Approved")
      .sort((a,b)=>(b.decidedAt??b.submittedAt).localeCompare(a.decidedAt??a.submittedAt))[0];
    const confirmed=Boolean(approvedEvidence)&&!["Draft","Awaiting approval"].includes(order.status);

    if (confirmed && customerOrder) {
      intents.push({
        id:`order-confirmed:${order.id}`,
        policyId:"order.confirmed.customer",
        recipientUserId:user.id,
        title:"Order confirmed",
        detail:`${order.number} has been confirmed and is moving into fulfillment.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:approvedEvidence?.decidedAt,
      });
    }
    if (confirmed && repOrder) {
      intents.push({
        id:`order-approved-rep:${order.id}`,
        policyId:"order.approved.rep",
        recipientUserId:user.id,
        title:"Order approved",
        detail:`${order.number} has been approved.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:approvedEvidence?.decidedAt,
      });
    }
    if (order.status === "Cancelled" && approvedEvidence) {
      if (customerOrder) {
        intents.push({
          id:`order-cancelled-customer:${order.id}`,
          policyId:"order.cancelled.customer",
          recipientUserId:user.id,
          title:"Order cancelled",
          detail:`${order.number} has been cancelled${order.cancellationReason?`: ${order.cancellationReason}`:"."}`,
          importance:"status",
          targetPage:"orders",
          targetRecordId:order.id,
          occurredAt:order.cancelledAt,
        });
      }
      if (repOrder) {
        intents.push({
          id:`order-cancelled-rep:${order.id}`,
          policyId:"order.cancelled.rep",
          recipientUserId:user.id,
          title:"Order cancelled",
          detail:`${order.number} has been cancelled${order.cancellationReason?`: ${order.cancellationReason}`:"."}`,
          importance:"status",
          targetPage:"orders",
          targetRecordId:order.id,
          occurredAt:order.cancelledAt,
        });
      }
    }
  }
  return intents;
}

export function deliveryMilestoneIntents(
  data: WorkspaceData,
  delivery: DeliveryState,
  user: WorkspaceUser,
): NotificationIntent[] {
  const intents:NotificationIntent[]=[];
  for(const order of data.orders){
    const repOrder=repOwnsOrder(user,order);
    const customerOrder=customerOwnsAccount(user,order.accountId);
    if(!repOrder&&!customerOrder)continue;

    const task=delivery.tasks.find((item)=>item.orderId===order.id&&item.status!=="Cancelled");
    const override=delivery.overrides?.find((item)=>item.orderId===order.id);

    if(task&&task.status!=="Cancelled"&&task.departedAt){
      if(customerOrder)intents.push({
        id:`order-out-for-delivery:${order.id}`,
        policyId:"delivery.out_for_delivery.customer",
        recipientUserId:user.id,
        title:"Order out for delivery",
        detail:`${order.number} is on the way.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:task.departedAt,
      });
      if(repOrder)intents.push({
        id:`order-out-for-delivery-rep:${order.id}`,
        policyId:"delivery.out_for_delivery.rep",
        recipientUserId:user.id,
        title:"Order out for delivery",
        detail:`${order.number} is on the way to the customer.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:task.departedAt,
      });
    }

    const deliveredAt=override?.deliveredAt??(task?.status==="Delivered"?task.deliveredAt:undefined);
    if(deliveredAt){
      if(customerOrder)intents.push({
        id:`order-delivered-customer:${order.id}`,
        policyId:"delivery.delivered.customer",
        recipientUserId:user.id,
        title:"Order delivered",
        detail:`${order.number} has been delivered. Your invoice is available with the order record.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:deliveredAt,
      });
      if(repOrder)intents.push({
        id:`order-delivered-rep:${order.id}`,
        policyId:"delivery.delivered.rep",
        recipientUserId:user.id,
        title:"Your order was delivered",
        detail:`${order.number} has been delivered to the customer.`,
        importance:"status",
        targetPage:"orders",
        targetRecordId:order.id,
        occurredAt:deliveredAt,
      });
    }
  }
  return intents;
}

function paymentOrder(
  data:WorkspaceData,
  commerce:CommerceState,
  paymentId:string,
){
  const allocation=commerce.allocations.find((item)=>item.paymentId===paymentId);
  const invoice=allocation?
    commerce.invoices.find((item)=>item.id===allocation.invoiceId):
    undefined;
  const order=invoice?data.orders.find((item)=>item.id===invoice.orderId):undefined;
  return{allocation,invoice,order};
}

function paymentDetail(
  label:string,
  payment:Pick<Payment,"amount">,
  orderNumber?:string,
){
  return `${label} ${money(payment.amount)}${orderNumber?` for ${orderNumber}`:""}.`;
}

function refundOrder(
  data:WorkspaceData,
  commerce:CommerceState,
  refund:Refund,
){
  return paymentOrder(data,commerce,refund.paymentId);
}

export function commerceNotificationIntents(
  data:WorkspaceData,
  commerce:CommerceState,
  user:WorkspaceUser,
):NotificationIntent[]{
  const intents:NotificationIntent[]=[];

  for(const payment of commerce.payments){
    if(payment.settledBy==="system")continue;
    const{order}=paymentOrder(data,commerce,payment.id);
    const customer=customerOwnsAccount(user,payment.accountId);
    const rep=Boolean(order&&repOwnsOrder(user,order));

    if(["Cleared","Reversed"].includes(payment.status)&&payment.settledAt){
      if(customer)intents.push({
        id:`payment-received:${payment.id}`,
        policyId:"payment.received.customer",
        recipientUserId:user.id,
        title:"Payment received",
        detail:paymentDetail("We received",payment,order?.number),
        importance:"status",
        targetPage:"orders",
        targetRecordId:order?.id,
        occurredAt:payment.settledAt,
      });
      if(rep)intents.push({
        id:`payment-received-rep:${payment.id}`,
        policyId:"payment.received.rep",
        recipientUserId:user.id,
        title:"Customer payment received",
        detail:paymentDetail("Payment received:",payment,order?.number),
        importance:"status",
        targetPage:"orders",
        targetRecordId:order?.id,
        occurredAt:payment.settledAt,
      });
    }

    if(payment.status==="Failed"&&payment.failedAt&&customer){
      intents.push({
        id:`payment-failed:${payment.id}`,
        policyId:"payment.failed.customer",
        recipientUserId:user.id,
        title:"Payment failed",
        detail:`A ${money(payment.amount)} payment${order?` for ${order.number}`:""} was not completed. Please review your payment method before trying again.`,
        importance:"action",
        targetPage:"orders",
        targetRecordId:order?.id,
        occurredAt:payment.failedAt,
      });
    }

    if(payment.status==="Reversed"&&payment.reversedAt){
      if(customer)intents.push({
        id:`payment-reversed-customer:${payment.id}`,
        policyId:"payment.refunded.customer",
        recipientUserId:user.id,
        title:"Payment refunded",
        detail:paymentDetail("A payment was reversed/refunded:",payment,order?.number),
        importance:"status",
        targetPage:"orders",
        targetRecordId:order?.id,
        occurredAt:payment.reversedAt,
      });
      if(rep)intents.push({
        id:`payment-reversed-rep:${payment.id}`,
        policyId:"payment.refunded.rep",
        recipientUserId:user.id,
        title:"Customer payment refunded",
        detail:paymentDetail("A customer payment was reversed/refunded:",payment,order?.number),
        importance:"status",
        targetPage:"orders",
        targetRecordId:order?.id,
        occurredAt:payment.reversedAt,
      });
    }
  }

  for(const refund of commerce.refunds.filter((item)=>item.status==="Settled"&&item.settledAt)){
    const payment=commerce.payments.find((item)=>item.id===refund.paymentId);
    if(!payment)continue;
    const{order}=refundOrder(data,commerce,refund);
    const customer=customerOwnsAccount(user,payment.accountId);
    const rep=Boolean(order&&repOwnsOrder(user,order));
    if(customer)intents.push({
      id:`refund-settled-customer:${refund.id}`,
      policyId:"payment.refunded.customer",
      recipientUserId:user.id,
      title:"Payment refunded",
      detail:`A ${money(refund.amount)} refund${order?` for ${order.number}`:""} has been completed.`,
      importance:"status",
      targetPage:"orders",
      targetRecordId:order?.id,
      occurredAt:refund.settledAt,
    });
    if(rep)intents.push({
      id:`refund-settled-rep:${refund.id}`,
      policyId:"payment.refunded.rep",
      recipientUserId:user.id,
      title:"Customer payment refunded",
      detail:`A ${money(refund.amount)} refund${order?` for ${order.number}`:""} has been completed.`,
      importance:"status",
      targetPage:"orders",
      targetRecordId:order?.id,
      occurredAt:refund.settledAt,
    });
  }
  return intents;
}

export function pricingNotificationIntents(
  data:WorkspaceData,
  user:WorkspaceUser,
  asOf=arizonaDateKey(),
):NotificationIntent[]{
  const intents:NotificationIntent[]=[];
  for(const account of data.accounts){
    const customer=customerOwnsAccount(user,account.id);
    const rep=user.role==="Sales Representative"&&[
      account.ownerId,
      account.accountManagerId,
      account.programPricingOwnerId,
    ].filter(Boolean).includes(user.id);
    if(!customer&&!rep)continue;

    const days=programPricingDaysRemaining(account,asOf);
    if(customer&&days!==undefined&&days>=0&&days<=30){
      intents.push({
        id:`program-pricing-expiry-customer:${account.id}:${account.programPricingExpirationDate}`,
        policyId:"program_pricing.expiring_30d.customer",
        recipientUserId:user.id,
        title:`Program pricing expires in ${days} day${days===1?"":"s"}`,
        detail:`${account.locationName??account.name}${account.programPricingLabel?` · ${account.programPricingLabel}`:""} expires ${account.programPricingExpirationDate}.`,
        importance:"reminder",
        targetPage:"accounts",
        targetRecordId:account.id,
      });
    }

    if(account.programPricingStatus==="Expired"){
      intents.push({
        id:`program-pricing-expired:${account.id}:${account.programPricingExpirationDate??"no-date"}:${user.id}`,
        policyId:"program_pricing.expired",
        recipientUserId:user.id,
        title:"Program pricing expired",
        detail:`${account.locationName??account.name}${account.programPricingLabel?` · ${account.programPricingLabel}`:""} is no longer on active program pricing.`,
        importance:"status",
        targetPage:"accounts",
        targetRecordId:account.id,
      });
    }
  }
  return intents;
}

export function expenseStatusIntents(
  finance: FinanceState,
  user: WorkspaceUser,
): NotificationIntent[] {
  return finance.expenses
    .filter((expense) =>
      expense.requesterId === user.id &&
      expense.status === "Finance approved")
    .map((expense) => ({
      id: `expense-approved:${expense.id}`,
      policyId: "expense.finance_approved",
      recipientUserId: user.id,
      title: "Expense approved",
      detail: `${expense.merchant} · $${expense.amount.toFixed(2)} has been approved for reimbursement.`,
      importance: "status" as const,
      targetPage: "finance" as const,
      targetRecordId: expense.id,
    }));
}

export function marketingStatusIntents(
  marketing:MarketingState,
  user:WorkspaceUser,
):NotificationIntent[]{
  return marketing.requests
    .filter((request)=>request.requesterId===user.id&&
      ["Approved","Returned"].includes(request.status))
    .map((request)=>({
      id:`marketing-request-${request.status.toLowerCase()}:${request.id}`,
      policyId:request.status==="Approved"?
        "marketing.request_approved":
        "marketing.request_returned",
      recipientUserId:user.id,
      title:request.status==="Approved"?
        "Marketing request approved":
        "Marketing request returned",
      detail:request.status==="Returned"?
        `${request.title} needs correction.`:
        `${request.title} has been approved.`,
      importance:request.status==="Returned"?"action" as const:"status" as const,
      targetPage:"marketing" as const,
      targetRecordId:request.id,
      occurredAt:request.decidedAt,
    }));
}


export function prospectOwnershipReleasedIntents(
  data:WorkspaceData,
  auditEvents:AuditEvent[],
  user:WorkspaceUser,
):NotificationIntent[]{
  const intents:NotificationIntent[]=[];
  for(const event of auditEvents){
    if(event.module!=="Workspace"||event.collection!=="accounts"||event.action!=="Updated")continue;
    const ownerChange=event.changes.find((change)=>change.field==="ownerId");
    const previousOwnerId=ownerChange?.before?.trim();
    const nextOwnerId=ownerChange?.after?.trim();
    if(!previousOwnerId||nextOwnerId)continue;

    const account=data.accounts.find((item)=>item.id===event.entityId);
    if(!account||account.stage!=="Prospect")continue;

    const recipient=
      user.id===previousOwnerId||
      (user.role==="Sales Manager"&&canManageUser(data,user,previousOwnerId,false));
    if(!recipient)continue;

    const lastActivity=event.changes.find((change)=>change.field==="lastActivity")?.after??"";
    const reason=lastActivity.startsWith("Prospect released: ")?
      lastActivity.slice("Prospect released: ".length).trim():
      "";
    intents.push({
      id:`prospect-ownership-released:${event.id}:${user.id}`,
      policyId:"crm.prospect_ownership_released",
      recipientUserId:user.id,
      title:"Prospect ownership released",
      detail:`${account.locationName??account.name} returned to the unassigned prospect pool${reason?`: ${reason}`:"."}`,
      importance:"status",
      targetPage:"accounts",
      targetRecordId:account.id,
      occurredAt:event.at,
    });
  }
  return intents;
}
