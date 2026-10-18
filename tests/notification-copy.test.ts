import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuditEvent } from "../lib/audit-engine";
import { createDemoData } from "../lib/demo-data";
import { notificationCopy } from "../lib/notification-engine";
import { EXCLUDED_NOTIFICATION_EVENTS, notificationBellEnabled } from "../lib/notification-policy-registry";
import { commerceNotificationIntents, deliveryMilestoneIntents, orderMilestoneIntents, pricingNotificationIntents, prospectOwnershipReleasedIntents, sundayWeeklyReminderIntent } from "../lib/notification-policy-v2";
import { customerInvoiceEmail, customerStatusEmail, outboundEmailDecision } from "../lib/outbound-notification-policy";
import { createPerformanceSeed } from "../lib/performance-engine";

const data = createDemoData();

const baseEvent: AuditEvent = {
  id: "audit-test-1",
  at: "2026-09-15T19:00:00.000Z",
  actorId: "usr-mia",
  actorRole: "Administrator",
  action: "Updated",
  module: "Workspace",
  collection: "appointments",
  entityType: "Workspace.appointments",
  entityId: "appointment-technical-id-123456",
  label: "appointment-technical-id-123456",
  summary: "appointment-technical-id-123456 updated: startTime",
  sensitivity: "operational",
  relatedAccountId: "acc-101",
  changes: [{ field: "startTime", before: "13:00", after: "14:00" }, { field: "updatedBy", after: "usr-mia" }],
};

test("appointment notifications use business language and human time", () => {
  const copy = notificationCopy(baseEvent, data);
  assert.equal(copy.title, "Director updated appointment for Desert Lantern Market");
  assert.equal(copy.detail, "Appointment time changed from 1:00 PM to 2:00 PM.");
  assert.ok(!copy.title.includes("appointment-technical-id"));
  assert.ok(!copy.detail.includes("startTime"));
});

test("user ids in audit changes resolve to employee names", () => {
  const copy = notificationCopy({
    ...baseEvent,
    collection: "accounts",
    entityType: "Workspace.accounts",
    entityId: "acc-101",
    label: "Desert Lantern Market",
    changes: [{ field: "ownerId", before: "usr-jordan", after: "usr-avery" }],
  }, data);
  assert.match(copy.detail, /Sales Rep Demo/);
  assert.match(copy.detail, /Sales Manager Demo/);
  assert.ok(!copy.detail.includes("usr-jordan"));
  assert.ok(!copy.detail.includes("usr-avery"));
});

test("created and deleted records stay readable when there are no useful field changes", () => {
  const created = notificationCopy({ ...baseEvent, action: "Created", changes: [] }, data);
  const deleted = notificationCopy({ ...baseEvent, action: "Deleted", changes: [] }, data);
  assert.equal(created.detail, "A new appointment was added to Momentum.");
  assert.equal(deleted.detail, "The appointment was removed from Momentum.");
});


test("known employee actors resolve by directory identity even when the changed fields do not repeat the actor id", () => {
  const copy = notificationCopy({
    ...baseEvent,
    changes: [{ field: "startTime", before: "13:00", after: "14:00" }],
  }, data);
  assert.match(copy.title, /^Director updated appointment/);
  assert.doesNotMatch(copy.title, /team member/i);
  assert.doesNotMatch(copy.title, /unknown user/i);
});

test("system generated audit events name Momentum instead of a generic team member", () => {
  const copy = notificationCopy({
    ...baseEvent,
    actorId: "system",
    actorRole: "Administrator",
    changes: [{ field: "status", before: "Draft", after: "Approved" }],
  }, data);
  assert.match(copy.title, /^Momentum updated appointment/);
  assert.doesNotMatch(copy.title, /team member/i);
});


test("unified bell no longer mounts the legacy notification generator", () => {
  const source = readFileSync("lib/notification-context-v3.tsx", "utf8");
  const settings = readFileSync("components/settings/platform-controls.tsx", "utf8");
  assert.doesNotMatch(source, /notification-context-v2/);
  assert.doesNotMatch(source, /LegacyNotificationProvider/);
  assert.match(source, /notificationBellEnabled/);
  assert.doesNotMatch(settings, /setEscalationHours/);
  assert.doesNotMatch(settings, /updatePreference/);
  assert.doesNotMatch(settings, /> SMS</);
  assert.match(settings, /Canonical policy active/);
});


