# Momentum Firebase production setup

## Required project decisions

Do not create a second project if Momentum already has an approved Firebase/Google Cloud project. The Firestore database location is an owner/project decision and is intentionally not hard-coded in the repository.

## Console setup

1. Open the approved Firebase project.
2. Register a Web app for Momentum if one does not already exist.
3. Copy the Web app configuration object. Momentum needs: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
4. Enable Authentication > Sign-in method > Email/Password. Do not enable public self-signup in the Momentum UI.
5. Create the default Cloud Firestore database in Production mode if it does not already exist. Confirm the database location before creating it because this is not a casual later change.
6. Enable Cloud Storage if onboarding/document upload will be used.
7. Deploy `firestore.rules` and `storage.rules` before production users are invited.
8. After the final production hostname is known, configure Firebase App Check for the web app.

## Application configuration

The public web application reads these build-time variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

These values are the Firebase Web app configuration, not a service-account credential. Never place a service-account private key in the browser bundle or repository.

## Bootstrap administrator

The rules intentionally do not let a client grant itself Administrator access. The first Administrator must therefore be bootstrapped through a trusted Firebase/Google Cloud administrative path. Create the Firebase Authentication user, then create its `userAccess/{uid}` document with the approved Momentum role, team, account state, and reporting fields. Create the matching `employeeDirectory/{uid}` record separately.

After the first Administrator exists, ordinary employee access records can be managed through the controlled onboarding workflow rather than by letting users create their own accounts.

## Security model

Operational records are stored as separate Firestore documents so Security Rules can enforce record-level access. Sensitive HR and financial data must not be mixed into a broad company document that ordinary employees can read. Employee directory data and private employee data remain separate. Active sales territories are exclusive and account ownership must match the active territory covering the account ZIP.

Firebase Authentication ID tokens are used for browser Firestore requests so Cloud Firestore Security Rules remain the authorization boundary. The production rules are deny-by-default for unmatched paths.
