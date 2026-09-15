import type { Role } from "./types";

export const TRAINING_LIBRARY_STORAGE_KEY = "momentum-training-library-v1";

export type TrainingMaterialKind = "Video" | "Link" | "Document";
export type TrainingMaterial = {
  id: string;
  courseId: string;
  title: string;
  kind: TrainingMaterialKind;
  url: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingCourseAudience = { courseId: string; roles: Role[] };
export type TrainingLibraryState = { version: 1; materials: TrainingMaterial[]; audiences: TrainingCourseAudience[] };

const validKinds = new Set<TrainingMaterialKind>(["Video", "Link", "Document"]);
const validRoles = new Set<Role>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Customer"]);
const instant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const validUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol); } catch { return false; }
};

export const createTrainingLibrarySeed = (): TrainingLibraryState => ({ version: 1, materials: [], audiences: [] });

export function normalizeTrainingLibraryState(input: unknown, courseIds: Set<string>): TrainingLibraryState {
  if (!input || typeof input !== "object") return createTrainingLibrarySeed();
  const raw = input as Partial<TrainingLibraryState>;
  if (raw.version !== 1) return createTrainingLibrarySeed();
  const seen = new Set<string>();
  const materials = (Array.isArray(raw.materials) ? raw.materials : []).filter((item): item is TrainingMaterial => {
    if (!item || typeof item !== "object" || !item.id || seen.has(item.id) || !courseIds.has(item.courseId) || !item.title?.trim() || !validKinds.has(item.kind) || !validUrl(item.url) || typeof item.active !== "boolean" || !instant(item.createdAt) || !instant(item.updatedAt)) return false;
    seen.add(item.id); return true;
  }).map((item) => ({ ...item, title: item.title.trim(), url: item.url.trim(), description: item.description?.trim() || undefined }));
  const audienceSeen = new Set<string>();
  const audiences = (Array.isArray(raw.audiences) ? raw.audiences : []).filter((item): item is TrainingCourseAudience => Boolean(item && courseIds.has(item.courseId) && !audienceSeen.has(item.courseId) && Array.isArray(item.roles) && item.roles.every((role) => validRoles.has(role)) && audienceSeen.add(item.courseId))).map((item) => ({ courseId: item.courseId, roles: [...new Set(item.roles)] }));
  return { version: 1, materials, audiences };
}
