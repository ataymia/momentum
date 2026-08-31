"use client";

import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, Command, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { canAccessPage } from "../lib/access";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { useCommerce } from "../lib/commerce-context";
import { useCrm } from "../lib/crm-context";
import { useNotifications } from "../lib/notification-context";
import { useRuntimeMode } from "../lib/runtime-mode";
import type { PageKey, WorkspaceUser } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import { AccountingPanel } from "./accounting/accounting-panel";
import { AuditCenter } from "./audit/audit-center";
import { OrderCashPanel } from "./commerce/order-cash-panel";
import { CrmDepthPanel } from "./crm/crm-depth-panel";
import { AdvancedHcmPanel } from "./hcm/advanced-hcm";
import { InventoryLedgerPanel } from "./inventory/inventory-ledger-panel";
import { AccountsPage } from "./pages/accounts";
import { DashboardPage } from "./pages/dashboard";
import { DispatchPage } from "./pages/dispatch";
import { FinancePage } from "./pages/finance";
import { InventoryPage } from "./pages/inventory";
import { MarketingPage } from "./pages/marketing";
import { OrdersPage } from "./pages/orders";
import { PayrollPage } from "./pages/payroll";
import { PeoplePage } from "./pages/people";
import { ReportsPage } from "./pages/reports";
import { RetailPage } from "./pages/retail";
import { SettingsPage } from "./pages/settings";
import { WorkPage } from "./pages/work";
import { DashboardPerformance } from "./performance/dashboard-performance";
import { ReportingCenter } from "./performance/reporting-center";
import { Avatar, BrandMark, Modal, StatusPill, formatDate } from "./ui";
import { ActionCenter } from "./work/action-center";

type NavItem = { key: PageKey; label: string; icon: typeof LayoutDashboard };
type SearchResult = { id: string; type: string; title: string; detail: string; page: PageKey; focus?: string; icon: "location" | "order" | "person" | "calendar" | "invoice" | "inventory" };

const primaryNav: NavItem[] = [
  { key: "home", label: "Home", icon: LayoutDashboard }, { key: "work", label: "My work", icon: CheckSquare2 },
  { key: "accounts", label: "CRM & sales", icon: Building2 }, { key: "dispatch", label: "Dispatch board", icon: CalendarDays },
  { key: "retail", label: "Retail execution", icon: Store }, { key: "orders", label: "Orders & billing", icon: ShoppingCart },
  { key: "inventory", label: "Inventory & fulfillment", icon: Boxes }, { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "people", label: "Human Resources", icon: UsersRound }, { key: "payroll", label: "Payroll", icon: BadgeDollarSign },
  { key: "finance", label: "Finance & accounting", icon: CircleDollarSign },
];
const secondaryNav: NavItem[] = [{ key: "reports", label: "Performance & reports", icon: BarChart3 }, { key: "settings", label: "Administration", icon: Settings }];
const demoTourIds = new Set(["usr-flo", "usr-mia", "usr-avery", "usr-jordan", "usr-customer"]);
const labelFor = (item: NavItem, user: WorkspaceUser) => user.role !== "Customer" ? item.label : item.key === "home" ? "Account overview" : item.key === "accounts" ? "My account" : item.key === "orders" ? "My orders" : item.label;

function NavButton({ item, user }: { item: NavItem; user: WorkspaceUser }) {
  const { activePage, navigate, scope, data } = useWorkspace(); const Icon = item.icon; const label = labelFor(item, user);
  const accountIds = new Set(scope.accounts.map((account) => account.id));
  const earnedSignals = item.key === "accounts" ? evaluateSalesRepAccountBonuses(data).filter((signal) => signal.status === "Earned" && accountIds.has(signal.accountId)).length : 0;
  const pending = item.key === "work" ? scope.approvals.filter((entry) => entry.status === "Pending").length : earnedSignals;
  return <button className={`nav-item ${activePage === item.key ? "is-active" : ""}`} onClick={() => navigate(item.key)} aria-current={activePage === item.key ? "page" : undefined} title={label}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{pending > 0 && <i className="nav-count">{pending}</i>}</button>;
}

function PageView() {
  const { activePage } = useWorkspace();
  switch (activePage) {
    case "home": return <><DashboardPage/><DashboardPerformance/></>;
    case "work": return <><WorkPage/><ActionCenter/></>;
    case "accounts": return <><AccountsPage/><CrmDepthPanel/></>;
    case "dispatch": return <DispatchPage/>;
    case "retail": return <RetailPage/>;
    case "orders": return <><OrdersPage/><OrderCashPanel/></>;
    case "inventory": return <><InventoryPage/><InventoryLedgerPanel/></>;
    case "marketing": return <MarketingPage/>;
    case "people": return <><PeoplePage/><AdvancedHcmPanel/></>;
    case "payroll": return <PayrollPage/>;
    case "finance": return <><FinancePage/><AccountingPanel/></>;
    case "reports": return <><ReportsPage/><ReportingCenter/><AuditCenter/></>;
    case "settings": return <SettingsPage/>;
    default: return <DashboardPage/>;
  }
}

