import type { Order, WorkspaceUser } from "./types";

const cancellableStatuses = new Set<Order["status"]>(["Draft", "Awaiting approval", "Approved"]);

/**
 * Order cancellation authority is intentionally narrower than edit authority.
 * Administrators may cancel any pre-fulfillment order. Sales Representatives and
 * Sales Managers may cancel only orders they personally submitted. Customer
 * self-cancellation is not enabled until the commercial policy is explicitly approved.
 */
export function canCancelOrder(user: WorkspaceUser | null | undefined, order: Order | null | undefined) {
  if (!user || !order || !cancellableStatuses.has(order.status)) return false;
  if (user.role === "Administrator") return true;
  const selfServiceRole = user.role === "Sales Representative" || user.role === "Sales Manager";
  return selfServiceRole && order.ownerId === user.id;
}

export function orderCancellationAccessMessage(user: WorkspaceUser | null | undefined, order: Order | null | undefined) {
  if (!user) return "Sign in before cancelling an order.";
  if (!order) return "Order not found.";
  if (order.status === "Cancelled") return "This order is already cancelled.";
  if (!cancellableStatuses.has(order.status)) return "Fulfillment has already started. Use the delivery/return exception workflow instead of cancelling this order.";
  if (user.role === "Administrator") return "";
  if ((user.role === "Sales Representative" || user.role === "Sales Manager") && order.ownerId !== user.id) return "You can cancel only orders you personally submitted.";
  return "You do not have permission to cancel this order.";
}
