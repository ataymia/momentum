import type { WorkspaceData } from "./types";

export const SALES_REP_ACCOUNT_BONUS_RULE = {
  openingOrderCases: 10,
  openingBonusAmount: 25,
  sustainedAccountCases: 40,
  sustainedBonusAmount: 25,
  windowDays: 90,
  countingBasisLabel: "Paid orders only; 90-day clock starts on the first order date",
};

export type BonusMilestoneStatus = "Not started" | "Awaiting payment" | "Tracking" | "Earned" | "Window expired" | "Not qualified";

export type BonusMilestone = {
  id: string;
  accountId: string;
  repId: string;
  milestone: "Opening order" | "Sustained account";
  amount: number;
  thresholdCases: number;
  observedCases: number;
  status: BonusMilestoneStatus;
  windowStart?: string;
  windowEnd?: string;
  evidenceOrderIds: string[];
  ruleNote: string;
};

const dateAtNoon = (value: string) => new Date(`${value}T12:00:00`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const isPaid = (order: WorkspaceData["orders"][number]) => order.status === "Paid" && order.paymentStatus === "Paid";

export function evaluateSalesRepAccountBonuses(data: WorkspaceData, asOf = new Date()): BonusMilestone[] {
  const rule = SALES_REP_ACCOUNT_BONUS_RULE;
  const repIds = new Set(data.users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
  const asOfKey = dateKey(asOf);
  const signals: BonusMilestone[] = [];

  for (const account of data.accounts.filter((item) => repIds.has(item.ownerId))) {
    const allOrders = data.orders
      .filter((order) => order.accountId === account.id)
      .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    const firstOrder = allOrders[0];

    if (!firstOrder) {
      signals.push({
        id: `bonus-${account.id}-opening`, accountId: account.id, repId: account.ownerId,
        milestone: "Opening order", amount: rule.openingBonusAmount, thresholdCases: rule.openingOrderCases,
        observedCases: 0, status: "Not started", evidenceOrderIds: [],
        ruleNote: `The first order must be at least ${rule.openingOrderCases} cases and payment must clear before the bonus is earned.`,
      });
      signals.push({
        id: `bonus-${account.id}-sustained`, accountId: account.id, repId: account.ownerId,
        milestone: "Sustained account", amount: rule.sustainedBonusAmount, thresholdCases: rule.sustainedAccountCases,
        observedCases: 0, status: "Not started", evidenceOrderIds: [],
        ruleNote: `The ${rule.windowDays}-day clock begins when the first order is placed. Only paid orders count toward the ${rule.sustainedAccountCases}-case milestone.`,
      });
      continue;
    }

    const windowStart = firstOrder.placedAt;
    const windowEnd = addDays(windowStart, rule.windowDays);
    const openingQualified = firstOrder.cases >= rule.openingOrderCases;
    const openingPaid = isPaid(firstOrder);
    const paidOrdersInWindow = allOrders.filter((order) => order.placedAt >= windowStart && order.placedAt <= windowEnd && isPaid(order));
    const cumulativePaidCases = paidOrdersInWindow.reduce((sum, order) => sum + order.cases, 0);
    const expired = asOfKey > windowEnd;

    signals.push({
      id: `bonus-${account.id}-opening`, accountId: account.id, repId: account.ownerId,
      milestone: "Opening order", amount: rule.openingBonusAmount, thresholdCases: rule.openingOrderCases,
      observedCases: firstOrder.cases,
      status: !openingQualified ? "Not qualified" : openingPaid ? "Earned" : "Awaiting payment",
      windowStart, windowEnd,
      evidenceOrderIds: [firstOrder.id],
      ruleNote: openingQualified
        ? `Opening order met the ${rule.openingOrderCases}-case threshold. The $${rule.openingBonusAmount} becomes earned only after that order is paid.`
        : `The first order was below ${rule.openingOrderCases} cases, so it does not earn the opening-order bonus.`,
    });

    signals.push({
      id: `bonus-${account.id}-sustained`, accountId: account.id, repId: account.ownerId,
      milestone: "Sustained account", amount: rule.sustainedBonusAmount, thresholdCases: rule.sustainedAccountCases,
      observedCases: cumulativePaidCases,
      status: cumulativePaidCases >= rule.sustainedAccountCases ? "Earned" : expired ? "Window expired" : "Tracking",
      windowStart, windowEnd,
      evidenceOrderIds: paidOrdersInWindow.map((order) => order.id),
      ruleNote: `${cumulativePaidCases}/${rule.sustainedAccountCases} paid cases inside the ${rule.windowDays}-day window that began with the first order on ${windowStart}.`,
    });
  }

  return signals;
}
