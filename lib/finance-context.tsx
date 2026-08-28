"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Expense, FINANCE_STORAGE_KEY, FinanceState, createFinanceSeed, normalizeFinanceState } from "./finance-engine";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type NewExpense = Pick<Expense, "merchant" | "amount" | "category" | "businessPurpose" | "receiptName" | "accountId">;
type FinanceContextValue = {
  finance: FinanceState;
  submitExpense: (input: NewExpense) => string | null;
  managerDecision: (id: string, status: "Manager approved" | "Returned", reason?: string) => boolean;
  financeDecision: (id: string, status: "Finance approved" | "Returned", reason?: string) => boolean;
  markExpensePaid: (id: string) => boolean;
  resetFinance: () => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
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
    if (!currentUser || currentUser.role === "Customer" || !input.merchant.trim() || !input.businessPurpose.trim() || input.amount <= 0) return null;
    const id = uid("expense");
    const expense: Expense = { ...input, id, requesterId: currentUser.id, submittedAt: now(), merchant: input.merchant.trim(), businessPurpose: input.businessPurpose.trim(), status: "Submitted" };
    setFinance((state) => ({ ...state, expenses: [expense, ...state.expenses] }));
    return id;
  };

  const canManagerReview = (expense: Expense) => {
    if (!currentUser || expense.requesterId === currentUser.id) return false;
    if (currentUser.role === "Administrator") return true;
    if (currentUser.role !== "Sales Manager") return false;
    const requester = data.users.find((user) => user.id === expense.requesterId);
    return requester?.managerId === currentUser.id || requester?.team === currentUser.team;
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

  const markExpensePaid = (id: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const expense = finance.expenses.find((item) => item.id === id && item.status === "Finance approved");
    if (!expense) return false;
    setFinance((state) => ({ ...state, expenses: state.expenses.map((item) => item.id === id ? { ...item, status: "Paid", paidAt: now(), paidBy: currentUser.id } : item) }));
    return true;
  };

  const resetFinance = () => { if (currentUser?.role === "Administrator") setFinance(createFinanceSeed()); };
  const value: FinanceContextValue = { finance, submitExpense, managerDecision, financeDecision, markExpensePaid, resetFinance };
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance must be used inside FinanceProvider");
  return value;
}
