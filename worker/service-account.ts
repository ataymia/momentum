/**
 * Google service-account access tokens, minted inside the Worker.
 *
 * The private key lives in the `FIREBASE_SERVICE_ACCOUNT` Worker secret and never leaves the isolate:
 * it is not in the repository, not in `.env`, and not in any `NEXT_PUBLIC_*` variable. The browser only
 * ever sees the provisioning *result*.
 */

export type ServiceAccount = { client_email: string; private_key: string; project_id: string };

/** Least privilege: Firestore documents + Identity Toolkit user administration. Not cloud-platform. */
const SCOPES = ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/identitytoolkit"].join(" ");
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Refresh a little early so an in-flight request never races the expiry. */
const EXPIRY_SKEW_MS = 60_000;

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured for this Worker.");
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email, private_key, or project_id.");
  return { client_email: parsed.client_email, private_key: parsed.private_key, project_id: parsed.project_id };
}

const base64url = (bytes: ArrayBuffer | Uint8Array) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

let cachedKey: CryptoKey | null = null;
let cachedKeyFor = "";

async function signingKey(account: ServiceAccount) {
  if (cachedKey && cachedKeyFor === account.client_email) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  cachedKeyFor = account.client_email;
  return cachedKey;
}

let cachedToken = "";
let cachedTokenExpiresAt = 0;

export async function serviceAccountAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - EXPIRY_SKEW_MS) return cachedToken;
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: SCOPES,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })));
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(account), new TextEncoder().encode(unsigned));
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }),
  });
  const payload = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !payload?.access_token) throw new Error("Could not obtain a Google service-account access token.");
  cachedToken = payload.access_token;
  cachedTokenExpiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
  return cachedToken;
}
