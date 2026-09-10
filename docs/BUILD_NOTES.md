# Momentum build notes

## Future referral program

Provisioning reserves `Referral` as an internal hiring source, but it is intentionally not exposed in the current new-hire interface.

When the referral program is approved, add a referral intake path that records the referring employee, referred candidate, qualifying event, bonus amount, eligibility window, approval evidence, payout status, and payroll linkage. Do not activate or calculate a referral bonus until the business rules, economics, eligibility exclusions, payout timing, and audit source are approved.

Until then, ordinary administrator-created hires default internally to `Direct hire`. Accepted-offer linkage may be used only to prefill an existing internal candidate/offer record and should not appear to administrators as a required hiring-source decision.
