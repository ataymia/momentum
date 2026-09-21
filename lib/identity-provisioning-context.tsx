"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { useFirebaseSessionOptional } from "./firebase-session-context";
import { useHcm } from "./hcm-context";
import { appendAudit } from "./hcm-engine";
import { AccountAccessState, IDENTITY_PROVISIONING_STORAGE_KEY, IdentityProvisioningRecord, IdentityProvisioningState, ProvisioningDraft, ProvisioningSource, accountAccessFor, createIdentityProvisioningSeed, isFailClosedPlaceholder, normalizeIdentityProvisioningState } from "./identity-provisioning";
import { activateEmploymentAfterOnboarding, administratorOverrideEmploymentActivation, onboardingPackageNeedsRepair, onboardingReadiness, onboardingRescueQueue, prepareOnboardingPackage, type OnboardingRescueEntry } from "./onboarding-engine";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import { normalizeUsername, usernameProblem } from "./username";
import { useWorkspace } from "./workspace-context";

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
  repairOnboardingPackage: (userId: string) => boolean;
  completePasswordChange: (evidence: string) => boolean;
  submitOnboarding: () => boolean;
  activateUser: (userId: string) => Promise<boolean>;
  rescueQueue: OnboardingRescueEntry[];
  administratorRepairIdentityRecord: (userId: string, reason: string) => Promise<boolean>;
  administratorMoveToOnboarding: (userId: string, reason: string) => Promise<boolean>;
  administratorVerifyPasswordStep: (userId: string, reason: string) => Promise<boolean>;
  administratorAdvanceToReview: (userId: string, reason: string) => Promise<boolean>;
  administratorBypassAndActivate: (userId: string, reason: string) => Promise<boolean>;
  returnForCorrections: (userId: string, reason: string) => boolean;
  setAccountState: (userId: string, state: Extract<AccountAccessState, "Suspended" | "Separated">, reason: string) => boolean;
};

const Context = createContext<IdentityProvisioningContextValue | null>(null);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const expectedTeam: Record<ProvisioningDraft["role"], ProvisioningDraft["team"]> = { "Sales Manager": "Sales", "Sales Representative": "Sales", "Brand Ambassador": "Sales", Operations: "Operations", Warehouse: "Operations" };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const preactiveStates = new Set<AccountAccessState>(["Password change required", "Onboarding", "Pending approval"]);
/** Every state an Administrator may rescue from. Separated is deliberately included: a wrongly closed account. */
const rescuableStates = new Set<AccountAccessState>(["Password change required", "Onboarding", "Pending approval", "Suspended", "Separated"]);

function readState(data: ReturnType<typeof useWorkspace>["data"]) {
  if (typeof window === "undefined") return createIdentityProvisioningSeed(data);
  try { return normalizeIdentityProvisioningState(JSON.parse(momentumStorage.getItem(IDENTITY_PROVISIONING_STORAGE_KEY) ?? "null"), data); }
  catch { return createIdentityProvisioningSeed(data); }
}

