import { isValidCalendarDateKey } from "./date-time";

export const PERIOD_LOCK_STORAGE_KEY = "momentum-period-locks-v1";
export type PeriodLockDomain = "Payroll" | "Accounting" | "Inventory";
export type PeriodLock = { id: string; domain: PeriodLockDomain; startDate: string; endDate: string; reason: string; lockedAt: string; lockedBy: string; releasedAt?: string; releasedBy?: string; releaseReason?: string };
export type PeriodLockState = { version: 1; locks: PeriodLock[] };
export const createPeriodLockSeed = (): PeriodLockState => ({ version: 1, locks: [] });
const periodLockDomains: PeriodLockDomain[] = ["Payroll", "Accounting", "Inventory"];
export const isValidPeriodLockRange = (startDate: string, endDate: string) => isValidCalendarDateKey(startDate) && isValidCalendarDateKey(endDate) && endDate >= startDate;
const validStoredLock = (value: unknown): value is PeriodLock => {
  if (!value || typeof value !== "object") return false;
  const lock = value as Partial<PeriodLock>;
  return typeof lock.id === "string" && lock.id.length > 0
    && periodLockDomains.includes(lock.domain as PeriodLockDomain)
    && typeof lock.startDate === "string" && typeof lock.endDate === "string" && isValidPeriodLockRange(lock.startDate, lock.endDate)
    && typeof lock.reason === "string" && lock.reason.trim().length >= 4
    && typeof lock.lockedAt === "string" && !Number.isNaN(Date.parse(lock.lockedAt))
    && typeof lock.lockedBy === "string" && lock.lockedBy.length > 0
    && (lock.releasedAt === undefined || (typeof lock.releasedAt === "string" && !Number.isNaN(Date.parse(lock.releasedAt))))
    && (lock.releasedBy === undefined || typeof lock.releasedBy === "string")
    && (lock.releaseReason === undefined || typeof lock.releaseReason === "string");
};
export function normalizePeriodLockState(input: unknown): PeriodLockState {
  if (!input || typeof input !== "object") return createPeriodLockSeed();
  const state = input as Partial<PeriodLockState>;
  return { version: 1, locks: Array.isArray(state.locks) ? state.locks.filter(validStoredLock) : [] };
}
export const activePeriodLocks = (state: PeriodLockState, domain?: PeriodLockDomain) => state.locks.filter((lock) => !lock.releasedAt && (!domain || lock.domain === domain));
export const rangesOverlap = (startA: string, endA: string, startB: string, endB: string) => isValidPeriodLockRange(startA, endA) && isValidPeriodLockRange(startB, endB) && startA <= endB && startB <= endA;
export const isDateLocked = (state: PeriodLockState, domain: PeriodLockDomain, date: string) => isValidCalendarDateKey(date) && activePeriodLocks(state, domain).some((lock) => date >= lock.startDate && date <= lock.endDate);
export const isRangeLocked = (state: PeriodLockState, domain: PeriodLockDomain, startDate: string, endDate: string) => isValidPeriodLockRange(startDate, endDate) && activePeriodLocks(state, domain).some((lock) => rangesOverlap(lock.startDate, lock.endDate, startDate, endDate));
