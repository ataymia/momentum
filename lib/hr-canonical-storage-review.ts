/**
 * REVIEW ONLY. Synthetic canonical HR migration compatibility and restore
 * verification. No SDK, IO, writes, logging, production cutover or approval.
 * Never serialize input snapshots, record contents or candidate manifests.
 */
import { DOMAIN_SPECS, userDocPath } from "./firestore-domains";
import { assessHrLegacyBatchDryRun, type VersionedSnapshot } from "./hr-legacy-reconciliation";
import type { HrLegacyMigrationPlan } from "./hr-legacy-migration-plan";

const HCM = DOMAIN_SPECS.find((spec) => spec.id === "hcm");
const canonicalRoot = "hrCanonicalReview";
type RecordValue = Record<string, unknown>;
export type HrCanonicalReviewIssue =
  | "legacy-reconciliation-blocked" | "unsupported-field" | "legacy-targets-unreconciled"
  | "canonical-inventory-incomplete" | "canonical-target-occupied"
  | "canonical-payload-mismatch" | "restore-mismatch" | "legacy-source-changed";
export type HrCanonicalReviewResult = {
  status: "eligible-for-synthetic-review" | "blocked";
  issues: HrCanonicalReviewIssue[];
  /** Aggregate counts only; no employee names, IDs, compensation or records. */
  records: number;
  targets: number;
};

const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
};
const validUid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validVersion = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 256 &&
  !/[\r\n\t]/.test(value);

export function hrCanonicalReviewPath(uid: string, field: string): string {
  if (!validUid(uid) || !HCM?.fields[field]?.userIdField ||
      field === "audit" || HCM.fields[field].chunkBytes ||
      !/^[A-Za-z][A-Za-z0-9]*$/.test(field)) {
    throw new Error("Invalid synthetic canonical HR owner or field");
  }
  return canonicalRoot + "/" + uid + "/fields/" + field;
}

function snapshotMap(snapshots: readonly VersionedSnapshot[]) {
  const map = new Map<string, VersionedSnapshot>();
  let valid = true;
  for (const item of snapshots) {
    if (!item || typeof item.path !== "string" || map.has(item.path) ||
        (item.version === null ? item.data !== null :
          !validVersion(item.version) || !object(item.data))) {
      valid = false;
      continue;
    }
    map.set(item.path, item);
  }
  return { map, valid };
}

function targetPaths(plan: HrLegacyMigrationPlan) {
  const expected = new Map<string, RecordValue[]>();
  for (const candidate of plan.copyCandidates) {
    const path = hrCanonicalReviewPath(candidate.ownerUid, plan.field);
    const records = expected.get(path) ?? [];
    records.push(candidate.record);
    expected.set(path, records);
  }
  return expected;
}

/**
 * Requires the existing version-pinned legacy reconciliation to succeed.
 * An already-present legacy target is NOT silently treated as copied into a
 * new server-owned canonical document. This gate deliberately blocks that
 * case until a separate verified owner-scoped inventory is implemented.
 */
