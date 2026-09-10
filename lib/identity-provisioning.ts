import type { PayBasis, WorkerClassification } from "./hcm-engine";
import type { Role, Team, WorkspaceData } from "./types";

export const IDENTITY_PROVISIONING_STORAGE_KEY = "momentum-identity-provisioning-v1";

export type AccountAccessState = "Password change required" | "Onboarding" | "Pending approval" | "Active" | "Suspended" | "Separated";
export type ProvisioningSource = "Direct hire" | "Accepted offer" | "Referral" | "Bootstrap admin";
export type ProvisionableRole = Exclude<Role, "Administrator" | "Customer">;
export type ProvisioningDraftStatus = "Draft" | "Ready to invite" | "Invite sent" | "Auth linked" | "Cancelled";

export type ProvisioningDraft = {
  id: string;
  source: Exclude<ProvisioningSource, "Bootstrap admin">;
  candidateId?: string;
  offerId?: string;
  legalName: string;
  preferredName?: string;
  workEmail: string;
  jobTitle: string;
  role: ProvisionableRole;
  team: Exclude<Team, "Customer">;
  managerId: string;
  workLocation: string;
  classification: WorkerClassification;
  payBasis: PayBasis;
  payRate?: number;
  payGroup: string;
  standardWeeklyHours?: number;
  startDate: string;
  courseIds: string[];
  status: ProvisioningDraftStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  linkedUserId?: string;
  inviteSentAt?: string;
};

export type IdentityProvisioningRecord = {
  id: string;
  userId: string;
  state: AccountAccessState;
  source: ProvisioningSource;
  provisionedBy: string;
  provisionedAt: string;
  candidateId?: string;
  offerId?: string;
  draftId?: string;
  firstLoginAt?: string;
  passwordChangedAt?: string;
  passwordChangeEvidence?: string;
  onboardingSubmittedAt?: string;
  activatedAt?: string;
  activatedBy?: string;
  returnedAt?: string;
  returnedBy?: string;
  returnReason?: string;
};

export type IdentityProvisioningState = { version: 1; records: IdentityProvisioningRecord[]; drafts: ProvisioningDraft[] };