test("customer notification policy uses order approval plus authoritative delivery state", () => {
  const customer = data.users.find((user) => user.role === "Customer")!;
  const baseOrder = {
    id: "order-notification-test",
    number: "GE-NOTIFY-1",
    accountId: "acc-101",
    cases: 10,
    pricePerCase: 24,
    amount: 240,
    status: "Approved" as const,
    placedAt: "2026-10-12",
    ownerId: "usr-jordan",
    creditedRepId: "usr-jordan",
    priceBasis: "Tier A",
    paymentStatus: "Open" as const,
  };
  const approval = {
    id: "approval-notification-test",
    type: "Order" as const,
    title: "Review GE-NOTIFY-1",
    detail: "10 cases",
    requestedBy: "Sales Rep Demo",
    requesterId: "usr-jordan",
    recordId: baseOrder.id,
    team: "Sales" as const,
    submittedAt: "2026-10-12T16:00:00.000Z",
    dueAt: "2026-10-13T16:00:00.000Z",
    priority: "High" as const,
    status: "Approved" as const,
    decidedBy: "usr-mia",
    decidedAt: "2026-10-12T16:30:00.000Z",
  };
  const confirmed = { ...data, orders: [baseOrder], approvals: [approval] };
  assert.equal(orderMilestoneIntents(confirmed, customer).some((item) => item.title === "Order confirmed"), true);

  const outboundState = {
    version: 1 as const,
    overrides: [],
    tasks: [{
      id: "delivery-notify-1",
      orderId: baseOrder.id,
      driverId: "driver-1",
      status: "In transit" as const,
      acceptedAt: "2026-10-12T17:00:00.000Z",
      acceptedBy: "usr-mia",
      loadedAt: "2026-10-12T18:00:00.000Z",
      departedAt: "2026-10-12T18:30:00.000Z",
      history: [],
    }],
  };
  assert.equal(deliveryMilestoneIntents(confirmed, outboundState, customer).some((item) => item.title === "Order out for delivery"), true);

  const deliveredState = {
    ...outboundState,
    tasks: [{
      ...outboundState.tasks[0],
      status: "Delivered" as const,
      deliveredAt: "2026-10-12T19:00:00.000Z",
    }],
  };
  assert.equal(deliveryMilestoneIntents(confirmed, deliveredState, customer).some((item) => item.title === "Order delivered"), true);
});

test("credited sales rep receives a delivered-order milestone from delivery evidence", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  const delivered = {
    ...data,
    orders: [{
      id: "order-rep-delivered",
      number: "GE-NOTIFY-2",
      accountId: "acc-101",
      cases: 10,
      pricePerCase: 24,
      amount: 240,
      status: "Delivered" as const,
      placedAt: "2026-10-12",
      ownerId: rep.id,
      creditedRepId: rep.id,
      priceBasis: "Tier A",
      paymentStatus: "Open" as const,
    }],
  };
  const delivery = {
    version: 1 as const,
    overrides: [],
    tasks: [{
      id: "delivery-rep-1",
      orderId: "order-rep-delivered",
      driverId: "driver-1",
      status: "Delivered" as const,
      acceptedAt: "2026-10-12T17:00:00.000Z",
      acceptedBy: "usr-mia",
      loadedAt: "2026-10-12T18:00:00.000Z",
      departedAt: "2026-10-12T18:30:00.000Z",
      deliveredAt: "2026-10-12T19:00:00.000Z",
      history: [],
    }],
  };
  assert.equal(deliveryMilestoneIntents(delivered, delivery, rep).some((item) => item.title === "Your order was delivered"), true);
});

test("Sunday weekly summary reminder does not appear before 7 PM Arizona time", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  const performance = createPerformanceSeed();
  assert.equal(sundayWeeklyReminderIntent(performance, rep, new Date("2026-10-11T18:59:00-07:00")), null);
  assert.equal(sundayWeeklyReminderIntent(performance, rep, new Date("2026-10-11T19:00:00-07:00"))?.title, "Weekly summary reminder");
});


test("outbound email policy follows canonical event and role rules", () => {
  const admin = data.users.find((user) => user.role === "Administrator")!;
  assert.equal(outboundEmailDecision(admin, "order.confirmed.customer").send, false);
  assert.equal(outboundEmailDecision(admin, "inventory.reorder_threshold").send, true);
  const operations = data.users.find((user) => user.role === "Operations");
  if (operations) assert.equal(outboundEmailDecision(operations, "inventory.reorder_threshold").send, true);
});

