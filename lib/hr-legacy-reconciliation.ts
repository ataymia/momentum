/**
 * REVIEW-ONLY, deterministic HCM migration reconciliation. No SDK, reads,
 * writes, network, logging, restore or execution. Never serialize supplied
 * snapshots or migration copyCandidates to CI logs or issue descriptions.
 */
import { DOMAIN_SPECS, USER_SHARD_MANIFEST_VERSION, parseDocPath, userDocPath } from "./firestore-domains";
import { HR_LEGACY_PLAN_VERSION, type HrLegacyMigrationPlan } from "./hr-legacy-migration-plan";

type RecordValue = Record<string, unknown>;
export type VersionedSnapshot = {
  path: string;
  /** Opaque, authoritative Firestore updateTime/ETag; null means verified absent. */
  version: string | null;
  /** An explicitly inventoried document, or null for verified absence. */
  data: RecordValue | null;
};
export type HrReconciliationIssue =
  | "invalid-plan" | "incomplete-inventory" | "invalid-snapshot"
  | "stale-snapshot" | "unresolved-records" | "candidate-mismatch"
  | "invalid-chunk-manifest" | "missing-chunk" | "chunk-count-mismatch"
  | "chunk-owner-mismatch" | "backup-unverified" | "source-changed";

export type HrDryRunResult = {
  status: "ready-for-human-review" | "blocked";
  issues: HrReconciliationIssue[];
  sourceCount: number;
  candidateCount: number;
  /** Metadata only; no record values, compensation, filenames or evidence. */
  batches: { batch: number; records: number; targets: number }[];
  preconditions: { path: string; expectedVersion: string | null }[];
};

const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validVersion = (version: unknown): version is string =>
  typeof version === "string" && version.length > 0 && version.length <= 256 &&
  !/[\r\n\t]/.test(version);
const validUid = (uid: unknown): uid is string =>
  typeof uid === "string" && uid.length > 0 && uid.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(uid);
const unique = <T>(values: T[]) => [...new Set(values)];
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
const resultIssues = (issues: HrReconciliationIssue[]) => unique(issues);
const statusFor = (issues: HrReconciliationIssue[]) =>
  issues.length ? "blocked" as const : "ready-for-human-review" as const;

function inventory(snapshots: readonly VersionedSnapshot[]) {
  const byPath = new Map<string, VersionedSnapshot>();
  let valid = true;
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot.path !== "string" || byPath.has(snapshot.path) ||
        (snapshot.version === null ? snapshot.data !== null :
          !validVersion(snapshot.version) || !object(snapshot.data))) valid = false;
    else byPath.set(snapshot.path, snapshot);
  }
  return { byPath, valid };
}

/**
 * Compare a planning snapshot against an independently supplied, just-before-
 * execution snapshot. This is NOT a Firestore transaction: a future executor
 * must recheck these preconditions atomically with every write.
 */
