# HR Form Sources & Secure Document Workflow

**Review date:** November 7, 2026 · **Checklist:** R42–R49  
**Status:** Official form sources identified; the secure employee PDF completion/submission pipeline is **NOT implemented or approved**.

## Official form sources (check edition again before release)

| Document | Worker/application | Official landing page | Current source file or instructions |
|---|---|---|---|
| USCIS Form I-9 | Employees whose employment eligibility must be verified | https://www.uscis.gov/i-9 | https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf |
| IRS Form W-4, 2026 | Employee federal withholding | https://www.irs.gov/forms-pubs/about-form-w-4 | https://www.irs.gov/pub/irs-pdf/fw4.pdf |
| Arizona Form A-4, 2026 | Employees subject to Arizona withholding | https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election | https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4_f.pdf |
| IRS Form W-9 | Applicable independent contractors/vendors, **not** a substitute employee withholding form | https://www.irs.gov/forms-pubs/about-form-w-9 | https://www.irs.gov/pub/irs-pdf/fw9.pdf |

Form I-9 is a special process. The official fillable PDF is not, by itself, an approved electronic I-9 signature solution. A compliant electronic I-9 system must meet 8 CFR 274a.2 electronic generation, signature, storage, audit, retrieval and integrity requirements; otherwise follow the official paper-signature process. See https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274/101-form-i-9-and-storage-systems.

Arizona's 2026 A-4 instructions require applicable newly hired employees to submit the form within five days of employment; employers generally withhold at the prescribed default if it is absent. Source: https://azdor.gov/forms/withholding-forms/arizona-withholding-percentage-election. Confirm status and worker classification before assigning employee forms.

## Required future authorized workflow (not a mock upload button)

1. **HR template approval:** Administrator chooses official form and edition; records source URL, download date, revision/effective date, classification applicability, file hash, version, approver and retention policy. Templates live in restricted HR form library.
2. **Employee assignment:** HR selects the correct employee and required form. No cross-user document assignment; only identity-linked records appear in the employee's Account.
3. **Employee draft:** Authenticated employee opens the authorized, version-locked PDF using a suitable accessible fillable editor. A resumable draft is private, with no sensitive document payload in browser localStorage, logs, or CSV exports.
4. **Signature and identity:** Each form gets a *form-specific* signature/acknowledgment implementation, with verified signatory and consent record. I-9 employee and employer sections, document examination, reverification, and any remote-examination eligibility must follow USCIS rules. Do not equate typing a name with legal electronic signature compliance.
5. **Secure submission:** Server validates Firebase identity, assignment, template edition, required fields and applicable form-specific controls. Original completed file lands in restricted durable storage; a separate metadata record references its canonical object and immutable revision.
6. **HR review and correction:** Assigned HR reviewer accepts or returns with reason. Corrections create new versions without silently rewriting the signed original. Separate employee-facing status from authoritative HR verification.
7. **Employee records:** The correct employee profile's Documents area and authorized HR employee-document register show submission state, revision, reviewer and retention details. Sensitive originals are only retrievable with server-enforced authorization; I-9 storage/inspection rules may require distinct compartmentalization.
8. **Retention and recovery:** Identity-bound access logs, document encryption, retention timers, audit trails, tamper detection, re-download permissions, backups and retrieval/inspection exports are independently tested.
9. **Completion gate:** A PDF upload is evidence of an uploaded file, **not** automatic proof of employee classification, withholding setup, work authorization, employer signature, or completed onboarding.
10. **User journey acceptance:** Hire created → form assigned → employee notified → accessible draft → compliant completion → signed/submitted → reviewer decision → correction/resubmission → correct employee documents and HR library → auditable retention.

## Current implementation state

- `lib/hr-document-controls.ts` lists official form source pages and an external-verification metadata guard.
- `components/prototype/hr-compliance-readiness-experience.tsx` displays form sources and administrative readiness gaps.
- `components/prototype/hr-onboarding-experience.tsx` tracks local demonstration evidence without a trusted original-document upload.
- `components/prototype/employee-account-experience.tsx` displays only the signed-in user's document metadata, not unrestricted PDF originals.
- No compliant end-to-end document assignment, signed PDF editor, server-side file submission, reviewer routing or secure completed-file retrieval has been established in this audit.

**Do not mark R43–R49 complete.** Their secure workflow and legal controls remain substantive development work.
