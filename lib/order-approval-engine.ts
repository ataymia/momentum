import type { Approval, Order } from "./types";

const fulfillmentRank: Record<Order["status"], number> = {
  Draft: 0,
  "Awaiting approval": 1,
  Approved: 2,
  Allocated: 3,
  "Out for delivery": 4,
  Delivered: 5,
  Paid: 6,
  Cancelled: 7,
};

const instant = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).getTime() : 0;
const isFinal = (approval: Approval) => approval.status !== "Pending";
const supersededByEdit = (approval: Approval) => approval.status === "Returned" && approval.returnReason === "Superseded by an edited order version.";
const effectiveAt = (approval: Approval) => isFinal(approval) ? instant(approval.decidedAt) || instant(approval.submittedAt) : instant(approval.submittedAt);

export function canonicalApproval(a: Approval, b: Approval): Approval {
  // A newer resubmission is a new approval cycle. A stale Pending replica from the original
  // submission still loses to the later final decision because its submittedAt predates decidedAt.
  const aAt = effectiveAt(a);
  const bAt = effectiveAt(b);
  if (aAt !== bAt) return bAt > aAt ? b : a;
  // Same record id means two replicas of one approval cycle; a final decision wins over its stale Pending copy.
  if (a.id === b.id && isFinal(a) !== isFinal(b)) return isFinal(a) ? a : b;
  // Editing may close an old Pending cycle and open the corrected Pending cycle in the same millisecond.
  // The explicit superseded marker makes that relationship unambiguous without relying on array order.
  if (a.id !== b.id) {
    if (a.status === "Pending" && supersededByEdit(b)) return a;
    if (b.status === "Pending" && supersededByEdit(a)) return b;
    return b;
  }
  return b.submittedAt > a.submittedAt ? b : a;
}

/** One active operational approval per order. Earlier approval cycles remain in persistence/audit, but only the newest cycle becomes actionable. */
export function reconcileApprovals(primary: Approval[], secondary: Approval[]): Approval[] {
  const byId = new Map<string, Approval>();
  for (const approval of [...secondary, ...primary]) {
    const existing = byId.get(approval.id);
    byId.set(approval.id, existing ? canonicalApproval(existing, approval) : approval);
  }
  const ordinary: Approval[] = [];
  const orderByRecord = new Map<string, Approval>();
  for (const approval of byId.values()) {
    if (!["Order", "Low stock sale"].includes(approval.type) || !approval.recordId) { ordinary.push(approval); continue; }
    const existing = orderByRecord.get(approval.recordId);
    orderByRecord.set(approval.recordId, existing ? canonicalApproval(existing, approval) : approval);
  }
  return [...orderByRecord.values(), ...ordinary].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function approvalForOrder(approvals: Approval[], orderId: string) {
  return approvals.find((approval) => approval.recordId === orderId && ["Order", "Low stock sale"].includes(approval.type));
}

export function reconcileOrderWithApproval(order: Order, approval?: Approval): Order {
  // Cancellation is terminal for an undelivered order. A stale approval must never resurrect it.
  if (order.status === "Cancelled") return order;
  if (!approval) return order;
  if (approval.status === "Approved" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Approved" };
  if (approval.status === "Pending" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Awaiting approval" };
  if (approval.status === "Returned" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Draft" };
  return order;
}

export function reconcileOrders(primary: Order[], secondary: Order[], approvals: Approval[]): Order[] {
  const byId = new Map<string, Order>();
  for (const order of [...secondary, ...primary]) {
    const existing = byId.get(order.id);
    if (!existing) { byId.set(order.id, order); continue; }
    // Cancellation and fulfillment are separate terminal branches. Delivery/payment evidence wins over
    // a stale cancellation replica; otherwise cancellation wins over any pre-delivery replica.
    if (order.status === "Cancelled" || existing.status === "Cancelled") {
      const delivered = [order, existing].find((candidate) => ["Delivered", "Paid"].includes(candidate.status));
      const cancelled = order.status === "Cancelled" ? order : existing;
      const other = cancelled === order ? existing : order;
      byId.set(order.id, delivered ?? { ...other, ...cancelled });
      continue;
    }
    const advanced = fulfillmentRank[order.status] >= fulfillmentRank[existing.status] ? order : existing;
    const other = advanced === order ? existing : order;
    byId.set(order.id, { ...other, ...advanced });
  }
  return [...byId.values()].map((order) => reconcileOrderWithApproval(order, approvalForOrder(approvals, order.id)));
}
