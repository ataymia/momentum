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
const shadowRules = sourceRules.replace(pattern, (_match, prefix: string, predicate: string, end: string) =>
  `${prefix}(${predicate}) && (!(field in [${privateFields.map((field) => `'${field}'`).join(", ")}]) || isAdmin())${end}`);
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

test("SHADOW does not grant non-admin writes to sensitive shared fields", async () => {
  const target = "domains/hcm/fields/documents";
  for (const uid of ["uid-alex", "uid-manager", "uid-marketing", "uid-separated"]) {
    await assertFails(setDoc(doc(contextDb(shadow, uid), target), { items: [] }));
  }
});
