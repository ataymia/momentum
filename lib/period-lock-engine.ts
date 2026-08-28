export const PERIOD_LOCK_STORAGE_KEY = "momentum-period-locks-v1";
export type PeriodLockDomain = "Payroll" | "Accounting" | "Inventory";
export type PeriodLock = { id: string; domain: PeriodLockDomain; startDate: string; endDate: string; reason: string; lockedAt: string; lockedBy: string; releasedAt?: string; releasedBy?: string; releaseReason?: string };
export type PeriodLockState = { version: 1; locks: PeriodLock[] };
export const createPeriodLockSeed = (): PeriodLockState => ({ version: 1, locks: [] });
export function normalizePeriodLockState(input: unknown): PeriodLockState { if (!input || typeof input !== "object") return createPeriodLockSeed(); const state = input as Partial<PeriodLockState>; return { version: 1, locks: Array.isArray(state.locks) ? state.locks : [] }; }
export const activePeriodLocks = (state: PeriodLockState, domain?: PeriodLockDomain) => state.locks.filter((lock) => !lock.releasedAt && (!domain || lock.domain === domain));
export const rangesOverlap = (startA: string, endA: string, startB: string, endB: string) => startA <= endB && startB <= endA;
export const isDateLocked = (state: PeriodLockState, domain: PeriodLockDomain, date: string) => activePeriodLocks(state, domain).some((lock) => date >= lock.startDate && date <= lock.endDate);
export const isRangeLocked = (state: PeriodLockState, domain: PeriodLockDomain, startDate: string, endDate: string) => activePeriodLocks(state, domain).some((lock) => rangesOverlap(lock.startDate, lock.endDate, startDate, endDate));
