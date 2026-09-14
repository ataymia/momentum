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
  paymentReference?: string;
  returnReason?: string;
};
export type FinanceState = { version: 3; expenses: Expense[] };

const statuses = new Set<ExpenseStatus>(["Submitted", "Manager approved", "Returned", "Finance approved", "Paid"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
const uniqueById = (records: Expense[]) => {
  const seen = new Set<string>();
  return records.filter((record) => !seen.has(record.id) && (seen.add(record.id), true));
};

export function createFinanceSeed(): FinanceState {
  return { version: 3, expenses: [] };
}

export function normalizeFinanceState(input: unknown): FinanceState {
  if (!input || typeof input !== "object") return createFinanceSeed();
  const state = input as Partial<FinanceState>;
  const expenses = uniqueById((Array.isArray(state.expenses) ? state.expenses : []).filter((expense): expense is Expense => {
    if (!expense?.id || !expense.requesterId || !expense.merchant?.trim() || !expense.category?.trim() || !expense.businessPurpose?.trim() || !Number.isFinite(expense.amount) || expense.amount <= 0 || !statuses.has(expense.status) || !validInstant(expense.submittedAt)) return false;
    if (expense.managerDecisionAt && !validInstant(expense.managerDecisionAt)) return false;
    if (expense.financeDecisionAt && !validInstant(expense.financeDecisionAt)) return false;
    if (expense.paidAt && !validInstant(expense.paidAt)) return false;
    if (expense.status === "Manager approved" && (!expense.managerReviewerId || !expense.managerDecisionAt)) return false;
    if (expense.status === "Finance approved" && (!expense.managerReviewerId || !expense.managerDecisionAt || !expense.financeReviewerId || !expense.financeDecisionAt)) return false;
    if (expense.status === "Paid" && (!expense.managerReviewerId || !expense.managerDecisionAt || !expense.financeReviewerId || !expense.financeDecisionAt || !expense.paidBy || !expense.paidAt || !expense.paymentReference?.trim())) return false;
    if (expense.status === "Returned" && !expense.returnReason?.trim()) return false;
    return true;
  }));
  return { version: 3, expenses };
}