const validStates = new Set<AccountAccessState>(["Password change required", "Onboarding", "Pending approval", "Active", "Suspended", "Separated"]);
const validSources = new Set<ProvisioningSource>(["Direct hire", "Accepted offer", "Referral", "Bootstrap admin"]);
const validDraftSources = new Set<ProvisioningDraft["source"]>(["Direct hire", "Accepted offer", "Referral"]);
const validDraftStatuses = new Set<ProvisioningDraftStatus>(["Draft", "Ready to invite", "Invite sent", "Auth linked", "Cancelled"]);
const validRoles = new Set<ProvisionableRole>(["Sales Manager", "Sales Representative", "Operations", "Warehouse"]);
const validTeams = new Set<Exclude<Team, "Customer">>(["Leadership", "Sales", "Operations"]);
const validClassifications = new Set<WorkerClassification>(["Hourly", "Salary", "Contractor", "Not configured"]);
const validPayBasis = new Set<PayBasis>(["Hourly", "Salary per pay period", "Not configured"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
const validDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const isDemoIdentity = (email: string) => email.toLowerCase().endsWith("@momentum.demo");

export function createIdentityProvisioningSeed(data: WorkspaceData): IdentityProvisioningState {
  const now = new Date().toISOString();
  return {
    version: 1,
    drafts: [],
    records: data.users.filter((user) => user.role !== "Customer").map((user) => {
      const demo = isDemoIdentity(user.email);
      return {
        id: `access-${user.id}`,
        userId: user.id,
        state: demo ? "Active" as const : "Suspended" as const,
        source: user.role === "Administrator" ? "Bootstrap admin" as const : "Direct hire" as const,
        provisionedBy: demo ? "demo-seed" : "system-fail-closed",
        provisionedAt: now,
        activatedAt: demo ? now : undefined,
        activatedBy: demo ? "demo-seed" : undefined,
        returnReason: demo ? undefined : "Identity has no trusted provisioning record. Administrator review is required.",
      };
    }),
  };
}

export function normalizeIdentityProvisioningState(input: unknown, data: WorkspaceData): IdentityProvisioningState {
  const seed = createIdentityProvisioningSeed(data);
  if (!input || typeof input !== "object") return seed;
  const raw = input as Partial<IdentityProvisioningState>;
  const userIds = new Set(data.users.filter((user) => user.role !== "Customer").map((user) => user.id));
  const managerIds = new Set(data.users.filter((user) => ["Administrator", "Sales Manager"].includes(user.role)).map((user) => user.id));
  const seen = new Set<string>();
  const records = (Array.isArray(raw.records) ? raw.records : []).filter((record): record is IdentityProvisioningRecord => {
    if (!record || typeof record !== "object" || !userIds.has(record.userId) || seen.has(record.userId) || !validStates.has(record.state) || !validSources.has(record.source) || !record.provisionedBy || !validInstant(record.provisionedAt)) return false;
    if (record.firstLoginAt && !validInstant(record.firstLoginAt)) return false;
    if (record.passwordChangedAt && !validInstant(record.passwordChangedAt)) return false;
    if (record.onboardingSubmittedAt && !validInstant(record.onboardingSubmittedAt)) return false;
    if (record.activatedAt && !validInstant(record.activatedAt)) return false;
    if (record.returnedAt && !validInstant(record.returnedAt)) return false;
    seen.add(record.userId);
    return true;
  }).map((record) => ({ ...record, id: record.id || `access-${record.userId}` }));
  for (const fallback of seed.records) if (!seen.has(fallback.userId)) records.push(fallback);

  const draftIds = new Set<string>();
  const drafts = (Array.isArray(raw.drafts) ? raw.drafts : []).filter((draft): draft is ProvisioningDraft => {
    if (!draft || typeof draft !== "object" || !draft.id || draftIds.has(draft.id) || !validDraftSources.has(draft.source) || !draft.legalName?.trim() || !draft.workEmail?.trim().includes("@") || !draft.jobTitle?.trim() || !validRoles.has(draft.role) || !validTeams.has(draft.team) || !managerIds.has(draft.managerId) || !draft.workLocation?.trim() || !validClassifications.has(draft.classification) || !validPayBasis.has(draft.payBasis) || !draft.payGroup?.trim() || !validDate(draft.startDate) || !Array.isArray(draft.courseIds) || new Set(draft.courseIds).size !== draft.courseIds.length || !validDraftStatuses.has(draft.status) || !draft.createdBy || !validInstant(draft.createdAt) || !validInstant(draft.updatedAt)) return false;
    if (draft.payRate !== undefined && (!Number.isFinite(draft.payRate) || draft.payRate < 0)) return false;
    if (draft.payBasis === "Not configured" && draft.payRate !== undefined) return false;
    if (draft.payBasis !== "Not configured" && (!Number.isFinite(draft.payRate) || Number(draft.payRate) <= 0)) return false;
    if (draft.standardWeeklyHours !== undefined && (!Number.isFinite(draft.standardWeeklyHours) || draft.standardWeeklyHours < 0 || draft.standardWeeklyHours > 168)) return false;
    if (draft.linkedUserId && !userIds.has(draft.linkedUserId)) return false;
    if (draft.inviteSentAt && !validInstant(draft.inviteSentAt)) return false;
    draftIds.add(draft.id);
    return true;
  });
  return { version: 1, records, drafts };
}

export const accountAccessFor = (state: IdentityProvisioningState, userId: string) => state.records.find((record) => record.userId === userId);
export const isOnboardingRestricted = (record?: IdentityProvisioningRecord) => !record || record.state !== "Active";
export const canUseOperationalPlatform = (record?: IdentityProvisioningRecord) => Boolean(record && record.state === "Active");

export function nextEmployeeNumber(data: WorkspaceData) {
  const internalCount = data.users.filter((user) => user.role !== "Customer").length;
  return `MD-${String(internalCount + 1).padStart(4, "0")}`;
}
