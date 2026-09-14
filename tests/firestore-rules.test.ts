/**
 * Security Rules conformance tests.
 *
 * `lib/firestore-domains.ts` decides which documents the browser fetches and writes; `firestore.rules`
 * decides which ones Firestore actually serves. If they disagree, Momentum silently parks writes as
 * "denied" and an employee loses data. These tests run the real rules against the emulator and assert the
 * two agree, plus the identity invariants the bootstrap and provisioning flows depend on.
 *
 *   npm run test:rules
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, describe } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

import {
  EMPLOYEE_DIRECTORY_COLLECTION,
  PLATFORM_BOOTSTRAP_DOCUMENT,
  PLATFORM_META_DOCUMENT,
  USER_ACCESS_COLLECTION,
  buildPersistenceScope,
  directoryDocument,
  userAccessDocument,
  type UserAccessRecord,
} from "../lib/firebase-access";
import {
  DOMAIN_SPECS,
  domainDocuments,
  documentWritable,
} from "../lib/firestore-domains";
import type { WorkspaceUser } from "../lib/types";

const PROJECT_ID = "momentum-rules-test";
const BOOTSTRAP_EMAIL = "vixarynholdings@gmail.com";

const ADMIN = "uid-admin";
const MANAGER = "uid-manager";
const REP = "uid-rep";
const OTHER_REP = "uid-other-rep";
const OPS = "uid-ops";
const ONBOARDING = "uid-onboarding";

const at = "2026-01-01T00:00:00.000Z";

const accessRecord = (
  uid: string,
  role: UserAccessRecord["role"],
  team: UserAccessRecord["team"],
  extra: Partial<UserAccessRecord> = {},
): UserAccessRecord => ({
  uid,
  email: `${uid}@momentum.test`,
  role,
  team,
  accountState: "Active",
  updatedAt: at,
  updatedBy: ADMIN,
  ...extra,
});

const ACCESS: UserAccessRecord[] = [
  accessRecord(ADMIN, "Administrator", "Leadership"),
  accessRecord(MANAGER, "Sales Manager", "Sales", { managedTeams: ["Sales"] }),
  accessRecord(REP, "Sales Representative", "Sales", { managerId: MANAGER }),
  accessRecord(OTHER_REP, "Sales Representative", "Sales", { managerId: ADMIN, team: "Operations" }),
  accessRecord(OPS, "Operations", "Operations"),
  accessRecord(ONBOARDING, "Sales Representative", "Sales", {
    managerId: MANAGER,
    accountState: "Onboarding",
  }),
];

const DIRECTORY: WorkspaceUser[] = ACCESS.map((record) => ({
  id: record.uid,
  name: record.uid,
  firstName: record.uid,
  email: record.email,
  initials: "XX",
  title: record.role,
  role: record.role,
  team: record.team,
  managerId: record.managerId,
  managedTeams: record.managedTeams,
  accent: "#000000",
}));

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  // Seed identity documents with rules disabled so every test starts from a provisioned workspace.
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const record of ACCESS) {
      await setDoc(doc(db, USER_ACCESS_COLLECTION, record.uid), userAccessDocument(record));
    }
    for (const user of DIRECTORY) {
      await setDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, user.id), directoryDocument(user, at));
    }
  });
});

after(async () => {
  await env?.cleanup();
});

const dbFor = (uid: string | null, claims: Record<string, unknown> = {}) =>
  uid === null
    ? env.unauthenticatedContext().firestore()
    : env
        .authenticatedContext(uid, { email: `${uid}@momentum.test`, email_verified: true, ...claims })
        .firestore();

const scopeFor = (uid: string) =>
  buildPersistenceScope(ACCESS.find((record) => record.uid === uid)!, DIRECTORY);

describe("identity documents", () => {
  test("an employee reads only their own access record", async () => {
    await assertSucceeds(getDoc(doc(dbFor(REP), USER_ACCESS_COLLECTION, REP)));
    await assertFails(getDoc(doc(dbFor(REP), USER_ACCESS_COLLECTION, OPS)));
  });

  test("an Administrator reads any access record", async () => {
    await assertSucceeds(getDoc(doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, REP)));
  });

  test("a Sales Manager reads a direct report's access record", async () => {
    await assertSucceeds(getDoc(doc(dbFor(MANAGER), USER_ACCESS_COLLECTION, REP)));
  });

  test("no employee may grant themselves a role", async () => {
    await assertFails(
      setDoc(doc(dbFor(REP), USER_ACCESS_COLLECTION, REP), {
        ...accessRecord(REP, "Administrator", "Leadership"),
      }),
    );
  });

  test("an Administrator may not change their own role or account state", async () => {
    await assertFails(
      setDoc(
        doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, ADMIN),
        { role: "Sales Representative" },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(
        doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, ADMIN),
        { accountState: "Suspended" },
        { merge: true },
      ),
    );
  });

  test("an Administrator may change another employee's role", async () => {
    await assertSucceeds(
      setDoc(
        doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, REP),
        { role: "Operations", updatedAt: at, updatedBy: ADMIN },
        { merge: true },
      ),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), USER_ACCESS_COLLECTION, REP),
        { role: "Sales Representative" },
        { merge: true },
      );
    });
  });

  test("a Sales Manager may not change a report's role", async () => {
    await assertFails(
      setDoc(
        doc(dbFor(MANAGER), USER_ACCESS_COLLECTION, REP),
        { role: "Administrator" },
        { merge: true },
      ),
    );
  });

  test("access records can never be deleted", async () => {
    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, REP)));
  });

  test("the employee directory is readable by an onboarding hire but writable only by an Administrator", async () => {
    await assertSucceeds(getDoc(doc(dbFor(ONBOARDING), EMPLOYEE_DIRECTORY_COLLECTION, REP)));
    await assertFails(
      setDoc(doc(dbFor(REP), EMPLOYEE_DIRECTORY_COLLECTION, REP), { title: "CEO" }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN), EMPLOYEE_DIRECTORY_COLLECTION, REP), { title: "Rep" }, { merge: true }),
    );
  });

  test("signed-out users get nothing", async () => {
    await assertFails(getDoc(doc(dbFor(null), USER_ACCESS_COLLECTION, REP)));
    await assertFails(getDoc(doc(dbFor(null), EMPLOYEE_DIRECTORY_COLLECTION, REP)));
    await assertFails(getDoc(doc(dbFor(null), "domains/workspace/fields/accounts")));
  });

  test("every employee may stamp platform/meta so other sessions can poll", async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(REP), PLATFORM_META_DOCUMENT), { versions: { a: "1" } }, { merge: true }),
    );
    await assertFails(
      setDoc(doc(dbFor(null), PLATFORM_META_DOCUMENT), { versions: { a: "2" } }, { merge: true }),
    );
  });
});

describe("first-Administrator bootstrap", () => {
  const claim = (uid: string, email: string, emailVerified: boolean) =>
    env
      .authenticatedContext(uid, { email, email_verified: emailVerified })
      .firestore();

  test("an allow-listed, verified e-mail may claim Administrator for itself", async () => {
    const db = claim("uid-bootstrap", BOOTSTRAP_EMAIL, true);
    await assertSucceeds(
      setDoc(doc(db, PLATFORM_BOOTSTRAP_DOCUMENT), { claimedBy: "uid-bootstrap", email: BOOTSTRAP_EMAIL, claimedAt: at }),
    );
    await assertSucceeds(
      setDoc(doc(db, USER_ACCESS_COLLECTION, "uid-bootstrap"), {
        email: BOOTSTRAP_EMAIL,
        role: "Administrator",
        team: "Leadership",
        managerId: null,
        managedTeams: [],
        accountState: "Active",
        updatedAt: at,
        updatedBy: "uid-bootstrap",
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, "uid-bootstrap"), { name: "Owner", updatedAt: at }),
    );
    await assertSucceeds(
      setDoc(doc(db, "userDomains/uid-bootstrap/identity/records"), { items: [] }),
    );
  });

  test("an unverified e-mail may not claim Administrator", async () => {
    const db = claim("uid-unverified", BOOTSTRAP_EMAIL, false);
    await assertFails(setDoc(doc(db, PLATFORM_BOOTSTRAP_DOCUMENT), { claimedBy: "uid-unverified" }));
    await assertFails(
      setDoc(doc(db, USER_ACCESS_COLLECTION, "uid-unverified"), {
        email: BOOTSTRAP_EMAIL, role: "Administrator", team: "Leadership",
        accountState: "Active", updatedAt: at, updatedBy: "uid-unverified",
      }),
    );
  });

  test("an off-list e-mail may not claim Administrator", async () => {
    const db = claim("uid-stranger", "attacker@example.com", true);
    await assertFails(setDoc(doc(db, PLATFORM_BOOTSTRAP_DOCUMENT), { claimedBy: "uid-stranger" }));
    await assertFails(
      setDoc(doc(db, USER_ACCESS_COLLECTION, "uid-stranger"), {
        email: "attacker@example.com", role: "Administrator", team: "Leadership",
        accountState: "Active", updatedAt: at, updatedBy: "uid-stranger",
      }),
    );
  });

  test("an allow-listed claimant may not mint access for somebody else", async () => {
    const db = claim("uid-bootstrap2", BOOTSTRAP_EMAIL, true);
    await assertFails(
      setDoc(doc(db, USER_ACCESS_COLLECTION, "uid-victim"), {
        email: "victim@momentum.test", role: "Administrator", team: "Leadership",
        accountState: "Active", updatedAt: at, updatedBy: "uid-bootstrap2",
      }),
    );
  });
});

/**
 * The convergence check: for every actor, every document `domainDocuments()` tells the client it may read
 * must actually be readable, and `documentWritable()` must agree with the rules for both allowed and
 * denied writes.
 */
