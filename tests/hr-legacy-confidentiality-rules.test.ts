/**
 * Review-only legacy HR Firestore confidentiality characterization.
 *
 * CURRENT rules deliberately demonstrate the known shared-array read weakness.
 * SHADOW rules are an in-memory candidate, NOT the deployed/generated policy.
 * The shadow candidate must not be shipped until shared records are inventoried,
 * reconciled, backfilled and client read paths have been migrated.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { DOMAIN_SPECS, assembleState, domainDocuments, parseDocPath } from "../lib/firestore-domains";
import { planHrShadowReadPaths } from "../lib/hr-shadow-read-compatibility";
import type { PersistenceScope } from "../lib/firebase-access";

const sourceRules = readFileSync("firestore.rules", "utf8");
const privateFields = [
  "privateProfiles", "documents", "compensation", "compensationChanges",
  "leaveRequests", "profileChangeRequests", "dependents", "benefitEnrollments",
  "benefitEvents", "ptoLedger", "ptoAssignments", "employmentChanges",
  "workflows", "reviews", "goals", "tasks", "availability", "shiftRequests",
  "training", "acknowledgments",
];
const pattern = /(match \/hcm\/fields\/\{field\} \{\s*allow get, list: if )([^\n]+)(;)/;
assert.match(sourceRules, pattern, "generated HCM shared-field rule must be present");
const guard = (predicate: string) =>
  "(" + predicate + ") && (!(field in [" + privateFields.map((field) => "'" + field + "'").join(", ") + "]) || isAdmin())";
const shadowReadRules = sourceRules.replace(pattern,
  (_match, prefix: string, predicate: string, end: string) => prefix + guard(predicate) + end);
const writePattern = /(match \/hcm\/fields\/\{field\} \{\s*allow get, list: if [^\n]+;\s*allow write: if )([^\n]+)(;)/;
assert.match(shadowReadRules, writePattern, "generated HCM shared write rule must be present");
const sharedShadowRules = shadowReadRules.replace(writePattern,
  (_match, prefix: string, predicate: string, end: string) => prefix + guard(predicate) + end);
// HCM audit is actor-sharded, not subject-sharded; an actor might read/write
// another employee's before/after history. This is a SHADOW-ONLY candidate.
const auditBlockStart = sharedShadowRules.indexOf("match /{uid}/hcm/{field} {");
const auditBlockEnd = sharedShadowRules.indexOf("\n    }", auditBlockStart);
assert.ok(auditBlockStart >= 0 && auditBlockEnd > auditBlockStart, "HCM user-shard rules missing");
const auditBlock = sharedShadowRules.slice(auditBlockStart, auditBlockEnd);
const shadowAuditBlock = auditBlock
  .replace("allow get, list: if", "allow get, list: if (field != 'audit' || isAdmin()) &&")
  .replace("allow write: if", "allow write: if (field != 'audit' || isAdmin()) &&");
const shadowRules = sharedShadowRules.slice(0, auditBlockStart) + shadowAuditBlock +
  sharedShadowRules.slice(auditBlockEnd);
assert.notEqual(shadowRules, sourceRules, "shadow policy must actually differ from current rules");

type Environment = RulesTestEnvironment;
let current: Environment;
let shadow: Environment;
const identities = [
  ["uid-admin", "Administrator", "Active", ""],
  ["uid-manager", "Sales Manager", "Active", ""],
  ["uid-alex", "Sales Representative", "Active", "uid-manager"],
  ["uid-jordan", "Sales Representative", "Active", ""],
  ["uid-marketing", "Marketing", "Active", ""],
  ["uid-onboarding", "Sales Representative", "Onboarding", ""],
  ["uid-separated", "Sales Representative", "Separated", ""],
  ["uid-customer", "Customer", "Active", ""],
] as const;

const contextDb = (env: Environment, uid: string) =>
  env.authenticatedContext(uid, {
    email: `${uid}@momentum.test`, email_verified: true,
  }).firestore();

async function seed(env: Environment) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, accountState, managerId] of identities) {
      await setDoc(doc(db, "userAccess", uid), {
        role, team: role === "Customer" ? "Customer" : "Sales",
        accountState, managerId, managedTeams: [],
        email: `${uid}@momentum.test`, updatedAt: "2026-11-04",
      });
    }
    // Deliberately synthetic legacy data. A direct read would expose another
    // employee's record under current rules. Never use real names, pay or files.
    for (const field of privateFields) {
      await setDoc(doc(db, "domains/hcm/fields", field), {
        items: [{ id: `synthetic-${field}`, userId: "uid-jordan", marker: "OTHER_EMPLOYEE" }],
      });
      await setDoc(doc(db, "userDomains/uid-jordan/hcm", field), {
        items: [{ id: `synthetic-${field}`, userId: "uid-jordan", marker: "OWNER_ONLY" }],
      });
    }
    await setDoc(doc(db, "userDomains/uid-alex/hcm/documents"), {
      items: [{ id: "synthetic-alex-own", userId: "uid-alex", marker: "ALEX_ONLY" }],
    });
    // Deliberate legacy-only self-service history: a new client must not
    // mistake an empty owner shard for successful backfill.
    await setDoc(doc(db, "domains/hcm/fields/leaveRequests"), {
      items: [
        { id: "synthetic-jordan-leave", userId: "uid-jordan", marker: "OTHER_EMPLOYEE" },
        { id: "synthetic-alex-leave", userId: "uid-alex", marker: "LEGACY_ONLY" },
      ],
    });
    await setDoc(doc(db, "userDomains/uid-alex/hcm/audit"), {
      items: [{ id: "synthetic-cross-audit", actorId: "uid-alex",
        entityId: "uid-jordan", before: "SYNTHETIC_OTHER_EMPLOYEE" }],
    });
    await setDoc(doc(db, "domains/hcm/fields/policies"), { items: [] });
    await setDoc(doc(db, "domains/hcm/fields/audit"), { items: [{ id: "synthetic-audit" }] });
  });
}

before(async () => {
  current = await initializeTestEnvironment({
    projectId: "momentum-hcm-legacy-current",
    firestore: { rules: sourceRules, host: "127.0.0.1", port: 8080 },
  });
  shadow = await initializeTestEnvironment({
    projectId: "momentum-hcm-legacy-shadow",
    firestore: { rules: shadowRules, host: "127.0.0.1", port: 8080 },
  });
  await seed(current);
  await seed(shadow);
});

after(async () => {
  await current?.cleanup();
  await shadow?.cleanup();
});

test("CURRENT rules reproduce a cross-employee shared-field read exposure in emulator ONLY", async () => {
  for (const field of ["privateProfiles", "documents", "compensation", "leaveRequests"]) {
    const result = await assertSucceeds(getDoc(doc(contextDb(current, "uid-alex"), "domains/hcm/fields", field)));
    assert.equal(result.data()?.items?.[0]?.marker, "OTHER_EMPLOYEE");
  }
  // This is a known failing confidentiality gate, NOT a positive security result.
  await assertFails(getDoc(doc(contextDb(current, "uid-alex"), "domains/hcm/fields/audit")));
});

test("SHADOW candidate denies all employee-owned shared HCM fields to non-Administrators", async () => {
  for (const uid of ["uid-alex", "uid-manager", "uid-marketing", "uid-onboarding", "uid-separated", "uid-customer"]) {
    for (const field of privateFields) {
      await assertFails(getDoc(doc(contextDb(shadow, uid), "domains/hcm/fields", field)));
    }
  }
  for (const field of privateFields) {
    await assertSucceeds(getDoc(doc(contextDb(shadow, "uid-admin"), "domains/hcm/fields", field)));
  }
});

test("SHADOW preserves non-sensitive onboarding policy access and blocks separated/customer accounts", async () => {
  for (const uid of ["uid-alex", "uid-manager", "uid-onboarding"]) {
    await assertSucceeds(getDoc(doc(contextDb(shadow, uid), "domains/hcm/fields/policies")));
  }
  for (const uid of ["uid-separated", "uid-customer"]) {
    await assertFails(getDoc(doc(contextDb(shadow, uid), "domains/hcm/fields/policies")));
  }
});

test("SHADOW preserves self/Administrator shard access and rejects peer, separated, customer reads", async () => {
  const target = "userDomains/uid-jordan/hcm/documents";
  for (const uid of ["uid-jordan", "uid-admin"]) {
    await assertSucceeds(getDoc(doc(contextDb(shadow, uid), target)));
  }
  for (const uid of ["uid-alex", "uid-marketing", "uid-onboarding", "uid-separated", "uid-customer"]) {
    await assertFails(getDoc(doc(contextDb(shadow, uid), target)));
  }
});

test("SHADOW leaves manager access to a verified direct report's shard unchanged", async () => {
  const ownReport = "userDomains/uid-alex/hcm/documents";
  await assertSucceeds(getDoc(doc(contextDb(shadow, "uid-manager"), ownReport)));
  await assertFails(getDoc(doc(contextDb(shadow, "uid-manager"), "userDomains/uid-jordan/hcm/documents")));
});

test("CURRENT actor can read/write another employee audit history; SHADOW denies", async () => {
  const target = "userDomains/uid-alex/hcm/audit";
  const currentActor = contextDb(current, "uid-alex");
  const existing = await assertSucceeds(getDoc(doc(currentActor, target)));
  assert.equal(existing.data()?.items?.[0]?.entityId, "uid-jordan");
  await assertSucceeds(setDoc(doc(currentActor, target), {
    items: [{ id: "synthetic-forged", actorId: "uid-alex", entityId: "uid-jordan" }],
  }));
  await assertFails(getDoc(doc(contextDb(shadow, "uid-alex"), target)));
  await assertFails(setDoc(doc(contextDb(shadow, "uid-alex"), target), { items: [] }));
  await assertSucceeds(getDoc(doc(contextDb(shadow, "uid-admin"), target)));
});

test("CURRENT manager can write shared private HCM fields in emulator ONLY", async () => {
  await assertSucceeds(setDoc(doc(contextDb(current, "uid-manager"), "domains/hcm/fields/compensationChanges"), { items: [] }));
});

test("SHADOW blocks non-admin writes to sensitive shared fields", async () => {
  const target = "domains/hcm/fields/documents";
  for (const uid of ["uid-alex", "uid-manager", "uid-marketing", "uid-separated"]) {
    await assertFails(setDoc(doc(contextDb(shadow, uid), target), { items: [] }));
  }
});

const hcmSpec = DOMAIN_SPECS.find((spec) => spec.id === "hcm")!;
const shadowScope = (
  uid: string, role: PersistenceScope["role"],
  accountState: PersistenceScope["accountState"] = "Active",
  reports: string[] = [],
): PersistenceScope => ({
  uid, role, accountState,
  readableUserIds: new Set([uid, ...reports]),
  managedUserIds: new Set(reports),
  supervisedBrandAmbassadorIds: new Set(),
});

/** Model the exact direct-document read + assembleState path used by persistence.ts. */
async function hydrateHcmShadow(uid: string, scope: PersistenceScope) {
  const plan = planHrShadowReadPaths(scope);
  const documents = new Map<string, Record<string, unknown> | null>();
  const paths = plan.readable.map((entry) => entry.path).filter((path) =>
    ["_root", "employees", "policies", "documents", "leaveRequests", "compensation", "audit"]
      .includes(parseDocPath(path)?.field ?? ""));
  for (const path of paths) {
    const snapshot = await assertSucceeds(getDoc(doc(contextDb(shadow, uid), path)));
    documents.set(path, snapshot.exists() ? snapshot.data() : null);
  }
  return assembleState(hcmSpec, documents);
}