export function assessHrLegacyBatchDryRun(input: {
  plan: HrLegacyMigrationPlan;
  baseline: readonly VersionedSnapshot[];
  current: readonly VersionedSnapshot[];
  maxBatchRecords?: number;
}): HrDryRunResult {
  const issues: HrReconciliationIssue[] = [];
  const { plan } = input;
  const fieldSpec = DOMAIN_SPECS.find((spec) => spec.id === "hcm")?.fields[plan.field];
  if (plan.version !== HR_LEGACY_PLAN_VERSION || !fieldSpec?.userIdField ||
      fieldSpec.chunkBytes || plan.field === "audit" ||
      plan.sourcePath !== `domains/hcm/fields/${plan.field}` ||
      !Number.isSafeInteger(plan.sourceCount) || plan.sourceCount < 0 ||
      !Number.isSafeInteger(plan.alreadyPresent) || plan.alreadyPresent < 0 ||
      !Number.isSafeInteger(plan.identicalSourceDuplicates) || plan.identicalSourceDuplicates < 0) {
    issues.push("invalid-plan");
  }
  if (plan.quarantine.length || plan.identicalSourceDuplicates) issues.push("unresolved-records");
  const before = inventory(input.baseline);
  const now = inventory(input.current);
  if (!before.valid || !now.valid) issues.push("invalid-snapshot");
  const source = before.byPath.get(plan.sourcePath);
  const sourceItems = source?.data?.items;
  if (!Array.isArray(sourceItems) || sourceItems.length !== plan.sourceCount)
    issues.push("invalid-plan");
  const required = new Set([plan.sourcePath]);
  const sourceOwners = new Set<string>();
  if (Array.isArray(sourceItems) && fieldSpec?.userIdField) {
    for (const record of sourceItems) {
      const uid = object(record) ? record[fieldSpec.userIdField] : undefined;
      if (!validUid(uid)) { issues.push("invalid-plan"); continue; }
      sourceOwners.add(uid);
      required.add(userDocPath(uid, "hcm", plan.field));
    }
  }
  const seenIndexes = new Set<number>();
  const seenIds = new Set<string>();
  for (const candidate of plan.copyCandidates) {
    if (!Number.isSafeInteger(candidate.sourceIndex) || candidate.sourceIndex < 0 ||
        seenIndexes.has(candidate.sourceIndex) ||
        !sourceOwners.has(candidate.ownerUid) ||
        candidate.destinationPath !== userDocPath(candidate.ownerUid, "hcm", plan.field) ||
        canonical(candidate.record) !== canonical(Array.isArray(sourceItems) ? sourceItems[candidate.sourceIndex] : undefined))
      issues.push("candidate-mismatch");
    const raw = Array.isArray(sourceItems) ? sourceItems[candidate.sourceIndex] : undefined;
    const expectedId = plan.field === "privateProfiles"
      ? "profile:" + candidate.ownerUid
      : object(raw) ? raw.id : undefined;
    if (candidate.recordId !== expectedId || typeof expectedId !== "string" ||
        seenIds.has(candidate.recordId)) issues.push("candidate-mismatch");
    seenIndexes.add(candidate.sourceIndex);
    seenIds.add(candidate.recordId);
  }
  if (plan.quarantine.length === 0 && plan.identicalSourceDuplicates === 0 &&
      plan.copyCandidates.length + plan.alreadyPresent !== plan.sourceCount)
    issues.push("invalid-plan");
  // Claims that a record is already present require an inventoried exact match.
  if (Array.isArray(sourceItems) && fieldSpec?.userIdField) {
    let verifiedPresent = 0;
    for (const [index, raw] of sourceItems.entries()) {
      if (!object(raw) || !validUid(raw[fieldSpec.userIdField])) continue;
      const uid = raw[fieldSpec.userIdField] as string;
      const id = plan.field === "privateProfiles" ? "profile:" + uid : raw.id;
      if (typeof id !== "string") { issues.push("invalid-plan"); continue; }
      const target = before.byPath.get(userDocPath(uid, "hcm", plan.field));
      const targetItems = target?.data?.items;
      if (target && target.version !== null && !Array.isArray(targetItems))
        issues.push("invalid-snapshot");
      const matches = Array.isArray(targetItems) ? targetItems.filter((item) =>
        object(item) && item[fieldSpec.userIdField!] === uid &&
        (plan.field === "privateProfiles" ? "profile:" + uid : item.id) === id) : [];
      if (matches.length > 1) issues.push("invalid-snapshot");
      if (seenIndexes.has(index)) {
        if (matches.length) issues.push("candidate-mismatch");
      } else if (matches.length === 1 && canonical(matches[0]) === canonical(raw)) {
        verifiedPresent++;
      } else {
        issues.push("candidate-mismatch");
      }
    }
    if (plan.quarantine.length === 0 && plan.identicalSourceDuplicates === 0 &&
        verifiedPresent !== plan.alreadyPresent) issues.push("candidate-mismatch");
  }
  for (const path of required) {
    const expected = before.byPath.get(path);
    const observed = now.byPath.get(path);
    if (!expected || !observed) { issues.push("incomplete-inventory"); continue; }
    if (expected.version !== observed.version) issues.push("stale-snapshot");
  }
  // A caller cannot silently omit a target or introduce a different document.
  if (before.byPath.size !== required.size || now.byPath.size !== required.size ||
      [...before.byPath.keys(), ...now.byPath.keys()].some((path) => !required.has(path)))
    issues.push("incomplete-inventory");
  const limit = input.maxBatchRecords ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 400) issues.push("invalid-plan");
  const safeIssues = resultIssues(issues);
  if (safeIssues.length) return {
    status: "blocked", issues: safeIssues, sourceCount: plan.sourceCount,
    candidateCount: plan.copyCandidates.length, batches: [], preconditions: [],
  };
  const batches: HrDryRunResult["batches"] = [];
  const size = limit;
  for (let i = 0; i < plan.copyCandidates.length; i += size) {
    const slice = plan.copyCandidates.slice(i, i + size);
    batches.push({ batch: batches.length + 1, records: slice.length,
      targets: new Set(slice.map((candidate) => candidate.destinationPath)).size });
  }
  return {
    status: "ready-for-human-review", issues: [], sourceCount: plan.sourceCount,
    candidateCount: plan.copyCandidates.length, batches,
    preconditions: [...required].sort().map((path) => ({
      path, expectedVersion: before.byPath.get(path)!.version,
    })),
  };
}

