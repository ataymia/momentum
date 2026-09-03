import { ACCOUNT_PRICING_TIERS } from "./account-health";
import type { PricingTier, WorkspaceData } from "./types";

export const PARTNER_PRICING_RULE = {
  casePack: 24,
  partnerPricePerCan: 1,
  partnerPricePerCase: 24,
  introDays: 60,
  introQualificationCases: 20,
  rollingWindowDays: 90,
  rollingQualificationCases: 20,
};

export type PartnerPricingStatus = "Not started" | "Intro partner pricing" | "Partner pricing" | "Standard pricing";
export type PartnerPricingEvaluation = {
  accountId: string;
  status: PartnerPricingStatus;
  effectiveTier?: PricingTier;
  outsidePartnerTier?: Exclude<PricingTier, "A">;
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
const isPaid = (order: WorkspaceData["orders"][number]) => order.paymentStatus === "Paid";

export function evaluatePartnerPricing(data: WorkspaceData, accountId: string, asOf = new Date()): PartnerPricingEvaluation {
  const account = data.accounts.find((item) => item.id === accountId);
  const orders = data.orders
    .filter((order) => order.accountId === accountId)
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt) || a.id.localeCompare(b.id));
  const paidOrders = orders.filter(isPaid);
  const firstOrder = orders[0];
  const rule = PARTNER_PRICING_RULE;
  const asOfKey = dateKey(asOf);
  const outsidePartnerTier = account?.pricingTier === "B" || account?.pricingTier === "C" ? account.pricingTier : undefined;
  const outsidePartnerPrice = outsidePartnerTier ? ACCOUNT_PRICING_TIERS[outsidePartnerTier].pricePerCase : undefined;
  const paidBetween = (start: string, end: string, includeStart = false) => paidOrders.filter((order) => (includeStart ? order.placedAt >= start : order.placedAt > start) && order.placedAt <= end);
  const cases = (items: typeof paidOrders) => items.reduce((sum, order) => sum + order.cases, 0);

  if (!firstOrder) {
    return {
      accountId,
      status: "Not started",
      effectiveTier: "A",
      outsidePartnerTier,
      countedCases: 0,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      currentPricePerCase: rule.partnerPricePerCase,
      reason: `The opening order starts at Tier A / Partner Pricing at $${rule.partnerPricePerCase.toFixed(2)} per case. The first order starts the ${rule.introDays}-day introductory window.`,
      evidenceOrderIds: [],
    };
  }

  const firstOrderDate = firstOrder.placedAt;
  const introEnd = addDays(firstOrderDate, rule.introDays);
  const introOrders = paidBetween(firstOrderDate, introEnd, true);
  const introCases = cases(introOrders);

  if (asOfKey <= introEnd) {
    return {
      accountId,
      status: "Intro partner pricing",
      effectiveTier: "A",
      outsidePartnerTier,
      firstOrderDate,
      currentWindowStart: firstOrderDate,
      currentWindowEnd: introEnd,
      countedCases: introCases,
      thresholdCases: rule.introQualificationCases,
      partnerPricePerCase: rule.partnerPricePerCase,
      currentPricePerCase: rule.partnerPricePerCase,
      reason: `New accounts begin at Tier A / Partner Pricing for the first ${rule.introDays} days. ${rule.introQualificationCases} paid cases during this window retain Tier A into the next eligibility period.`,
      nextReviewDate: introEnd,
      evidenceOrderIds: introOrders.map((order) => order.id),
    };
  }

  let partnerActive = introCases >= rule.introQualificationCases;
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
          effectiveTier: "A",
          outsidePartnerTier,
          firstOrderDate,
          currentWindowStart: periodStart,
          currentWindowEnd: periodEnd,
          countedCases: periodCases,
          thresholdCases: rule.rollingQualificationCases,
          partnerPricePerCase: rule.partnerPricePerCase,
          currentPricePerCase: rule.partnerPricePerCase,
          reason: `Tier A / Partner Pricing is active. ${rule.rollingQualificationCases} paid cases in this ${rule.rollingWindowDays}-day eligibility period retain the $${rule.partnerPricePerCase.toFixed(2)} case price for the next period.`,
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
        effectiveTier: outsidePartnerTier,
        outsidePartnerTier,
        firstOrderDate,
        currentWindowStart: trailingStart,
        currentWindowEnd: asOfKey,
        countedCases: trailingCases,
        thresholdCases: rule.rollingQualificationCases,
        partnerPricePerCase: rule.partnerPricePerCase,
        currentPricePerCase: outsidePartnerPrice,
        reason: outsidePartnerTier
          ? `Partner Pricing is inactive. Tier ${outsidePartnerTier} is the current outside-Partner tier at $${outsidePartnerPrice?.toFixed(2)} per case. Restoring ${rule.rollingQualificationCases} paid cases inside a rolling ${rule.rollingWindowDays}-day window requalifies the account for Tier A.`
          : `Partner Pricing is inactive. An authorized Tier B ($${ACCOUNT_PRICING_TIERS.B.pricePerCase.toFixed(2)}) or Tier C ($${ACCOUNT_PRICING_TIERS.C.pricePerCase.toFixed(2)}) must be assigned for outside-Partner pricing. The B-versus-C assignment criteria are not yet configured.`,
        evidenceOrderIds: trailingOrders.map((order) => order.id),
      };
    }

    partnerActive = true;
    periodStart = reentry.date;
  }

  return {
    accountId,
    status: partnerActive ? "Partner pricing" : "Standard pricing",
    effectiveTier: partnerActive ? "A" : outsidePartnerTier,
    outsidePartnerTier,
    firstOrderDate,
    currentWindowStart: periodStart,
    currentWindowEnd: partnerActive ? addDays(periodStart, rule.rollingWindowDays) : asOfKey,
    countedCases: 0,
    thresholdCases: rule.rollingQualificationCases,
    partnerPricePerCase: rule.partnerPricePerCase,
    currentPricePerCase: partnerActive ? rule.partnerPricePerCase : outsidePartnerPrice,
    reason: partnerActive
      ? `The account requalified for Tier A / Partner Pricing on ${periodStart}. The requalification order starts the new ${rule.rollingWindowDays}-day period and is not counted again toward the next continuation threshold.`
      : "Partner Pricing is inactive.",
    nextReviewDate: partnerActive ? addDays(periodStart, rule.rollingWindowDays) : undefined,
    evidenceOrderIds: [],
  };
}