test("old HCM client cannot hydrate under shadow rules; new read plan succeeds for own shards", async () => {
  const employee = shadowScope("uid-alex", "Sales Representative");
  const oldPaths = domainDocuments(hcmSpec, employee).map((entry) => entry.path);
  assert.ok(oldPaths.includes("domains/hcm/fields/documents"));
  await assertFails(getDoc(doc(contextDb(shadow, "uid-alex"), "domains/hcm/fields/documents")));
  const result = await hydrateHcmShadow("uid-alex", employee);
  assert.deepEqual((result?.documents as { marker: string }[]).map((item) => item.marker), ["ALEX_ONLY"]);
  assert.ok(!JSON.stringify(result?.documents).includes("OTHER_EMPLOYEE"));
});

test("shadow hydration matrix preserves authorized role/record scope without cross-user payloads", async () => {
  const manager = await hydrateHcmShadow("uid-manager",
    shadowScope("uid-manager", "Sales Manager", "Active", ["uid-alex"]));
  assert.deepEqual((manager?.documents as { marker: string }[]).map((item) => item.marker), ["ALEX_ONLY"]);
  assert.deepEqual(manager?.compensation, [], "manager must not hydrate a report's compensation");

  const marketing = await hydrateHcmShadow("uid-marketing", shadowScope("uid-marketing", "Marketing"));
  assert.deepEqual(marketing?.documents, []);
  const onboarding = await hydrateHcmShadow("uid-onboarding",
    shadowScope("uid-onboarding", "Sales Representative", "Onboarding"));
  assert.deepEqual(onboarding?.documents, []);

  const admin = await hydrateHcmShadow("uid-admin",
    shadowScope("uid-admin", "Administrator", "Active", ["uid-alex", "uid-jordan"]));
  assert.deepEqual(new Set((admin?.documents as { marker: string }[]).map((item) => item.marker)),
    new Set(["OTHER_EMPLOYEE", "ALEX_ONLY", "OWNER_ONLY"]));

  assert.equal(await hydrateHcmShadow("uid-separated",
    shadowScope("uid-separated", "Sales Representative", "Separated")), null);
  assert.equal(await hydrateHcmShadow("uid-customer",
    shadowScope("uid-customer", "Customer")), null);
});

test("legacy-only employee history is LOST to shadow client until backfill, so cutover must block", async () => {
  const oldRead = await assertSucceeds(getDoc(
    doc(contextDb(current, "uid-alex"), "domains/hcm/fields/leaveRequests")));
  assert.equal(oldRead.data()?.items?.some((item: { marker: string }) =>
    item.marker === "LEGACY_ONLY"), true);
  const newHydration = await hydrateHcmShadow("uid-alex",
    shadowScope("uid-alex", "Sales Representative"));
  assert.deepEqual(newHydration?.leaveRequests, []);
  // This negative acceptance proof is intentional: emulator success and
  // readable own shards alone do NOT establish complete historical hydration.
});
