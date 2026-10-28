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
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

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
const MARKETING = "uid-marketing";
const DRIVER = "uid-driver";
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
  accessRecord(MARKETING, "Marketing", "Marketing"),
  accessRecord(DRIVER, "Delivery Driver", "Operations"),
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
  for (const uid of [ADMIN, MANAGER, REP, OPS, DRIVER, ONBOARDING, BA_OF_REP]) {
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

describe("bounded audit chunk Security Rules", () => {
  const ownChunk=`userDomains/${REP}/audit/events__chunk_000000`;
  const peerChunk=`userDomains/${OTHER_REP}/audit/events__chunk_000000`;

  test("the employee and Administrator can read/write a valid audit chunk for that employee", async () => {
    assert.equal(documentWritable(ownChunk,scopeFor(REP)),true);
    assert.equal(documentWritable(ownChunk,scopeFor(ADMIN)),true);
    await assertSucceeds(setDoc(doc(dbFor(REP),ownChunk),{items:[]}));
    await assertSucceeds(getDoc(doc(dbFor(REP),ownChunk)));
    await assertSucceeds(setDoc(doc(dbFor(ADMIN),ownChunk),{items:[]}));
    await assertSucceeds(getDoc(doc(dbFor(ADMIN),ownChunk)));
  });

  test("managers and peer employees do not gain audit-history access from chunking", async () => {
    assert.equal(documentWritable(ownChunk,scopeFor(MANAGER)),false);
    await assertFails(getDoc(doc(dbFor(MANAGER),ownChunk)));
    await assertFails(setDoc(doc(dbFor(MANAGER),ownChunk),{items:[]}));
    await assertFails(getDoc(doc(dbFor(REP),peerChunk)));
    await assertFails(setDoc(doc(dbFor(REP),peerChunk),{items:[]}));
  });

  test("only the exact bounded chunk naming scheme is accepted", async () => {
    for(const path of [
      `userDomains/${REP}/audit/events__chunk_0`,
      `userDomains/${REP}/audit/events__chunk_000000_extra`,
      `userDomains/${REP}/audit/not-events__chunk_000000`,
    ]){
      await assertFails(getDoc(doc(dbFor(REP),path)));
      await assertFails(setDoc(doc(dbFor(REP),path),{items:[]}));
    }
  });
});

describe("the username login index is unreachable from any client", () => {
  const INDEX = "usernames/jsmith";
  const REMINDER = `usernameReminders/${REP}`;

  before(async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, INDEX), { uid: REP, email: `${REP}@momentum.test`, updatedAt: at, updatedBy: ADMIN });
      await setDoc(doc(db, REMINDER), { uid: REP, email: `${REP}@momentum.test`, username: "jsmith", requestedAt: at, resolved: false });
    });
  });

  test("nobody — signed out, employee, or Administrator — can read a username to e-mail mapping", async () => {
    for (const uid of [null, REP, MANAGER, OPS, ONBOARDING, ADMIN]) {
      await assertFails(getDoc(doc(dbFor(uid), INDEX)));
      await assertFails(setDoc(doc(dbFor(uid), INDEX), { uid, email: "attacker@example.com" }));
    }
  });

  test("the mapping cannot be probed by writing a new entry either", async () => {
    await assertFails(setDoc(doc(dbFor(ADMIN), "usernames/anything"), { uid: ADMIN, email: `${ADMIN}@momentum.test` }));
    await assertFails(setDoc(doc(dbFor(null), "usernames/anything"), { uid: "x", email: "x@y.co" }));
  });

  test("forgot-username requests are Administrator-only and only the Worker may file them", async () => {
    await assertSucceeds(getDoc(doc(dbFor(ADMIN), REMINDER)));
    await assertSucceeds(setDoc(doc(dbFor(ADMIN), REMINDER), { resolved: true }, { merge: true }));
    for (const uid of [null, REP, MANAGER, OPS]) await assertFails(getDoc(doc(dbFor(uid), REMINDER)));
    await assertFails(setDoc(doc(dbFor(ADMIN), "usernameReminders/uid-new"), { uid: "uid-new", email: "a@b.co" }));
  });

  test("an Administrator cannot repoint a login name by editing the access record", async () => {
    const db = dbFor(ADMIN);
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { username: "someoneelse" }, { merge: true }));
    await assertFails(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { email: "elsewhere@momentum.test" }, { merge: true }));
    // Everything the Administrator is still supposed to change keeps working.
    await assertSucceeds(setDoc(doc(db, USER_ACCESS_COLLECTION, REP), { accountState: "Suspended", updatedAt: at, updatedBy: ADMIN }, { merge: true }));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), USER_ACCESS_COLLECTION, REP), { accountState: "Active" }, { merge: true });
    });
  });

  test("an employee cannot edit their own username", async () => {
    await assertFails(setDoc(doc(dbFor(REP), USER_ACCESS_COLLECTION, REP), { username: "administrator" }, { merge: true }));
  });
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

