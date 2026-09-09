"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  CRM_STORAGE_KEY,
  CrmContact,
  CrmInteraction,
  CrmState,
  Opportunity,
  OpportunityUpdate,
  ResponsibilityEvent,
  contactMatchesLocation,
  createCrmSeed,
  normalizeCrmState,
  normalizeOpportunityTransition,
  opportunityOwnerForLocation,
} from "./crm-engine";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const validDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

type NewContact = Omit<CrmContact, "id" | "createdAt" | "createdBy">;
type NewInteraction = Omit<CrmInteraction, "id" | "userId" | "occurredAt"> & { occurredAt?: string };
type NewOpportunity = Omit<Opportunity, "id" | "createdAt" | "createdBy" | "updatedAt">;
type MutationResult = { ok: boolean; message?: string };
type CrmContextValue = {
  crm: CrmState;
  addContact: (input: NewContact) => string;
  addInteraction: (input: NewInteraction) => string;
  addOpportunity: (input: NewOpportunity) => string;
  updateOpportunity: (id: string, patch: OpportunityUpdate) => MutationResult;
  recordResponsibility: (input: Omit<ResponsibilityEvent, "id" | "effectiveAt" | "changedBy"> & { effectiveAt?: string }) => boolean;
  resetCrm: () => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const { data, scope, currentUser } = useWorkspace();
  const runtime = useRuntimeMode();
  const read = () => {
    if (typeof window === "undefined") return createCrmSeed(data);
    try {
      return normalizeCrmState(JSON.parse(window.localStorage.getItem(CRM_STORAGE_KEY) ?? "null"), data);
    } catch {
      return createCrmSeed(data);
    }
  };
  const [state, setCrm] = useState<CrmState>(() => read());

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCrm((current) => normalizeCrmState(current, data));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const locationIds = useMemo(() => new Set(scope.accounts.map((account) => account.id)), [scope.accounts]);
  const customerIds = useMemo(() => new Set(scope.accounts.map((account) => account.customerId).filter((id): id is string => Boolean(id))), [scope.accounts]);
  const salesRole = Boolean(currentUser && ["Administrator", "Sales Manager", "Sales Representative"].includes(currentUser.role));
  const locationInScope = (locationId: string | undefined) => Boolean(locationId && locationIds.has(locationId));
  const customerInScope = (customerId: string) => customerIds.has(customerId);

  const crm = useMemo<CrmState>(() => {
    if (currentUser?.role === "Administrator") return state;
    if (!salesRole) return { ...state, contacts: [], interactions: [], opportunities: [], responsibilityHistory: [] };
    return {
      ...state,
      contacts: state.contacts.filter((contact) => contact.locationId ? locationIds.has(contact.locationId) : customerIds.has(contact.customerId)),
      interactions: state.interactions.filter((interaction) => locationIds.has(interaction.locationId)),
      opportunities: state.opportunities.filter((opportunity) => locationIds.has(opportunity.locationId)),
      responsibilityHistory: state.responsibilityHistory.filter((event) => locationIds.has(event.locationId)),
    };
  }, [currentUser?.role, customerIds, locationIds, salesRole, state]);

  const addContact = (input: NewContact) => {
    if (!salesRole || !customerInScope(input.customerId) || !input.name.trim() || !input.role.trim()) return "";
    const location = input.locationId ? data.accounts.find((item) => item.id === input.locationId) : undefined;
    if (input.scope === "Location" && (!location || !locationInScope(location.id) || location.customerId !== input.customerId)) return "";
    if (input.scope === "Customer" && input.locationId) return "";
    const id = uid("contact");
    const record: CrmContact = { ...input, id, name: input.name.trim(), role: input.role.trim(), email: input.email?.trim() || undefined, phone: input.phone?.trim() || undefined, locationId: input.scope === "Location" ? input.locationId : undefined, createdAt: now(), createdBy: currentUser?.id ?? "system" };
    setCrm((current) => ({
      ...current,
      contacts: [
        record,
        ...(input.primary
          ? current.contacts.map((item) => item.scope === record.scope && item.customerId === record.customerId && item.locationId === record.locationId ? { ...item, primary: false } : item)
          : current.contacts),
      ],
    }));
    return id;
  };

  const addInteraction = (input: NewInteraction) => {
    if (!salesRole || !locationInScope(input.locationId) || !input.summary.trim()) return "";
    if (input.contactId && !contactMatchesLocation(state, input.contactId, input.locationId, data)) return "";
    const hasNextAction = Boolean(input.nextAction?.trim());
    const hasNextDate = Boolean(input.nextActionDate);
    if (hasNextAction !== hasNextDate || (input.nextActionDate && !validDateKey(input.nextActionDate))) return "";
    const id = uid("interaction");
    const record: CrmInteraction = { ...input, id, summary: input.summary.trim(), outcome: input.outcome?.trim() || undefined, nextAction: input.nextAction?.trim() || undefined, nextActionDate: input.nextActionDate || undefined, contactId: input.contactId || undefined, userId: currentUser?.id ?? "system", occurredAt: input.occurredAt ?? now() };
    setCrm((current) => ({ ...current, interactions: [record, ...current.interactions] }));
    return id;
  };

  const addOpportunity = (input: NewOpportunity) => {
    if (!salesRole || !locationInScope(input.locationId) || !customerInScope(input.customerId)) return "";
    const location = data.accounts.find((item) => item.id === input.locationId);
    if (!location || location.customerId !== input.customerId || input.stage === "Won" || input.stage === "Lost") return "";
    const ownerId = opportunityOwnerForLocation(data, input.locationId);
    if (!ownerId) return "";
    const id = uid("opportunity");
    const stamp = now();
    const initial: Opportunity = { ...input, id, name: input.name.trim(), ownerId, status: "Open", lossReason: undefined, createdAt: stamp, createdBy: currentUser?.id ?? "system", updatedAt: stamp };
    const normalized = normalizeOpportunityTransition(initial, {}, stamp);
    if (!normalized.ok || !normalized.opportunity) return "";
    setCrm((current) => ({ ...current, opportunities: [normalized.opportunity!, ...current.opportunities] }));
    return id;
  };

  const updateOpportunity = (id: string, patch: OpportunityUpdate): MutationResult => {
    const existing = state.opportunities.find((item) => item.id === id);
    if (!salesRole || !existing || !locationInScope(existing.locationId)) return { ok: false, message: "Opportunity is outside your CRM scope." };
    const normalized = normalizeOpportunityTransition(existing, patch);
    if (!normalized.ok || !normalized.opportunity) return { ok: false, message: normalized.message ?? "Opportunity update is invalid." };
    setCrm((current) => ({ ...current, opportunities: current.opportunities.map((item) => item.id === id ? normalized.opportunity! : item) }));
    return { ok: true };
  };

  const recordResponsibility = (input: Omit<ResponsibilityEvent, "id" | "effectiveAt" | "changedBy"> & { effectiveAt?: string }) => {
    if (!currentUser || !["Administrator", "Sales Manager"].includes(currentUser.role) || !locationInScope(input.locationId) || input.reason.trim().length < 3) return false;
    const target = data.users.find((user) => user.id === input.toUserId && ["Sales Representative", "Sales Manager", "Administrator"].includes(user.role));
    if (!target) return false;
    if (input.fromUserId && !data.users.some((user) => user.id === input.fromUserId)) return false;
    const record: ResponsibilityEvent = { ...input, reason: input.reason.trim(), id: uid("responsibility"), effectiveAt: input.effectiveAt ?? now(), changedBy: currentUser.id };
    setCrm((current) => ({ ...current, responsibilityHistory: [record, ...current.responsibilityHistory] }));
    return true;
  };

  const resetCrm = () => {
    if (runtime.isDemo && currentUser?.role === "Administrator") setCrm(createCrmSeed(data));
  };
  const value: CrmContextValue = { crm, addContact, addInteraction, addOpportunity, updateOpportunity, recordResponsibility, resetCrm };
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const value = useContext(CrmContext);
  if (!value) throw new Error("useCrm must be used inside CrmProvider");
  return value;
}
