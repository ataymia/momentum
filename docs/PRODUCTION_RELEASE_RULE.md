# Production release rule

A post-launch fix may reach production only after:

1. The pull request CI validation passes.
2. The changed workflow passes the applicable role-based smoke tests in `docs/RELEASE_TEST_MATRIX.md`.
3. Any money, access-control, or customer-impacting behavior has no unresolved material assumption.
4. The release owner explicitly approves the production deployment.

A green build alone is not production approval.
