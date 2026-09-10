# Momentum build notes

## Future referral program

Provisioning reserves `Referral` as an internal hiring source, but it is intentionally not exposed in the current new-hire interface.

When the referral program is approved, add a referral intake path that records the referring employee, referred candidate, qualifying event, bonus amount, eligibility window, approval evidence, payout status, and payroll linkage. Do not activate or calculate a referral bonus until the business rules, economics, eligibility exclusions, payout timing, and audit source are approved.

Until then, ordinary administrator-created hires default internally to `Direct hire`. Accepted-offer linkage may be used only to prefill an existing internal candidate/offer record and should not appear to administrators as a required hiring-source decision.

## Electronic onboarding forms

The Administrator template library is designed around reusable secure PDF templates stored outside browser-local persistence. Momentum stores template metadata, version, field mapping, packet status, signature evidence, and the completed-file storage reference. The underlying PDF bytes belong in the approved secure file store.

The signing flow must support authenticated typed signatures and drawn signatures. Signature capture alone is not enough for regulated forms. Each form must preserve its required content, submission sequence, access/submission audit evidence, retention requirements, and hard-copy/export capability.

Form-specific controls currently reserved in code:

- Form W-4: preserve the required IRS form content/instructions, identify the employee, audit submission access, retain the record, support hard-copy production, and make the employee e-signature the final entry in the electronic submission.
- Form W-9: preserve paper-form information and applicable perjury language, identify the payee, audit submission access, retain the record, support hard-copy production, and use the payee e-signature as the final entry when a signature is required.
- Form I-9: employee completion does not finish the employer process. Preserve the official data sequence/instructions and electronic audit trail. Employee Section 1 is due no later than the first day of employment and may be completed after acceptance of an offer. Employer Section 2 requires a separate employer verification step within three business days after work begins, subject to the short-employment rule.
- Arizona Form A-4: Arizona employees subject to withholding must provide the election to the employer within five days of employment. The employer retains the election. The platform must not treat employee signature capture as proof that payroll withholding setup was reviewed.

Authoritative implementation references to re-check when templates are versioned or regulations change:

- IRS Publication 15-T, electronic Form W-4 requirements: https://www.irs.gov/publications/p15t
- IRS Instructions for Requester of Form W-9: https://www.irs.gov/instructions/iw9
- USCIS Form I-9 instructions and I-9 Central: https://www.uscis.gov/i-9-central
- Arizona Department of Revenue withholding guidance and Form A-4: https://azdor.gov/individuals/withholding-tax-individual

Do not auto-close Form I-9 from the employee signature, invent missing tax elections, preselect employee tax choices, or mark a form complete merely because a PDF file exists. Completion must be tied to the required signed/submitted and, where applicable, employer-reviewed evidence.
