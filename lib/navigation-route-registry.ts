import type { PageKey, WorkspaceUser } from "./types";
import { canAccessPage } from "./access";
import { recordRouteMatch } from "./navigation-route-contract";

/**
 * Momentum's unified navigation route contract. All department paths are local design.
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
    { label: "Clock In / Timekeeping", path: "/people/timekeeping", permission: "timekeeping", state: "existing" },
    { label: "Action Center", path: "/work/actions", permission: "actions", state: "prototype" },
    { label: "Field Scheduling", path: "/operations/field-schedule", permission: "dispatch", state: "prototype" },
    { label: "Shared Calendar", path: "/calendar", permission: "work", state: "prototype" },
    { label: "Meetings", path: "/calendar/meetings", permission: "work", state: "prototype" },
    { label: "My Invitations", path: "/calendar/invitations", permission: "work", state: "prototype" },
    { label: "My Agenda", path: "/calendar/agenda", permission: "work", state: "prototype" },
    { label: "Work Reports", path: "/reports/center", permission: "reportingCenter", state: "existing" },
  ] },
  { label: "Account", entries: [
    { label: "My Account", path: "/my-account", permission: "timekeeping", state: "prototype" },
    { label: "My Employee Profile", path: "/my-account/employee", permission: "timekeeping", state: "prototype" },
    { label: "My Time Off", path: "/my-account/time-off", permission: "timekeeping", state: "prototype" },
    { label: "My Pay History", path: "/my-account/pay", permission: "timekeeping", state: "prototype" },
    { label: "My Training", path: "/my-account/training", permission: "timekeeping", state: "prototype" },
    { label: "Completed Work", path: "/my-account/completed", permission: "work", state: "prototype" },
  ] },
  { label: "Sales & CRM", entries: [
    { label: "Leads", path: "/crm/leads", permission: "accounts", state: "prototype" },
    { label: "Contacts", path: "/crm/contacts", permission: "accounts", state: "prototype" },
    { label: "Accounts / Customers", path: "/sales/customers", permission: "accounts", state: "prototype" },
    { label: "Deals", path: "/crm/deals", permission: "accounts", state: "prototype" },
    { label: "Quick Visits", path: "/crm/quick-visit", permission: "quickVisit", state: "prototype" },
    { label: "Account Setup", path: "/crm/account-setup", permission: "accountSetup", state: "prototype" },
    { label: "Account Health", path: "/crm/account-health", permission: "accountHealth", state: "prototype" },
    { label: "Account Map", path: "/crm/account-map", permission: "salesMap", state: "prototype" },
    { label: "Rep Self-Delivery", path: "/crm/self-delivery", permission: "orders", state: "prototype" },
    { label: "Sales Incentives", path: "/crm/incentives", permission: "accounts", state: "prototype" },
    { label: "Commission-only Readiness", path: "/crm/commission-only", permission: "audit", state: "prototype" },
    { label: "Territories & Map", path: "/crm/territories", permission: "salesMap", state: "prototype" },
  ] },
  { label: "Commerce", entries: [
    { label: "Items / Products", path: "/items", permission: "products", state: "prototype" },
    { label: "Price Books", path: "/commerce/price-books", permission: "products", state: "prototype" },
    { label: "Sales Orders", path: "/sales/orders", permission: "orders", state: "prototype" },
    { label: "Invoices", path: "/sales/invoices", permission: "orderCash", state: "prototype" },
    { label: "Payments Received", path: "/sales/payments", permission: "orderCash", state: "prototype" },
    { label: "Sales Returns", path: "/sales/returns", permission: "orders", state: "prototype" },
    { label: "Credit Notes", path: "/sales/credit-notes", permission: "orderCash", state: "prototype" },
    { label: "Customer Portal", path: "/commerce/customer-portal", permission: "orders", state: "prototype" },
    { label: "Finance Overview", path: "/finance", permission: "finance", state: "existing" },
    { label: "Accounting", path: "/finance/accounting", permission: "accounting", state: "prototype" },
  ] },
  { label: "Operations", entries: [
    { label: "Inventory", path: "/inventory", permission: "inventory", state: "prototype" },
    { label: "Inventory Adjustments", path: "/inventory/adjustments", permission: "inventory", state: "prototype" },
    { label: "Warehouse Locations", path: "/inventory/locations", permission: "inventory", state: "prototype" },
    { label: "Packages", path: "/inventory/packages", permission: "inventory", state: "prototype" },
    { label: "Shipments", path: "/inventory/shipments", permission: "inventory", state: "prototype" },
    { label: "Inventory Ledger", path: "/inventory/ledger", permission: "inventoryLedger", state: "prototype" },
    { label: "Vendors", path: "/purchases/vendors", permission: "accounting", state: "prototype" },
    { label: "Expenses", path: "/purchases/expenses", permission: "accounting", state: "prototype" },
    { label: "Purchase Orders", path: "/purchases/orders", permission: "inventory", state: "prototype" },
    { label: "Purchase Receipts", path: "/purchases/receipts", permission: "inventory", state: "prototype" },
    { label: "Bills", path: "/purchases/bills", permission: "accounting", state: "prototype" },
    { label: "Payments Made", path: "/purchases/payments", permission: "accounting", state: "prototype" },
    { label: "Vendor Credits", path: "/purchases/credits", permission: "accounting", state: "prototype" },
    { label: "Delivery Operations", path: "/operations/deliveries", permission: "orders", state: "prototype" },
  ] },
  { label: "Human Resources", entries: [
    { label: "HR Overview", path: "/people", permission: "people", state: "prototype" },
    { label: "Employee Directory", path: "/people/directory", permission: "employees", state: "prototype" },
    { label: "New Hire", path: "/people/new-hire", permission: "newHire", state: "prototype" },
    { label: "Onboarding", path: "/people/onboarding", permission: "onboarding", state: "prototype" },
    { label: "HR Compliance Gate", path: "/people/compliance", permission: "onboarding", state: "prototype" },
    { label: "Onboarding Workflow", path: "/people/onboarding/workflow", permission: "onboarding", state: "existing" },
    { label: "Payroll", path: "/people/payroll", permission: "payroll", state: "prototype" },
    { label: "Payroll Processing & Settings", path: "/people/payroll/workflow", permission: "payroll", state: "existing" },
    { label: "Training", path: "/people/training", permission: "trainingAdmin", state: "prototype" },
    { label: "Time Off & Leave", path: "/people/leave", permission: "people", state: "prototype" },
    { label: "Attendance & Timecards", path: "/people/attendance", permission: "timekeeping", state: "prototype" },
    { label: "Performance & Development", path: "/people/performance", permission: "people", state: "prototype" },
  ] },
  { label: "Marketing", entries: [
    { label: "Marketing Overview", path: "/marketing", permission: "marketing", state: "prototype" },
    { label: "Marketing Administration", path: "/marketing/workflow", permission: "settings", state: "prototype" },
    { label: "Brand Ambassadors", path: "/marketing/ambassadors", permission: "brandAmbassadors", state: "existing" },
  ] },
  { label: "Insights & Support", entries: [
    { label: "Forecasts", path: "/reports/forecasts", permission: "reports", state: "prototype" },
    { label: "Insights Explorer", path: "/reports/explorer", permission: "reports", state: "prototype" },
    { label: "Reports & Insights", path: "/reports", permission: "reports", state: "prototype" },
    { label: "Cases", path: "/support/cases", permission: "work", state: "prototype" },
    { label: "Documents", path: "/documents", permission: "materials", state: "prototype" },
    { label: "Help", path: "/help", permission: "help", state: "existing" },
  ] },
  { label: "Administration", entries: [
    { label: "Administration", path: "/admin", permission: "settings", state: "prototype" },
    { label: "Employee Directory & Profiles", path: "/admin/employees", permission: "settings", state: "prototype" },
    { label: "Users & Roles", path: "/admin/access", permission: "settings", state: "prototype" },
    { label: "Workforce Live", path: "/admin/workforce", permission: "workforceLive", state: "prototype" },
    { label: "Audit Center", path: "/admin/audit", permission: "audit", state: "existing" },
    { label: "Account Consolidation", path: "/admin/accounts", permission: "settings", state: "prototype" },
    { label: "Data Exchange", path: "/admin/data-exchange", permission: "dataExchange", state: "prototype" },
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
  {label:"My Stops",path:"/driver/map"},
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
  dispatch: "/operations/field-schedule", retail: "/retail",
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
  "/marketing/campaigns": "marketing", // Existing deep links open the Campaigns tab in Marketing Overview.
  "/crm/territory-map": "salesMap", // Historical map URL opens the unified territory workspace.
  "/admin/employee-profiles": "settings", // Profiles retain their deep links inside the unified directory.
  "/operations/legacy-dispatch": "dispatch", // Older copied field-appointment links remain valid.
  "/sales/payments": "orderCash",
  "/sales/orders/workflow": "orders",
  "/inventory/workflow": "inventory",
  "/crm/quick-visit": "quickVisit",
  "/crm/account-health": "accounts",
  "/crm/account-map": "salesMap",
  "/work": "work",
  "/work/workflow": "work",
  "/work/exceptions": "work",
  "/work/completed": "work",
  "/self-service": "timekeeping",
  "/self-service/leave": "timekeeping",
  "/self-service/pay": "timekeeping",
  "/work/approvals": "work",
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
  // Exact directory and legacy destinations precede record IDs so /orders/workflow
  // and other action routes are never mistaken for real record identities.
  const legacy=(Object.keys(LEGACY_PATHS) as PageKey[]).find(key=>LEGACY_PATHS[key]===clean);
  if(legacy)return legacy;
  const menu=MENU_GROUPS.flatMap(group=>group.entries).find(entry=>entry.path===clean)
    ?? CUSTOMER_MENU.find(entry=>entry.path===clean);
  if(menu)return menu.permission;
  // Only explicitly registered, traversal-checked record URLs may resolve.
  return recordRouteMatch(clean)?.page ?? null;
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
  const item = routeEntry(clean) ?? CUSTOMER_MENU.find(entry => entry.path === clean);
  if (item) return item.label;
  const record=recordRouteMatch(clean);
  if(record)return record.label;
  if(clean.startsWith("/calendar/meetings/"))return "Meeting details";
  if (clean.startsWith("/items/")) return "Item details";
  if (clean.startsWith("/commerce/price-books/")) return "Price book details";
  if(clean==="/marketing/campaigns")return "Marketing · Campaigns";
  if(clean==="/crm/territory-map")return "Territories & Map";
  if(clean==="/admin/employee-profiles")return "Employee Directory & Profiles";
  if(clean==="/reports/center")return "Reporting Center archive";
  if(clean==="/operations/legacy-dispatch")return "Field scheduling (compatibility)";
  if(clean==="/operations/field-schedule")return "Field Scheduling";
  if(clean==="/reports/performance")return "Dashboard";
  if(clean==="/inventory/workflow")return "Inventory operations";
  if (clean.startsWith("/inventory/lots/")) return "Lot details";
  if (clean.startsWith("/inventory/shipments/")) return "Shipment details";
  if (clean.startsWith("/inventory/locations/")) return "Warehouse location details";
  if (clean.startsWith("/sales/customers/")) return "Customer details";
  if (clean==="/sales/orders/workflow") return "Order operations";
  if(clean==="/sales/orders/new")return "Create sales order";
  if(clean.startsWith("/sales/orders/")&&clean.endsWith("/edit"))return "Edit sales order";
  if (clean.startsWith("/admin/employee-profiles/")) return "Employee profile";
  if (clean.startsWith("/support/cases/")) return "Case details";
  if (clean.startsWith("/people/attendance/")) return "Attendance record";
  if (clean.startsWith("/people/performance/")) return "Performance record";
  if (clean.startsWith("/sales/orders/")) return "Order details";
  if (clean.startsWith("/sales/invoices/")) return "Invoice details";
  if (clean.startsWith("/sales/payments/")) return "Payment details";
  if (clean.startsWith("/purchases/")) return "Purchasing record details";
  if (clean.startsWith("/sales/returns/")) return "Return details";
  if (clean.startsWith("/sales/credit-notes/")) return "Credit note details";
  return clean === "/" ? "Home" : "Workspace";
}

export function permissionForPath(path: string): PageKey | null {
  const clean=normalizeRoutePath(path);
  // An exact match takes precedence over a generic record family.
  if(ROUTE_OVERRIDES[clean])return ROUTE_OVERRIDES[clean];
  const exact=routeEntry(clean)??CUSTOMER_MENU.find(item=>item.path===clean);
  if(exact)return exact.permission;
  return pageForPath(clean);
}

/**
 * A permission alone does not establish that a URL is a real application screen.
 * Unregistered deep routes must be denied, not rendered as another department's
 * legacy page. Add new record routes to navigation-route-contract.ts.
 */
