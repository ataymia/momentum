import type { PageKey, WorkspaceUser } from "./types";
import { canAccessPage } from "./access";

/**
 * Prototype route contract for the Zoho Inventory-inspired navigation.
 * Paths are stable, shareable addresses; record IDs are opaque IDs, not names.
 * This file controls presentation only. Firestore and server authorization remain authoritative.
 */
export type MenuEntry = {
  label: string;
  path: string;
  permission: PageKey;
  state: "existing" | "prototype" | "planned";
};

export type MenuGroup = {
  label: string;
  entries: MenuEntry[];
};

export const MENU_GROUPS: MenuGroup[] = [
  { label: "Workspace", entries: [
    { label: "Home", path: "/", permission: "home", state: "existing" },
    { label: "My Work", path: "/work", permission: "work", state: "existing" },
    { label: "Calendar", path: "/calendar", permission: "work", state: "prototype" },
    { label: "Meetings", path: "/calendar/meetings", permission: "work", state: "prototype" },
  ]},
  { label: "Items", entries: [
    { label: "Items", path: "/items", permission: "products", state: "prototype" },
  ]},
  { label: "Inventory", entries: [
    { label: "Inventory", path: "/inventory", permission: "inventory", state: "existing" },
    { label: "Inventory Adjustments", path: "/inventory/adjustments", permission: "inventory", state: "planned" },
    { label: "Packages", path: "/inventory/packages", permission: "inventory", state: "planned" },
    { label: "Shipments", path: "/inventory/shipments", permission: "inventory", state: "planned" },
    { label: "Inventory Ledger", path: "/inventory/ledger", permission: "inventoryLedger", state: "existing" },
  ]},
  { label: "Sales", entries: [
    { label: "Customers", path: "/sales/customers", permission: "accounts", state: "existing" },
    { label: "Sales Orders", path: "/sales/orders", permission: "orders", state: "existing" },
    { label: "Invoices", path: "/sales/invoices", permission: "orderCash", state: "existing" },
    { label: "Payments Received", path: "/sales/payments", permission: "orderCash", state: "existing" },
    { label: "Sales Returns", path: "/sales/returns", permission: "orders", state: "planned" },
    { label: "Credit Notes", path: "/sales/credit-notes", permission: "orderCash", state: "planned" },
  ]},
  { label: "Purchases", entries: [
    { label: "Vendors", path: "/purchases/vendors", permission: "accounting", state: "planned" },
    { label: "Expenses", path: "/purchases/expenses", permission: "accounting", state: "planned" },
    { label: "Purchase Orders", path: "/purchases/orders", permission: "accounting", state: "planned" },
    { label: "Purchase Receipts", path: "/purchases/receipts", permission: "inventory", state: "planned" },
    { label: "Bills", path: "/purchases/bills", permission: "accounting", state: "planned" },
    { label: "Payments Made", path: "/purchases/payments", permission: "accounting", state: "planned" },
    { label: "Vendor Credits", path: "/purchases/credits", permission: "accounting", state: "planned" },
  ]},
  { label: "CRM & Field Sales", entries: [
    { label: "Leads", path: "/crm/leads", permission: "accounts", state: "prototype" },
    { label: "Contacts", path: "/crm/contacts", permission: "accounts", state: "prototype" },
    { label: "Deals", path: "/crm/deals", permission: "accounts", state: "prototype" },
    { label: "Visits & Map", path: "/crm/map", permission: "salesMap", state: "existing" },
    { label: "Sales Incentives", path: "/crm/incentives", permission: "accounts", state: "prototype" },
    { label: "Territories & Routes", path: "/crm/territories", permission: "salesMap", state: "existing" },
  ]},
  { label: "Teams", entries: [
    { label: "People & HR", path: "/people", permission: "people", state: "existing" },
    { label: "Employee Directory", path: "/people/directory", permission: "employees", state: "existing" },
    { label: "Payroll", path: "/people/payroll", permission: "payroll", state: "existing" },
    { label: "Marketing", path: "/marketing", permission: "marketing", state: "existing" },
    { label: "Brand Ambassadors", path: "/marketing/ambassadors", permission: "brandAmbassadors", state: "existing" },
  ]},
  { label: "Insights & Records", entries: [
    { label: "Reports", path: "/reports", permission: "reports", state: "existing" },
    { label: "Accounting", path: "/finance", permission: "finance", state: "existing" },
    { label: "Documents", path: "/documents", permission: "materials", state: "prototype" },
  ]},
  { label: "Administration", entries: [
    { label: "Administration", path: "/admin", permission: "settings", state: "existing" },
    { label: "Audit Center", path: "/admin/audit", permission: "audit", state: "existing" },
    { label: "Account Consolidation", path: "/admin/accounts", permission: "settings", state: "planned" },
    { label: "Data Exchange", path: "/admin/data-exchange", permission: "dataExchange", state: "existing" },
  ]},
];

