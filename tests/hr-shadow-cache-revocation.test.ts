import assert from "node:assert/strict";
import test from "node:test";
import type { PersistenceScope } from "../lib/firebase-access";
import { DOMAIN_SPECS, assembleState } from "../lib/firestore-domains";
import {
  acceptHrShadowFetch, assembleAuthorizedHrShadowSnapshot,
  planHrShadowCacheTransition,
} from "../lib/hr-shadow-cache-revocation";

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
const own = (uid: string, field: string) => "userDomains/" + uid + "/hcm/" + field;
const shared = (field: string) => "domains/hcm/fields/" + field;
const docs = new Map<string, Record<string, unknown> | null>([
  [shared("documents"), { items: [{ id: "legacy-other", userId: "uid-b", marker: "LEGACY_OTHER" }] }],
  [own("uid-a", "documents"), { items: [{ id: "own-a", userId: "uid-a", marker: "OWN_A" }] }],
  [own("uid-b", "documents"), { items: [{ id: "own-b", userId: "uid-b", marker: "OWN_B" }] }],
  [shared("policies"), { items: [{ id: "policy", title: "Synthetic policy" }] }],
]);

test("current unfiltered assembler retains stale other-employee HCM payload; shadow filter excludes it", () => {
  const raw = assembleState(hcm, docs);
  assert.ok(JSON.stringify(raw?.documents).includes("LEGACY_OTHER"));
  const employee = assembleAuthorizedHrShadowSnapshot(scope("uid-a", "Sales Representative"), docs);
  assert.deepEqual((employee?.documents as { marker: string }[]).map((item) => item.marker), ["OWN_A"]);
  assert.ok(!JSON.stringify(employee).includes("OWN_B"));
  assert.ok(!JSON.stringify(employee).includes("LEGACY_OTHER"));
  assert.equal((employee?.policies as unknown[]).length, 1);
});

test("Administrator to employee downgrade evicts shared and peer shards and invalidates assembled state", () => {
  const previousScope = scope("uid-a", "Administrator", "Active", ["uid-b"]);
  const nextScope = scope("uid-a", "Sales Representative");
  const transition = planHrShadowCacheTransition({
    previousScope, nextScope, cachedPaths: [...docs.keys()],
  });
  assert.equal(transition.invalidateHcmSnapshot, true);
  assert.deepEqual(transition.retainPaths, []);
  assert.ok(transition.evictPaths.includes(own("uid-b", "documents")));
  assert.ok(transition.evictPaths.includes(shared("documents")));
  assert.ok(transition.requestPaths.includes(own("uid-a", "documents")));
  assert.ok(!transition.requestPaths.includes(own("uid-b", "documents")));
});

test("same-role manager loses report: revoke its cached shard even if uid remains the same", () => {
  const transition = planHrShadowCacheTransition({
    previousScope: scope("uid-manager", "Sales Manager", "Active", ["uid-a"]),
    nextScope: scope("uid-manager", "Sales Manager"),
    cachedPaths: [own("uid-a", "documents"), shared("policies")],
  });
  assert.equal(transition.invalidateHcmSnapshot, true);
  assert.deepEqual(transition.retainPaths, []);
  assert.ok(transition.evictPaths.includes(own("uid-a", "documents")));
  assert.ok(!transition.requestPaths.includes(own("uid-a", "documents")));
});

test("switching Firebase identities forces a complete HCM cache reset", () => {
  const transition = planHrShadowCacheTransition({
    previousScope: scope("uid-a", "Sales Representative"),
    nextScope: scope("uid-b", "Sales Representative"),
    cachedPaths: [own("uid-a", "documents"), shared("policies")],
  });
  assert.equal(transition.invalidateHcmSnapshot, true);
  assert.deepEqual(transition.retainPaths, []);
  assert.ok(transition.requestPaths.includes(own("uid-b", "documents")));
  assert.ok(!transition.requestPaths.includes(own("uid-a", "documents")));
  const next = assembleAuthorizedHrShadowSnapshot(scope("uid-b", "Sales Representative"), docs);
  assert.deepEqual((next?.documents as { marker: string }[]).map((item) => item.marker), ["OWN_B"]);
});

