/**
 * Firebase ID token verification.
 *
 * The browser proves who the Administrator is by sending the ID token Firebase issued them. The Worker
 * must verify that token itself — an unverified `Authorization` header is just an attacker-supplied
 * string. Tokens are RS256-signed by Google's `securetoken@system` key pair; the matching public keys are
 * published as JWKS.
 */

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
/** Tolerance for clock drift between Google's issuer and the edge, in seconds. */
const CLOCK_SKEW_SECONDS = 60;

export type VerifiedIdToken = { uid: string; email: string; emailVerified: boolean };

type Jwk = JsonWebKey & { kid?: string };

let cachedKeys = new Map<string, CryptoKey>();
let cachedKeysExpireAt = 0;

async function publicKeys(): Promise<Map<string, CryptoKey>> {
  if (cachedKeys.size > 0 && Date.now() < cachedKeysExpireAt) return cachedKeys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error("Could not fetch Google's token-signing keys.");
  const payload = await response.json() as { keys?: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of payload.keys ?? []) {
    if (!jwk.kid) continue;
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  if (keys.size === 0) throw new Error("Google's token-signing key set was empty.");
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  cachedKeys = keys;
  cachedKeysExpireAt = Date.now() + maxAge * 1000;
  return keys;
}

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)))) as Record<string, unknown>;
}

function decodeSignature(segment: string) {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/** Throws on any failure; a thrown error must be treated as "not authenticated". */
export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<VerifiedIdToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token.");
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  const header = decodeSegment(rawHeader);
  if (header.alg !== "RS256") throw new Error("Unexpected ID token algorithm.");
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid) throw new Error("ID token has no key id.");

  const key = (await publicKeys()).get(kid);
  if (!key) throw new Error("ID token was signed by an unknown key.");

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeSignature(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!valid) throw new Error("ID token signature is invalid.");

  const payload = decodeSegment(rawPayload);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error("ID token was issued for another Firebase project.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("ID token has an unexpected issuer.");
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds - CLOCK_SKEW_SECONDS) throw new Error("ID token has expired.");
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) throw new Error("ID token was issued in the future.");
  if (typeof payload.auth_time === "number" && payload.auth_time > nowSeconds + CLOCK_SKEW_SECONDS) throw new Error("ID token reports a future authentication time.");

  const uid = typeof payload.sub === "string" ? payload.sub : "";
  if (!uid) throw new Error("ID token has no subject.");

  return { uid, email: typeof payload.email === "string" ? payload.email.toLowerCase() : "", emailVerified: payload.email_verified === true };
}
