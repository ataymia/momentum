# Post-launch fix branch summary

This branch contains the first production follow-up corrections after Momentum launch.

Primary scope:

- Recover partial onboarding packages without duplicating identities or resetting valid employee progress.
- Replace silent/dead onboarding submission behavior with explicit blocker guidance.
- Convert sales territories from hard geographic locks to advisory geographic suggestions.
- Require documented Sales Representative exceptions when work falls outside the suggestion and route those exceptions to management review.
- Preserve explicit account responsibility instead of deriving ownership from ZIP.
- Add regression tests and CI release gates so these workflows are checked before future merges.
- Record the confirmed 2.50% representative + 0.50% manager commission decision while preventing an unsafe retroactive payroll implementation before an effective date is approved.

See:

- `docs/POST_LAUNCH_FINDINGS.md`
- `docs/POST_LAUNCH_REGRESSION_CHECKLIST.md`
- `docs/RELEASE_TEST_MATRIX.md`
- `docs/SALES_COMMISSION_POLICY_GAP.md`
- `docs/COMPENSATION_DECISION_LOG.md`
