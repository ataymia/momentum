import type { PageKey, WorkspaceUser } from "./types";
import { canAccessPage } from "./access";

/**
 * Prototype route contract for the inventory and fulfillment platform-inspired navigation.
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
    { label: "Home", path: "/", permission: "home", state: "prototype" },
    { label: "Approvals", path: "/work/approvals", permission: "work", state: "prototype" },
    { label: "Action Center", path: "/work/actions", permission: "actions", state: "prototype" },
    { label: "Exceptions", path: "/work/exceptions", permission: "work", state: "prototype" },
    { label: "Completed Work", path: "/work/completed", permission: "work", state: "prototype" },
    { label: "Shared Calendar", path: "/calendar", permission: "work", state: "prototype" },
    { label: "Meetings", path: "/calendar/meetings", permission: "work", state: "prototype" },
  ] },
  { label: "Sales & CRM", entries: [
    { label: "Leads", path: "/crm/leads", permission: "accounts", state: "prototype" },
    { label: "Contacts", path: "/crm/contacts", permission: "accounts", state: "prototype" },
    { label: "Accounts / Customers", path: "/sales/customers", permission: "accounts", state: "prototype" },
    { label: "Deals", path: "/crm/deals", permission: "accounts", state: "prototype" },
    { label: "Quick Visits", path: "/crm/quick-visit", permission: "quickVisit", state: "prototype" },
    { label: "Account Setup", path: "/crm/account-setup", permission: "accountSetup", state: "prototype" },
    { label: "Account Health", path: "/crm/account-health", permission: "accountHealth", state: "prototype" },
    { label: "Account Map", path: "/crm/account-map", permission: "salesMap", state: "existing" },
    { label: "Territory Map", path: "/crm/territory-map", permission: "salesMap", state: "prototype" },
    { label: "Rep Self-Delivery", path: "/crm/self-delivery", permission: "orders", state: "prototype" },
    { label: "Sales Incentives", path: "/crm/incentives", permission: "accounts", state: "prototype" },
    { label: "Territories & Routes", path: "/crm/territories", permission: "salesMap", state: "existing" },
  ] },
  { label: "Commerce", entries: [
    { label: "Items / Products", path: "/items", permission: "products", state: "prototype" },
    { label: "Price Books", path: "/commerce/price-books", permission: "products", state: "planned" },
    { label: "Sales Orders", path: "/sales/orders", permission: "orders", state: "prototype" },
    { label: "Invoices", path: "/sales/invoices", permission: "orderCash", state: "prototype" },
    { label: "Payments Received", path: "/sales/payments", permission: "orderCash", state: "prototype" },
    { label: "Sales Returns", path: "/sales/returns", permission: "orders", state: "prototype" },
    { label: "Credit Notes", path: "/sales/credit-notes", permission: "orderCash", state: "prototype" },
    { label: "Customer Portal", path: "/commerce/customer-portal", permission: "orders", state: "planned" },
  ] },
  { label: "Operations", entries: [
    { label: "Inventory", path: "/inventory", permission: "inventory", state: "prototype" },
    { label: "Inventory Adjustments", path: "/inventory/adjustments", permission: "inventory", state: "prototype" },
    { label: "Packages", path: "/inventory/packages", permission: "inventory", state: "prototype" },
    { label: "Shipments", path: "/inventory/shipments", permission: "inventory", state: "prototype" },
    { label: "Inventory Ledger", path: "/inventory/ledger", permission: "inventoryLedger", state: "prototype" },
    { label: "Vendors", path: "/purchases/vendors", permission: "accounting", state: "planned" },
    { label: "Expenses", path: "/purchases/expenses", permission: "accounting", state: "planned" },
    { label: "Purchase Orders", path: "/purchases/orders", permission: "accounting", state: "planned" },
    { label: "Purchase Receipts", path: "/purchases/receipts", permission: "inventory", state: "planned" },
    { label: "Bills", path: "/purchases/bills", permission: "accounting", state: "planned" },
    { label: "Payments Made", path: "/purchases/payments", permission: "accounting", state: "planned" },
    { label: "Vendor Credits", path: "/purchases/credits", permission: "accounting", state: "planned" },
    { label: "Delivery Operations", path: "/operations/deliveries", permission: "orders", state: "prototype" },
  ] },
  { label: "Human Resources", entries: [
    { label: "HR Overview", path: "/people", permission: "people", state: "prototype" },
    { label: "Employee Directory", path: "/people/directory", permission: "employees", state: "prototype" },
    { label: "New Hire", path: "/people/new-hire", permission: "newHire", state: "existing" },
    { label: "Onboarding", path: "/people/onboarding", permission: "onboarding", state: "existing" },
    { label: "Payroll", path: "/people/payroll", permission: "payroll", state: "prototype" },
    { label: "Training", path: "/people/training", permission: "trainingAdmin", state: "existing" },
  ] },
  { label: "Marketing", entries: [
    { label: "Marketing Overview", path: "/marketing", permission: "marketing", state: "existing" },
    { label: "Campaigns", path: "/marketing/campaigns", permission: "marketing", state: "planned" },
    { label: "Brand Ambassadors", path: "/marketing/ambassadors", permission: "brandAmbassadors", state: "existing" },
  ] },
  { label: "Insights & Support", entries: [
    { label: "Forecasts", path: "/reports/forecasts", permission: "reports", state: "planned" },
    { label: "Reports", path: "/reports", permission: "reports", state: "existing" },
    { label: "Dashboards", path: "/reports/performance", permission: "performance", state: "existing" },
    { label: "Cases", path: "/support/cases", permission: "work", state: "planned" },
    { label: "Documents", path: "/documents", permission: "materials", state: "prototype" },
    { label: "Help", path: "/help", permission: "help", state: "existing" },
  ] },
  { label: "Administration", entries: [
    { label: "Administration", path: "/admin", permission: "settings", state: "existing" },
    { label: "Employee Profiles", path: "/admin/employee-profiles", permission: "settings", state: "prototype" },
    { label: "Employee Directory", path: "/admin/employees", permission: "settings", state: "prototype" },
    { label: "Users & Roles", path: "/admin/access", permission: "settings", state: "existing" },
    { label: "Workforce Live", path: "/admin/workforce", permission: "workforceLive", state: "existing" },
    { label: "Audit Center", path: "/admin/audit", permission: "audit", state: "existing" },
    { label: "Account Consolidation", path: "/admin/accounts", permission: "settings", state: "prototype" },
    { label: "Data Exchange", path: "/admin/data-exchange", permission: "dataExchange", state: "existing" },
  ] },
];

/** Customer-facing navigation is intentionally independent of employee modules. */
export const CUSTOMER_MENU: MenuEntry[] = [
  { label: "Home", path: "/", permission: "home", state: "prototype" },
  { label: "Products", path: "/portal/products", permission: "home", state: "prototype" },
  { label: "My Orders", path: "/portal/orders", permission: "orders", state: "existing" },
  { label: "Invoices", path: "/portal/invoices", permission: "orders", state: "prototype" },
  { label: "Payments", path: "/portal/payments", permission: "orders", state: "prototype" },
  { label: "Deliveries", path: "/portal/deliveries", permission: "orders", state: "prototype" },
  { label: "Statements", path: "/portal/statements", permission: "home", state: "prototype" },
  { label: "Documents", path: "/portal/documents", permission: "home", state: "prototype" },
  { label: "My Account", path: "/portal/account", permission: "accounts", state: "prototype" },
];

