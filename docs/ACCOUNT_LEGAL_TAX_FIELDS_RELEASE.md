# Arizona account legal identity / validation: release acceptance

**Status: draft, production blocked pending sensitive-data authorization review and workflow acceptance.**

## Source-of-truth and intended behavior
- Each Account is a business location. Its linked CustomerAccount is the billing/legal entity.
- Preserve the storefront/account display name separately from `legalBusinessName` recorded exactly from the business license.
- Capture EIN and AZ TPT license number as distinct identifiers. TPT number is 8 digits per ADOR; optional until collected or a documented exception is approved.
- Tax documentation route: Undetermined / Taxable / Resale Form 5000A / General exemption Form 5000. This is classification only, never proof.
- Reuse existing `taxExemptionStatus` and document workflow; never set Verified or exempt based solely on a typed number.
- Existing accounts display gaps, but should not be silently blocked from review or historical record access.
- New accounts require a legal name and highlight rejected fields at submission. Do not hard-require an EIN/TPT from all legal entity types absent a documented exception process.
- Company-identity edits use existing `updateCustomerCommercial`, authorization, saving journal and record ownership policy; changes are not direct Firestore writes in components.
- Account Setup and account profiles must use the exact same CustomerAccount fields, without duplicative per-location identity copies.

## Mandatory release blockers
1. **Security:** `domains/workspace/fields/customers` and `domains/commercial/fields/_root` are broadly readable by several operational roles. Existing `ein` is sensitive. Before enabling production collection, isolate sensitive EIN access or approve an auditable, least-privilege design with role-based Firestore tests. UI masking alone does not protect backend reads. No new collection until solved.
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
