# Arizona account legal identity / validation: release acceptance

**Status: code review. Current customer-identifier access remains unchanged at the user's direction; workflow, rules deployment and acceptance tests still required.**

## Source-of-truth and intended behavior
- Each Account is a business location. Its linked CustomerAccount is the billing/legal entity. Personal nicknames are separate, employee-only records and never appear in invoices.
- Every new full account stores the entered legal business name as its canonical account/customer name, with an explicit staff attestation that it matches the license. Typed data alone is not independent document verification.
- Capture EIN and AZ TPT license number as distinct identifiers. TPT number is 8 digits per ADOR; optional until collected or a documented exception is approved.
- Tax documentation route: Undetermined / Taxable / Resale Form 5000A / General exemption Form 5000. This is classification only, never proof.
- Reuse existing `taxExemptionStatus` and document workflow; never set Verified or exempt based solely on a typed number.
- Existing accounts remain viewable and editable. Printing or emailing a customer-facing invoice is held when the legal business name is absent; it is not silently replaced with a trading or nickname.
- New accounts require a legal name and highlight rejected fields at submission. Do not hard-require an EIN/TPT from all legal entity types absent a documented exception process.
- Company-identity edits use existing `updateCustomerCommercial`, authorization, saving journal and record ownership policy; changes are not direct Firestore writes in components.
- Account Setup and account profiles must use the exact same CustomerAccount fields, without duplicative per-location identity copies.

## Mandatory release blockers
1. **Existing EIN access:** Shared customer documents are readable by authorized operational roles, not literally only the creator and managers. The user chose to defer narrowing those existing permissions. This change does not widen that access. Reassess roles and access before staff expansion. Private nicknames have a separate owner-only Firestore rule and must not enter shared customer documents.
2. Verify who may create, edit, see, and verify identity/tax documents. Sales capture must not imply authority to grant tax exemption. A rep changing identity must not overwrite another legal entity's verified identity.
3. Verify document verification, retention, exception handling and source of approved tax treatment with Operations/Finance.
4. Audit multi-location shared customer grouping: slug-derived `customerId` must not silently merge distinct legal entities. Determine safe duplicate collision behavior.
5. Confirm current edit and sync flows persist cleared/updated values across reload, offline recovery and concurrent edits without losing account history.
6. Test full end-to-end account create > lookup > edit > reload > Account Setup > authorized order, including old records with missing fields and all customer roles.

## Cross-device performance and regression requirements
- Desktop: first load, CRM navigation, open 50 accounts, create/edit, save, payment/order unaffected; capture navigations, write-build p50/p95, commit, sync pending; compare to baseline.
- iPhone Safari: first load, Home > CRM > More > Admin > CRM, form keyboard, red validation, profile edit, save and reload. Test narrow and tablet breakpoints, avoid cut-off labels.
- No new render-time full-order/bonus derivations, all-provider navigation subscriptions, duplicate serialization, hot polling, or data reload on every field keystroke.
- Passing CI alone does not establish lack of lag; require role/device smoke and release-owner acceptance.
- Production deployment, tax classification and document verification require explicit authorization.
- No outbound prospect/customer messaging or invoice sending as a form-acceptance test.

## Source references
- Arizona TPT: https://azdor.gov/business/transaction-privilege-tax/tpt-license
- Arizona resale certificate 5000A: https://azdor.gov/forms/tpt-forms/arizona-resale-certificate
- Arizona general exemption certificate 5000: https://azdor.gov/forms/tpt-forms/tpt-exemption-certificate-general