describe("domain sharding matches the rules", () => {
  for (const uid of [ADMIN, MANAGER, REP, OPS, ONBOARDING]) {
    test(`reads planned by the client succeed for ${uid}`, async () => {
      const scope = scopeFor(uid);
      const db = dbFor(uid);
      const failures: string[] = [];
      for (const spec of DOMAIN_SPECS) {
        for (const document of domainDocuments(spec, scope)) {
          try {
            await assertSucceeds(getDoc(doc(db, document.path)));
          } catch {
            failures.push(document.path);
          }
        }
      }
      assert.deepEqual(failures, [], `rules denied reads the client expects to succeed for ${uid}`);
    });

    test(`writes agree with documentWritable() for ${uid}`, async () => {
      const scope = scopeFor(uid);
      const db = dbFor(uid);
      const wrongly: string[] = [];
      for (const spec of DOMAIN_SPECS) {
        for (const document of domainDocuments(spec, scope)) {
          const expected = documentWritable(document.path, scope);
          assert.equal(expected, document.writable, `${document.path} disagrees with itself`);
          const payload = document.path.endsWith("/_root") ? { data: {} } : { items: [] };
          const attempt = setDoc(doc(db, document.path), payload, { merge: true });
          try {
            if (expected) await assertSucceeds(attempt);
            else await assertFails(attempt);
          } catch {
            wrongly.push(`${document.path} (client expected writable=${expected})`);
          }
        }
      }
      assert.deepEqual(wrongly, [], `rules and documentWritable() disagree for ${uid}`);
    });
  }
});

