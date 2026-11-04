import test from "node:test";
import assert from "node:assert/strict";
import { createHcmSeed } from "../lib/hcm-engine";
import {
  executeHrDecisionReview, type HrDecisionIntent, type HrDecisionStoreRecord,
  type HrDecisionTransaction, type HrDecisionTransactionRunner,
} from "../lib/hr-request-trusted-transaction";
import type { HrDecisionReceipt } from "../lib/hr-request-server-contract";
import type { UserAccessRecord } from "../lib/firebase-access";
import type { WorkspaceData, WorkspaceUser } from "../lib/types";

const timestamp = "2026-11-04T17:00:00.000Z";
const person = (id: string, role: WorkspaceUser["role"]): WorkspaceUser =>
  ({ id, role, name: id, email: id + "@example.test", title: "Synthetic",
    team: "Sales", initials: "TT", accent: "#123456",
    employmentStatus: "Active" } as WorkspaceUser);
const admin = person("admin", "Administrator");
const rep = person("rep", "Sales Representative");
const other = person("other", "Sales Representative");
const directory = [admin, rep, other];
const access = (p: WorkspaceUser, accountState: UserAccessRecord["accountState"] = "Active"): UserAccessRecord =>
  ({ uid: p.id, email: p.email, role: p.role, team: p.team,
    accountState, updatedAt: timestamp, updatedBy: "synthetic" });
const intent = (changes: Partial<HrDecisionIntent> = {}): HrDecisionIntent => ({
  commandId: "decision-one", kind: "leave", requestId: "leave-one",
  decision: "Approved", note: "", expectedRevision: 7, ...changes,
});

class SyntheticSerializableStore implements HrDecisionTransactionRunner {
  directory = [...directory];
  accessRecords = new Map(directory.map((p) => [p.id, access(p)]));
  state: HrDecisionStoreRecord;
  receipts = new Map<string, HrDecisionReceipt>();
  writes = 0;
  hcmReads = 0;
  actorReads = 0;
  attempts = 0;
  beforeRetry?: () => void;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    const hcm = createHcmSeed({ users: directory } as WorkspaceData);
    hcm.leaveRequests = [{
      id: "leave-one", userId: "rep", policyId: "pto",
      startDate: "2026-11-10", endDate: "2026-11-10",
      requestedHours: 8, reason: "Synthetic", submittedAt: timestamp, status: "Submitted",
    }];
    hcm.ptoPolicies = [{
      id: "pto", name: "Synthetic", active: true, method: "Manual",
      accrualHoursPerPayPeriod: 0, frontLoadHours: 0, waitingDays: 0,
      minimumRequestHours: 1, effectiveDate: "2026-01-01",
    }];
    hcm.ptoLedger = [{
      id: "credit", userId: "rep", policyId: "pto", date: "2026-11-01",
      type: "Adjustment", hours: 12, note: "Synthetic", createdBy: "admin", createdAt: timestamp,
    }];
    this.state = { hcm, revision: 7 };
  }

  async run<T>(callback: (tx: HrDecisionTransaction) => Promise<T>): Promise<T> {
    // Serialized in-memory transactions characterize adapter behavior only.
    // The separate Firestore emulator test validates database conflict handling.
    let unlock!: () => void;
    const next = new Promise<void>((resolve) => { unlock = resolve; });
    const previous = this.queue;
    this.queue = previous.then(() => next);
    await previous;
    try {
      const attempt = async (commit: boolean) => {
        this.attempts++;
        let pendingState: HrDecisionStoreRecord | undefined;
        let pendingReceipt: { key: string; value: HrDecisionReceipt } | undefined;
        const tx: HrDecisionTransaction = {
          readAccess: async (uid) => {
            this.actorReads++;
            return this.accessRecords.get(uid) ?? null;
          },
          readDirectory: async () => [...this.directory],
          readHcm: async () => {
            this.hcmReads++;
            return this.state;
          },
          readReceipt: async (key) => this.receipts.get(key) ?? null,
          replaceHcm: (value) => { pendingState = value; },
          createReceipt: (key, value) => { pendingReceipt = { key, value }; },
        };
        const result = await callback(tx);
        assert.equal(Boolean(pendingState), Boolean(pendingReceipt), "partial commit forbidden");
        if (commit && pendingState && pendingReceipt) {
          assert.equal(this.receipts.has(pendingReceipt.key), false, "create-only receipt");
          this.state = pendingState;
          this.receipts.set(pendingReceipt.key, pendingReceipt.value);
          this.writes++;
        }
        return result;
      };
      if (this.beforeRetry) {
        await attempt(false); // simulate a transaction conflict with no commit
        this.beforeRetry();
      }
      return await attempt(true);
    } finally {
      unlock();
    }
  }
}

