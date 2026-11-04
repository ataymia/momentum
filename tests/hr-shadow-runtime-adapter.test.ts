import assert from "node:assert/strict";
import test from "node:test";
import type { PersistenceScope } from "../lib/firebase-access";
import { HrShadowRuntimeAdapter } from "../lib/hr-shadow-runtime-adapter";

const scope = (
  uid: string,
  role: PersistenceScope["role"] = "Sales Representative",
  reports: string[] = [],
  accountState: PersistenceScope["accountState"] = "Active",
): PersistenceScope => ({
  uid, role, accountState,
  readableUserIds: new Set([uid, ...reports]),
  managedUserIds: new Set(reports),
  supervisedBrandAmbassadorIds: new Set(),
});
const own = (uid: string, field = "documents") => `userDomains/${uid}/hcm/${field}`;
const shared = "domains/hcm/fields/policies";
const doc = (uid: string, marker: string) => ({
  items: [{ id: marker, userId: uid, marker }],
});
const batch = (
  adapter: HrShadowRuntimeAdapter, uid: string,
  path: string, value: Record<string, unknown> | null,
  epoch = adapter.epoch,
) => ({
  epoch, requestUid: uid, requestedPaths: [path],
  documents: new Map([[path, value]]),
});

test("authorized HCM read is hidden until the current epoch completes", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "own"))), true);
  assert.equal((adapter.snapshot()?.documents as { marker: string }[])[0].marker, "own");
});

test("account switch clears old snapshot before any new network request", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
  adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "own")));
  const oldEpoch = adapter.epoch;
  const transition = adapter.transition(scope("employee-b"));
  assert.ok(transition.plan.evictPaths.includes(own("employee-a")));
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "old"), oldEpoch)), false);
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "employee-b", own("employee-b"), doc("employee-b", "new"))), true);
  assert.equal((adapter.snapshot()?.documents as { marker: string }[])[0].marker, "new");
});

test("manager reassignment invalidates direct-report shards before fresh hydration", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("manager", "Sales Manager", ["employee-a"]));
  assert.equal(adapter.accept(batch(adapter, "manager", own("employee-a"), doc("employee-a", "report"))), true);
  adapter.transition(scope("manager", "Sales Manager"));
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "manager", own("employee-a"), doc("employee-a", "leak"))), false);
});

test("pending HCM journal is quarantined without deleting evidence or flushing", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a", "Administrator"));
  adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "draft")));
  const { plan } = adapter.transition(scope("employee-a"), ["momentum-hcm-v4", "momentum-demo-workspace-v5"]);
  assert.equal(adapter.isQuarantined, true);
  assert.deepEqual(adapter.journalKeysRequiringReview, ["momentum-hcm-v4"]);
  assert.deepEqual(plan.requestPaths, []);
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "stale"))), false);
});

test("permission denial invalidates cache and rejects late responses", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
  adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "own")));
  const oldEpoch = adapter.epoch;
  assert.equal(adapter.accept({
    ...batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "own")),
    deniedPaths: [own("employee-a")],
  }), false);
  assert.equal(adapter.isQuarantined, true);
  assert.equal(adapter.snapshot(), null);
  assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "old"), oldEpoch)), false);
});

test("malformed owner payload fails closed and does not enter cache", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
  assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-b", "wrong-owner"))), false);
  assert.equal(adapter.isQuarantined, true);
  assert.deepEqual(adapter.cachedPaths, []);
  assert.equal(adapter.snapshot(), null);
});

test("shared policy metadata can hydrate, but shared confidential arrays cannot", () => {
  const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
  assert.equal(adapter.accept(batch(adapter, "employee-a", shared, { items: [{ title: "Synthetic policy" }] })), true);
  assert.equal((adapter.snapshot()?.policies as unknown[]).length, 1);
  const forbidden = "domains/hcm/fields/documents";
  assert.equal(adapter.accept(batch(adapter, "employee-a", forbidden, doc("employee-b", "private"))), false);
  assert.equal(JSON.stringify(adapter.snapshot()).includes("private"), false);
});

test("suspended or customer scope cannot hydrate old employee records", () => {
  for (const next of [scope("employee-a", "Sales Representative", [], "Suspended"), scope("employee-a", "Customer")]) {
    const adapter = new HrShadowRuntimeAdapter(scope("employee-a"));
    adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "own")));
    adapter.transition(next);
    assert.equal(adapter.snapshot(), null);
    assert.equal(adapter.accept(batch(adapter, "employee-a", own("employee-a"), doc("employee-a", "old"))), false);
  }
});
