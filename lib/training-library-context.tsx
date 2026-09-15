"use client";

import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { deleteTrainingFile, uploadTrainingFile } from "./firebase-storage";
import { useHcm } from "./hcm-context";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import { TRAINING_LIBRARY_STORAGE_KEY, TrainingLibraryState, TrainingMaterialKind, createTrainingLibrarySeed, normalizeTrainingLibraryState } from "./training-library-engine";
import type { Role } from "./types";
import { useWorkspace } from "./workspace-context";

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function readState(courseIds: Set<string>) {
  if (typeof window === "undefined") return createTrainingLibrarySeed();
  try { return normalizeTrainingLibraryState(JSON.parse(momentumStorage.getItem(TRAINING_LIBRARY_STORAGE_KEY) ?? "null"), courseIds); }
  catch { return createTrainingLibrarySeed(); }
}

type TrainingLibraryContextValue = {
  state: TrainingLibraryState;
  materialsForCourse: (courseId: string) => TrainingLibraryState["materials"];
  rolesForCourse: (courseId: string) => Role[];
  setCourseRoles: (courseId: string, roles: Role[]) => boolean;
  addMaterial: (courseId: string, input: { title: string; kind: TrainingMaterialKind; url: string; description?: string }) => { ok: true } | { ok: false; message: string };
  uploadMaterial: (courseId: string, input: { title: string; kind: TrainingMaterialKind; description?: string; file: File }) => Promise<{ ok: true } | { ok: false; message: string }>;
  removeMaterial: (materialId: string) => boolean;
};

const Context = createContext<TrainingLibraryContextValue | null>(null);

export function TrainingLibraryProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useWorkspace();
  const { hcm } = useHcm();
  const courseIds = useMemo(() => new Set(hcm.courses.map((course) => course.id)), [hcm.courses]);
  const [state, setState] = useState<TrainingLibraryState>(() => readState(courseIds));
  useRemoteStorageSync(TRAINING_LIBRARY_STORAGE_KEY, () => setState(readState(courseIds)));

  const commit = (next: TrainingLibraryState) => {
    const normalized = normalizeTrainingLibraryState(next, courseIds);
    setState(normalized);
    momentumStorage.setItem(TRAINING_LIBRARY_STORAGE_KEY, JSON.stringify(normalized));
  };

  const materialsForCourse = (courseId: string) => state.materials.filter((material) => material.courseId === courseId && material.active);
  const rolesForCourse = (courseId: string) => state.audiences.find((audience) => audience.courseId === courseId)?.roles ?? [];
  const setCourseRoles = (courseId: string, roles: Role[]) => {
    if (currentUser?.role !== "Administrator" || !courseIds.has(courseId)) return false;
    const next = [...new Set(roles)].filter((role) => role !== "Customer");
    commit({ ...state, audiences: [{ courseId, roles: next }, ...state.audiences.filter((item) => item.courseId !== courseId)] });
    return true;
  };
  const addMaterial = (courseId: string, input: { title: string; kind: TrainingMaterialKind; url: string; description?: string }) => {
    if (currentUser?.role !== "Administrator" || !courseIds.has(courseId)) return { ok: false as const, message: "Administrator access is required." };
    if (input.title.trim().length < 2) return { ok: false as const, message: "Enter a material title." };
    let url: URL;
    try { url = new URL(input.url.trim()); } catch { return { ok: false as const, message: "Enter a valid http or https link." }; }
    if (!["http:", "https:"].includes(url.protocol)) return { ok: false as const, message: "Training links must use http or https." };
    const at = new Date().toISOString();
    commit({ ...state, materials: [{ id: id("training-material"), courseId, title: input.title.trim(), kind: input.kind, url: url.toString(), description: input.description?.trim() || undefined, active: true, createdAt: at, updatedAt: at }, ...state.materials] });
    return { ok: true as const };
  };
  const removeMaterial = (materialId: string) => {
    if (currentUser?.role !== "Administrator") return false;
    const existing = state.materials.find((material) => material.id === materialId);
    if (!existing) return false;
    // Retire the record first: the stored object is secondary evidence, and a Storage failure must not
    // leave a material the Administrator believes they removed.
    commit({ ...state, materials: state.materials.map((material) => material.id === materialId ? { ...material, active: false, updatedAt: new Date().toISOString() } : material) });
    if (existing.storagePath) void deleteTrainingFile(existing.storagePath);
    return true;
  };

  /** Upload the file to Firebase Storage first; only a stored object earns a material record. */
  const uploadMaterial = async (courseId: string, input: { title: string; kind: TrainingMaterialKind; description?: string; file: File }) => {
    if (currentUser?.role !== "Administrator" || !courseIds.has(courseId)) return { ok: false as const, message: "Administrator access is required." };
    if (input.title.trim().length < 2) return { ok: false as const, message: "Enter a material title." };
    const uploaded = await uploadTrainingFile(courseId, input.file);
    if (!uploaded.ok) return { ok: false as const, message: uploaded.message };
    const at = new Date().toISOString();
    commit({ ...state, materials: [{ id: id("training-material"), courseId, title: input.title.trim(), kind: input.kind, storagePath: uploaded.value.storagePath, fileName: input.file.name, contentType: uploaded.value.contentType, sizeBytes: uploaded.value.size, description: input.description?.trim() || undefined, active: true, createdAt: at, updatedAt: at }, ...state.materials] });
    return { ok: true as const };
  };

  return <Context.Provider value={{ state, materialsForCourse, rolesForCourse, setCourseRoles, addMaterial, uploadMaterial, removeMaterial }}>{children}</Context.Provider>;
}

export function useTrainingLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error("useTrainingLibrary must be used inside TrainingLibraryProvider");
  return value;
}
