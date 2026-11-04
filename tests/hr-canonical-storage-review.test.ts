import test from "node:test";
import assert from "node:assert/strict";
import { DOMAIN_SPECS, userDocPath } from "../lib/firestore-domains";
import { planHrLegacySharedField } from "../lib/hr-legacy-migration-plan";
import type { VersionedSnapshot } from "../lib/hr-legacy-reconciliation";
import {
  assessHrCanonicalCopyGate, assessHrCanonicalRoundTrip, hrCanonicalReviewPath,
} from "../lib/hr-canonical-storage-review";

const source = "domains/hcm/fields/leaveRequests";
const alex = userDocPath("uid-alex", "hcm", "leaveRequests");
const jordan = userDocPath("uid-jordan", "hcm", "leaveRequests");
const ca = hrCanonicalReviewPath("uid-alex", "leaveRequests");
const cj = hrCanonicalReviewPath("uid-jordan", "leaveRequests");
const records = [
  { id: "leave-a", userId: "uid-alex", status: "Submitted", hours: 4 },
  { id: "leave-j", userId: "uid-jordan", status: "Submitted", hours: 8 },
];
const baseline = (): VersionedSnapshot[] => [
  { path: source, version: "source@1", data: { items: structuredClone(records) } },
  { path: alex, version: null, data: null },
  { path: jordan, version: null, data: null },
];
const canonicalBefore = (): VersionedSnapshot[] => [
  { path: ca, version: null, data: null },
  { path: cj, version: null, data: null },
];
const plan = () => planHrLegacySharedField({
  field: "leaveRequests", sharedDocument: { items: structuredClone(records) },
  knownUserIds: new Set(["uid-alex", "uid-jordan"]),
  existingUserDocuments: new Map([[alex, null], [jordan, null]]),
});
const input = () => ({
  plan: plan(), baseline: baseline(), current: baseline(),
  canonicalInventory: canonicalBefore(),
});
const roundTrip = () => {
  const common = input();
  return {
    plan: common.plan, baseline: common.baseline, current: common.current,
    canonicalBefore: common.canonicalInventory,
    canonicalAfter: [
      { path: ca, version: "canonical@1", data: { items: [structuredClone(records[0])] } },
      { path: cj, version: "canonical@1", data: { items: [structuredClone(records[1])] } },
    ] as VersionedSnapshot[],
    canonicalRestored: canonicalBefore(),
    legacyAfter: baseline(),
  };
};

test("canonical HR review path accepts owner-scoped fields but never audit or path traversal", () => {
  assert.equal(ca, "hrCanonicalReview/uid-alex/fields/leaveRequests");
  for (const [uid, field] of [
    ["../admin", "leaveRequests"], ["uid-alex", "audit"],
    ["uid-alex", "employees"], ["uid-alex", "leaveRequests/../../secrets"],
  ]) assert.throws(() => hrCanonicalReviewPath(uid, field));
});

test("copy gate requires a complete version-pinned legacy and canonical inventory", () => {
  const ready = assessHrCanonicalCopyGate(input());
  assert.deepEqual(ready, {
    status: "eligible-for-synthetic-review", issues: [], records: 2, targets: 2,
  });
  assert.equal(JSON.stringify(ready).includes("uid-alex"), false);
  assert.equal((ready as unknown as Record<string, unknown>).execute, undefined);
});

test("stale legacy source or newly occupied legacy target blocks canonical planning", () => {
  const stale = input();
  stale.current[0].version = "source@2";
  assert.ok(assessHrCanonicalCopyGate(stale).issues.includes("legacy-reconciliation-blocked"));
  const occupied = input();
  occupied.current[1] = { path: alex, version: "target@1", data: { items: [] } };
  assert.ok(assessHrCanonicalCopyGate(occupied).issues.includes("legacy-reconciliation-blocked"));
});

test("missing, duplicated, or occupied canonical target is never interpreted as empty", () => {
  const missing = input();
  missing.canonicalInventory.pop();
  assert.ok(assessHrCanonicalCopyGate(missing).issues.includes("canonical-inventory-incomplete"));
  const duplicate = input();
  duplicate.canonicalInventory.push(structuredClone(duplicate.canonicalInventory[0]));
  assert.ok(assessHrCanonicalCopyGate(duplicate).issues.includes("canonical-inventory-incomplete"));
  const occupied = input();
  occupied.canonicalInventory[0] = {
    path: ca, version: "present@1", data: { items: [records[0]] },
  };
  assert.ok(assessHrCanonicalCopyGate(occupied).issues.includes("canonical-target-occupied"));
});

test("legacy records already present in old owner shards require independent reconciliation", () => {
  const existing = planHrLegacySharedField({
    field: "leaveRequests", sharedDocument: { items: structuredClone(records) },
    knownUserIds: new Set(["uid-alex", "uid-jordan"]),
    existingUserDocuments: new Map([
      [alex, { items: [structuredClone(records[0])] }], [jordan, null],
    ]),
  });
  const before = baseline();
  before[1] = { path: alex, version: "legacy@1", data: { items: [records[0]] } };
  const result = assessHrCanonicalCopyGate({
    plan: existing, baseline: before, current: structuredClone(before),
    canonicalInventory: [{ path: cj, version: null, data: null }],
  });
  assert.ok(result.issues.includes("legacy-targets-unreconciled"));
});

