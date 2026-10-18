import type { PageKey } from "./types";

export type NotificationPolicyChannel = {
  actionCenter: boolean;
  bell: boolean;
  email: boolean;
  sms: false;
};

export type NotificationPolicyEntry = {
  id: string;
  title: string;
  category:
    | "Approvals"
    | "Orders"
    | "Delivery"
    | "Payments"
    | "Pricing"
    | "Performance"
    | "Expenses"
    | "HR"
    | "Marketing"
    | "Inventory"
    | "CRM"
    | "System";
  recipientStrategy: string;
  sourceOfTruth: string;
  channels: NotificationPolicyChannel;
  targetPage?: PageKey;
  templateKey?: string;
  attachmentPolicy?: string;
  dedupeRule: string;
  notes?: string;
  emailRateLimit?: {
    cooldownMinutes: number;
    maxEmails: number;
    rollingWindowHours: number;
    scope: string;
  };
};

const channels = (
  actionCenter: boolean,
  bell: boolean,
  email: boolean,
): NotificationPolicyChannel => ({
  actionCenter,
  bell,
  email,
  sms: false,
});

export const NOTIFICATION_POLICY_V1: readonly NotificationPolicyEntry[] = [
  {
    id: "workflow.approval_required",
    title: "Approval required",
    category: "Approvals",
    recipientStrategy: "Authorized reviewer(s)",
    sourceOfTruth: "Persisted workflow/approval state requiring an authorized decision",
    channels: channels(true, true, false),
    targetPage: "work",
    dedupeRule: "One active item per approval record/version until resolved.",
    notes: "Internal non-order approvals remain in-app only.",
  },
  {
    id: "workflow.returned_for_correction",
    title: "Item returned for correction",
    category: "Approvals",
    recipientStrategy: "Original requester",
    sourceOfTruth: "Persisted non-order workflow/approval transition into Returned",
    channels: channels(true, true, false),
    targetPage: "work",
    dedupeRule: "One active item per returned transition/version.",
  },
  {
    id: "order.submitted_for_approval",
    title: "Order approval required",
    category: "Orders",
    recipientStrategy: "Authorized order approver(s)",
    sourceOfTruth: "Persisted order/approval transition into pending approval",
    channels: channels(true, true, false),
    targetPage: "work",
    dedupeRule: "One notification per approval record/version.",
    notes: "Submission is not customer confirmation.",
  },
  {
    id: "order.returned_for_correction",
    title: "Order returned for correction",
    category: "Orders",
    recipientStrategy: "Requesting/credited sales representative",
    sourceOfTruth: "Persisted approval/order transition into Returned",
    channels: channels(true, true, true),
    targetPage: "orders",
    templateKey: "order-returned-v1",
    dedupeRule: "One email per returned transition/version.",
  },
  {
    id: "order.confirmed.customer",
    title: "Order confirmed",
    category: "Orders",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Administrator-approved order transition into Approved",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "customer-order-confirmed-v1",
    dedupeRule: "One customer notification per approved order/version.",
    notes: "Confirmed means Administrator approved, not rep submitted.",
  },
  {
    id: "order.approved.rep",
    title: "Order approved",
    category: "Orders",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Administrator-approved order transition into Approved",
    channels: channels(false, true, false),
    targetPage: "orders",
    dedupeRule: "One in-app notice per approved order/version.",
  },
  {
    id: "order.cancelled.customer",
    title: "Order cancelled",
    category: "Orders",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Previously confirmed order transitions into Cancelled",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "customer-order-cancelled-v1",
    dedupeRule: "Only one notice per cancellation version; no customer notice for never-confirmed orders.",
  },
  {
    id: "order.cancelled.rep",
    title: "Order cancelled",
    category: "Orders",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Previously confirmed order transitions into Cancelled",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "rep-order-cancelled-v1",
    dedupeRule: "One notice per cancellation version.",
  },
  {
    id: "delivery.assigned",
    title: "Delivery assigned",
    category: "Delivery",
    recipientStrategy: "Assigned delivery driver",
    sourceOfTruth: "Persisted delivery assignment",
    channels: channels(true, true, false),
    targetPage: "orders",
    dedupeRule: "One notice per assignment version/driver.",
  },
  {
    id: "delivery.out_for_delivery.customer",
    title: "Order out for delivery",
    category: "Delivery",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Persisted delivery task transitions into In transit",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "customer-order-out-for-delivery-v1",
    dedupeRule: "One customer notice per in-transit transition.",
  },
  {
    id: "delivery.out_for_delivery.rep",
    title: "Order out for delivery",
    category: "Delivery",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Persisted delivery task transitions into In transit",
    channels: channels(false, true, false),
    targetPage: "orders",
    dedupeRule: "One in-app notice per in-transit transition.",
  },
  {
    id: "delivery.delivered.customer",
    title: "Order delivered",
    category: "Delivery",
    recipientStrategy: "Customer billing email for invoice; customer portal identity for bell",
    sourceOfTruth: "Signed delivery completion or authorized Administrator delivery override",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "customer-order-delivered-invoice-v1",
    attachmentPolicy: "Attach signed/live invoice PDF. Billing email only. No fallback for invoice recipient.",
    dedupeRule: "Exactly one delivery email per completed delivery/override version.",
    notes: "Invoice becomes live at delivery. Delivery-only invoice policy.",
  },
  {
    id: "delivery.delivered.rep",
    title: "Order delivered",
    category: "Delivery",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Signed delivery completion or authorized Administrator delivery override",
    channels: channels(false, true, false),
    targetPage: "orders",
    dedupeRule: "One in-app notice per completed delivery.",
  },
  {
    id: "payment.received.customer",
    title: "Payment received",
    category: "Payments",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Persisted cleared/confirmed payment",
    channels: channels(false, true, true),
    targetPage: "orderCash",
    templateKey: "customer-payment-received-v1",
    dedupeRule: "One confirmation per cleared payment record.",
  },
  {
    id: "payment.received.rep",
    title: "Customer payment received",
    category: "Payments",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Persisted cleared/confirmed payment",
    channels: channels(false, true, false),
    targetPage: "orders",
    dedupeRule: "One in-app notice per cleared payment record.",
  },
  {
    id: "payment.failed.customer",
    title: "Payment failed",
    category: "Payments",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Persisted payment attempt transitions into Failed",
    channels: channels(false, true, true),
    targetPage: "orderCash",
    templateKey: "customer-payment-failed-v1",
    dedupeRule: "Suppress repeated failure emails using the policy rate limit below.",
    emailRateLimit: {
      cooldownMinutes: 30,
      maxEmails: 2,
      rollingWindowHours: 24,
      scope: "customer account + recipient email",
    },
    notes: "At most one failed-payment email every 30 minutes and no more than two in any rolling 24-hour window for the same customer account and recipient email.",
  },
  {
    id: "payment.refunded.customer",
    title: "Payment refunded",
    category: "Payments",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Persisted refund/reversal reaches the approved final customer-facing state",
    channels: channels(false, true, true),
    targetPage: "orderCash",
    templateKey: "customer-payment-refunded-v1",
    dedupeRule: "One customer notice per refund/reversal record/version.",
  },
  {
    id: "payment.refunded.rep",
    title: "Customer payment refunded",
    category: "Payments",
    recipientStrategy: "Owning/credited sales representative",
    sourceOfTruth: "Persisted refund/reversal reaches the approved final customer-facing state",
    channels: channels(false, true, true),
    targetPage: "orders",
    templateKey: "rep-payment-refunded-v1",
    dedupeRule: "One rep notice per refund/reversal record/version.",
  },
  {
    id: "program_pricing.expiring_30d.customer",
    title: "Program pricing expires in 30 days",
    category: "Pricing",
    recipientStrategy: "Customer account status recipient",
    sourceOfTruth: "Active approved program pricing reaches 30-day warning window",
    channels: channels(false, true, true),
    targetPage: "accounts",
    templateKey: "customer-pricing-30-day-v1",
    dedupeRule: "One warning per account/program/version.",
  },
  {
    id: "program_pricing.expiring_30d.rep",
    title: "Account pricing expires in 30 days",
    category: "Pricing",
    recipientStrategy: "Account sales representative",
    sourceOfTruth: "Active approved program pricing reaches 30-day warning window",
    channels: channels(true, true, true),
    targetPage: "accounts",
    templateKey: "rep-pricing-30-day-v1",
    dedupeRule: "One warning per account/program/version.",
  },
  {
    id: "program_pricing.expired",
    title: "Program pricing expired",
    category: "Pricing",
    recipientStrategy: "Customer portal and account sales representative as applicable",
    sourceOfTruth: "Approved program pricing transitions to expired",
    channels: channels(false, true, false),
    targetPage: "accounts",
    dedupeRule: "One in-app notice per account/program/version.",
  },
  {
    id: "weekly.reminder.rep",
    title: "Weekly summary reminder",
    category: "Performance",
    recipientStrategy: "Active Sales Representative with an outstanding weekly report",
    sourceOfTruth: "Server schedule + current reporting obligation",
    channels: channels(true, true, true),
    targetPage: "reportingCenter",
    templateKey: "rep-weekly-summary-reminder-v1",
    dedupeRule: "One Sunday reminder per user/week.",
  },
  {
    id: "weekly.reminder.manager",
    title: "Weekly summary reminder",
    category: "Performance",
    recipientStrategy: "Active Sales Manager with their own outstanding weekly report",
    sourceOfTruth: "Server schedule + current reporting obligation",
    channels: channels(true, true, true),
    targetPage: "reportingCenter",
    templateKey: "manager-weekly-summary-reminder-v1",
    dedupeRule: "One Sunday reminder per user/week.",
  },
  {
    id: "weekly.delinquent.rep",
    title: "Weekly report overdue",
    category: "Performance",
    recipientStrategy: "Sales Representative whose report is delinquent",
    sourceOfTruth: "Current unresolved weekly reporting obligation past due date",
    channels: channels(true, true, false),
    targetPage: "reportingCenter",
    dedupeRule: "One active in-app item per user/week until resolved.",
  },
  {
    id: "weekly.delinquent.manager",
    title: "Rep weekly report overdue",
    category: "Performance",
    recipientStrategy: "Managing Sales Manager for delinquent rep",
    sourceOfTruth: "Managed rep has unresolved weekly reporting obligation past due date",
    channels: channels(true, true, false),
    targetPage: "reportingCenter",
    dedupeRule: "One active in-app item per rep/week/manager until resolved.",
  },
  {
    id: "expense.submitted",
    title: "Expense needs review",
    category: "Expenses",
    recipientStrategy: "Authorized expense reviewer",
    sourceOfTruth: "Expense transitions into Submitted",
    channels: channels(true, true, false),
    targetPage: "finance",
    dedupeRule: "One in-app item per submitted version.",
  },
  {
    id: "expense.returned",
    title: "Expense returned",
    category: "Expenses",
    recipientStrategy: "Expense requester",
    sourceOfTruth: "Expense transitions into Returned",
    channels: channels(true, true, false),
    targetPage: "finance",
    dedupeRule: "One in-app item per returned version.",
  },
  {
    id: "expense.manager_approved",
    title: "Expense manager approved",
    category: "Expenses",
    recipientStrategy: "Next authorized finance reviewer",
    sourceOfTruth: "Expense transitions into Manager approved",
    channels: channels(true, true, false),
    targetPage: "finance",
    dedupeRule: "One in-app item per approval version.",
  },
  {
    id: "expense.finance_approved",
    title: "Expense approved",
    category: "Expenses",
    recipientStrategy: "Expense requester and relevant internal workflow",
    sourceOfTruth: "Expense transitions into Finance approved",
    channels: channels(false, true, false),
    targetPage: "finance",
    dedupeRule: "One in-app item per approval version.",
  },
  {
    id: "hr.action_required",
    title: "HR action required",
    category: "HR",
    recipientStrategy: "Affected employee or authorized reviewer",
    sourceOfTruth: "Approved HCM workflow/task state requiring action",
    channels: channels(true, true, false),
    targetPage: "people",
    dedupeRule: "One active item per unresolved HR workflow/task version.",
    notes: "HR remains in-app only until department staffing/workflow expands.",
  },
  {
    id: "marketing.request_submitted",
    title: "Marketing request needs review",
    category: "Marketing",
    recipientStrategy: "Authorized marketing/admin reviewer",
    sourceOfTruth: "Marketing request transitions into Submitted",
    channels: channels(true, true, false),
    targetPage: "marketing",
    dedupeRule: "One active item per submitted request version.",
  },
  {
    id: "marketing.request_returned",
    title: "Marketing request returned",
    category: "Marketing",
    recipientStrategy: "Marketing request owner",
    sourceOfTruth: "Marketing request transitions into Returned",
    channels: channels(true, true, false),
    targetPage: "marketing",
    dedupeRule: "One in-app item per returned version.",
  },
  {
    id: "marketing.request_approved",
    title: "Marketing request approved",
    category: "Marketing",
    recipientStrategy: "Marketing request owner",
    sourceOfTruth: "Marketing request transitions into Approved",
    channels: channels(false, true, false),
    targetPage: "marketing",
    dedupeRule: "One in-app item per approved version.",
  },
  {
    id: "marketing.campaign_budget_approval",
    title: "Campaign budget needs approval",
    category: "Marketing",
    recipientStrategy: "Authorized Administrator",
    sourceOfTruth: "Campaign transitions into Awaiting approval",
    channels: channels(true, true, false),
    targetPage: "marketing",
    dedupeRule: "One active item per campaign approval version.",
  },
  {
    id: "inventory.reorder_threshold",
    title: "Inventory reorder threshold reached",
    category: "Inventory",
    recipientStrategy: "Active Administrators, Warehouse, and Operations",
    sourceOfTruth: "Trusted inventory ledger crosses approved reorder threshold",
    channels: channels(true, true, true),
    targetPage: "inventory",
    templateKey: "inventory-reorder-threshold-v1",
    dedupeRule: "One alert per product/threshold crossing until inventory recovers above reset level.",
  },
  {
    id: "inventory.low_stock_blocking_sale",
    title: "Low stock blocks sale",
    category: "Inventory",
    recipientStrategy: "Relevant authorized internal users",
    sourceOfTruth: "Inventory policy determines requested sale cannot proceed without approval",
    channels: channels(true, true, false),
    targetPage: "inventory",
    dedupeRule: "One active item per affected product/blocking condition.",
  },
  {
    id: "crm.prospect_ownership_released",
    title: "Prospect ownership released",
    category: "CRM",
    recipientStrategy: "Relevant sales rep/manager scope",
    sourceOfTruth: "Persisted prospect ownership release transition",
    channels: channels(false, true, false),
    targetPage: "accounts",
    dedupeRule: "One in-app notice per ownership release transition.",
  },
  {
    id: "system.email_bounced",
    title: "Customer email bounced",
    category: "System",
    recipientStrategy: "Administrator",
    sourceOfTruth: "Verified Resend webhook reports bounce",
    channels: channels(false, true, false),
    targetPage: "work",
    dedupeRule: "One active exception per provider message/recipient until resolved.",
  },
  {
    id: "system.email_failed",
    title: "Customer email send failed",
    category: "System",
    recipientStrategy: "Administrator",
    sourceOfTruth: "Verified transport/provider failure",
    channels: channels(false, true, false),
    targetPage: "work",
    dedupeRule: "One active exception per notification/provider message until resolved.",
  },
  {
    id: "system.backend_error_unresolved",
    title: "Platform error needs attention",
    category: "System",
    recipientStrategy: "Administrator",
    sourceOfTruth: "Backend/sync/storage error remains unresolved after automatic retry/recovery policy",
    channels: channels(true, true, false),
    targetPage: "work",
    dedupeRule: "One active exception per failure fingerprint until resolved.",
  },
] as const;

