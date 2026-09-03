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
  computedInvoiceStatus,
  createCommerceSeed,
  invoiceBalance,
  invoicePaidAmount,
  normalizeCommerceState,
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

type NewPaymentInput = { invoiceId: string; amount: number; method: PaymentMethod; status: Payment["status"]; processorReference?: string; note?: string };
type CommerceContextValue = {
  commerce: CommerceState;
  setInvoiceTerms: (invoiceId: string, terms: InvoiceTerms, dueDate?: string) => void;
  recordPayment: (input: NewPaymentInput) => string | null;
  setPaymentStatus: (paymentId: string, status: Payment["status"]) => void;
  createCredit: (invoiceId: string, amount: number, reason: string) => string | null;
  approveCredit: (creditId: string) => void;
  applyCredit: (creditId: string) => void;
  requestRefund: (paymentId: string, amount: number, reason: string) => string | null;
  setRefundStatus: (refundId: string, status: Refund["status"]) => void;
  addNote: (invoiceId: string, note: string) => void;
  voidInvoice: (invoiceId: string, reason: string) => void;
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
          .map((allocation) => commerce.payments.find((payment) => payment.id === allocation.paymentId)?.receivedAt)
          .filter((date): date is string => Boolean(date))
          .sort();
        reconcileOrderPayment(order.id, status, status === "Paid" ? settlementDates.at(-1)?.slice(0, 10) : undefined);
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
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || input.amount <= 0 || input.amount > invoiceBalance(commerce, invoice)) return null;
    const paymentId = uid("payment");
    const payment: Payment = { id: paymentId, accountId: invoice.accountId, receivedAt: now(), amount: input.amount, method: input.method, status: input.status, processorReference: input.processorReference?.trim() || undefined, note: input.note?.trim() || undefined, createdBy: currentUser.id, createdAt: now() };
    const allocation: PaymentAllocation = { id: uid("allocation"), paymentId, invoiceId: invoice.id, amount: input.amount, createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, payments: [payment, ...state.payments], allocations: [allocation, ...state.allocations] }));
    return paymentId;
  };

  const setPaymentStatus = (paymentId: string, status: Payment["status"]) => {
    if (!canManageCash) return;
    setCommerce((state) => ({
      ...state,
      payments: state.payments.map((payment) => payment.id === paymentId && validPaymentTransition(payment.status, status) ? { ...payment, status } : payment),
    }));
  };

  const createCredit = (invoiceId: string, amount: number, reason: string) => {
    if (!canManageCash) return null;
    const invoice = commerce.invoices.find((item) => item.id === invoiceId);
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || amount <= 0 || amount > invoiceBalance(commerce, invoice) || !reason.trim()) return null;
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
    if (!canManageCash) return;
    setCommerce((state) => ({ ...state, credits: state.credits.map((credit) => credit.id === creditId && credit.status === "Approved" ? { ...credit, status: "Applied" } : credit) }));
  };

  const requestRefund = (paymentId: string, amount: number, reason: string) => {
    if (!canManageCash) return null;
    const payment = commerce.payments.find((item) => item.id === paymentId);
    const alreadyRequested = commerce.refunds.filter((refund) => refund.paymentId === paymentId && refund.status !== "Failed").reduce((sum, refund) => sum + refund.amount, 0);
    if (!payment || payment.status !== "Cleared" || amount <= 0 || amount > payment.amount - alreadyRequested || !reason.trim()) return null;
    const id = uid("refund");
    const record: Refund = { id, paymentId, amount, reason: reason.trim(), status: "Requested", createdAt: now(), createdBy: currentUser.id };
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
    if (!canManageCash || !reason.trim()) return;
    setCommerce((state) => ({
      ...state,
      invoices: state.invoices.map((invoice) => {
        if (invoice.id !== invoiceId || computedInvoiceStatus(state, invoice) === "Paid" || invoicePaidAmount(state, invoice.id) > 0) return invoice;
        return { ...invoice, status: "Void", voidReason: reason.trim() };
      }),
    }));
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
