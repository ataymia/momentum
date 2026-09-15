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
/** Must match BOOTSTRAP_ADMIN_EMAILS in scripts/generate-firestore-rules.ts. */
const BOOTSTRAP_EMAILS = ["vixarynholdings@gmail.com", "momentumdistributioninc@gmail.com"];
const BOOTSTRAP_EMAIL = BOOTSTRAP_EMAILS[0];
/** Removed from the allow-list; kept here so its removal stays regression-tested. */
const REVOKED_BOOTSTRAP_EMAIL = "ataymia.murray@allstarservicesnow.com";

const ADMIN = "uid-admin";
const MANAGER = "uid-manager";
const REP = "uid-rep";
const OTHER_REP = "uid-other-rep";
const OPS = "uid-ops";
const ONBOARDING = "uid-onboarding";
/** Brand Ambassadors, one per Sales Representative, to prove supervision is scoped to the reporting line. */
const BA_OF_REP = "uid-ba-of-rep";
const BA_OF_OTHER_REP = "uid-ba-of-other-rep";
/** A hire who has signed in with the temporary password but has not changed it yet. */
const PASSWORD_CHANGE = "uid-password-change";
/** Never seeded: stands in for the brand-new uid an Administrator provisions. */
const NEW_HIRE = "uid-new-hire";

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
  accessRecord(PASSWORD_CHANGE, "Sales Representative", "Sales", {
    managerId: MANAGER,
    accountState: "Password change required",
  }),
  accessRecord(BA_OF_REP, "Brand Ambassador", "Sales", { managerId: REP }),
  accessRecord(BA_OF_OTHER_REP, "Brand Ambassador", "Sales", { managerId: OTHER_REP }),
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

/**
 * The provisioning path an Administrator drives from Human Resources → New hire setup, and the recovery
 * path used when a previous attempt left an Auth identity without access records.
 */
describe("Administrator employee provisioning", () => {
  const newHireAccess = {
    email: "new.hire@momentum.test",
    role: "Sales Representative",
    team: "Sales",
    managerId: MANAGER,
    managedTeams: [],
    accountState: "Password change required",
    updatedAt: at,
    updatedBy: ADMIN,
  };

  test("an Administrator provisions access, directory, and onboarding records for a new uid", async () => {
    const db = dbFor(ADMIN);
    await assertSucceeds(setDoc(doc(db, USER_ACCESS_COLLECTION, NEW_HIRE), newHireAccess));
    await assertSucceeds(setDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, NEW_HIRE), { name: "New Hire", email: newHireAccess.email, role: "Sales Representative", team: "Sales", updatedAt: at }));
    await assertSucceeds(setDoc(doc(db, `userDomains/${NEW_HIRE}/identity/records`), { items: [{ id: `access-${NEW_HIRE}`, userId: NEW_HIRE, state: "Password change required" }] }));
  });

  test("re-running provisioning for the same hire is idempotent, not a duplicate", async () => {
    const db = dbFor(ADMIN);
    await assertSucceeds(setDoc(doc(db, USER_ACCESS_COLLECTION, NEW_HIRE), { ...newHireAccess, updatedAt: "2026-01-02T00:00:00.000Z" }));
  });

  test("a non-Administrator cannot provision anybody", async () => {
    for (const uid of [MANAGER, REP, OPS, ONBOARDING]) {
      await assertFails(setDoc(doc(dbFor(uid), USER_ACCESS_COLLECTION, "uid-victim"), newHireAccess));
      await assertFails(setDoc(doc(dbFor(uid), EMPLOYEE_DIRECTORY_COLLECTION, "uid-victim"), { name: "Victim", updatedAt: at }));
    }
  });

  test("a suspended Administrator cannot provision", async () => {
    const suspended = "uid-suspended-admin";
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), USER_ACCESS_COLLECTION, suspended), userAccessDocument(accessRecord(suspended, "Administrator", "Leadership", { accountState: "Suspended" })));
    });
    await assertFails(setDoc(doc(dbFor(suspended), USER_ACCESS_COLLECTION, "uid-victim2"), newHireAccess));
  });

  test("an access record's e-mail can never be repointed at another mailbox", async () => {
    await assertFails(
      setDoc(doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, REP), { email: "attacker@example.com" }, { merge: true }),
    );
    // The rest of the record stays editable by an Administrator.
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, REP), { title: "Rep", updatedAt: at, updatedBy: ADMIN }, { merge: true }),
    );
  });

  test("an Auth identity with no access record grants nothing at all", async () => {
    // Exactly the state a failed provisioning attempt leaves behind: signed in, but unknown to Momentum.
    const db = dbFor("uid-orphan-identity");
    await assertFails(getDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, REP)));
    await assertFails(getDoc(doc(db, "domains/workspace/fields/accounts")));
    await assertFails(getDoc(doc(db, "domains/hcm/fields/policies")));
    await assertFails(setDoc(doc(db, `userDomains/uid-orphan-identity/identity/records`), { items: [] }));
  });
});