export const EXCLUDED_NOTIFICATION_EVENTS = {
  "order.edited": "Audit only.",
  "delivery.packed": "No notification.",
  "delivery.failed": "Not part of Momentum's delivery model.",
  "invoice.issued": "Delivery-only invoice policy; no standalone invoice notification.",
  "invoice.overdue": "No standalone invoice notification under current policy.",
  "weekly.submitted": "Normal work, no notification.",
  "timekeeping.any": "Shelved until timekeeping workflow is defined.",
  "expense.reimbursement_ready": "Handled in-house without notification.",
  "expense.reimbursement_paid": "Handled in-house without notification.",
  "training.any": "Training notifications disabled for current operating model.",
  "inventory.movement": "Audit only.",
  "dispatch.unassigned": "Unclaimed workflow will handle this later.",
  "dispatch.former_employee_appointment": "Appointments leave active workflow on separation; no reassignment alert.",
  "appointment.rescheduled": "No notification.",
  "appointment.completed": "No notification.",
  "crm.account_reassigned": "Existing workflow is sufficient.",
  "crm.normal_activity": "Audit only.",
  "accounting.event_ready": "No notification.",
  "accounting.policy_blocked": "No notification under current staffing model.",
  "system.email_delivered": "Delivery log only.",
  "system.sync_success": "Log only.",
} as const;

export function notificationPolicyById(id: string) {
  return NOTIFICATION_POLICY_V1.find((entry) => entry.id === id);
}

export function notificationEmailEnabled(id: string) {
  return notificationPolicyById(id)?.channels.email === true;
}

export function notificationActionCenterEnabled(id: string) {
  return notificationPolicyById(id)?.channels.actionCenter === true;
}

export function notificationBellEnabled(id: string) {
  return notificationPolicyById(id)?.channels.bell === true;
}
