import { currentFirebaseSession, type FirebaseAuthSession } from "./firebase-auth-rest";
import { firebaseWebConfig } from "./firebase-config";

/**
 * Firebase Cloud Storage over REST, using the existing Momentum Firebase session.
 *
 * Momentum authenticates through `firebase-auth-rest.ts`; this module reuses that same ID token instead of
 * mounting a second Firebase Auth state. Files are never made public: reads send `Authorization: Firebase
 * <idToken>` and are gated by `storage.rules`, so losing a Momentum account also loses the files.
 */

export const TRAINING_STORAGE_PREFIX = "training";
const STORAGE_ORIGIN = "https://firebasestorage.googleapis.com";
/** Matches the ceiling enforced in storage.rules. */
export const MAX_TRAINING_FILE_BYTES = 200 * 1024 * 1024;

export type StorageResult<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Collapse an arbitrary upload name to something safe to place in a Storage path.
 *
 * Path traversal, control characters, and separators are removed rather than escaped, because the object
 * name becomes part of a URL path segment and of the rules match on `{fileName}`.
 */
export function safeStorageFileName(input: string): string {
  const trimmed = input.trim().replace(/\\/g, "/");
  const base = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60);
  const extension = (dot > 0 ? base.slice(dot + 1) : "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 10).toLowerCase();
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${unique}-${stem || "file"}${extension ? `.${extension}` : ""}`;
}

export const trainingStoragePath = (courseId: string, fileName: string) => `${TRAINING_STORAGE_PREFIX}/${courseId}/${safeStorageFileName(fileName)}`;

/** A stored reference, not a public download token: the path is resolved through the signed-in session. */
export const isTrainingStoragePath = (value: string) => /^training\/[^/]+\/[^/]+$/.test(value);

function objectUrl(bucket: string, storagePath: string, query = "") {
  return `${STORAGE_ORIGIN}/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}${query}`;
}

async function requireSession(): Promise<StorageResult<{ session: FirebaseAuthSession; bucket: string }>> {
  const config = firebaseWebConfig();
  if (!config) return { ok: false, message: "Firebase is not configured in this environment." };
  const session = await currentFirebaseSession();
  if (!session) return { ok: false, message: "Your Firebase session has expired. Sign in again to continue." };
  return { ok: true, value: { session, bucket: config.storageBucket } };
}

/** Upload a training material. Only an Administrator will pass `storage.rules`; the client never decides. */
export async function uploadTrainingFile(courseId: string, file: File): Promise<StorageResult<{ storagePath: string; contentType: string; size: number }>> {
  if (!courseId.trim()) return { ok: false, message: "Choose a training module before uploading a file." };
  if (file.size <= 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_TRAINING_FILE_BYTES) return { ok: false, message: "Training files must be smaller than 200 MB." };
  const prepared = await requireSession();
  if (!prepared.ok) return prepared;
  const { session, bucket } = prepared.value;
  const storagePath = trainingStoragePath(courseId, file.name);
  const contentType = file.type || "application/octet-stream";
  const response = await fetch(objectUrl(bucket, storagePath, `?uploadType=media&name=${encodeURIComponent(storagePath)}`), {
    method: "POST",
    headers: { authorization: `Firebase ${session.idToken}`, "content-type": contentType },
    body: file,
  }).catch(() => null);
  if (!response) return { ok: false, message: "Momentum could not reach Firebase Storage." };
  if (response.status === 401 || response.status === 403) return { ok: false, message: "Firebase Storage refused the upload. Administrator access is required to manage training files." };
  if (!response.ok) return { ok: false, message: `Firebase Storage rejected the upload (${response.status}).` };
  return { ok: true, value: { storagePath, contentType, size: file.size } };
}

/**
 * Fetch a training file with the signed-in session and hand back a blob URL.
 *
 * An `Authorization` header cannot travel on an `<a href>`, so the bytes are fetched first. Callers must
 * revoke the returned URL when they are finished with it.
 */
export async function openTrainingFile(storagePath: string): Promise<StorageResult<{ objectUrl: string; contentType: string }>> {
  if (!isTrainingStoragePath(storagePath)) return { ok: false, message: "That training material does not point at a Momentum training file." };
  const prepared = await requireSession();
  if (!prepared.ok) return prepared;
  const { session, bucket } = prepared.value;
  const response = await fetch(objectUrl(bucket, storagePath, "?alt=media"), {
    headers: { authorization: `Firebase ${session.idToken}` },
  }).catch(() => null);
  if (!response) return { ok: false, message: "Momentum could not reach Firebase Storage." };
  if (response.status === 401 || response.status === 403) return { ok: false, message: "You are not permitted to open this training file." };
  if (response.status === 404) return { ok: false, message: "That training file is no longer stored in Momentum." };
  if (!response.ok) return { ok: false, message: `Firebase Storage returned ${response.status}.` };
  const blob = await response.blob();
  return { ok: true, value: { objectUrl: URL.createObjectURL(blob), contentType: response.headers.get("content-type") ?? blob.type } };
}

export async function deleteTrainingFile(storagePath: string): Promise<StorageResult<true>> {
  if (!isTrainingStoragePath(storagePath)) return { ok: false, message: "That path is not a Momentum training file." };
  const prepared = await requireSession();
  if (!prepared.ok) return prepared;
  const { session, bucket } = prepared.value;
  const response = await fetch(objectUrl(bucket, storagePath), {
    method: "DELETE",
    headers: { authorization: `Firebase ${session.idToken}` },
  }).catch(() => null);
  if (!response) return { ok: false, message: "Momentum could not reach Firebase Storage." };
  // A file that is already gone is the outcome the caller wanted.
  if (!response.ok && response.status !== 404) return { ok: false, message: `Firebase Storage refused the delete (${response.status}).` };
  return { ok: true, value: true };
}