describe("Delivery Driver approved marketing visibility", () => {
  test("driver can read the shared delivery notice projection but cannot write it or read campaign administration", async () => {
    const db=dbFor(DRIVER);
    await assertSucceeds(getDoc(doc(db,"domains/marketing/fields/deliveryNotices")));
    await assertFails(setDoc(doc(db,"domains/marketing/fields/deliveryNotices"),{items:[]}));
    await assertFails(getDoc(doc(db,"domains/marketing/fields/campaigns")));
  });
});

describe("employee separation and suspension revokes operational access", () => {
  for (const state of ["Separated", "Suspended"] as const) {
    test(`${state} users cannot read or modify any employee domain`, async () => {
      const uid = `uid-${state.toLowerCase()}-offboard`;
      await env.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), USER_ACCESS_COLLECTION, uid),
          userAccessDocument(accessRecord(uid, "Sales Representative", "Sales", {
            accountState: state,
          })),
        );
      });
      const userDb = dbFor(uid);
      for (const path of [
        "domains/workspace/fields/accounts",
        "domains/commercial/fields/_root",
        "domains/hcm/fields/policies",
        "domains/trainingLibrary/fields/materials",
        "domains/crm/fields/contacts",
        `userDomains/${uid}/identity/records`,
        `userDomains/${uid}/hcm/documents`,
      ]) {
        await assertFails(getDoc(doc(userDb, path)));
        await assertFails(setDoc(doc(userDb, path), {items: []}));
      }
      await assertFails(getDoc(doc(userDb, EMPLOYEE_DIRECTORY_COLLECTION, REP)));
    });
  }

  test("the Storage policy also excludes both non-working states", () => {
    const rules = readFileSync("storage.rules", "utf8");
    assert.match(rules, /accountState != 'Separated'/);
    assert.match(rules, /accountState != 'Suspended'/);
  });

  test("client-side persistence refuses suspended and separated shard writes", () => {
    for (const state of ["Suspended", "Separated"] as const) {
      const scope = {...scopeFor(REP), accountState: state};
      assert.equal(
        documentWritable(`userDomains/${REP}/identity/records`, scope),
        false,
      );
      assert.equal(
        documentWritable("domains/commercial/fields/_root", scope),
        false,
      );
      assert.equal(domainDocuments(DOMAIN_SPECS[0], scope).length, 0);
    }
  });
});

describe("separation audit is immutable to employees", () => {
  test("active Administrator may read but no client may forge audit", async () => {
    const path="employeeSeparations/uid-rep";
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(),path),{
        uid:REP,actorUid:ADMIN,separatedAt:at,historyPreserved:true,
      });
    });
    await assertSucceeds(getDoc(doc(dbFor(ADMIN),path)));
    for (const uid of [REP,MANAGER,OPS,DRIVER]) {
      await assertFails(getDoc(doc(dbFor(uid),path)));
      await assertFails(setDoc(doc(dbFor(uid),path),{uid:REP}));
    }
    await assertFails(setDoc(doc(dbFor(ADMIN),path),{
      uid:REP,historyPreserved:false,
    }));
  });
});

