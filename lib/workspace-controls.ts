import type { WorkspaceData } from "./types";

export type ReconciledOrderPaymentStatus = "Open" | "Partially paid" | "Paid";

export function paidAccountRollupAfterPayment(
  data: WorkspaceData,
  accountId: string,
  orderId: string,
  nextStatus: ReconciledOrderPaymentStatus,
) {
  const paidOrders = data.orders.filter((order) => {
    if (order.accountId !== accountId) return false;
    if (order.id === orderId) return nextStatus === "Paid";
    return order.paymentStatus === "Paid";
  });
  return {
    lifetimeCases: paidOrders.reduce((sum, order) => sum + order.cases, 0),
    reorderCount: Math.max(0, paidOrders.length - 1),
    paidOrderIds: paidOrders.map((order) => order.id),
  };
}