describe("a hire who must still change their password", () => {
  test("can read what onboarding needs and write their own onboarding shards", async () => {
    const db = dbFor(PASSWORD_CHANGE);
    await assertSucceeds(getDoc(doc(db, USER_ACCESS_COLLECTION, PASSWORD_CHANGE)));
    await assertSucceeds(getDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, MANAGER)));
    await assertSucceeds(getDoc(doc(db, "domains/hcm/fields/policies")));
    await assertSucceeds(setDoc(doc(db, `userDomains/${PASSWORD_CHANGE}/identity/records`), { items: [] }));
    await assertSucceeds(setDoc(doc(db, `userDomains/${PASSWORD_CHANGE}/hcm/documents`), { items: [] }));
  });

  test("cannot activate themselves, elevate themselves, or reach the live workspace", async () => {
    const db = dbFor(PASSWORD_CHANGE);
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, PASSWORD_CHANGE), { accountState: "Active" }, { merge: true }));
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, PASSWORD_CHANGE), { role: "Administrator" }, { merge: true }));
    await assertFails(getDoc(doc(db, "domains/workspace/fields/accounts")));
    await assertFails(getDoc(doc(db, "domains/payroll/fields/runs")));
    await assertFails(getDoc(doc(db, "domains/identity/fields/drafts")));
  });

  test("only an Administrator moves them to Active", async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(ADMIN), USER_ACCESS_COLLECTION, PASSWORD_CHANGE), { accountState: "Active", updatedAt: at, updatedBy: ADMIN }, { merge: true }),
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), USER_ACCESS_COLLECTION, PASSWORD_CHANGE), { accountState: "Password change required" }, { merge: true });
    });
  });
});

describe("Sales Representative privilege boundaries", () => {
  test("cannot make themselves an Administrator or activate themselves", async () => {
    const db = dbFor(REP);
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { role: "Administrator" }, { merge: true }));
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { accountState: "Active" }, { merge: true }));
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { managedTeams: ["Sales", "Leadership"] }, { merge: true }));
  });

  test("cannot read Administrator-only provisioning state or another employee's access", async () => {
    const db = dbFor(REP);
    await assertFails(getDoc(doc(db, "domains/identity/fields/drafts")));
    await assertFails(getDoc(doc(db, "domains/identity/fields/_root")));
    await assertFails(getDoc(doc(db, USER_ACCESS_COLLECTION, ADMIN)));
    await assertFails(getDoc(doc(db, `userDomains/${ADMIN}/identity/records`)));
  });
});

