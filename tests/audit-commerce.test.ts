import assert from "node:assert/strict";
import test from "node:test";
import { collectAuditableRecords, visibleAuditEvents, type AuditEvent } from "../lib/audit-engine";
import type { CommerceState } from "../lib/commerce-engine";
import { createDemoData } from "../lib/demo-data";
import type { WorkspaceUser } from "../lib/types";

const commerce: CommerceState = {
  version: 1,
  invoices: [{ id: "invoice-1", number: "INV-1", orderId: "ord-1", accountId: "acc-101", issuedAt: "2026-09-03", terms: "Prepaid", total: 240, status: "Open", createdAt: "2026-09-03" }],
  payments: [{ id: "payment-1", accountId: "acc-101", receivedAt: "2026-09-03", settledAt: "2026-09-03", amount: 240, method: "ACH", status: "Cleared", createdBy: "usr-elena", createdAt: "2026-09-03" }],
  allocations: [{ id: "allocation-1", paymentId: "payment-1", invoiceId: "invoice-1", amount: 240, createdAt: "2026-09-03", createdBy: "usr-elena" }],
  credits: [{ id: "credit-1", invoiceId: "invoice-1", amount: 24, reason: "Billing correction", status: "Draft", createdAt: "2026-09-03", createdBy: "usr-elena" }],
  refunds: [{ id: "refund-1", paymentId: "payment-1", amount: 24, reason: "Verified product issue", basis: "Verified quality issue", evidence: "Lot inspection", status: "Requested", createdAt: "2026-09-03", createdBy: "usr-elena" }],
  notes: [{ id: "note-1", invoiceId: "invoice-1", authorId: "usr-elena", note: "Collection note", createdAt: "2026-09-03" }],
};

test("commerce cash audit records are finance-sensitive and inherit the customer account link", () => {
  const snapshots = collectAuditableRecords("Commerce", commerce);
  for (const key of ["Commerce.payments:payment-1", "Commerce.allocations:allocation-1", "Commerce.credits:credit-1", "Commerce.refunds:refund-1", "Commerce.notes:note-1"]) {
    const snapshot = snapshots.get(key);
    assert.ok(snapshot, `${key} should be auditable`);
    assert.equal(snapshot?.sensitivity, "manager");
    assert.equal(snapshot?.relatedAccountId, "acc-101");
  }
  assert.equal(snapshots.get("Commerce.invoices:invoice-1")?.sensitivity, "operational");
});

test("sales reps cannot see detailed cash audit history but Operations can", () => {
  const data = createDemoData();
  const event: AuditEvent = {
    id: "audit-payment",
    at: "2026-09-03T12:00:00Z",
    actorId: "usr-elena",
    actorRole: "Operations",
    action: "Updated",
    module: "Commerce",
    collection: "payments",
    entityType: "Commerce.payments",
    entityId: "payment-1",
    label: "payment-1",
    summary: "Payment updated",
    sensitivity: "manager",
    relatedAccountId: "acc-101",
    changes: [{ field: "status", before: "Pending", after: "Cleared" }],
  };
  const rep = data.users.find((user) => user.id === "usr-jordan")!;
  const operations = data.users.find((user) => user.id === "usr-elena")!;
  const manager = data.users.find((user) => user.id === "usr-avery")!;

  assert.equal(visibleAuditEvents(rep, data, [event]).length, 0);
  assert.equal(visibleAuditEvents(operations, data, [event]).length, 1);
  assert.equal(visibleAuditEvents(manager, data, [event]).length, 1);
});

test("sales manager audit visibility follows centralized management scope, not same-team membership", () => {
  const data = createDemoData();
  const templateManager = data.users.find((user) => user.role === "Sales Manager")!;
  const templateRep = data.users.find((user) => user.role === "Sales Representative")!;
  const peerManager: WorkspaceUser = { ...templateManager, id:"usr-audit-manager", name:"Audit Manager", firstName:"Audit", email:"audit-manager@test", initials:"AM", managedTeams:[] };
  const unrelatedRep: WorkspaceUser = { ...templateRep, id:"usr-audit-peer", name:"Audit Peer", firstName:"Peer", email:"audit-peer@test", initials:"AP", managerId:"usr-someone-else", team:"Sales" };
  const strictData = { ...data, users:[...data.users, peerManager, unrelatedRep] };
  const event: AuditEvent = {
    id:"audit-peer-event", at:"2026-09-03T12:00:00Z", actorId:unrelatedRep.id, actorRole:unrelatedRep.role, action:"Updated",
    module:"Workspace", collection:"activities", entityType:"Workspace.activities", entityId:"activity-peer", label:"Peer activity",
    summary:"Peer activity updated", sensitivity:"operational", relatedUserId:unrelatedRep.id, changes:[{field:"detail",after:"Updated"}],
  };
  assert.equal(visibleAuditEvents(peerManager, strictData, [event]).length, 0);
  const explicitManager: WorkspaceUser = { ...peerManager, managedTeams:["Sales"] };
  const explicitData = { ...strictData, users:strictData.users.map((user)=>user.id===peerManager.id?explicitManager:user) };
  assert.equal(visibleAuditEvents(explicitManager, explicitData, [event]).length, 1);
});
