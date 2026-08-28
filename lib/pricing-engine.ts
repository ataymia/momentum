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
  const paidOrders = orders.filter(isPaid);
  const firstOrder = orders[0];

  const paidBetween = (start: string, end: string, includeStart = false) => paidOrders.filter((order) => (includeStart ? order.placedAt >= start : order.placedAt > start) && order.placedAt <= end);
  const cases = (items: typeof paidOrders) => items.reduce((sum, order) => sum + order.cases, 0);

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
  const introOrders = paidBetween(firstOrderDate, introEnd, true);
  const introCases = cases(introOrders);

  if (asOfKey <= introEnd) {
    return {
      accountId,
      status: openingQualified ? "Intro partner pricing" : "Standard pricing",
      firstOrderDate,
      currentWindowStart: firstOrderDate,
      currentWindowEnd: introEnd,
      countedCases: introCases,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      currentPricePerCase: openingQualified ? rule.partnerPricePerCase : undefined,
      reason: openingQualified
        ? `$${rule.partnerPricePerCase.toFixed(2)} Partner Pricing is active during the first ${rule.introDays} days. ${introCases}/${rule.introQualificationCases} paid cases count toward continuation.`
        : `The opening order was below ${rule.minimumOpeningCases} cases, so introductory Partner Pricing was not activated.`,
      nextReviewDate: introEnd,
      evidenceOrderIds: introOrders.map((order) => order.id),
    };
  }

  let partnerActive = openingQualified && introCases >= rule.introQualificationCases;
  let periodStart = introEnd;

  const findReentry = (inactiveSince: string, through: string) => {
    const candidates = paidOrders.filter((order) => order.placedAt > inactiveSince && order.placedAt <= through);
    for (const order of candidates) {
      const trailingStart = addDays(order.placedAt, -rule.rollingWindowDays);
      const trailing = paidOrders.filter((candidate) => candidate.placedAt > trailingStart && candidate.placedAt <= order.placedAt);
      if (cases(trailing) >= rule.rollingQualificationCases) return { date: order.placedAt, evidence: trailing };
    }
    return null;
  };

  while (periodStart <= asOfKey) {
    if (partnerActive) {
      const periodEnd = addDays(periodStart, rule.rollingWindowDays);
      const periodOrders = paidBetween(periodStart, periodEnd);
      const periodCases = cases(periodOrders);

      if (asOfKey <= periodEnd) {
        return {
          accountId,
          status: "Partner pricing",
          firstOrderDate,
          currentWindowStart: periodStart,
          currentWindowEnd: periodEnd,
          countedCases: periodCases,
          thresholdCases: rule.rollingQualificationCases,
          partnerPricePerCase: rule.partnerPricePerCase,
          currentPricePerCase: rule.partnerPricePerCase,
          reason: `Partner Pricing is active for this ${rule.rollingWindowDays}-day period. ${periodCases}/${rule.rollingQualificationCases} paid cases are recorded toward the next continuation decision.`,
          nextReviewDate: periodEnd,
          evidenceOrderIds: periodOrders.map((order) => order.id),
        };
      }

      if (periodCases >= rule.rollingQualificationCases) {
        periodStart = periodEnd;
        continue;
      }

      partnerActive = false;
      periodStart = periodEnd;
      continue;
    }

    const reentry = findReentry(periodStart, asOfKey);
    if (!reentry) {
      const trailingStart = addDays(asOfKey, -rule.rollingWindowDays);
      const trailingOrders = paidOrders.filter((order) => order.placedAt > trailingStart && order.placedAt <= asOfKey);
      const trailingCases = cases(trailingOrders);
      return {
        accountId,
        status: "Standard pricing",
        firstOrderDate,
        currentWindowStart: trailingStart,
        currentWindowEnd: asOfKey,
        countedCases: trailingCases,
        thresholdCases: rule.rollingQualificationCases,
        partnerPricePerCase: rule.partnerPricePerCase,
        reason: `Partner Pricing is inactive. ${trailingCases}/${rule.rollingQualificationCases} paid cases are present in the current trailing ${rule.rollingWindowDays}-day requalification window.`,
        nextReviewDate: undefined,
        evidenceOrderIds: trailingOrders.map((order) => order.id),
      };
    }

    partnerActive = true;
    periodStart = reentry.date;
  }

  return {
    accountId,
    status: partnerActive ? "Partner pricing" : "Standard pricing",
    firstOrderDate,
    currentWindowStart: periodStart,
    currentWindowEnd: addDays(periodStart, rule.rollingWindowDays),
    countedCases: 0,
    thresholdCases: rule.rollingQualificationCases,
    partnerPricePerCase: rule.partnerPricePerCase,
    currentPricePerCase: partnerActive ? rule.partnerPricePerCase : undefined,
    reason: partnerActive ? "Partner Pricing is active." : "Partner Pricing is inactive pending requalification.",
    nextReviewDate: partnerActive ? addDays(periodStart, rule.rollingWindowDays) : undefined,
    evidenceOrderIds: [],
  };
}
