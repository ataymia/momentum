import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import test from "node:test";
import {
  collectAuditableRecords,
  diffAuditableRecords,
  mergeAuditSnapshots,
} from "../lib/audit-engine";

/**
 * Synthetic audit hot-path timing, not a production page-load benchmark.
 * Compares rebuilding every unrelated domain with reusing stable snapshots.
 */
test("measure audit recomputation with overlapping field activity", () => {
  const modules = Array.from({length: 8}, (_, index) => ({
    label: "Module" + index,
    state: {
      records: Array.from({length: 250}, (_, i) => ({
        id: `record-${index}-${i}`,
        accountId: "account-" + i,
        status: "Stable",
        note: "Already persisted",
      })),
    },
  }));
  const cached = modules.map(({label, state}) =>
    collectAuditableRecords(label, state));
  const baseline = mergeAuditSnapshots(...cached);
  const iterations = 20;
  const time = (work: () => void) => {
    const started = performance.now();
    for (let i = 0; i < iterations; i++) work();
    return Math.round((performance.now() - started) * 100) / 100;
  };
  const legacyMs = time(() => {
    const rebuilt = modules.map(({label, state}) =>
      collectAuditableRecords(label, state));
    const next = mergeAuditSnapshots(...rebuilt);
    assert.deepEqual(
      diffAuditableRecords(baseline, next, {id: "system", role: "System"}),
      [],
    );
  });
  const optimizedMs = time(() => {
    const next = mergeAuditSnapshots(...cached);
    assert.deepEqual(
      diffAuditableRecords(baseline, next, {id: "system", role: "System"}),
      [],
    );
  });
  console.log(JSON.stringify({
    benchmark: "synthetic-audit-recomputation",
    records: 2000,
    iterations,
    beforeMs: legacyMs,
    afterMs: optimizedMs,
    environment: "GitHub Actions CI; no concurrent employees or live Firestore",
  }));
});
