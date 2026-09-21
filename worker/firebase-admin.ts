/**
 * Privileged Firebase operations, performed with the service account.
 *
 * These calls bypass Security Rules, so every caller in `worker/index.ts` must have already proved it is
 * an active Administrator. Nothing here is reachable from the browser.
 */

import { serviceAccountAccessToken, type ServiceAccount } from "./service-account";

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1/projects";
const IDENTITY_PUBLIC = "https://identitytoolkit.googleapis.com/v1";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";

export type AdminAuthUser = { uid: string; email: string; emailVerified: boolean; disabled: boolean; createdAt?: string; lastLoginAt?: string };
export type PasswordSignIn = { uid: string; email: string; idToken: string; refreshToken: string; expiresIn: string };

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

  /**
   * Verifies an e-mail/password pair through the public Identity Toolkit endpoint and returns the same
   * tokens the browser would have received had it signed in directly.
   *
   * The web API key is required here (the service-account endpoints cannot verify a password). That key
   * is public by design — it is embedded in every browser bundle — and grants nothing on its own.
   * Returns null for any rejection so the caller cannot accidentally leak which half of the pair failed.
   */
  async signInWithPassword(webApiKey: string, email: string, password: string): Promise<PasswordSignIn | null> {
    const response = await fetch(`${IDENTITY_PUBLIC}/accounts:signInWithPassword?key=${encodeURIComponent(webApiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const payload = await response.json().catch(() => null) as { localId?: string; email?: string; idToken?: string; refreshToken?: string; expiresIn?: string; error?: { message?: string } } | null;
    if (!response.ok || !payload?.localId || !payload.idToken || !payload.refreshToken) {
      // Surfaced separately so the Worker can pass Firebase's own lockout back to the employee.
      if (payload?.error?.message?.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) throw new Error("TOO_MANY_ATTEMPTS_TRY_LATER");
      if (payload?.error?.message?.includes("USER_DISABLED")) throw new Error("USER_DISABLED");
      return null;
    }
    return { uid: payload.localId, email: (payload.email ?? email).toLowerCase(), idToken: payload.idToken, refreshToken: payload.refreshToken, expiresIn: payload.expiresIn ?? "3600" };
  }

  /** Sends Firebase's own password-reset e-mail. Silent on `EMAIL_NOT_FOUND`, which Firebase also hides. */
  async sendPasswordReset(webApiKey: string, email: string): Promise<void> {
    await fetch(`${IDENTITY_PUBLIC}/accounts:sendOobCode?key=${encodeURIComponent(webApiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    }).catch(() => undefined);
  }

  /** Removes the sign-in identity. Returns false when there was nothing left to delete. */
  async deleteUser(uid: string): Promise<boolean> {
    try {
      await this.identity("accounts:delete", { localId: uid });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("USER_NOT_FOUND")) return false;
      throw error;
    }
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

  private async listCollectionIds(parent: string): Promise<string[]> {
    const base = `${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents`;
    const response = await fetch(`${base}${parent ? `/${parent}` : ""}:listCollectionIds`, { method: "POST", headers: this.headers(), body: "{}" });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null) as { collectionIds?: string[] } | null;
    return payload?.collectionIds ?? [];
  }

  private async listDocumentPaths(collectionPath: string): Promise<string[]> {
    const base = `${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents`;
    const response = await fetch(`${base}/${collectionPath}?pageSize=300&mask.fieldPaths=__name__`, { headers: this.headers() });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null) as { documents?: FirestoreDocument[] } | null;
    const root = `projects/${this.projectId}/databases/(default)/documents/`;
    return (payload?.documents ?? []).map((document) => (document.name ?? "").slice(root.length)).filter(Boolean);
  }

  /**
   * Every per-user shard beneath `userDomains/{uid}`.
   *
   * Firestore has no server-side recursive delete over REST, and deleting the parent would orphan the
   * subcollections rather than remove them, so the tree is walked explicitly.
   */
  async userShardPaths(uid: string): Promise<string[]> {
    const paths: string[] = [];
    for (const domainId of await this.listCollectionIds(`userDomains/${uid}`)) {
      paths.push(...await this.listDocumentPaths(`userDomains/${uid}/${domainId}`));
    }
    return paths;
  }

  async deleteDocuments(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const root = `projects/${this.projectId}/databases/(default)/documents`;
    for (let index = 0; index < paths.length; index += 200) {
      const chunk = paths.slice(index, index + 200);
      const response = await fetch(`${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents:commit`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ writes: chunk.map((path) => ({ delete: `${root}/${path}` })) }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? `Firestore delete failed (${response.status}).`);
      }
    }
  }

  /** Every document in a top-level collection. Used to enumerate identities during the username backfill. */
  async listDocuments(collectionPath: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const base = `${FIRESTORE_BASE}/${this.projectId}/databases/(default)/documents`;
    const output: Array<{ id: string; data: Record<string, unknown> }> = [];
    let pageToken = "";
    do {
      const url = `${base}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) break;
      const payload = await response.json().catch(() => null) as { documents?: FirestoreDocument[]; nextPageToken?: string } | null;
      for (const document of payload?.documents ?? []) {
        const id = (document.name ?? "").split("/").pop() ?? "";
        if (!id) continue;
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(document.fields ?? {})) data[key] = decodeValue(value);
        output.push({ id, data });
      }
      pageToken = payload?.nextPageToken ?? "";
    } while (pageToken);
    return output;
  }

  /** Never used for provisioning; kept so callers can avoid re-minting a token per request. */
  get accessToken() {
    return this.token;
  }

  get serviceAccountEmail() {
    return this.account.client_email;
  }
}
