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
   Momentum has no public signup screen and the browser never creates identities. Accounts are minted by
   the Cloudflare Worker with the Admin API, but the provider itself must stay enabled so employees can
   sign in and change their password.
2. **Authentication → Settings → Authorized domains** must include `momentumdis.web.app`,
   `momentumdis.firebaseapp.com`, and the production custom domain `momentum-dci.com`.
3. **Firestore** must exist. It does; re-create with
   `firebase firestore:databases:create "(default)" --location nam5`.

## 3. Claiming the first Administrator

There is no seeded admin account and no self-signup. The two founding Administrator bootstrap identities
for Momentum Distribution Inc are:

- `vixarynholdings@gmail.com`
- `momentumdistributioninc@gmail.com`

No other address may claim Administrator. The first Administrator bootstraps themselves:

1. Create a Firebase Authentication user for one of the two addresses above (Firebase console →
   Authentication → Add user), or sign in once so Momentum can offer the verification e-mail.
2. Sign in to the app. Momentum finds no `userAccess/{uid}` document and shows the
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
  "momentumdistributioninc@gmail.com",
];
```

**Trim this list once real Administrators exist.** It is the only path that bypasses Administrator
provisioning, so every entry is a standing privilege-escalation route. After editing, run
`npm run rules:build && npm run test:rules` and redeploy.

## 4. Provisioning everybody else

The Administrator adds staff from **Human Resources → New hire setup**. The browser cannot create Firebase
identities: it calls `POST /api/admin/provision-employee` on the Cloudflare Worker, which

1. verifies the Administrator's Firebase ID token against Google's JWKS (signature, `aud`, `iss`, `exp`);
2. confirms `userAccess/{caller}` is `role: Administrator` **and** `accountState: Active` — Firestore stays
   the authority, so an Auth identity alone proves nothing;
3. re-validates the request server-side, refusing any attempt to mint an `Administrator` or to put a role
   on the wrong team;
4. creates the Firebase identity with the Admin API, or **adopts an orphan identity** left by a previous
   partial attempt instead of creating a duplicate;
5. writes `userAccess/{uid}`, `employeeDirectory/{uid}` and `userDomains/{uid}/identity/records` in a single
   atomic commit, so provisioning can never half-succeed;
6. stamps `platform/meta` so other open sessions pick the change up on their next poll.

The service-account key lives only in the `FIREBASE_SERVICE_ACCOUNT` Worker secret. It is never in the
repository, never in a `NEXT_PUBLIC_*` variable, and never sent to a browser:

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --name momentum   # paste the service-account JSON
```

Administrator access is deliberately **not** obtainable from this endpoint. It is either bootstrapped
(section 3) or granted to an existing employee from **Settings → Firebase identities & access**, which goes
through `userAccess` where Security Rules can police it.

A brand-new identity has no `userAccess` document, so the rules deny it everything until step 5 lands.
New hires start at `accountState: "Password change required"` and move through the onboarding portal;
the shared, `activeEmployee`-gated workspace stays closed until an Administrator marks them `Active`.

If step 5 ever fails, the Firebase identity is **kept on purpose**. Reopen the hire in the provisioning
queue and run it again: `POST /api/admin/provisioning-status` reports whether an address is `recoverable`,
and re-running provisioning adopts the existing uid rather than creating a second account.

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
