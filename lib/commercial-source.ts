import { invoicePaidAmount, paymentSettlementDate, type CommerceState } from "./commerce-engine";
import type { WorkspaceData } from "./types";

export type PaidOrderFact = {
  orderId: string;
  accountId: string;
  creditedUserId: string;
  paidAt: string;
  amount: number;
  cases: number;
};

export type CollectedCashFact = {
  id: string;
  orderId: string;
  accountId: string;
  creditedUserId: string;
  settledAt: string;
  amount: number;
  kind: "Collection" | "Refund";
};

const orderCreditUser = (order: WorkspaceData["orders"][number]) => order.creditedRepId ?? order.ownerId;
const dateKey = (value: string) => value.slice(0, 10);
const unique = <T,>(records: T[], key: (record: T) => string) => {
  const seen = new Set<string>();
  return records.filter((record) => {
    const id = key(record);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export function resolvedPaidOrderFacts(data: WorkspaceData, commerce?: CommerceState): PaidOrderFact[] {
  const orderById = new Map(data.orders.map((order) => [order.id, order]));
  const facts: PaidOrderFact[] = [];

  if (commerce) {
    const clearedPaymentById = new Map(commerce.payments.filter((payment) => payment.status === "Cleared").map((payment) => [payment.id, payment]));
    for (const invoice of commerce.invoices) {
      if (invoice.status === "Void" || invoice.total <= 0 || invoicePaidAmount(commerce, invoice.id) + 0.005 < invoice.total) continue;
      const order = orderById.get(invoice.orderId);
      if (!order) continue;
      const settlementDates = commerce.allocations
        .filter((allocation) => allocation.invoiceId === invoice.id && clearedPaymentById.has(allocation.paymentId))
        .map((allocation) => clearedPaymentById.get(allocation.paymentId))
        .map((payment) => payment ? paymentSettlementDate(payment) : undefined)
        .filter((value): value is string => Boolean(value))
        .sort();
      const paidAt = settlementDates.at(-1) ?? order.paidAt ?? order.placedAt;
      facts.push({
        orderId: order.id,
        accountId: order.accountId,
        creditedUserId: orderCreditUser(order),
        paidAt: dateKey(paidAt),
        amount: order.amount,
        cases: order.cases,
      });
    }
  }

  const already = new Set(facts.map((fact) => fact.orderId));
  for (const order of data.orders) {
    if (already.has(order.id) || order.paymentStatus !== "Paid") continue;
    facts.push({
      orderId: order.id,
      accountId: order.accountId,
      creditedUserId: orderCreditUser(order),
      paidAt: dateKey(order.paidAt ?? order.placedAt),
      amount: order.amount,
      cases: order.cases,
    });
  }
  return unique(facts, (fact) => fact.orderId);
}

export function collectedCashFacts(data: WorkspaceData, commerce?: CommerceState): CollectedCashFact[] {
  if (!commerce) {
    return resolvedPaidOrderFacts(data).map((fact) => ({
      id: fact.orderId,
      orderId: fact.orderId,
      accountId: fact.accountId,
      creditedUserId: fact.creditedUserId,
      settledAt: fact.paidAt,
      amount: fact.amount,
      kind: "Collection" as const,
    }));
  }

  const orderById = new Map(data.orders.map((order) => [order.id, order]));
  const invoiceById = new Map(commerce.invoices.map((invoice) => [invoice.id, invoice]));
  const collectionFacts: CollectedCashFact[] = [];

  for (const allocation of commerce.allocations) {
    const payment = commerce.payments.find((item) => item.id === allocation.paymentId && item.status === "Cleared");
    const invoice = invoiceById.get(allocation.invoiceId);
    const order = invoice ? orderById.get(invoice.orderId) : undefined;
    const settledAt = payment ? paymentSettlementDate(payment) : undefined;
    if (!payment || !invoice || invoice.status === "Void" || !order || !settledAt || allocation.amount <= 0) continue;
    collectionFacts.push({
      id: allocation.id,
      orderId: order.id,
      accountId: order.accountId,
      creditedUserId: orderCreditUser(order),
      settledAt: dateKey(settledAt),
      amount: allocation.amount,
      kind: "Collection",
    });
  }

  for (const refund of commerce.refunds) {
    if (refund.status !== "Settled" || !refund.settledAt || refund.amount <= 0) continue;
    const allocation = commerce.allocations.find((item) => item.paymentId === refund.paymentId);
    const invoice = allocation ? invoiceById.get(allocation.invoiceId) : undefined;
    const order = invoice ? orderById.get(invoice.orderId) : undefined;
    if (!order) continue;
    collectionFacts.push({
      id: refund.id,
      orderId: order.id,
      accountId: order.accountId,
      creditedUserId: orderCreditUser(order),
      settledAt: dateKey(refund.settledAt),
      amount: -refund.amount,
      kind: "Refund",
    });
  }

  return collectionFacts;
}
