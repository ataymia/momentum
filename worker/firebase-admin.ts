/**
 * Privileged Firebase operations, performed with the service account.
 *
 * These calls bypass Security Rules, so every caller in `worker/index.ts` must have already proved it is
 * an active Administrator. Nothing here is reachable from the browser.
 */

import { serviceAccountAccessToken, type ServiceAccount } from "./service-account";

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1/projects";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";

export type AdminAuthUser = { uid: string; email: string; emailVerified: boolean; disabled: boolean; createdAt?: string; lastLoginAt?: string };

type FirestoreValue = {
  nullValue?: null; booleanValue?: boolean; integerValue?: string; doubleValue?: number;
  stringValue?: string; mapValue?: { fields?: Record<string, FirestoreValue> }; arrayValue?: { values?: FirestoreValue[] };
};
type FirestoreDocument = { name?: string; fields?: Record<string, FirestoreValue> };

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (item !== undefined) fields[key] = encodeValue(item);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

export function decodeValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  if ("mapValue" in value) {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value.mapValue?.fields ?? {})) output[key] = decodeValue(item);
    return output;
  }
  return null;
}

const toFields = (value: Record<string, unknown>) => {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) fields[key] = encodeValue(item);
  return fields;
};

export class FirebaseAdmin {
  private constructor(private readonly account: ServiceAccount, private readonly token: string, readonly projectId: string) {}

  static async create(account: ServiceAccount, projectId: string) {
    return new FirebaseAdmin(account, await serviceAccountAccessToken(account), projectId);
  }

  private headers() {
    return { authorization: `Bearer ${this.token}`, "content-type": "application/json" };
  }

  private async identity<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${IDENTITY_BASE}/${this.projectId}/${method}`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload?.error?.message ?? `Identity Toolkit ${method} failed (${response.status}).`);
    return payload;
  }

  /** Returns null when no account exists for the address. */
  async findUserByEmail(email: string): Promise<AdminAuthUser | null> {
    const payload = await this.identity<{ users?: Array<{ localId: string; email?: string; emailVerified?: boolean; disabled?: boolean; createdAt?: string; lastLoginAt?: string }> }>("accounts:lookup", { email: [email] });
    const user = payload.users?.[0];
    if (!user) return null;
    return { uid: user.localId, email: (user.email ?? email).toLowerCase(), emailVerified: Boolean(user.emailVerified), disabled: Boolean(user.disabled), createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
  }

  /** Admin-SDK-equivalent createUser. Unlike `accounts:signUp` this cannot be called from a browser. */
  async createUser(email: string, password: string): Promise<string> {
    const payload = await this.identity<{ localId?: string }>("accounts", { email, password, emailVerified: false, disabled: false });
    if (!payload.localId) throw new Error("Firebase did not return a uid for the new account.");
    return payload.localId;
  }

  async setPassword(uid: string, password: string): Promise<void> {
    await this.identity("accounts:update", { localId: uid, password });
  }

  async getDocument(path: string): Promise<Record<string, unknown> | null> {
    const response = await fetch(`${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents/${path}`, { headers: this.headers() });
    if (response.status === 404) return null;
    const payload = await response.json().catch(() => null) as FirestoreDocument | null;
    if (!response.ok || !payload) throw new Error(`Firestore read failed for ${path} (${response.status}).`);
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload.fields ?? {})) output[key] = decodeValue(value);
    return output;
  }

  /** All writes land atomically, so provisioning can never leave a half-written access record. */
  async commit(writes: Array<{ path: string; data: Record<string, unknown> }>): Promise<void> {
    const root = `projects/${this.projectId}/databases/(default)/documents`;
    const response = await fetch(`${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents:commit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ writes: writes.map((write) => ({ update: { name: `${root}/${write.path}`, fields: toFields(write.data) } })) }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message ?? `Firestore commit failed (${response.status}).`);
    }
  }

  /** Bump `platform/meta` so other open sessions notice the new employee without a reload. */
  async stampMeta(keys: string[]): Promise<void> {
    const root = `projects/${this.projectId}/databases/(default)/documents`;
    const stamp = `${new Date().toISOString()}#${crypto.randomUUID().slice(0, 6)}`;
    await fetch(`${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents:commit`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        writes: [{
          update: { name: `${root}/platform/meta`, fields: toFields({ versions: Object.fromEntries(keys.map((key) => [key, stamp])) }) },
          updateMask: { fieldPaths: keys.map((key) => `versions.${key}`) },
        }],
      }),
    }).catch(() => undefined);
  }

  /** Never used for provisioning; kept so callers can avoid re-minting a token per request. */
  get accessToken() {
    return this.token;
  }

  get serviceAccountEmail() {
    return this.account.client_email;
  }
}
