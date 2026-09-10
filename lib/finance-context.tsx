"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { accountIsVisible, canManageUser } from "./access";
import { Expense, FINANCE_STORAGE_KEY, FinanceState, createFinanceSeed, normalizeFinanceState } from "./finance-engine";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type NewExpense = Pick<Expense, "merchant" | "amount" | "category" | "businessPurpose" | "receiptName" | "accountId">;
type FinanceContextValue = {
  finance: FinanceState;
  submitExpense: (input: NewExpense) => string | null;
  managerDecision: (id: string, status: "Manager approved" | "Returned", reason?: string) => boolean;
  financeDecision: (id: string, status: "Finance approved" | "Returned", reason?: string) => boolean;
  markExpensePaid: (id: string, paymentReference: string) => boolean;
  resetFinance: () => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
  const runtime = useRuntimeMode();
  const read = () => {
    if (typeof window === "undefined") return createFinanceSeed();
    try {
      return normalizeFinanceState(JSON.parse(window.localStorage.getItem(FINANCE_STORAGE_KEY) ?? "null"));
    } catch {
      return createFinanceSeed();
    }
  };
  const [finance, setFinance] = useState<FinanceState>(() => read());

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(finance));
  }, [finance]);

  const submitExpense = (input: NewExpense) => {
    if (!currentUser || currentUser.role === "Customer" || !input.merchant.trim() || !input.category.trim() || !input.businessPurpose.trim() || !Number.isFinite(input.amount) || input.amount <= 0) return null;
    if (input.accountId) {
      const account = data.accounts.find((item) => item.id === input.accountId);
      if (!account || !accountIsVisible(data, currentUser, account)) return null;
    }
    const id = uid("expense");
    const expense: Expense = { ...input, id, requesterId: currentUser.id, submittedAt: now(), merchant: input.merchant.trim(), category: input.category.trim(), businessPurpose: input.businessPurpose.trim(), receiptName: input.receiptName?.trim() || undefined, status: "Submitted" };
    setFinance((state) => ({ ...state, expenses: [expense, ...state.expenses] }));
    return id;
  };

  const canManagerReview = (expense: Expense) => {
    if (!currentUser || expense.requesterId === currentUser.id) return false;
    if (currentUser.role === "Administrator") return true;
    if (currentUser.role !== "Sales Manager") return false;
    return canManageUser(data, currentUser, expense.requesterId, false);
  };

  const managerDecision = (id: string, status: "Manager approved" | "Returned", reason?: string) => {
    const expense = finance.expenses.find((item) => item.id === id && item.status === "Submitted");
    if (!expense || !canManagerReview(expense) || (status === "Returned" && !reason?.trim())) return false;
    setFinance((state) => ({ ...state, expenses: state.expenses.map((item) => item.id === id ? { ...item, status, managerDecisionAt: now(), managerReviewerId: currentUser?.id, returnReason: status === "Returned" ? reason?.trim() : undefined } : item) }));
    return true;
  };

  const financeDecision = (id: string, status: "Finance approved" | "Returned", reason?: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const expense = finance.expenses.find((item) => item.id === id && item.status === "Manager approved");
    if (!expense || (status === "Returned" && !reason?.trim())) return false;
    setFinance((state) => ({ ...state, expenses: state.expenses.map((item) => item.id === id ? { ...item, status, financeDecisionAt: now(), financeReviewerId: currentUser.id, returnReason: status === "Returned" ? reason?.trim() : undefined } : item) }));
    return true;
  };

  const markExpensePaid = (id: string, paymentReference: string) => {
    if (currentUser?.role !== "Administrator" || !paymentReference.trim()) return false;
    const expense = finance.expenses.find((item) => item.id === id && item.status === "Finance approved");
    if (!expense) return false;
    setFinance((state) => ({ ...state, expenses: state.expenses.map((item) => item.id === id && item.status === "Finance approved" ? { ...item, status: "Paid", paidAt: now(), paidBy: currentUser.id, paymentReference: paymentReference.trim() } : item) }));
    return true;
  };

  const resetFinance = () => { if (runtime.isDemo && currentUser?.role === "Administrator") setFinance(createFinanceSeed()); };
  const value: FinanceContextValue = { finance, submitExpense, managerDecision, financeDecision, markExpensePaid, resetFinance };
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance must be used inside FinanceProvider");
  return value;
}