function execute(store: SyntheticSerializableStore, changes: Partial<HrDecisionIntent> = {},
  opts: { enabled?: boolean; uid?: string | null; clock?: string } = {}) {
  return executeHrDecisionReview(intent(changes), {
    enabled: opts.enabled ?? true,
    verifiedUid: async () => opts.uid === undefined ? "admin" : opts.uid,
    serverNow: () => opts.clock ?? timestamp,
    runner: store,
  });
}

test("default-disabled gate never authenticates, reads or writes", async () => {
  const store = new SyntheticSerializableStore();
  let authenticated = false;
  const result = await executeHrDecisionReview(intent(), {
    verifiedUid: async () => { authenticated = true; return "admin"; },
    serverNow: () => timestamp, runner: store,
  });
  assert.equal(result.ok, false);
  assert.equal(authenticated, false);
  assert.equal(store.attempts, 0);
  assert.equal(store.writes, 0);
});

test("trusted transaction atomically updates request, PTO, audit, revision and receipt", async () => {
  const store = new SyntheticSerializableStore();
  const beforeAudit = store.state.hcm.audit.length;
  const result = await execute(store);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(store.writes, 1);
  assert.equal(store.state.revision, 8);
  assert.equal(store.state.hcm.leaveRequests[0].status, "Approved");
  assert.equal(store.state.hcm.ptoLedger.filter((p) => p.requestId === "leave-one").length, 1);
  assert.equal(store.state.hcm.ptoLedger.find((p) => p.requestId === "leave-one")?.hours, -8);
  assert.equal(store.state.hcm.audit.length, beforeAudit + 1);
  assert.equal(store.state.hcm.audit[0].id, "hr-decision-decision-one");
  assert.equal(store.receipts.get("leave:leave-one")?.commandId, "decision-one");
  assert.equal(result.receipt.decidedAt, timestamp);
  assert.equal(await execute(store, { commandId: "decision-two", expectedRevision: 8 }).then((r) => r.ok), false);
  assert.equal(store.writes, 1);
});

test("concurrent approval and replay produce only one atomic decision", async () => {
  const store = new SyntheticSerializableStore();
  const outcomes = await Promise.all([
    execute(store, { commandId: "decision-a" }),
    execute(store, { commandId: "decision-b" }),
  ]);
  assert.deepEqual(outcomes.map((r) => r.ok).sort(), [false, true]);
  assert.equal(store.writes, 1);
  assert.equal(store.receipts.size, 1);
  assert.equal(store.state.hcm.ptoLedger.filter((p) => p.requestId === "leave-one").length, 1);
});

test("a transaction retry re-reads revoked Administrator authority before HCM", async () => {
  const store = new SyntheticSerializableStore();
  store.beforeRetry = () => {
    store.accessRecords.set("admin", access(admin, "Suspended"));
  };
  const result = await execute(store);
  assert.equal(result.ok, false);
  assert.equal(store.attempts, 2);
  assert.equal(store.hcmReads, 1, "revoked retry must not read confidential HCM");
  assert.equal(store.writes, 0);
  assert.equal(store.state.hcm.leaveRequests[0].status, "Submitted");
});

test("unverified, downgraded and separated actors never read HCM", async () => {
  for (const actor of ["unverified", "manager", "separated"] as const) {
    const store = new SyntheticSerializableStore();
    if (actor === "manager") store.accessRecords.set("admin", access(person("admin", "Sales Manager")));
    if (actor === "separated") store.directory = [{ ...admin, employmentStatus: "Separated" }, rep, other];
    const result = await execute(store, {}, { uid: actor === "unverified" ? null : "admin" });
    assert.equal(result.ok, false);
    assert.equal(store.hcmReads, 0);
    assert.equal(store.writes, 0);
  }
});

test("target permission revocation, stale revisions and insufficient PTO are atomic denials", async () => {
  const cases: Array<(s: SyntheticSerializableStore) => void> = [
    (s) => { s.accessRecords.set("rep", access(rep, "Suspended")); },
    (s) => { s.state.revision = 8; },
    (s) => { s.state.hcm.ptoLedger = []; },
    (s) => { s.state.hcm.leaveRequests.push({ ...s.state.hcm.leaveRequests[0] }); },
  ];
  for (const change of cases) {
    const store = new SyntheticSerializableStore();
    change(store);
    const result = await execute(store);
    assert.equal(result.ok, false);
    assert.equal(store.writes, 0);
    assert.equal(store.receipts.size, 0);
    assert.equal(store.state.hcm.audit.length, 0);
  }
});

test("server-generated timestamp is required and browser cannot choose it", async () => {
  const store = new SyntheticSerializableStore();
  const result = await execute(store, {}, { clock: "not-an-iso-timestamp" });
  assert.equal(result.ok, false);
  assert.equal(store.writes, 0);
});
