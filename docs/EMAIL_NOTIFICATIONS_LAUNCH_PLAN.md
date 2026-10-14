# Momentum transactional email integration: staged, not sending

**Status (2026-10-14):** Native in-app notification rules are implemented; outbound email transport, verified sender domain, secured delivery queue, retry state machine and provider webhooks are **not deployed or proven**. Do not label any existing `Awaiting integration` record as Sent. Do not replay historic in-app notifications into email.

## Ownership and systems of record

- Momentum is the source of truth for accounts, orders, invoices, payments, onboarding approvals, program expiration and dispatch.
- Firestore server-owned outbox (future) is the source of truth for mail sending state: pending, attempting, accepted-by-provider, delivered, deferred, bounced, suppressed or failed.
- Provider is only the email transport. Provider's accepted status is not proof of inbox delivery.
- Google Workspace / Google Groups remain manual human-response inboxes: `info@`, `sales@`, `help@` where actually configured and tested. A Group alone is not a secure transactional sender. Verify replies route to an assigned active staff member after separation.
- Sender identity, provider, DNS, Reply-To and API key need company authorization. A sending domain must be verified; never invent SPF, MX or DKIM record values.

## Provider candidate and account setup

**Recommendation, not an approved purchasing decision:** Resend's transactional email API has low initial cost, a straightforward domain-verification process, server-side API keys, idempotency keys and signed webhooks. Research provider terms/limits before approval. Suggested separation of concerns: send from a dedicated subdomain such as `mail.momentum-dci.com` so existing Google Workspace routing and inbound MX records can remain unchanged. Only use this subdomain if the company approves it.

Mia's safe setup today:
1. Create a business-owned account for the approved provider, with Flo/Mia access through company-controlled identities. Enable MFA; avoid creating a new shared-user password.
2. Add and verify the approved domain in the provider dashboard. In Cloudflare, copy **only** the exact DNS records issued by that provider. Do not replace Google's existing MX records or destroy the root domain SPF policy.
3. Verify the customer-facing From name and sender, and confirm a reply-to monitored by an active person in the Workspace Groups.
4. Send one manual provider dashboard test to an approved internal destination only. Verify inbox, spam, DKIM/SPF/DMARC alignment, and reply routing. No customer bulk send.
5. Generate least-privilege production API key **after approval**. Store it with Firebase Functions Secrets / Secret Manager; never put credentials in frontend `NEXT_PUBLIC` variables, repo, screenshots, ChatGPT or Cloudflare public assets.
6. Prepare a separate sandbox/test key or testing domain. Test signed webhooks and suppression of bounced recipients before first customer notification.

Firebase Functions supports secrets injected only into explicitly authorized functions, and scheduled jobs for later 30-day warnings. Both involve deployment, billing and release approval. **Do not run deploy commands as part of account creation.**

## Event contract, implemented safely in PR

`lib/transactional-email-contract.ts` defines **disabled** server-oriented templates, conservative recipient validation, fixed content, versioned SHA-256 idempotency keys and separation/suspension exclusions. It makes no network requests, creates no actual email, and contains no provider key. Logic tests cover status confusion (approved vs delivered vs paid), recipient suppression, invalid input, replay prevention and 30-day warning copy.

| Email event | Authoritative trigger required before actual dispatch | Audience |
|---|---|---|
| Employee onboarding ready | Recorded verified onboarding invitation state; no passwords or private HR data in body | New employee |
| Order approved | Persisted canonical approved order status | Linked customer |
| Order out for delivery | Persisted delivery dispatch state (not merely a driver's task) | Linked customer |
| Delivery recorded | Canonical delivered status after custody evidence | Linked customer |
| Invoice issued | Issued invoice in accounting source | Approved billing recipient |
| Payment received | Reconciled cleared payment, not a customer button click | Billing recipient |
| Program pricing expiration warning | Approved expiration date exactly 30 days out using Arizona-local date, once per account+program+date | Approved account owner/manager and optionally customer where terms permit |
| Dispatch exception | Persisted unresolved exception | Assigned Operations/Admin |

No blanket email from ordinary audit logs. No auto-email for an unapproved invoice, draft order, hold/release, assumed payout or unconfirmed provider payment. Sales promotions/marketing are a separate opt-in/contact-compliance workflow.

## Required server queue before sending

1. Read committed authoritative record, recipient identity, account state, and notification policy from Firestore **on the server**, never trust client flags.
2. Construct event id from **source record + meaningful transition + version**, not `Date.now()`. Validate actual lifecycle state. One notification per intended transition/recipient/template version.
3. Create a unique immutable Firestore outbox item transactionally. Avoid duplicated sends during retry, reload, cloud retries and simultaneous sessions.
4. Worker claims an item with a bounded lease. Send to provider with a stable idempotency header; never leave a crash window that blindly retries with a new key.
5. Update provider message id and accepted status. Signed webhook updates delivered, bounced, complaint and deferred states; verify signature and event identity.
6. Retry only transient failures using capped exponential backoff and a maximum attempt count; hard bounces/complaints enter suppression. A delivery to a separated/suspended employee must be blocked at dispatch, even if it was queued before the separation.
7. Maintain retention and least-privilege read access for message statuses. Do not store long-lived passwords, card information, private onboarding contracts or account secrets in mail bodies.
8. Configure one explicit **new-events-only** cutover watermark. Historical client `Awaiting integration` items must **not** backfill automatically.
9. Signed-off browser tests: test customer, employee, billing contact, bounced recipient, old/stale queue, no-email customer, separated employee, concurrency, provider outage, mistaken retry, correct Reply-To and unsubscribe policy where applicable.

## Explicit next decision

Mia and Flo confirm transactional email provider and sending identity. Then engineering integrates the live server outbox/transport/webhooks in a separate controlled PR, with secrets binding and release gates. Until then, the new email contract remains transport-off.
