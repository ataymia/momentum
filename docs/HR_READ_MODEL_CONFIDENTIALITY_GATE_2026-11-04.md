# HR read-model confidentiality gate (review only)
**Recorded:** November 4, 2026, Phoenix. **Owner:** Platform engineering; HR release authority remains with Mia and the authorized compliance owner.

## Verified repository behavior
- `lib/hcm-engine.ts` retains canonical employee, lifecycle, leave, document, compensation, audit, training and performance history. The new `lib/hr-employee-detail.ts` is a read-only, explicitly whitelisted projection. It excludes private contacts, compensation, leave reasons, review narratives, raw evidence and file locations. Self-view is restricted to the current employee; another employee's drilldown requires the Administrator role. These are client-side privacy controls, **not** a claim that the entire HCM backend is confidential.
- `lib/firestore-domains.ts` shards employee-owned HCM arrays under `userDomains/{uid}/hcm/{field}`. `firestore.rules` enforces per-user/Administrator access for those paths, with narrower access to compensation and audit.
- **Unresolved legacy read path:** `firestore.rules` at `/domains/hcm/fields/{field}` currently allows any provisioned employee to read several named shared HCM fields, including `privateProfiles`, `documents`, `compensation` and `leaveRequests`. The sharder may place unowned/legacy records in shared fields. There is no evidence in this review that sensitive records actually reside there, but if they do, client-side filtering cannot prevent a direct Firestore read. This is a **potential confidentiality exposure**, not a confirmed live incident.
- `storage.rules` has a separate `hr-private/{employeeUid}/...` gate. Document metadata visibility and document byte access are distinct controls. Neither an uploaded file nor a checklist checkbox proves statutory form compliance.

## Mandatory safe remediation sequence before HR acceptance
1. In an explicitly authorized non-production environment, use a privileged, access-logged inventory of shared HCM field document presence, counts and ownership integrity. Avoid copying personal data into issues, logs or fixtures. Do not run this inventory against production without separate approval.
2. Design a versioned, idempotent migration for any legacy shared employee-owned records into the existing `userDomains/{uid}/hcm/{field}` layout. Quarantine records with missing/ambiguous ownership for Administrator review; never guess a user ID, delete source history or auto-change employment access.
3. After backfill and reconciliation, tighten shared-field read permissions to the minimum compatible role and update `lib/firestore-domains.ts` read-path logic together. Do not simply deny reads before verifying older clients and migration behavior; that could silently break employee self-service or recovery.
4. Add Firestore emulator tests for an ordinary employee, a manager, Administrator, a separated account, a different employee, and malformed/legacy shared records. Verify no cross-employee private metadata, compensation, documents, or audit leaks. Test preservation of valid self-service and historic record retrieval.
5. Require fixed-SHA CI, staged role tests, browser/mobile deep links and an explicit security signoff before marking Task 01 accepted. No production rule deployment or data migration is authorized by this note.

## Scope of the current increment
The employee detail and onboarding checklist screens are **BUILT**, with tests pending/recorded separately in the queue. They do not read raw private profiles or enable mutations, form signing, account activation, payroll, customer notifications, or real financial operations. The original HR and onboarding administration paths remain reachable.

**Proposed next unblocked engineering action:** build the read-path isolation and legacy migration test harness on an isolated review branch, without running a production migration or tightening live rules.