test("sales rep email policy includes only the approved external-interruption events", () => {
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  for (const policyId of [
    "order.returned_for_correction",
    "order.cancelled.rep",
    "payment.refunded.rep",
    "weekly.reminder.rep",
    "program_pricing.expiring_30d.rep",
  ]) assert.equal(outboundEmailDecision(rep, policyId).send, true);
  assert.equal(outboundEmailDecision(rep, "expense.returned").send, false);
  assert.equal(outboundEmailDecision(rep, "expense.finance_approved").send, false);
  assert.equal(outboundEmailDecision(rep, "weekly.delinquent.self").send, false);
  assert.equal(outboundEmailDecision(rep, "hr.action_required").send, false);
});

test("customer status email prefers accounts payable, while invoices require billing email", () => {
  const account = data.accounts.find((item) => item.id === "acc-101")!;
  const order = {
    id: "email-routing-order",
    number: "GE-EMAIL-1",
    accountId: account.id,
    cases: 10,
    pricePerCase: 24,
    amount: 240,
    status: "Approved" as const,
    placedAt: "2026-10-12",
    ownerId: "usr-jordan",
    priceBasis: "Tier A",
    paymentStatus: "Open" as const,
  };
  const customerId = account.customerId ?? "customer-email-test";
  const customer = {
    id: customerId,
    name: "Email Test Customer",
    accountType: "Independent" as const,
    billingEmail: "billing@example.com",
    accountsPayableEmail: "ap@example.com",
    createdAt: "2026-10-12T00:00:00.000Z",
  };
  const routed = {
    ...data,
    customers: [...(data.customers ?? []).filter((item) => item.id !== customerId), customer],
    accounts: data.accounts.map((item) => item.id === account.id ? { ...item, customerId } : item),
    orders: [order],
  };
  assert.equal(customerStatusEmail(routed, order.id), "ap@example.com");
  assert.equal(customerInvoiceEmail(routed, order.id), "billing@example.com");
});

test("projected Paid order status alone creates neither delivery nor payment notification",()=>{
  const customer=data.users.find(user=>user.role==="Customer")!;
  const order={...data.orders[0],accountId:customer.accountIds![0],status:"Paid" as const,paymentStatus:"Paid" as const};
  const scoped={...data,orders:[order]};
  const orderIntents=orderMilestoneIntents(scoped,customer);
  assert.equal(orderIntents.some(item=>item.id.startsWith("order-delivered")),false);
  assert.equal(orderIntents.some(item=>item.id.startsWith("payment-received")),false);

  const commerce={
    version:1 as const,
    invoices:[{id:"inv-paid",number:"INV-PAID",orderId:order.id,accountId:order.accountId,issuedAt:"2026-10-12T17:00:00.000Z",terms:"COD" as const,total:order.amount,status:"Paid" as const,createdAt:"2026-10-12T17:00:00.000Z"}],
    payments:[{id:"pay-paid",accountId:order.accountId,receivedAt:"2026-10-12T18:00:00.000Z",amount:order.amount,method:"ACH" as const,status:"Cleared" as const,createdBy:"usr-mia",createdAt:"2026-10-12T18:00:00.000Z",settledAt:"2026-10-12T18:00:00.000Z",settledBy:"usr-mia"}],
    allocations:[{id:"alloc-paid",paymentId:"pay-paid",invoiceId:"inv-paid",amount:order.amount,createdAt:"2026-10-12T18:00:00.000Z",createdBy:"usr-mia"}],
    credits:[],
    refunds:[],
    notes:[],
  };
  assert.equal(commerceNotificationIntents(scoped,commerce,customer).some(item=>item.id.startsWith("payment-received")),true);
});


test("confirmed cancellation notifies customer only when Administrator approval evidence exists",()=>{
  const customer=data.users.find(user=>user.role==="Customer")!;
  const accountId=customer.accountIds![0];
  const order={...data.orders[0],id:"cancel-notify-order",number:"GE-CANCEL-1",accountId,status:"Cancelled" as const,cancelledAt:"2026-10-17T18:00:00.000Z",cancelledBy:"usr-mia",cancellationReason:"Customer requested cancellation"};
  const approved={id:"cancel-notify-approval",type:"Order" as const,title:"Review",detail:"Order",requestedBy:"Rep",requesterId:order.ownerId,recordId:order.id,team:"Sales" as const,submittedAt:"2026-10-17T16:00:00.000Z",dueAt:"2026-10-18T16:00:00.000Z",priority:"High" as const,status:"Approved" as const,decidedBy:"usr-mia",decidedAt:"2026-10-17T17:00:00.000Z"};
  const withApproval={...data,orders:[order],approvals:[approved]};
  assert.equal(orderMilestoneIntents(withApproval,customer).some(item=>item.policyId==="order.cancelled.customer"),true);
  assert.equal(orderMilestoneIntents({...withApproval,approvals:[]},customer).some(item=>item.policyId==="order.cancelled.customer"),false);
});

