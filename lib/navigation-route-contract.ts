import type { PageKey } from "./types";

/**
 * Cross-workstream deep-link contract.
 * Register a path pattern when a department ships a new record view.
 * These routes are presentation-only; access to underlying records MUST still
 * be authenticated and scoped at the source.
 */
export type RecordRouteMatch = {
  page: PageKey;
  label: string;
  prototype: boolean;
};

type RecordRouteDefinition = RecordRouteMatch & { pattern: RegExp };

const RECORD_ROUTES: readonly RecordRouteDefinition[] = [
  { pattern: /^\/sales\/customers\/[^/]+(?:\/(?:overview|comments|transactions|mails|statements|locations))?$/, page: "accounts", label: "Customer details", prototype: true },
  { pattern: /^\/sales\/orders\/new$/, page: "orders", label: "Create sales order", prototype: true },
  { pattern: /^\/sales\/orders\/[^/]+\/edit$/, page: "orders", label: "Edit sales order", prototype: true },
  { pattern: /^\/sales\/orders\/[^/]+$/, page: "orders", label: "Order details", prototype: true },
  { pattern: /^\/sales\/invoices\/[^/]+$/, page: "orderCash", label: "Invoice details", prototype: true },
  { pattern: /^\/sales\/payments\/[^/]+$/, page: "orderCash", label: "Payment details", prototype: true },
  { pattern: /^\/sales\/returns\/[^/]+$/, page: "orders", label: "Return details", prototype: true },
  { pattern: /^\/sales\/credit-notes\/[^/]+$/, page: "orderCash", label: "Credit note details", prototype: true },
  { pattern: /^\/inventory\/lots\/[^/]+$/, page: "inventory", label: "Lot details", prototype: true },
  { pattern: /^\/inventory\/shipments\/[^/]+$/, page: "inventory", label: "Shipment details", prototype: true },
  { pattern: /^\/items\/[^/]+(?:\/(?:overview|transactions|stock|history))?$/, page: "products", label: "Item details", prototype: true },
  { pattern: /^\/crm\/deals\/new$/, page: "accounts", label: "New deal", prototype: true },
  { pattern: /^\/crm\/deals\/[^/]+\/edit$/, page: "accounts", label: "Edit deal", prototype: true },
  { pattern: /^\/crm\/deals\/[^/]+$/, page: "accounts", label: "Deal details", prototype: true },
  { pattern: /^\/crm\/contacts\/new$/, page: "accounts", label: "New contact", prototype: true },
  { pattern: /^\/crm\/contacts\/[^/]+$/, page: "accounts", label: "Contact details", prototype: true },
  { pattern: /^\/admin\/employee-profiles\/[^/]+(?:\/(?:overview|time|documents|training|compensation))?$/, page: "settings", label: "Employee profile", prototype: true },
  { pattern: /^\/portal\/orders\/[^/]+$/, page: "orders", label: "Order details", prototype: true },
  { pattern: /^\/portal\/deliveries\/[^/]+$/, page: "orders", label: "Delivery details", prototype: true },
];

export function recordRouteMatch(path: string): RecordRouteMatch | null {
  for (const record of RECORD_ROUTES) if (record.pattern.test(path)) {
    return { page: record.page, label: record.label, prototype: record.prototype };
  }
  return null;
}

/** Determines the one exact sidebar destination for a current URL.
 * A more specific path always wins: /calendar/meetings must not select /calendar.
 * Passing only authorized/visible paths prevents hidden group activation.
 */
export function activeMenuPath(path: string, visiblePaths: readonly string[]): string | null {
  const matches = visiblePaths.filter(candidate =>
    path === candidate || (candidate !== "/" && path.startsWith(candidate + "/")));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Static exports can serve arbitrary app URLs through the authorized host's SPA fallback.
 * Always form links using the same base path configured in Next.
 */
export function routeHref(path: string, basePath = ""): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  const base = basePath.replace(/\/+$/, "");
  return base + (path || "/");
}
