import type { WorkspaceData } from "./types";

export const IDENTITY_PROVISIONING_STORAGE_KEY = "momentum-identity-provisioning-v1";

export type AccountAccessState = "Password change required" | "Onboarding" | "Pending approval" | "Active" | "Suspended" | "Separated";
export type ProvisioningSource = "Direct hire" | "Accepted offer" | "Bootstrap admin";

export type IdentityProvisioningRecord = {
  userId: string;
  state: AccountAccessState;
  source: ProvisioningSource;
  provisionedBy: string;
  provisionedAt: string;
  candidateId?: string;
  offerId?: string;
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

export type IdentityProvisioningState = { version: 1; records: IdentityProvisioningRecord[] };

const validStates = new Set<AccountAccessState>(["Password change required", "Onboarding", "Pending approval", "Active", "Suspended", "Separated"]);
const validSources = new Set<ProvisioningSource>(["Direct hire", "Accepted offer", "Bootstrap admin"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));

export function createIdentityProvisioningSeed(data: WorkspaceData): IdentityProvisioningState {
  const now = new Date().toISOString();
  return {
    version: 1,
    records: data.users.filter((user) => user.role !== "Customer").map((user) => ({
      userId: user.id,
      state: "Active" as const,
      source: user.role === "Administrator" ? "Bootstrap admin" as const : "Direct hire" as const,
      provisionedBy: "system",
      provisionedAt: now,
      activatedAt: now,
      activatedBy: "system",
    })),
  };
}

export function normalizeIdentityProvisioningState(input: unknown, data: WorkspaceData): IdentityProvisioningState {
  const seed = createIdentityProvisioningSeed(data);
  if (!input || typeof input !== "object") return seed;
  const raw = input as Partial<IdentityProvisioningState>;
  const userIds = new Set(data.users.filter((user) => user.role !== "Customer").map((user) => user.id));
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
  });
  for (const fallback of seed.records) if (!seen.has(fallback.userId)) records.push(fallback);
  return { version: 1, records };
}

export const accountAccessFor = (state: IdentityProvisioningState, userId: string) => state.records.find((record) => record.userId === userId);
export const isOnboardingRestricted = (record?: IdentityProvisioningRecord) => Boolean(record && record.state !== "Active");
export const canUseOperationalPlatform = (record?: IdentityProvisioningRecord) => !record || record.state === "Active";

export function nextEmployeeNumber(data: WorkspaceData) {
  const internalCount = data.users.filter((user) => user.role !== "Customer").length;
  return `MD-${String(internalCount + 1).padStart(4, "0")}`;
}