export function canVisitRoute(user: WorkspaceUser | null, path: string): boolean {
  if (!user) return false;
  const clean = normalizeRoutePath(path);
  const isKnown = Boolean(recordRouteMatch(clean) || routeEntry(clean)
    || CUSTOMER_MENU.some(entry => entry.path === clean)
    || Object.values(LEGACY_PATHS).includes(clean)
    || Object.hasOwn(ROUTE_OVERRIDES, clean));
  if (!isKnown) return false;
  // Self-service is still available, but admin-only HR workflows cannot be
  // reached by manually entering an otherwise recognized URL.
  if (["/people/directory", "/people/new-hire", "/people/onboarding",
    "/people/onboarding/workflow", "/people/payroll/workflow", "/people/training"].includes(clean)
    && user.role !== "Administrator") return false;
  if (user.role === "Customer") {
    const customerOrderDetail = /^\/sales\/orders\/[^/]+$/.test(clean)
      && clean !== "/sales/orders/new" && clean !== "/sales/orders/workflow";
    const legacyCustomer = clean === "/sales/orders" || clean === "/sales/customers"
      || customerOrderDetail || /^\/sales\/customers\/[^/]+(?:\/(?:overview|comments|transactions|mails|statements|locations))?$/.test(clean);
    const portalDetail = /^\/portal\/(orders|deliveries)\/[^/]+$/.test(clean);
    return (clean === "/" || CUSTOMER_MENU.some(entry => entry.path === clean)
      || legacyCustomer || portalDetail)
      && canAccessPage(user, permissionForPath(clean) ?? "home");
  }
  // Purchasing actions have distinct preparation, receipt, and payment rights.
  // These UI checks are not a substitute for backend transaction authorization.
  if(clean.startsWith("/purchases/")){
    const purchaseSection=clean.split("/")[2];
    if(purchaseSection==="receipts")return ["Administrator","Operations","Warehouse"].includes(user.role);
    if(purchaseSection==="payments")return user.role==="Administrator";
    if(["vendors","expenses","orders","bills","credits"].includes(purchaseSection))
      return ["Administrator","Operations"].includes(user.role);
    return false;
  }
  if(clean==="/inventory/locations"||clean.startsWith("/inventory/locations/"))
    return ["Administrator","Operations","Warehouse"].includes(user.role);
  if(clean==="/crm/self-delivery")return user.role==="Sales Representative"||user.role==="Administrator";
  // Copying a URL must not bypass employee confidentiality when a module is hidden in navigation.
  // Until verified employee-specific payroll is integrated, these paths remain Administrator-only.
  const privilegedHr = ["/people/new-hire","/people/onboarding","/people/compliance","/people/training","/people/payroll"];
  if (user.role!=="Administrator" && privilegedHr.some(prefix=>clean===prefix||clean.startsWith(prefix+"/"))) return false;
  if(clean==="/reports/forecasts"||clean.startsWith("/reports/forecasts/"))
    return ["Administrator","Sales Manager","Sales Representative","Operations"].includes(user.role)&&canAccessPage(user,"reports");
  if (clean==="/marketing/campaigns"||clean.startsWith("/marketing/campaigns/")) return user.role==="Administrator"&&canAccessPage(user,"marketing");
  if (clean==="/support/cases"||clean.startsWith("/support/cases/")) return ["Administrator","Operations","Sales Manager","Sales Representative"].includes(user.role)&&canAccessPage(user,"work");
  if (clean.startsWith("/portal/")) return false;
  if (clean === "/operations/deliveries"
    && !["Administrator", "Operations", "Warehouse"].includes(user.role)) return false;
  if (clean.startsWith("/admin/") && user.role !== "Administrator") return false;
  const permission = permissionForPath(clean);
  return permission !== null && canAccessPage(user, permission);
}