export const DRIVER_MENU = [
  {label:"My Deliveries",path:"/driver/deliveries"},
  {label:"Delivery Requests",path:"/driver/requests"},
  {label:"Route Map",path:"/driver/map"},
  {label:"Inventory",path:"/driver/inventory"},
  {label:"Time & HR",path:"/driver/time"},
  {label:"Employee Directory",path:"/driver/directory"},
  {label:"Help",path:"/driver/help"},
] as const;

export const LEGACY_PATHS: Record<PageKey, string> = {
  home: "/", work: "/work/approvals", actions: "/work/actions",
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
  "/sales/orders/workflow": "orders",
  "/inventory/workflow": "inventory",
  "/crm/quick-visit": "quickVisit",
  "/crm/account-map": "salesMap",
  "/work": "work",
  "/work/workflow": "work",
  "/work/exceptions": "work",
  "/work/completed": "work",
  "/crm/self-delivery": "orders",
  "/admin/access": "settings",
  "/portal/orders": "orders",
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
  // Deep-linked records must retain their owning workspace page, not fall back to Home.
  if(clean.startsWith("/crm/self-delivery/"))return "orders";
  if(clean.startsWith("/sales/orders/"))return "orders";
  if(clean.startsWith("/sales/invoices/")||clean.startsWith("/sales/payments/")||clean.startsWith("/sales/credit-notes/"))return "orderCash";
  if(clean.startsWith("/sales/returns/"))return "orders";
  if(clean.startsWith("/sales/customers/"))return "accounts";
  if(clean.startsWith("/inventory/lots/")||clean.startsWith("/inventory/shipments/"))return "inventory";
  if(clean.startsWith("/items/"))return "products";
  const legacy = (Object.keys(LEGACY_PATHS) as PageKey[]).find(key => LEGACY_PATHS[key] === clean);
  if(legacy)return legacy;
  // Prototype-only modules still need a meaningful active page for breadcrumbs
  // and other navigation consumers, even though their content is route-driven.
  const menu=MENU_GROUPS.flatMap(group=>group.entries).find(entry=>entry.path===clean)
    ??CUSTOMER_MENU.find(entry=>entry.path===clean);
  return menu?.permission??null;
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
  const item = routeEntry(clean) ?? CUSTOMER_MENU.find(entry=>entry.path===clean);
  if (item) return item.label;
  if (clean.startsWith("/items/")) return "Item details";
  if(clean==="/inventory/workflow")return "Inventory operations";
  if (clean.startsWith("/inventory/lots/")) return "Lot details";
  if (clean.startsWith("/inventory/shipments/")) return "Shipment details";
  if (clean.startsWith("/sales/customers/")) return "Customer details";
  if (clean==="/sales/orders/workflow") return "Order operations";
  if(clean==="/sales/orders/new")return "Create sales order";
  if(clean.startsWith("/sales/orders/")&&clean.endsWith("/edit"))return "Edit sales order";
  if (clean.startsWith("/crm/self-delivery/")) return "Self-delivery details";
  if (clean.startsWith("/sales/orders/")) return "Order details";
  if (clean.startsWith("/sales/invoices/")) return "Invoice details";
  if (clean.startsWith("/sales/payments/")) return "Payment details";
  if (clean.startsWith("/sales/returns/")) return "Return details";
  if (clean.startsWith("/sales/credit-notes/")) return "Credit note details";
  return clean === "/" ? "Home" : "Workspace";
}

