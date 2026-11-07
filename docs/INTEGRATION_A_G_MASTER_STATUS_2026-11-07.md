# Momentum Distribution · A–G Consolidated Change Register

**Audit date:** 2026-11-07 (America/Phoenix)  
**Integration branch:** `integration/a-g-unified-2026-11-07`  
**Policy:** No merge to `main`, production deployment, vendor activation, employee contact or payment collection is authorized by this register.

## Source and preservation ledger

All seven source lineages were preserved as Git merge ancestors of the integration branch, rather than copying or overwriting feature folders.

| Lane | Source ref | Pinned commit |
|---|---|---|
| F | `prototype/unified-workspace-redesign-2026-11-03` | `1e3a8fc7efe01cd3f2636c3dcf2dab0f90f5d4d2` |
| C | `review/rc-lead-assignment-2026-11-06-0615` | `ad4eb26562038ca04dfe577a745d7ee7b6a9a110` |
| A | `review/track-a-platform-architecture-2026-11-06` | `e6df6688fc1f5b5fdad133a9c32fd57a9984d2ee` |
| B | `workstream/b-workspace-meetings-2026-11-06` | `8d3fb4d61c5fd6ce1450fce54c6d06cc2775918b` |
| D | `workstream/d-commerce-20261106` | `212d7f1f36c90061aa824c5a8bb744061a78057f` |
| E | `workstream/e-operations-2026-11-06` | `c703d4a1053e7de0e00771dccb01d3ee6fd08101` |
| G | `workstream/g-reliability-20261106` | `0daa104a78e7349cf892cde2e70ca3517170614d` |
| Production preservation | `main` | `881a2396fa7357cae5300c49305f59d227d7e261` |

This branch also incorporates the latest production `main` line to avoid dropping the existing invoice-print P0 fix, staff clock-in/location permission recovery and sales inactivity modules. All source branches and `main` remain untouched.

## Verified engineering result before main-preservation merge

The A–G integrated SHA `af72ab880a70a999c0f1c6384870ada35b1a8dec` passed the **complete exact-head Momentum Full Platform Audit** at https://github.com/ataymia/momentum/actions/runs/42389432776:

- 870/870 application logic regressions passed.
- 95/95 primary Firestore rules tests passed.
- 4/4 supplemental Firestore security tests passed.
- 2/2 Storage security tests passed.
- App TypeScript and ESLint passed; Firebase Functions compile/lint passed; Next production build passed.

**Latest main-preserved integration SHA requires its own full audit.** A prior pass is not certification of a later commit.

## Proven integration conflicts and resolutions

1. Shared `lib/navigation-route-registry.ts` and `package.json` could otherwise drop A–F routes and independent regression suites. Unioned route definitions, required page permissions and all workstream test suites.
2. C/D/E `operations-hub.tsx` imports conflicted. Restored CRM contact exports, D traceable SKU/warehouse inventory imports and E server-backed rep self-delivery.
3. A/B `app-shell-v4.tsx` conflicted. Retained A responsive sidebar, restored B meeting-notification deep links and B calendar stylesheet, without deleting G read-receipt handling.
4. A strict navigation contract conflicted with C record URLs, D price books, B meeting records and E purchasing/warehouse details. Added strict verified record-route patterns and denied unknown nested paths.
5. A legacy workflow test conflicted with superior C redesigned CRM surfaces. Updated the test to assert the new functional screens, rather than regressing the UI to legacy placeholders.
6. Production `main` November 6 urgent invoice printing fix had not reached the old prototype. Restored printing of existing invoices without a legal-name early-return gate while retaining strict legal-identity checks for invoice emails. Added regression checks. F's older contradictory print assertion was amended.

First integrated run had 18 navigation/wiring failures; all were resolved by the successful 870-test exact-SHA audit, including the legacy invoice test.

## Unresolved requirements and decisions (no fictitious completion)

- **C01–C25:** new CRM pages and bonus/commission rules are present in code; connected production create/edit permissions, canonical account migration, and source-verified cash/bonus disbursement remain unfinished. **RELEASE BLOCKER: the coded sales-representative policy uses 2.50% plus a 0.50% manager override (3.00% total), but the supplied Exhibit A specifies 1.50% plus 0.50% (2.00% total). Exhibit B also references the 2.00% pool. Effective-date and launch-to-date treatment are not verified against an executed controlling agreement. Do not authorize compensation releases until the company decision owner reconciles the documents and code in writing.**
- **D10–D16:** payment request design and read-only portals are not equivalent to an approved integrated ACH/card processor, recurring mandates, signed webhooks, verified collections and settlement/reconciliation.
- **E08–E09:** purchasing workflow is designed and tested as isolated local demo; authoritative server operations, approved roles, real supplier invoices, receipt inventory posting and external settlement are not finished.
- **F04–F06:** production payroll, compliant I-9/W-4/AZ document signatures, original secure employee files and privacy cutover remain incomplete. The HR review chain has further isolated designs, not activated endpoints.
- **F07–F10:** source-backed marketing spend/ROI, secure document originals, connected Cases and final financial KPI definitions still need work.
- **G07–G08:** client/source-reported audit events are not independent trusted server attestations. Complete immutable actor audit, deletion tombstones and historical backup/recovery controls remain.
- **A07–A08 / G09:** final cross-department visual cohesion and legacy UX retirement still merit a product review; all routes passing tests is not proof of every interaction's design quality.
- **Main production behaviors:** the preserved 60-minute CRM inactivity clock-out affects paid time and should receive a dedicated payroll/legal correctness review and correction path, not be silently promoted as safe labor policy.
- **Software supply chain:** npm install reported dependency vulnerabilities; triage by affected runtime/directness and available nonbreaking fixes before promotion. Do not blindly apply major upgrades.
- **Cross-functional release:** no provider credential, legal company status, real authorization role matrix, production customer payments, inventory reality or live billing status is inferred by this integration.

## Next engineering sequence

1. Verify complete audit on exact latest main-preserved SHA and repair any new integration regressions.
2. Run browser visual smoke on demo desktop/tablet/phone, paying special attention to navigation, invoice print, B calendar and new CRM and purchasing pages.
3. Review the A01–G10 acceptance ledger by tested user job, not presence of a file or sidebar item. Maintain the 98 canonical IDs.
4. Approve specific external dependencies/authorizations for payment rail, HR compliance and purchasing transactions separately, if and when required.
5. Only Mia may authorize final merge or deployment.

**No measured financial KPI, operational launch, external payment or customer notification is claimed in this register.**