export function AppShell() {
  const { data, scope, currentUser, activePage, sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed, navigate, logout, switchUser, markNotificationsRead } = useWorkspace();
  const { crm } = useCrm(); const { commerce } = useCommerce(); const runtime = useRuntimeMode(); const generated = useNotifications();
  const [searchOpen, setSearchOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [userOpen, setUserOpen] = useState(false); const [query, setQuery] = useState("");
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setUserOpen(false); } }; addEventListener("keydown", listener); return () => removeEventListener("keydown", listener); }, []);
  if (!currentUser) return null;

  const allowedPrimary = primaryNav.filter((item) => canAccessPage(currentUser, item.key)); const allowedSecondary = secondaryNav.filter((item) => canAccessPage(currentUser, item.key));
  const switchableUsers = runtime.isDemo ? data.users.filter((user) => demoTourIds.has(user.id)) : data.users;
  const legacyUnread = currentUser.role === "Customer" ? 0 : scope.notifications.filter((item) => !item.readBy.includes(currentUser.id)).length; const unread = legacyUnread + generated.unreadCount;
  const normalized = query.trim().toLowerCase(); const searchResults: SearchResult[] = [];
  if (normalized) {
    const accountIds = new Set(scope.accounts.map((account) => account.id));
    for (const account of scope.accounts.filter((account) => [account.name, account.locationName, account.location, account.streetAddress, account.contactName, account.phone, account.email, account.channel].join(" ").toLowerCase().includes(normalized)).slice(0, 6)) searchResults.push({ id: `account-${account.id}`, type: "Location", title: account.locationName ?? account.name, detail: `${account.location} · ${account.stage}`, page: "accounts", focus: account.id, icon: "location" });
    for (const contact of crm.contacts.filter((contact) => !contact.locationId || accountIds.has(contact.locationId)).filter((contact) => [contact.name, contact.role, contact.email, contact.phone, contact.decisionRole].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `contact-${contact.id}`, type: "Contact", title: contact.name, detail: `${contact.role}${contact.phone ? ` · ${contact.phone}` : ""}`, page: "accounts", focus: contact.locationId, icon: "person" });
    for (const order of scope.orders.filter((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); return `${order.number} ${account?.name ?? ""} ${account?.locationName ?? ""}`.toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `order-${order.id}`, type: "Order", title: order.number, detail: `${order.cases} cases · ${order.status}`, page: "orders", focus: order.id, icon: "order" });
    for (const appointment of scope.appointments.filter((item) => { const account = scope.accounts.find((account) => account.id === item.accountId); return [item.type, item.objective, item.date, item.startTime, item.location, account?.name].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `appointment-${appointment.id}`, type: "Appointment", title: appointment.type, detail: `${appointment.date} ${appointment.startTime} · ${appointment.status}`, page: "dispatch", focus: appointment.id, icon: "calendar" });
    for (const invoice of commerce.invoices.filter((invoice) => scope.orders.some((order) => order.id === invoice.orderId)).filter((invoice) => { const order = scope.orders.find((item) => item.id === invoice.orderId); const account = scope.accounts.find((item) => item.id === invoice.accountId); return [invoice.number, order?.number, account?.name, invoice.status].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `invoice-${invoice.id}`, type: "Invoice", title: invoice.number, detail: `${invoice.status} · ${invoice.total.toFixed(2)}`, page: "orders", focus: invoice.orderId, icon: "invoice" });
    if (canAccessPage(currentUser, "people")) for (const user of scope.users.filter((user) => [user.name, user.email, user.title, user.role, user.team].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `user-${user.id}`, type: "Person", title: user.name, detail: `${user.title} · ${user.email}`, page: "people", focus: user.id, icon: "person" });
    if (canAccessPage(currentUser, "inventory")) for (const lot of scope.inventory.filter((lot) => [lot.lotCode, lot.product, lot.location, lot.status].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `lot-${lot.id}`, type: "Inventory lot", title: lot.lotCode, detail: `${lot.product} · ${lot.status}`, page: "inventory", focus: lot.id, icon: "inventory" });
  }
  const visibleSearchResults = searchResults.slice(0, 24);
  const allNav = [...primaryNav, ...secondaryNav]; const activeNav = allNav.find((item) => item.key === activePage); const pageName = activeNav ? labelFor(activeNav, currentUser) : "Home"; const customerMode = currentUser.role === "Customer";
  const openResult = (page: PageKey, focus?: string) => { if (focus) sessionStorage.setItem("momentum-focus-record", focus); navigate(page); setSearchOpen(false); setQuery(""); }; const markAll = () => { markNotificationsRead(); generated.markAllRead(); };
  const resultIcon = (result: SearchResult) => result.icon === "location" ? <Building2 size={18}/> : result.icon === "calendar" ? <CalendarDays size={18}/> : result.icon === "person" ? <UsersRound size={18}/> : result.icon === "inventory" ? <Boxes size={18}/> : result.icon === "invoice" ? <CircleDollarSign size={18}/> : <ShoppingCart size={18}/>;

  return <div className={`app-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}><aside className={`sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}><div className="sidebar__top"><BrandMark/><button className="sidebar__collapse" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div><button className="sidebar-search" onClick={() => setSearchOpen(true)} title="Search records"><Search size={17}/><span>Search records</span><kbd>⌘ K</kbd></button><nav className="sidebar__nav" aria-label="Primary navigation"><p>Operate</p>{allowedPrimary.map((item) => <NavButton key={item.key} item={currentUser}/>)}</nav></aside></div>;
}
