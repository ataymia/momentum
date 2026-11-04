# Sales CRM inactivity review: implementation note (Nov 4, 2026)

**Status:** Draft for Flo/Mia review. The 60-minute threshold is a CRM-logging
exception, **not** a payroll wage-cutoff rule. No server-side clock-out is
enabled by this change.

## Employee experience
- After 45 minutes without a captured CRM business action, the Timekeeping
  screen displays a reminder to record legitimate field work when practical.
- After 60 minutes, the screen displays an action-required inactivity review
  notice when the employee opens or returns to the page.
- GPS, device opens, login events, page views, and location permission are not
  proof of work and do not reset the timer.
- Travel between customers, work with customers, training and offline tasks may
  be compensable even when no CRM event exists.
- Time punches remain unchanged. Time corrections and manager review remain
  available. The user must be paid for all actual hours worked.

## Required before deploying automatic session closure
1. Flo and HR/payroll approve a written policy, notice, exception handling,
   and effective date. Verify paid sick leave and accommodations.
2. Integrate a **server-side** canonical business-event source with exact UTC
   event timestamps; workspace CRM actions alone are not exhaustive.
3. Send a durable per-user notification and manager alert using the existing
   sharded notification system; handle offline clients and sync failures.
4. Store an immutable inactivity-review record and distinguish auto status
   from employee-supplied time punches. Never backdate worked time to CRM.
5. Give the worker a simple opportunity to attest to meetings, travel,
   deliveries, communications, or unlogged work. Require human payroll
   reconciliation; no automatic wage deletion.
6. Test midnight boundaries, breaks, multiple devices, app inactivity,
   offline writes, duplicate scheduler runs, work events after a review,
   timezone America/Phoenix, and employee separation.
7. Enable behind an administrator-controlled feature flag only after QA.

## Typography
A conservative body, form and small-control font bump is staged for review.
Check smaller devices before release to avoid clipping or hidden actions.
