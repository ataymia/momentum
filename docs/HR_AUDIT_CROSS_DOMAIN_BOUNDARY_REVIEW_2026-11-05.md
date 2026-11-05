# HR cross-domain audit source boundary (review only)
November 5, 2026, 06:22 Phoenix. Task 01. Child of PR #143.

## Finding and implementation
The chunked `userDomains/{actor}/audit/events` source and historical
`userDomains/{actor}/hcm/audit` actor field are **different physical
sources**. The prior next-step proposal to bind them at "the same historical
snapshot" cannot be fulfilled by comparing their Firestore updateTime strings:
different documents have independent versions, and the chunk verifier only
checks caller-declared evidence. A passing chunk scan does not prove the
subject-specific receipt source was the same historical event stream.

`lib/hr-audit-cross-domain-boundary-review.ts` composes the actual
chunk-source and subject-receipt batch classifiers and rejects partial shards,
missing/altered receipts, inconsistent declared event IDs, reviewer, evidence,
review time, actor and inventory version. Even when both independently pass,
the only positive label is `separate-sources-reviewed`, explicitly paired
with `distinct-sources-not-linked`. It **never** authorizes append, replay,
migration, deactivation, or any live read/write; it **never** reports that a
single historical snapshot has been verified. The caller-supplied attestation
is not authenticated by this module.

`tests/hr-audit-cross-domain-boundary-review.test.ts` adds nine synthetic
regressions for the domain mismatch, partial chunk, missing shard, missing
receipt, mismatched event set, review provenance, tampering, malformed inputs,
read-only purity and private-output hygiene. `package.json` registers the
suite in mandatory logic CI. No production rules, endpoint, secrets or
employee data are involved.

## Explicit outstanding engineering gate
A trustworthy bridge would require independently authenticated provenance
mapping **each** legacy HCM event to its chunked counterpart (or explicit
evidence that the two streams are unrelated), with content digests and a
transactionally pinned inventory on each source, plus approved HR authority
and backup restore evidence. Equal caller-declared event IDs alone do not
prove equivalence. Do not turn this boundary guard into a migration executor.

## Verification / handoff
Built on isolated review child; full exact-final-SHA GitHub Actions CI
pending. TypeScript, lint, logic, Firestore/Storage emulators, actual Admin
Auth/Firestore integration, Functions, Next build and integrity required.
Visual/Staging QA Needed: YES. Blocked External: approved HR reviewer and
retention policy, independent history inventory and backup restore, older
client compatibility, approved staging. User Accepted: NO. Released: NO.

Platform engineering owns code and tests. HR/security reviewer owns provenance,
authority and restore evidence. Mia owns separate staging/release signoff.
No approved deadline, measured KPI, financial result or external action.
00 Director Command Center MASTER was not directly accessed or modified.

**Next unblocked action:** add a synthetic per-event digest provenance mapping
test that refuses to link two distinct source streams on matching IDs alone.
