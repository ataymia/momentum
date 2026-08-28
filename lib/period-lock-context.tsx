"use client";

import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { PERIOD_LOCK_STORAGE_KEY, PeriodLock, PeriodLockDomain, PeriodLockState, createPeriodLockSeed, isDateLocked, isRangeLocked, normalizePeriodLockState } from "./period-lock-engine";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

const uid = () => `period-lock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
type PeriodLockContextValue = { state: PeriodLockState; createLock: (domain: PeriodLockDomain, startDate: string, endDate: string, reason: string) => string | null; releaseLock: (id: string, reason: string) => boolean; isLocked: (domain: PeriodLockDomain, date: string) => boolean; isRangeLocked: (domain: PeriodLockDomain, startDate: string, endDate: string) => boolean; resetLocks: () => boolean };
const PeriodLockContext = createContext<PeriodLockContextValue | null>(null);
function readState() { if (typeof window === "undefined") return createPeriodLockSeed(); try { return normalizePeriodLockState(JSON.parse(window.localStorage.getItem(PERIOD_LOCK_STORAGE_KEY) ?? "null")); } catch { return createPeriodLockSeed(); } }

export function PeriodLockProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useWorkspace(); const { isDemo } = useRuntimeMode(); const [state, setState] = useState<PeriodLockState>(() => readState());
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(PERIOD_LOCK_STORAGE_KEY, JSON.stringify(state)); }, [state]);
  const createLock = (domain: PeriodLockDomain, startDate: string, endDate: string, reason: string) => { if (currentUser?.role !== "Administrator" || !startDate || !endDate || endDate < startDate || reason.trim().length < 4) return null; const id = uid(); const record: PeriodLock = { id, domain, startDate, endDate, reason: reason.trim(), lockedAt: new Date().toISOString(), lockedBy: currentUser.id }; setState((current) => ({ ...current, locks: [record, ...current.locks] })); return id; };
  const releaseLock = (id: string, reason: string) => { if (currentUser?.role !== "Administrator" || reason.trim().length < 4) return false; const target = state.locks.find((lock) => lock.id === id && !lock.releasedAt); if (!target) return false; const releasedAt = new Date().toISOString(); setState((current) => ({ ...current, locks: current.locks.map((lock) => lock.id === id && !lock.releasedAt ? { ...lock, releasedAt, releasedBy: currentUser.id, releaseReason: reason.trim() } : lock) })); return true; };
  const resetLocks = () => { if (!isDemo || currentUser?.role !== "Administrator") return false; setState(createPeriodLockSeed()); return true; };
  return <PeriodLockContext.Provider value={{ state, createLock, releaseLock, isLocked: (domain, date) => isDateLocked(state, domain, date), isRangeLocked: (domain, startDate, endDate) => isRangeLocked(state, domain, startDate, endDate), resetLocks }}>{children}</PeriodLockContext.Provider>;
}
export function usePeriodLocks() { const value = useContext(PeriodLockContext); if (!value) throw new Error("usePeriodLocks must be used inside PeriodLockProvider"); return value; }
