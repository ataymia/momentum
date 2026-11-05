import assert from "node:assert/strict";
import test from "node:test";
import {
  assessHrActorAuditReconciliation,
  fingerprintHrAuditEvent,
  type HrAuditSnapshot,
  type HrAuditSubjectDecision,
} from "../lib/hr-actor-audit-reconciliation-review";
import { userDocPath } from "../lib/firestore-domains";

const actor = "uid-admin";
const subject = "uid-alex";
const reviewer = "uid-reviewer";
const sourcePath = userDocPath(actor, "hcm", "audit");
const targetPath = "hrAuditReview/uid-alex/events/audit-1";
const event = () => ({
  id: "audit-1", at: "2026-10-06T19:45:00.000Z", actorId: actor,
  action: "Compensation correction", entityType: "CompensationRecord",
  entityId: "comp-1", before: "PRIVATE old rate", after: "PRIVATE new rate",
  reason: "PRIVATE employee note",
});
const source = (items: unknown[] = [event()], version = "source@1"): HrAuditSnapshot =>
  ({ path: sourcePath, version, data: { items } });
const target = (data: Record<string, unknown> | null = null,
  version: string | null = null): HrAuditSnapshot =>
  ({ path: targetPath, version, data });
const decision = (changes: Partial<HrAuditSubjectDecision> = {}): HrAuditSubjectDecision => ({
  sourcePath, eventId: "audit-1", eventDigest: fingerprintHrAuditEvent(event()),
  subjectUid: subject, reviewerUid: reviewer,
  reviewedAt: "2026-11-04T20:00:00.000Z", evidenceRef: "review:case-1",
  classification: "single-subject", ...changes,
});
const fixture = () => {
  const baseline = [source(), target()];
  return {
    actorUids: [actor],
    knownSubjectUids: new Set([subject]),
    authorizedReviewerUids: new Set([reviewer]),
    baseline, current: structuredClone(baseline),
    decisions: [decision()],
  };
};
type Input = ReturnType<typeof fixture>;
const check = (changes: Partial<Input> = {}) =>
  assessHrActorAuditReconciliation({ ...fixture(), ...changes });

test("explicit reviewed subject yields append-only metadata with source/target CAS", () => {
  const report = check();
  assert.equal(report.status, "ready-for-human-review");
  assert.equal(report.sourceCount, 1);
  assert.equal(report.alreadyPresent, 0);
  assert.deepEqual(report.issues, []);
  assert.deepEqual(report.candidates, [{
    sourcePath, sourceIndex: 0, eventId: "audit-1",
    eventDigest: fingerprintHrAuditEvent(event()),
    destinationPath: targetPath, expectedTargetVersion: null,
  }]);
  assert.deepEqual(report.preconditions, [
    { path: targetPath, expectedVersion: null },
    { path: sourcePath, expectedVersion: "source@1" },
  ].sort((a, b) => a.path.localeCompare(b.path)));
  assert.equal((report as unknown as Record<string, unknown>).apply, undefined);
  assert.equal((report as unknown as Record<string, unknown>).write, undefined);
  const serialized = JSON.stringify(report);
  for (const secret of ["PRIVATE old rate", "PRIVATE new rate", "PRIVATE employee note"]) {
    assert.ok(!serialized.includes(secret), "report must never serialize audit contents");
  }
});

test("actor and subject are distinct; no subject inferred from actor or entityId", () => {
  assert.equal(check({ decisions: [] }).status, "blocked");
  assert.ok(check({ decisions: [] }).issues.includes("missing-decision"));
  assert.equal(check({ decisions: [decision({ subjectUid: actor })] }).status, "blocked");
  assert.ok(check({ decisions: [decision({ subjectUid: actor })] }).issues.includes("invalid-decision"));
});

test("multi-subject and unresolved history are quarantined, never silently split", () => {
  for (const classification of ["multi-subject", "unresolved"] as const) {
    const result = check({ decisions: [decision({ classification })] });
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.candidates, []);
    assert.ok(result.issues.includes("unresolved-subject"));
  }
});

test("actor-shard mismatch and malformed event IDs/timestamps fail closed", () => {
  for (const changed of [
    { ...event(), actorId: "uid-alex" },
    { ...event(), id: "../escape" },
    { ...event(), at: "not-a-time" },
    { ...event(), entityType: "" },
  ]) {
    const report = check({ baseline: [source([changed]), target()],
      current: [source([changed]), target()] });
    assert.equal(report.status, "blocked");
    assert.equal(report.candidates.length, 0);
    assert.ok(report.issues.some((reason) =>
      reason === "actor-mismatch" || reason === "invalid-event"));
  }
});

