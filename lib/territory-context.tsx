"use client";

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { arizonaDateKey } from "./date-time";
import { addressIsGeocodable, geocodePatch, needsGeocode, resolveGeocodeProvider, type GeocodingConfig, DEFAULT_GEOCODING_CONFIG } from "./geocoding";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import {
  TERRITORY_STORAGE_KEY,
  activeExceptions,
  assignmentsForTerritory,
  assignmentsForUser,
  canDecideException,
  createTerritorySeed,
  evaluateTerritoryAccess,
  lapsedExceptions,
  normalizeTerritoryState,
  primaryTerritoryForLocation,
  territoryLocationAddress,
  validateAssignment,
  validateExceptionRequest,
  validateTerritory,
  visibleTerritories,
  type Territory,
  type TerritoryAssignment,
  type TerritoryAssignmentRole,
  type TerritoryChangeEvent,
  type TerritoryDecision,
  type TerritoryDraft,
  type TerritoryException,
  type TerritoryExceptionScope,
  type TerritoryLocation,
  type TerritorySettings,
  type TerritoryState,
} from "./territory-management";
import type { Account, WorkspaceUser } from "./types";
import { useWorkspace } from "./workspace-context";

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export type TerritoryResult = { ok: true; id?: string } | { ok: false; message: string };

type TerritoryContextValue = {
  state: TerritoryState;
  settings: TerritorySettings;
  geocoding: GeocodingConfig;
  /** Territories the signed-in employee may see, by assignment, oversight, or supervision. */
  visible: Territory[];
  /** Exception requests the signed-in employee may see or act on. */
  visibleExceptions: TerritoryException[];
  assignmentsFor: (territoryId: string) => TerritoryAssignment[];
  myAssignments: TerritoryAssignment[];
  /** The single authorization question, for any location. */
  evaluate: (location: TerritoryLocation, actor?: WorkspaceUser | null) => TerritoryDecision;
  evaluateAccount: (account: Account, actor?: WorkspaceUser | null) => TerritoryDecision;
  territoryForAccount: (account: Account) => Territory | undefined;
  saveTerritory: (draft: TerritoryDraft) => TerritoryResult;
  setTerritoryStatus: (territoryId: string, status: Territory["status"], reason: string) => TerritoryResult;
  assignEmployee: (input: { territoryId: string; userId: string; role: TerritoryAssignmentRole; effectiveDate: string; endDate?: string; reason?: string }) => TerritoryResult;
  endAssignment: (assignmentId: string, reason: string) => TerritoryResult;
  reassignTerritory: (input: { territoryId: string; fromUserId: string; toUserId: string; effectiveDate: string; reason: string }) => TerritoryResult;
  requestException: (input: { scope: TerritoryExceptionScope; accountId?: string; requestedTerritoryId?: string; normalTerritoryId?: string; reason: string; effectiveStart: string; effectiveEnd?: string; userId?: string }) => TerritoryResult;
  decideException: (exceptionId: string, state: "Approved" | "Denied", note: string) => TerritoryResult;
  withdrawException: (exceptionId: string) => TerritoryResult;
  updateSettings: (patch: Partial<TerritorySettings>) => TerritoryResult;
  historyFor: (filter: { territoryId?: string; userId?: string; accountId?: string }) => TerritoryChangeEvent[];
};

const Context = createContext<TerritoryContextValue | null>(null);

function readState(users: WorkspaceUser[]): TerritoryState {
  if (typeof window === "undefined") return createTerritorySeed();
  try { return normalizeTerritoryState(JSON.parse(momentumStorage.getItem(TERRITORY_STORAGE_KEY) ?? "null"), users); }
  catch { return createTerritorySeed(); }
}

/**
 * Geocoding configuration.
 *
 * Reads the Mapbox token from the environment when one is supplied. Until then the provider resolves to
 * null and locations are recorded as awaiting a provider rather than being given an invented pin.
 */
function geocodingConfig(): GeocodingConfig {
  const accessToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "").trim();
  return accessToken ? { provider: "mapbox", accessToken, country: "us", refreshAfterDays: 0 } : DEFAULT_GEOCODING_CONFIG;
}