export const LEGACY_PATHS: Record<PageKey, string> = {
  home: "/", work: "/work", actions: "/work/actions",
  accounts: "/sales/customers", quickVisit: "/crm/quick-visit",
  salesMap: "/crm/territories", accountSetup: "/crm/account-setup",
  accountHealth: "/crm/account-health", crmTools: "/crm",
  dispatch: "/operations/legacy-dispatch", retail: "/retail",
  orders: "/sales/orders", orderCash: "/sales/invoices",
  inventory: "/inventory", inventoryLedger: "/inventory/ledger",
  products: "/items", marketing: "/marketing", brandAmbassadors: "/marketing/ambassadors",
  people: "/people", employees: "/people/directory",
  newHire: "/people/new-hire", onboarding: "/people/onboarding",
  trainingAdmin: "/people/training", timekeeping: "/people/timekeeping",
  materials: "/people/materials", payroll: "/people/payroll",
  finance: "/finance", accounting: "/finance/accounting",
  reports: "/reports", performance: "/reports/performance",
  reportingCenter: "/reports/center", audit: "/admin/audit",
  settings: "/admin", workforceLive: "/admin/workforce",
  dataExchange: "/admin/data-exchange", help: "/help",
};

const ROUTE_OVERRIDES: Record<string, PageKey> = {
  "/sales/payments": "orderCash",
  "/crm/map": "salesMap",
  "/retail": "retail",
  "/accounts": "accounts",
  "/orders": "orders",
  "/settings": "settings",
};

export function normalizeRoutePath(path: string): string {
  const withoutQuery = path.split("?")[0].split("#")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed || "/";
}

export function pageForPath(path: string): PageKey | null {
  const clean = normalizeRoutePath(path);
  if (ROUTE_OVERRIDES[clean]) return ROUTE_OVERRIDES[clean];
  const legacy = (Object.keys(LEGACY_PATHS) as PageKey[]).find(key => LEGACY_PATHS[key] === clean);
  return legacy ?? null;
}

export function routeForPage(page: PageKey): string {
  return LEGACY_PATHS[page] ?? "/";
}

export function routeEntry(path: string): MenuEntry | undefined {
  const clean = normalizeRoutePath(path);
  return MENU_GROUPS.flatMap(group => group.entries).find(entry => entry.path === clean);
}

export function routeLabel(path: string): string {
  const clean = normalizeRoutePath(path);
  const item = routeEntry(clean);
  if (item) return item.label;
  if (clean.startsWith("/items/")) return "Item details";
  if (clean.startsWith("/sales/customers/")) return "Customer details";
  if (clean.startsWith("/sales/orders/")) return "Order details";
  return clean === "/" ? "Home" : "Workspace";
}

export function permissionForPath(path: string): PageKey | null {
  const clean = normalizeRoutePath(path);
  if (clean.startsWith("/items/")) return "products";
  if (clean.startsWith("/sales/customers/")) return "accounts";
  if (clean.startsWith("/sales/orders/")) return "orders";
  if (routeEntry(clean)) return routeEntry(clean)!.permission;
  return pageForPath(clean);
}

export function canVisitRoute(user: WorkspaceUser | null, path: string): boolean {
  return canAccessPage(user, permissionForPath(path) ?? "home");
}

export function requiresPrototypePage(path: string): boolean {
  const clean = normalizeRoutePath(path);
  if (clean.startsWith("/items/") || clean.startsWith("/sales/customers/") || clean.startsWith("/sales/orders/")) return true;
  const entry = routeEntry(clean);
  return Boolean(entry && entry.state !== "existing");
}
