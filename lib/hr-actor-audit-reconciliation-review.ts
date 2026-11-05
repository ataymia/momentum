/**
 * REVIEW ONLY: subject-scoped HCM actor-audit reconciliation.
 *
 * Produces metadata-only, fail-closed, append-only *candidates*, not writes.
 * Source HCM audit shards are keyed by ACTOR, not employee subject. Never
 * infer a subject from entityId, actorId, before/after or a manager relation.
 * The future trusted executor must re-read source, target, authorization and
 * immutable receipt inside one transaction and never delete legacy history.
 */
import { createHash } from "node:crypto";
import { userDocPath } from "./firestore-domains";

type JsonRecord = Record<string, unknown>;
export type HrAuditSnapshot = {
  path: string;
  /** Firestore updateTime/ETag from a trusted inventory; null = verified absent. */
  version: string | null;
  data: JsonRecord | null;
};
export type HrAuditSubjectDecision = {
  sourcePath: string;
  eventId: string;
  /** Binds human review to the exact event bytes, including before/after. */
  eventDigest: string;
  subjectUid: string;
  reviewerUid: string;
  reviewedAt: string;
  evidenceRef: string;
  classification: "single-subject" | "multi-subject" | "unresolved";
};
export type HrAuditIssue =
  | "invalid-inventory" | "incomplete-inventory" | "stale-snapshot"
  | "malformed-source" | "invalid-event" | "actor-mismatch"
  | "duplicate-event" | "missing-decision" | "invalid-decision"
  | "unresolved-subject" | "unapproved-reviewer" | "target-conflict";
export type HrAuditCandidate = {
  sourcePath: string;
  sourceIndex: number;
  eventId: string;
  eventDigest: string;
  destinationPath: string;
  /** Always null: an existing target must NEVER be overwritten. */
  expectedTargetVersion: null;
};
export type HrAuditReconciliation = {
  status: "blocked" | "ready-for-human-review";
  issues: HrAuditIssue[];
  sourceCount: number;
  alreadyPresent: number;
  /** No event content, compensation, reasons, before/after or employee names. */
  candidates: HrAuditCandidate[];
  quarantine: { sourcePath: string; sourceIndex: number; reason: HrAuditIssue }[];
  /** Future executor must enforce all these inside its transaction. */
  preconditions: { path: string; expectedVersion: string | null }[];
};

const record = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uid = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(value);
const eventId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(value);
const version = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 &&
  !/[\r\n\t]/.test(value);
const utc = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
};
/** Digest is a comparison fingerprint, NOT proof of who approved a decision. */
export const fingerprintHrAuditEvent = (event: unknown): string =>
  createHash("sha256").update(canonical(event)).digest("hex");

const sourcePathFor = (actorUid: string) => userDocPath(actorUid, "hcm", "audit");
const targetPathFor = (subjectUid: string, id: string) =>
  `hrAuditReview/${subjectUid}/events/${id}`;

function inventory(snapshots: readonly HrAuditSnapshot[]) {
  const map = new Map<string, HrAuditSnapshot>();
  let valid = true;
  for (const item of snapshots) {
    if (!item || typeof item.path !== "string" || map.has(item.path) ||
        (item.version === null ? item.data !== null :
          !version(item.version) || !record(item.data))) {
      valid = false;
    } else map.set(item.path, item);
  }
  return { map, valid };
}

/**
 * Review gate, not a migration API. Caller supplies trusted, complete
 * baseline/current inventories, a separately verified set of reviewers,
 * and explicit event-to-subject decisions. No Firestore operations.
 */
