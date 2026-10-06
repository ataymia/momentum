import { addCalendarDays, arizonaDateKey, isValidCalendarDateKey } from "./date-time";
import type { CrmInteraction, CrmState } from "./crm-engine";
import { activeCompensation, type CompensationRecord, type HCMState, type PayBasis } from "./hcm-engine";
import { isQuickVisitLocationId } from "./quick-visit";
import type { WorkspaceData } from "./types";

export type AdminVisitRecord = CrmInteraction & {
  quickVisitBusinessName?: string;
  sampleUnit?: "can" | "case";
};

export type CompensationCorrectionInput = {
  recordId: string;
  userId: string;
  basis: Exclude<PayBasis, "Not configured">;
  rate: number;
  effectiveDate: string;
  reason: string;
  approvedBy: string;
  createdAt: string;
};

export type CompensationCorrectionResult =
  | { ok: true; state: HCMState; record: CompensationRecord; previous?: CompensationRecord }
  | { ok: false; message: string };

export function employeePhysicalVisits(crm: CrmState, userId: string): AdminVisitRecord[] {
  return (crm.interactions as AdminVisitRecord[])
    .filter((interaction) => interaction.userId === userId && interaction.type === "Visit" && interaction.physicalVisit === true)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export function employeeVisitLabel(record: AdminVisitRecord, data: WorkspaceData) {
  const account = data.accounts.find((item) => item.id === record.locationId);
  if (account) return account.locationName || account.name;
  if (record.quickVisitBusinessName?.trim()) return record.quickVisitBusinessName.trim();
  return isQuickVisitLocationId(record.locationId) ? "Unmatched Quick Visit" : "Business record unavailable";
}

export function employeeOriginatedAccounts(data: WorkspaceData, userId: string) {
  return data.accounts
    .filter((account) => account.originatorId === userId)
    .sort((left, right) => (right.lastActivity ?? "").localeCompare(left.lastActivity ?? ""));
}

export function employeeResponsibleAccounts(data: WorkspaceData, userId: string) {
  return data.accounts.filter((account) => account.ownerId === userId).sort((left, right) => left.name.localeCompare(right.name));
}

export function applyCompensationCorrection(state: HCMState, input: CompensationCorrectionInput): CompensationCorrectionResult {
  if (!input.recordId.trim() || !input.userId.trim() || !input.approvedBy.trim()) {
    return { ok: false, message: "Employee, approver, and compensation record ID are required." };
  }
  if (!["Hourly", "Salary per pay period"].includes(input.basis)) {
    return { ok: false, message: "Choose a supported pay basis." };
  }
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return { ok: false, message: "Pay rate must be greater than zero." };
  }
  if (!isValidCalendarDateKey(input.effectiveDate)) {
    return { ok: false, message: "Enter a valid effective date." };
  }
  if (!input.reason.trim()) {
    return { ok: false, message: "A correction reason is required for the audit trail." };
  }
  if (Number.isNaN(new Date(input.createdAt).getTime())) {
    return { ok: false, message: "The compensation change timestamp is invalid." };
  }
  if (state.compensation.some((record) => record.id === input.recordId)) {
    return { ok: false, message: "That compensation correction already exists." };
  }

  const previous = activeCompensation(state, input.userId, input.effectiveDate);
  const nextScheduled = state.compensation
    .filter((record) => record.userId === input.userId && record.status !== "Ended" && record.effectiveDate > input.effectiveDate)
    .sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate))[0];
  const correctionEndDate = nextScheduled ? addCalendarDays(nextScheduled.effectiveDate, -1) : undefined;
  const today = arizonaDateKey(input.createdAt);
  const status: CompensationRecord["status"] =
    input.effectiveDate > today ? "Future" :
    correctionEndDate && correctionEndDate < today ? "Ended" :
    "Active";

  const closeDate = addCalendarDays(input.effectiveDate, -1);
  const compensation = state.compensation.map((record) => {
    if (record.userId !== input.userId || record.status === "Ended") return record;
    const overlapsEffectiveDate = record.effectiveDate <= input.effectiveDate && (!record.endDate || record.endDate >= input.effectiveDate);
    if (!overlapsEffectiveDate) return record;
    return {
      ...record,
      status: "Ended" as const,
      endDate: closeDate >= record.effectiveDate ? closeDate : record.effectiveDate,
    };
  });

  const record: CompensationRecord = {
    id: input.recordId,
    userId: input.userId,
    basis: input.basis,
    rate: input.rate,
    effectiveDate: input.effectiveDate,
    endDate: correctionEndDate,
    reason: input.reason.trim(),
    status,
    approvedBy: input.approvedBy,
    createdAt: input.createdAt,
  };

  return { ok: true, state: { ...state, compensation: [record, ...compensation] }, record, previous };
}
