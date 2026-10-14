# Momentum HR electronic forms: implementation and release gates
Date: October 14, 2026
Workstream: HR/onboarding compliance
Decision status: **Proposed architecture. Not a live e-sign or legally certified I-9 system.**

## Owner direction and confirmed scope
- No payroll vendor and no production e-sign provider has been selected or purchased.
- Employees should complete the correct I-9, W-4 and Arizona A-4 PDFs during onboarding with embedded DocuSign eSignature.
- Every completed form should appear in the employee's confidential HR file; authorized HR Administrators can review, export and download PDFs.
- HR should receive one actionable completion/review notice, not a stream of sensitive data or duplicate events.
- Firebase continues as the application's storage and identity platform.
- Payroll vendor selection is a separate decision. Capturing a W-4 does not calculate, withhold or remit payroll taxes.

## Build versus buy: recommendation
**Buy the specialized signing transport, build the Momentum workflow.**
- Use DocuSign's production eSignature API and embedded recipient signing, with official fillable PDF templates, required fields and signature routing.
- Do not attempt to replicate a vendor-grade signature engine, signer identity, consent, certificates, or notarization within Momentum.
- Use server-verified completion signals to retrieve the final document and Certificate of Completion from DocuSign.
- Store them in Firebase under service-only writes and employee/Administrator-controlled reads.
- A free DocuSign developer account can test in non-production; its envelopes are **not** legal live-signing output. A production API plan and go-live approval are required.
- Published DocuSign Developer **Starter** begins at **$50/month billed annually**, starting at **40 envelopes/month** (verify vendor quote, inclusion of embedded signing, ID verification and extra fees before purchase).
  Official provider links:
  - https://ecom.docusign.com/en-US/plans-and-pricing/developer
  - https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/embedding/

## End-to-end workflow and owners
1. HR Administrator creates/approves an employee's onboarding package and start date. Server creates new required form assignments with exact issuer form editions. Assignments are scoped to Firebase Auth user ID and employee identity and never include SSNs in workspace state.
2. Employee signs into Momentum, opens **HR → Onboarding → Required forms**, and selects a PDF. Trusted backend uses provider templates and embedded-signing recipient view for that employee's authenticated session. The provider collects typed fields, employee signature and acceptance of electronic records.
3. W-4 uses the actual current IRS form, complete required steps, employee perjury declaration and signature as **final entry**. A-4 uses the current ADOR form with the appropriate withholding choices. Employer must preserve any new tax elections and make them available to the future payroll provider; do not infer rates from generic UI checkboxes.
4. I-9 is **two-party and two-stage**: employee Section 1 due by first day of work; authorized employer representative examines acceptable documents and completes/signs Section 2 generally within three business days. Physical examination is the launch default. Remote alternative is disabled until the employer's E-Verify eligibility, procedures and hiring-site compliance are verified. The platform cannot treat photo uploads or DocuSign ID Verification alone as Section 2.
5. DocuSign sends verified completion via signed provider webhook; the backend verifies event authenticity and envelope status independently before retrieving **final signed PDF and Certificate of Completion**. An employee/browser redirect never marks a form complete.
6. Backend validates the document and certificate, computes SHA-256 hashes, stores **immutable objects** at `hr-private/{employeeUid}/{I9|W4|AZ_A4}/{artifactId}/{signed.pdf|certificate.pdf}` with no client-issued public token links, then writes the server-owned `hrSignedFormRecords` receipt and an append-only `hrSignedFormAudit` event.
7. HR Administrator receives a minimal in-app alert only when server-verified review or archive milestones occur. The notice includes form type, employee reference and actionable state, never SSN, tax selections, document images or signed links.
8. Employee sees their own form status/versions and downloads through signed-in Firebase auth; only active Administrators can access others' records. Managers, Marketing, customers, and separated identities have no cross-person HR form access.
9. Rejected, expired, voided and corrected envelopes leave prior signed originals and history intact. Replacement is a **new artifact/version**, never overwrite. An authorized reviewer resolves errors and records why.
10. Evidence can be produced for a lawful inspection via an audited administrator export with full form and certificate. A tested retrieval/backup and restoration procedure is required before launch.

## Compliance requirements and acceptance gates
| Form | Requirement | Release acceptance evidence |
|---|---|---|
| I-9 | Current government edition; proper Section 1/2 identity and attestations; prompt section deadlines; audit and legible retrievable records | Actual provider template and signed employer workflow reviewed; live/sandbox scenario evidence, secure retention/retrieval; counsel approval |
| W-4 | 2026 IRS form, all relevant text/worksheets, identity-linkage, perjury declaration, last-action signature, documented accesses, reproducible copy | Template field map audited against IRS form; recorded final-signature order, perjury text, signed printable PDF; tax/payroll review |
| AZ A-4 | Current ADOR A-4, timely new-hire completion, signed withholding election | Current form edition and filled PDF checked with Arizona payroll professional; 5-day due date and default withholding exception represented |
| All | Secure signer identity, e-sign consent, retention, audit, role access, revocation, recoverability, no SSN logging | Authenticated employee/admin/cross-role tests; signed webhook dedup tests; hash matching; backup/recovery exercise |

