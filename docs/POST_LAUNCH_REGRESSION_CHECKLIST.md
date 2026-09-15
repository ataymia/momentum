# Momentum post-launch regression checklist

Use this checklist for every production-facing release. A change is not ready to merge merely because the screen renders.

## 1. Identity and onboarding

- New-hire draft saves once and duplicate e-mail is rejected.
- Firebase identity creation either completes or is recoverable without creating a second Auth user.
- Draft-to-identity linkage and onboarding package creation happen atomically.
- A partially prepared onboarding package is repairable without resetting a password, account state, completed training, or employee-entered profile data.
- The employee sees the exact blockers before onboarding submission.
- Submission cannot bypass required employee controls.
- Activation cannot bypass required Administrator document verification.
- Suspended and separated users cannot enter the workspace.

## 2. Territory guidance and sales ownership

- Territory ZIPs are geographic suggestions, not automatic ownership locks.
- Creating an account outside a rep's suggestion requires an explanation instead of denying authorized work.
- Cross-suggestion appointment assignment, reassignment, movement, and order creation require/document an explanation when appropriate.
- A Territory exception is persisted, appears in account/audit history, and notifies the responsible manager for validation.
- Returning an exception allows a fresh explanation on the next cross-suggestion action.
- Managers can assign an authorized rep outside the geographic suggestion with a documented reason.
- Changing a ZIP updates only the geographic suggestion. It never silently rewrites the responsible rep.

## 3. Orders, collections, and attribution

- Order credit stays attached to the recorded credited representative when account responsibility changes.
- Unpaid, failed, reversed, refunded, or otherwise non-retained revenue is not treated as collected sales.
- Refunds and reversals invalidate downstream incentive calculations before payroll release.
- No customer payment status can become Paid without settlement evidence.

## 4. Compensation controls

- Percentage commission rates have an explicit written effective date before payroll calculates them.
- The current approved standard representative-generated split is 2.50% Sales Representative plus 0.50% Sales Manager override, maximum 3.00% on the same qualifying revenue.
- Qualifying Net Collected Sales excludes non-retained amounts required by the governing compensation plan, including refunds, returns, credits, rebates, promotional allowances, chargebacks, uncollected invoices, bad debt, customer discounts, separately charged freight, sales tax, and other non-product revenue where applicable.
- Commission statements identify the qualifying account, net collected sales, rate/allocation, and adjustments.
- Manager attribution is historical and auditable. A later reporting-line change cannot silently move an already-earned override.
- Fixed new-account bonuses remain separate from percentage sales commission.

## 5. Release gate

Before merge to `main`:

- `npm run typecheck`
- `npm run lint`
- `npm run test:logic`
- `npm run test:rules`
- `npm run build`
- Review changed Firestore domain permissions for least privilege.
- Smoke-test Administrator, Sales Manager, Sales Representative, Operations, Warehouse, and Customer roles for the workflows changed in the release.
- Verify no demo fixtures or temporary credentials appear in the production bundle.
- Verify no production deployment, DNS change, Firebase Hosting change, or rules deployment occurs until the release owner approves it.
