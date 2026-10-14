# Momentum active master backlog — October 14, 2026

Owner's consolidated list supersedes previous backlog ordering. Code present on a build branch is not a production completion. Release requires CI, applicable role smoke tests, matching deployed build, and explicit verification below.

| Item | Current evidence / remaining gate |
| --- | --- |
| HR + onboarding compliance | External document verification now records reviewer, timestamp, version and secure record reference. Administrator evidence-gap view added. Full backend compliance enforcement, retention controls and restore/retrieval tests remain open. |
| I-9 + W-4 | Official source links added. No native electronic signing or compliant electronic records system has been represented as complete. |
| Customer onboarding / e-sign / AZ tax | Existing setup retained. Certificate type, signer/provider, legal package and server verification remain open. |
| Admin delivery override | Integrated prior implementation; audit and inventory logic tests present. Live role and deployment checks pending. |
| Orders workspace | Integrated views/filter/sort work; regression tests present. Production verification pending. |
| Existing account edits | Backend policy helpers exist, but shared commercial account-patch bypass/canonical migration remain unresolved. Do not expose insecure editing or claim completion. |
| Invoice formatting | Branch moves identifiers into a full-width row beneath address blocks. Actual PDF and deployed main verification remain gates. |
| Concurrent lag | Persistence attachment race addressed; synthetic audit performance tests present. Live multiuser measurements and end-to-end before/after evidence remain open. |
| Cash selection | Removed from new payment UI and rejected by new-record API; historical type retained. |
| Email infrastructure | Server event observers create review-only notification candidates. Sending remains disabled. Resend credentials/domain, recipient policy, transport/retry/webhook wiring not live. |
| Weekly compliance | Existing reports reused for due/overdue/submitted/not-submitted view. No new email fan-out. |
| Marketing role | Added to identity/provisioning and access maps; new asset/request permissions. Emulator and live role tests required. |
| Marketing / Materials | Storage-backed version library and approved downloads added. Legacy asset metadata retained read-only. Training is under HR; no duplicate Materials primary navigation. |
| Production queue | Requester-scoped records, manager assignment, due date, draft/final version and append-only history rules added. |
| Weekly visit targets | Management-controlled per-person/per-week targets, actual physical visits and variance in existing weekly reports. |
| Work-order email | Recipient/trigger agreement and sender integration pending. |
| Contracts / legal handoff | Approved terms and counsel review remain dependencies; do not silently publish attached drafts as final agreements. |
| HR/payroll cleanup | Do not invent pay rates, manager relationships, payroll history or approval evidence. Existing commission work integrated, further reconciliation pending. |
| Inventory scanner / traceability | Requirements and hardware investigation pending; not a substitute for verified stock/lot data. |
| Verified inventory / barcodes | Requires actual physical count, damage/sample dispositions, case barcodes and supplier lot/pallet records. No fabricated opening balance. |
| CRM filters / managers | Existing ownership preserved. Full verified relationship/filter acceptance testing pending. |
| Security hardening | New collection rules, notification isolation, conflict handling and offboarding changes under test. Canonical account migration still open. |
| Deployment verification | Main/Cloudflare verification, printed output, live roles and concurrent-user QA must be explicitly recorded after release. |

Shelved: Helcim/payments, territories/maps, B2B credit, Firebase AI/Realtime Database experiments, mascot, automatic 90-day release.
Removed: timekeeping reminders, relationship-source/targeted-account fields, shelf-space observations, cash policy copy.
Previously completed and not rebuilt: Delivery Driver workflow/readability, delivery signature/POD, Retailer Execution cleanup.

## HR source review

Checked October 14, 2026:
- Official I-9 PDF: https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf (retrieved edition 01/20/25). Source landing page https://www.uscis.gov/i-9 returned 403 to automated retrieval; confirm current edition when implementing the form provider.
- Electronic I-9 controls: 8 CFR 274a.2(e)-(i), https://www.govinfo.gov/content/pkg/CFR-2025-title8-vol1/pdf/CFR-2025-title8-vol1-part274a.pdf . Requirements include integrity, indexed retrieval, readable export, access controls, recovery and permanent action records. Identity-linked signatures and attestations are separate requirements. Current regulatory verification remains a release gate for native electronic I-9.
- W-4 current page: https://www.irs.gov/forms-pubs/about-form-w-4
- Electronic W-4 requirements: https://www.irs.gov/publications/p15t (2026). Do not replace the official form with a generic signature checkbox.
- W-4 recordkeeping: https://www.irs.gov/taxtopics/tc753
- Arizona A-4: https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election (2026 listed).

External verification is an operational evidence record, not a claim that Momentum stores or electronically signs the underlying official form. Existing verifications are preserved and flagged for evidence review rather than rewritten.