**No blanket "compliant" claim** is appropriate until the above controls, official form editions, live identities, third-party provider terms and employer practices are independently validated.

## I-9 storage and deadline controls
- Employee Section 1: first day of work for pay; employer Section 2: generally three business days after first day, with short-duration hire exceptions.
- Form I-9 minimum retention: later of 3 years after hire or 1 year after separation. Keep all records through litigation/inspection holds; calculate but do **not** automatically purge.
- Electronic storage requires tamper-resistance, access controls, indexing, legible export, security, audit, business-process documentation and recovery.
- A correct PDF signing transaction **does not** perform identity/work-authorization inspection.
- Explicit employer representative identity and mode of examination must be captured and authenticated.

## Firebase control implementation, Phase 1
- `storage.rules`: only employee's own HR originals and active Administrators may `get` signed PDFs/certificates; client list/write/delete is denied, including for Administrators. Backend Admin SDK writes bypass rules only in controlled verified processes. No use of shared training/Marketing file paths.
- `firestore.rules` and its generator: clients can only read their own receipt metadata (or Administrators can read all). No client can create/update/delete archived receipt or audit records.
- `lib/hr-electronic-forms.ts`: non-sensitive record model, guarded private artifact paths, archive evidence checks and I-9 minimum retention review calculator.
- Emulator tests verify cross-person denial, admin own-role access, lack of client write access, and protected metadata. No user document contents are used in the tests.

## Phase 2: pending provider + server integration
- Confirm employer's actual legal entity and designated HR document custodian, DocuSign tenant ownership, annual spending authority, form editions and DocuSign template IDs (employee, employer roles, fields and perjury/consent).
- Build authenticated Firebase HTTPS/Callable endpoints for envelope issuance and embedded signer redirect. Provider OAuth credentials only in Firebase Secret Manager, never in frontend/public env.
- Configure signed webhook callbacks, replay resistance, idempotent state machine and independent envelope status checks, final document/certificate download, secure Storage writes, receipt/audit transaction and document notifications.
- Build employee own-document list, HR review queue, secure download/export, due date/reminders and corrective/reissuance flow. Do **not** expose a fake electronic signing button before the production integration is ready.
- Implement retention holds, read/download audits, narrow IAM, private error logging, encryption/privacy review and tested disaster recovery.

## Phase 3: acceptance and cutover
- Use only synthetic employee identities in demo tests, never personal SSNs or actual employment documents.
- Test employee, HR Administrator, manager, separated employee, customer, expired token and simultaneous signers.
- Test current PDF edition, fields, W-4 signature-last behavior, I-9 Section 2, incorrect/missing document, retry, duplicate webhook, provider outage, storage outage and final PDF/certificate download.
- Confirm forms from older external workflows remain **external verification only**, not deceptively backfilled as signed in Momentum.
- Run real employee migration only after counsel/security/provider approval and a written go-live decision.

## Source-of-truth regulations and provider docs
- USCIS Form I-9: https://www.uscis.gov/i-9
- 8 CFR 274a.2 (electronic systems, records, signatures, retention): https://www.ecfr.gov/current/title-8/chapter-I/subchapter-B/part-274a/section-274a.2
- E-Verify optional alternative exam: https://everify.uscis.gov/ica-docs/cases/appendix/field-definitions/remote-examination-of-documents-procedures
- IRS 2026 Publication 15-T, W-4 electronic submission: https://www.irs.gov/publications/p15t
- IRS current W-4: https://www.irs.gov/forms-pubs/about-form-w-4
- Arizona 2026 A-4: https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election
- Arizona withholding due dates: https://azdor.gov/business/withholding-tax
- DocuSign API: https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/embedding/
- DocuSign plans: https://ecom.docusign.com/en-US/plans-and-pricing/developer

## Decisions needed from Momentum owner
1. Approve or reject DocuSign as **paid** API provider after written cost and envelope quote. Do not buy without owner authorization.
2. Name official employing entity, HR compliance custodian and I-9 document examiner/authorized agents.
3. Confirm whether employer is enrolled in E-Verify and, if so, hiring-site/remote-verification eligibility. Default remains in-person.
4. Approve document retention, download access, backup scope and privacy policy with employment counsel.
5. Choose future payroll provider independently; its APIs may consume approved W-4/A-4 elections later.

**Next engineering gate:** Dev-tenant DocuSign API access + employer/legal policy confirmation. Phase 1 introduces no live employee submissions or outbound notices.
