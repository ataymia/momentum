"use client";

import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { useWorkspace } from "./workspace-context";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import {
  BRAND_AMBASSADOR_STORAGE_KEY,
  BrandAmbassadorEventDraft,
  BrandAmbassadorState,
  assignmentsVisibleTo,
  brandAmbassadorsVisibleTo,
  createBrandAmbassadorSeed,
  groupBrandAmbassadorAssignments,
  normalizeBrandAmbassadorState,
  validateBrandAmbassadorEvent,
} from "./brand-ambassador-engine";
import { canSuperviseBrandAmbassador } from "./access";

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function readState(data: ReturnType<typeof useWorkspace>["data"]) {
  if (typeof window === "undefined") return createBrandAmbassadorSeed();
  try { return normalizeBrandAmbassadorState(JSON.parse(momentumStorage.getItem(BRAND_AMBASSADOR_STORAGE_KEY) ?? "null"), data); }
  catch { return createBrandAmbassadorSeed(); }
}

type BrandAmbassadorContextValue = {
  state: BrandAmbassadorState;
  visibleAssignments: BrandAmbassadorState["assignments"];
  visibleEvents: ReturnType<typeof groupBrandAmbassadorAssignments>;
  availableAmbassadors: ReturnType<typeof brandAmbassadorsVisibleTo>;
  scheduleEvent: (draft: BrandAmbassadorEventDraft) => { ok: true; eventGroupId: string } | { ok: false; message: string };
  updateEvent: (eventGroupId: string, draft: BrandAmbassadorEventDraft) => { ok: true } | { ok: false; message: string };
  setEventStatus: (eventGroupId: string, status: "Scheduled" | "Completed" | "Cancelled") => boolean;
};

const Context = createContext<BrandAmbassadorContextValue | null>(null);

export function BrandAmbassadorProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
  const [state, setState] = useState<BrandAmbassadorState>(() => readState(data));
  useRemoteStorageSync(BRAND_AMBASSADOR_STORAGE_KEY, () => setState(readState(data)));

  const commit = (next: BrandAmbassadorState) => {
    const normalized = normalizeBrandAmbassadorState(next, data);
    setState(normalized);
    momentumStorage.setItem(BRAND_AMBASSADOR_STORAGE_KEY, JSON.stringify(normalized));
  };

  const scheduleEvent = (draft: BrandAmbassadorEventDraft) => {
    const problem = validateBrandAmbassadorEvent(data, currentUser, draft);
    if (problem) return { ok: false as const, message: problem };
    const now = new Date().toISOString();
    const eventGroupId = id("ba-event");
    const ambassadorIds = [...new Set(draft.ambassadorIds)];
    commit({
      ...state,
      assignments: [
        ...ambassadorIds.map((ambassadorId) => ({
          id: id("ba-assignment"), eventGroupId, ambassadorId,
          title: draft.title.trim(), date: draft.date, startTime: draft.startTime, endTime: draft.endTime,
          address: draft.address.trim(), requiredStaff: draft.requiredStaff, notes: draft.notes?.trim() || undefined,
          status: "Scheduled" as const, createdBy: currentUser!.id, createdAt: now, updatedAt: now,
        })),
        ...state.assignments,
      ],
    });
    return { ok: true as const, eventGroupId };
  };

  const updateEvent = (eventGroupId: string, draft: BrandAmbassadorEventDraft) => {
    const existing = state.assignments.filter((assignment) => assignment.eventGroupId === eventGroupId);
    if (!existing.length) return { ok: false as const, message: "That Brand Ambassador event no longer exists." };
    if (!currentUser || existing.some((assignment) => !canSuperviseBrandAmbassador(data, currentUser, assignment.ambassadorId))) return { ok: false as const, message: "You do not have permission to edit this event." };
    const problem = validateBrandAmbassadorEvent(data, currentUser, draft);
    if (problem) return { ok: false as const, message: problem };
    const now = new Date().toISOString();
    const createdAt = existing[0].createdAt;
    const createdBy = existing[0].createdBy;
    const priorStatus = existing.every((assignment) => assignment.status === "Completed") ? "Completed" as const : existing.every((assignment) => assignment.status === "Cancelled") ? "Cancelled" as const : "Scheduled" as const;
    const replacement = [...new Set(draft.ambassadorIds)].map((ambassadorId) => ({
      id: existing.find((assignment) => assignment.ambassadorId === ambassadorId)?.id ?? id("ba-assignment"),
      eventGroupId, ambassadorId, title: draft.title.trim(), date: draft.date, startTime: draft.startTime, endTime: draft.endTime,
      address: draft.address.trim(), requiredStaff: draft.requiredStaff, notes: draft.notes?.trim() || undefined,
      status: priorStatus, createdBy, createdAt, updatedAt: now,
    }));
    commit({ ...state, assignments: [...replacement, ...state.assignments.filter((assignment) => assignment.eventGroupId !== eventGroupId)] });
    return { ok: true as const };
  };

  const setEventStatus = (eventGroupId: string, status: "Scheduled" | "Completed" | "Cancelled") => {
    const existing = state.assignments.filter((assignment) => assignment.eventGroupId === eventGroupId);
    if (!existing.length || !currentUser || existing.some((assignment) => !canSuperviseBrandAmbassador(data, currentUser, assignment.ambassadorId))) return false;
    const at = new Date().toISOString();
    commit({ ...state, assignments: state.assignments.map((assignment) => assignment.eventGroupId === eventGroupId ? { ...assignment, status, updatedAt: at } : assignment) });
    return true;
  };

  const value = useMemo<BrandAmbassadorContextValue>(() => ({
    state,
    visibleAssignments: assignmentsVisibleTo(data, currentUser, state),
    visibleEvents: groupBrandAmbassadorAssignments(assignmentsVisibleTo(data, currentUser, state)),
    availableAmbassadors: brandAmbassadorsVisibleTo(data, currentUser),
    scheduleEvent,
    updateEvent,
    setEventStatus,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, currentUser, state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBrandAmbassadors() {
  const value = useContext(Context);
  if (!value) throw new Error("useBrandAmbassadors must be used inside BrandAmbassadorProvider");
  return value;
}
