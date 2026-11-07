# G01–G10 Reliability workstream: release and recovery gate
Date: 2026-11-06 (Arizona)
Isolated branch: `workstream/g-reliability-20261106`
Draft PR: https://github.com/ataymia/momentum/pull/169
Baseline: `prototype/unified-workspace-redesign-2026-11-03`

**Not an acceptance or deployment authorization.** Do not merge the redesign or deploy without Mia's explicit approval. Consolidate carefully with A–F workstreams on a single reviewed integration branch. Each checked item below needs evidence at the exact integrated commit.

Known temporary legacy route fallback without new dedicated sidebar entries: Dispatch, Timekeeping, Finance, Reporting Center. The A navigation integration owner must assign independent visible destinations, or explicitly retire the legacy pages with all work preserved. The current G test verifies routeability, not completion of that UI conversion.

## Implementation / remaining proof

| ID | Current code work | Required proof before Accepted |
|---|---|---|
| G01 | Bell ignores stale (>30 days), future-dated, and undated status-only intents, and delivered/cancelled assignments no longer generate active delivery tasks. Pending decisions remain visible. | Reproduce reported 66 badge on preserved account fixture; distinguish genuinely actionable vs old status. |
| G02 | Per-user browser read receipts merge across tabs; a Firestore-backed, 16-bucket, owner-only, append-only compare-and-swap reconciliation now supports eventual cross-device clearing, with offline local fallback and unavailable-sync warning. | Clear individual/all, refresh, second tab, sign out/in, role switch, offline/online, and second device. **Cross-device synchronization is implemented in this isolated branch but has NOT been staging verified or deployed with the required Firestore rules.** Allow two minutes for remote polling, or use focus/online to refresh. Do not mark Accepted. |
| G03 | Source event timestamps displayed when recorded; first-seen timestamps merged by earliest observed time across tabs. | Simulate concurrent tabs, invalid timestamps, clock drift, missing dates, cross-device expectations. |
| G04 | Passive snapshot differences never receive a fabricated signed-in actor; record updates need changed source provenance. | Import/hydrate, refresh, switch account, merge, and check zero phantom user-action records. |
| G05 | Account normalizer only preserves validated persisted `createdAt`; never invents a current time. Tests added. | Replay legacy accounts missing creator/time and explicit creator/time through browser, sync, and reload. |
| G06 | Changes solely to sync/hydration/actor metadata are filtered; mutable CRM activity refresh cannot replay original action. | Concurrent edit and Firestore hydration with truly changed vs housekeeping fields. |
| G07 | Verified source actor and event time required for passive-diff audit; cache disappearance is never treated as a user deletion. Manually recorded current-user events retain explicit actor. | Validate actor authority and timestamp from authenticated server-side writes across roles. Implement immutable deletion events/tombstones so real deletes remain auditable. A client-stated actor ID alone is not cryptographic proof. |
| G08 | Legacy unverified system events retained with original recorded time/actor/summary, flagged without rewriting source claims, and hidden from attributed activity views; distinct same-time field changes preserved. | Before any migration take an authorized, immutable archive. Recover and reconcile historical records with official source of truth. Previously deleted events cannot be recreated without backups. **Administrator-only read-only JSON recovery export is now available in Audit Center for normalized unverified records.** This is not a backup of previously deleted events and is not proof of historical actor attribution. |
| G09 | Removed dormant header section-tab registry from shared shell; sidebar/breadcrumbs retained. | A workstream must remove/replace remaining legacy page layouts, then full responsive visual review. Not complete. |
| G10 | Focused tests registered in `test:logic`; PR workflow provides full audit at exact SHA. | Full app/Functions lint and typecheck, logic suite, Firestore/Storage rules emulators, build, real role tests, route/direct-link and browser/mobile staging acceptance, consolidation test, Mia signoff. |

## Minimum staging acceptance matrix

1. **Notifications:** initialize user with 66 historical delivery/status events and three live actionable approvals. Check bell counts only actionable/recent valid status, with correct recipient and original event dates. Clear all; reload, reopen in second tab, use Back/Forward, and verify no replay. Repeat on another device; treat failure as G02 blocker.
2. **Recipients and sensitive data:** Admin, Sales Manager, Sales Rep, Operations, Warehouse, Delivery Driver, Marketing, and Customer roles. Attempt to load another person's HR/payroll records, notification read receipts, finance documents, order and customer records through direct URLs/API. Deny what each role does not own, even if UI hides the link.
3. **CRM/audit:** reconcile real record creation, edit, reassignment, consolidation, hydration, and correction through source ledger. Check each user action has correct actor, changed fields, source time, and exactly one audit entry. Sync and recalculation alone must not show as actions.
4. **Legacy recovery:** export authorized pre-migration audit store; normalize; confirm all verified history remains, unverified entries can be recovered but are never presented as verified employee actions. Re-check against source ledger.
5. **Navigation:** all eight approved navigation groups. No header module tabs, no embedded legacy full-page UI. Test desktop, tablet, and mobile, direct deep links, refresh, back, forward, copied URL and role-denied paths.
6. **CI:** review the latest *integrated* commit SHA and matching successful GitHub Actions run. Older success does not satisfy the new commit. Confirm unmodified working tree after audit.

## Operational controls

- Do not discard old audit data to reduce noise. Quarantine unverified records, preserve original bytes and record an explicit migration receipt.
- Avoid inventing timestamps or actor identities when a field is absent.
- Notification read state is locally immediate and reconciled into private Firestore documents only after rules deploy and an authenticated session loads; it does not confirm email/SMS delivery, business task completion, or server-attested audit activity. Offline clients retain local clears. Cross-device updates can be delayed up to the two-minute polling interval and require real-device staging acceptance.
- Avoid rewriting account historical attribution, commissions, payments, and tax documentation while implementing G fixes.
- Competing changes from A–F must be reconciled by file and commit, never by blind branch overwrite.

**Decision needed:** integrated branch owner to approve a controlled G merge after A–F code conflict review, then a separate release approval from Mia after staging evidence.

## Deep-dive findings added November 7, 2026

- A completed delivery task had a persistent `delivery-assigned` Action Center item because only `Cancelled` was excluded. This is now corrected and regression-tested.
- Cross-device read receipts now use `notificationReadReceipts/{uid}/buckets/{0..f}` with authenticated, exact-owner reads, no collection enumeration, monotonic union-only writes, per-document limits, immutable delete denial, and Firestore update-time preconditions. Tests cover unauthorized peers/managers/admins, malformed writes, conflicts (unit logic), and data retention (unit logic). Actual two-device synchronization remains a staging blocker.
- The receipt policy is added to the source generator **and** `firestore.rules`; the generated-rule integrity gate must pass at the final SHA. No live rule deployment has been performed.
- Legacy history normalization must not silently revise actor, original timestamp, or summary for quarantined records. The recovery JSON represents only the records still present in persisted storage. Already lost/replaced history cannot be recreated.
- **Audit attribution warning:** the current generic audit engine still derives some actor/time information from browser-visible business source fields. Those fields do not constitute independent server-side proof. The Audit Center warns the user. Server-authenticated append-only audit, especially deletion tombstones, is a **G07 release dependency** and cannot be declared complete by passing unit tests.
- **Integration conflict:** parallel A/F changes touch navigation and `package.json`; other tracks may touch generated rules. Preserve all changes through explicit file-by-file consolidation, then rerun CI on the merged SHA. No blind overwrite.
- The 30-day stale-status bell cutoff is a documented product policy assumption, not a legal or business deadline; if a different duration is approved, update the policy, tests and UX together. Actionable warnings are not aged out merely for being old.
