# Changeset scope

## In scope

- Onboarding package recovery and clearer employee blocker feedback
- Advisory territory guidance
- Documented territory exceptions and manager validation
- Account UI alignment with advisory territory semantics
- Regression tests and CI guardrails
- Compensation decision documentation

## Explicitly out of scope for this changeset

- Production deployment
- DNS or custom-domain changes
- Firebase Hosting changes
- Mailchimp integration
- New percentage-commission payroll calculations before the effective-date decision and commission-ledger controls are complete
- Broad Firestore data-model/security refactor

These exclusions are intentional. They keep the post-launch correction reversible and prevent a bug-fix release from quietly becoming an infrastructure or payroll redesign.
