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
  creditCanApprove,
  invoiceCanVoid,
  invoicePaidAmount,
  invoiceRecordableAmount,
  normalizeCommerceState,
  paymentCanFail,
  paymentCanReverse,
  paymentSettlementDate,
  refundCanApprove,
  refundCanFail,
  refundCanRequest,
  refundCanSend,
  refundCanSettle,
} from "./commerce-engine";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type NewPaymentInput = { invoiceId: string; amount: number; method: PaymentMethod; status: "Pending" | "Cleared"; settlementDate?: string; processorReference?: string; note?: string };
type CommerceContextValue = {
  commerce: CommerceState;
  setInvoiceTerms: (invoiceId: string, terms: InvoiceTerms, dueDate?: string) => void;
  recordPayment: (input: NewPaymentInput) => string | null;
  setPaymentStatus: (paymentId: string, status: "Cleared", settlementDate?: string) => boolean;
  failPayment: (paymentId: string, reason: string) => boolean;
  reversePayment: (paymentId: string, reason: string, reference?: string) => boolean;
  createCredit: (invoiceId: string, amount: number, reason: string) => string | null;
  approveCredit: (creditId: string) => boolean;
  applyCredit: (creditId: string) => boolean;
  requestRefund: (paymentId: string, amount: number, reason: string, evidence: string) => string | null;
  approveRefund: (refundId: string) => boolean;
  markRefundSent: (refundId: string, reference: string) => boolean;
  settleRefund: (refundId: string, settlementDate: string) => boolean;
  failRefund: (refundId: string, reason: string) => boolean;
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
    if (!canManageCash || !currentUser) return null;
    const invoice = commerce.invoices.find((item) => item.id === input.invoiceId);
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || input.amount <= 0 || input.amount > invoiceRecordableAmount(commerce, invoice)) return null;
    if (input.status === "Cleared" && !canRecordSettlementDate(input.settlementDate)) return null;
    const paymentId = uid("payment");
    const payment: Payment = { id: paymentId, accountId: invoice.accountId, receivedAt: now(), settledAt: input.status === "Cleared" ? input.settlementDate : undefined, settledBy: input.status === "Cleared" ? currentUser.id : undefined, amount: input.amount, method: input.method, status: input.status, processorReference: input.processorReference?.trim() || undefined, note: input.note?.trim() || undefined, createdBy: currentUser.id, createdAt: now() };
    const allocation: PaymentAllocation = { id: uid("allocation"), paymentId, invoiceId: invoice.id, amount: input.amount, createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, payments: [payment, ...state.payments], allocations: [allocation, ...state.allocations] }));
    return paymentId;
  };

  const setPaymentStatus = (paymentId: string, status: "Cleared", settlementDate?: string) => {
    if (!canManageCash || !currentUser || status !== "Cleared") return false;
    const payment = commerce.payments.find((item) => item.id === paymentId);
    if (!payment || payment.status !== "Pending" || !canRecordSettlementDate(settlementDate)) return false;
    setCommerce((state) => ({
      ...state,
      payments: state.payments.map((item) => item.id === paymentId ? { ...item, status: "Cleared", settledAt: settlementDate, settledBy: currentUser.id } : item),
    }));
    return true;
  };

  const failPayment = (paymentId: string, reason: string) => {
    if (!canManageCash || !currentUser) return false;
    const payment = commerce.payments.find((item) => item.id === paymentId);
    if (!payment || !paymentCanFail(payment, reason)) return false;
    const failedAt = now();
    setCommerce((state) => ({ ...state, payments: state.payments.map((item) => item.id === paymentId ? { ...item, status: "Failed", failedAt, failedBy: currentUser.id, failureReason: reason.trim() } : item) }));
    return true;
  };

  const reversePayment = (paymentId: string, reason: string, reference?: string) => {
    if (!canManageCash || !currentUser) return false;
    const payment = commerce.payments.find((item) => item.id === paymentId);
    if (!payment || !paymentCanReverse(payment, reason)) return false;
    const reversedAt = now();
    setCommerce((state) => ({ ...state, payments: state.payments.map((item) => item.id === paymentId ? { ...item, status: "Reversed", reversedAt, reversedBy: currentUser.id, reversalReason: reason.trim(), reversalReference: reference?.trim() || undefined } : item) }));
    return true;
  };

  const createCredit = (invoiceId: string, amount: number, reason: string) => {
    if (!canManageCash || !currentUser) return null;
    const invoice = commerce.invoices.find((item) => item.id === invoiceId);
    if (!invoice || computedInvoiceStatus(commerce, invoice) === "Void" || amount <= 0 || amount > invoiceRecordableAmount(commerce, invoice) || !reason.trim()) return null;
    const id = uid("credit");
    const record: CreditMemo = { id, invoiceId, amount, reason: reason.trim(), status: "Draft", createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, credits: [record, ...state.credits] }));
    return id;
  };

  const approveCredit = (creditId: string) => {
    if (!canManageCash || !currentUser) return false;
    const credit = commerce.credits.find((item) => item.id === creditId);
    if (!credit || !creditCanApprove(credit, currentUser.id)) return false;
    const approvedAt = now();
    setCommerce((state) => ({ ...state, credits: state.credits.map((item) => item.id === creditId ? { ...item, status: "Approved", approvedBy: currentUser.id, approvedAt } : item) }));
    return true;
  };

  const applyCredit = (creditId: string) => {
    if (!canManageCash || !currentUser) return false;
    let applied = false;
    setCommerce((state) => {
      const credit = state.credits.find((item) => item.id === creditId);
      if (!credit || !creditCanApply(state, credit)) return state;
      applied = true;
      const appliedAt = now();
      return { ...state, credits: state.credits.map((item) => item.id === creditId ? { ...item, status: "Applied", appliedAt, appliedBy: currentUser.id } : item) };
    });
    return applied;
  };

  const requestRefund = (paymentId: string, amount: number, reason: string, evidence: string) => {
    if (!canManageCash || !currentUser || !refundCanRequest(commerce, paymentId, amount, reason, evidence)) return null;
    const id = uid("refund");
    const record: Refund = { id, paymentId, amount, reason: reason.trim(), basis: "Verified quality issue", evidence: evidence.trim(), status: "Requested", createdAt: now(), createdBy: currentUser.id };
    setCommerce((state) => ({ ...state, refunds: [record, ...state.refunds] }));
    return id;
  };

  const approveRefund = (refundId: string) => {
    if (!canManageCash || !currentUser) return false;
    const refund = commerce.refunds.find((item) => item.id === refundId);
    if (!refund || !refundCanApprove(refund, currentUser.id)) return false;
    const approvedAt = now();
    setCommerce((state) => ({ ...state, refunds: state.refunds.map((item) => item.id === refundId ? { ...item, status: "Approved", approvedBy: currentUser.id, approvedAt } : item) }));
    return true;
  };

  const markRefundSent = (refundId: string, reference: string) => {
    if (!canManageCash || !currentUser) return false;
    const refund = commerce.refunds.find((item) => item.id === refundId);
    if (!refund || !refundCanSend(refund, reference)) return false;
    const sentAt = now();
    setCommerce((state) => ({ ...state, refunds: state.refunds.map((item) => item.id === refundId ? { ...item, status: "Sent", sentReference: reference.trim(), sentAt, sentBy: currentUser.id } : item) }));
    return true;
  };

  const settleRefund = (refundId: string, settlementDate: string) => {
    if (!canManageCash || !currentUser) return false;
    const refund = commerce.refunds.find((item) => item.id === refundId);
    if (!refund || !refundCanSettle(refund, settlementDate)) return false;
    setCommerce((state) => ({ ...state, refunds: state.refunds.map((item) => item.id === refundId ? { ...item, status: "Settled", settledAt: settlementDate, settledBy: currentUser.id } : item) }));
    return true;
  };

  const failRefund = (refundId: string, reason: string) => {
    if (!canManageCash || !currentUser) return false;
    const refund = commerce.refunds.find((item) => item.id === refundId);
    if (!refund || !refundCanFail(refund, reason)) return false;
    const failedAt = now();
    setCommerce((state) => ({ ...state, refunds: state.refunds.map((item) => item.id === refundId ? { ...item, status: "Failed", failedAt, failedBy: currentUser.id, failureReason: reason.trim() } : item) }));
    return true;
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
  const value: CommerceContextValue = { commerce, setInvoiceTerms, recordPayment, setPaymentStatus, failPayment, reversePayment, createCredit, approveCredit, applyCredit, requestRefund, approveRefund, markRefundSent, settleRefund, failRefund, addNote, voidInvoice, resetCommerce };
  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>;
}

export function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("useCommerce must be used inside CommerceProvider");
  return value;
}
