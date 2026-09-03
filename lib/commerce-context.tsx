"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import {
  COMMERCE_STORAGE_KEY,
  CommerceState,
  CreditMemo,
  InvoiceTerms,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  ReceivableNote,
  Refund,
  canRecordSettlementDate,
  computedInvoiceStatus,
  createCommerceSeed,
  creditCanApply,
  invoiceCanVoid,
  invoicePaidAmount,
  invoiceRecordableAmount,
  normalizeCommerceState,
  paymentSettlementDate,
  refundCanRequest,
} from "./commerce-engine";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const validPaymentTransition = (from: Payment["status"], to: Payment["status"]) => {
  if (from === to) return true;
  if (from === "Pending") return to === "Cleared" || to === "Failed";
  if (from === "Cleared") return to === "Reversed";
  return false;
};
const validRefundTransition = (from: Refund["status"], to: Refund["status"]) => {
  if (from === to) return true;
  if (from === "Requested") return to === "Approved" || to === "Failed";
  if (from === "Approved") return to === "Sent" || to === "Failed";
  if (from === "Sent") return to === "Settled" || to === "Failed";
  return false;
};

type NewPaymentInput = { invoiceId: string; amount: number; method: PaymentMethod; status: Payment["status"]; settlementDate?: string; processorReference?: string; note?: string };
type CommerceContextValue = {
  commerce: CommerceState;
  setInvoiceTerms: (invoiceId: string, terms: InvoiceTerms, dueDate?: string) => void;
  recordPayment: (input: NewPaymentInput) => string | null;
  setPaymentStatus: (paymentId: string, status: Payment["status"], settlementDate?: string) => boolean;
  createCredit: (invoiceId: string, amount: number, reason: string) => string | null;
  approveCredit: (creditId: string) => void;
  applyCredit: (creditId: string) => boolean;
  requestRefund: (paymentId: string, amount: number, reason: string, evidence: string) => string | null;
  setRefundStatus: (refundId: string, status: Refund["status"]) => void;
  addNote: (invoiceId: string, note: string) => void;
  voidInvoice: (invoiceId: string, reason: string) => boolean;
  resetCommerce: () => void;
};

const CommerceContext = createContext<CommerceContextValue | null>(null);

