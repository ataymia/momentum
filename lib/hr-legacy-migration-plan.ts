/**
 * REVIEW-ONLY planner for legacy shared HCM arrays.
 *
 * No Firestore SDK, writes, reads, network calls, deletion, logging or automatic
 * migration. A privileged staging operator must independently inventory and
 * reconcile real records before any execution tooling is considered.
 */
import { DOMAIN_SPECS, sharedDocPath, userDocPath } from "./firestore-domains";

const HCM = DOMAIN_SPECS.find((spec) => spec.id === "hcm")!;
export const HR_LEGACY_PLAN_VERSION = 1;

type Document = { items?: unknown };
type RecordValue = Record<string, unknown>;
export type HrLegacyQuarantineReason =
  | "malformed-record" | "missing-owner" | "invalid-owner" | "unknown-owner"
  | "missing-record-id" | "duplicate-conflict" | "target-conflict" | "malformed-target"
  | "target-not-inventoried";

export type HrLegacyCopyCandidate = {
  sourceIndex: number;
  recordId: string;
  ownerUid: string;
  destinationPath: string;
  /** Sensitive in-memory payload: never serialize to audit logs, issues or browser state. */
  record: RecordValue;
};
export type HrLegacyMigrationPlan = {
  version: typeof HR_LEGACY_PLAN_VERSION;
  field: string;
  sourcePath: string;
  sourceCount: number;
  copyCandidates: HrLegacyCopyCandidate[];
  alreadyPresent: number;
  identicalSourceDuplicates: number;
  quarantine: { sourceIndex: number; reason: HrLegacyQuarantineReason }[];
  /** True only if every source item was accounted for. NOT authorization to write. */
  needsHumanReconciliation: boolean;
};

const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validUid = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9_-]+$/.test(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value &&
  value.length > 0 && value.length <= 256;

/** Stable structural comparison avoids treating a key-order change as a conflict. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function recordId(field: string, record: RecordValue): string | null {
  // The private profile is one record per uid, even if a legacy copy adds an id.
  if (field === "privateProfiles")
    return validUid(record.userId) ? `profile:${record.userId}` : null;
  return validId(record.id) ? record.id : null;
}

export function planHrLegacySharedField(input: {
  field: string;
  sharedDocument: Document;
  knownUserIds: ReadonlySet<string>;
  /** Only explicitly inventoried, per-user destination documents, not live reads. */
  existingUserDocuments: ReadonlyMap<string, Document | null>;
}): HrLegacyMigrationPlan {
  const fieldSpec = HCM.fields[input.field];
  if (!fieldSpec?.userIdField)
    throw new Error("Only HCM user-owned legacy fields can be planned");
  // An audit actorId is NOT proof of the employee whose private record is described.
  // Do not re-home audit events by actor or expose cross-employee before/after data.
  if (input.field === "audit")
    throw new Error("HCM audit requires subject-level authorization review");
  if (fieldSpec.chunkBytes)
    throw new Error("Chunked HCM fields require a separate manifest-aware migration");
  if (!object(input.sharedDocument) || !Array.isArray(input.sharedDocument.items))
    throw new Error("Legacy source must be an inventoried document with an items array");

  const source = input.sharedDocument.items;
  const quarantine: HrLegacyMigrationPlan["quarantine"] = [];
  const copyCandidates: HrLegacyCopyCandidate[] = [];
  const seen = new Map<string, { index: number; uid: string; payload: string }>();
  const conflicted = new Set<number>();
  const alreadyPresentIndices = new Set<number>();
  let identicalSourceDuplicates = 0;

  const targetCache = new Map<string, Map<string, string> | null | undefined>();
  const targetFor = (uid: string): Map<string, string> | null | undefined => {
    if (targetCache.has(uid)) return targetCache.get(uid);
    const path = userDocPath(uid, HCM.id, input.field);
    if (!input.existingUserDocuments.has(path)) {
      targetCache.set(uid, undefined);
      return undefined;
    }
    const document = input.existingUserDocuments.get(path);
    if (document === null) {
      const empty = new Map<string, string>();
      targetCache.set(uid, empty);
      return empty;
    }
    if (!object(document) || !Array.isArray(document.items)) {
      targetCache.set(uid, null);
      return null;
    }
    const records = new Map<string, string>();
    for (const item of document.items) {
      if (!object(item) || item[fieldSpec.userIdField!] !== uid) {
        targetCache.set(uid, null);
        return null;
      }
      const id = recordId(input.field, item);
      if (!id || records.has(id)) {
        targetCache.set(uid, null);
        return null;
      }
      records.set(id, canonical(item));
    }
    targetCache.set(uid, records);
    return records;
  };

  for (const [index, raw] of source.entries()) {
    if (!object(raw)) {
      quarantine.push({ sourceIndex: index, reason: "malformed-record" });
      continue;
    }
    const owner = raw[fieldSpec.userIdField];
    if (owner === undefined || owner === null || owner === "") {
      quarantine.push({ sourceIndex: index, reason: "missing-owner" });
      continue;
    }
    if (!validUid(owner)) {
      quarantine.push({ sourceIndex: index, reason: "invalid-owner" });
      continue;
    }
    if (!input.knownUserIds.has(owner)) {
      quarantine.push({ sourceIndex: index, reason: "unknown-owner" });
      continue;
    }
    const id = recordId(input.field, raw);
    if (!id) {
      quarantine.push({ sourceIndex: index, reason: "missing-record-id" });
      continue;
    }
    const payload = canonical(raw);
    const previous = seen.get(id);
    if (previous) {
      if (previous.uid === owner && previous.payload === payload) {
        identicalSourceDuplicates++;
      } else {
        conflicted.add(previous.index);
        conflicted.add(index);
      }
      continue;
    }
    seen.set(id, { index, uid: owner, payload });
    const target = targetFor(owner);
    if (target === undefined) {
      quarantine.push({ sourceIndex: index, reason: "target-not-inventoried" });
      continue;
    }
    if (target === null) {
      quarantine.push({ sourceIndex: index, reason: "malformed-target" });
      continue;
    }
    if (target.has(id)) {
      if (target.get(id) === payload) alreadyPresentIndices.add(index);
      else quarantine.push({ sourceIndex: index, reason: "target-conflict" });
      continue;
    }
    copyCandidates.push({
      sourceIndex: index, recordId: id, ownerUid: owner,
      destinationPath: userDocPath(owner, HCM.id, input.field), record: raw,
    });
  }
  // A duplicate identifier with conflicting ownership/content invalidates the
  // original too, including an original that appeared to match its target.
  for (const index of conflicted) {
    quarantine.push({ sourceIndex: index, reason: "duplicate-conflict" });
  }
  const accepted = copyCandidates.filter((entry) => !conflicted.has(entry.sourceIndex));
  return {
    version: HR_LEGACY_PLAN_VERSION,
    field: input.field,
    sourcePath: sharedDocPath(HCM.id, input.field),
    sourceCount: source.length,
    copyCandidates: accepted.sort((a, b) =>
      a.destinationPath.localeCompare(b.destinationPath) || a.recordId.localeCompare(b.recordId)),
    alreadyPresent: [...alreadyPresentIndices].filter((index) => !conflicted.has(index)).length,
    identicalSourceDuplicates,
    quarantine: quarantine.sort((a, b) => a.sourceIndex - b.sourceIndex),
    needsHumanReconciliation: quarantine.length > 0 || identicalSourceDuplicates > 0,
  };
}
