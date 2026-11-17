# Customer invoice issuance gate

**Release status: business approval required.** The printed invoice and emailed PDF include hardcoded legal issuer details, address, contact phone, and email. These facts have not been independently verified by engineering.

## Implemented
- Automatic customer invoice emails are held unless the Firebase Functions runtime explicitly sets `MOMENTUM_INVOICE_ISSUE_APPROVED=true`. Unset and all other values mean hold. A review event is written to `notificationAdminEvents`, not a customer invoice outbox.
- The issuer approval is **independent** of Resend live email activation. It is an operational sign-off flag, not proof of correctness.
- Prefilled Zelle, bank account and routing destinations were removed from emailed PDF attachments and browser printing. Send remittance instructions separately via an approved authenticated channel.
- When no verified recipient signature is present, printed name and signature date are blank; the signature cell says no recipient signature is on file. An admin delivery confirmation is not presented as a customer signature.

## Before business owner enables the flag
1. Confirm authorized selling/invoicing entity, issuer name, trading relationship and rights, address, phone, named contact, and official customer-facing email.
2. Finance verifies invoice numbering, legal and tax requirements, approved unit price and quantity, line totals, terms, due dates, refunds, credits, paid/balance calculation, and secure remittance workflow.
3. Test signed and unsigned deliveries, delayed invoices, billing-account email, admin overrides and retries in staging. Check logs and customer email acceptance.
4. Retain evidence of owner/finance approval, configure flag in correct Firebase Functions environment, and separately verify `RESEND_LIVE_EMAIL_ENABLED` plus activation cutoff before production send.

**Manual printing exception:** This server gate does not stop browser-side printing. Do not distribute those printed invoices externally before the same business approval. Server-authorized manual issuance remains future work.

**Recovery:** Approval later does not automatically send previously held events. Recent signed deliveries may retry when qualifying source records change, but older invoices require an authorized reconciliation/reissue process.
