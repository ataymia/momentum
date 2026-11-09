# Momentum connected-workflow release gates
Review date: 2026-11-09 (America/Phoenix)
Branch: `integration/a-g-unified-2026-11-07`. This document is an evidence map, not an acceptance or deployment approval.

## What is verified vs. still missing
The existing A01–G10 canonical 98-item ledger remains authoritative, and the R01–R77 user-correction register remains open until Mia personally accepts each whole requirement. Workstream commits are consolidated into one integration branch that stays separate from `main`. Prior Chromium demo sweeps and CI are useful but do not establish live service readiness.

| Workstream / R IDs | Implemented or verified evidence | Release blocker | Minimum staging acceptance |
| --- | --- | --- | --- |
| Connected CRM R16, R18, R22, R74, R75 | Quick Visit authenticated Firebase Function, Firestore transaction, account-scope check, request idempotency, atomic visit/sample record, source event actor, no fabricated sale or inventory movement; contact/deal demo paths remain | Function/rules deployment not approved; no multi-role live proof; shared read arrays can still expose cross-owner records at Firestore transport level | Rep records own authorized location; unassigned Prospect rules; foreign location rejected, customer denied, manager delegation verified, double submit makes one event; lead/activity/detail view sees same record after refresh |
| HR onboarding, R40–R50 | Identity provisioning/password rotation and metadata registers exist; official federal/AZ form references collected | No verified form-specific legal signature, secure signed originals, I-9 compliant verification/retention, reviewed employee submission versioning or provider contract | Start as authorized new hire; assign current official I-9/W-4/A-4 based on classification; verified signer completes; privileged HR reviewer returns/approves with immutable originals and audit; separated user loses access; I-9 needs separately accepted compliance test |
| Payments, R23/R28–R33 | Existing demo commerce ledgers, credit/return models and explicit local settlement guard; now synthetic demo cleared receipts are excluded from connected finance seed/projection | No authorized bank/processor settlement ingestion, verified webhook, refund/chargeback reconciliation or legacy transaction migration | Matched settled provider event posts once to correct customer/invoice/order; pending/failed/reversed never paid; webhook replay idempotent; partial payment, refund, net settlement, credit and duplicate reference exceptions reconciled |
| Cross-department integrity, R23/R30/R36/R37/R74/R75 | Typed record ID relationships and selected demo flow tests across CRM/Commerce/Inventory/Delivery/HR; source-specific ledgers preserved | No complete connected cross-user tenant-isolation, historical migration or end-to-end posted reconciliation evidence | A single approved order traces through SKU/lot availability, reservation, custody, delivery proof, invoice, settled payment, returns/credits, reporting and access-scoped audit; failed handoff cannot mutate downstream totals |
| Visual consistency, R50/R54/R72/R76 | Shared workspace CSS, standardized page headers, cards, tab bars, table density, employee directory/detail structure; automated route/mobile survey | Owner visual signoff and actual devices, keyboard/screen reader review | Compare every route with Momentum design reference on phone/tablet/desktop, check forms/menus/empty states/overflow and persist preferences |

## Critical-path recommendation
1. **Now:** Green current-head complete CI, browser/role audit and security-rule validation. Fix failures instead of marking them complete. The November 7 audit SHA is outdated and cannot verify November 9 code.
2. **Next:** Use an isolated, authorized Firebase staging project to prove CRM role, replay and negative cases, then solve remaining connected CRM mutations and source-of-truth ownership.
3. **Before any live HR onboarding:** Mia selects/approves an affordable compliant signing/document platform and required legal/I-9 workflow. Do not treat a typed signature, PDF editor or the existing template metadata as compliant.
4. **Before collecting payments:** Choose a processor/bank settlement interface, define provider-owned evidence/settlement ledger, return and credit controls; no browser path may self-certify Cleared.
5. **Before release:** Full connected order-to-cash and HR journeys under actual roles, tenant boundary and source reconciliation tests, owner approval, rollback/restore rehearsals.

## Decision record
- Decision **not** made: production merge/deployment, HR signing vendor, money movement provider, retention/legal sign-off, customer financial balances, source-of-truth historical import.
- Engineering may prepare code and test harnesses; no spend, employee invitation, customer outreach, signature request, financial transaction, or external commitment is authorized by this document.
- Evidence owner: engineering for exact commit and CI/test artifacts; operation owner: Mia for scope/priority and final acceptance; legal/compliance reviewers required for regulated forms. No deadline is assumed.
- The smallest next gate is one successfully completed CI run on the **actual integration head**, followed by live-role staging tests for CRM writes.
