/**
 * Synthetic emulator-only characterization of legacy HCM confidentiality.
 * A CURRENT-rules success is a documented vulnerability, not an acceptance.
 * The candidate is in memory; generated/deployed rules are never changed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { DOMAIN_SPECS } from "../lib/firestore-domains";
import {
  buildHrLegacyConfidentialityShadowReview,
  HR_SHARED_EMPLOYEE_FIELDS_REVIEW,
  HR_MANAGER_PRIVATE_FIELDS_REVIEW,
} from "../lib/hr-legacy-confidentiality-shadow-review";

const currentRules = readFileSync("firestore.rules", "utf8");
const candidateRules = buildHrLegacyConfidentialityShadowReview(currentRules);
const ids = [
  ["admin", "Administrator", "Leadership", "", "Active"],
  ["manager", "Sales Manager", "Sales", "", "Active"],
  ["rep", "Sales Representative", "Sales", "manager", "Active"],
  ["peer", "Sales Representative", "Sales", "", "Active"],
  ["marketing", "Marketing", "Marketing", "", "Active"],
  ["separated", "Sales Representative", "Sales", "manager", "Separated"],
  ["customer", "Customer", "Customer", "", "Active"],
] as const;

let current: RulesTestEnvironment;
let candidate: RulesTestEnvironment;
const client = (env: RulesTestEnvironment, uid: string) =>
  env.authenticatedContext(uid, {
    email: uid + "@synthetic.invalid", email_verified: true,
  }).firestore();
const shared = (field: string) => "domains/hcm/fields/" + field;
const own = (uid: string, field: string) => "userDomains/" + uid + "/hcm/" + field;
const read = (env: RulesTestEnvironment, uid: string, path: string) =>
  getDoc(doc(client(env, uid), path));
const write = (env: RulesTestEnvironment, uid: string, path: string) =>
  setDoc(doc(client(env, uid), path), { items: [{ id: "synthetic-write" }] });

before(async () => {
  current = await initializeTestEnvironment({
    projectId: "momentum-hr-role-current-review",
    firestore: { rules: currentRules, host: "127.0.0.1", port: 8080 },
  });
  candidate = await initializeTestEnvironment({
    projectId: "momentum-hr-role-shadow-review",
    firestore: { rules: candidateRules, host: "127.0.0.1", port: 8080 },
  });
  for (const env of [current, candidate]) {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [uid, role, team, managerId, accountState] of ids) {
        await setDoc(doc(db, "userAccess/" + uid), {
          uid, role, team, managerId, accountState,
          managedTeams: uid === "manager" ? ["Sales"] : [],
          email: uid + "@synthetic.invalid",
        });
      }
      for (const field of HR_SHARED_EMPLOYEE_FIELDS_REVIEW) {
        await setDoc(doc(db, shared(field)), {
          items: [{ id: "synthetic-legacy-" + field, userId: "peer",
            marker: "SYNTHETIC_OTHER_EMPLOYEE" }],
        });
      }
      await setDoc(doc(db, shared("policies")), { items: [{ id: "synthetic-policy" }] });
      for (const uid of ["rep", "peer"]) {
        for (const field of ["documents", "privateProfiles", "compensationChanges", "leaveRequests"]) {
          await setDoc(doc(db, own(uid, field)), {
            items: [{ id: "synthetic-" + field, userId: uid, marker: "SYNTHETIC_PRIVATE" }],
          });
        }
      }
      await setDoc(doc(db, own("rep", "audit")), {
        items: [{ id: "synthetic-audit", actorId: "rep",
          entityId: "peer", before: "SYNTHETIC_OTHER_EMPLOYEE" }],
      });
    });
  }
});
after(async () => {
  await current?.cleanup();
  await candidate?.cleanup();
});

test("coverage guard includes every employee-owned HCM field, not just four examples", () => {
  const spec = DOMAIN_SPECS.find((item) => item.id === "hcm");
  assert.ok(spec);
  const employeeFields = Object.entries(spec.fields)
    .filter(([, field]) => Boolean(field.userIdField))
    .map(([field]) => field).sort();
  // Actor-sharded audit is handled by a separate Administrator-only guard.
  // It is already Administrator-only in the shared HCM field rules.
  assert.equal(spec.fields.audit.userIdField, "actorId");
  assert.deepEqual([...HR_SHARED_EMPLOYEE_FIELDS_REVIEW].sort(),
    employeeFields.filter((field) => field !== "audit"));
  for (const field of HR_MANAGER_PRIVATE_FIELDS_REVIEW) {
    assert.ok(employeeFields.includes(field), "Unknown manager-private field " + field);
  }
  assert.notEqual(candidateRules, currentRules);
  assert.equal(currentRules.includes("HR_LEGACY_SHADOW_REVIEW_MARKER"), false);
});

test("CURRENT shared HCM arrays expose another employee to ordinary staff and managers", async () => {
  for (const uid of ["rep", "manager", "marketing"]) {
    for (const field of ["documents", "privateProfiles", "compensation", "compensationChanges"]) {
      const result = await assertSucceeds(read(current, uid, shared(field)));
      assert.equal(result.data()?.items?.[0]?.marker, "SYNTHETIC_OTHER_EMPLOYEE");
    }
  }
  await assertSucceeds(write(current, "manager", shared("documents")));
});

test("CANDIDATE denies all private shared fields for every non-admin role", async () => {
  for (const uid of ["rep", "manager", "marketing", "separated", "customer"]) {
    for (const field of HR_SHARED_EMPLOYEE_FIELDS_REVIEW) {
      await assertFails(read(candidate, uid, shared(field)));
      await assertFails(write(candidate, uid, shared(field)));
    }
  }
  for (const field of HR_SHARED_EMPLOYEE_FIELDS_REVIEW) {
    await assertSucceeds(read(candidate, "admin", shared(field)));
  }
  await assertSucceeds(read(candidate, "rep", shared("policies")));
  await assertFails(read(candidate, "separated", shared("policies")));
});

test("CURRENT manager can read private report files; CANDIDATE preserves self/admin only", async () => {
  for (const field of ["documents", "privateProfiles", "compensationChanges"]) {
    await assertSucceeds(read(current, "manager", own("rep", field)));
    await assertFails(read(candidate, "manager", own("rep", field)));
    await assertFails(write(candidate, "manager", own("rep", field)));
    await assertSucceeds(read(candidate, "admin", own("rep", field)));
  }
  await assertSucceeds(read(candidate, "rep", own("rep", "documents")));
  await assertFails(read(candidate, "marketing", own("rep", "documents")));
  await assertFails(read(candidate, "separated", own("rep", "documents")));
  await assertFails(read(candidate, "customer", own("rep", "documents")));
});

test("managed-team membership alone grants CURRENT HR access but not CANDIDATE access", async () => {
  await assertSucceeds(read(current, "manager", own("peer", "leaveRequests")));
  await assertFails(read(candidate, "manager", own("peer", "leaveRequests")));
  await assertFails(write(candidate, "manager", own("peer", "leaveRequests")));
  await assertSucceeds(read(candidate, "manager", own("rep", "leaveRequests")));
  await assertSucceeds(write(candidate, "manager", own("rep", "leaveRequests")));
});

test("CANDIDATE immediately revokes direct-report access after manager reassignment", async () => {
  await candidate.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "userAccess/rep"), {
      managerId: "admin",
    }, { merge: true });
  });
  try {
    await assertFails(read(candidate, "manager", own("rep", "leaveRequests")));
    await assertFails(write(candidate, "manager", own("rep", "leaveRequests")));
    await assertSucceeds(read(candidate, "admin", own("rep", "leaveRequests")));
    await assertSucceeds(read(candidate, "rep", own("rep", "leaveRequests")));
  } finally {
    await candidate.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "userAccess/rep"), {
        managerId: "manager",
      }, { merge: true });
    });
  }
});

test("CURRENT actor-owned audit exposes another employee; CANDIDATE denies actor writes and reads", async () => {
  const target = own("rep", "audit");
  const leaked = await assertSucceeds(read(current, "rep", target));
  assert.equal(leaked.data()?.items?.[0]?.entityId, "peer");
  await assertSucceeds(write(current, "rep", target));
  await assertFails(read(candidate, "rep", target));
  await assertFails(write(candidate, "rep", target));
  await assertFails(read(candidate, "manager", target));
  await assertSucceeds(read(candidate, "admin", target));
  await assertSucceeds(write(candidate, "admin", target));
  await assertFails(read(candidate, "customer", target));
});

test("candidate generation fails on rule schema drift and cannot be double-applied", () => {
  assert.throws(() => buildHrLegacyConfidentialityShadowReview(
    currentRules.replace("match /hcm/fields/{field} {", "match /hcm/fields/{field} MISSING {"),
  ));
  assert.throws(() => buildHrLegacyConfidentialityShadowReview(candidateRules));
});
