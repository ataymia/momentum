import { canSuperviseBrandAmbassador } from "./access";
import { isValidCalendarDateKey } from "./date-time";
import type { WorkspaceData, WorkspaceUser } from "./types";

export const BRAND_AMBASSADOR_STORAGE_KEY = "momentum-brand-ambassador-v1";

export type BrandAmbassadorAssignmentStatus = "Scheduled" | "Completed" | "Cancelled";

/**
 * One assignment per Ambassador. Multiple assignments can share eventGroupId when several people work the
 * same activation. Sharding each record by ambassadorId lets Firestore prove who a Sales Representative may
 * schedule without granting that rep access to the Ambassador's HR records.
 */
export type BrandAmbassadorAssignment = {
  id: string;
  eventGroupId: string;
  ambassadorId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  requiredStaff: number;
  notes?: string;
  status: BrandAmbassadorAssignmentStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type BrandAmbassadorState = { version: 1; assignments: BrandAmbassadorAssignment[] };

export type BrandAmbassadorEventDraft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  requiredStaff: number;
  notes?: string;
  ambassadorIds: string[];
};

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const instant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export const createBrandAmbassadorSeed = (): BrandAmbassadorState => ({ version: 1, assignments: [] });

export function normalizeBrandAmbassadorState(input: unknown, data: WorkspaceData): BrandAmbassadorState {
  if (!input || typeof input !== "object") return createBrandAmbassadorSeed();
  const raw = input as Partial<BrandAmbassadorState>;
  if (raw.version !== 1 || !Array.isArray(raw.assignments)) return createBrandAmbassadorSeed();
  const ambassadors = new Set(data.users.filter((user) => user.role === "Brand Ambassador").map((user) => user.id));
  const users = new Set(data.users.map((user) => user.id));
  const seen = new Set<string>();
  const assignments = raw.assignments.flatMap((item): BrandAmbassadorAssignment[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as BrandAmbassadorAssignment;
    if (!record.id || seen.has(record.id) || !record.eventGroupId || !ambassadors.has(record.ambassadorId) || !text(record.title) || !isValidCalendarDateKey(record.date) || !timePattern.test(record.startTime) || !timePattern.test(record.endTime) || record.endTime <= record.startTime || !text(record.address) || !Number.isInteger(record.requiredStaff) || record.requiredStaff < 1 || !["Scheduled", "Completed", "Cancelled"].includes(record.status) || !users.has(record.createdBy) || !instant(record.createdAt) || !instant(record.updatedAt)) return [];
    seen.add(record.id);
    return [{ ...record, title: record.title.trim(), address: record.address.trim(), notes: record.notes?.trim() || undefined }];
  });
  return { version: 1, assignments };
}

export function validateBrandAmbassadorEvent(data: WorkspaceData, actor: WorkspaceUser | null | undefined, draft: BrandAmbassadorEventDraft): string | null {
  if (!actor || !["Administrator", "Sales Representative"].includes(actor.role)) return "You do not have permission to schedule Brand Ambassadors.";
  if (draft.title.trim().length < 2) return "Enter an event name.";
  if (!isValidCalendarDateKey(draft.date)) return "Choose a valid event date.";
  if (!timePattern.test(draft.startTime) || !timePattern.test(draft.endTime) || draft.endTime <= draft.startTime) return "Choose a valid start and end time.";
  if (draft.address.trim().length < 4) return "Enter the event address or venue location.";
  if (!Number.isInteger(draft.requiredStaff) || draft.requiredStaff < 1) return "Enter how many Brand Ambassadors are needed.";
  const unique = [...new Set(draft.ambassadorIds)];
  if (!unique.length) return "Assign at least one Brand Ambassador.";
  if (unique.some((id) => !canSuperviseBrandAmbassador(data, actor, id))) return "One or more selected Brand Ambassadors are outside your scheduling authority.";
  if (unique.length > draft.requiredStaff) return "Assigned Brand Ambassadors cannot exceed the event headcount.";
  return null;
}

export function brandAmbassadorsVisibleTo(data: WorkspaceData, actor: WorkspaceUser | null | undefined) {
  if (!actor) return [];
  if (actor.role === "Administrator") return data.users.filter((user) => user.role === "Brand Ambassador");
  if (actor.role === "Sales Representative") return data.users.filter((user) => user.role === "Brand Ambassador" && user.managerId === actor.id);
  if (actor.role === "Brand Ambassador") return data.users.filter((user) => user.id === actor.id);
  return [];
}

export function assignmentsVisibleTo(data: WorkspaceData, actor: WorkspaceUser | null | undefined, state: BrandAmbassadorState) {
  if (!actor) return [];
  if (actor.role === "Administrator") return state.assignments;
  if (actor.role === "Brand Ambassador") return state.assignments.filter((assignment) => assignment.ambassadorId === actor.id);
  if (actor.role === "Sales Representative") {
    const allowed = new Set(brandAmbassadorsVisibleTo(data, actor).map((user) => user.id));
    return state.assignments.filter((assignment) => allowed.has(assignment.ambassadorId));
  }
  return [];
}

export type BrandAmbassadorEventGroup = {
  eventGroupId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  requiredStaff: number;
  notes?: string;
  status: BrandAmbassadorAssignmentStatus;
  ambassadorIds: string[];
};

export function groupBrandAmbassadorAssignments(assignments: BrandAmbassadorAssignment[]): BrandAmbassadorEventGroup[] {
  const groups = new Map<string, BrandAmbassadorEventGroup>();
  for (const assignment of assignments) {
    const existing = groups.get(assignment.eventGroupId);
    if (existing) {
      if (!existing.ambassadorIds.includes(assignment.ambassadorId)) existing.ambassadorIds.push(assignment.ambassadorId);
      if (assignment.status === "Completed" && existing.status === "Scheduled") existing.status = "Completed";
      continue;
    }
    groups.set(assignment.eventGroupId, {
      eventGroupId: assignment.eventGroupId,
      title: assignment.title,
      date: assignment.date,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      address: assignment.address,
      requiredStaff: assignment.requiredStaff,
      notes: assignment.notes,
      status: assignment.status,
      ambassadorIds: [assignment.ambassadorId],
    });
  }
  return [...groups.values()].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}
