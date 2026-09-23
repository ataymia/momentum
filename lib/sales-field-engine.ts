import { addCalendarDays, arizonaDateKey, startOfLocalWeek } from "./date-time";
import type { CrmInteraction } from "./crm-engine";
import type { Account, WorkspaceData } from "./types";

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
  sourceInteractionIds: string[];
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

export const isPhysicalVisit = (interaction: CrmInteraction) => interaction.type === "Visit" && interaction.physicalVisit === true;

export function weeklyVisitSummary(interactions: CrmInteraction[], userId: string, asOf = arizonaDateKey()): WeeklyVisitSummary {
  const weekStart = startOfLocalWeek(asOf);
  const weekEnd = addCalendarDays(weekStart, 6);
  const priorWeekStart = addCalendarDays(weekStart, -7);
  const priorWeekEnd = addCalendarDays(weekStart, -1);
  const visits = interactions.filter((interaction) => interaction.userId === userId && isPhysicalVisit(interaction));
  const current = visits.filter((interaction) => {
    const date = arizonaDateKey(interaction.occurredAt);
    return date >= weekStart && date <= weekEnd;
  });
  const prior = visits.filter((interaction) => {
    const date = arizonaDateKey(interaction.occurredAt);
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
    sourceInteractionIds: current.map((interaction) => interaction.id),
  };
}

export function unsuccessfulProspectVisitCount(interactions: CrmInteraction[], accountId: string, ownerId?: string) {
  return interactions.filter((interaction) =>
    interaction.locationId === accountId &&
    isPhysicalVisit(interaction) &&
    interaction.visitUnsuccessful === true &&
    (!ownerId || interaction.userId === ownerId),
  ).length;
}

function daysSince(dateOrInstant: string, asOf: string) {
  const date = dateOrInstant.length === 10 ? dateOrInstant : arizonaDateKey(dateOrInstant);
  const start = new Date(`${date}T12:00:00-07:00`).getTime();
  const end = new Date(`${asOf}T12:00:00-07:00`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function prospectOwnershipReleaseReason(account: Account, interactions: CrmInteraction[], asOf = arizonaDateKey()) {
  if (account.stage !== "Prospect" || !account.ownerId) return undefined;
  const unsuccessful = unsuccessfulProspectVisitCount(interactions, account.id, account.ownerId);
  if (unsuccessful >= PROSPECT_MAX_UNSUCCESSFUL_VISITS) {
    return `${PROSPECT_MAX_UNSUCCESSFUL_VISITS} unsuccessful physical visits recorded`;
  }
  if (account.responsibilityStartedAt && daysSince(account.responsibilityStartedAt, asOf) >= PROSPECT_MAX_OWNERSHIP_DAYS) {
    return `${PROSPECT_MAX_OWNERSHIP_DAYS}-day prospect ownership window expired`;
  }
  return undefined;
}

export function latestProspectRating(interactions: CrmInteraction[], accountId: string) {
  return interactions
    .filter((interaction) => interaction.locationId === accountId && isPhysicalVisit(interaction) && clampProspectRating(interaction.prospectRating ?? Number.NaN) !== undefined)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]?.prospectRating;
}

/**
 * Customer inactivity is an alert, not an automatic reassignment. Only two-way commercial evidence counts:
 * a paid/delivered order or an explicitly recorded meaningful-business timestamp when one exists.
 */
export function customerOwnershipReview(data: WorkspaceData, account: Account, asOf = arizonaDateKey()) {
  if (["Prospect", "Qualified", "Sampled", "Opening order"].includes(account.stage)) return undefined;
  const commercialDates = data.orders
    .filter((order) => order.accountId === account.id && (order.paymentStatus === "Paid" || ["Delivered", "Paid"].includes(order.status)))
    .map((order) => arizonaDateKey(order.paidAt ?? order.placedAt));
  const accountWithMeaningful = account as Account & { lastMeaningfulBusinessAt?: string };
  if (accountWithMeaningful.lastMeaningfulBusinessAt) commercialDates.push(arizonaDateKey(accountWithMeaningful.lastMeaningfulBusinessAt));
  const last = commercialDates.sort().at(-1);
  if (!last) return { review: true, daysInactive: undefined as number | undefined, lastMeaningfulAt: undefined as string | undefined };
  const inactive = daysSince(last, asOf);
  return inactive >= CUSTOMER_OWNERSHIP_REVIEW_DAYS ? { review: true, daysInactive: inactive, lastMeaningfulAt: last } : undefined;
}

export type WeeklySalesManagementSummary = {
  userId:string;weekStart:string;weekEnd:string;visits:number;orders:number;orderCases:number;orderValue:number;
  reorders:number;newAccounts:number;promisingProspects:number;followUpsDue:number;blockers:number;
};

export function weeklySalesManagementSummary(data:WorkspaceData,interactions:CrmInteraction[],userId:string,asOf=arizonaDateKey()):WeeklySalesManagementSummary{
  const weekStart=startOfLocalWeek(asOf);const weekEnd=addCalendarDays(weekStart,6);const inWeek=(value:string|undefined)=>{if(!value)return false;const date=arizonaDateKey(value);return date>=weekStart&&date<=weekEnd;};
  const visits=weeklyVisitSummary(interactions,userId,asOf).completed;
  const orders=data.orders.filter((order)=>(order.creditedRepId===userId||(!order.creditedRepId&&order.ownerId===userId))&&inWeek(order.placedAt));
  const reorders=orders.filter((order)=>data.orders.some((prior)=>prior.accountId===order.accountId&&prior.id!==order.id&&prior.placedAt<order.placedAt)).length;
  const newAccounts=new Set(data.activities.filter((activity)=>activity.userId===userId&&activity.accountId&&activity.title==="Customer location created"&&inWeek(activity.at)).map((activity)=>activity.accountId)).size;
  const promisingProspects=data.accounts.filter((account)=>account.ownerId===userId&&["Prospect","Qualified","Sampled"].includes(account.stage)&&(latestProspectRating(interactions,account.id)??0)>=7).length;
  const followUpsDue=interactions.filter((interaction)=>interaction.userId===userId&&Boolean(interaction.nextAction?.trim())&&inWeek(interaction.nextActionDate)).length;
  const returnedApprovals=data.approvals.filter((approval)=>approval.requesterId===userId&&approval.status==="Returned"&&inWeek(approval.decidedAt??approval.submittedAt)).length;
  const atRisk=data.accounts.filter((account)=>account.ownerId===userId&&account.health==="At risk").length;
  return{userId,weekStart,weekEnd,visits,orders:orders.length,orderCases:orders.reduce((sum,order)=>sum+order.cases,0),orderValue:orders.reduce((sum,order)=>sum+order.amount,0),reorders,newAccounts,promisingProspects,followUpsDue,blockers:returnedApprovals+atRisk};
}