describe("immutable account creator provenance is server-owned", () => {
  const path = "accountCreatorProvenance/acc-test";

  test("even an active Administrator client cannot read, forge, or overwrite creator proof", async () => {
    const db = dbFor(ADMIN);
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { accountId: "acc-test", creatorUid: ADMIN }));
  });

  test("reps, managers, Operations and customers cannot mint creator claims", async () => {
    for (const uid of [REP, OTHER_REP, MANAGER, OPS, DRIVER]) {
      const db = dbFor(uid);
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), {accountId:"acc-test", creatorUid:uid}));
    }
    await assertFails(setDoc(doc(dbFor(null), path), {accountId:"acc-test", creatorUid:REP}));
  });

  test("provenance is immutable from every client even if Admin SDK seeds an existing record", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), {
        accountId:"acc-test", creatorUid:REP,
        createdAt:"2026-10-12T16:00:00.000Z",
      });
    });
    const db = dbFor(ADMIN);
    await assertFails(getDoc(doc(db, path)));
    await assertFails(setDoc(doc(db, path), { creatorUid:ADMIN }, { merge: true }));
    await assertFails(setDoc(doc(dbFor(REP), path), { creatorUid:REP }, { merge: true }));
  });
});

describe("trusted account profile audit records are immutable to browser clients",()=>{
  const auditPath="accountProfileEditEvents/audit-1";
  test("only Admin may read the server-generated event, never create/update it",async()=>{
    await env.withSecurityRulesDisabled(async(context)=>{
      await setDoc(doc(context.firestore(),auditPath),{
        id:"audit-1",accountId:"acc-test",actorUid:ADMIN,at:at,
        changedKeys:["phone"],before:{phone:"old"},after:{phone:"new"},
      });
    });
    await assertSucceeds(getDoc(doc(dbFor(ADMIN),auditPath)));
    for(const uid of [REP,OTHER_REP,MANAGER,OPS,DRIVER]){
      await assertFails(getDoc(doc(dbFor(uid),auditPath)));
      await assertFails(setDoc(doc(dbFor(uid),auditPath),{accountId:"forged"}));
    }
    await assertFails(setDoc(doc(dbFor(ADMIN),auditPath),{actorUid:ADMIN},{merge:true}));
    await assertFails(setDoc(doc(dbFor(ADMIN),"accountProfileEditEvents/forged"),{actorUid:ADMIN}));
  });
});

describe("trusted account creation receipts are server-owned",()=>{
  const receipt="accountCreationRequests/uid-admin_request-token-123456789";
  test("no Firebase client can create or claim an idempotency receipt",async()=>{
    for(const uid of [ADMIN,MANAGER,REP,OTHER_REP,OPS,DRIVER]){
      await assertFails(getDoc(doc(dbFor(uid),receipt)));
      await assertFails(setDoc(doc(dbFor(uid),receipt),{
        accountId:"forged",actorUid:uid,
      }));
    }
    await assertFails(setDoc(doc(dbFor(null),receipt),{accountId:"forged"}));
  });
});

