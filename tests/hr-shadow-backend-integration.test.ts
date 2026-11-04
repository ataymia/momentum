import assert from "node:assert/strict";
import test from "node:test";
import type { PersistenceScope } from "../lib/firebase-access";
import type { FirestoreSnapshot } from "../lib/firebase-firestore-rest";
import { metaVersionKey } from "../lib/firestore-domains";
import { FirestoreBackend } from "../lib/persistence";

const HCM = "momentum-hcm-v4";
const own = (uid: string) => `userDomains/${uid}/hcm/documents`;
const scope = (
  uid: string,
  role: PersistenceScope["role"] = "Sales Representative",
  reports: string[] = [],
  state: PersistenceScope["accountState"] = "Active",
): PersistenceScope => ({
  uid, role, accountState: state,
  readableUserIds: new Set([uid, ...reports]),
  managedUserIds: new Set(reports),
  supervisedBrandAmbassadorIds: new Set(),
});
const employeeDoc = (uid: string, marker: string) => ({
  items: [{ id: marker, userId: uid, marker }],
});
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/**
 * Deterministic, in-memory REST read stand-in. Captures the response at request
 * initiation, so delayed completion really returns OLD server data. No fetch,
 * Firebase project, credentials, browser, writes, or production records.
 */
class SyntheticReads {
  private records = new Map<string, FirestoreSnapshot>();
  private pauseBatch: ((paths: string[]) => Promise<void>) | undefined;
  private pauseSingle: ((path: string) => Promise<void>) | undefined;
  calls: string[][] = [];
  singleCalls: string[] = [];

  put(path: string, data: Record<string, unknown> | null, denied = false) {
    this.records.set(path, {
      path, data, exists: data !== null, updateTime: "synthetic-v1",
      ...(denied ? { denied: true } : {}),
    });
  }
  snapshot(path: string): FirestoreSnapshot {
    const record = this.records.get(path);
    return record
      ? { ...record, data: record.data === null ? null : structuredClone(record.data) }
      : { path, exists: false, data: null };
  }
  pauseNextBatch(match: (paths: string[]) => boolean) {
    const entered = deferred(), resume = deferred();
    this.pauseBatch = async (paths) => {
      if (!match(paths)) return;
      this.pauseBatch = undefined;
      entered.release();
      await resume.promise;
    };
    return { entered: entered.promise, resume: resume.release };
  }
  pauseNextSingle(match: (path: string) => boolean) {
    const entered = deferred(), resume = deferred();
    this.pauseSingle = async (path) => {
      if (!match(path)) return;
      this.pauseSingle = undefined;
      entered.release();
      await resume.promise;
    };
    return { entered: entered.promise, resume: resume.release };
  }
  readonly transport = {
    getSnapshots: async (paths: string[]): Promise<FirestoreSnapshot[]> => {
      this.calls.push([...paths]);
      const response = paths.map((path) => this.snapshot(path));
      await this.pauseBatch?.(paths);
      return response;
    },
    getSnapshot: async (path: string): Promise<FirestoreSnapshot> => {
      this.singleCalls.push(path);
      const response = this.snapshot(path);
      await this.pauseSingle?.(path);
      return response;
    },
  };
}
const makeBackend = (reads: SyntheticReads, current: PersistenceScope) =>
  new FirestoreBackend({
    scope: current, onDirectoryChange: () => {}, pollIntervalMs: 100_000,
    hrShadowReview: true, testOnlyReadTransport: reads.transport,
  });
const hasMarker = (value: string | null, marker: string) =>
  Boolean(value?.includes(`"marker":"${marker}"`));

test("test read transport cannot be attached to ordinary production-mode persistence", () => {
  const reads = new SyntheticReads();
  assert.throws(() => new FirestoreBackend({
    scope: scope("synthetic-a"), onDirectoryChange: () => {},
    testOnlyReadTransport: reads.transport,
  }), /require HR shadow review/);
});

test("actual FirestoreBackend primes an authorized HCM shard with synthetic REST reads", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "own-prime"));
  const backend = makeBackend(reads, scope("synthetic-a"));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(HCM), "own-prime"), true);
    assert.ok(reads.calls.some((paths) => paths.includes(own("synthetic-a"))));
    assert.equal((await backend.refreshKeys([HCM])).ok, false, "shadow HR refresh is not activated");
    backend.setItem(HCM, JSON.stringify({ documents: [{ marker: "never-saved" }] }));
    await backend.flush();
    assert.equal(hasMarker(backend.getItem(HCM), "never-saved"), false);
  } finally { backend.dispose(); }
});

test("a role downgrade invalidates real backend HCM cache before delayed old-scope batch returns", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-report"), employeeDoc("synthetic-report", "report-secret"));
  reads.put(own("synthetic-manager"), employeeDoc("synthetic-manager", "manager-own"));
  const backend = makeBackend(reads, scope("synthetic-manager", "Sales Manager", ["synthetic-report"]));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(HCM), "report-secret"), true);
    const pause = reads.pauseNextBatch((paths) => paths.includes(own("synthetic-new-report")));
    const oldUpdate = backend.updateScope(scope("synthetic-manager", "Sales Manager", ["synthetic-new-report"]));
    await pause.entered;
    assert.equal(hasMarker(backend.getItem(HCM), "report-secret"), false);
    await backend.updateScope(scope("synthetic-manager", "Sales Manager"));
    pause.resume();
    await oldUpdate;
    assert.equal(hasMarker(backend.getItem(HCM), "report-secret"), false);
    assert.equal(hasMarker(backend.getItem(HCM), "new-report-secret"), false);
  } finally { backend.dispose(); }
});