export function assessHrActorAuditReconciliation(input: {
  actorUids: readonly string[];
  knownSubjectUids: ReadonlySet<string>;
  authorizedReviewerUids: ReadonlySet<string>;
  baseline: readonly HrAuditSnapshot[];
  current: readonly HrAuditSnapshot[];
  decisions: readonly HrAuditSubjectDecision[];
}): HrAuditReconciliation {
  const issues = new Set<HrAuditIssue>();
  const quarantine: HrAuditReconciliation["quarantine"] = [];
  const candidates: HrAuditCandidate[] = [];
  const required = new Set<string>();
  const before = inventory(input.baseline);
  const now = inventory(input.current);
  if (!before.valid || !now.valid) issues.add("invalid-inventory");
  if (new Set(input.actorUids).size !== input.actorUids.length ||
      input.actorUids.some((actor) => !uid(actor)) ||
      input.actorUids.length === 0) issues.add("invalid-inventory");
  const sourcePaths = new Set(input.actorUids.filter(uid).map(sourcePathFor));
  const decisions = new Map<string, HrAuditSubjectDecision>();
  for (const decision of input.decisions) {
    const key = decision.sourcePath + "\0" + decision.eventId;
    if (decisions.has(key)) issues.add("invalid-decision");
    decisions.set(key, decision);
  }
  const seenIds = new Set<string>();
  let sourceCount = 0;
  let alreadyPresent = 0;
  const fail = (path: string, index: number, reason: HrAuditIssue) => {
    issues.add(reason);
    quarantine.push({ sourcePath: path, sourceIndex: index, reason });
  };
  for (const actor of input.actorUids) {
    if (!uid(actor)) continue;
    const path = sourcePathFor(actor);
    required.add(path);
    const source = before.map.get(path);
    if (!source || !version(source.version) ||
        !record(source.data) || !Array.isArray(source.data.items)) {
      issues.add("malformed-source");
      continue;
    }
    for (const [index, value] of source.data.items.entries()) {
      sourceCount++;
      if (!record(value) || !eventId(value.id) || !utc(value.at) ||
          typeof value.action !== "string" || !value.action ||
          typeof value.entityType !== "string" || !value.entityType ||
          typeof value.entityId !== "string" || !value.entityId) {
        fail(path, index, "invalid-event");
        continue;
      }
      if (value.actorId !== actor) {
        fail(path, index, "actor-mismatch");
        continue;
      }
      if (seenIds.has(value.id)) {
        fail(path, index, "duplicate-event");
        continue;
      }
      seenIds.add(value.id);
      const decision = decisions.get(path + "\0" + value.id);
      if (!decision) {
        fail(path, index, "missing-decision");
        continue;
      }
      if (decision.classification !== "single-subject") {
        fail(path, index, "unresolved-subject");
        continue;
      }
      const digest = fingerprintHrAuditEvent(value);
      if (decision.eventDigest !== digest ||
          !uid(decision.subjectUid) || !input.knownSubjectUids.has(decision.subjectUid) ||
          !utc(decision.reviewedAt) ||
          typeof decision.evidenceRef !== "string" ||
          !/^[A-Za-z0-9_:/.-]{1,256}$/.test(decision.evidenceRef) ||
          decision.sourcePath !== path || decision.eventId !== value.id) {
        fail(path, index, "invalid-decision");
        continue;
      }
      if (!uid(decision.reviewerUid) ||
          !input.authorizedReviewerUids.has(decision.reviewerUid) ||
          decision.reviewerUid === actor) {
        fail(path, index, "unapproved-reviewer");
        continue;
      }
      const destinationPath = targetPathFor(decision.subjectUid, value.id);
      required.add(destinationPath);
      const target = before.map.get(destinationPath);
      if (!target) {
        fail(path, index, "incomplete-inventory");
        continue;
      }
      if (target.version !== null) {
        // An existing immutable receipt may be replayed, never overwritten.
        const data = target.data;
        if (!version(target.version) || !record(data) ||
            canonical(data.event) !== canonical(value) ||
            !record(data.provenance) ||
            data.provenance.sourcePath !== path ||
            data.provenance.sourceVersion !== source.version ||
            data.provenance.eventDigest !== digest ||
            data.provenance.subjectUid !== decision.subjectUid ||
            data.provenance.reviewerUid !== decision.reviewerUid ||
            data.provenance.reviewedAt !== decision.reviewedAt ||
            data.provenance.evidenceRef !== decision.evidenceRef) {
          fail(path, index, "target-conflict");
        } else alreadyPresent++;
        continue;
      }
      if (target.data !== null) {
        fail(path, index, "invalid-inventory");
        continue;
      }
      candidates.push({
        sourcePath: path, sourceIndex: index, eventId: value.id,
        eventDigest: digest, destinationPath, expectedTargetVersion: null,
      });
    }
  }
  for (const decision of input.decisions) {
    if (!sourcePaths.has(decision.sourcePath) ||
        !seenIds.has(decision.eventId) ||
        !before.map.get(decision.sourcePath)?.data ||
        !(before.map.get(decision.sourcePath)!.data!.items as unknown[]).some(
          (event) => record(event) && event.id === decision.eventId,
        )) issues.add("invalid-decision");
  }
  if (before.map.size !== required.size || now.map.size !== required.size ||
      [...before.map.keys()].some((path) => !required.has(path)) ||
      [...now.map.keys()].some((path) => !required.has(path)) ||
      [...required].some((path) => !before.map.has(path) || !now.map.has(path))) {
    issues.add("incomplete-inventory");
  }
  for (const path of required) {
    const original = before.map.get(path);
    const current = now.map.get(path);
    if (original && current &&
        (original.version !== current.version ||
         canonical(original.data) !== canonical(current.data))) {
      issues.add("stale-snapshot");
    }
  }
  // All-or-nothing: never propose a partial audit cutover when history is
  // ambiguous, stale, duplicate, missing or reviewer approval is unverifiable.
  const blocked = issues.size > 0;
  return {
    status: blocked ? "blocked" : "ready-for-human-review",
    issues: [...issues].sort(),
    sourceCount, alreadyPresent,
    candidates: blocked ? [] : candidates.sort((a, b) =>
      a.destinationPath.localeCompare(b.destinationPath)),
    quarantine: quarantine.sort((a, b) =>
      a.sourcePath.localeCompare(b.sourcePath) || a.sourceIndex - b.sourceIndex),
    preconditions: blocked ? [] : [...required].sort().map((path) => ({
      path, expectedVersion: before.map.get(path)!.version,
    })),
  };
}
