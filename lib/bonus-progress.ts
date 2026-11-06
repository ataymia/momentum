import type { BonusMilestone, BonusMilestoneStatus } from "./bonus-engine";

/** A display projection only: neither an earning decision nor a payable payroll record. */
export type AccountBonusProgress = {
  accountId: string;
  repId: string;
  opening: BonusMilestone;
  sustained: BonusMilestone;
  settledCases: number;
  targetCases: number;
  remainingCases: number;
  percent: number;
  windowEnd?: string;
};

export type BonusProgressSort = "account" | "representative" | "cases" | "remaining" | "deadline";
export type BonusProgressDirection = "asc" | "desc";

export type AccountBonusProgressFilter = {
  repId?: string;
  status?: BonusMilestoneStatus;
  accountSearch?: string;
  sort?: BonusProgressSort;
  direction?: BonusProgressDirection;
  accountNames?: ReadonlyMap<string, string>;
  repNames?: ReadonlyMap<string, string>;
};

/**
 * One continuous actual settled-case progress bar per account towards 40.
 * The approved 10-case opening and 40-case sustained bonuses remain distinct
 * earning gates. No 20-case bonus exists. Never sum opening and sustained
 * observedCases: the opening cases are already included in sustained cases.
 */
export function accountBonusProgress(
  milestones: readonly BonusMilestone[],
  filters: AccountBonusProgressFilter = {},
): AccountBonusProgress[] {
  const byAccount = new Map<string, { opening?: BonusMilestone; sustained?: BonusMilestone }>();
  for (const milestone of milestones) {
    if (!milestone.accountId || !milestone.repId) continue;
    const group: { opening?: BonusMilestone; sustained?: BonusMilestone } = byAccount.get(milestone.accountId) ?? {};
    if (milestone.milestone === "Opening order" && !group.opening) group.opening = milestone;
    if (milestone.milestone === "Sustained account" && !group.sustained) group.sustained = milestone;
    byAccount.set(milestone.accountId, group);
  }
  const search = filters.accountSearch?.trim().toLowerCase();
  const rows: AccountBonusProgress[] = [];
  for (const [accountId, group] of byAccount) {
    if (!group.opening || !group.sustained) continue;
    if (group.opening.repId !== group.sustained.repId) continue; // inconsistent attribution must not be silently combined
    const repId = group.opening.repId;
    if (filters.repId && filters.repId !== "all" && filters.repId !== repId) continue;
    if (filters.status && filters.status !== group.opening.status && filters.status !== group.sustained.status) continue;
    const accountName = filters.accountNames?.get(accountId) ?? accountId;
    if (search && !accountName.toLowerCase().includes(search)) continue;
    const settledCases = Number.isFinite(group.sustained.observedCases)
      ? Math.max(0, group.sustained.observedCases) : 0;
    const targetCases = group.sustained.thresholdCases;
    if (!Number.isFinite(targetCases) || targetCases <= 0) continue;
    rows.push({
      accountId, repId,
      opening: group.opening, sustained: group.sustained,
      settledCases, targetCases,
      remainingCases: Math.max(0, targetCases - settledCases),
      percent: Math.min(100, Math.round((settledCases / targetCases) * 100)),
      windowEnd: group.sustained.windowEnd,
    });
  }
  const direction = filters.direction === "desc" ? -1 : 1;
  const sort = filters.sort ?? "remaining";
  const compare = (a: AccountBonusProgress, b: AccountBonusProgress) => {
    const accountA = filters.accountNames?.get(a.accountId) ?? a.accountId;
    const accountB = filters.accountNames?.get(b.accountId) ?? b.accountId;
    const repA = filters.repNames?.get(a.repId) ?? a.repId;
    const repB = filters.repNames?.get(b.repId) ?? b.repId;
    switch (sort) {
      case "account": return accountA.localeCompare(accountB);
      case "representative": return repA.localeCompare(repB) || accountA.localeCompare(accountB);
      case "cases": return a.settledCases - b.settledCases;
      case "remaining": return a.remainingCases - b.remainingCases;
      case "deadline": return (a.windowEnd ?? "9999-12-31").localeCompare(b.windowEnd ?? "9999-12-31");
    }
  };
  return rows.sort((a,b) => direction * (compare(a,b) || a.accountId.localeCompare(b.accountId)));
}
