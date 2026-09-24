import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { canonicalApproval, reconcileApprovals, reconcileOrderWithApproval } from "../lib/order-approval-engine";
import type { Approval, Order } from "../lib/types";

const baseApproval: Approval = {
  id: "apr-original",
  type: "Order",
  title: "Review order GE-EDIT",
  detail: "10 cases",
  requestedBy: "Sales Rep",
  requesterId: "rep",
  recordId: "order-edit",
  team: "Sales",
  submittedAt: "2026-09-24T18:00:00.000Z",
  dueAt: "2026-09-25T18:00:00.000Z",
  priority: "High",
  status: "Pending",
};

const order: Order = {
  id: "order-edit",
  number: "GE-EDIT",
  accountId: "account",
  cases: 10,
  pricePerCase: 24,
  amount: 240,
  status: "Draft",
  placedAt: "2026-09-24",
  ownerId: "rep",
  creditedRepId: "rep",
  priceBasis: "Tier A",
  paymentStatus: "Not invoiced",
};

describe("order correction approval cycles", () => {
  test("a final decision beats a stale Pending replica of the same approval id", () => {
    const approved: Approval = { ...baseApproval, status: "Approved", decidedBy: "admin", decidedAt: "2026-09-24T18:01:00.000Z" };
    assert.equal(canonicalApproval(baseApproval, approved).status, "Approved");
    assert.equal(canonicalApproval(approved, baseApproval).status, "Approved");
  });

  test("a corrected resubmission becomes the active cycle after a returned order", () => {
    const returned: Approval = { ...baseApproval, status: "Returned", decidedBy: "admin", decidedAt: "2026-09-24T18:02:00.000Z", returnReason: "Remove unavailable Strawberry." };
    const resubmitted: Approval = { ...baseApproval, id: "apr-resubmit", submittedAt: "2026-09-24T18:03:00.000Z", status: "Pending" };
    const [active] = reconcileApprovals([resubmitted, returned], []);
    assert.equal(active.id, "apr-resubmit");
    assert.equal(active.status, "Pending");
    assert.equal(reconcileOrderWithApproval(order, active).status, "Awaiting approval");
  });

  test("same-millisecond edit supersession still keeps the corrected Pending cycle actionable", () => {
    const at = "2026-09-24T18:04:00.000Z";
    const superseded: Approval = { ...baseApproval, status: "Returned", decidedBy: "rep", decidedAt: at, returnReason: "Superseded by an edited order version." };
    const replacement: Approval = { ...baseApproval, id: "apr-replacement", submittedAt: at, status: "Pending" };
    const [active] = reconcileApprovals([replacement, superseded], []);
    assert.equal(active.id, "apr-replacement");
    assert.equal(active.status, "Pending");
  });

  test("a newer pending edit reopens an approved pre-fulfillment order for Administrator review", () => {
    const approvedOrder: Order = { ...order, status: "Approved" };
    const pendingEdit: Approval = { ...baseApproval, id: "apr-after-approved-edit", submittedAt: "2026-09-24T18:05:00.000Z", status: "Pending" };
    assert.equal(reconcileOrderWithApproval(approvedOrder, pendingEdit).status, "Awaiting approval");
  });

  test("approval reconciliation never rolls back an order after fulfillment has started", () => {
    const allocatedOrder: Order = { ...order, status: "Allocated" };
    const pendingEdit: Approval = { ...baseApproval, id: "apr-too-late", submittedAt: "2026-09-24T18:06:00.000Z", status: "Pending" };
    assert.equal(reconcileOrderWithApproval(allocatedOrder, pendingEdit).status, "Allocated");
  });
});
