import type { OrderStatus, WorkspaceData } from "./types";

export const SALES_REP_ACCOUNT_BONUS_RULE = {
  openingOrderCases: 10,
  openingBonusAmount: 25,
  sustainedAccountCases: 40,
  sustainedBonusAmount: 25,
  windowDays: 90,
  countedStatuses: ["Delivered", "Paid"] as OrderStatus[],
  countingBasisLabel: "Delivered / paid orders (demo proxy; final earned-state rule still requires owner confirmation)",
};

export type BonusMilestoneStatus = "Not started" | "Tracking" | "Eligibility detected" | "Window expired";

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

export function evaluateSalesRepAccountBonuses(data: WorkspaceData, asOf = new Date()): BonusMilestone[] {
  const rule = SALES_REP_ACCOUNT_BONUS_RULE;
  const counted = new Set<OrderStatus>(rule.countedStatuses);
  const repIds = new Set(data.users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
  const asOfKey = dateKey(asOf);
  const signals: BonusMilestone[] = [];

  for (const account of data.accounts.filter((item) => repIds.has(item.ownerId))) {
    const completedOrders = data.orders
      .filter((order) => order.accountId === account.id && counted.has(order.status))
      .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    const firstCompletedOrder = completedOrders[0];

    if (!firstCompletedOrder) {
      signals.push({
        id: `bonus-${account.id}-opening`, accountId: account.id, repId: account.ownerId,
        milestone: "Opening order", amount: rule.openingBonusAmount, thresholdCases: rule.openingOrderCases,
        observedCases: 0, status: "Not started", evidenceOrderIds: [],
        ruleNote: `First qualifying order must be at least ${rule.openingOrderCases} cases.`,
      });
      signals.push({
        id: `bonus-${account.id}-sustained`, accountId: account.id, repId: account.ownerId,
        milestone: "Sustained account", amount: rule.sustainedBonusAmount, thresholdCases: rule.sustainedAccountCases,
        observedCases: 0, status: "Not started", evidenceOrderIds: [],
        ruleNote: `${rule.sustainedAccountCases} cumulative cases within ${rule.windowDays} days after the account window starts.`,
      });
      continue;
    }

    const openingEligible = firstCompletedOrder.cases >= rule.openingOrderCases;
    const windowStart = firstCompletedOrder.placedAt;
    const windowEnd = addDays(windowStart, rule.windowDays);
    const ordersInWindow = completedOrders.filter((order) => order.placedAt >= windowStart && order.placedAt <= windowEnd);
    const cumulativeCases = ordersInWindow.reduce((sum, order) => sum + order.cases, 0);
    const expired = asOfKey > windowEnd;

    signals.push({
      id: `bonus-${account.id}-opening`, accountId: account.id, repId: account.ownerId,
      milestone: "Opening order", amount: rule.openingBonusAmount, thresholdCases: rule.openingOrderCases,
      observedCases: firstCompletedOrder.cases,
      status: openingEligible ? "Eligibility detected" : "Window expired",
      windowStart, windowEnd,
      evidenceOrderIds: [firstCompletedOrder.id],
      ruleNote: `Opening-order signal uses the first completed order on record. Counting basis: ${rule.countingBasisLabel}.`,
    });

    signals.push({
      id: `bonus-${account.id}-sustained`, accountId: account.id, repId: account.ownerId,
      milestone: "Sustained account", amount: rule.sustainedBonusAmount, thresholdCases: rule.sustainedAccountCases,
      observedCases: cumulativeCases,
      status: openingEligible && cumulativeCases >= rule.sustainedAccountCases ? "Eligibility detected" : expired ? "Window expired" : "Tracking",
      windowStart, windowEnd,
      evidenceOrderIds: ordersInWindow.map((order) => order.id),
      ruleNote: `${rule.sustainedAccountCases} cumulative cases within ${rule.windowDays} days. This is an eligibility signal, not a payroll payment instruction.`,
    });
  }

  return signals;
}
