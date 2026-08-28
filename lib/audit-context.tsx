"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AUDIT_STORAGE_KEY, AuditEvent, AuditState, collectAuditableRecords, createAuditSeed, diffAuditableRecords, mergeAuditSnapshots, normalizeAuditState, visibleAuditEvents } from "./audit-engine";
import { useAccounting } from "./accounting-context";
import { useCommerce } from "./commerce-context";
import { useCrm } from "./crm-context";
import { useFinance } from "./finance-context";
import { useHcm } from "./hcm-context";
import { useInventoryLedger } from "./inventory-ledger-context";
import { useMarketing } from "./marketing-context";
import { usePayroll } from "./payroll-context";
import { usePerformance } from "./performance-context";
import { usePeriodLocks } from "./period-lock-context";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

type AuditContextValue = { audit: AuditState; visibleEvents: AuditEvent[]; eventsForRecord: (entityType: string, entityId: string) => AuditEvent[]; eventsForAccount: (accountId: string) => AuditEvent[]; resetAudit: () => boolean };
const AuditContext = createContext<AuditContextValue | null>(null);

function readAudit() { if (typeof window === "undefined") return createAuditSeed(); try { return normalizeAuditState(JSON.parse(window.localStorage.getItem(AUDIT_STORAGE_KEY) ?? "null")); } catch { return createAuditSeed(); } }

export function AuditProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace(); const { crm } = useCrm(); const { hcm } = useHcm(); const { payroll } = usePayroll(); const { performance } = usePerformance(); const { commerce } = useCommerce(); const { ledger } = useInventoryLedger(); const { finance } = useFinance(); const { accounting } = useAccounting(); const { state: marketing } = useMarketing(); const { state: periodLocks } = usePeriodLocks(); const runtime = useRuntimeMode();
  const [audit, setAudit] = useState<AuditState>(() => readAudit()); const previous = useRef<ReturnType<typeof mergeAuditSnapshots> | null>(null);
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(audit)); }, [audit]);
  const snapshots = useMemo(() => mergeAuditSnapshots(collectAuditableRecords("Workspace", data), collectAuditableRecords("CRM", crm), collectAuditableRecords("HCM", hcm), collectAuditableRecords("Payroll", payroll), collectAuditableRecords("Performance", performance), collectAuditableRecords("Commerce", commerce), collectAuditableRecords("Inventory", ledger), collectAuditableRecords("Finance", finance), collectAuditableRecords("Accounting", accounting), collectAuditableRecords("Marketing", marketing), collectAuditableRecords("Period locks", periodLocks)), [data, crm, hcm, payroll, performance, commerce, ledger, finance, accounting, marketing, periodLocks]);
  useEffect(() => { if (!previous.current) { previous.current = snapshots; return; } const actor = { id: currentUser?.id ?? "system", role: currentUser?.role ?? "System" }; const additions = diffAuditableRecords(previous.current, snapshots, actor); previous.current = snapshots; if (additions.length) setAudit((state) => ({ ...state, events: [...additions, ...state.events].slice(0, 10000) })); }, [snapshots, currentUser]);
  const visibleEvents = useMemo(() => visibleAuditEvents(currentUser, data, audit.events), [currentUser, data, audit.events]);
  const resetAudit = () => { if (!runtime.isDemo || currentUser?.role !== "Administrator") return false; setAudit(createAuditSeed()); previous.current = snapshots; return true; };
  const eventsForRecord = (entityType: string, entityId: string) => visibleEvents.filter((event) => event.entityType === entityType && event.entityId === entityId);
  const eventsForAccount = (accountId: string) => visibleEvents.filter((event) => event.relatedAccountId === accountId || (event.entityType === "Workspace.accounts" && event.entityId === accountId));
  return <AuditContext.Provider value={{ audit, visibleEvents, eventsForRecord, eventsForAccount, resetAudit }}>{children}</AuditContext.Provider>;
}
export function useAudit() { const value = useContext(AuditContext); if (!value) throw new Error("useAudit must be used inside AuditProvider"); return value; }
