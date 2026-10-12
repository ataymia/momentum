# CRM account editing: secure cutover plan

**Status: incomplete / production blocked.** Backend transaction helpers are staged, not exposed through HTTPS Functions or CRM UI. These steps must be completed in order; an account Edit button alone is insufficient.

## Verified legacy architecture

1. Account records, contacts, stage, ownership and commercial history are embedded in the `items` array at `domains/workspace/fields/accounts`. `lib/workspace-context-v5.tsx` performs new account creation, appointment-closeout follow-ups, paid-order updates and order-created stage changes through this shared array.
2. `domains/commercial/fields/_root` holds `data.accountPatches`, which is merged on top of workspace accounts in `lib/workspace-context.tsx`. Existing classification, location, pricing, ownership and responsibility-transfer workflows change this patch map.
3. `lib/persistence.ts` merges/saves these domain documents with conflict detection, offline pending journals and metadata versions. It is not safe to replace or bypass this queue without an equally reliable sync acknowledgment.
4. The current Firestore Rules allow operational staff direct writes to shared `workspace/accounts` and `commercial/_root`; those writes are **not creator-scoped**. The UI showing/hiding an Edit button is not security.
5. Older account records have no independently verified original creator. Current `ownerId`, manager, `originatorId`, display name, or even client-written `createdByUid` alone is **not proof** of creation.

## Newly staged backend foundations

- `functions/src/trusted-account-creation.ts` provides a **non-HTTPS-exported** transactional account-creation helper. It validates a new business/contact, checks high-confidence duplicates, writes the existing shared account/customer/activity source of truth, and atomically creates `accountCreatorProvenance/{accountId}` plus a replay-safe creation request receipt.
- `functions/src/account-profile-edit.ts` provides a **non-HTTPS-exported** transactional account-profile edit helper. It re-verifies `userAccess/{uid}` inside its transaction, requires server-owned provenance for an ordinary creator, permits an active full Administrator to correct legacy accounts, whitelists ordinary profile/contact/address fields, synchronizes previously existing commercial overlays, stamps `platform/meta`, and creates an immutable audit event.
- `accountCreatorProvenance`, `accountCreationRequests` and writes to `accountProfileEditEvents` are denied to all ordinary Firestore clients, including Administrators. Trusted Admin SDK service code alone may mint them.
- Tests cover active creator, Administrator, unrelated rep, manager, Operations, inactive users, forged creator claims, altered ownership/attribution and direct Firestore access to the server records.

**This is NOT a feature release:** the shared `accounts` array and commercial patch map remain writable. Neither account creation nor profile editing is routed to the trusted backend from the UI.

## Exact dependency-ordered cutover

1. **Design and test a canonical record path.** Prefer one editable account document per account (plus an immutable creator proof), with server-enforced ownership and audit. Do not create competing customer account records in different stores. Decide which existing operational fields stay in the account document and which live in their current specialized systems.
2. **Inventory every write to account/customer profiles** including creation, prospect claim/release, rep handoff, visit and appointment closeouts, territory/geocoding suggestions, sales classifications and pricing, order lifecycle, invoice payment changes and imported records. Preserve existing role authority for these *separate workflows*, without allowing them to modify unrestricted profile fields.
3. **Implement secure server command paths**, with role checks, transaction/version preconditions, explicit field allowlists, immutable attribution and metadata, audit actor and timestamp, and no double posting. Confirm offline actions are journaled/retried without loss or duplicate execution.
4. **Migrate historical existing account identities** with a read-only reconciliation/export and per-account checksums/counts. Do not derive missing creators from transferable ownership. Accounts without trusted creator evidence remain Administrator-only for manual profile edits. Verify contact, address, operational status, inventory/order references and commercial overlays survive.
5. **Replace browser writes and read paths together.** Consume the same canonical account source across CRM, Orders, Dispatch, Finance and field activities. Preserve pending sync journals; handle a user who is offline or has queued legacy writes at migration time. Explicitly reject or safely migrate stale-client writes.
6. **Deny legacy profile write bypasses in Firestore Rules**, including `workspace/accounts`, `commercial/accountPatches` inside the shared root, and any alternate customer/account profile setter. Old clients must not silently succeed or lose pending work.
7. **Enable Edit Account UI only after rules are enforced.** Allow verified original creator or active full Administrator. A manager may edit only an account they truly created, not because of their role. Price, owner transfers, creation metadata and historical attribution remain separately controlled.
8. **Run security emulator and live smoke tests:** creator allowed; unrelated rep denied; manager denied solely by title; Admin allowed; client attempts to forge UID/provenance denied; immutable metadata untouched; old client direct REST bypass denied; legitimate order/visit/pricing/territory workflows still pass; concurrent edit conflict and offline recovery tested.
9. **Release by Flo's explicit authorization** after production readiness review under `docs/PRODUCTION_RELEASE_RULE.md` and `docs/DO_NOT_DEPLOY.md`. Deploy new backend/rules/client in an approved compatible sequence with rollback and pending-journal recovery checks.

## Acceptance standard

A feature is complete only when a signed-in creator can edit a previously created account after refresh, an unrelated rep and an unrelated manager receive server/Firestore denial *even when bypassing UI*, an active Administrator can edit legacy profiles, and no other workflow loses money, orders, timekeeping, offline records, attribution or audit history.

**Permanent owner:** CRM/backend authorization workstream. **Current priority:** P1, before broad production release. **Decision required:** approve canonical migration and backward-compatibility plan, not UI appearance.
