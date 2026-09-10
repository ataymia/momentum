"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace-context";
import { AccountAccessState, IDENTITY_PROVISIONING_STORAGE_KEY, IdentityProvisioningRecord, IdentityProvisioningState, ProvisioningDraft, ProvisioningSource, accountAccessFor, createIdentityProvisioningSeed, normalizeIdentityProvisioningState } from "./identity-provisioning";

export type BeginOnboardingInput = { userId: string; source?: ProvisioningSource; candidateId?: string; offerId?: string; draftId?: string };
export type NewProvisioningDraftInput = Omit<ProvisioningDraft, "id" | "status" | "createdBy" | "createdAt" | "updatedAt" | "linkedUserId" | "inviteSentAt">;

type IdentityProvisioningContextValue = {
  state: IdentityProvisioningState;
  currentRecord?: IdentityProvisioningRecord;
  saveDraft: (input: NewProvisioningDraftInput) => string | null;
  cancelDraft: (draftId: string) => boolean;
  markDraftInviteSent: (draftId: string) => boolean;
  linkDraftToUser: (draftId: string, userId: string) => boolean;
  beginOnboarding: (input: BeginOnboardingInput) => boolean;
  completePasswordChange: (evidence: string) => boolean;
  submitOnboarding: () => boolean;
  activateUser: (userId: string) => boolean;
  returnForCorrections: (userId: string, reason: string) => boolean;
  setAccountState: (userId: string, state: Extract<AccountAccessState, "Suspended" | "Separated">, reason: string) => boolean;
};

const Context = createContext<IdentityProvisioningContextValue | null>(null);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const expectedTeam: Record<ProvisioningDraft["role"], ProvisioningDraft["team"]> = { "Sales Manager": "Sales", "Sales Representative": "Sales", Operations: "Operations", Warehouse: "Operations" };

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

  const saveDraft = (input: NewProvisioningDraftInput) => {
    if (currentUser?.role !== "Administrator") return null;
    const email = input.workEmail.trim().toLowerCase();
    const manager = data.users.find((user) => user.id === input.managerId && user.role !== "Customer");
    if (input.legalName.trim().length < 2 || !email.includes("@") || input.jobTitle.trim().length < 2 || input.team !== expectedTeam[input.role] || !manager || input.workLocation.trim().length < 2 || input.payGroup.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !Array.isArray(input.courseIds) || new Set(input.courseIds).size !== input.courseIds.length) return null;
    if (input.standardWeeklyHours !== undefined && (!Number.isFinite(input.standardWeeklyHours) || input.standardWeeklyHours < 0 || input.standardWeeklyHours > 168)) return null;
    if (data.users.some((user) => user.email.toLowerCase() === email) || state.drafts.some((draft) => draft.status !== "Cancelled" && draft.workEmail.toLowerCase() === email)) return null;
    if (input.role === "Sales Manager" && manager.role !== "Administrator") return null;
    if (input.role === "Sales Representative" && !["Administrator", "Sales Manager"].includes(manager.role)) return null;
    if (["Operations", "Warehouse"].includes(input.role) && manager.role !== "Administrator") return null;
    const at = new Date().toISOString();
    const id = uid("prehire");
    const draft: ProvisioningDraft = { ...input, legalName: input.legalName.trim(), preferredName: input.preferredName?.trim() || undefined, workEmail: email, jobTitle: input.jobTitle.trim(), workLocation: input.workLocation.trim(), payGroup: input.payGroup.trim(), courseIds: [...input.courseIds], id, status: "Ready to invite", createdBy: currentUser.id, createdAt: at, updatedAt: at };
    setState((current) => ({ ...current, drafts: [draft, ...current.drafts] }));
    return id;
  };

  const cancelDraft = (draftId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const draft = state.drafts.find((item) => item.id === draftId);
    if (!draft || draft.status === "Auth linked") return false;
    setState((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === draftId ? { ...item, status: "Cancelled", updatedAt: new Date().toISOString() } : item) }));
    return true;
  };

  const markDraftInviteSent = (draftId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const draft = state.drafts.find((item) => item.id === draftId);
    if (!draft || draft.status !== "Ready to invite") return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === draftId ? { ...item, status: "Invite sent", inviteSentAt: at, updatedAt: at } : item) }));
    return true;
  };

  const linkDraftToUser = (draftId: string, userId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const draft = state.drafts.find((item) => item.id === draftId);
    const user = data.users.find((item) => item.id === userId && item.role !== "Customer" && item.role !== "Administrator");
    if (!draft || !user || draft.status === "Cancelled" || user.email.toLowerCase() !== draft.workEmail.toLowerCase()) return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === draftId ? { ...item, status: "Auth linked", linkedUserId: userId, updatedAt: at } : item) }));
    return true;
  };

  const beginOnboarding = (input: BeginOnboardingInput) => {
    if (currentUser?.role !== "Administrator") return false;
    const target = data.users.find((user) => user.id === input.userId && user.role !== "Customer");
    if (!target || target.role === "Administrator") return false;
    const draft = input.draftId ? state.drafts.find((item) => item.id === input.draftId && item.linkedUserId === target.id) : undefined;
    if (input.draftId && !draft) return false;
    const record: IdentityProvisioningRecord = {
      userId: target.id,
      state: "Password change required",
      source: input.source ?? draft?.source ?? "Direct hire",
      provisionedBy: currentUser.id,
      provisionedAt: new Date().toISOString(),
      candidateId: input.candidateId ?? draft?.candidateId,
      offerId: input.offerId ?? draft?.offerId,
      draftId: draft?.id,
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
  return <Context.Provider value={{ state, currentRecord, saveDraft, cancelDraft, markDraftInviteSent, linkDraftToUser, beginOnboarding, completePasswordChange, submitOnboarding, activateUser, returnForCorrections, setAccountState }}>{children}</Context.Provider>;
}

export function useIdentityProvisioning() {
  const value = useContext(Context);
  if (!value) throw new Error("useIdentityProvisioning must be used inside IdentityProvisioningProvider");
  return value;
}