test("tampered digest, unknown reviewer and self-certifying actor are rejected", () => {
  const cases: [HrAuditSubjectDecision, string][] = [
    [decision({ eventDigest: "0".repeat(64) }), "invalid-decision"],
    [decision({ reviewerUid: "unknown" }), "unapproved-reviewer"],
    [decision({ reviewerUid: actor }), "unapproved-reviewer"],
    [decision({ evidenceRef: "../bad space" }), "invalid-decision"],
    [decision({ reviewedAt: "tomorrow" }), "invalid-decision"],
  ];
  for (const [review, issue] of cases) {
    const result = check({ decisions: [review] });
    assert.ok(result.issues.includes(issue as never));
    assert.equal(result.candidates.length, 0);
  }
});

test("duplicate or unaccounted-for reviewer decisions block the entire batch", () => {
  for (const decisions of [
    [decision(), decision()],
    [decision(), decision({ eventId: "not-in-source" })],
  ]) {
    const result = check({ decisions });
    assert.equal(result.status, "blocked");
    assert.ok(result.issues.includes("invalid-decision"));
  }
});

test("source duplicate IDs cannot be copied even if first copy was eligible", () => {
  const records = [event(), { ...event(), actorId: actor, after: "changed" }];
  const report = check({ baseline: [source(records), target()],
    current: [source(records), target()] });
  assert.ok(report.issues.includes("duplicate-event"));
  assert.deepEqual(report.candidates, []);
});

test("missing target inventory never implies verified absence", () => {
  const report = check({ baseline: [source()], current: [source()] });
  assert.ok(report.issues.includes("incomplete-inventory"));
  assert.deepEqual(report.preconditions, []);
});

test("changed source or target after review requires a new inventory", () => {
  const cases: HrAuditSnapshot[][] = [
    [source([event()], "source@2"), target()],
    [source(), target({ event: event() }, "target@2")],
    [source([{ ...event(), after: "changed" }]), target()],
  ];
  for (const current of cases) {
    const report = check({ current });
    assert.ok(report.issues.includes("stale-snapshot"));
    assert.deepEqual(report.candidates, []);
  }
});

test("malformed, duplicated, extra or absent inventory fails closed", () => {
  const initial = fixture();
  const cases = [
    [...initial.baseline, initial.baseline[0]],
    [...initial.baseline, { path: "other/path", version: null, data: null }],
    [{ ...initial.baseline[0], version: null }, initial.baseline[1]],
  ];
  for (const baseline of cases) {
    const report = check({ baseline, current: structuredClone(baseline) });
    assert.equal(report.status, "blocked");
    assert.equal(report.candidates.length, 0);
  }
});

test("existing exact immutable event and provenance is recognized as replay", () => {
  const receipt = {
    event: event(),
    provenance: {
      sourcePath, sourceVersion: "source@1",
      eventDigest: fingerprintHrAuditEvent(event()),
      subjectUid: subject, reviewerUid: reviewer,
      reviewedAt: decision().reviewedAt, evidenceRef: decision().evidenceRef,
    },
  };
  const baseline = [source(), target(receipt, "receipt@1")];
  const result = check({ baseline, current: structuredClone(baseline) });
  assert.equal(result.status, "ready-for-human-review");
  assert.equal(result.alreadyPresent, 1);
  assert.deepEqual(result.candidates, []);
});

test("existing target conflicts never overwrite historical evidence", () => {
  const receipt = {
    event: { ...event(), before: "forged" },
    provenance: {
      sourcePath, sourceVersion: "source@1",
      eventDigest: fingerprintHrAuditEvent(event()),
      subjectUid: subject, reviewerUid: reviewer,
      reviewedAt: decision().reviewedAt, evidenceRef: decision().evidenceRef,
    },
  };
  const baseline = [source(), target(receipt, "receipt@1")];
  const result = check({ baseline, current: structuredClone(baseline) });
  assert.ok(result.issues.includes("target-conflict"));
  assert.deepEqual(result.candidates, []);
});

test("unknown actors, duplicate actor inventory and zero-source inventory are blocked", () => {
  for (const actorUids of [[], [actor, actor], ["bad/uid"]]) {
    const result = check({ actorUids });
    assert.equal(result.status, "blocked");
    assert.ok(result.issues.includes("invalid-inventory"));
  }
});

test("two independently reviewed employees retain original actor and separate destinations", () => {
  const second = { ...event(), id: "audit-2", entityId: "comp-2" };
  const secondTarget = "hrAuditReview/uid-jordan/events/audit-2";
  const secondDecision = decision({
    eventId: "audit-2", subjectUid: "uid-jordan",
    eventDigest: fingerprintHrAuditEvent(second), evidenceRef: "review:case-2",
  });
  const baseline = [source([event(), second]), target(),
    { path: secondTarget, version: null, data: null }];
  const report = check({
    knownSubjectUids: new Set([subject, "uid-jordan"]),
    decisions: [decision(), secondDecision],
    baseline, current: structuredClone(baseline),
  });
  assert.equal(report.status, "ready-for-human-review");
  assert.deepEqual(report.candidates.map((item) => item.destinationPath),
    [targetPath, secondTarget]);
  assert.equal(report.sourceCount, 2);
});
