# Momentum platform handoff — October 14, 2026

## Combined release candidate

This branch combines the Monday order/invoice/commission work, employee
separation, the unified action/notification center, notification isolation,
and disabled transactional templates. Production is not updated by a commit.

New corrections:
- A paid order no longer generates a delivery notice without delivered status.
- Derived notification read state is scoped to the signed-in user; switching
  users remounts the inbox. Legacy unscoped read flags are intentionally ignored.
- The Sunday reminder refreshes while the app remains open.
- Offboarding can retry Auth lockout after the Firestore separation committed.
- Active or separated employees cannot use the destructive deletion endpoint;
  it accepts only unfinished onboarding identities, excluding Administrators.
- Managers/Operations get a blocking task for unfinished appointments assigned
  to a separated employee. Reassignment is explicit, preserving appointment history.
- Separated staff are excluded from notification preference editing, recipient
  resolution and manager overdue-report reminders.
- Browser audit notifications no longer accumulate new email/SMS placeholders.
  Saved preferences do not mean email is enabled.

## Email brain: what exists and what does not

Five narrowly scoped Firestore notification triggers record only new
persisted transitions into a server-owned review collection. It observes:

| Source | Event |
| --- | --- |
| Commercial order changes to Approved | Order approved |
| Delivery task changes to In transit with departure timestamp | Out for delivery |
| Delivery task changes to Delivered with timestamp | Delivered |
| New administrative delivery override with timestamp | Delivered |
| Payment changes to Cleared with amount and settlement timestamp | Payment receipt |
| New open invoice or Draft → Open with issue timestamp | Invoice issued |

First document imports and unchanged statuses are ignored. Stable event IDs
prevent trigger retries from replacing review entries. No recipient, amount,
private source payload, or email body is copied into a candidate. No candidate
is sendable, and connecting Resend must not promote this review backlog to mail.
The collector captures observed transitions, not proof that old client-writable
source records are authoritative. Those must be validated before future sending.

Templates, recipient policy, and customer routing already exist:
status messages prefer A/P, then billing, then location email. Invoices require
billing email. Administrative/Operations/driver/warehouse/BA operational events
remain in-app. Sales reminder/exception email follows the explicit allowlist in
`lib/outbound-notification-policy.ts`. Onboarding and invoice template availability
does not override that policy: onboarding transport authorization is still separate.

Still required for live Resend: verified sending domain and reply-to, secret,
source/recipient resolver, activation cutoff, send-time active-access and
preference checks, durable leased outbox, retry/unknown-outcome handling,
provider idempotency, signed webhook deduplication and bounce/complaint suppression.
Accepted by provider must stay distinct from delivered. These are not implemented
by the preview collector. No scheduler is activated in this release; pricing
and weekly reminders still require an open app until server scheduling is built.

## Remaining limits

- CRM creator-only edit stays disabled: legacy shared-array writes must first
  move behind trusted transactions with migrated, verified creator provenance.
- Prospect self-claim still uses legacy shared commercial persistence; it is not
  a server-enforced exclusive claim. Concurrent claims require the CRM migration.
- No Helcim credentials/live-payment verification or inventory count was invented.
- Commission review is not payroll posting or authorization to pay.
- 90-day automatic release remains deferred.
- Auth/Firestore integration must be verified after deployment; no real employee
  was offboarded by this development work.

## Release

Run the guarded preflight from this branch before deployment. The Firebase
project in the checked-in configuration is `momentumdis`. Functions/rules are
separate from the Cloudflare application release. A branch preview is not proof
that main or the custom domain has been updated. Do not run `firebase deploy`
without `--only`: that could deploy the unrelated Hosting target as well.

Deployment command after preflight passes:

```bash
npx firebase-tools@15.30.1 deploy --project momentumdis --only firestore:rules,firestore:indexes,storage,functions:separateEmployeeAccess,functions:deleteEmployee,functions:adminDeliveryOverride,functions:captureOrderNotifications,functions:captureDeliveryNotifications,functions:captureDeliveryOverrideNotifications,functions:capturePaymentNotifications,functions:captureInvoiceNotifications
```

This deploys the preview observer but never emails anyone. Check Eventarc/Functions
errors if the new trigger needs first-time service permissions. Do not grant
project-wide Owner access to work around a deployment failure.

## Master handoff

Owner: Mia for release and Resend identity; engineering for remaining integration.
KPI impact: reliable offboarding, fewer misleading alerts, accountable order status.
Next decision: verify this combined release, then complete Resend transport and
source authorization. Neither payment activation nor CRM migration is complete.
