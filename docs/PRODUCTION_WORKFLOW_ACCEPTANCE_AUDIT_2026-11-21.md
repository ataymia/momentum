# Production workflow acceptance audit | 2026-11-21

**Owner:** Director of Operations / MASTER. **Scope:** Momentum Distribution production journey verification.
**Source baseline:** `main` after PR #178. This is an audit supplement, **not a rewrite** of the canonical 98-item A01–G10 owner checklist or a claim of feature acceptance.

## Why this gate exists

PR #176 repaired an approved intake that had no order/invoice. PR #177 corrected the approval transaction, session refresh and Cloudflare deep links. PR #178 removed an invoice-print blocker caused by the unrelated customer invoice **issuance** flag. Standard CI had passed even though the real human workflow failed. Compilation, a route, a synthetic test, and a customer-completed process are different kinds of evidence.

**Definition of end-to-end verified:** A named role performs a real start-to-finish journey against an isolated connected Firebase/staging backend, with the final persisted records, role scopes, error handling, retries and downstream consumers independently read back. A browser click and an emulator server transaction are each *partial* evidence, not equivalent to that full result. Live customer issuance/payments are never tested with real money.

## Evidence grades (never silently promote)

- **R: Registered**: a test path exists and is executed by CI.
- **U: Unit/contract**: field, policy, UI-source, component or helper checks pass.
- **E: Emulator transaction**: isolated Firestore Functions API/transaction tests pass.
- **B: Browser demo**: rendered local demonstration UI interacted with by Playwright.
- **S: Connected staging**: real authenticated role and source-to-destination data verified with isolated staging records.
- **P: Production observation**: authorized read-only/nonfinancial smoke plus end-user confirmation; production write requires explicit approved QA change.
- **A: Owner accepted**: Mia confirms the workflow meets requirements.

Only **S + relevant P + A** establish a live workflow acceptance. Any failed required check makes the release **HOLD** even if all typecheck/lint/other tests pass. Missing evidence is **NOT VERIFIED**, not "working" and not "broken" by default.

## Workflow inventory and initial evidence gaps

Status at audit opening. This table lists **journeys to verify**, not completed claims. A named test indicates available *partial* coverage. The new browser/CI runs and live paths must be checked before updating status.

| Journey / actors | Critical start → downstream finish | Existing partial evidence | Remaining acceptance requirement | Current classification |
|---|---|---|---|---|
| Identity & staff navigation / Admin, Rep, Customer | Sign in → refresh/idle → route and Back → permission boundary | `tests/firebase-session-refresh.test.ts`; `tests/navigation-architecture.test.ts`; browser scripts | Connected role sessions, 404/routing, refresh stability, cross-account denials | **NOT VERIFIED end-to-end** |
| Lead-to-account / Rep, Manager | Lead → qualification → contact/account link → assignment and follow-up | CRM unit/contract and trusted CRM emulator tests | Live role assignment, deduplication, handoff, record readback, search | **NOT VERIFIED end-to-end** |
| Customer/account onboarding / Rep, Admin, Customer | Create and scope account → required tax/contracts → active authorized terms | `functions/test/trusted-account-creation-emulator.test.cjs`; account profile tests | Legal/tax/document verification, signed records, connected approval and account readiness | **NOT VERIFIED end-to-end** |
| **Order-to-invoice / Rep, Admin** | Request → decision → ONE sales order + ONE draft invoice → accessible regular Orders + Finance | `functions/test/approved-intake-preparation-emulator.test.cjs`; `tests/trusted-order-intake.test.ts` | Browser frontend against connected staging + original approved request recovery | **P0 NOT VERIFIED end-to-end** |
| **Invoice printing / Admin, authorized viewers** | Open draft/incomplete invoice → warning → confirm → paper/PDF without warning | `tests/invoice-print-review.test.ts`; new browser demo click gate | Actual Chromium/Safari print/PDF; production user confirms customer document | **P0 NOT VERIFIED end-to-end** |
| Inventory & purchasing / Operations, Admin | PO/vendor/bill → receive lots → stock and reservation → financial record | Inventory ledger, purchasing, and storage tests | Connected supplier/PO edits, lot integrity, exceptions, reconciled accounts payable | **NOT VERIFIED end-to-end** |
| Delivery & custody / Ops, Rep, Driver | Order → pick/reserve → assign → load → deliver → signed proof → exceptions | Delivery emulator/logic contracts and signature tests | Connected inventory depletion, driver role, offline/retry, unsigned delivery, paper receipt | **NOT VERIFIED end-to-end** |
| Customer collections and reconciliation / Admin, Finance | Invoice → payment request → authorized settlement → balance → receipt / refunds | `tests/d-commerce-settlement-guard.test.ts`, `tests/connected-commerce-posting-gate.test.ts` | Payment-provider integration, settlement/reversal, ledger double-count prevention | **NOT VERIFIED end-to-end** |
| Returns, cancellations, credits / Admin, Finance, Ops | Return/cancel → inventory and payment checks → credit/refund → audit | `tests/returns-credits-redesign.test.ts`, `tests/refund-allocation-guard.test.ts` | Staging transactional checks, restocking, duplicate retry, authorization | **NOT VERIFIED end-to-end** |
| HR onboarding & permissions / HR, Admin, Employee | Hire → classification → I-9/W-4/AZ records → sign/archive → access/remove | HR emulator suites and `tests/hr-compliance-readiness.test.ts` | Actual document signature, legal review, scoped access, retention, offboarding | **NOT VERIFIED end-to-end** |
| Timekeeping, payroll and commissions / Employee, Manager, Admin | Clock → timecard → approval → pay preview → **approved** payout | Timekeeping, payroll, commission policy tests | Real connected time records, exceptions, payout authorization; no test payout | **NOT VERIFIED end-to-end** |
| Marketing & partner program / Marketing, Admin | Campaign request → approval → approved spend → attributable demand / reorders | Marketing and cross-domain logic tests | Live permissions, source attribution, spend authorization, revenue reconciliation | **NOT VERIFIED end-to-end** |
| Support/notifications/audit / authorized roles | Case/event → routed recipient → resolution and audit history | Support emulator, notification, audit tests | End-to-end signal delivery, read/unread, correct recipient, retries/failure states | **NOT VERIFIED end-to-end** |