describe("cross-employee isolation", () => {
  test("a rep cannot read a peer's private shards", async () => {
    const db = dbFor(REP);
    await assertFails(getDoc(doc(db, `userDomains/${OPS}/hcm/privateProfiles`)));
    await assertFails(getDoc(doc(db, `userDomains/${OPS}/hcm/compensation`)));
    await assertFails(getDoc(doc(db, `userDomains/${MANAGER}/finance/expenses`)));
  });

  test("a manager cannot read a report's compensation or HR audit trail", async () => {
    const db = dbFor(MANAGER);
    await assertSucceeds(getDoc(doc(db, `userDomains/${REP}/hcm/leaveRequests`)));
    await assertFails(getDoc(doc(db, `userDomains/${REP}/hcm/compensation`)));
    await assertFails(getDoc(doc(db, `userDomains/${REP}/hcm/audit`)));
  });

  test("a manager cannot reach an employee outside their span of control", async () => {
    const db = dbFor(MANAGER);
    await assertFails(getDoc(doc(db, `userDomains/${OTHER_REP}/hcm/leaveRequests`)));
  });

  test("nobody may write their own compensation or PTO ledger", async () => {
    const db = dbFor(REP);
    await assertFails(setDoc(doc(db, `userDomains/${REP}/hcm/compensation`), { items: [] }));
    await assertFails(setDoc(doc(db, `userDomains/${REP}/hcm/ptoLedger`), { items: [] }));
    await assertFails(setDoc(doc(db, `userDomains/${REP}/hcm/employmentChanges`), { items: [] }));
  });

  test("payroll, accounting, and finance ledgers stay Administrator-only", async () => {
    for (const uid of [MANAGER, REP, OPS]) {
      const db = dbFor(uid);
      await assertFails(getDoc(doc(db, "domains/payroll/fields/runs")));
      await assertFails(getDoc(doc(db, "domains/accounting/fields/journals")));
      await assertFails(getDoc(doc(db, "domains/finance/fields/expenses")));
      await assertFails(setDoc(doc(db, "domains/payroll/fields/runs"), { items: [] }));
    }
  });

  test("an onboarding hire reads policies and writes their own onboarding records only", async () => {
    const db = dbFor(ONBOARDING);
    await assertSucceeds(getDoc(doc(db, "domains/hcm/fields/policies")));
    await assertSucceeds(getDoc(doc(db, "domains/documentTemplates/fields/templates")));
    await assertSucceeds(setDoc(doc(db, `userDomains/${ONBOARDING}/identity/records`), { items: [] }));
    // Not Active yet: the shared, activeEmployee-gated workspace stays closed.
    await assertFails(getDoc(doc(db, "domains/workspace/fields/accounts")));
    await assertFails(setDoc(doc(db, "domains/workspace/fields/accounts"), { items: [] }));
  });

  test("unknown domains and fields are rejected", async () => {
    const db = dbFor(ADMIN);
    await assertFails(getDoc(doc(db, "domains/workspace/fields/secretPayrollDump")));
    await assertFails(getDoc(doc(db, "domains/notARealDomain/fields/_root")));
    await assertFails(setDoc(doc(db, `userDomains/${ADMIN}/hcm/notARealField`), { items: [] }));
    await assertFails(getDoc(doc(db, "someOtherCollection/someDoc")));
  });
});
