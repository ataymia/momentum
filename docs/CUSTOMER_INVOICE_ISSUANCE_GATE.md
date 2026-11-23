# Customer invoice issuance gate

**Release status: business approval required.** The printed invoice and emailed PDF include hardcoded legal issuer details, address, contact phone, and email. These facts have not been independently verified by engineering.

## Implemented
- Automatic customer invoice emails are held unless the Firebase Functions runtime explicitly sets `MOMENTUM_INVOICE_ISSUE_APPROVED=true`. Unset and all other values mean hold. A review event is written to `notificationAdminEvents`, not a customer invoice outbox. The Resend transport also independently checks this flag before attempting to send any **already-queued** `delivered_invoice` item.
- The issuer approval is **independent** of Resend live email activation. It is an operational sign-off flag, not proof of correctness.
- Prefilled Zelle, bank account and routing destinations were removed from emailed PDF attachments and browser printing. Send remittance instructions separately via an approved authenticated channel.
- When no verified recipient signature is present, printed name and signature date are blank; the signature cell says no recipient signature is on file. An admin delivery confirmation is not presented as a customer signature.

## Before business owner enables the flag
1. Confirm authorized selling/invoicing entity, issuer name, trading relationship and rights, address, phone, named contact, and official customer-facing email.
2. Finance verifies invoice numbering, legal and tax requirements, approved unit price and quantity, line totals, terms, due dates, refunds, credits, paid/balance calculation, and secure remittance workflow.
3. Test signed and unsigned deliveries, delayed invoices, billing-account email, admin overrides and retries in staging. Check logs and customer email acceptance.
4. Retain evidence of owner/finance approval, configure `MOMENTUM_INVOICE_ISSUE_APPROVED=true` in the correct Firebase Functions environment and `NEXT_PUBLIC_INVOICE_ISSUE_APPROVED=true` at Next.js build time, and separately verify `RESEND_LIVE_EMAIL_ENABLED` plus activation cutoff before production send.

**Manual browser printing is always available within the viewer's authorized invoice scope.** Neither draft/void status, incomplete billing fields nor `NEXT_PUBLIC_INVOICE_ISSUE_APPROVED=false` disables Print / Save PDF. When data or issuer approval is missing, the browser displays a confirmation warning outside the printable invoice; cancel exits, and acknowledging it prints the invoice as-is, with no warning text printed on the page. The flag is only used to identify unverified issuer details for the warning; it never prevents browser printing. **Browser printing is not customer invoice issuance.** It must not trigger payment, inventory, emailed invoices, or backend issuance. Server-generated customer email delivery remains held unless separately approved by the Firebase runtime setting `MOMENTUM_INVOICE_ISSUE_APPROVED=true`. Authorized viewers can create a paper/PDF copy to complete manually, but should verify correctness before giving it to customers.

**Recovery:** Approval later does not automatically send previously held events. Recent signed deliveries may retry when qualifying source records change, but older invoices require an authorized reconciliation/reissue process.

## Invoice line-source and cross-customer protection

The customer invoice email path now verifies that an invoice and underlying order belong to the **same customer location**. It uses saved `linesSnapshot` on amended/current invoices as the authority. Legacy invoices without that snapshot may use order lines only if quantities, prices and exact invoice totals reconcile. Broken lines, missing product identities, and amount mismatches write a review event and prevent customer emailing. A manual finance exception process for discounts, taxes or ancillary charges not represented as line items must be designed and approved instead of fabricating totals.
