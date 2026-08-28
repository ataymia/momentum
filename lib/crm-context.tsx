"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  CRM_STORAGE_KEY,
  CrmContact,
  CrmInteraction,
  CrmState,
  Opportunity,
  ResponsibilityEvent,
  createCrmSeed,
  normalizeCrmState,
} from "./crm-engine";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type NewContact = Omit<CrmContact, "id" | "createdAt" | "createdBy">;
type NewInteraction = Omit<CrmInteraction, "id" | "userId" | "occurredAt"> & { occurredAt?: string };
type NewOpportunity = Omit<Opportunity, "id" | "createdAt" | "createdBy" | "updatedAt">;
type CrmContextValue = {
  crm: CrmState;
  addContact: (input: NewContact) => string;
  addInteraction: (input: NewInteraction) => string;
  addOpportunity: (input: NewOpportunity) => string;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  recordResponsibility: (input: Omit<ResponsibilityEvent, "id" | "effectiveAt" | "changedBy"> & { effectiveAt?: string }) => void;
  resetCrm: () => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const { data, scope, currentUser } = useWorkspace();
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
    if (!salesRole || !customerInScope(input.customerId) || (input.locationId && !locationInScope(input.locationId))) return "";
    const id = uid("contact");
    const record: CrmContact = { ...input, id, createdAt: now(), createdBy: currentUser?.id ?? "system" };
    setCrm((current) => ({
      ...current,
      contacts: [
        record,
        ...(input.primary
          ? current.contacts.map((item) => item.scope === input.scope && item.customerId === input.customerId && item.locationId === input.locationId ? { ...item, primary: false } : item)
          : current.contacts),
      ],
    }));
    return id;
  };

  const addInteraction = (input: NewInteraction) => {
    if (!salesRole || !locationInScope(input.locationId)) return "";
    const id = uid("interaction");
    const record: CrmInteraction = { ...input, id, userId: currentUser?.id ?? "system", occurredAt: input.occurredAt ?? now() };
    setCrm((current) => ({ ...current, interactions: [record, ...current.interactions] }));
    return id;
  };

  const addOpportunity = (input: NewOpportunity) => {
    if (!salesRole || !locationInScope(input.locationId) || !customerInScope(input.customerId)) return "";
    const id = uid("opportunity");
    const stamp = now();
    const record: Opportunity = { ...input, id, createdAt: stamp, createdBy: currentUser?.id ?? "system", updatedAt: stamp };
    setCrm((current) => ({ ...current, opportunities: [record, ...current.opportunities] }));
    return id;
  };

  const updateOpportunity = (id: string, patch: Partial<Opportunity>) => {
    const existing = state.opportunities.find((item) => item.id === id);
    if (!salesRole || !existing || !locationInScope(existing.locationId)) return;
    setCrm((current) => ({ ...current, opportunities: current.opportunities.map((item) => item.id === id ? { ...item, ...patch, updatedAt: now() } : item) }));
  };

  const recordResponsibility = (input: Omit<ResponsibilityEvent, "id" | "effectiveAt" | "changedBy"> & { effectiveAt?: string }) => {
    if (!currentUser || !["Administrator", "Sales Manager"].includes(currentUser.role) || !locationInScope(input.locationId)) return;
    const record: ResponsibilityEvent = { ...input, id: uid("responsibility"), effectiveAt: input.effectiveAt ?? now(), changedBy: currentUser.id };
    setCrm((current) => ({ ...current, responsibilityHistory: [record, ...current.responsibilityHistory] }));
  };

  const resetCrm = () => {
    if (currentUser?.role === "Administrator") setCrm(createCrmSeed(data));
  };
  const value: CrmContextValue = { crm, addContact, addInteraction, addOpportunity, updateOpportunity, recordResponsibility, resetCrm };
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const value = useContext(CrmContext);
  if (!value) throw new Error("useCrm must be used inside CrmProvider");
  return value;
}