/**
 * Restore readiness is a separate evidence gate, not a rollback operation.
 * Even a "ready" answer requires human approval, provider backups and a
 * transaction-aware restore procedure. Never delete the legacy source.
 */
export function assessHrLegacyRestoreReadiness(input: {
  dryRun: HrDryRunResult;
  baseline: readonly VersionedSnapshot[];
  current: readonly VersionedSnapshot[];
  backups: readonly {
    path: string; originalVersion: string | null;
    verified: boolean; restoreTested: boolean;
  }[];
}) {
  const issues: HrReconciliationIssue[] = [];
  if (input.dryRun.status !== "ready-for-human-review") issues.push("invalid-plan");
  const before = inventory(input.baseline);
  const now = inventory(input.current);
  if (!before.valid || !now.valid) issues.push("invalid-snapshot");
  const backups = new Map<string, (typeof input.backups)[number]>();
  for (const receipt of input.backups) {
    if (backups.has(receipt.path)) issues.push("backup-unverified");
    backups.set(receipt.path, receipt);
  }
  for (const { path, expectedVersion } of input.dryRun.preconditions) {
    const prior = before.byPath.get(path);
    const observed = now.byPath.get(path);
    const backup = backups.get(path);
    if (!prior || prior.version !== expectedVersion || !observed)
      issues.push("incomplete-inventory");
    if (!backup || backup.originalVersion !== expectedVersion ||
        !backup.verified || !backup.restoreTested) issues.push("backup-unverified");
    if (path.startsWith("domains/hcm/fields/") &&
        observed?.version !== expectedVersion) issues.push("source-changed");
  }
  if (backups.size !== input.dryRun.preconditions.length) issues.push("backup-unverified");
  const distinct = resultIssues(issues);
  return { status: statusFor(distinct), issues: distinct,
    checkedDocuments: input.dryRun.preconditions.length };
}

/**
 * Read-only physical audit-chunk inspection for future recovery research.
 * This deliberately does NOT migrate HCM actor-audit, audit/events or any
 * other data. Chunk manifests cannot be treated as an items[] document.
 */
export function inspectChunkedAuditInventory(input: {
  manifestPath: string;
  snapshots: readonly VersionedSnapshot[];
}) {
  const issues: HrReconciliationIssue[] = [];
  const parsed = parseDocPath(input.manifestPath);
  if (!parsed?.uid || parsed.domainId !== "audit" || parsed.field !== "events")
    issues.push("invalid-chunk-manifest");
  const docs = inventory(input.snapshots);
  if (!docs.valid) issues.push("invalid-snapshot");
  const manifest = docs.byPath.get(input.manifestPath);
  const data = manifest?.data;
  const shards = data?.shards;
  if (!manifest || manifest.version === null || !object(data) ||
      data.shardManifestVersion !== USER_SHARD_MANIFEST_VERSION ||
      !Array.isArray(shards) || typeof data.itemCount !== "number" || !Number.isSafeInteger(data.itemCount) ||
      (data.itemCount as number) < 0 || "items" in data)
    issues.push("invalid-chunk-manifest");
  const names = Array.isArray(shards) ? shards : [];
  let total = 0;
  const expectedPaths = new Set([input.manifestPath]);
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    if (name !== `events__chunk_${String(index).padStart(6, "0")}` ||
        !parsed?.uid) { issues.push("invalid-chunk-manifest"); continue; }
    const path = userDocPath(parsed.uid, "audit", name);
    expectedPaths.add(path);
    const chunk = docs.byPath.get(path);
    if (!chunk || chunk.version === null || !Array.isArray(chunk.data?.items)) {
      issues.push("missing-chunk");
      continue;
    }
    total += chunk.data.items.length;
    for (const event of chunk.data.items) {
      if (!object(event) || event.actorId !== parsed.uid)
        issues.push("chunk-owner-mismatch");
    }
  }
  if (docs.byPath.size !== expectedPaths.size ||
      [...docs.byPath.keys()].some((path) => !expectedPaths.has(path)))
    issues.push("incomplete-inventory");
  if (object(data) && total !== data.itemCount) issues.push("chunk-count-mismatch");
  const distinct = resultIssues(issues);
  return { status: statusFor(distinct), issues: distinct,
    manifestVersion: USER_SHARD_MANIFEST_VERSION, chunks: names.length,
    countedRecords: total };
}