describe("server-owned notification preview and delivery records",()=>{
  for(const collection of ["notificationCandidates","emailOutbox"]){
    test(`${collection} cannot be forged even by an Administrator browser`,async()=>{
      const path=`${collection}/test-event`;
      await env.withSecurityRulesDisabled(async(context)=>{
        await setDoc(doc(context.firestore(),path),{status:"Review required",transportEnabled:false});
      });
      await assertSucceeds(getDoc(doc(dbFor(ADMIN),path)));
      for(const uid of [ADMIN,REP,OTHER_REP,MANAGER,OPS,DRIVER]){
        await assertFails(setDoc(doc(dbFor(uid),path),{status:"Sent"}));
        if(uid!==ADMIN)await assertFails(getDoc(doc(dbFor(uid),path)));
      }
    });
  }
  test("suppression data is private to the backend",async()=>{
    for(const uid of [ADMIN,REP,MANAGER,OPS,DRIVER]){
      await assertFails(getDoc(doc(dbFor(uid),"emailSuppressions/recipient")));
      await assertFails(setDoc(doc(dbFor(uid),"emailSuppressions/recipient"),{blocked:false}));
    }
  });
});

describe("Marketing files, production history, and sales targets", () => {
  test("Marketing manages files; reps see approved versions only and cannot approve drafts", async () => {
    const path = "marketingAssetVersions/test-draft";
    const draft = {id:"test-draft",assetId:"asset",version:1,status:"Draft",deleted:false,createdBy:MARKETING,updatedBy:MARKETING};
    await assertSucceeds(setDoc(doc(dbFor(MARKETING),path),draft));
    await assertFails(getDoc(doc(dbFor(REP),path)));
    await assertFails(setDoc(doc(dbFor(REP),path),{...draft,status:"Approved",updatedBy:REP}));
    await assertSucceeds(setDoc(doc(dbFor(MARKETING),path),{...draft,status:"Approved"}));
    await assertSucceeds(getDoc(doc(dbFor(REP),path)));
    await assertFails(setDoc(doc(dbFor(MARKETING),path),{...draft,status:"Approved",version:2}));
    await assertSucceeds(setDoc(doc(dbFor(MARKETING),path),{...draft,status:"Archived",deleted:true}));
    await assertFails(getDoc(doc(dbFor(REP),path)));
  });
  test("requesters cannot impersonate colleagues or rewrite production history", async () => {
    const path="marketingProductionRequests/test-request";
    const row={id:"test-request",requesterId:REP,quantity:10,status:"Requested",ownerId:"",draftVersionId:"",approvedVersionId:"",createdAt:at,updatedAt:at,updatedBy:REP,history:[{at,actorId:REP,status:"Requested"}]};
    await assertFails(setDoc(doc(dbFor(OTHER_REP),path),row));
    await assertSucceeds(setDoc(doc(dbFor(REP),path),row));
    await assertFails(getDoc(doc(dbFor(OTHER_REP),path)));
    await assertFails(setDoc(doc(dbFor(MARKETING),path),{...row,status:"Draft",updatedBy:MARKETING,history:[]}));
    await assertSucceeds(setDoc(doc(dbFor(MARKETING),path),{...row,status:"Draft",updatedBy:MARKETING,history:[...row.history,{at,actorId:MARKETING,status:"Draft"}]}));
  });
  test("weekly targets are controlled by management, not the employee or Marketing", async () => {
    const path=`salesVisitTargets/${REP}/weeks/2026-10-12`;
    const row={userId:REP,weekStart:"2026-10-12",target:65,updatedAt:at,updatedBy:MANAGER};
    await assertSucceeds(setDoc(doc(dbFor(MANAGER),path),row));
    await assertSucceeds(getDoc(doc(dbFor(REP),path)));
    await assertFails(setDoc(doc(dbFor(REP),path),{...row,updatedBy:REP}));
    await assertFails(setDoc(doc(dbFor(MARKETING),path),{...row,updatedBy:MARKETING}));
    await assertFails(setDoc(doc(dbFor(MANAGER),path),{...row,target:-1}));
  });
});

