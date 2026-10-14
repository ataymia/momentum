# October 14 release evidence

Candidate PR: https://github.com/ataymia/momentum/pull/57

## Verified locally

- 380 logic tests passed after invoice overflow fix.
- Application typecheck and production build passed.
- Functions lint passed after fixing role-map property quoting.
- Chromium 153 opened Administrator, Sales Manager, Sales Representative, Operations and Customer demo workspaces. Applicable Orders, Marketing, HR, Reports and Inventory screens had no uncaught page errors. External requests were blocked; these were not production Firebase workflow tests.
- Actual Invoice Print action produced Letter PDF. Normal sample is one page with all receipt lines and footer. Identifiers occupy separate 231-pixel columns; each measured scrollWidth equals clientWidth (231).
- PDF rendered with Poppler and visually inspected, including header/title, metadata row, receipt lines and footer.
- Long-layout stress fixture added 30 table rows before export: three pages; last row, receipt fields and footer retained. This is layout testing, not a real customer invoice.
- Synthetic audit hot path (2,000 records, 20 iterations): rebuilding all domain snapshots 29.17 ms; reusing unchanged snapshots 7.42 ms. Same empty audit diff verified. Local Node measurements are not live multiuser performance or network latency results.

## GitHub gates

First integrated commit `52af32b` passed 380 logic and 83 Firestore security tests, app typecheck/lint and Functions compilation. Functions lint caught one property-quoting error, fixed in `4d0e066`.

`3f0a6a4` adds the observed PDF clipping fix and a separate Storage emulator authorization gate. Check the latest PR CI result; earlier green checks do not certify later commits.

## Still required for production acceptance

- Firebase rules, Storage and Functions deployment by the existing authorized Codespace.
- Confirm the Cloudflare deployment's source commit matches released main.
- Authenticated live role/workflow checks after Firebase deployment; no real employee was separated, customer emailed, payment recorded or stock changed by these local tests.
- Production invoice/PDF check with representative real line lengths, addresses and signed delivery evidence.
- Two-session edits under live latency, including journal recovery and conflict handling. Do not close concurrent-user performance on synthetic timings alone.
- CRM canonical write migration and complete HR electronic signing/retention controls remain unfinished and are not release claims.
