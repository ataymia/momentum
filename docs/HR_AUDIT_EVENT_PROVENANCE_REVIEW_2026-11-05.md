# HR per-event audit content provenance review (NOT LIVE)
November 5, 2026, 07:20 Phoenix. Task 01, child of draft PR #144.

## Actual increment
`lib/hr-audit-event-provenance-review.ts` evaluates a caller-declared
one-to-one event mapping across the distinct `audit/events` chunk domain
and the historical `hcm/audit` receipt domain. It first requires the
existing fail-closed source and receipt classifiers to pass, then
independently hashes each actual source event and preserved subject event.
Matching event IDs, matching user-provided digest strings, matching review
metadata, or matching Firestore document versions are **not enough**.

All declared source events must have exactly one corresponding receipt and
one mapping; missing or duplicated events, changed bytes, stale source
versions, conflicting digests and inconsistent reviewer evidence quarantine
the whole candidate. Twelve synthetic regression cases exercise these gates.
The result contains only fixed classifications, never employee records,
identifiers, reviewer references or private payloads.

## Explicit limits
A positive classification is **content-matched-unattested**. It is not
`verified`, not a claim that the two independent documents were read
atomically, and not evidence that the caller supplied an authentic or
complete historical inventory. The existing source inventory's
`independentlyVerified` field is an unchecked caller assertion. SHA-256
event content fingerprints detect changed bytes but do not authenticate
the person who approved the mapping or establish a historical origin.
No write path, replay permission, migration, endpoint or deployed rules
are added. `safeToAppend`, `safeToReplayWithoutWrite`,
`independentlyAuthenticated`, and `sameHistoricalSnapshotVerified`
remain false, even when all content matches.

## Verification and next gate
The suite is registered in mandatory `npm run test:logic`. Full
TypeScript, lint, logic, Firestore and Storage rules/emulators,
Firebase Admin Auth/Firestore integration, Functions, Next build and
repository integrity must pass at the exact final commit before claiming
AUTOMATED-VERIFIED. No browser or staging role acceptance has been done.

Before any real migration, a trusted server must obtain independently
authenticated inventories, verified reviewer decisions, and a documented
source-to-source provenance chain, with pinned transactional reads and
independent backup restoration. The HR/security reviewer must approve
confidentiality/retention and Mia must separately approve staging/release.
No real employee data, production permissions, payments, payroll,
orders, inventory, messages, GPS or deployment were touched.

Next unblocked increment: add synthetic Firestore Admin read-only
integration tests that prove cross-domain digest comparisons fail closed
when one source changes between independent reads.