export function IdentityProvisioningProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
  const { hcm, setHcm } = useHcm();
  const firebase = useFirebaseSessionOptional();
  const [state, setState] = useState<IdentityProvisioningState>(() => readState(data));
  const syncAccountState = (userId: string, nextState: AccountAccessState) => { if (firebase) void firebase.setAccountState(userId, nextState); };
  // Rescue and override are Administrator powers, not founder-only powers: an on-call Administrator has to be
  // able to unstick a hire without anyone opening the Firebase Console.
  const overrideAllowed = currentUser?.role === "Administrator";

  useEffect(() => {
    const handle = window.setTimeout(() => setState((current) => normalizeIdentityProvisioningState(current, data)), 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = firebase ? { ...state, records: state.records.filter((record) => !isFailClosedPlaceholder(record)) } : state;
    momentumStorage.setItem(IDENTITY_PROVISIONING_STORAGE_KEY, JSON.stringify(persisted));
  }, [firebase, state]);
  useRemoteStorageSync(IDENTITY_PROVISIONING_STORAGE_KEY, () => setState(readState(data)));

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
    const username = normalizeUsername(input.username ?? "");
    const manager = data.users.find((user) => user.id === input.managerId && user.role !== "Customer");
    if (usernameProblem(username)) return null;
    if (data.users.some((user) => user.username === username) || state.drafts.some((draft) => draft.status !== "Cancelled" && draft.username === username)) return null;
    if (input.legalName.trim().length < 2 || !emailPattern.test(email) || input.jobTitle.trim().length < 2 || input.team !== expectedTeam[input.role] || !manager || input.workLocation.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !Array.isArray(input.courseIds) || input.courseIds.length === 0 || new Set(input.courseIds).size !== input.courseIds.length) return null;
    if (input.classification === "Not configured" || input.payBasis === "Not configured" || !Number.isFinite(input.payRate) || Number(input.payRate) <= 0 || input.payGroup.trim().length < 2 || input.payGroup.trim().toLowerCase() === "not configured") return null;
    if (input.standardWeeklyHours !== undefined && (!Number.isFinite(input.standardWeeklyHours) || input.standardWeeklyHours < 0 || input.standardWeeklyHours > 168)) return null;
    if (input.courseIds.some((courseId) => !hcm.courses.some((course) => course.id === courseId && course.active))) return null;
    if (data.users.some((user) => user.email.toLowerCase() === email) || state.drafts.some((draft) => draft.status !== "Cancelled" && draft.workEmail.toLowerCase() === email)) return null;
    if (input.role === "Sales Manager" && manager.role !== "Administrator") return null;
    if (input.role === "Sales Representative" && !["Administrator", "Sales Manager"].includes(manager.role)) return null;
    if (input.role === "Brand Ambassador" && manager.role !== "Sales Representative") return null;
    if (["Operations", "Warehouse"].includes(input.role) && manager.role !== "Administrator") return null;
    if (input.source === "Accepted offer") {
      const offer = hcm.offers.find((item) => item.id === input.offerId && item.status === "Accepted");
      if (!offer || offer.candidateId !== input.candidateId) return null;
    } else if (input.offerId || input.candidateId) return null;
    const at = new Date().toISOString();
    const id = uid("prehire");
    const draft: ProvisioningDraft = { ...input, legalName: input.legalName.trim(), preferredName: input.preferredName?.trim() || undefined, workEmail: email, username, phone: input.phone?.trim() || undefined, jobTitle: input.jobTitle.trim(), workLocation: input.workLocation.trim(), payGroup: input.payGroup.trim(), courseIds: [...input.courseIds], id, status: "Ready to invite", createdBy: currentUser.id, createdAt: at, updatedAt: at };
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
    if (!draft || !user || draft.status === "Cancelled" || user.email.toLowerCase() !== draft.workEmail.toLowerCase() || user.role !== draft.role || user.team !== draft.team || user.managerId !== draft.managerId) return false;
    if (draft.linkedUserId && draft.linkedUserId !== userId) return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === draftId ? { ...item, status: "Auth linked", linkedUserId: userId, updatedAt: at } : item) }));
    return true;
  };

  const beginOnboarding = (input: BeginOnboardingInput) => {
    if (currentUser?.role !== "Administrator") return false;
    const target = data.users.find((user) => user.id === input.userId && user.role !== "Customer");
    if (!target || target.role === "Administrator") return false;
    const draft = input.draftId ? state.drafts.find((item) => item.id === input.draftId && item.status !== "Cancelled" && item.workEmail.toLowerCase() === target.email.toLowerCase()) : undefined;
    if (!draft || (draft.linkedUserId && draft.linkedUserId !== target.id)) return false;
    if (target.role !== draft.role || target.team !== draft.team || target.managerId !== draft.managerId) return false;
    const at = new Date().toISOString();
    const linked: ProvisioningDraft = { ...draft, status: "Auth linked", linkedUserId: target.id, updatedAt: at };
    const current = accountAccessFor(state, target.id);
    const existing = isFailClosedPlaceholder(current) ? undefined : current;
    if (existing && existing.state !== "Password change required") return false;
    const record: IdentityProvisioningRecord = { id: `access-${target.id}`, userId: target.id, state: "Password change required", source: input.source ?? draft.source, provisionedBy: currentUser.id, provisionedAt: existing?.provisionedAt ?? at, candidateId: input.candidateId ?? draft.candidateId, offerId: input.offerId ?? draft.offerId, draftId: draft.id };
    setHcm((currentHcm) => prepareOnboardingPackage(currentHcm, data, linked, target.id, currentUser.id));
    setState((currentState) => ({ ...currentState, drafts: currentState.drafts.map((item) => item.id === draft.id ? { ...item, status: "Auth linked", linkedUserId: target.id, updatedAt: at } : item), records: [record, ...currentState.records.filter((item) => item.userId !== target.id)] }));
    syncAccountState(target.id, "Password change required");
    return true;
  };

  const repairOnboardingPackage = (userId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const record = accountAccessFor(state, userId);
    if (!record || record.state === "Active") return false;
    const target = data.users.find((user) => user.id === userId && user.role !== "Customer" && user.role !== "Administrator");
    const draft = state.drafts.find((item) => item.status !== "Cancelled" && (item.id === record.draftId || item.linkedUserId === userId || item.workEmail.toLowerCase() === target?.email.toLowerCase()));
    if (!target || !draft || target.email.toLowerCase() !== draft.workEmail.toLowerCase() || target.role !== draft.role || target.team !== draft.team || target.managerId !== draft.managerId) return false;
    const at = new Date().toISOString();
    const linked: ProvisioningDraft = { ...draft, status: "Auth linked", linkedUserId: target.id, updatedAt: at };
    if (onboardingPackageNeedsRepair(hcm, linked, target.id)) setHcm((current) => prepareOnboardingPackage(current, data, linked, target.id, currentUser.id));
    if (draft.status !== "Auth linked" || draft.linkedUserId !== target.id) setState((current) => ({ ...current, drafts: current.drafts.map((item) => item.id === draft.id ? linked : item) }));
    return true;
  };

  useEffect(() => {
    if (currentUser?.role !== "Administrator") return;
    const repairable = state.records.flatMap((record) => {
      if (!preactiveStates.has(record.state) || !record.draftId) return [];
      const target = data.users.find((user) => user.id === record.userId && user.role !== "Customer" && user.role !== "Administrator");
      const draft = state.drafts.find((item) => item.id === record.draftId && item.status !== "Cancelled");
      if (!target || !draft || target.email.toLowerCase() !== draft.workEmail.toLowerCase() || target.role !== draft.role || target.team !== draft.team || target.managerId !== draft.managerId) return [];
      const linked: ProvisioningDraft = { ...draft, status: "Auth linked", linkedUserId: target.id, updatedAt: draft.updatedAt };
      return onboardingPackageNeedsRepair(hcm, linked, target.id) ? [{ target, draft: linked }] : [];
    });
    if (!repairable.length) return;
    const handle = window.setTimeout(() => {
      setHcm((current) => repairable.reduce((next, item) => onboardingPackageNeedsRepair(next, item.draft, item.target.id) ? prepareOnboardingPackage(next, data, item.draft, item.target.id, currentUser.id) : next, current));
      setState((current) => ({ ...current, drafts: current.drafts.map((draft) => { const repair = repairable.find((item) => item.draft.id === draft.id); return repair ? { ...draft, status: "Auth linked", linkedUserId: repair.target.id, updatedAt: new Date().toISOString() } : draft; }) }));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [currentUser, data, hcm, setHcm, state.drafts, state.records]);

  const completePasswordChange = (evidence: string) => {
    if (!currentUser || !evidence.trim()) return false;
    const record = accountAccessFor(state, currentUser.id);
    if (!record || record.state !== "Password change required") return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === currentUser.id ? { ...item, state: "Onboarding", passwordChangedAt: at, passwordChangeEvidence: evidence.trim(), returnReason: undefined } : item) }));
    syncAccountState(currentUser.id, "Onboarding");
    return true;
  };

  const submitOnboarding = () => {
    if (!currentUser) return false;
    const record = accountAccessFor(state, currentUser.id);
    if (!record || record.state !== "Onboarding" || !onboardingReadiness(hcm, record, currentUser.id).readyForEmployeeSubmission) return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === currentUser.id ? { ...item, state: "Pending approval", onboardingSubmittedAt: at } : item) }));
    syncAccountState(currentUser.id, "Pending approval");
    return true;
  };

  const activateUser = async (userId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const record = accountAccessFor(state, userId);
    if (!record || !onboardingReadiness(hcm, record, userId).readyForActivation) return false;
    if (firebase) { const persisted = await firebase.setAccountState(userId, "Active"); if (!persisted.ok) return false; }
    const at = new Date().toISOString();
    setHcm((current) => activateEmploymentAfterOnboarding(current, userId, currentUser.id));
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Active", activatedAt: at, activatedBy: currentUser.id, returnReason: undefined } : item) }));
    return true;
  };

  const administratorVerifyPasswordStep = async (userId: string, reason: string) => {
    const cleanReason = reason.trim();
    if (!overrideAllowed || !currentUser || cleanReason.length < 5 || userId === currentUser.id) return false;
    const record = accountAccessFor(state, userId);
    const target = data.users.find((user) => user.id === userId && user.role !== "Administrator" && user.role !== "Customer");
    if (!record || !target || !rescuableStates.has(record.state)) return false;
    const nextState = record.state === "Password change required" ? "Onboarding" as const : record.state;
    if (firebase && nextState !== record.state) { const persisted = await firebase.setAccountState(userId, nextState); if (!persisted.ok) return false; }
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: nextState, passwordChangedAt: item.passwordChangedAt ?? at, passwordChangeEvidence: item.passwordChangeEvidence ?? `Administrator verified: ${cleanReason}`, returnReason: undefined } : item) }));
    setHcm((current) => appendAudit({ ...current, lifecycleCases: current.lifecycleCases.map((item) => item.type === "Onboarding" && item.userId === userId && item.status === "Open" ? { ...item, tasks: item.tasks.map((task) => task.title.toLowerCase().includes("password") || task.title.toLowerCase().includes("secure account") ? { ...task, status: "Complete", completedAt: task.completedAt ?? at, evidence: task.evidence ?? `Administrator verified: ${cleanReason}` } : task) } : item) }, { actorId: currentUser.id, action: "Administrator verified onboarding password step", entityType: "IdentityProvisioningRecord", entityId: record.id, before: record.passwordChangedAt ? "Verified" : "Unverified", after: "Verified", reason: cleanReason }));
    return true;
  };

  const administratorAdvanceToReview = async (userId: string, reason: string) => {
    const cleanReason = reason.trim();
    if (!overrideAllowed || !currentUser || cleanReason.length < 5 || userId === currentUser.id) return false;
    const record = accountAccessFor(state, userId);
    if (!record || record.state === "Pending approval" || !preactiveStates.has(record.state) || !onboardingReadiness(hcm, record, userId).readyForEmployeeSubmission) return false;
    if (firebase) { const persisted = await firebase.setAccountState(userId, "Pending approval"); if (!persisted.ok) return false; }
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Pending approval", onboardingSubmittedAt: item.onboardingSubmittedAt ?? at } : item) }));
    setHcm((current) => appendAudit(current, { actorId: currentUser.id, action: "Administrator advanced onboarding to final review", entityType: "IdentityProvisioningRecord", entityId: record.id, before: record.state, after: "Pending approval", reason: cleanReason }));
    return true;
  };

  /**
   * Rebuild a trusted provisioning record for an identity that has Firebase Auth and a userAccess record but
   * no Momentum provisioning history, which is the state that fails closed into "Suspended" and strands the
   * employee. The rebuilt record is derived from the saved new-hire draft and the directory entry, never
   * invented, and it deliberately lands in a pre-active state so the real onboarding controls still apply.
   */
  const administratorRepairIdentityRecord = async (userId: string, reason: string) => {
    const cleanReason = reason.trim();
    if (!overrideAllowed || !currentUser || cleanReason.length < 5 || userId === currentUser.id) return false;
    const target = data.users.find((user) => user.id === userId && user.role !== "Customer" && user.role !== "Administrator");
    if (!target) return false;
    const existing = accountAccessFor(state, userId);
    if (existing && !isFailClosedPlaceholder(existing) && existing.state !== "Suspended") return false;
    const draft = state.drafts.find((item) => item.status !== "Cancelled" && (item.id === existing?.draftId || item.linkedUserId === userId || item.workEmail.toLowerCase() === target.email.toLowerCase()));
    // Only adopt a draft that still describes this identity; a stale one would rewrite the reporting line.
    const usableDraft = draft && draft.role === target.role && draft.team === target.team && draft.managerId === target.managerId ? draft : undefined;
    const at = new Date().toISOString();
    const nextState: AccountAccessState = "Onboarding";
    if (firebase) { const persisted = await firebase.setAccountState(userId, nextState); if (!persisted.ok) return false; }
    const record: IdentityProvisioningRecord = {
      id: `access-${userId}`,
      userId,
      state: nextState,
      source: usableDraft?.source ?? "Direct hire",
      provisionedBy: currentUser.id,
      provisionedAt: existing && !isFailClosedPlaceholder(existing) ? existing.provisionedAt : at,
      candidateId: usableDraft?.candidateId,
      offerId: usableDraft?.offerId,
      draftId: usableDraft?.id,
      firstLoginAt: existing?.firstLoginAt,
      passwordChangedAt: existing?.passwordChangedAt,
      passwordChangeEvidence: existing?.passwordChangeEvidence,
      returnReason: undefined,
    };
    const linked: ProvisioningDraft | undefined = usableDraft ? { ...usableDraft, status: "Auth linked", linkedUserId: userId, updatedAt: at } : undefined;
    setState((current) => ({
      ...current,
      drafts: linked ? current.drafts.map((item) => item.id === linked.id ? linked : item) : current.drafts,
      records: [record, ...current.records.filter((item) => item.userId !== userId)],
    }));
    setHcm((current) => {
      const repaired = linked && onboardingPackageNeedsRepair(current, linked, userId) ? prepareOnboardingPackage(current, data, linked, userId, currentUser.id) : current;
      return appendAudit(repaired, { actorId: currentUser.id, action: "Administrator repaired missing identity provisioning record", entityType: "IdentityProvisioningRecord", entityId: record.id, before: existing ? existing.state : "Not provisioned", after: nextState, reason: cleanReason });
    });
    return true;
  };

  /** Put a stuck or wrongly closed identity back into Onboarding so the employee can finish their own steps. */
  const administratorMoveToOnboarding = async (userId: string, reason: string) => {
    const cleanReason = reason.trim();
    if (!overrideAllowed || !currentUser || cleanReason.length < 5 || userId === currentUser.id) return false;
    const target = data.users.find((user) => user.id === userId && user.role !== "Customer" && user.role !== "Administrator");
    const record = accountAccessFor(state, userId);
    if (!target || !record || record.state === "Onboarding" || !rescuableStates.has(record.state)) return false;
    if (firebase) { const persisted = await firebase.setAccountState(userId, "Onboarding"); if (!persisted.ok) return false; }
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Onboarding", returnedAt: at, returnedBy: currentUser.id, returnReason: cleanReason } : item) }));
    setHcm((current) => appendAudit(current, { actorId: currentUser.id, action: "Administrator moved employee back into onboarding", entityType: "IdentityProvisioningRecord", entityId: record.id, before: record.state, after: "Onboarding", reason: cleanReason }));
    return true;
  };

  const administratorBypassAndActivate = async (userId: string, reason: string) => {
    const cleanReason = reason.trim();
    if (!overrideAllowed || !currentUser || cleanReason.length < 5 || userId === currentUser.id) return false;
    const record = accountAccessFor(state, userId);
    const target = data.users.find((user) => user.id === userId && user.role !== "Administrator" && user.role !== "Customer");
    if (!target || (record && !rescuableStates.has(record.state))) return false;
    if (firebase) { const persisted = await firebase.setAccountState(userId, "Active"); if (!persisted.ok) return false; }
    const at = new Date().toISOString();
    setHcm((current) => administratorOverrideEmploymentActivation(current, data, userId, currentUser.id, cleanReason));
    const activated: IdentityProvisioningRecord = {
      ...(record ?? { id: `access-${userId}`, userId, source: "Direct hire" as const, provisionedBy: currentUser.id, provisionedAt: at }),
      state: "Active",
      passwordChangedAt: record?.passwordChangedAt ?? at,
      passwordChangeEvidence: record?.passwordChangeEvidence ?? `Administrator override: ${cleanReason}`,
      activatedAt: at,
      activatedBy: currentUser.id,
      returnReason: undefined,
    };
    setState((current) => ({ ...current, records: [activated, ...current.records.filter((item) => item.userId !== userId)] }));
    return true;
  };

  const returnForCorrections = (userId: string, reason: string) => {
    if (currentUser?.role !== "Administrator" || reason.trim().length < 3) return false;
    const record = accountAccessFor(state, userId);
    if (!record || !["Pending approval", "Onboarding"].includes(record.state)) return false;
    const at = new Date().toISOString();
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: "Onboarding", returnedAt: at, returnedBy: currentUser.id, returnReason: reason.trim() } : item) }));
    syncAccountState(userId, "Onboarding");
    return true;
  };

  const setAccountState = (userId: string, nextState: Extract<AccountAccessState, "Suspended" | "Separated">, reason: string) => {
    if (currentUser?.role !== "Administrator" || reason.trim().length < 3 || userId === currentUser.id) return false;
    const record = accountAccessFor(state, userId);
    if (!record) return false;
    setState((current) => ({ ...current, records: current.records.map((item) => item.userId === userId ? { ...item, state: nextState, returnedAt: new Date().toISOString(), returnedBy: currentUser.id, returnReason: reason.trim() } : item) }));
    syncAccountState(userId, nextState);
    return true;
  };

  const currentRecord = useMemo(() => currentUser ? accountAccessFor(state, currentUser.id) : undefined, [currentUser, state]);
  const rescueQueue = useMemo(() => currentUser?.role === "Administrator" ? onboardingRescueQueue(hcm, data, state) : [], [currentUser, data, hcm, state]);
  return <Context.Provider value={{ state, currentRecord, rescueQueue, saveDraft, cancelDraft, markDraftInviteSent, linkDraftToUser, beginOnboarding, repairOnboardingPackage, completePasswordChange, submitOnboarding, activateUser, administratorRepairIdentityRecord, administratorMoveToOnboarding, administratorVerifyPasswordStep, administratorAdvanceToReview, administratorBypassAndActivate, returnForCorrections, setAccountState }}>{children}</Context.Provider>;
}

export function useIdentityProvisioning() {
  const value = useContext(Context);
  if (!value) throw new Error("useIdentityProvisioning must be used inside IdentityProvisioningProvider");
  return value;
}
