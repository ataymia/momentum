/**
 * Username rollout is additive, never an authentication cutover.
 *
 * Existing employees sign in with their e-mail address today and must keep doing so before, during, and
 * after usernames are assigned. These tests pin the routing between the two identifiers and the
 * guarantees of the backfill plan: Firestore writes only, no Firebase Authentication operation, and no
 * change to permissions, account state, or employment records.
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { classifyLoginIdentifier } from "../lib/auth-contract";
import { USERNAME_INDEX_COLLECTION } from "../lib/username";
import { planUsernameBackfill, planUsernameRelease, type IdentitySnapshot } from "../lib/username-migration";

const USER_ACCESS = "userAccess";
const DIRECTORY = "employeeDirectory";
const AT = "2026-09-21T00:00:00.000Z";
const ACTOR = "uid-admin";

const access = (uid: string, email: string, extra: Record<string, unknown> = {}): IdentitySnapshot => ({
  id: uid,
  data: { email, role: "Sales Representative", team: "Sales", managerId: "uid-manager", managedTeams: [], accountState: "Active", updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "uid-founder", ...extra },
});
const profile = (uid: string, name: string, extra: Record<string, unknown> = {}): IdentitySnapshot => ({
  id: uid,
  data: { name, firstName: name.split(" ")[0], email: `${uid}@momentum.test`, title: "Sales Representative", role: "Sales Representative", team: "Sales", accent: "#53657d", ...extra },
});

const plan = (input: { accessRecords: IdentitySnapshot[]; directory: IdentitySnapshot[]; index?: IdentitySnapshot[]; apply?: boolean }) =>
  planUsernameBackfill({
    accessRecords: input.accessRecords,
    directory: input.directory,
    index: input.index ?? [],
    apply: input.apply ?? false,
    actorId: ACTOR,
    at: AT,
    userAccessCollection: USER_ACCESS,
    employeeDirectoryCollection: DIRECTORY,
  });

describe("the login field accepts an e-mail or a username", () => {
  test("an address routes to direct Firebase e-mail sign-in", () => {
    assert.deepEqual(classifyLoginIdentifier("Jane.Smith@momentum-dci.com"), { kind: "email", email: "jane.smith@momentum-dci.com" });
    assert.deepEqual(classifyLoginIdentifier("  owner@gmail.com  "), { kind: "email", email: "owner@gmail.com" });
  });

  test("anything without an @ routes to the private username resolution", () => {
    assert.deepEqual(classifyLoginIdentifier("jsmith"), { kind: "username", username: "jsmith" });
    assert.deepEqual(classifyLoginIdentifier("JSmith"), { kind: "username", username: "jsmith" });
    assert.deepEqual(classifyLoginIdentifier("jsmith2"), { kind: "username", username: "jsmith2" });
  });

  test("an empty field is refused rather than guessed at", () => {
    assert.deepEqual(classifyLoginIdentifier(""), { kind: "empty" });
    assert.deepEqual(classifyLoginIdentifier("   "), { kind: "empty" });
  });

  test("a username can never be mistaken for an address, because it cannot contain an @", () => {
    // The generator only ever emits [a-z0-9], so the two identifier spaces cannot overlap.
    for (const value of ["jsmith", "mgonzalez", "soconnor", "asmithjones"]) {
      assert.equal(classifyLoginIdentifier(value).kind, "username");
    }
  });
});

describe("username backfill is additive", () => {
  test("a dry run reports the names it would assign and writes nothing", () => {
    const result = plan({ accessRecords: [access("uid-1", "jane@momentum.test")], directory: [profile("uid-1", "Jane Smith")] });
    assert.deepEqual(result.writes, [], "a dry run must not produce a single write");
    assert.deepEqual(result.entries, [{ uid: "uid-1", name: "Jane Smith", username: "jsmith", status: "would-assign" }]);
  });

  test("applying writes only Firestore documents, never a Firebase Authentication operation", () => {
    const result = plan({ accessRecords: [access("uid-1", "jane@momentum.test")], directory: [profile("uid-1", "Jane Smith")], apply: true });
    assert.deepEqual(result.writes.map((write) => write.path).sort(), [
      `${DIRECTORY}/uid-1`,
      `${USER_ACCESS}/uid-1`,
      `${USERNAME_INDEX_COLLECTION}/jsmith`,
    ]);
    // The plan is a list of document paths. There is no shape here that could carry a password or a uid
    // change, which is what keeps e-mail sign-in working untouched through the migration.
    assert.ok(result.writes.every((write) => typeof write.path === "string" && write.path.includes("/")));
  });

  test("permissions, account state, reporting line, and employment records are copied through untouched", () => {
    const before = access("uid-1", "jane@momentum.test", { role: "Sales Manager", team: "Sales", managedTeams: ["Sales"], accountState: "Password change required", managerId: "uid-founder" });
    const result = plan({ accessRecords: [before], directory: [profile("uid-1", "Jane Smith")], apply: true });
    const write = result.writes.find((item) => item.path === `${USER_ACCESS}/uid-1`)!;
    assert.equal(write.data.role, "Sales Manager");
    assert.equal(write.data.team, "Sales");
    assert.equal(write.data.accountState, "Password change required", "a hire mid-onboarding must not be silently activated");
    assert.equal(write.data.managerId, "uid-founder");
    assert.deepEqual(write.data.managedTeams, ["Sales"]);
    assert.equal(write.data.email, "jane@momentum.test", "the recovery address is never rewritten");
    assert.equal(write.data.username, "jsmith");
    // Only the additive fields differ from the original document.
    const changed = Object.keys(write.data).filter((key) => JSON.stringify(write.data[key]) !== JSON.stringify(before.data[key]));
    assert.deepEqual(changed.sort(), ["updatedAt", "updatedBy", "username"].sort());
  });

  test("re-running skips identities that already hold their username", () => {
    const records = [access("uid-1", "jane@momentum.test", { username: "jsmith" })];
    const index = [{ id: "jsmith", data: { uid: "uid-1", email: "jane@momentum.test" } }];
    const result = plan({ accessRecords: records, directory: [profile("uid-1", "Jane Smith")], index, apply: true });
    assert.deepEqual(result.entries, [{ uid: "uid-1", name: "Jane Smith", username: "jsmith", status: "already-assigned" }]);
    assert.deepEqual(result.writes, [], "an idempotent re-run must not rewrite anything");
  });

  test("a collision takes the next suffix and never disturbs the account holding the base name", () => {
    const index = [{ id: "jsmith", data: { uid: "uid-existing", email: "existing@momentum.test" } }];
    const result = plan({
      accessRecords: [access("uid-2", "john@momentum.test")],
      directory: [profile("uid-2", "John Smith")],
      index,
      apply: true,
    });
    assert.equal(result.entries[0].username, "jsmith2");
    assert.ok(!result.writes.some((write) => write.path === `${USERNAME_INDEX_COLLECTION}/jsmith`), "the existing holder's index entry is untouched");
    assert.ok(!result.writes.some((write) => write.path.endsWith("/uid-existing")), "the existing account is not rewritten");
    assert.equal((result.writes.find((write) => write.path === `${USERNAME_INDEX_COLLECTION}/jsmith2`)!.data as { uid: string }).uid, "uid-2");
  });

  test("two identities generating the same name in one run are separated", () => {
    const result = plan({
      accessRecords: [access("uid-1", "a@momentum.test"), access("uid-2", "b@momentum.test"), access("uid-3", "c@momentum.test")],
      directory: [profile("uid-1", "Jane Smith"), profile("uid-2", "John Smith"), profile("uid-3", "Jill Smith")],
      apply: true,
    });
    assert.deepEqual(result.entries.map((entry) => entry.username), ["jsmith", "jsmith2", "jsmith3"]);
  });

  test("an identity with no usable address or name is reported, not guessed at", () => {
    const noEmail = plan({ accessRecords: [access("uid-1", "")], directory: [profile("uid-1", "Jane Smith", { email: "" })], apply: true });
    assert.equal(noEmail.entries[0].status, "unresolvable");
    assert.deepEqual(noEmail.writes, []);

    const noName = plan({ accessRecords: [access("uid-2", "x@momentum.test")], directory: [profile("uid-2", "!!!")], apply: true });
    assert.equal(noName.entries[0].status, "unresolvable");
    assert.deepEqual(noName.writes, []);
  });

  test("a missing address on the access record falls back to the directory profile", () => {
    const result = plan({ accessRecords: [access("uid-1", "")], directory: [profile("uid-1", "Jane Smith")], apply: true });
    assert.equal(result.entries[0].status, "assigned");
    assert.equal((result.writes.find((write) => write.path === `${USERNAME_INDEX_COLLECTION}/jsmith`)!.data as { email: string }).email, "uid-1@momentum.test");
  });

  test("an identity with no directory profile still resolves from its access record", () => {
    const result = plan({ accessRecords: [access("uid-1", "jane.smith@momentum.test")], directory: [], apply: true });
    assert.equal(result.entries[0].status, "assigned");
    assert.ok(result.entries[0].username.length >= 2);
  });
});

describe("releasing a username never touches the Firebase identity", () => {
  test("only the index entry is removed and the field blanked", () => {
    const record = access("uid-1", "jane@momentum.test", { username: "jsmith", role: "Sales Manager", accountState: "Active" });
    const released = planUsernameRelease(record, profile("uid-1", "Jane Smith").data, ACTOR, AT, USER_ACCESS, DIRECTORY);
    assert.deepEqual(released.deletes, [`${USERNAME_INDEX_COLLECTION}/jsmith`]);
    const write = released.writes.find((item) => item.path === `${USER_ACCESS}/uid-1`)!;
    assert.equal(write.data.username, "");
    assert.equal(write.data.role, "Sales Manager", "the role survives a username change");
    assert.equal(write.data.accountState, "Active", "access is not revoked by a username change");
    assert.equal(write.data.email, "jane@momentum.test", "e-mail sign-in keeps working afterwards");
  });

  test("an identity with no username produces no operations at all", () => {
    const released = planUsernameRelease(access("uid-1", "jane@momentum.test"), {}, ACTOR, AT, USER_ACCESS, DIRECTORY);
    assert.deepEqual(released.deletes, []);
    assert.deepEqual(released.writes, []);
  });
});