test("suspended, separated and customer accounts cannot retain HCM payload", () => {
  for (const nextScope of [
    scope("uid-a", "Sales Representative", "Suspended"),
    scope("uid-a", "Sales Representative", "Separated"),
    scope("uid-a", "Customer"),
  ]) {
    const transition = planHrShadowCacheTransition({
      previousScope: scope("uid-a", "Sales Representative"),
      nextScope, cachedPaths: [own("uid-a", "documents"), shared("policies")],
    });
    assert.equal(transition.invalidateHcmSnapshot, true);
    assert.deepEqual(transition.retainPaths, []);
    assert.deepEqual(transition.requestPaths, []);
    assert.equal(assembleAuthorizedHrShadowSnapshot(nextScope, docs), null);
  }
});

test("unchanged scope may retain only currently authorized cached paths", () => {
  const active = scope("uid-a", "Sales Representative");
  const transition = planHrShadowCacheTransition({
    previousScope: active, nextScope: active,
    cachedPaths: [own("uid-a", "documents"), shared("policies"), own("uid-b", "documents")],
  });
  assert.deepEqual(transition.retainPaths, [shared("policies"), own("uid-a", "documents")]);
  assert.deepEqual(transition.evictPaths, [own("uid-b", "documents")]);
  assert.equal(transition.invalidateHcmSnapshot, true);
});

test("pending HCM journal on revocation is quarantined, never auto-flushed or rehydrated", () => {
  const transition = planHrShadowCacheTransition({
    previousScope: scope("uid-a", "Administrator"),
    nextScope: scope("uid-a", "Sales Representative"),
    cachedPaths: [own("uid-a", "documents")],
    pendingStorageKeys: ["momentum-hcm-v4", "momentum-demo-workspace-v5"],
  });
  assert.equal(transition.blockedByPendingOrDenied, true);
  assert.deepEqual(transition.quarantinePendingKeys, ["momentum-hcm-v4"]);
  assert.deepEqual(transition.requestPaths, []);
});

test("permission-denied HCM refresh blocks hydration and invalidates the prior snapshot", () => {
  const active = scope("uid-a", "Sales Representative");
  const transition = planHrShadowCacheTransition({
    previousScope: active, nextScope: active,
    cachedPaths: [own("uid-a", "documents")],
    deniedReadPaths: [shared("documents")],
  });
  assert.equal(transition.blockedByPendingOrDenied, true);
  assert.equal(transition.invalidateHcmSnapshot, true);
  assert.deepEqual(transition.retainPaths, []);
  assert.deepEqual(transition.requestPaths, []);
});

test("late fetch after session switch or permission downgrade cannot repopulate old shards", () => {
  const old = scope("uid-a", "Administrator", "Active", ["uid-b"]);
  const current = scope("uid-a", "Sales Representative");
  const path = own("uid-b", "documents");
  assert.equal(acceptHrShadowFetch({
    requestEpoch: 4, activeEpoch: 5, requestUid: old.uid,
    activeScope: current, requestedPaths: [path], returnedPaths: [path],
  }), false);
  assert.equal(acceptHrShadowFetch({
    requestEpoch: 5, activeEpoch: 5, requestUid: old.uid,
    activeScope: current, requestedPaths: [path], returnedPaths: [path],
  }), false);
  assert.equal(acceptHrShadowFetch({
    requestEpoch: 5, activeEpoch: 5, requestUid: "uid-b",
    activeScope: current, requestedPaths: [own("uid-a", "documents")],
    returnedPaths: [own("uid-a", "documents")],
  }), false);
});

test("current-epoch authorized own shard fetch passes, but extra or denied paths fail", () => {
  const active = scope("uid-a", "Sales Representative");
  const path = own("uid-a", "documents");
  const base = {
    requestEpoch: 7, activeEpoch: 7, requestUid: active.uid,
    activeScope: active, requestedPaths: [path], returnedPaths: [path],
  };
  assert.equal(acceptHrShadowFetch(base), true);
  assert.equal(acceptHrShadowFetch({ ...base, returnedPaths: [path, own("uid-b", "documents")] }), false);
  assert.equal(acceptHrShadowFetch({ ...base, deniedPaths: [shared("documents")] }), false);
  assert.equal(acceptHrShadowFetch({ ...base, requestEpoch: -1 }), false);
});

test("a readable shard containing a different employee's record fails closed", () => {
  const poisoned = new Map(docs);
  poisoned.set(own("uid-a", "documents"), {
    items: [{ id: "bad-owner", userId: "uid-b", marker: "SPOOFED_OWNER" }],
  });
  assert.equal(assembleAuthorizedHrShadowSnapshot(
    scope("uid-a", "Sales Representative"), poisoned,
  ), null);
});
