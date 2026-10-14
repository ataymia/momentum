# Momentum employee separation and Unassigned Accounts
Status: DRAFT RELEASE CANDIDATE. Never assume this code is deployed or that a specific user's access is revoked.

## Immediate incident response

1. An authorized Firebase administrator confirms the departing worker's unique Firebase Auth UID and work e-mail. Do not identify by first name alone.
2. Disable that specific Authentication user and revoke their refresh tokens with Admin SDK privileges. Firebase refresh-token revocation does not retroactively invalidate every already issued ID token unless verification checks revocation, so combine it with active Firestore/Storage account-state denial.
3. Set the user's `userAccess/{uid}.accountState` to `Separated` (or `Suspended` while investigating). Do **not** delete historical userAccess, employeeDirectory, or the identity itself from Momentum's history. Verify the current production Firestore and Storage rules deny those states before relying on this alone.
4. Suspend company Google Workspace/Google Account access separately, if relevant, and review Google Groups, Drive sharing, Calendar, connected apps, business phone, devices, social accounts, and shared credential access. Do not assume Firebase revocation covers these.
5. Log operator, target UID, date/time, decision, source of approval, evidence of Firebase disabled/revoked and all other access checks.
6. Owner reviews a report of released account IDs, open orders, pending appointments, pending receivables, territory ownership, sales/commission attribution, inbound communications, and contact handoff. Stop and reconcile discrepancies.

## Design implemented on draft PR

The new Administrator-only `separateEmployeeAccess` endpoint requires a valid active Administrator session, a unique target UID repeated in a confirmation field, and a reason. It refuses self-offboarding and Administrator targets.

An atomic Firestore transaction:
- verifies Administrator and target access,
- retains the target's `employeeDirectory` record and marks it `employmentStatus:Separated`,
- sets `userAccess/{uid}.accountState:Separated`,
- sets each currently owned account's commercial `accountPatches[id].ownerId` and `accountManagerId` to blank, preserving all base account records, `originatorId`, past orders, invoices and historical sales credit,
- suspends territory assignments that point to that employee, preserving the territory record for later reallocation,
- writes a privileged-only `employeeSeparations/{uid}` audit record and relevant meta version stamps.

After Firestore commits, the server disables the Firebase Auth user and revokes refresh tokens. A partial Firebase Auth failure must be escalated and retried. The Firestore denial must already be deployed first. **Do not merge or deploy until this sequence passes actual role and session tests.**

The Administrator UI shows a confirmation form with a reason. Permanent employee deletion is intentionally unavailable in that UI for established active personnel. The historical identity remains visible as separated but is excluded from new assignment controls.

## Unassigned Accounts queue

The Accounts module now has an `Unassigned accounts` tab. Accounts with an effective blank owner appear here, without a new account being created. It is a live filter of the existing account register.

- A Sales Representative may self-claim an **unassigned Prospect** using the existing claim workflow; its order and activity history stay intact.
- An unassigned Qualified, Placed, Reordered, At-risk or other established account is visible to a Sales Manager or Administrator for controlled assignment. A sales representative cannot silently take over an existing customer's payments and commercial responsibility.
- Territory assignment remains an advisory geographic suggestion, not an automatic transfer.
- Claim operations on the legacy shared commercial Firestore document still require **atomic server authorization before they can be considered concurrency-safe**. Simultaneous claim testing and stale-client bypass prevention are release blockers.

### Future release eligibility

The working rule discussed by leadership is release after **five unsuccessful physical visits or 90 days**. This is a release-candidate policy, not proof of a validated 90-day clock in current data.

Before automatic release:
1. Confirm the clock start (assignment date, previous claim date, or creation date) with Flo.
2. Define which specific recorded visit outcomes constitute unsuccessful physical visits and which verified source proves presence. Mere notes or scheduled appointments cannot count as completed visits.
3. Define cases exempt from automatic release: customers with active orders, credit balances, open collections, strategic status, live promotional agreements, current reorders or active fulfillment.
4. Require an auditable transition with idempotency and same-account concurrent claims resolved atomically.
5. Present eligible accounts for manager review first until both the historical data and exception rules have been approved.

## Remaining release gates

- Full automated tests and Firebase emulator/security negative tests must pass.
- Live trial must show separated employees cannot log in, refresh a session, use an already-open tab or directly call Firestore/Storage.
- Verify staff can still see past accounts, invoices, sales-rep and manager commission attribution, employment/HR history and audit events.
- Verify offboarded employees are excluded from all assignment dropdowns and territories are reviewable for a replacement.
- Verify employee offboarding queues unfinished appointments/tasks for dispatch reassignment. The first version does **not** silently cancel scheduled visits, payables or deliveries.
- Ensure backup and reconciliation for shared Firestore `accountPatches` and Firestore version conflicts.
- Require release-owner approval and the production release checklist in `docs/PRODUCTION_RELEASE_RULE.md`.

## Accountability

Permanent owner: workforce access/offboarding, with CRM owning unassigned account queue and Operations owning open work handoff. Release authority: designated owner (Flo) after verification. Mia's next step: confirm live Firebase access is disabled/revoked for the departing worker and clarify whether all unassigned existing customer accounts may be self-claimed or require manager approval.