export function permissionForPath(path: string): PageKey | null {
  const clean = normalizeRoutePath(path);
  if (clean.startsWith("/items/")) return "products";
  if(clean.startsWith("/inventory/lots/")||clean.startsWith("/inventory/shipments/"))return "inventory";
  if (clean.startsWith("/sales/customers/")) return "accounts";
  const portal=CUSTOMER_MENU.find(item=>item.path===clean);
  if (portal) return portal.permission;
  if (clean.startsWith("/crm/self-delivery/")) return "orders";
  if (clean.startsWith("/sales/orders/")) return "orders";
  if (clean.startsWith("/sales/invoices/")||clean.startsWith("/sales/payments/")||clean.startsWith("/sales/credit-notes/")) return "orderCash";
  if (clean.startsWith("/sales/returns/")) return "orders";
  if (routeEntry(clean)) return routeEntry(clean)!.permission;
  return pageForPath(clean);
}

export function canVisitRoute(user: WorkspaceUser | null, path: string): boolean {
  if (!user) return false;
  const clean=normalizeRoutePath(path);
  if (user.role==="Customer") {
    // Maintain direct links used by the existing customer dashboard and order flow.
    const customerOrderDetail = clean.startsWith("/sales/orders/") &&
      clean!=="/sales/orders/new" && clean!=="/sales/orders/workflow" &&
      !clean.endsWith("/edit");
    const legacyCustomer = clean==="/sales/orders" || clean==="/sales/customers" ||
      customerOrderDetail || clean.startsWith("/sales/customers/");
    return (clean==="/" || Boolean(CUSTOMER_MENU.find(e=>e.path===clean)) || legacyCustomer) &&
      canAccessPage(user,permissionForPath(clean)??"home");
  }
  if (clean.startsWith("/portal/")) return false;
  if ((clean==="/crm/self-delivery"||clean.startsWith("/crm/self-delivery/")) && user.role!=="Sales Representative")return false;
  if(clean==="/operations/deliveries" && !["Administrator","Operations","Warehouse"].includes(user.role)) return false;
  if (clean.startsWith("/admin/") && user.role!=="Administrator") return false;
  const permission=permissionForPath(clean);
  return permission!==null && canAccessPage(user,permission);
}


/** Prototype-only department visibility. Final policy will use per-action grants.
 * Department menus should not imply the user has HR or Marketing administrative access.
 * Individual employee self-service must be provided separately from HR management.
 */
export function canShowModuleInMenu(user: WorkspaceUser | null, path: string): boolean {
  if (!user || !canVisitRoute(user,path)) return false;
  if (user.role==="Customer") return false;
  const group = MENU_GROUPS.find(g=>g.entries.some(e=>e.path===normalizeRoutePath(path)))?.label;
  if (group==="Human Resources" && user.role!=="Administrator") return false;
  if (group==="Marketing" && !["Administrator","Marketing","Brand Ambassador"].includes(user.role)) return false;
  return true;
}

export function requiresPrototypePage(path: string): boolean {
  const clean = normalizeRoutePath(path);
  if(clean==="/sales/orders/workflow"||clean==="/inventory/workflow"||clean==="/work/workflow")return false;
  if (clean.startsWith("/crm/self-delivery/") || clean.startsWith("/inventory/shipments/") || clean.startsWith("/inventory/lots/") || clean.startsWith("/items/") || clean.startsWith("/sales/customers/") || clean.startsWith("/sales/orders/") || clean.startsWith("/sales/invoices/") || clean.startsWith("/sales/payments/") || clean.startsWith("/sales/returns/") || clean.startsWith("/sales/credit-notes/") || (clean.startsWith("/portal/") && clean!=="/portal/orders")) return true;
  const entry = routeEntry(clean);
  return Boolean(entry && entry.state !== "existing");
}
