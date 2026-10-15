# Momentum notifications: Resend transport integration
Status: **Code foundation only; outgoing sends OFF. No production sender or webhook activated.**
Date: 2026-10-15

## Scope and invariants
- Existing in-app bell and My Work remain the employee's operational record. External emails are transactional transport only.
- Current five Firebase event observers write **review-only** notificationCandidates based on client-writable legacy shards. They cannot create outbound emails or bypass source-of-truth verification.
- New server-only `notificationOutbox/{id}` records are the only input of `deliverApprovedNotification`. No client role, including Administrator, can create, edit, list, or delete them.
- Each new outbox record requires a current active Administrator approval, verified employee recipient (when applicable), explicit approved template, stable idempotency key, source/event identity, and creation after the configured activation cutoff.
- Any unknown provider response is **Review required**, not a blind retry. Resend's idempotency guarantee is 24 hours, not a lifelong duplicate-send guarantee.
- Provider-reported "sent" or API accepted means **provider accepted**; only a verified delivery webhook may mark Delivered.
- Hard bounce, complaint and suppressions become server-owned recipient suppression. Do not disclose recipient addresses in logs.
- No historical emails, onboarding passwords, SSNs, HR PDFs, card details, or bank details in any email.
- Employee separation suppresses sends if the current `userAccess` state is not Active. The sender must be active Administrator at delivery time.
- At present **no producer can create a send-authoritative outbox item**. It must be implemented from fresh source-verified events or an auditable Administrator review before enabling production mail. This prevents auto-mailing unverified historic candidates.

## Firebase functions in source, NOT deployed
- `deliverApprovedNotification`: new outbox document observer, secret-scoped `RESEND_API_KEY`, no external call unless all configuration gates are true. Bounded worker instances, one attempt on creation, stable `Idempotency-Key`, server-side recipient and suppression validation, provider index.
- `receiveResendWebhook`: raw-byte Svix verification with secret `RESEND_WEBHOOK_SECRET`, signed timestamps, replay-deduplication via webhook event ID, status progression, bounce/complaint suppression.
- Security rules: fall-through **deny all** for four new backend-only collections. Emulator regression asserts Admin and all roles cannot read/write them.

## Required user and owner inputs before any activation
1. Resend business account created under Momentum-controlled ownership with MFA.
2. Owner approves sending domain/subdomain; verify the exact Resend DNS records in Cloudflare without overriding Google Workspace MX/SPF. Example `mail.momentum-dci.com` is a proposal, not an approved company domain.
3. Confirm From name/address, monitored Reply-To, support and billing contact owners, template copy, recipient selection by event, approval rights, and send quota.
4. Create least-privilege Resend production API key and webhook signing secret. Store only in Firebase Secret Manager with scoped access. Do not paste any key in ChatGPT, GitHub, public web variables or screenshots.
5. Configure webhook in Resend to exact Firebase `receiveResendWebhook` HTTPS URL, subscribing to sent, delivered, delivery_delayed, bounced, complained, failed and suppressed events as available. Verify signature and retry behavior in sandbox.
6. Implement server-verified **fresh-event producer** for each approved notice with customer/company recipient lookup and in-app preference gating. No historical catch-up. Test changed assignments and separated staff.
7. Execute internal mailbox test using synthetic data. Verify sent, delivered, bounced, complaint, retry review, duplicate-event handling and reply handling. Approve an explicit cutover time and spending cap.
8. Only after signed acceptance, scoped-deploy both new Firebase Functions with secrets, configure:
   - `RESEND_LIVE_EMAIL_ENABLED=true`
   - `RESEND_FROM_EMAIL=<verified mailbox>`
   - `RESEND_REPLY_TO=<monitored mailbox>`
   - `RESEND_ACTIVATION_CUTOFF=<approved ISO timestamp>`
   Do not enable until the reviewed producer and its authorizations exist.

## Event activation backlog
| Event | Server evidence required | Recipients | Status |
|---|---|---|---|
| Approved order | Persisted approved canonical order | linked customer | candidate only |
| Delivery dispatched / delivered | persisted custody/delivery task, correct order and customer | linked customer | candidate only |
| Invoice issued | issued invoice, billing identity and approved contact | billing contact | candidate only |
| Payment cleared | settled/reconciled payment, not payment requested | billing contact | candidate only |
| New employee ready | approved provisioned identity with no password in body | employee | in-app only, transport pending |
| Dispatch exception | unresolved event, assigned active ops owner | Operations/Admin | in-app only, transport pending |
| 30-day pricing warning | approved program, expiration and one warning per account/version | account owner/customer as approved | not scheduled |
| Daily/weekly rep and manager reminders | live role, audit-backed fresh due items | active employees | in-app only, transport pending |

## Incident/safety acceptance
- Exact-once-like behavior: webhook duplicate suppression and Firestore state prevent most repeat sends. Resend idempotency lasts 24 hours only; outbox worker does **not** automatically resend ambiguous calls. Operators must reconcile against the provider first.
- Deliverability: Domain DNS SPF/DKIM and possibly DMARC, provider dashboard accepted event, inbox tests, replies and suppressed recipients must all be reviewed.
- Failure actions: provider unavailable -> Review required, no retry storm; webhook invalid -> 401; webhook index lag -> 503 and provider retry; separated recipient -> Suppressed.
- Production approval requires the owner and operations lead to accept recipient/routing templates and developer to provide current test evidence. No deployment or external message may occur merely because account sign-up is finished.

Official docs:
- https://resend.com/changelog/idempotency-keys
- https://resend.com/docs/dashboard/webhooks/introduction
- https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