export function CommerceProvider({ children }: { children: ReactNode }) {
  const { data, currentUser, reconcileOrderPayment } = useWorkspace();
  const canManageCash = currentUser?.role === "Administrator" || currentUser?.role === "Operations";
  const read = () => {
    if (typeof window === "undefined") return createCommerceSeed(data);
    try {
      return normalizeCommerceState(JSON.parse(window.localStorage.getItem(COMMERCE_STORAGE_KEY) ?? "null"), data);
    } catch {
      return createCommerceSeed(data);
    }
  };
  const [commerce, setCommerce] = useState<CommerceState>(() => read());

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommerce((state) => normalizeCommerceState(state, data));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerce));
  }, [commerce]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      for (const invoice of commerce.invoices) {
        const order = data.orders.find((item) => item.id === invoice.orderId);
        if (!order) continue;
        const clearedAmount = invoicePaidAmount(commerce, invoice.id);
        const status = clearedAmount >= invoice.total && invoice.total > 0 ? "Paid" : clearedAmount > 0 ? "Partially paid" : "Open";
        if (order.paymentStatus === status) continue;
        const clearedPaymentIds = new Set(commerce.payments.filter((payment) => payment.status === "Cleared").map((payment) => payment.id));
        const settlementDates = commerce.allocations
          .filter((allocation) => allocation.invoiceId === invoice.id && clearedPaymentIds.has(allocation.paymentId))
          .map((allocation) => commerce.payments.find((payment) => payment.id === allocation.paymentId))
          .map((payment) => payment ? paymentSettlementDate(payment) : undefined)
          .filter((date): date is string => Boolean(date))
          .sort();
        reconcileOrderPayment(order.id, status, status === "Paid" ? settlementDates.at(-1) : undefined);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, [commerce, data.orders, reconcileOrderPayment]);

  const setInvoiceTerms = (invoiceId: string, terms: InvoiceTerms, dueDate?: string) => {
    if (!canManageCash) return;
    setCommerce((state) => ({
      ...state,
      invoices: state.invoices.map((invoice) => {
        if (invoice.id !== invoiceId) return invoice;
        const status = computedInvoiceStatus(state, invoice);
        if (status === "Paid" || status === "Void") return invoice;
        return { ...invoice, terms, dueDate };
      }),
    }));
  };

  const recordPayment = (input: NewPaymentInput) => {
    if (!canManageCash) return null;
    const invoice = commerce.invoices.find((item) => item.id === input.invoiceId);
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || input.amount <= 0 || input.amount > invoiceRecordableAmount(commerce, invoice)) return null;
    if (input.status === "Cleared" && !canRecordSettlementDate(input.settlementDate)) return null;
    const paymentId = uid("payment");
    const payment: Payment = { id: paymentId, accountId: invoice.accountId, receivedAt: now(), settledAt: input.status === "Cleared" ? input.settlementDate : undefined, amount: input.amount, method: input.method, status: input.status, processorReference: input.processorReference?.trim() || undefined, note: input.note?.trim() || undefined, createdBy: currentUser.id, createdAt: now() };
    const allocation: PaymentAllocation = { id: uid("allocation"), paymentId, invoiceId: invoice.id, amount: input.amount, createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, payments: [payment, ...state.payments], allocations: [allocation, ...state.allocations] }));
    return paymentId;
  };

  const setPaymentStatus = (paymentId: string, status: Payment["status"], settlementDate?: string) => {
    if (!canManageCash) return false;
    const payment = commerce.payments.find((item) => item.id === paymentId);
    if (!payment || !validPaymentTransition(payment.status, status)) return false;
    if (status === "Cleared" && !canRecordSettlementDate(settlementDate)) return false;
    setCommerce((state) => ({
      ...state,
      payments: state.payments.map((item) => item.id === paymentId ? { ...item, status, settledAt: status === "Cleared" ? settlementDate : item.settledAt, reversedAt: status === "Reversed" ? now() : item.reversedAt } : item),
    }));
    return true;
  };

  const createCredit = (invoiceId: string, amount: number, reason: string) => {
    if (!canManageCash) return null;
    const invoice = commerce.invoices.find((item) => item.id === invoiceId);
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || amount <= 0 || amount > invoiceRecordableAmount(commerce, invoice) || !reason.trim()) return null;
    const id = uid("credit");
    const record: CreditMemo = { id, invoiceId, amount, reason: reason.trim(), status: "Draft", createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, credits: [record, ...state.credits] }));
    return id;
  };

  const approveCredit = (creditId: string) => {
    if (!canManageCash) return;
    setCommerce((state) => ({ ...state, credits: state.credits.map((credit) => credit.id === creditId && credit.status === "Draft" ? { ...credit, status: "Approved", approvedBy: currentUser.id, approvedAt: now() } : credit) }));
  };
  const applyCredit = (creditId: string) => {
    if (!canManageCash) return false;
    let applied = false;
    setCommerce((state) => {
      const credit = state.credits.find((item) => item.id === creditId);
      if (!credit || !creditCanApply(state, credit)) return state;
      applied = true;
      return { ...state, credits: state.credits.map((item) => item.id === creditId ? { ...item, status: "Applied" } : item) };
    });
    return applied;
  };

  const requestRefund = (paymentId: string, amount: number, reason: string, evidence: string) => {
    if (!canManageCash || !refundCanRequest(commerce, paymentId, amount, reason, evidence)) return null;
    const id = uid("refund");
    const record: Refund = { id, paymentId, amount, reason: reason.trim(), basis: "Verified quality issue", evidence: evidence.trim(), status: "Requested", createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, refunds: [record, ...state.refunds] }));
    return id;
  };

  const setRefundStatus = (refundId: string, status: Refund["status"]) => {
    if (!canManageCash) return;
    setCommerce((state) => ({
      ...state,
      refunds: state.refunds.map((refund) => {
        if (refund.id !== refundId || !validRefundTransition(refund.status, status)) return refund;
        return {
          ...refund,
          status,
          approvedBy: status === "Approved" ? currentUser.id : refund.approvedBy,
          approvedAt: status === "Approved" ? now() : refund.approvedAt,
          settledAt: status === "Settled" ? now() : refund.settledAt,
        };
      }),
    }));
  };

  const addNote = (invoiceId: string, note: string) => {
    if (!currentUser || currentUser.role === "Customer" || !commerce.invoices.some((invoice) => invoice.id === invoiceId) || !note.trim()) return;
    const record: ReceivableNote = { id: uid("ar-note"), invoiceId, authorId: currentUser.id, note: note.trim(), createdAt: now() };
    setCommerce((state) => ({ ...state, notes: [record, ...state.notes] }));
  };

  const voidInvoice = (invoiceId: string, reason: string) => {
    if (!canManageCash || !reason.trim() || !invoiceCanVoid(commerce, invoiceId)) return false;
    setCommerce((state) => ({ ...state, invoices: state.invoices.map((item) => item.id === invoiceId ? { ...item, status: "Void", voidReason: reason.trim() } : item) }));
    return true;
  };

  const resetCommerce = () => {
    if (currentUser?.role === "Administrator") setCommerce(createCommerceSeed(data));
  };
  const value: CommerceContextValue = { commerce, setInvoiceTerms, recordPayment, setPaymentStatus, createCredit, approveCredit, applyCredit, requestRefund, setRefundStatus, addNote, voidInvoice, resetCommerce };
  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("useCommerce must be used inside CommerceProvider");
  return value;
}
