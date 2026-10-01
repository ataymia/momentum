# Account e-mail management

Momentum employee accounts may change the work e-mail that is also used for Firebase Authentication.

- Every signed-in employee can open the account menu and choose **Change email**.
- Self-service changes require the employee's current password so the session is freshly reauthenticated before the identity changes.
- Administrators can change an employee's work/sign-in e-mail from **Human Resources → Employee directory → Edit employee profile**.
- The privileged Firebase Function updates Firebase Authentication, `userAccess/{uid}`, `employeeDirectory/{uid}`, and the employee's private username lookup in one coordinated workflow.
- The username itself does not change when the e-mail changes.
- Every successful change appends an e-mail-change history record with previous e-mail, new e-mail, actor, timestamp, and whether the change was self-service or Administrator-managed.
- A changed Firebase Authentication e-mail is marked unverified. Self-service attempts to send a fresh verification message after the change.
- Duplicate e-mail addresses are rejected.
- If the Firestore coordination step fails after Firebase Authentication changes, the Function attempts to restore the original Authentication e-mail and reports the failure rather than silently leaving mismatched identity records.

The account e-mail workflow is covered by the platform regression suite, Firebase Functions TypeScript/lint checks, and the production build gate before release.
