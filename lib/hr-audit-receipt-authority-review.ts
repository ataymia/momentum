/**
 * REVIEW ONLY: deterministic, fail-closed authority predicate for a proposed
 * immutable HR audit receipt. Invoke INSIDE the trusted Firestore write
 * transaction, using snapshots read by that transaction. This module has no
 * persistence, endpoint, token-verification or migration capability.
 */
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const evidence = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_:/.-]{1,256}$/.test(value);
const revision = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export type HrAuditReceiptAuthorityRequest = {
  reviewerUid: string;
  actorUid: string;
  subjectUid: string;
  eventId: string;
  sourcePath: string;
  eventDigest: string;
  evidenceRef: string;
  expectedSessionEpoch: number;
  /** A trusted, separately approved revision, never supplied by the browser. */
  approvedAuthorityRevision: string;
};

/**
 * Data must come from server-owned documents read in the SAME transaction as
 * the original source, target and receipt. A previous read-only gate result
 * is not proof that these records are still current.
 */
export function authorizedHrAuditReceiptTransactionReview(input: {
  request: HrAuditReceiptAuthorityRequest;
  access: unknown;
  reviewerAuthority: unknown;
  reviewerSession: unknown;
  subjectDecision: unknown;
}): boolean {
  const { request, access, reviewerAuthority, reviewerSession, subjectDecision } = input;
  if (!request || !uid(request.reviewerUid) || !uid(request.actorUid) ||
      !uid(request.subjectUid) || !uid(request.eventId) ||
      request.reviewerUid === request.actorUid ||
      !digest(request.eventDigest) || !evidence(request.evidenceRef) ||
      !revision(request.approvedAuthorityRevision) ||
      !Number.isSafeInteger(request.expectedSessionEpoch) ||
      request.expectedSessionEpoch < 0 ||
      request.sourcePath !== "userDomains/" + request.actorUid + "/hcm/audit" ||
      !row(access) || !row(reviewerAuthority) || !row(reviewerSession) ||
      !row(subjectDecision)) return false;

  return access.uid === request.reviewerUid &&
    access.role === "Administrator" && access.accountState === "Active" &&
    reviewerAuthority.uid === request.reviewerUid &&
    reviewerAuthority.role === "Administrator" &&
    reviewerAuthority.active === true &&
    reviewerAuthority.scope === "actor-audit" &&
    reviewerAuthority.revision === request.approvedAuthorityRevision &&
    reviewerSession.uid === request.reviewerUid &&
    reviewerSession.active === true &&
    reviewerSession.epoch === request.expectedSessionEpoch &&
    subjectDecision.verified === true &&
    subjectDecision.classification === "single-subject" &&
    subjectDecision.sourcePath === request.sourcePath &&
    subjectDecision.eventId === request.eventId &&
    subjectDecision.eventDigest === request.eventDigest &&
    subjectDecision.subjectUid === request.subjectUid &&
    subjectDecision.reviewerUid === request.reviewerUid &&
    subjectDecision.evidenceRef === request.evidenceRef &&
    timestamp(subjectDecision.reviewedAt);
}