export function TerritoryProvider({ children }: { children: ReactNode }) {
  const { data, currentUser, scope, patchAccountLocation } = useWorkspace();
  const [state, setState] = useState<TerritoryState>(() => readState(data.users));
  const geocoding = useMemo(geocodingConfig, []);
  const today = arizonaDateKey();

  useRemoteStorageSync(TERRITORY_STORAGE_KEY, () => setState(readState(data.users)));

  const commit = useCallback((next: TerritoryState) => {
    const normalized = normalizeTerritoryState(next, data.users);
    setState(normalized);
    momentumStorage.setItem(TERRITORY_STORAGE_KEY, JSON.stringify(normalized));
  }, [data.users]);

  // Supervision is read from the workspace access model, never from a hard-coded list of people.
  const supervisedUserIds = useMemo(() => {
    if (!currentUser) return new Set<string>();
    const teams = new Set(currentUser.managedTeams ?? []);
    return new Set(data.users.filter((user) => user.id !== currentUser.id && user.role !== "Customer" && (user.managerId === currentUser.id || teams.has(user.team))).map((user) => user.id));
  }, [currentUser, data.users]);

  // A dated exception lapses on its own; this records the expiry so the history shows why it stopped.
  useEffect(() => {
    const lapsed = lapsedExceptions(state, today);
    if (!lapsed.length || !currentUser) return;
    const handle = window.setTimeout(() => commit({
      ...state,
      exceptions: state.exceptions.map((exception) => lapsed.some((item) => item.id === exception.id) ? { ...exception, state: "Expired" as const } : exception),
      history: [...lapsed.map((exception): TerritoryChangeEvent => ({ id: uid("terr-hist"), at: now(), actorId: currentUser.id, type: "Exception expired", territoryId: exception.normalTerritoryId ?? exception.requestedTerritoryId, subjectUserId: exception.userId, accountId: exception.accountId, before: "Approved", after: "Expired", reason: `Exception ended ${exception.effectiveEnd}` })), ...state.history],
    }), 0);
    return () => window.clearTimeout(handle);
  }, [commit, currentUser, state, today]);

  /**
   * Geocode on create or material address change only.
   *
   * The fingerprint comparison in `needsGeocode` is what keeps this from firing every time a record is
   * opened. Without a configured provider the location is stamped `pending-provider` and territory
   * matching falls back to ZIP or city.
   */
  useEffect(() => {
    if (!currentUser) return;
    const provider = resolveGeocodeProvider(geocoding);
    const pending = scope.accounts.filter((account) => needsGeocode(account, territoryLocationAddress(account as TerritoryLocation), geocoding));
    if (!pending.length) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        for (const account of pending.slice(0, 5)) {
          const address = territoryLocationAddress(account as TerritoryLocation);
          const outcome = provider ? await provider.geocode(address) : { status: "unconfigured" as const };
          if (cancelled) return;
          patchAccountLocation(account.id, geocodePatch(address, outcome, now()));
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [currentUser, geocoding, patchAccountLocation, scope.accounts]);

  const record = useCallback((events: Array<Omit<TerritoryChangeEvent, "id" | "at" | "actorId">>, next: TerritoryState): TerritoryState => ({
    ...next,
    history: [...events.map((event) => ({ ...event, id: uid("terr-hist"), at: now(), actorId: currentUser!.id })), ...next.history],
  }), [currentUser]);

  const evaluate = useCallback((location: TerritoryLocation, actor?: WorkspaceUser | null): TerritoryDecision => {
    const who = actor ?? currentUser;
    if (!who) return { outcome: "Blocked", allowed: false, canRequestException: false, bufferMiles: state.settings.defaultBufferMiles, degraded: false, unresolvedLocation: false, reason: "Sign in to work a business location." };
    return evaluateTerritoryAccess({
      state, location, on: today,
      actor: { id: who.id, role: who.role, managerId: who.managerId },
      // Employment status gates territory grants; an inactive identity holds no authorization.
      actorIsActive: true,
      supervisedUserIds: who.id === currentUser?.id ? supervisedUserIds : undefined,
    });
  }, [currentUser, state, supervisedUserIds, today]);

  const asLocation = (account: Account): TerritoryLocation => ({ ...account, id: account.id });
  const evaluateAccount = useCallback((account: Account, actor?: WorkspaceUser | null) => evaluate(asLocation(account), actor), [evaluate]);

  const manager = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";
  const guard = (): TerritoryResult | null => {
    if (!currentUser) return { ok: false, message: "Sign in first." };
    if (!manager) return { ok: false, message: "Only an Administrator or Sales Manager can change territories." };
    return null;
  };

  const saveTerritory = (draft: TerritoryDraft): TerritoryResult => {
    const denied = guard(); if (denied) return denied;
    const validation = validateTerritory(state, draft, data.users);
    if (!validation.ok) return validation;
    const at = now();
    const existing = draft.id ? state.territories.find((item) => item.id === draft.id) : undefined;
    const territory: Territory = existing
      ? { ...existing, ...draft, id: existing.id, updatedAt: at, updatedBy: currentUser!.id }
      : { ...draft, id: uid("terr"), createdAt: at, createdBy: currentUser!.id, updatedAt: at, updatedBy: currentUser!.id };
    commit(record([{ type: existing ? "Territory updated" : "Territory created", territoryId: territory.id, before: existing?.name, after: territory.name }], {
      ...state,
      territories: existing ? state.territories.map((item) => item.id === territory.id ? territory : item) : [territory, ...state.territories],
    }));
    return { ok: true, id: territory.id };
  };

  const setTerritoryStatus = (territoryId: string, status: Territory["status"], reason: string): TerritoryResult => {
    const denied = guard(); if (denied) return denied;
    const territory = state.territories.find((item) => item.id === territoryId);
    if (!territory) return { ok: false, message: "Territory not found." };
    if (reason.trim().length < 3) return { ok: false, message: "Give a reason for the status change." };
    commit(record([{ type: "Territory status changed", territoryId, before: territory.status, after: status, reason: reason.trim() }], {
      ...state,
      territories: state.territories.map((item) => item.id === territoryId ? { ...item, status, updatedAt: now(), updatedBy: currentUser!.id } : item),
    }));
    return { ok: true };
  };

  const assignEmployee: TerritoryContextValue["assignEmployee"] = (input) => {
    const denied = guard(); if (denied) return denied;
    const validation = validateAssignment(state, data.users, input);
    if (!validation.ok) return validation;
    const assignment: TerritoryAssignment = { ...input, id: uid("terr-asg"), assignedBy: currentUser!.id, assignedAt: now() };
    commit(record([{ type: "Assignment added", territoryId: input.territoryId, subjectUserId: input.userId, after: input.role, reason: input.reason }], {
      ...state, assignments: [assignment, ...state.assignments],
    }));
    return { ok: true, id: assignment.id };
  };

  const endAssignment = (assignmentId: string, reason: string): TerritoryResult => {
    const denied = guard(); if (denied) return denied;
    const assignment = state.assignments.find((item) => item.id === assignmentId && !item.endedAt);
    if (!assignment) return { ok: false, message: "Assignment not found." };
    if (reason.trim().length < 3) return { ok: false, message: "Give a reason for ending the assignment." };
    const at = now();
    // The record is retained, never deleted: reassignment history has to remain auditable.
    commit(record([{ type: "Assignment ended", territoryId: assignment.territoryId, subjectUserId: assignment.userId, before: assignment.role, reason: reason.trim() }], {
      ...state,
      assignments: state.assignments.map((item) => item.id === assignmentId ? { ...item, endedAt: at, endedBy: currentUser!.id, endDate: item.endDate ?? today } : item),
    }));
    return { ok: true };
  };

  const reassignTerritory: TerritoryContextValue["reassignTerritory"] = (input) => {
    const denied = guard(); if (denied) return denied;
    if (input.reason.trim().length < 3) return { ok: false, message: "Give a reason for the reassignment." };
    const validation = validateAssignment(state, data.users, { territoryId: input.territoryId, userId: input.toUserId, role: "Primary", effectiveDate: input.effectiveDate });
    if (!validation.ok) return validation;
    const outgoing = state.assignments.filter((item) => !item.endedAt && item.territoryId === input.territoryId && item.userId === input.fromUserId);
    const at = now();
    const incoming: TerritoryAssignment = { id: uid("terr-asg"), territoryId: input.territoryId, userId: input.toUserId, role: "Primary", effectiveDate: input.effectiveDate, reason: input.reason.trim(), assignedBy: currentUser!.id, assignedAt: at };
    commit(record([{ type: "Assignment reassigned", territoryId: input.territoryId, subjectUserId: input.toUserId, before: input.fromUserId, after: input.toUserId, reason: input.reason.trim() }], {
      ...state,
      assignments: [incoming, ...state.assignments.map((item) => outgoing.some((old) => old.id === item.id) ? { ...item, endedAt: at, endedBy: currentUser!.id, endDate: item.endDate ?? input.effectiveDate } : item)],
    }));
    return { ok: true, id: incoming.id };
  };

  const requestException: TerritoryContextValue["requestException"] = (input) => {
    if (!currentUser) return { ok: false, message: "Sign in first." };
    const userId = input.userId ?? currentUser.id;
    // A representative may only file for themselves; a manager may file on behalf of somebody they supervise.
    if (userId !== currentUser.id && !manager) return { ok: false, message: "You can only request an exception for yourself." };
    const validation = validateExceptionRequest(state, { ...input, userId });
    if (!validation.ok) return validation;
    const exception: TerritoryException = {
      id: uid("terr-exc"), userId, scope: input.scope, accountId: input.accountId,
      normalTerritoryId: input.normalTerritoryId, requestedTerritoryId: input.requestedTerritoryId,
      reason: input.reason.trim(), effectiveStart: input.effectiveStart, effectiveEnd: input.effectiveEnd,
      state: "Pending", requestedBy: currentUser.id, requestedAt: now(),
    };
    commit(record([{ type: "Exception requested", territoryId: input.normalTerritoryId ?? input.requestedTerritoryId, subjectUserId: userId, accountId: input.accountId, after: "Pending", reason: exception.reason }], {
      ...state, exceptions: [exception, ...state.exceptions],
    }));
    return { ok: true, id: exception.id };
  };

  const decideException = (exceptionId: string, decisionState: "Approved" | "Denied", note: string): TerritoryResult => {
    if (!currentUser) return { ok: false, message: "Sign in first." };
    const exception = state.exceptions.find((item) => item.id === exceptionId);
    if (!exception) return { ok: false, message: "Exception not found." };
    if (exception.state !== "Pending") return { ok: false, message: "That exception has already been decided." };
    if (!canDecideException(currentUser, exception, supervisedUserIds)) return { ok: false, message: "You cannot decide this exception." };
    commit(record([{ type: "Exception decided", territoryId: exception.normalTerritoryId ?? exception.requestedTerritoryId, subjectUserId: exception.userId, accountId: exception.accountId, before: "Pending", after: decisionState, reason: note.trim() || undefined }], {
      ...state,
      exceptions: state.exceptions.map((item) => item.id === exceptionId ? { ...item, state: decisionState, decidedBy: currentUser.id, decidedAt: now(), decisionNote: note.trim() || undefined } : item),
    }));
    return { ok: true };
  };

  const withdrawException = (exceptionId: string): TerritoryResult => {
    if (!currentUser) return { ok: false, message: "Sign in first." };
    const exception = state.exceptions.find((item) => item.id === exceptionId);
    if (!exception) return { ok: false, message: "Exception not found." };
    if (exception.userId !== currentUser.id && !manager) return { ok: false, message: "You can only withdraw your own request." };
    if (exception.state !== "Pending") return { ok: false, message: "Only a pending request can be withdrawn." };
    commit(record([{ type: "Exception decided", subjectUserId: exception.userId, accountId: exception.accountId, before: "Pending", after: "Withdrawn" }], {
      ...state, exceptions: state.exceptions.map((item) => item.id === exceptionId ? { ...item, state: "Withdrawn" as const } : item),
    }));
    return { ok: true };
  };

  const updateSettings = (patch: Partial<TerritorySettings>): TerritoryResult => {
    if (currentUser?.role !== "Administrator") return { ok: false, message: "Only an Administrator can change territory policy." };
    const before = state.settings;
    const next = { ...before, ...patch, version: 1 as const };
    if (!Number.isFinite(next.defaultBufferMiles) || next.defaultBufferMiles < 0) return { ok: false, message: "The boundary buffer must be zero or more miles." };
    commit(record([{ type: "Settings updated", before: `${before.enforcement} · ${before.defaultBufferMiles}mi`, after: `${next.enforcement} · ${next.defaultBufferMiles}mi` }], { ...state, settings: next }));
    return { ok: true };
  };

  const visible = useMemo(() => currentUser ? visibleTerritories(state, currentUser, supervisedUserIds, today) : [], [currentUser, state, supervisedUserIds, today]);
  const visibleExceptions = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "Administrator") return state.exceptions;
    return state.exceptions.filter((exception) => exception.userId === currentUser.id || supervisedUserIds.has(exception.userId));
  }, [currentUser, state.exceptions, supervisedUserIds]);

  const value: TerritoryContextValue = {
    state, settings: state.settings, geocoding, visible, visibleExceptions,
    assignmentsFor: (territoryId) => assignmentsForTerritory(state, territoryId, today),
    myAssignments: currentUser ? assignmentsForUser(state, currentUser.id, today) : [],
    evaluate, evaluateAccount,
    territoryForAccount: (account) => primaryTerritoryForLocation(state, asLocation(account), today)?.territory,
    saveTerritory, setTerritoryStatus, assignEmployee, endAssignment, reassignTerritory,
    requestException, decideException, withdrawException, updateSettings,
    historyFor: ({ territoryId, userId, accountId }) => state.history.filter((event) =>
      (!territoryId || event.territoryId === territoryId)
      && (!userId || event.subjectUserId === userId)
      && (!accountId || event.accountId === accountId)),
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTerritories() {
  const value = useContext(Context);
  if (!value) throw new Error("useTerritories must be used inside TerritoryProvider");
  return value;
}

/** Approved exceptions in force today, for callers outside the provider. */
export const currentExceptions = (state: TerritoryState) => activeExceptions(state, arizonaDateKey());
