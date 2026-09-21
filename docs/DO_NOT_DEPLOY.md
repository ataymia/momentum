# Deployment hold active (2026-09-21)

Do not deploy this branch to production yet.

The browser-side Momentum platform is being migrated so username authentication and privileged employee
account provisioning use Firebase Functions while e-mail/password sign-in continues to authenticate the
same Firebase identity directly. The client integration is prepared on this branch, but the matching
Firebase Functions backend still needs to be synchronized from the working Codespace, configured,
deployed, and tested end to end before this branch is production-ready.

Release conditions:

- Firebase Functions exist for `usernameSignIn`, `usernamePasswordReset`, `usernameReminder`,
  `provisionEmployee`, `provisioningStatus`, and `deleteEmployee`.
- The Functions configuration uses the intended Firebase Web API key parameter and does not rely on a
  Cloudflare Worker secret.
- A new employee is represented by one Firebase Auth uid, one e-mail, one username alias, and one password.
- The new-hire flow writes `userAccess/{uid}`, `employeeDirectory/{uid}`, `usernames/{username}`, and the
  identity provisioning record consistently.
- E-mail login and username login are both verified to return the same uid and enter the same first-login
  password-change/onboarding workflow.
- Password reset works from either e-mail or username without exposing another employee's mailbox.
- Duplicate usernames, orphan-identity recovery, employee deletion, and username-index cleanup are tested.
- Firestore rules/tests, targeted client lint/typecheck, Functions lint/build, and the production build pass.
- The existing Cloudflare Worker remains unchanged unless a separate infrastructure change is explicitly
  approved. Do not run `wrangler deploy` as part of this authentication migration.

See `docs/FIREBASE_AUTH_FUNCTIONS_HANDOFF.md` for the integration contract and completion checklist.
