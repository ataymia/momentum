# Firebase authentication and provisioning integration handoff

Date: 2026-09-21
Branch: `platform-username-territory-2026-09-21`
Firebase project: `momentumdis`
Functions region: `us-central1`

## Identity invariant

Momentum must maintain one employee identity, not parallel username and e-mail accounts.

`work e-mail OR username + same password -> same Firebase Auth uid -> same Momentum access and onboarding state`

E-mail/password sign-in remains permanently supported. Username sign-in is an alias layer that privately
resolves `usernames/{username}` to the employee's Firebase identity and then authenticates that same
credential with Firebase Authentication.

## Browser integration prepared on this branch

The browser no longer calls the old Cloudflare username-authentication routes. `lib/firebase-functions.ts`
builds Firebase Function URLs, with an optional `NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL` override for a
preview/emulator environment.

Expected browser calls:

| Browser operation | Firebase Function |
| --- | --- |
| Username + password sign-in | `usernameSignIn` |
| Password reset initiated from username | `usernamePasswordReset` |
| Forgotten-username request | `usernameReminder` |
| Create/recover employee Firebase identity | `provisionEmployee` |
| Check provisioning/recovery status | `provisioningStatus` |
| Permanently delete employee identity | `deleteEmployee` |

Direct e-mail/password sign-in, token refresh, authenticated password change, e-mail verification, and
password reset initiated from an e-mail continue to use Firebase Authentication directly.

Both Firebase Hosting and Cloudflare header configuration allow browser connections to:
`https://us-central1-momentumdis.cloudfunctions.net`.

## Required backend behavior

### `usernameSignIn`

Request:

```json
{ "username": "jsmith", "password": "employee-password" }
```

Server behavior:

1. Normalize the username with Momentum's canonical username rules.
2. Read private `usernames/{username}` with Firebase Admin.
3. Resolve the employee's e-mail and expected uid.
4. Use Firebase Identity Toolkit `accounts:signInWithPassword` with that e-mail/password.
5. Refuse the result if Firebase returns a different uid than the private index expects.
6. Return the Firebase `idToken`, `refreshToken`, uid, e-mail, and expiry.
7. Use the same generic error for an unknown username and a bad password.

### `usernamePasswordReset`

Resolve the username privately, ask Firebase Authentication to send the reset e-mail, and return at most a
masked address such as `m***@g***.com`. The public response must not reveal whether an arbitrary username
exists beyond the existing privacy behavior.

### `usernameReminder`

Accept an e-mail and, when it matches an employee, create/update the protected Administrator reminder
record. The response is intentionally the same for a match and a miss. This is optional convenience only:
an employee who remembers the e-mail can always sign in with it directly.

### `provisionEmployee`

Administrator-only. Verify the caller's Firebase ID token and confirm `userAccess/{callerUid}` is an Active
Administrator before doing anything privileged.

The request carries one e-mail, one temporary password, one username, and the employee profile. The server
must validate the role/team pairing and username again. It must reject a username already owned by another
uid.

Create a new Firebase Auth identity by e-mail, or safely adopt an orphan Firebase Auth identity that exists
without Momentum access records after a prior partial failure. Never create a second Firebase identity for
the username.

For a successful hire, write the authoritative linkage consistently:

- `userAccess/{uid}` includes e-mail, username, role/team/reporting fields, and
  `accountState: "Password change required"`.
- `employeeDirectory/{uid}` includes the same e-mail and username plus directory/profile fields.
- `usernames/{username}` contains `{ uid, email, updatedAt, updatedBy }` and remains unreadable by browser
  clients.
- `userDomains/{uid}/identity/records` contains the provisioning record.

The employee must then be able to use either the e-mail or username with the same temporary password and
arrive at the exact same password-change workflow.

### `provisioningStatus`

Administrator-only. Given an e-mail, report whether the Firebase identity exists, whether the Momentum
access record exists, and whether an orphan identity is recoverable. This supports retrying a partial hire
without duplicating the Auth account.

### `deleteEmployee`

Administrator-only and self-deletion must be refused. Delete the Firebase Auth identity, the employee's
access/directory records, their private username index entry, and the employee-specific persisted shards
that the existing deletion contract covers. Deleting an employee must free both the e-mail and username
for valid future use without leaving an orphan alias.

## Username rules

Use the canonical behavior in `lib/username.ts`:

- normalize Unicode accents with NFD folding
- lowercase
- remove punctuation/spaces/non-`a-z0-9`
- maximum 32 characters
- username must begin with a letter and be at least 2 characters
- generated default is first initial + surname
- collisions receive numeric suffixes (`jsmith2`, `jsmith3`, ...)

Do not introduce a second normalization algorithm in Functions that can disagree with the browser/migration
logic.

## Backend work remaining in the Codespace

1. Preserve the local uncommitted `functions/` work before pulling this branch. The remote branch now
   contains the client-side integration changes made while the backend work remained local.
2. Merge the local Firebase Functions block into `firebase.json` while preserving the new CSP Function
   origin already on this branch.
3. Rename any Functions parameter still called `FIREBASE_WEB_API_KEY` to a non-reserved name such as
   `MOMENTUM_FIREBASE_WEB_API_KEY`.
4. Run Functions lint/build.
5. Run targeted client typecheck/lint and resolve only actual migration problems before mixing in unrelated
   Territory cleanup.
6. Configure the Firebase Function parameter.
7. Review production CORS/origin policy and abuse protection before release.
8. Deploy Firebase Functions only. Do not deploy the Cloudflare Worker as part of this change.
9. Perform the end-to-end checks below before lifting the deployment hold.

## End-to-end acceptance checks

- Existing employee e-mail/password login still succeeds.
- The same employee's username/password login succeeds.
- Both methods produce the same Firebase uid.
- Temporary password works through both identifiers.
- Both identifiers land on `Password change required` for a new hire.
- After changing the temporary password, both identifiers accept the new password and reject the old one.
- Direct e-mail password reset works.
- Username password reset sends to the same Firebase Auth e-mail.
- Forgot username does not block login by e-mail.
- New-hire account creation writes the private username index and both employee records consistently.
- Duplicate e-mail is refused without creating another account.
- Duplicate username is refused authoritatively by the backend.
- An orphan Firebase Auth identity can be recovered without creating a second uid.
- Employee deletion removes the username alias and frees the sign-in identifiers as intended.
- Existing Cloudflare Worker behavior remains unchanged.

## Explicit non-goals for this migration

- Do not move passwords into Firestore.
- Do not make `usernames/{username}` browser-readable.
- Do not create separate Firebase accounts for username and e-mail.
- Do not remove e-mail sign-in.
- Do not deploy new username-authentication logic to the Cloudflare Worker.
- Do not treat the unfinished Territory work as part of this authentication release gate.
