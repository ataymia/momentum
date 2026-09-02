import type { Account, PricingTier, WorkspaceData } from "./types";

export const ACCOUNT_PRICING_TIERS: Record<PricingTier, { pricePerCase: number; label: string }> = {
  A: { pricePerCase: 24, label: "A · $24/case" },
  B: { pricePerCase: 27, label: "B · $27/case" },
  C: { pricePerCase: 30, label: "C · $30/case" },
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const atNoon = (value: string) => new Date(`${value}T12:00:00`);
const daysBetween = (from: string, through: string) => Math.max(0, Math.floor((atNoon(through).getTime() - atNoon(from).getTime()) / 86_400_000));
const addDays = (value: string, days: number) => { const date = atNoon(value); date.setDate(date.getDate() + days); return dateKey(date); };

export type AccountHealthSnapshot = {
  accountId: string;
  lastOrderDate?: string;
  daysSinceLastOrder?: number;
  lastPaidOrderDate?: string;
  daysSinceLastPaidOrder?: number;
  rolling90PaidCases: number;
  rolling3MonthMonthlyAverage: number;
  rolling90PaidOrderCount: number;
  categoryReviewDate?: string;
  categoryReviewDue: boolean;
  pricingTier?: PricingTier;
  pricePerCase?: number;
};

export function accountHealthSnapshot(data: WorkspaceData, account: Account, asOf = new Date()): AccountHealthSnapshot {
  const asOfKey = dateKey(asOf);
  const orders = data.orders.filter((order) => order.accountId === account.id).sort((a, b) => a.placedAt.localeCompare(b.placedAt) || a.id.localeCompare(b.id));
  const paid = orders.filter((order) => order.paymentStatus === "Paid");
  const lastOrderDate = orders.at(-1)?.placedAt;
  const lastPaidOrderDate = paid.at(-1)?.paidAt ?? paid.at(-1)?.placedAt;
  const rollingStart = addDays(asOfKey, -90);
  const rollingPaid = paid.filter((order) => {
    const settled = order.paidAt ?? order.placedAt;
    return settled > rollingStart && settled <= asOfKey;
  });
  const rolling90PaidCases = rollingPaid.reduce((sum, order) => sum + order.cases, 0);
  const tier = account.pricingTier;
  return {
    accountId: account.id,
    lastOrderDate,
    daysSinceLastOrder: lastOrderDate ? daysBetween(lastOrderDate, asOfKey) : undefined,
    lastPaidOrderDate,
    daysSinceLastPaidOrder: lastPaidOrderDate ? daysBetween(lastPaidOrderDate, asOfKey) : undefined,
    rolling90PaidCases,
    rolling3MonthMonthlyAverage: Math.round((rolling90PaidCases / 3) * 10) / 10,
    rolling90PaidOrderCount: rollingPaid.length,
    categoryReviewDate: account.categoryReviewDate,
    categoryReviewDue: Boolean(account.categoryReviewDate && account.categoryReviewDate <= asOfKey),
    pricingTier: tier,
    pricePerCase: tier ? ACCOUNT_PRICING_TIERS[tier].pricePerCase : undefined,
  };
}

export function pricingTierPrice(tier?: PricingTier) {
  return tier ? ACCOUNT_PRICING_TIERS[tier].pricePerCase : undefined;
}
