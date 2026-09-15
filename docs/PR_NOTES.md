# Pull request notes

## Summary

Fixes the first post-launch onboarding and territory issues without deploying them directly to production.

## Key changes

- Repairs structurally incomplete onboarding packages from the trusted new-hire draft without resetting valid progress.
- Makes onboarding submission blockers explicit.
- Converts territory ZIPs from ownership/access locks to geographic suggestions.
- Preserves explicit account ownership when ZIP suggestions change.
- Requires a reason and creates a management-review Territory exception for Sales Representative work outside the configured suggestion.
- Aligns account and territory screens with the advisory model.
- Adds regression tests and CI validation.
- Records the approved 2.50% Sales Representative + 0.50% Sales Manager commission decision, while keeping percentage payroll automation blocked until its written effective date and full Qualifying Net Collected Sales controls are defined.

## Do not merge unless

CI passes and the affected roles pass the smoke matrix in `docs/RELEASE_TEST_MATRIX.md`.
