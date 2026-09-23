import { isTrainingStoragePath } from "./firebase-storage";
import type { Role } from "./types";

export const TRAINING_LIBRARY_STORAGE_KEY = "momentum-training-library-v1";

export type TrainingMaterialKind = "Video" | "Link" | "Document";
export type TrainingMaterial = {
  id: string;
  courseId: string;
  title: string;
  kind: TrainingMaterialKind;
  /** External http(s) material. Empty when the material is a file held in Firebase Storage. */
  url?: string;
  /** `training/{courseId}/{file}` in the project's Storage bucket. Resolved with the signed-in session. */
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingCourseAudience = { courseId: string; roles: Role[] };
export type TrainingLibraryState = { version: 1; materials: TrainingMaterial[]; audiences: TrainingCourseAudience[] };

/** The shape `coursesForRoleAudience` needs from an HCM `Course`, kept structural so the engines stay decoupled. */
export type AudienceTargetedCourse = { id: string; active: boolean; requiredForTeams: string[] };

/**
 * Which active courses a role must take.
 *
 * An explicit Administrator-configured role audience always wins. Courses that pre-date the audience table
 * keep their original `requiredForTeams` behaviour, so existing team-based training is unaffected. The role
 * layer exists because Brand Ambassadors and Sales Representatives are both on the Sales team but need
 * different training.
 */
export function coursesForRoleAudience<T extends AudienceTargetedCourse>(courses: T[], audiences: TrainingCourseAudience[], role: Role, team: string): T[] {
  return courses.filter((course) => {
    if (!course.active) return false;
    const audience = audiences.find((item) => item.courseId === course.id);
    return audience ? audience.roles.includes(role) : course.requiredForTeams.includes(team);
  });
}

const validKinds = new Set<TrainingMaterialKind>(["Video", "Link", "Document"]);
const validRoles = new Set<Role>(["Administrator","Sales Manager","Sales Representative","Brand Ambassador","Operations","Warehouse","Delivery Driver","Customer"]);
const instant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const validUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol); } catch { return false; }
};
/** A material must resolve to exactly one place: an external link, or a controlled Storage object. */
const hasResolvableSource = (item: Partial<TrainingMaterial>) => validUrl(item.url) || (typeof item.storagePath === "string" && isTrainingStoragePath(item.storagePath));

export const createTrainingLibrarySeed = (): TrainingLibraryState => ({ version: 1, materials: [], audiences: [] });

export function normalizeTrainingLibraryState(input: unknown, courseIds: Set<string>): TrainingLibraryState {
  if (!input || typeof input !== "object") return createTrainingLibrarySeed();
  const raw = input as Partial<TrainingLibraryState>;
  if (raw.version !== 1) return createTrainingLibrarySeed();
  const seen = new Set<string>();
  const materials = (Array.isArray(raw.materials) ? raw.materials : []).filter((item): item is TrainingMaterial => {
    if (!item || typeof item !== "object" || !item.id || seen.has(item.id) || !courseIds.has(item.courseId) || !item.title?.trim() || !validKinds.has(item.kind) || !hasResolvableSource(item) || typeof item.active !== "boolean" || !instant(item.createdAt) || !instant(item.updatedAt)) return false;
    seen.add(item.id); return true;
  }).map((item) => ({ ...item, title: item.title.trim(), url: validUrl(item.url) ? item.url!.trim() : undefined, storagePath: item.storagePath && isTrainingStoragePath(item.storagePath) ? item.storagePath : undefined, description: item.description?.trim() || undefined }));
  const audienceSeen = new Set<string>();
  const audiences = (Array.isArray(raw.audiences) ? raw.audiences : []).filter((item): item is TrainingCourseAudience => Boolean(item && courseIds.has(item.courseId) && !audienceSeen.has(item.courseId) && Array.isArray(item.roles) && item.roles.every((role) => validRoles.has(role)) && audienceSeen.add(item.courseId))).map((item) => ({ courseId: item.courseId, roles: [...new Set(item.roles)] }));
  return { version: 1, materials, audiences };
}
