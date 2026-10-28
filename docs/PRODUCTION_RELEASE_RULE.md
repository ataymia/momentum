# Production release rule

A post-launch change may reach production only after:

1. Pull request CI: typecheck, lint, relevant business-logic regressions, Firestore/Storage rules and Functions build pass.
2. Normal path **and exceptions** pass relevant role-based smoke tests in `docs/RELEASE_TEST_MATRIX.md`. Capture > validate > persist > reload > edit > downstream use must be connected. No dead-end forms, placeholder states presented as functioning, or duplicate sources of truth.
3. No existing workflows, audit/creator attribution, commissions, money, access controls, customer data, or order lifecycle are accidentally changed. Existing user and older record behavior has regression coverage.
4. Both mobile Safari and desktop workflow checks pass for navigation, first load, form input/submit, save and major views. Compare actual timings against the last accepted baseline; investigate new lag rather than asserting CI proves performance.
5. Missing required fields and rejected submissions explain the cause at the relevant field (accessible error text, red invalid state, error summary where appropriate). Rejections must never claim a save succeeded.
6. Data privacy/security reviewed for newly collected identifiers and sensitive data; customer/business legality and approval assumptions are resolved.
7. Production release owner explicitly approves the deployment, with rollback and smoke-check owner identified.

A green build alone is **not** production approval. New workflows must be cohesive across permissions, persistent storage, recovery, profile edit, downstream consumers, errors, and cross-device performance. Do not automate confusion or scale an unsafe process.
