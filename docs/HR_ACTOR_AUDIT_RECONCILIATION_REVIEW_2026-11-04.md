# HR actor-audit subject reconciliation (review-only)
November 4, 2026, 22:23 Phoenix. Task 01. No live migration or rule deployment.

## Why this exists
The canonical HCM `HcmAuditEvent` has `id, at, actorId, action, entityType, entityId, before, after, reason`. The existing `userDomains/{actorUid}/hcm/audit` shard is keyed by **who performed the action**, not necessarily the employee whose confidential history is described. An actor-owned document may therefore contain another employee's sensitive before/after history. Existing browser access to that shard is too broad. The current `lib/hr-legacy-migration-plan.ts` correctly excludes `audit` from ordinary owner migration.

## New contract
`lib/hr-actor-audit-reconciliation-review.ts` is a pure, Node-only, no-I/O planner. It accepts a complete, independently inventoried versioned source and destination snapshot, a second current snapshot, authorized reviewer identities and an explicit event-by-event human decision bound to the SHA-256 fingerprint of the **whole event**. The reviewer must be independently authorized and must not be the actor whose shard is being reviewed. This policy is deliberately conservative; HR/security may require stronger dual control.

A single, unambiguous subject is required. Missing, unknown, conflicting or multi-subject mappings are quarantined. The planner never guesses a subject from actor, entity ID, manager, pay fields or before/after. It does not delete or alter source history, manufacture signatures or certify human decisions. Its output contains only candidate metadata and source/target version preconditions, not event contents. It is **all-or-nothing** when any source, decision, destination or version is unresolved.

The proposed isolated `hrAuditReview/{subjectUid}/events/{eventId}` path is a **synthetic design**, not an approved production schema. For each new event, target absence must be explicitly inventoried. For an existing event, exact event and provenance equality permits replay without any write; differences block rather than overwrite. The planner returns no `apply`, `write` or `delete` capability.

## Future trusted executor requirements (NOT IMPLEMENTED)
1. Approve actual storage/retention schema and field-level read policy with HR/security. Keep browser writes to append-only history denied, including Administrator browser writes; only a reviewed server command may append. Consider per-subject multiple events and separate restricted cross-subject audit views.
2. In a single trusted transaction, verify Admin token/session and role, independent reviewer authority and evidence, the immutable original actor/event, source version and full fingerprint, and destination absence or exact replay. A metadata-only dry run is not transactional protection.
3. Atomically create a unique immutable destination event and append-only server-owned migration receipt. Reject overwrite, delete, stale version, duplicate ID, forged actor, ambiguous subject, or replay with different content. Never accept browser-provided actor, reviewer or subject as authoritative.
4. Preserve source actor-shard history until independent inventory, export, restore and cross-role compatibility are verified. A future cutover must account for shared legacy audit, old clients, pending journals and query/list behavior. Do not silently suppress records with multiple subjects.
5. Validate current and candidate Firestore/Storage rules, real Firebase Admin transaction behavior, concurrent writes, backups/restoration and actual role/browser/mobile staging in a separately authorized environment before any live migration.

## Acceptance / control tower
**Built:** pure reconciliation candidate + synthetic regression suite. **Automated-Verified:** only after complete exact-SHA CI. **Visual/Staging QA Needed:** yes. **Blocked External:** approved policy, real inventory/restore and staging. **User Accepted:** no. **Released:** no.

**Decision owners:** Platform engineering for transactional executor and security tests; HR/security reviewer for actor/subject policy and retention; Mia for staging, production migration/rule changes and release. **Deadline:** none approved. **KPI/financial effect:** none established.

**Next single unblocked action:** add a synthetic Firestore emulator browser-deny and privileged append-only receipt transaction test for the proposed subject-scoped audit schema, without enabling any endpoint or deployment.

No changes to main, integration, deployed Firestore/Storage rules, real HR records, employee status, payroll, payments, inventory, orders, external messages, contracts or staging mutation flags.
