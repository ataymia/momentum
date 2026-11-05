/**
 * REVIEW ONLY: a default-off, read-only reviewer identity/session gate for
 * synthetic subject-audit reconciliation. It NEVER authorizes or executes a
 * migration write, returns audit payloads, or exposes a callable endpoint.
 *
 * The injected verifier MUST be trusted Firebase Admin Auth.verifyIdToken
 * with checkRevoked=true. All authority/session documents are server-owned.
 * This module is restricted to the dedicated local emulator project.
 */
type Row = Record<string, unknown>;
type Snapshot = { exists: boolean; data: () => unknown };
type Document = { path: string; get: () => Promise<Snapshot> };
type Transaction = { get: (ref: Document) => Promise<Snapshot> };
export type HrAuditReviewerFirestore = {
  projectId: string;
  doc: (path: string) => Document;
  runTransaction: <T>(
    callback: (tx: Transaction) => Promise<T>,
    options: { readOnly: true },
  ) => Promise<T>;
};
export type HrAuditReviewerCommand = {
  /** Reviewer identity is only an assertion; Admin Auth determines the UID. */
  reviewerUid: string;
  actorUid: string;
  expectedSessionEpoch: number;
};
export type HrAuditReviewerDependencies = {
  projectId: string;
  emulatorHost: string;
  firestore: HrAuditReviewerFirestore;
  verifyIdToken: (token: string, checkRevoked: true) => Promise<unknown>;
  nowSeconds?: () => number;
};
export type HrAuditReviewerResult =
  | { ok: true; reviewerUid: string; sessionEpoch: number }
  | { ok: false; reason: "disabled" | "unavailable" | "session-revoked" |
      "not-authorized" | "authority-changed" };

type Authority = { uid: string; epoch: number; revision: string };
type Claims = { uid: string; iat: number; authTime: number; exp: number };
const validUid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const denied = (reason: Exclude<HrAuditReviewerResult, { ok: true }>["reason"]):
  HrAuditReviewerResult => ({ ok: false, reason });

function checkedClaims(value: unknown, projectId: string, now: number): Claims | null {
  if (!row(value) || !validUid(value.uid) || value.sub !== value.uid ||
      value.aud !== projectId ||
      value.iss !== "https://securetoken.google.com/" + projectId ||
      !positive(value.iat) || !positive(value.auth_time) || !positive(value.exp) ||
      value.auth_time > value.iat || value.iat > now + 60 ||
      value.iat >= value.exp || value.exp <= now) return null;
  return {
    uid: value.uid, iat: value.iat, authTime: value.auth_time, exp: value.exp,
  };
}
function sameClaims(a: Claims, b: Claims): boolean {
  return a.uid === b.uid && a.iat === b.iat &&
    a.authTime === b.authTime && a.exp === b.exp;
}
function data(snapshot: Snapshot): Row | null {
  if (!snapshot || snapshot.exists !== true ||
      typeof snapshot.data !== "function") return null;
  const value = snapshot.data();
  return row(value) ? value : null;
}
function authorityFrom(
  access: Row | null, permission: Row | null, session: Row | null,
  uid: string, epoch: number,
): Authority | null {
  if (!access || !permission || !session ||
      access.uid !== uid || access.role !== "Administrator" ||
      access.accountState !== "Active" ||
      permission.uid !== uid || permission.role !== "Administrator" ||
      permission.active !== true || permission.scope !== "actor-audit" ||
      typeof permission.revision !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(permission.revision) ||
      session.uid !== uid || session.active !== true ||
      session.epoch !== epoch) return null;
  return { uid, epoch, revision: permission.revision };
}
function sameAuthority(a: Authority, b: Authority | null): boolean {
  return !!b && a.uid === b.uid && a.epoch === b.epoch &&
    a.revision === b.revision;
}

/**
 * Verifies a trusted reviewer and checks fresh role/session state before and
 * after a read-only transaction. Returns ONLY identity metadata, not approval
 * to append audit records. Revocation after the final check is still a TOCTOU
 * risk for a future write executor; that executor must re-read authority
 * INSIDE its own write transaction and enforce its own commit-time checks.
 */
export async function executeHrAuditReviewerGateReview(
  command: HrAuditReviewerCommand,
  rawToken: unknown,
  deps: HrAuditReviewerDependencies,
  enabled = false,
): Promise<HrAuditReviewerResult> {
  if (!enabled) return denied("disabled");
  if (!deps || !command || !validUid(command.reviewerUid) ||
      !validUid(command.actorUid) ||
      command.reviewerUid === command.actorUid ||
      !Number.isSafeInteger(command.expectedSessionEpoch) ||
      command.expectedSessionEpoch < 0 ||
      deps.projectId !== "momentum-hr-admin-sdk-review" ||
      !/^(?:127\.0\.0\.1|localhost):8080$/.test(deps.emulatorHost) ||
      process.env.FIRESTORE_EMULATOR_HOST !== deps.emulatorHost ||
      process.env.GCLOUD_PROJECT !== deps.projectId ||
      deps.firestore?.projectId !== deps.projectId ||
      typeof deps.firestore.doc !== "function" ||
      typeof deps.firestore.runTransaction !== "function" ||
      typeof deps.verifyIdToken !== "function") return denied("unavailable");
  if (typeof rawToken !== "string" || rawToken.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(rawToken)) {
    return denied("session-revoked");
  }
  const uid = command.reviewerUid;
  const paths = [
    "userAccess/" + uid,
    "hrAuditReviewerAuthorityReview/" + uid,
    "hrAuditReviewerSessionReview/" + uid,
  ];
  const refs = paths.map((path) => deps.firestore.doc(path));
  if (refs.some((ref, index) => !ref || ref.path !== paths[index])) {
    return denied("unavailable");
  }
  const read = async (get: (ref: Document) => Promise<Snapshot>) => {
    const snapshots = await Promise.all(refs.map(get));
    return authorityFrom(
      data(snapshots[0]), data(snapshots[1]), data(snapshots[2]),
      uid, command.expectedSessionEpoch,
    );
  };
  try {
    const clock = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    const now = clock();
    if (!positive(now)) return denied("unavailable");
    const first = checkedClaims(
      await deps.verifyIdToken(rawToken, true), deps.projectId, now,
    );
    if (!first || first.uid !== uid) return denied("session-revoked");
    const pinned = await deps.firestore.runTransaction(
      (tx) => read((ref) => tx.get(ref)), { readOnly: true },
    );
    if (!pinned) return denied("not-authorized");
    const last = checkedClaims(
      await deps.verifyIdToken(rawToken, true), deps.projectId, clock(),
    );
    if (!last || !sameClaims(first, last)) return denied("session-revoked");
    const fresh = await read((ref) => ref.get());
    if (!sameAuthority(pinned, fresh)) return denied("authority-changed");
    return { ok: true, reviewerUid: uid, sessionEpoch: pinned.epoch };
  } catch {
    // No SDK error details, token or private records leave this boundary.
    return denied("unavailable");
  }
}
