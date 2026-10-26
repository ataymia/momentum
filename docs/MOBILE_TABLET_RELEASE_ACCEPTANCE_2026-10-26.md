# Momentum adaptive device release acceptance

**Scope:** New mobile/tablet presentation layer only. This does not add back-end capabilities or grant new access. Desktop screens at 1024px and wider remain visually unchanged by `app/device-adaptive.css`. Physical invoice print CSS must remain unchanged.

## Device matrix (manual verification still required)

| Width/device | Expected presentation | Sign-off |
|---|---|---|
| 375px (small phone) | Bottom navigation, no browser-wide horizontal overflow, readable account/order cards, 16px text inputs | Pending |
| 390px (iPhone) | Tap CRM and search; create draft order; open full-screen edit; no pinch zoom | Pending |
| 430px (large phone) | Safe-area bottom bar, readable delivery card and signature, filters expand/collapse | Pending |
| 768px (tablet portrait) | Centered touch navigation, readable two-column forms/sections, full More sheet | Pending |
| 820px (tablet portrait) | Accessible search, notifications and role menu without sidebar | Pending |
| 1024px (small desktop) | Existing desktop sidebar; no new bottom nav | Pending |
| 1366px+ (desktop) | Existing sidebar/dashboard/order grids unchanged | Pending |
| Print preview | No mobile bottom nav or touch-only CSS, invoice geometry unchanged | Pending |

## Role smoke checks

- Administrator: Home, CRM accounts and locations, Orders, approval Work, Workforce Live (via More / Administration), Deliveries when permitted, HR and payroll. Open all actions and dismiss mobile modal/sheet by keyboard and touch.
- Sales Representative: Home, CRM, Orders (predictive account search), Clock In, self-delivery (own orders only); no unauthorized section appears in More.
- Customer: only account, orders, help and permitted home. No staff menus.
- Brand Ambassador: schedule, timekeeping, help and other already permitted sections.
- Delivery Driver: existing dedicated delivery shell unchanged; signed workflow is still server-/Firestore-controlled.

## Safety and usability checks

1. Device navigation invokes existing `navigate`, never bypasses `canAccessPage` or creates a new route.
2. Mobile More sheet supports keyboard Escape, Tab focus containment and dismiss on selection.
3. Browser-wide horizontal overflow must be absent. Intentionally dense evidence/finance tables may swipe inside their own scroll container.
4. Form inputs should not cause iOS focus zoom; button targets at least ~44px; safe-area bottom inset respected.
5. Modal contents and footer remain accessible when on-screen keyboard is open. No signature canvas clipping.
6. No changes to order total, delivery signatures, payroll, permissions or data persistence from device layout.
7. Verify desktop visuals with same browser width before/after, especially inventory, finance, dashboards and printable invoices.

**Release state:** Code CI is not a substitute for physical device verification. Never mark the above sign-offs as passed based only on TypeScript, lint or static regression tests.
