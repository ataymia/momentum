import type { WorkspaceData } from "./types";

export const PARTNER_PRICING_RULE = {
  casePack: 24,
  partnerPricePerCan: 1,
  partnerPricePerCase: 24,
  introDays: 60,
  minimumOpeningCases: 10,
  introQualificationCases: 20,
  rollingWindowDays: 90,
  rollingQualificationCases: 20,
};

export type PartnerPricingStatus = "Not started" | "Intro partner pricing" | "Partner pricing" | "Standard pricing";

export type PartnerPricingEvaluation = {
  accountId: string;
  status: PartnerPricingStatus;
  firstOrderDate?: string;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  countedCases: number;
  thresholdCases: number;
  partnerPricePerCase: number;
  currentPricePerCase?: number;
  reason: string;
  nextReviewDate?: string;
  evidenceOrderIds: string[];
};

const dateAtNoon = (value: string) => new Date(`${value}T12:00:00`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const isPaid = (order: WorkspaceData["orders"][number]) => order.status === "Paid" && order.paymentStatus === "Paid";

export function evaluatePartnerPricing(data: WorkspaceData, accountId: string, asOf = new Date()): PartnerPricingEvaluation {
  const rule = PARTNER_PRICING_RULE;
  const asOfKey = dateKey(asOf);
  const orders = data.orders.filter((order) => order.accountId === accountId).sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const firstOrder = orders[0];

  if (!firstOrder) {
    return {
      accountId,
      status: "Not started",
      countedCases: 0,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      reason: `No opening order exists. A qualifying opening order starts the ${rule.introDays}-day introductory window.`,
      evidenceOrderIds: [],
    };
  }

  const firstOrderDate = firstOrder.placedAt;
  const introEnd = addDays(firstOrderDate, rule.introDays);
  const openingQualified = firstOrder.cases >= rule.minimumOpeningCases;
  const paidIntroOrders = orders.filter((order) => order.placedAt >= firstOrderDate && order.placedAt <= introEnd && isPaid(order));
  const introCases = paidIntroOrders.reduce((sum, order) => sum + order.cases, 0);

  if (asOfKey <= introEnd && openingQualified) {
    return {
      accountId,
      status: "Intro partner pricing",
      firstOrderDate,
      currentWindowStart: firstOrderDate,
      currentWindowEnd: introEnd,
      countedCases: introCases,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      currentPricePerCase: rule.partnerPricePerCase,
      reason: `$${rule.partnerPricePerCase.toFixed(2)} partner pricing is active during the first ${rule.introDays} days. ${introCases}/${rule.introQualificationCases} paid cases currently count toward continuation.`,
      nextReviewDate: introEnd,
      evidenceOrderIds: paidIntroOrders.map((order) => order.id),
    };
  }

  if (!openingQualified) {
    return {
      accountId,
      status: "Standard pricing",
      firstOrderDate,
      currentWindowStart: firstOrderDate,
      currentWindowEnd: introEnd,
      countedCases: introCases,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      reason: `The opening order was below ${rule.minimumOpeningCases} cases, so the introductory partner-pricing entry condition was not met.`,
      nextReviewDate: introEnd,
      evidenceOrderIds: paidIntroOrders.map((order) => order.id),
    };
  }

  const introQualified = introCases >= rule.introQualificationCases;
  let windowStart = introEnd;
  let partnerActive = introQualified;
  let mostRecentQualifyingDate: string | undefined;
  let evidenceOrderIds: string[] = [];
  let countedCases = 0;

  while (windowStart <= asOfKey) {
    const windowEnd = addDays(windowStart, rule.rollingWindowDays);
    const paidInWindow = orders.filter((order) => order.placedAt > windowStart && order.placedAt <= windowEnd && isPaid(order));
    countedCases = paidInWindow.reduce((sum, order) => sum + order.cases, 0);
    evidenceOrderIds = paidInWindow.map((order) => order.id);

    if (asOfKey <= windowEnd) {
      if (!partnerActive && countedCases >= rule.rollingQualificationCases) {
        const cumulative: typeof paidInWindow = [];
        let running = 0;
        for (const order of paidInWindow) {
          cumulative.push(order);
          running += order.cases;
          if (running >= rule.rollingQualificationCases) { mostRecentQualifyingDate = order.placedAt; break; }
        }
        const reentryStart = mostRecentQualifyingDate ?? windowStart;
        return {
          accountId,
          status: "Partner pricing",
          firstOrderDate,
          currentWindowStart: reentryStart,
          currentWindowEnd: addDays(reentryStart, rule.rollingWindowDays),
          countedCases,
          thresholdCases: rule.rollingQualificationCases,
          partnerPricePerCase: rule.partnerPricePerCase,
          currentPricePerCase: rule.partnerPricePerCase,
          reason: `The account restored eligibility after reaching ${rule.rollingQualificationCases} paid cases in the active rolling period.`,
          nextReviewDate: addDays(reentryStart, rule.rollingWindowDays),
          evidenceOrderIds,
        };
      }
      return {
        accountId,
        status: partnerActive ? "Partner pricing" : "Standard pricing",
        firstOrderDate,
        currentWindowStart: windowStart,
        currentWindowEnd: windowEnd,
        countedCases,
        thresholdCases: rule.rollingQualificationCases,
        partnerPricePerCase: rule.partnerPricePerCase,
        currentPricePerCase: partnerActive ? rule.partnerPricePerCase : undefined,
        reason: partnerActive
          ? `Partner pricing is active for this ${rule.rollingWindowDays}-day period. ${countedCases}/${rule.rollingQualificationCases} paid cases are recorded toward the next continuation decision.`
          : `Partner pricing is inactive. The account can re-enter after reaching ${rule.rollingQualificationCases} paid cases during the active rolling period.`,
        nextReviewDate: windowEnd,
        evidenceOrderIds,
      };
    }

    partnerActive = countedCases >= rule.rollingQualificationCases;
    windowStart = windowEnd;
  }

  return {
    accountId,
    status: introQualified ? "Partner pricing" : "Standard pricing",
    firstOrderDate,
    currentWindowStart: introEnd,
    currentWindowEnd: addDays(introEnd, rule.rollingWindowDays),
    countedCases: 0,
    thresholdCases: rule.rollingQualificationCases,
    partnerPricePerCase: rule.partnerPricePerCase,
    currentPricePerCase: introQualified ? rule.partnerPricePerCase : undefined,
    reason: introQualified ? "Introductory qualification carried the account into the next partner-pricing window." : "Introductory volume did not qualify for continuation.",
    nextReviewDate: addDays(introEnd, rule.rollingWindowDays),
    evidenceOrderIds: [],
  };
}
