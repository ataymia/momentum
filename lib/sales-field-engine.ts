import { addCalendarDays, arizonaDateKey, startOfLocalWeek } from "./date-time";
import type { Account, Activity, WorkspaceData } from "./types";

export const WEEKLY_VISIT_TARGET_MIN = 75;
export const WEEKLY_VISIT_TARGET_STRETCH = 80;
export const PROSPECT_MAX_UNSUCCESSFUL_VISITS = 5;
export const PROSPECT_MAX_OWNERSHIP_DAYS = 90;
export const CUSTOMER_OWNERSHIP_REVIEW_DAYS = 90;

export type WeeklyVisitSummary = {
  userId: string;
  weekStart: string;
  weekEnd: string;
  completed: number;
  targetMin: number;
  targetStretch: number;
  remainingToMinimum: number;
  priorWeekCompleted: number;
  sourceActivityIds: string[];
};

export function clampProspectRating(value: number) {
  if (!Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 10 ? rounded : undefined;
}

/** Red at 1, yellow near 5, green at 10. */
export function prospectRatingColor(value: number | undefined) {
  const score = clampProspectRating(value ?? Number.NaN) ?? 1;
  const hue = Math.round(((score - 1) / 9) * 120);
  return `hsl(${hue} 72% 42%)`;
}

export const isPhysicalVisit = (activity: Activity) => activity.type === "visit" && activity.physicalVisit === true;

export function weeklyVisitSummary(activities: Activity[], userId: string, asOf = arizonaDateKey()): WeeklyVisitSummary {
  const weekStart = startOfLocalWeek(asOf);
  const weekEnd = addCalendarDays(weekStart, 6);
  const priorWeekStart = addCalendarDays(weekStart, -7);
  const priorWeekEnd = addCalendarDays(weekStart, -1);
  const visits = activities.filter((activity) => activity.userId === userId && isPhysicalVisit(activity));
  const current = visits.filter((activity) => {
    const date = arizonaDateKey(activity.at);
    return date >= weekStart && date <= weekEnd;
  });
  const prior = visits.filter((activity) => {
    const date = arizonaDateKey(activity.at);
    return date >= priorWeekStart && date <= priorWeekEnd;
  });
  return {
    userId,
    weekStart,
    weekEnd,
    completed: current.length,
    targetMin: WEEKLY_VISIT_TARGET_MIN,
    targetStretch: WEEKLY_VISIT_TARGET_STRETCH,
    remainingToMinimum: Math.max(0, WEEKLY_VISIT_TARGET_MIN - current.length),
    priorWeekCompleted: prior.length,
    sourceActivityIds: current.map((activity) => activity.id),
  };
}

export function unsuccessfulProspectVisitCount(activities: Activity[], accountId: string, ownerId?: string) {
  return activities.filter((activity) =>
    activity.accountId === accountId &&
    isPhysicalVisit(activity) &&
    activity.visitUnsuccessful === true &&
    (!ownerId || activity.userId === ownerId),
  ).length;
}

function daysSince(dateOrInstant: string, asOf: string) {
  const date = dateOrInstant.length === 10 ? dateOrInstant : arizonaDateKey(dateOrInstant);
  const start = new Date(`${date}T12:00:00-07:00`).getTime();
  const end = new Date(`${asOf}T12:00:00-07:00`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function prospectOwnershipReleaseReason(account: Account, activities: Activity[], asOf = arizonaDateKey()) {
  if (account.stage !== "Prospect" || !account.ownerId) return undefined;
  const unsuccessful = unsuccessfulProspectVisitCount(activities, account.id, account.ownerId);
  if (unsuccessful >= PROSPECT_MAX_UNSUCCESSFUL_VISITS) {
    return `${PROSPECT_MAX_UNSUCCESSFUL_VISITS} unsuccessful physical visits recorded`;
  }
  if (account.responsibilityStartedAt && daysSince(account.responsibilityStartedAt, asOf) >= PROSPECT_MAX_OWNERSHIP_DAYS) {
    return `${PROSPECT_MAX_OWNERSHIP_DAYS}-day prospect ownership window expired`;
  }
  return undefined;
}

export function latestProspectRating(activities: Activity[], accountId: string) {
  return activities
    .filter((activity) => activity.accountId === accountId && isPhysicalVisit(activity) && clampProspectRating(activity.prospectRating ?? Number.NaN) !== undefined)
    .sort((a, b) => b.at.localeCompare(a.at))[0]?.prospectRating;
}

/**
 * Customer inactivity is an alert, not an automatic reassignment. Only two-way commercial evidence counts:
 * a paid/delivered order or an explicitly recorded meaningful-business timestamp.
 */
export function customerOwnershipReview(data: WorkspaceData, account: Account, asOf = arizonaDateKey()) {
  if (["Prospect", "Qualified", "Sampled", "Opening order"].includes(account.stage)) return undefined;
  const commercialDates = data.orders
    .filter((order) => order.accountId === account.id && (order.paymentStatus === "Paid" || ["Delivered", "Paid"].includes(order.status)))
    .map((order) => arizonaDateKey(order.paidAt ?? order.placedAt));
  if (account.lastMeaningfulBusinessAt) commercialDates.push(arizonaDateKey(account.lastMeaningfulBusinessAt));
  const last = commercialDates.sort().at(-1);
  if (!last) return { review: true, daysInactive: undefined as number | undefined, lastMeaningfulAt: undefined as string | undefined };
  const inactive = daysSince(last, asOf);
  return inactive >= CUSTOMER_OWNERSHIP_REVIEW_DAYS ? { review: true, daysInactive: inactive, lastMeaningfulAt: last } : undefined;
}