describe("confidential HR signed-form receipt metadata",()=>{
 test("only employee and active Administrator can read; all browser writes are denied",async()=>{
  const path="hrSignedFormRecords/form-receipt-1";
  const auditPath="hrSignedFormAudit/audit-entry-1";
  const metadata={id:"form-receipt-1",employeeUid:REP,formKey:"W4",status:"Archived",signedPdfStoragePath:"hr-private/uid-rep/W4/envelope-1/signed.pdf",completedAt:at};
  await env.withSecurityRulesDisabled(async context=>{
   await setDoc(doc(context.firestore(),path),metadata);
   await setDoc(doc(context.firestore(),auditPath),{employeeUid:REP,action:"Archive confirmed",at});
  });
  await assertSucceeds(getDoc(doc(dbFor(REP),path)));
  await assertSucceeds(getDoc(doc(dbFor(ADMIN),path)));
  await assertSucceeds(getDocs(query(collection(dbFor(REP),"hrSignedFormRecords"),where("employeeUid","==",REP))));
  await assertFails(getDoc(doc(dbFor(OTHER_REP),path)));
  await assertFails(getDoc(doc(dbFor(MANAGER),path)));
  await assertFails(getDoc(doc(dbFor(OPS),path)));
  await assertFails(getDoc(doc(dbFor(MARKETING),path)));
  await assertFails(getDoc(doc(dbFor(null),path)));
  await assertFails(setDoc(doc(dbFor(REP),path),metadata));
  await assertFails(setDoc(doc(dbFor(ADMIN),path),{...metadata,status:"Pending"}));
  await assertSucceeds(getDoc(doc(dbFor(ADMIN),auditPath)));
  await assertFails(getDoc(doc(dbFor(REP),auditPath)));
  await assertFails(setDoc(doc(dbFor(ADMIN),auditPath),{employeeUid:REP,action:"Forged"}));
 });
});

describe("server-projected admin notification events",()=>{
 test("only Administrators can read and no browser role can write",async()=>{
  await env.withSecurityRulesDisabled(async(context)=>{
   await setDoc(doc(context.firestore(),"notificationAdminEvents","event-1"),{
    id:"event-1",policyId:"system.email_bounced",title:"Customer email bounced",
    detail:"Delivery failed.",createdAt:at,sourceId:"source-1",
    sourceRecordId:"order-1",outboxId:"outbox-1",status:"Open",
   });
  });
  await assertSucceeds(getDoc(doc(dbFor(ADMIN),"notificationAdminEvents","event-1")));
  for(const uid of [REP,MANAGER,OPS,MARKETING,null]){
   await assertFails(getDoc(doc(dbFor(uid),"notificationAdminEvents","event-1")));
  }
  for(const uid of [ADMIN,REP,MANAGER,OPS,MARKETING,null]){
   await assertFails(setDoc(doc(dbFor(uid),"notificationAdminEvents","forged"),{
    id:"forged",policyId:"system.email_failed",title:"Forged",detail:"Forged",
    createdAt:at,sourceId:"x",sourceRecordId:"x",outboxId:"x",status:"Open",
   }));
  }
 });
});

describe("server-only external notification transport",()=>{
 test("no browser role can create or tamper with outbox, provider index, webhook or suppression",async()=>{
  for(const collectionName of ["notificationOutbox","notificationProviderIndex","notificationWebhookEvents","notificationSuppressions"]){
   for(const uid of [ADMIN,REP,MANAGER,OPS,MARKETING,null]){
    await assertFails(setDoc(doc(dbFor(uid),collectionName,"synthetic-1"),{status:"Approved",to:"buyer@example.test"}));
    await assertFails(getDoc(doc(dbFor(uid),collectionName,"synthetic-1")));
   }
  }
 });
});

