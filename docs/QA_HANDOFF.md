# QA handoff

Release candidate branch: `post-launch-fixes-2026-09-15`

Do not deploy this branch directly. Open/review the pull request, require CI to pass, then run the role-based smoke matrix before merge.

Highest-risk regression areas:

1. New-hire provisioning and account-state synchronization
2. Cross-suggestion account creation, assignment, appointment scheduling, and order creation
3. Territory exception approval visibility for the correct manager
4. Account responsibility remaining stable after ZIP/territory changes
5. Production Firestore persistence after refresh and across sessions
6. Existing order/payment/bonus attribution remaining unchanged by the territory refactor

Any failure in identity, authorization, payment attribution, or production persistence is release-blocking.