export function assessHrCanonicalCopyGate(input: {
  plan: HrLegacyMigrationPlan;
  baseline: readonly VersionedSnapshot[];
  current: readonly VersionedSnapshot[];
  canonicalInventory: readonly VersionedSnapshot[];
}): HrCanonicalReviewResult {
  const issues = new Set<HrCanonicalReviewIssue>();
  const { plan } = input;
  const field = HCM?.fields[plan.field];
  if (!field?.userIdField || plan.field === "audit" || field.chunkBytes) {
    issues.add("unsupported-field");
  }
  const dryRun = assessHrLegacyBatchDryRun({
    plan, baseline: input.baseline, current: input.current,
  });
  if (dryRun.status !== "ready-for-human-review") {
    issues.add("legacy-reconciliation-blocked");
  }
  if (plan.alreadyPresent > 0) issues.add("legacy-targets-unreconciled");
  const expected = new Map<string, RecordValue[]>();
  if (!issues.has("unsupported-field")) {
    try {
      for (const candidate of plan.copyCandidates) {
        if (candidate.destinationPath !== userDocPath(candidate.ownerUid, "hcm", plan.field) ||
            !object(candidate.record) ||
            candidate.record[field!.userIdField!] !== candidate.ownerUid) {
          issues.add("legacy-reconciliation-blocked");
          continue;
        }
      }
      if (!issues.has("legacy-reconciliation-blocked")) {
        for (const [path, records] of targetPaths(plan)) expected.set(path, records);
      }
    } catch {
      issues.add("unsupported-field");
    }
  }
  const inventory = snapshotMap(input.canonicalInventory);
  if (!inventory.valid || inventory.map.size !== expected.size ||
      [...inventory.map.keys()].some((path) => !expected.has(path))) {
    issues.add("canonical-inventory-incomplete");
  }
  for (const path of expected.keys()) {
    const observed = inventory.map.get(path);
    if (!observed) issues.add("canonical-inventory-incomplete");
    else if (observed.version !== null || observed.data !== null)
      issues.add("canonical-target-occupied");
  }
  return {
    status: issues.size ? "blocked" : "eligible-for-synthetic-review",
    issues: [...issues].sort(), records: plan.copyCandidates.length,
    targets: expected.size,
  };
}

/**
 * Verify a synthetic copy/restore round trip, including exact source
 * preservation and complete canonical target coverage. The test runner, not
 * this module, performs any emulator-only writes. Passing never establishes
 * real backup retention, deployed rules, server SDK safety or client parity.
 */
export function assessHrCanonicalRoundTrip(input: {
  plan: HrLegacyMigrationPlan;
  baseline: readonly VersionedSnapshot[];
  current: readonly VersionedSnapshot[];
  canonicalBefore: readonly VersionedSnapshot[];
  canonicalAfter: readonly VersionedSnapshot[];
  canonicalRestored: readonly VersionedSnapshot[];
  legacyAfter: readonly VersionedSnapshot[];
}): HrCanonicalReviewResult {
  const gate = assessHrCanonicalCopyGate({
    plan: input.plan, baseline: input.baseline, current: input.current,
    canonicalInventory: input.canonicalBefore,
  });
  const issues = new Set(gate.issues);
  if (gate.status === "blocked") return { ...gate, status: "blocked" };
  const expected = targetPaths(input.plan);
  const after = snapshotMap(input.canonicalAfter);
  const restored = snapshotMap(input.canonicalRestored);
  if (!after.valid || after.map.size !== expected.size ||
      [...after.map.keys()].some((path) => !expected.has(path))) {
    issues.add("canonical-payload-mismatch");
  }
  if (!restored.valid || restored.map.size !== expected.size ||
      [...restored.map.keys()].some((path) => !expected.has(path))) {
    issues.add("restore-mismatch");
  }
  for (const [path, records] of expected) {
    const copied = after.map.get(path);
    const actual = copied?.data?.items;
    if (!copied || !validVersion(copied.version) || !Array.isArray(actual) ||
        canonical([...actual].map(canonical).sort()) !==
        canonical([...records].map(canonical).sort())) {
      issues.add("canonical-payload-mismatch");
    }
    const restoredDoc = restored.map.get(path);
    if (!restoredDoc || restoredDoc.version !== null || restoredDoc.data !== null) {
      issues.add("restore-mismatch");
    }
  }
  const legacy = snapshotMap(input.legacyAfter);
  const original = snapshotMap(input.baseline);
  if (!legacy.valid || !original.valid || legacy.map.size !== original.map.size ||
      [...original.map].some(([path, before]) => {
        const now = legacy.map.get(path);
        return !now || now.version !== before.version ||
          canonical(now.data) !== canonical(before.data);
      })) {
    issues.add("legacy-source-changed");
  }
  return {
    status: issues.size ? "blocked" : "eligible-for-synthetic-review",
    issues: [...issues].sort(), records: gate.records, targets: gate.targets,
  };
}
