# Production stabilization acceptance register
PR 174. Never use real financial transfers, real hires, real order completion or customer email for a smoke test without specific authorization. Run in isolated demo or emulator first; connected read-only checks and specifically approved test records follow.

| Item | Acceptance |
|---|---|
| ST-01 Invoice print | Select actual permitted invoice; single/bulk PDF, correct lines, totals, payments, signatures and page breaks; internal watermark until customer issuance authorized separately. |
| ST-02 New Hire | Verified active administrator opens provisioning; incomplete and duplicate identity blocked; controlled test identity only after approval. |
| ST-03 Terminated HR status | Reconcile three identified staff against separation evidence; HR, directory, access and history agree; no guessed changes. |
| ST-04 Directory | Active default excludes former staff; separated filter retains history. |
| ST-05 Vendors | Create unique approved test vendor; refresh and verify persistence; reject duplicate and unauthorized access. |
| ST-06 PO | Create, submit, independently approve; reject over-receipt; receipt evidence does not yet post inventory. |
| ST-07 Supplier bills | Record against approved PO and receipt; match cases/cost; independent approval; duplicate invoice rejected. |
| ST-08 Payments made | Record evidence, independently verify settlement, reject excessive amount; no automatic bank transfer. |
| ST-09 Expenses | Record and independently approve; verify amount and audit. |
| ST-10 Delivery | Existing Delivery Operations navigation is role-specific; approved rep-order workflow preserves claim, reserve, load, depart, sign and inventory custody. |
| ST-11 Shipment workflow | No redirect-only list; actual shipment opens record. Connected administrative shipment mutations remain gated. |
| ST-12 Sales delivery | Menu duplicate removed; old links resolve to role-specific workflow; rep restrictions intact. |
| ST-13 Onboarding | Test setup, document acknowledgement, approval and login with approved test identity; no real hire. Verify compliance evidence retained. |
| ST-14 Payroll | Isolated demo: test valid and invalid timecard/source calculation, no duplicate consumption and worker classification. |
| ST-15 Payroll processing | Demo: draft, approve, release, evidence and settled status; reject unsupported transitions. No connected payout. |
| ST-16 Payroll settings | Demo: validate pay groups, compensation and withholding inputs; connected readiness review; finance/provider signoff before live writes. |
| ST-17 Time and attendance | Filter employee, date, weekly status; open corrections; verify saves and permissions. |
| ST-18 Leave | Submit approved test request; manager review, approve/deny; verify authoritative PTO and access. |
| ST-19 Performance | Administrator drafts measurable goal for active employee; refresh, verify audit; no automatic bonus. Review cycle editing remains separate. |
| ST-20 Full audit | CI green, Firebase emulator scenarios, then owner walkthrough on release candidate. Test each result, cross-role denials, refresh/persistence, and failure paths. |

Deployment: use existing Cloudflare Worker and Firebase Functions; do not deploy Firebase Hosting. No customer-email activation or live payroll without separate approval. Keep rollback version and main unchanged until release checks pass.