## Confirmed operational restrictions found in source (not just missing tests)

- **P0 Purchasing:** `components/prototype/purchasing-experience.tsx` explicitly renders **Production connection blocked** in connected mode. Vendor, PO, receipt, bill and payment forms in that redesigned surface are isolated local-demo forms. This is a *confirmed functionality gap* on the new Purchasing routes, independent of whether older purchasing features exist elsewhere. **Owner: Purchasing/Operations.** Requires real approved vendor, payable, warehouse posting, permissions and reconciliation source.
- **P1 HR onboarding:** `components/prototype/hr-onboarding-experience.tsx` sets `writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local"`, and prevents onboarding task updates / entry actions in connected mode. Existing secure new-hire provisioning and electronic forms are separate paths. **Owner: HR.** Require one connected case-to-form-to-verified-completion handoff rather than counting separate screens as complete.
- **P1 Fulfillment experience:** `components/prototype/fulfillment-experience.tsx` labels its new views read-only and sends actual pack/allocate/inventory custody work to established operations workflows. **Owner: Operations.** Validate deep links to real controls and shipment-state/custody persistence before marking new redesigned workspaces functional.
- **P0 Billing print and order linking:** PRs #176–#178 deployed, but connected production recovery, real browser/PDF and role-based live evidence are still pending **P/S acceptance**.
- **P0 CRM/HR previously omitted tests:** The first expanded run surfaced five failed *legacy source assertions*. Verify they reflect current policy before updating. The current CRM lead handoff requires an 8-character source, active authorized roles, server transaction and source readback; HR audit data is Administrator-only. Do **not** change access rules to satisfy stale text assertions.

**Do not suggest those connected workflows are operationally ready based on demonstration-mode passing tests.** The underlying existing production pathways must be independently traced as a separate source-of-truth check.

## Release gates implemented in this audit PR

1. **All unregistered existing pure logic tests** are added to `npm run test:logic`. `node scripts/check-test-coverage.mjs` fails normal CI if a `tests/*.test.ts` file disappears from the test commands.
2. **Full browser interaction audit** runs for every pull request targeting `main` and for updates to `main`. It is an additional required evidence surface (do not pretend GitHub branch-protection is configured merely because this workflow exists).
3. Browser audit **clicks** an invoice print button with the issuer flag false and asserts an acknowledged warning, one actual invoice sheet, zero warning words on the printable page, and browser Back/refresh success.
4. Existing server transaction emulator continues to test the initial order request, atomic approval, invoice link, rejected/unpriced requests, retries and duplicates.
5. Every failure must produce an issue with path, actor, source record ID (synthetic only), expected/actual behavior, severity, owner and screenshot/log link. **No misleading green summary while an acceptance route is unresolved.**

## Priority and approval

**Now:** P0 order-to-invoice, print/PDF, session and browser navigation; then inventory/reservation/fulfillment, customer collections and reversals. **Next:** CRM/customer setup, connected HR/onboarding/timekeeping, audit and notifications. **Later:** marketing, insights and lower-risk enhancements only after operational sources are verified.

**Blocking external prerequisite:** No isolated connected staging identities, cloud database and real payment simulator have been established in this PR. They must be provisioned with scoped, synthetic entities and no production writes before S-level claims. Production acceptance needs Mia's actual role-based confirmation, including Flo's existing order and its invoice.

**No automatic operational authority:** These QA jobs do not contact customers, issue invoices, collect funds, modify production orders, or create employee records.

**Owner decision gate:** Do not label any workflow “done” solely because full CI turns green. Update the MASTER's action/risk/decision registers with the actual evidence and explicitly record the unverified connected staging/live components.