test("cross-UID session transition disposes backend and cannot reveal old employee HCM", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "first-user"));
  const backend = makeBackend(reads, scope("synthetic-a"));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(HCM), "first-user"), true);
    await backend.updateScope(scope("synthetic-b"));
    assert.equal(backend.getItem(HCM), null);
    assert.equal((await backend.refreshKeys([HCM])).ok, false);
    backend.setItem(HCM, JSON.stringify({ documents: [{ marker: "forbidden" }] }));
    assert.equal(backend.getItem(HCM), null);
  } finally { backend.dispose(); }
});

test("an in-flight platform-meta poll cannot rehydrate a revoked employee session", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "pre-revoke"));
  reads.put("platform/meta", { versions: {} });
  const backend = makeBackend(reads, scope("synthetic-a"));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(HCM), "pre-revoke"), true);
    reads.put("platform/meta", { versions: { [metaVersionKey(own("synthetic-a"))]: "v2" } });
    const pause = reads.pauseNextSingle((path) => path === "platform/meta");
    const oldPoll = backend.poll();
    await pause.entered;
    await backend.updateScope(scope("synthetic-a", "Sales Representative", [], "Suspended"));
    assert.equal(backend.getItem(HCM), null);
    pause.resume();
    await oldPoll;
    assert.equal(backend.getItem(HCM), null);
    assert.equal(reads.singleCalls.length, 1);
  } finally { backend.dispose(); }
});

test("changed HR meta version invalidates HCM instead of displaying stale records", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "old-version"));
  reads.put("platform/meta", { versions: {} });
  const backend = makeBackend(reads, scope("synthetic-a"));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(HCM), "old-version"), true);
    reads.put("platform/meta", { versions: { [metaVersionKey(own("synthetic-a"))]: "new-version" } });
    await backend.poll();
    assert.equal(backend.getItem(HCM), null);
    await backend.poll();
    assert.equal(backend.getItem(HCM), null, "denied review epoch does not auto-rehydrate");
  } finally { backend.dispose(); }
});

test("denied HCM shard is quarantined by actual prime read, never interpreted as empty success", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "denied-record"), true);
  const backend = makeBackend(reads, scope("synthetic-a"));
  try {
    await backend.prime();
    assert.equal(backend.getItem(HCM), null);
    assert.equal((await backend.refreshKeys([HCM])).ok, false);
  } finally { backend.dispose(); }
});

const AUDIT = "momentum-audit-v1";
const auditManifestPath = "userDomains/synthetic-actor/audit/events";
const auditChunkPath = "userDomains/synthetic-actor/audit/events__chunk_000000";
const auditManifest = { shardManifestVersion: 1, shards: ["events__chunk_000000"], itemCount: 1 };
const auditChunk = (actorId: string, marker: string) =>
  ({ items: [{ id: marker, actorId, marker }] });

test("review backend hydrates a complete owner-verified audit chunk", async () => {
  const reads = new SyntheticReads();
  reads.put(auditManifestPath, auditManifest);
  reads.put(auditChunkPath, auditChunk("synthetic-actor", "complete-audit"));
  const backend = makeBackend(reads, scope("synthetic-actor", "Administrator"));
  try {
    await backend.prime();
    assert.equal(hasMarker(backend.getItem(AUDIT), "complete-audit"), true);
    assert.ok(reads.calls.some((paths) => paths.includes(auditChunkPath)));
  } finally { backend.dispose(); }
});

test("review backend quarantines denied, missing and cross-owned chunk manifests without partial audit history", async () => {
  for (const scenario of ["denied", "missing", "wrong-owner"] as const) {
    const reads = new SyntheticReads();
    reads.put(auditManifestPath, auditManifest);
    if (scenario !== "missing") reads.put(auditChunkPath,
      auditChunk(scenario === "wrong-owner" ? "synthetic-other" : "synthetic-actor", scenario),
      scenario === "denied");
    const backend = makeBackend(reads, scope("synthetic-actor", "Administrator"));
    try {
      await backend.prime();
      assert.equal(backend.getItem(AUDIT), null, scenario);
      assert.equal(hasMarker(backend.getItem(AUDIT), scenario), false);
    } finally { backend.dispose(); }
  }
});

test("delayed chunk hydration from a previous authority epoch cannot enter review backend cache", async () => {
  const reads = new SyntheticReads();
  reads.put(auditManifestPath, auditManifest);
  reads.put(auditChunkPath, auditChunk("synthetic-actor", "revoked-audit"));
  const backend = makeBackend(reads, scope("synthetic-actor", "Administrator"));
  const pause = reads.pauseNextBatch((paths) => paths.includes(auditChunkPath));
  try {
    const oldPrime = backend.prime();
    await pause.entered;
    await backend.updateScope(scope("synthetic-actor", "Sales Representative"));
    pause.resume();
    await oldPrime;
    assert.equal(backend.getItem(AUDIT), null);
    assert.equal(hasMarker(backend.getItem(AUDIT), "revoked-audit"), false);
  } finally { pause.resume(); backend.dispose(); }
});

test("suspension during initial HCM prime rejects the delayed pre-revocation batch", async () => {
  const reads = new SyntheticReads();
  reads.put(own("synthetic-a"), employeeDoc("synthetic-a", "pre-suspension"));
  const backend = makeBackend(reads, scope("synthetic-a"));
  const pause = reads.pauseNextBatch((paths) => paths.includes(own("synthetic-a")));
  try {
    const oldPrime = backend.prime();
    await pause.entered;
    await backend.updateScope(scope("synthetic-a", "Sales Representative", [], "Suspended"));
    pause.resume();
    await oldPrime;
    assert.equal(backend.getItem(HCM), null);
  } finally { pause.resume(); backend.dispose(); }
});