describe("private account nicknames",()=>{
  const path=(uid:string,accountId:string)=>doc(dbFor(uid),"privateAccountNicknames",uid,"accounts",accountId);

  test("rep stores, reads and clears only their own personal shorthand",async()=>{
    const accountId="acc-private-nickname";
    const own=path(REP,accountId);
    await assertSucceeds(setDoc(own,{accountId,nickname:"My shorthand"}));
    const snapshot=await assertSucceeds(getDoc(own));
    assert.equal(snapshot.data()?.nickname,"My shorthand");
    await assertSucceeds(getDocs(collection(dbFor(REP),"privateAccountNicknames",REP,"accounts")));
    await assertSucceeds(deleteDoc(own));
  });

  test("other reps, managers, and admins cannot read or edit another person's nickname",async()=>{
    const accountId="acc-private-locked";
    await assertSucceeds(setDoc(path(REP,accountId),{accountId,nickname:"Private rep name"}));
    for(const who of [OTHER_REP,MANAGER,ADMIN]){
      const other=doc(dbFor(who),"privateAccountNicknames",REP,"accounts",accountId);
      await assertFails(getDoc(other));
      await assertFails(getDocs(collection(dbFor(who),"privateAccountNicknames",REP,"accounts")));
      await assertFails(setDoc(other,{accountId,nickname:"Stolen"}));
    }
    await assertSucceeds(deleteDoc(path(REP,accountId)));
  });

  test("nicknames cannot contain different account identifiers or extra sensitive fields",async()=>{
    const pathOwned=path(REP,"acc-private-invalid");
    await assertFails(setDoc(pathOwned,{accountId:"acc-other",nickname:"False"}));
    await assertFails(setDoc(pathOwned,{accountId:"acc-private-invalid",nickname:"x".repeat(81)}));
    await assertFails(setDoc(pathOwned,{accountId:"acc-private-invalid",nickname:"okay",ein:"123456789"}));
  });
});

describe("historical correction and isolated sandbox authority",()=>{
  test("correction requests and invoice reissues are readable only by admin, writable by server only",async()=>{
    for(const [collectionName,docId] of [
      ["deliveryCorrectionRequests","request-test"],
      ["deliveryCorrectionAudit","audit-test"],
      ["deliveryInvoiceReissues","reissue-test"],
    ]){
      const admin=doc(dbFor(ADMIN),collectionName,docId);
      await assertSucceeds(getDoc(admin));
      await assertFails(getDoc(doc(dbFor(REP),collectionName,docId)));
      await assertFails(setDoc(admin,{id:docId,state:"Applied"}));
    }
    await assertFails(getDoc(doc(dbFor(ADMIN),"deliveryCorrectionActive","acc-1")));
  });

  test("administrator can create only explicitly sandbox test product metadata",async()=>{
    const skuId="qa-sku-rules";
    const product={id:skuId,description:"QA Test Widget",shortName:"Widget",
      casePack:24,active:true,environment:"sandbox",createdBy:ADMIN,createdAt:new Date().toISOString()};
    const admin=doc(dbFor(ADMIN),"sandboxProducts",skuId);
    await assertSucceeds(setDoc(admin,product));
    await assertSucceeds(getDoc(admin));
    await assertFails(getDoc(doc(dbFor(REP),"sandboxProducts",skuId)));
    await assertFails(setDoc(doc(dbFor(REP),"sandboxProducts","qa-rep"),{...product,id:"qa-rep",createdBy:REP}));
    await assertFails(setDoc(doc(dbFor(ADMIN),"sandboxProducts","qa-production"),{...product,id:"qa-production",environment:"production"}));
    await assertFails(setDoc(admin,{...product,description:"Changed"}));
    await assertFails(deleteDoc(admin));
  });

  test("sandbox stock, orders and simulated invoices are server-only records",async()=>{
    for(const name of ["sandboxInventory","sandboxOrders","sandboxInvoices","sandboxStockReceipts"]){
      const owned=doc(dbFor(ADMIN),name,"qa-sku-rules");
      await assertSucceeds(getDoc(owned));
      await assertFails(getDoc(doc(dbFor(REP),name,"qa-sku-rules")));
      await assertFails(setDoc(owned,{onHand:99999,skuId:"ge-original-250ml-24"}));
    }
  });
});
