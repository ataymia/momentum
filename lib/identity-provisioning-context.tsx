"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace-context";
import { AccountAccessState, IDENTITY_PROVISIONING_STORAGE_KEY, IdentityProvisioningRecord, IdentityProvisioningState, ProvisioningSource, accountAccessFor, createIdentityProvisioningSeed, normalizeIdentityProvisioningState } from "./identity-provisioning";

export type BeginOnboardingInput = { userId: string; source?: ProvisioningSource; candidateId?: string; offerId?: string };

type IdentityProvisioningContextValue = {
  state: IdentityProvisioningState;
  currentRecord?: IdentityProvisioningRecord;
  beginOnboarding: (input: BeginOnboardingInput) => boolean;
  completePasswordChange: (evidence: string) => boolean;
  submitOnboarding: () => boolean;
  activateUser: (userId: string) => boolean;
  returnForCorrections: (userId: string, reason: string) => boolean;
  setAccountState: (userId: string, state: Extract<AccountAccessState, "Suspended" | "Separated">, reason: string) => boolean;
};

const Context = createContext<IdentityProvisioningContextValue | null>(null);

function readState(data: ReturnType<typeof useWorkspace>["data"]) {
  if (typeof window === "undefined") return createIdentityProvisioningSeed(data);
  try { return normalizeIdentityProvisioningState(JSON.parse(window.localStorage.getItem(IDENTITY_PROVISIONING_STORAGE_KEY) ?? "null"), data); }
  catch { return createIdentityProvisioningSeed(data); }
}

export function IdentityProvisioningProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
  const [state, setState] = useState<IdentityProvisioningState>(() => readState(data));

  useEffect(() => {
    const handle = window.setTimeout(() => setState((current) => normalizeIdentityProvisioningState(current, data)), 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(IDENTITY_PROVISIONING_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    const record = accountAccessFor(state, currentUser.id);
    if (!record || record.firstLoginAt) return;
    const at = new Date().toISOString();
    const handle = window.setTimeout(() => setState((current) => ({ ...current, records: current.records.map((item) => item.userId === currentUser.id && !item.firstLoginAt ? { ...item, firstLoginAt: at } : item) })), 0);
    return () => window.clearTimeout(handle);
  }, [currentUser, state]);

  const beginOnboarding = (input: BeginOnboardingInput) => {
    if (currentUser?.role !== "Administrator") return false;
    const target = data.users.find((user) => user.id === input.userId && user.role !== "Customer");
    if (!target || target.role === "Administrator") return false;
    const record: IdentityProvisioningRecord = {
      userId: target.id,
      state: "Password change required",
      source: input.source ?? "Direct hire",
      provisionedBy: currentUser.id,
      provisionedAt: new Date().toISOString(),
      candidateId: input.candidateId,
      offerId: input.offerId,
    };
    setState((current) => ({ ...current, records: [record, ...current.records.filter((item) => item.userId !== target.id)] }));
    return true;
  };

  const completePasswordChange = (evidence: string) => {
    if (!currentUser || !evidence.trim()) return false;
    const record = accountAccessFor(state, currentUser.id);
    if (!record || record.state !== "Password change required") return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === currentUser.id ? { ...item, state: "Onboarding", passwordChangedAt: at, passwordChangeEvidence: evidence.trim(), returnReason: undefined } : item) }));
    return true;
  };

  const submitOnboarding = () => {
    if (!currentUser) return false;
    const record = accountAccessFor(state, currentUser.id);
    if (!record || record.state !== "Onboarding") return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === currentUser.id ? { ...item, state: "Pending approval", onboardingSubmittedAt: at } : item) }));
    return true;
  };

  const activateUser = (userId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const record = accountAccessFor(state, userId);
    if (!record || record.state !== "Pending approval") return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Active", activatedAt: at, activatedBy: currentUser.id, returnReason: undefined } : item) }));
    return true;
  };

  const returnForCorrections = (userId: string, reason: string) => {
    if (currentUser?.role !== "Administrator" || reason.trim().length < 3) return false;
    const record = accountAccessFor(state, userId);
    if (!record || !["Pending approval", "Onboarding"].includes(record.state)) return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Onboarding", returnedAt: at, returnedBy: currentUser.id, returnReason: reason.trim() } : item) }));
    return true;
  };

  const setAccountState = (userId: string, nextState: Extract<AccountAccessState, "Suspended" | "Separated">, reason: string) => {
    if (currentUser?.role !== "Administrator" || reason.trim().length < 3 || userId === currentUser.id) return false;
    const record = accountAccessFor(state, userId);
    if (!record) return false;
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: nextState, returnedAt: new Date().toISOString(), returnedBy: currentUser.id, returnReason: reason.trim() } : item) }));
    return true;
  };

  const currentRecord = useMemo(() => currentUser ? accountAccessFor(state, currentUser.id) : undefined, [currentUser, state]);
  return <Context.Provider value={{ state, currentRecord, beginOnboarding, completePasswordChange, submitOnboarding, activateUser, returnForCorrections, setAccountState }}>{children}</Context.Provider>;
}

export function useIdentityProvisioning() {
  const value = useContext(Context);
  if (!value) throw new Error("useIdentityProvisioning must be used inside IdentityProvisioningProvider");
  return value;
}
