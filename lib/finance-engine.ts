export const FINANCE_STORAGE_KEY = "momentum-finance-v3";

export type ExpenseStatus = "Submitted" | "Manager approved" | "Returned" | "Finance approved" | "Paid";
export type Expense = {
  id: string;
  requesterId: string;
  submittedAt: string;
  merchant: string;
  amount: number;
  category: string;
  businessPurpose: string;
  receiptName?: string;
  accountId?: string;
  status: ExpenseStatus;
  managerDecisionAt?: string;
  managerReviewerId?: string;
  financeDecisionAt?: string;
  financeReviewerId?: string;
  paidAt?: string;
  paidBy?: string;
  returnReason?: string;
};
export type FinanceState = { version: 3; expenses: Expense[] };

export function createFinanceSeed(): FinanceState {
  return { version: 3, expenses: [] };
}

export function normalizeFinanceState(input: unknown): FinanceState {
  if (!input || typeof input !== "object") return createFinanceSeed();
  const state = input as Partial<FinanceState>;
  return { version: 3, expenses: Array.isArray(state.expenses) ? state.expenses : [] };
}