test("failed payment creates customer in-app intent from the commerce ledger",()=>{
  const customer=data.users.find(user=>user.role==="Customer")!;
  const accountId=customer.accountIds![0];
  const order={...data.orders[0],id:"failed-pay-order",number:"GE-FAIL-1",accountId};
  const commerce={
    version:1 as const,
    invoices:[{id:"inv-fail",number:"INV-FAIL",orderId:order.id,accountId,issuedAt:"2026-10-17T17:00:00.000Z",terms:"COD" as const,total:order.amount,status:"Open" as const,createdAt:"2026-10-17T17:00:00.000Z"}],
    payments:[{id:"pay-fail",accountId,receivedAt:"2026-10-17T17:30:00.000Z",amount:order.amount,method:"Card" as const,status:"Failed" as const,createdBy:"usr-mia",createdAt:"2026-10-17T17:30:00.000Z",failedAt:"2026-10-17T17:31:00.000Z",failedBy:"usr-mia",failureReason:"Declined"}],
    allocations:[{id:"alloc-fail",paymentId:"pay-fail",invoiceId:"inv-fail",amount:order.amount,createdAt:"2026-10-17T17:30:00.000Z",createdBy:"usr-mia"}],
    credits:[],
    refunds:[],
    notes:[],
  };
  const intents=commerceNotificationIntents({...data,orders:[order]},commerce,customer);
  assert.equal(intents.some(item=>item.policyId==="payment.failed.customer"),true);
});

test("customer 30-day pricing warning is generated from active program pricing",()=>{
  const customer=data.users.find(user=>user.role==="Customer")!;
  const accountId=customer.accountIds![0];
  const accounts=data.accounts.map(account=>account.id===accountId?{
    ...account,
    programPricingStatus:"Active" as const,
    programPricingLabel:"Preferred Partner",
    programPricingExpirationDate:"2026-10-31",
  }:account);
  const intents=pricingNotificationIntents({...data,accounts},customer,"2026-10-01");
  assert.equal(intents.some(item=>item.policyId==="program_pricing.expiring_30d.customer"),true);
});



test("prospect ownership release bell uses the prior owner from audit provenance",()=>{
  const rep=data.users.find(user=>user.id==="usr-jordan")!;
  const account=data.accounts.find(item=>item.id==="acc-101")!;
  const releasedData={
    ...data,
    accounts:data.accounts.map(item=>item.id===account.id?{...item,stage:"Prospect" as const,ownerId:"",accountManagerId:"",lastActivity:"Prospect released: 5 unsuccessful visits"}:item),
  };
  const event:AuditEvent={
    id:"audit-prospect-release-1",
    at:"2026-10-17T23:00:00.000Z",
    actorId:"usr-mia",
    actorRole:"Administrator",
    action:"Updated",
    module:"Workspace",
    collection:"accounts",
    entityType:"Workspace.accounts",
    entityId:account.id,
    label:account.locationName??account.name,
    summary:"Prospect ownership released",
    sensitivity:"operational",
    relatedAccountId:account.id,
    changes:[
      {field:"ownerId",before:rep.id,after:""},
      {field:"accountManagerId",before:rep.id,after:""},
      {field:"lastActivity",before:account.lastActivity,after:"Prospect released: 5 unsuccessful visits"},
    ],
  };
  const repIntents=prospectOwnershipReleasedIntents(releasedData,[event],rep);
  assert.equal(repIntents.some(item=>item.policyId==="crm.prospect_ownership_released"),true);

  const unrelated=data.users.find(user=>user.role==="Administrator")!;
  assert.equal(prospectOwnershipReleasedIntents(releasedData,[event],unrelated).length,0);
});

test("separated representatives never qualify for outbound reminder email",()=>{
  const rep=data.users.find(user=>user.role==="Sales Representative")!;
  assert.equal(outboundEmailDecision({...rep,employmentStatus:"Separated"},"weekly.reminder.rep").send,false);
});


test("accounting notification noise is excluded while approved HR work stays in-app",()=>{
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["accounting.policy_blocked"],"No notification under current staffing model.");
  assert.equal(EXCLUDED_NOTIFICATION_EVENTS["accounting.event_ready"],"No notification.");
  assert.equal(notificationBellEnabled("hr.action_required"),true);
});