describe("first-Administrator bootstrap", () => {
  const claim = (uid: string, email: string, emailVerified: boolean) =>
    env
      .authenticatedContext(uid, { email, email_verified: emailVerified })
      .firestore();

  test("an allow-listed, verified e-mail may claim Administrator for itself", async () => {
    for (const [index, email] of BOOTSTRAP_EMAILS.entries()) {
      const uid = `uid-bootstrap-${index}`;
      const db = claim(uid, email, true);
      await assertSucceeds(
        setDoc(doc(db, PLATFORM_BOOTSTRAP_DOCUMENT), { claimedBy: uid, email, claimedAt: at }),
      );
      await assertSucceeds(
        setDoc(doc(db, USER_ACCESS_COLLECTION, uid), {
          email,
          role: "Administrator",
          team: "Leadership",
          managerId: null,
          managedTeams: [],
          accountState: "Active",
          updatedAt: at,
          updatedBy: uid,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, uid), { name: "Owner", updatedAt: at }),
      );
      await assertSucceeds(setDoc(doc(db, `userDomains/${uid}/identity/records`), { items: [] }));
    }
  });

  test("the revoked All-Star e-mail can no longer claim Administrator", async () => {
    const db = claim("uid-revoked", REVOKED_BOOTSTRAP_EMAIL, true);
    await assertFails(
      setDoc(doc(db, PLATFORM_BOOTSTRAP_DOCUMENT), { claimedBy: "uid-revoked", email: REVOKED_BOOTSTRAP_EMAIL, claimedAt: at }),
    );
    await assertFails(
      setDoc(doc(db, USER_ACCESS_COLLECTION, "uid-revoked"), {
        email: REVOKED_BOOTSTRAP_EMAIL,
        role: "Administrator",
        team: "Leadership",
        accountState: "Active",
        updatedAt: at,
        updatedBy: "uid-revoked",
      }),
    );
    await assertFails(
      setDoc(doc(db, EMPLOYEE_DIRECTORY_COLLECTION, "uid-revoked"), { name: "Revoked", updatedAt: at }),
    );
  });

  test("the generated rules contain exactly the allow-listed e-mails", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const listed = [...rules.matchAll(/'([^']+@[^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(listed.sort(), [...BOOTSTRAP_EMAILS].sort());
    assert.ok(!rules.includes(REVOKED_BOOTSTRAP_EMAIL), "revoked e-mail is still present in firestore.rules");
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
  for (const uid of [ADMIN, MANAGER, REP, OPS, ONBOARDING, BA_OF_REP]) {
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

describe("Brand Ambassador event supervision", () => {
  const assignments = (uid: string) => `userDomains/${uid}/brandAmbassador/assignments`;

  test("an Administrator manages any Brand Ambassador's events", async () => {
    const db = dbFor(ADMIN);
    for (const ba of [BA_OF_REP, BA_OF_OTHER_REP]) {
      await assertSucceeds(setDoc(doc(db, assignments(ba)), { items: [] }));
      await assertSucceeds(getDoc(doc(db, assignments(ba))));
    }
  });

  test("a Sales Representative schedules only the Brand Ambassadors assigned to them", async () => {
    const db = dbFor(REP);
    await assertSucceeds(setDoc(doc(db, assignments(BA_OF_REP)), { items: [] }));
    await assertSucceeds(getDoc(doc(db, assignments(BA_OF_REP))));
    await assertFails(setDoc(doc(db, assignments(BA_OF_OTHER_REP)), { items: [] }));
    await assertFails(getDoc(doc(db, assignments(BA_OF_OTHER_REP))));
  });

  test("supervising a Brand Ambassador never exposes their HR, pay, or private records", async () => {
    const db = dbFor(REP);
    for (const path of ["hcm/privateProfiles", "hcm/compensation", "hcm/documents", "hcm/training", "hcm/leaveRequests", "hcm/audit", "identity/records"]) {
      await assertFails(getDoc(doc(db, `userDomains/${BA_OF_REP}/${path}`)));
      await assertFails(setDoc(doc(db, `userDomains/${BA_OF_REP}/${path}`), { items: [] }));
    }
    await assertFails(getDoc(doc(db, USER_ACCESS_COLLECTION, BA_OF_REP)));
  });

  test("a Brand Ambassador reads their own schedule and nobody else's", async () => {
    const db = dbFor(BA_OF_REP);
    await assertSucceeds(getDoc(doc(db, assignments(BA_OF_REP))));
    await assertFails(getDoc(doc(db, assignments(BA_OF_OTHER_REP))));
    // The schedule is written by the supervising rep or an Administrator, never by the Ambassador.
    await assertFails(setDoc(doc(db, assignments(BA_OF_REP)), { items: [] }));
    await assertFails(getDoc(doc(db, "domains/brandAmbassador/fields/assignments")));
  });

  test("a Brand Ambassador cannot reach CRM, orders, inventory, marketing, or finance", async () => {
    const db = dbFor(BA_OF_REP);
    for (const path of [
      "domains/crm/fields/contacts",
      "domains/crm/fields/opportunities",
      "domains/workspace/fields/accounts",
      "domains/workspace/fields/orders",
      "domains/commercial/fields/orders",
      "domains/commerce/fields/invoices",
      "domains/inventoryLedger/fields/movements",
      "domains/marketing/fields/campaigns",
      "domains/finance/fields/expenses",
      "domains/accounting/fields/journals",
      "domains/payroll/fields/runs",
      "domains/identity/fields/drafts",
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { items: [] }));
    }
    await assertFails(getDoc(doc(db, `userDomains/${REP}/hcm/privateProfiles`)));
  });

  test("a Brand Ambassador still reads the training library assigned to them", async () => {
    const db = dbFor(BA_OF_REP);
    await assertSucceeds(getDoc(doc(db, "domains/trainingLibrary/fields/materials")));
    await assertSucceeds(getDoc(doc(db, "domains/trainingLibrary/fields/audiences")));
    await assertSucceeds(getDoc(doc(db, `userDomains/${BA_OF_REP}/hcm/training`)));
    await assertFails(setDoc(doc(db, "domains/trainingLibrary/fields/materials"), { items: [] }));
  });
});

describe("training file storage boundaries", () => {
  // The Storage emulator is not part of this project's test topology, so the rules file is asserted
  // structurally: training objects are employee-readable, Administrator-only writable, never public.
  const rules = readFileSync("storage.rules", "utf8");

  test("training objects are readable by provisioned employees only", () => {
    assert.match(rules, /match \/training\/\{courseId\}\/\{fileName\} \{[\s\S]*?allow read: if isEmployee\(\);/);
  });

  test("only an active Administrator may write or delete training objects", () => {
    assert.match(rules, /allow write: if isAdmin\(\)/);
    assert.match(rules, /allow delete: if isAdmin\(\);/);
    assert.match(rules, /access\(\)\.role == 'Administrator' && access\(\)\.accountState == 'Active'/);
  });

  test("Storage reuses the Firestore userAccess authority and denies everything else", () => {
    assert.match(rules, /firestore\.get\(\/databases\/\(default\)\/documents\/userAccess\/\$\(request\.auth\.uid\)\)/);
    assert.match(rules, /match \/\{allPaths=\*\*\} \{\s*allow read, write: if false;/);
    assert.ok(!/allow read: if true/.test(rules), "storage.rules exposes a publicly readable path");
  });
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
