/**
 * REVIEW ONLY: disabled-by-default trusted Firebase identity boundary for
 * canonical HR reads. No callable endpoint, SDK initialization, secrets,
 * production access, browser reader, or deployment.
 *
 * The verifier MUST be supplied by trusted server code using Firebase Admin
 * verifyIdToken(token, true). Never decode a JWT or trust role/UID from a
 * browser-provided claim. The transport factory MUST load authoritative
 * session/access/directory records from server-owned storage.
 */
import {
  authorizeHrCanonicalRead, type HrCanonicalAuthority,
  type HrCanonicalReadCommand, type HrCanonicalReadResult,
} from "./hr-canonical-read-contract";
import {
  executeHrCanonicalPinnedReadReview, type HrCanonicalPinnedTransport,
} from "./hr-canonical-pinned-snapshot";

export type HrTrustedIdentityReviewDependencies = {
  /** Trusted server configuration, never a request parameter. */
  projectId: string;
  /** Inject Firebase Admin Auth.verifyIdToken; checkRevoked MUST be true. */
  verifyIdToken: (token: string, checkRevoked: true) => Promise<unknown>;
  /** Construct server-owned read transport from the verified UID only. */
  createPinnedTransport: (verifiedUid: string) => HrCanonicalPinnedTransport;
  /** Injectable server clock for deterministic synthetic tests. */
  nowSeconds?: () => number;
};

type VerifiedIdentity = {
  uid: string;
  subject: string;
  issuedAt: number;
  authenticatedAt: number;
  expiresAt: number;
};

const uidValid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const denied = (reason: "disabled" | "unavailable" | "session-revoked"): HrCanonicalReadResult =>
  ({ ok: false, reason });

/**
 * This validates the SHAPE and project binding of a token ALREADY verified
 * cryptographically by the injected Admin SDK. It is NOT a JWT verifier.
 */
function checkedClaims(value: unknown, projectId: string, now: number): VerifiedIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const claims = value as Record<string, unknown>;
  if (!uidValid(claims.uid) || claims.sub !== claims.uid ||
      claims.aud !== projectId ||
      claims.iss !== "https://securetoken.google.com/" + projectId ||
      !integer(claims.iat) || !integer(claims.auth_time) || !integer(claims.exp) ||
      claims.auth_time > claims.iat || claims.iat >= claims.exp ||
      claims.iat > now + 60 || claims.exp <= now) return null;
  return {
    uid: claims.uid, subject: claims.uid,
    issuedAt: claims.iat, authenticatedAt: claims.auth_time, expiresAt: claims.exp,
  };
}

function sameIdentity(a: VerifiedIdentity, b: VerifiedIdentity): boolean {
  return a.uid === b.uid && a.subject === b.subject &&
    a.issuedAt === b.issuedAt && a.authenticatedAt === b.authenticatedAt &&
    a.expiresAt === b.expiresAt;
}

/** A mismatched trusted session must deny, never silently switch users. */
function bindAuthority(value: HrCanonicalAuthority, verifiedUid: string): HrCanonicalAuthority {
  if (!value || value.authenticatedUid !== verifiedUid ||
      value.session?.uid !== verifiedUid ||
      value.actorAccess?.uid !== verifiedUid ||
      value.actorDirectory?.id !== verifiedUid) {
    return {
      authenticatedUid: null, session: null, actorAccess: null,
      actorDirectory: null, targetAccess: null, targetDirectory: null,
    };
  }
  return { ...value, authenticatedUid: verifiedUid };
}

function bindTransport(
  transport: HrCanonicalPinnedTransport, verifiedUid: string,
): HrCanonicalPinnedTransport {
  return {
    withReadOnlySnapshot: (callback) => transport.withReadOnlySnapshot((reader) =>
      callback({
        ...reader,
        readAuthority: async () => bindAuthority(await reader.readAuthority(), verifiedUid),
      })),
    readAuthority: async () => bindAuthority(await transport.readAuthority(), verifiedUid),
  };
}

/**
 * Never creates a callable endpoint. The default path performs zero I/O.
 * Before any HR data read, require a cryptographically verified and
 * revocation-checked Firebase identity. After the pinned read, reverify
 * revocation and re-authorize against fresh trusted session/role evidence.
 * All denial results are safe, data-free and do not retry on revocation.
 */
export async function executeHrCanonicalTrustedIdentityReview(
  command: HrCanonicalReadCommand,
  rawIdToken: unknown,
  dependencies: HrTrustedIdentityReviewDependencies,
  enabled = false,
): Promise<HrCanonicalReadResult> {
  if (!enabled) return denied("disabled");
  if (!dependencies || typeof dependencies.verifyIdToken !== "function" ||
      typeof dependencies.createPinnedTransport !== "function" ||
      typeof dependencies.projectId !== "string" ||
      !/^[a-z0-9][a-z0-9-]{4,99}$/.test(dependencies.projectId)) {
    return denied("unavailable");
  }
  // Reject malformed input before invoking even the trusted verifier.
  // Auth emulator ID tokens have an empty JWT signature segment. Syntax is
  // NOT authentication: only the injected Admin SDK verifier may accept a
  // token, and a real Admin SDK must reject unsigned tokens outside emulator.
  if (typeof rawIdToken !== "string" || rawIdToken.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(rawIdToken)) {
    return denied("session-revoked");
  }
  try {
    const clock = dependencies.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    const now = clock();
    if (!integer(now)) return denied("unavailable");
    const first = checkedClaims(
      await dependencies.verifyIdToken(rawIdToken, true), dependencies.projectId, now,
    );
    if (!first) return denied("session-revoked");
    const transport = dependencies.createPinnedTransport(first.uid);
    if (!transport || typeof transport.readAuthority !== "function" ||
        typeof transport.withReadOnlySnapshot !== "function") return denied("unavailable");
    const bound = bindTransport(transport, first.uid);
    const result = await executeHrCanonicalPinnedReadReview(command, bound, true);
    if (!result.ok) return result;

    // The SDK revocation check is intentionally repeated after the read.
    const last = checkedClaims(
      await dependencies.verifyIdToken(rawIdToken, true), dependencies.projectId, clock(),
    );
    if (!last || !sameIdentity(first, last)) return denied("session-revoked");
    const finalAuthority = await bound.readAuthority();
    const finalPermission = authorizeHrCanonicalRead(command, finalAuthority);
    if (!finalPermission.ok) return { ok: false, reason: finalPermission.reason };
    return result;
  } catch {
    // No token/HR payload or SDK error detail escapes this review contract.
    return denied("unavailable");
  }
}
