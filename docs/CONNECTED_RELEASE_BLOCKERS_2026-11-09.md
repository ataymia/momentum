# Momentum connected-workflow release blockers and engineering evidence
**Review:** 2026-11-09 · **Integration branch:** `integration/a-g-unified-2026-11-07`
**Status:** Engineering in progress; NO deployment or owner acceptance implied.
**Decision owner:** Mia. This register supplements, never replaces, the 77 user corrections and the original 98 requirements.

## Verified code changes (not verified in production)
| Workstream | Engineering evidence | What this does NOT prove |
|---|---|---|
| R15–R16 CRM Quick Visit | Authenticated Firebase Function `recordCrmFieldVisit` validates actor and customer scope; one atomic CRM visit and sample log with a retry-safe request ID; browser is denied direct CRM interaction field writes | Actual deployment, successful signed-in staging save, GPS proof, CRM activities outside Quick Visit, production sample inventory custody, or provider availability |
| R30 Commerce refunds | Single-invoice allocation gate blocks refunds that cannot be attributed to an invoice; connected sessions cannot self-report externally sent/settled refunds or payment reversals | A payment processor, ACH/wire settlement import, chargeback reconciliation, bank deposits, released cash or external refund transfer |
| R74 Cross-functional integrity | Read-only administrator Audit panel scans loaded CRM, customer, order, invoice, payment, credit, refund and inventory links and shows concrete exceptions | Missing imports, payment provider source truth, signed documents, full-data snapshots or any external system guarantee |
| R50/R72/R76 UI | Shared formatting and focused employee-profile views; comprehensive browser audit in separate workflow | User acceptance on device, usability of every rare exception, backend completion |

## Open release blockers and owners
1. **Connected CRM coverage beyond Quick Visit.** Current legacy CRM contact, opportunity and generic interaction mutations remain demo-only. Any connection attempt must fail closed instead of implying a company record was saved. Determine server schemas, permission boundaries, audit receipts and role-specific workflows for each; Finance and Operations cannot infer a deal from a visit.
2. **Secure HR onboarding/signatures.** Official form URLs and metadata are in `docs/HR_OFFICIAL_FORMS_WORKFLOW_2026-11-07.md`, but secure form-specific completion, authorized signatures, immutable originals, I-9 examination and retention, provider webhook verification, and live employee/HR review are NOT complete. Do not label the simulated HR packet as legally signed or verified. Admin identity provisioning and a completed I-9 are separate requirements.
3. **Payment reconciliation.** Provider choice, one-time and recurring cadence, processor webhook signature/replay defense, merchant onboarding, authoritative settlement/return/reversal feeds, bank matching and refund postings have not been production-verified. A human-entered `Cleared` value is not third-party cash evidence. Confirm legal agreements, pricing, accepted payment types and total fees before connecting money flows.
4. **Cross-department source lineage.** Correct historical customer orders/invoices/payments cannot be fabricated. Investigate missing source records and stable IDs before import. CRM → account → order → invoice → allocation → inventory delivery → adjustment should have traceable provenance and a safe exception queue. An in-memory scan only sees records that loaded successfully.
5. **Role-specific staging.** Test as Administrator, Sales Manager, Sales Representative, actual employee and actual Customer on a non-production Firebase project with seeded synthetic records. Exercise access denial, slow/offline writes, retries, duplicates, double approvals, concurrent edits, departures and negative balances.

## Acceptance rules
- Check the exact Git commit's full CI, Firebase Rules emulator and expanded browser walkthrough after each integrated change.
- For money, HR, signatures, payment state and connected inventory, require independent server evidence and a verified staging readback. A success message alone is not proof.
- Report `Built`, `CI verified`, `Browser verified`, `Staging verified`, `Owner accepted`, and `Released` separately.
- All 77 owner correction acceptance boxes remain unchecked. Do not infer release from green CI.
- No app code, Firebase function, provider connection or data migration should be deployed without Mia's approval.

## Suggested smallest next staging walkthrough
On an authorized staging setup, sign in as a Sales Representative; submit one Quick Visit against a known assigned location; verify the server receipt, CRM record, provenance, and permitted role readback; retry the exact request ID and verify only one visit and optional sample are stored. Then attempt the same request against an unauthorized customer and confirm a 403 and zero writes. Record source IDs, exact timestamps, negative-case evidence, and the Firebase function version in the acceptance register.