/** Prototype-only department visibility. Final policy will use per-action grants.
 * Department menus should not imply the user has HR or Marketing administrative access.
 * Individual employee self-service must be provided separately from HR management.
 */
export function canShowModuleInMenu(user: WorkspaceUser | null, path: string): boolean {
  if (!user || !canVisitRoute(user,path)) return false;
  if (user.role==="Customer") return false;
  const group = MENU_GROUPS.find(g=>g.entries.some(e=>e.path===normalizeRoutePath(path)))?.label;
  if (!group) return false; // Compatibility URLs are valid links, not sidebar destinations.
  if (group==="Human Resources" && user.role!=="Administrator") return false;
  if (group==="Marketing" && !["Administrator","Marketing","Brand Ambassador"].includes(user.role)) return false;
  return true;
}

export function requiresPrototypePage(path: string): boolean {
  const clean = normalizeRoutePath(path);
  // Preserve campaign bookmarks after removing the duplicate sidebar entry.
  if(["/marketing/campaigns","/crm/territory-map","/admin/employee-profiles","/operations/legacy-dispatch"].includes(clean))return true;
  // Historical copied links and work-queue entry points retain the redesigned views
  // after personal information moves out of the Workspace sidebar.
  if(["/self-service","/self-service/leave","/self-service/pay","/work/approvals","/work/exceptions","/work/completed"].includes(clean))return true;
  if(clean==="/sales/orders/workflow"||clean==="/inventory/workflow"||clean==="/work/workflow")return false;
  if(recordRouteMatch(clean))return true;
  if(/^\/portal\/(orders|deliveries)\/[^/]+$/.test(clean))return true;
  if(/^\/calendar\/meetings\/[^/]+(?:\/edit)?$/.test(clean))return true;
  if(/^\/crm\/(leads|contacts|deals)\/[^/]+$/.test(clean))return true;
  // Sensitive legacy HR and payroll tools are wrapped by a prototype demo-only gate.
  if(clean==="/people/payroll/workflow"||clean==="/people/onboarding/workflow"||clean==="/admin/employee-profiles/workflow")return true;
  if (clean.startsWith("/people/attendance/") || clean.startsWith("/people/performance/") || clean.startsWith("/support/cases/") || clean.startsWith("/admin/employee-profiles/") || clean.startsWith("/inventory/shipments/") || clean.startsWith("/inventory/lots/") || clean.startsWith("/items/") || clean.startsWith("/sales/customers/") || clean.startsWith("/sales/orders/") || clean.startsWith("/sales/invoices/") || clean.startsWith("/sales/payments/") || clean.startsWith("/sales/returns/") || clean.startsWith("/sales/credit-notes/") || (clean.startsWith("/portal/") && clean!=="/portal/orders")) return true;
  const entry = routeEntry(clean);
  return Boolean(entry && entry.state !== "existing");
}
