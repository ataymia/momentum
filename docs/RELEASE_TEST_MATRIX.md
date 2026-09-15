# Release test matrix

Run against a non-production build of the exact commit proposed for release.

| Role | Workflow | Expected result |
| --- | --- | --- |
| Administrator | Open New hire / onboarding queue | Existing partial hires can be recovered without duplicate Auth users or resetting completed onboarding work. |
| Administrator | Review Territory exception | Can approve or return the documented exception. |
| Administrator | Transfer account to rep outside geographic suggestion | Transfer is allowed with a reason; responsibility changes explicitly; territory does not silently rewrite it later. |
| Sales Manager | Review direct report Territory exception | Review is visible and decision controls work for managed reps. |
| Sales Manager | Assign appointment outside suggestion | Assignment is allowed with documented reason and exception history. |
| Sales Representative | Create account inside suggestion | Account creates normally with no exception prompt. |
| Sales Representative | Create account outside suggestion | Explanation is required; account is allowed after explanation; management receives review signal. |
| Sales Representative | Schedule/order for an approved cross-suggestion account | Work remains allowed and the existing exception prevents repetitive prompts for the same account/rep pair. |
| Sales Representative | Resume after a returned exception | A fresh explanation is required on the next cross-suggestion action. |
| New hire | First login | Temporary password rotation works and does not expose/store the password in Momentum. |
| New hire | Incomplete onboarding | Submit action explains exact blockers instead of behaving like a dead button. |
| New hire | Complete onboarding | Submission advances to Pending approval only after employee-controlled requirements are satisfied. |
| Operations | Order/fulfillment work | Existing operational workflow remains accessible and territory guidance does not interfere. |
| Warehouse | Inventory work | Existing inventory workflow remains accessible. |
| Customer | Account/order portal | Customer scope remains limited to linked accounts and no internal territory/exception controls are exposed. |

## Cross-cutting checks

- Refresh after every state transition that matters and confirm Firestore-backed state survives.
- Open a second authenticated session where practical and confirm remote-storage synchronization does not revert the first session's write.
- Verify account history/audit shows territory exception evidence.
- Verify manager notification copy identifies a territory exception as a review item, not a sales lock.
- Verify changing a ZIP changes only the suggestion shown on the account.
- Verify account transfer does not rewrite historical order credit.
- Verify the browser console has no uncaught errors and no failed application requests during the tested workflows.
