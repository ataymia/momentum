# Post-launch findings

Date: 2026-09-15
Branch: `post-launch-fixes-2026-09-15`

## Corrected in this branch

### Onboarding partial-provisioning recovery

A hire could previously end up with a Firebase identity and linked onboarding draft but without the complete HCM onboarding package. That produced an apparently inoperable Submit onboarding experience. The branch now detects structural package gaps, repairs the package idempotently from the trusted draft, preserves employee-entered data and existing access progress, and explains submission blockers in the employee UI.

### Territory behavior

Territory ZIP coverage previously operated as an ownership/access constraint in several workflows. The branch converts territory configuration to geographic guidance. Account responsibility remains explicit. Authorized cross-suggestion sales work is allowed, but Sales Representative deviations require a documented explanation and generate a Territory exception review record for management validation.

### Regression protection

Logic tests now cover onboarding repair, advisory territory behavior, Territory exception persistence/review/notification copy, and the existing provisioning tests. A repository CI workflow now requires typecheck, lint, logic tests, Firestore rules tests, and production build for pull requests and pushes to `main`.

## Confirmed compensation decision, not yet payable in code

Approved standard representative-generated commission split:

- Sales Representative: 2.50% of Qualifying Net Collected Sales
- Sales Manager override: 0.50%
- Maximum combined standard commission: 3.00%

The existing platform does not contain a complete percentage-commission payroll ledger. The new rate must not be retroactively applied by guessing an effective date or by multiplying gross order totals. See `docs/SALES_COMMISSION_POLICY_GAP.md`.

## Security architecture finding requiring a separate controlled change

The current Firestore shared `workspace` and `commercial` domain shards use broad `activeEmployee` write permission. That design lets the client support shared operational state, but it is coarser than the application-level role restrictions. A custom or tampered client may be able to attempt writes to shared collections that the visible UI would not offer, such as territory configuration or other commercial records.

Do not casually tighten these rules in the post-launch hotfix because Sales Representatives and other active roles currently rely on the same shared documents for legitimate account/order/activity writes. The durable correction is to split or shard sensitive record classes by owner/role and enforce least privilege in Firestore, with emulator tests for each role. Treat this as a security-hardening workstream before the platform is considered mature for hostile-client threat models.

## Release blockers

This branch is not production-ready until the automated validation workflow passes and a role-based smoke test confirms the changed onboarding and sales flows. No production deployment should occur from this document alone.
