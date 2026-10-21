# Arizona customer TPT / resale certificate fields (2026-10-21)

## Authoritative distinction
- Arizona Department of Revenue **TPT license number**: an 8-digit identifier for a licensed business. Record it as a **text** field to retain leading zeroes. Multiple locations can share a business's consolidated license; store on the billing parent customer.
- **ADOR Form 5000A**, Arizona Resale Certificate: actual signed certificate provided by the buyer to document purchasing taxable property for resale. This is the relevant form for normal energy-drink retail resale. It is **not a number**.
- **ADOR Form 5000**, general TPT exemption: different signed form for qualified exemptions **other than resale**.
- The buyer furnishes the applicable signed form to the seller, and the seller retains it. A tax number, claim, or dropdown status by itself is not evidence that a transaction qualifies for a deduction.

Official sources:
- https://azdor.gov/business/transaction-privilege-tax/tpt-license
- https://azdor.gov/forms/tpt-forms/arizona-resale-certificate
- https://azdor.gov/forms/tpt-forms/tpt-exemption-certificate-general
- https://azdor.gov/business/transaction-privilege-tax/retail-sales-subject-tpt/retail-deductions

## Momentum implementation
- **Account details > Arizona tax & resale** and **New Account Setup** have a validated TPT license number.
- A Sales Representative assigned to an account may record the factual number but may **not** self-verify an exemption.
- Administrator/Sales Manager may set certificate type (5000A or 5000), review status, and a secure document reference, after verifying the complete signed original in approved restricted storage.
- The secure reference is a **manual index**, not a file upload and not proof of the document's completeness.
- The manager cannot mark `Verified` through this workflow without a certificate type and nonempty reference. This guard is only a minimal record-control check; it cannot independently validate signed form contents, TPT license activity, date coverage, or the specific transaction's eligibility.
- Data is attached to parent billing customer, shared across linked locations. Each certificate must still cover applicable entities/transactions. Independent location tax licenses require deliberate review.
- **No automatic tax-exemption assignment, invoice tax-rate change, TPT return deduction, or certificate-signing/upload feature is enabled by this change.** Tax treatment is separately subject to accounting/controller review.
- The legacy `az5000Number` value is preserved, shown for management review, and removed from invoice/PDF print lines. Never automatically convert old values to a TPT license.
- Existing customer fields for EIN, billing/AP, payment terms, pricing, etc., remain unchanged.

## Release validation
1. Test an 8-digit TPT license with leading zeroes in both entry screens, reload, and confirm it persists; reject 7 digits, 9 digits, and `AZ-5000` text.
2. Test Sales Representative access on an assigned account: TPT save allowed; review verification not available. Nonassigned reps and customer portal cannot edit a different customer's tax record.
3. As management, select Form 5000A, record a valid restricted reference and status Received; reload. Verify that status Verified cannot be selected without the type/reference. Inspect the signed original separately before manually verifying.
4. Ensure a saved TPT license number **alone** does not mark an account tax exempt or alter tax calculations.
5. Verify no old AZ-5000 string is presented as a numeric certificate on invoices; historical values remain available for reconciliation.
6. Do not authorize go-live until document-handling, access, and invoice smoke checks pass.
