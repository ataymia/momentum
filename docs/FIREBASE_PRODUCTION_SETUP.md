# Momentum Firebase production setup

## Required project decisions

Do not create a second project if Momentum already has an approved Firebase/Google Cloud project. The Firestore database location is an owner/project decision and is intentionally not hard-coded in the repository.

## Console setup

1. Open the approved Firebase project.
2. Register a Web app for Momentum if one does not already exist.
3. Copy the Web app configuration object. Momentum needs: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
4. Enable Authentication > Sign-in method > Email/Password. Leave account creation enabled: Momentum's Administrators create employee identities from inside the app with the public web key, and an identity without a `userAccess` record can read nothing. Do not add any public sign-up UI.
5. Create the default Cloud Firestore database in Production mode if it does not already exist. Confirm the database location before creating it because this is not a casual later change.
6. Enable Cloud Storage if onboarding/document upload will be used.
7. Deploy `firestore.rules` and `storage.rules` before production users are invited (`npm run firebase:deploy:rules`).
8. After the final production hostname is known, configure Firebase App Check for the web app.

## Application configuration

The public web application reads these build-time variables (locally from `.env.local`; in CI from repository variables or secrets consumed by `.github/workflows/pages.yml`):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

These values are the Firebase Web app configuration, not a service-account credential. Never place a service-account private key in the browser bundle or repository.

## Bootstrap administrator

The rules never let a client grant itself Administrator access casually. The first Administrator is bootstrapped under a rules-controlled path:

1. Decide the two all-powerful Administrator work e-mails (you and the owner) and list them, lower-case, in `firestore.rules` → `function bootstrapEmails()`. While that list is empty the rules fall back to a one-time first-come claim by any **e-mail-verified** account, so fill the list before inviting anyone else.
2. Deploy rules: `npm run firebase:deploy:rules` (after `firebase login` / `firebase use <project>`).
3. Create the Authentication user without touching the console: `npm run firebase:create-auth-user -- owner@company.com`. The script prints a temporary password and sends the verification e-mail.
4. Sign in to Momentum. With no `userAccess/{uid}` record the app shows the access screen: verify the e-mail, then **Claim Administrator access**. One atomic commit writes `platform/bootstrap`, `userAccess/{uid}` (Administrator · Active), `employeeDirectory/{uid}`, and the identity record.
5. The second Administrator is created from Administration → *Create Administrator account* (or may self-claim if listed in `bootstrapEmails()`).

Everyone after that is created **inside the app** by an Administrator: Human Resources → New hire setup → *Create Firebase identity*. The Administrator's own session is never disturbed; the new employee receives a temporary password (or a password-setup e-mail), must rotate it at first sign-in, and then completes the onboarding controls before an Administrator activates the account.

## Data model

Every Momentum engine keeps its state as one JSON document keyed `momentum-*`. In production `lib/persistence.ts` swaps `localStorage` for a Firestore-backed cache that is primed before the engines mount, then decomposes each state into role/owner-gated documents (`lib/firestore-domains.ts` is the single source of truth and `tests/firebase-boundary.test.ts` checks the rules mirror it):

| Path | Purpose | Read | Write |
| --- | --- | --- | --- |
| `userAccess/{uid}` | Authority for role, team, reporting line, account state | self, Administrator | Administrator (bootstrap: self once) |
| `employeeDirectory/{uid}` | Workspace-facing profile (`WorkspaceUser`) | anyone with an access record | Administrator |
| `platform/bootstrap`, `platform/meta` | Bootstrap marker; change-detection versions | signed-in / access holders | rules-limited |
| `domains/{domain}/fields/{field}` | Shared engine fields (`{items:[…]}`; `_root` holds scalars) | per domain: active employees, sales roles, or Administrator only | per domain/field |
| `userDomains/{uid}/{domain}/{field}` | Per-employee shards: time records, HR private data, compensation, expenses, payroll statements, identity state, field tracking, audit trail… | self, Administrator, Sales Manager for direct reports (except identity, payroll, audit, compensation) | owner (unless the field is a management decision), manager, Administrator |

Writes carry Firestore update-time preconditions; concurrent edits fail closed, are three-way merged record-by-record, and re-flushed. Other users' changes arrive through a light poll of `platform/meta` (20 s and on focus).

Known limits of this layout (candidates for the record-per-document refactor): row-level visibility among sales representatives is enforced by the client scope model, not rules; a single shared field document is capped at Firestore's 1 MiB; notification deliveries are a shared document because cross-user fan-out needs a server. Payment rails, e-mail/SMS transport and Storage uploads are not connected.

## Local development

Copy `.env.example` to `.env.local` and fill in the Web app configuration. On `localhost` the Administration page can still switch to the self-contained demo mode; production hosts always use Firebase.

## Security model

`userAccess/{uid}` is the only authority Security Rules consult. Sensitive HR and financial data lives in per-user or Administrator-only documents, never in a broad company document ordinary employees can read. Firebase Authentication ID tokens are sent with every Firestore REST request so Cloud Firestore Security Rules remain the authorization boundary. Public self-signup is not exposed by the UI; an Authentication user without an access record can read nothing. Enable App Check once the production hostname is final.
