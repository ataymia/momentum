import assert from "node:assert/strict";
import test from "node:test";
import type { PersistenceScope } from "../lib/firebase-access";
import { DOMAIN_SPECS, domainDocuments } from "../lib/firestore-domains";
import {
  assessHrShadowCutover, planHrShadowReadPaths,
} from "../lib/hr-shadow-read-compatibility";

const hcm = DOMAIN_SPECS.find((spec) => spec.id === "hcm")!;
const scope = (
  uid: string, role: PersistenceScope["role"],
  accountState: PersistenceScope["accountState"] = "Active",
  reports: string[] = [],
): PersistenceScope => ({
  uid, role, accountState,
  readableUserIds: new Set([uid, ...reports]),
  managedUserIds: new Set(reports),
  supervisedBrandAmbassadorIds: new Set(),
});
const shared = (field: string) => `domains/hcm/fields/${field}`;
const owned = (uid: string, field: string) => `userDomains/${uid}/hcm/${field}`;

test("legacy client asks for forbidden shared HCM fields; shadow client omits them", () => {
  const employee = scope("uid-alex", "Sales Representative");
  const old = domainDocuments(hcm, employee).map((entry) => entry.path);
  const next = planHrShadowReadPaths(employee);
  assert.ok(old.includes(shared("documents")));
  assert.ok(old.includes(shared("compensation")));
  assert.ok(next.incompatibleLegacyPaths.includes(shared("documents")));
  assert.ok(next.incompatibleLegacyPaths.includes(shared("compensation")));
  assert.ok(!next.readable.some((entry) => entry.path === shared("documents")));
  assert.ok(next.readable.some((entry) => entry.path === owned("uid-alex", "documents")));
  assert.ok(next.readable.some((entry) => entry.path === owned("uid-alex", "compensation")));
  assert.ok(next.readable.some((entry) => entry.path === shared("employees")));
  assert.ok(next.readable.some((entry) => entry.path === shared("policies")));
  assert.ok(next.readable.some((entry) => entry.path === shared("_root")));
});

test("all owner-tagged HCM shared fields are denied to non-admin roles", () => {
  const sensitive = Object.entries(hcm.fields)
    .filter(([, spec]) => Boolean(spec.userIdField))
    .map(([field]) => field);
  for (const role of [
    "Sales Representative", "Sales Manager", "Marketing", "Operations",
    "Warehouse", "Delivery Driver", "Brand Ambassador",
  ] as const) {
    const plan = planHrShadowReadPaths(scope("uid-alex", role));
    for (const field of sensitive) {
      assert.ok(!plan.readable.some((entry) => entry.path === shared(field)), `${role} ${field}`);
    }
    assert.ok(plan.readable.every((entry) => entry.path.startsWith("userDomains/") ||
      !sensitive.some((field) => entry.path === shared(field))));
  }
});

test("manager keeps direct-report documents but never receives report compensation or audit", () => {
  const plan = planHrShadowReadPaths(scope("uid-manager", "Sales Manager", "Active", ["uid-alex"]));
  const paths = plan.readable.map((entry) => entry.path);
  assert.ok(paths.includes(owned("uid-alex", "documents")));
  assert.ok(!paths.includes(owned("uid-alex", "compensation")));
  assert.ok(!paths.includes(owned("uid-alex", "audit")));
  assert.ok(!plan.incompatibleLegacyPaths.includes(owned("uid-alex", "compensation")));
  assert.ok(!paths.includes(owned("uid-jordan", "documents")));
});

test("Administrator retains shared recovery and per-user shard paths", () => {
  const admin = scope("uid-admin", "Administrator", "Active", ["uid-alex", "uid-jordan"]);
  const before = domainDocuments(hcm, admin);
  const after = planHrShadowReadPaths(admin);
  assert.deepEqual(after.readable, before);
  assert.deepEqual(after.incompatibleLegacyPaths, []);
});

test("separated, suspended and customer sessions receive no HCM paths", () => {
  for (const [role, accountState] of [
    ["Sales Representative", "Separated"], ["Sales Representative", "Suspended"],
    ["Customer", "Active"],
  ] as const) {
    const result = planHrShadowReadPaths(scope("uid-blocked", role, accountState));
    assert.deepEqual(result.readable, []);
    assert.deepEqual(result.incompatibleLegacyPaths, []);
  }
});

test("cutover inventory fails closed on missing, unverified and unreconciled legacy records", () => {
  const fields = Object.entries(hcm.fields)
    .filter(([field, spec]) => field !== "audit" && Boolean(spec.userIdField))
    .map(([field]) => field);
  const emptyVerified = fields.map((field) => ({
    field, sourceCount: 0, sourceVerified: true, destinationReconciled: false,
  }));
  assert.deepEqual(assessHrShadowCutover(emptyVerified), {
    compatibleForReview: true, issueCodes: [],
  });
  assert.deepEqual(assessHrShadowCutover(emptyVerified.slice(1)).issueCodes, ["inventory-incomplete"]);
  assert.deepEqual(assessHrShadowCutover([
    ...emptyVerified.slice(1),
    { ...emptyVerified[0], sourceCount: 2, sourceVerified: false },
  ]).issueCodes, ["legacy-records-unreconciled", "source-not-verified"]);
  assert.deepEqual(assessHrShadowCutover([
    ...emptyVerified, { ...emptyVerified[0] },
  ]).issueCodes, ["unknown-or-duplicate-field"]);
  assert.deepEqual(assessHrShadowCutover([
    ...emptyVerified.slice(1), { ...emptyVerified[0], sourceCount: -1 },
  ]).issueCodes, ["invalid-source-count"]);
  assert.deepEqual(assessHrShadowCutover([
    ...emptyVerified.slice(1), { ...emptyVerified[0], sourceCount: 1, destinationReconciled: true },
  ]), { compatibleForReview: true, issueCodes: [] });
  // This is an evidence checkpoint only, not a claim that the actual records
  // or migration receipts were independently validated.
});