test("synthetic canonical copy and exact absence restore passes without changing legacy", () => {
  const result = assessHrCanonicalRoundTrip(roundTrip());
  assert.deepEqual(result, {
    status: "eligible-for-synthetic-review", issues: [], records: 2, targets: 2,
  });
  assert.equal((result as unknown as Record<string, unknown>).restore, undefined);
});

test("copied payload tampering, cross-owner records, extra or missing shards fail closed", () => {
  const altered = roundTrip();
  (altered.canonicalAfter[0].data!.items as Record<string, unknown>[])[0].hours = 999;
  assert.ok(assessHrCanonicalRoundTrip(altered).issues.includes("canonical-payload-mismatch"));
  const crossOwner = roundTrip();
  (crossOwner.canonicalAfter[0].data!.items as Record<string, unknown>[])[0].userId = "uid-jordan";
  assert.ok(assessHrCanonicalRoundTrip(crossOwner).issues.includes("canonical-payload-mismatch"));
  const missing = roundTrip();
  missing.canonicalAfter.pop();
  assert.ok(assessHrCanonicalRoundTrip(missing).issues.includes("canonical-payload-mismatch"));
  const extra = roundTrip();
  extra.canonicalAfter.push({ path: "hrCanonicalReview/uid-unknown/fields/leaveRequests",
    version: "new", data: { items: [] } });
  assert.ok(assessHrCanonicalRoundTrip(extra).issues.includes("canonical-payload-mismatch"));
});

test("restore omission, recreated target and changed legacy source are independently blocked", () => {
  const omitted = roundTrip();
  omitted.canonicalRestored.pop();
  assert.ok(assessHrCanonicalRoundTrip(omitted).issues.includes("restore-mismatch"));
  const recreated = roundTrip();
  recreated.canonicalRestored[0] = structuredClone(recreated.canonicalAfter[0]);
  assert.ok(assessHrCanonicalRoundTrip(recreated).issues.includes("restore-mismatch"));
  const sourceChanged = roundTrip();
  sourceChanged.legacyAfter[0].version = "source@2";
  assert.ok(assessHrCanonicalRoundTrip(sourceChanged).issues.includes("legacy-source-changed"));
  const sourcePayloadChanged = roundTrip();
  (sourcePayloadChanged.legacyAfter[0].data!.items as Record<string, unknown>[])[0].hours = 999;
  assert.ok(assessHrCanonicalRoundTrip(sourcePayloadChanged).issues.includes("legacy-source-changed"));
});

test("plan with conflicting source record ownership cannot be used for a canonical copy", () => {
  const bad = input();
  bad.plan.copyCandidates[0].record.userId = "uid-jordan";
  assert.ok(assessHrCanonicalCopyGate(bad).issues.includes("legacy-reconciliation-blocked"));
});


test("canonical storage matrix covers every eligible HCM owner field, with audit excluded", () => {
  const hcm = DOMAIN_SPECS.find((spec) => spec.id === "hcm")!;
  const fields = Object.entries(hcm.fields).filter(([name, spec]) =>
    Boolean(spec.userIdField) && name !== "audit" && !spec.chunkBytes);
  assert.ok(fields.length >= 15, "unexpected HCM schema reduction");
  for (const [field, spec] of fields) {
    const uid = "uid-matrix";
    const record = { id: "synthetic-" + field, [spec.userIdField!]: uid };
    const legacy = userDocPath(uid, "hcm", field);
    const sourcePath = "domains/hcm/fields/" + field;
    const candidate = planHrLegacySharedField({
      field, sharedDocument: { items: [record] },
      knownUserIds: new Set([uid]),
      existingUserDocuments: new Map([[legacy, null]]),
    });
    const snapshots: VersionedSnapshot[] = [
      { path: sourcePath, version: "source@1", data: { items: [record] } },
      { path: legacy, version: null, data: null },
    ];
    const canonicalPath = hrCanonicalReviewPath(uid, field);
    const absent: VersionedSnapshot[] = [{ path: canonicalPath, version: null, data: null }];
    const copied: VersionedSnapshot[] = [{
      path: canonicalPath, version: "copy@1", data: { items: [record] },
    }];
    const gate = assessHrCanonicalCopyGate({
      plan: candidate, baseline: snapshots, current: structuredClone(snapshots),
      canonicalInventory: absent,
    });
    assert.equal(gate.status, "eligible-for-synthetic-review", field + ": " + gate.issues.join(","));
    const result = assessHrCanonicalRoundTrip({
      plan: candidate, baseline: snapshots, current: structuredClone(snapshots),
      canonicalBefore: absent, canonicalAfter: copied, canonicalRestored: absent,
      legacyAfter: structuredClone(snapshots),
    });
    assert.equal(result.status, "eligible-for-synthetic-review", field + ": " + result.issues.join(","));
  }
  assert.throws(() => hrCanonicalReviewPath("uid-matrix", "audit"));
});
