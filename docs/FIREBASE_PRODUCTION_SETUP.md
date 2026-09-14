# Firebase production setup

Momentum runs as a static bundle on Firebase Hosting. Every engine executes in the browser and talks to
Firebase Authentication and Cloud Firestore over their REST APIs. There is no application server, so
**all** access control lives in `firestore.rules`.

| Resource | Value |
| --- | --- |
| Firebase project | `momentumdis` (project number `491976021038`) |
| Hosting site | `momentumdis` → <https://momentumdis.web.app> |
| Firestore | `(default)`, `nam5` multi-region |
| Web app id | `1:491976021038:web:40525e54b9f28bd0983bbf` |

---

## 1. Build-time configuration

`.env.production` holds the Firebase web app configuration and is committed on purpose. These identifiers
are public by design — Firebase embeds them in every browser bundle and they grant no authority on their
own. Access is decided by `firestore.rules` plus the `userAccess/{uid}` record an Administrator writes.

> Never put a service-account key, an admin secret, or a private key in this repository. Momentum does not
> use the Firebase Admin SDK anywhere.

If the web app is ever re-created, refresh the file with:

```bash
firebase apps:sdkconfig WEB 1:491976021038:web:40525e54b9f28bd0983bbf --project momentumdis
```

`lib/firebase-config.ts` requires **all six** variables; if any is blank the app renders the
"Firebase is not configured" gate instead of a sign-in screen.

## 2. Firebase console prerequisites

1. **Authentication → Sign-in method → Email/Password: enabled.**
   Momentum has no public signup screen, but it calls `accounts:signUp` while an Administrator provisions a
   new hire, so account creation must stay enabled for that provider.
2. **Authentication → Settings → Authorized domains** must include `momentumdis.web.app`,
   `momentumdis.firebaseapp.com`, and any custom domain.
3. **Firestore** must exist. It does; re-create with
   `firebase firestore:databases:create "(default)" --location nam5`.

## 3. Claiming the first Administrator

There is no seeded admin account and no self-signup. The first Administrator bootstraps themselves:

1. Create a Firebase Authentication user for the owner's work e-mail (Firebase console → Authentication →
   Add user), or sign in once so Momentum can offer the verification e-mail.
2. Sign in at <https://momentumdis.web.app>. Momentum finds no `userAccess/{uid}` document and shows the
   **"Signed in, awaiting access"** gate.
3. Click **Send verification e-mail**, open the link, then click **I have verified**.
4. Enter a full name and title, then **Claim Administrator access**.

Security Rules permit this only when *all* of the following hold:

- the ID token carries `email_verified == true`;
- the lower-cased e-mail is in `bootstrapEmails()` inside `firestore.rules`;
- the document being written is the claimant's **own** `userAccess/{uid}`, with
  `role == 'Administrator'` and `accountState == 'Active'`.

The allow-list lives at the top of `scripts/generate-firestore-rules.ts`:

```ts
const BOOTSTRAP_ADMIN_EMAILS = [
  "vixarynholdings@gmail.com",
  "ataymia.murray@allstarservicesnow.com",
];
```

**Trim this list once real Administrators exist.** It is the only path that bypasses Administrator
provisioning. After editing, run `npm run rules:build && npm run test:rules` and redeploy.

## 4. Provisioning everybody else

The Administrator adds staff from **Human Resources → New hire setup**. For each hire Momentum:

1. calls `accounts:signUp` to mint the Firebase identity (the returned token is discarded immediately, so
   the Administrator's own session is untouched);
2. writes `userAccess/{uid}` — the authority Security Rules consult for role, reporting line, and account
   state;
3. writes `employeeDirectory/{uid}` — the workspace-facing profile every employee may read;
4. stamps `platform/meta` so other open sessions pick the change up on their next poll.

A brand-new identity has no `userAccess` document, so the rules deny it everything until step 2 lands.
New hires start at `accountState: "Password change required"` and move through the onboarding portal;
the shared, `activeEmployee`-gated workspace stays closed until an Administrator marks them `Active`.

## 5. Data layout

Each engine keeps its state as one JSON document under a `momentum-*` storage key. In production that
document is sharded so the rules can gate it by role *and* by owner:

```
domains/{domainId}/fields/{field}        shared array field   -> { items: [...] }
domains/{domainId}/fields/_root          non-array remainder  -> { data: {...} }
userDomains/{uid}/{domainId}/{field}     per-user shard       -> { items: [...] }
```

Identity and coordination documents sit outside that scheme:

```
userAccess/{uid}           role, reporting line, account state (Administrator-written)
employeeDirectory/{uid}    workspace-facing profile
platform/bootstrap         one-time marker for the first Administrator claim
platform/meta              per-document version stamps used for change polling
```

`lib/persistence.ts` primes every readable document before the provider tree mounts, writes back with
`updateTime` preconditions, and resolves conflicts with a record-level three-way merge.

## 6. Keeping rules and client in sync

`lib/firestore-domains.ts` decides which documents the browser fetches and writes. `firestore.rules`
decides which ones Firestore actually serves. If they disagree, Momentum silently parks writes as
"denied" and an employee loses data.

To make that impossible, **`firestore.rules` is generated** from the same table:

```bash
npm run rules:build   # regenerate firestore.rules from lib/firestore-domains.ts
npm run test:rules    # run the generated rules against the Firestore emulator
```

`tests/firestore-rules.test.ts` asserts convergence directly: for every actor role, every document
`domainDocuments()` plans to read must actually be readable, and `documentWritable()` must agree with the
rules for both permitted and denied writes. Never hand-edit `firestore.rules`.

## 7. Deploying

```bash
npm ci
npm run typecheck && npm run lint && npm run test:rules
npm run build                      # static export into out/
firebase deploy --only hosting     # or: npm run deploy
firebase deploy --only firestore:rules,firestore:indexes
```

Hosting serves HTML with `no-cache` and content-hashed assets as `immutable`, so a deploy takes effect on
the next page load. The `Content-Security-Policy` header restricts `connect-src` to the three Google
endpoints Momentum actually uses; add to it if you introduce another backend.

## 8. Operational notes

- **Local demo mode** (`localStorage`, seeded fake data) is only reachable from `localhost`; see
  `demoCapabilityEnabled()` in `lib/runtime-mode-store.ts`. Deployed builds are always in production mode.
- **Sessions** live in `sessionStorage` and refresh through `securetoken.googleapis.com`. Closing the tab
  ends the session.
- **Denied writes** are surfaced in the sync-status pill and logged to the console with the offending
  document path — that is the signal that the rules and the domain table have drifted.
- An Administrator can never change their own role or account state; that requires a second Administrator.
