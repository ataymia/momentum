"use client";

import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, FileText, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { canAccessPage } from "../lib/access";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import { useCommerce } from "../lib/commerce-context";
import { useCrm } from "../lib/crm-context";
import { useFirebaseSessionOptional } from "../lib/firebase-session-context";
import { useNotifications } from "../lib/notification-context";
import { useRuntimeMode } from "../lib/runtime-mode";
import type { PageKey, WorkspaceUser } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import { AccountsPage } from "./pages/accounts";
import { BrandAmbassadorsPage } from "./pages/brand-ambassadors";
import { DashboardPage } from "./pages/dashboard";
import { DispatchPage } from "./pages/dispatch";
import { FinancePage } from "./pages/finance";
import { HelpPage } from "./pages/help";
import { InventoryPage } from "./pages/inventory";
import { MarketingPage } from "./pages/marketing";
import { OrdersPage } from "./pages/orders";
import { AccountSetupPage, MaterialsPage, ProductsPage, QuickVisitPage, SalesMapPage, TimekeepingPage } from "./pages/operations-tools";
import { PayrollPage } from "./pages/payroll";
import { PeoplePage } from "./pages/people";
import { ReportsPage } from "./pages/reports";
import { RetailPage } from "./pages/retail";
import { SettingsPage } from "./pages/settings";
import { WorkPage } from "./pages/work";
import { AccountHealthPage, AccountingWorkspacePage, ActionCenterPage, AuditWorkspacePage, CrmToolsPage, DataExchangePage, EmployeeDirectoryPage, InventoryLedgerPage, NewHirePage, OnboardingQueuePage, OrderCashPage, PerformanceWorkspacePage, ReportingCenterPage, TrainingSetupPage } from "./pages/focused-workspace-pages";
import { SyncStatusPill } from "./settings/firebase-access-panel";
import { Avatar, BrandMark, Button, Modal, formatDate } from "./ui";

type NavItem = { key: PageKey; label: string; icon: typeof LayoutDashboard };
type SearchResult = { id: string; type: string; title: string; detail: string; page: PageKey; focus?: string; icon: "location" | "order" | "person" | "calendar" | "invoice" | "inventory" };
type SectionTab = { key: PageKey; label: string };

const primaryNav: NavItem[] = [
  { key: "home", label: "Home", icon: LayoutDashboard }, { key: "work", label: "My work", icon: CheckSquare2 },
  { key: "accounts", label: "CRM & sales", icon: Building2 }, { key: "dispatch", label: "Dispatch board", icon: CalendarDays },
  { key: "retail", label: "Retail execution", icon: Store }, { key: "orders", label: "Orders & billing", icon: ShoppingCart },
  { key: "inventory", label: "Inventory & fulfillment", icon: Boxes }, { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "brandAmbassadors", label: "Brand Ambassadors", icon: PartyPopper },
  { key: "timekeeping", label: "Clock In / Timekeeping", icon: CalendarDays },
  { key: "materials", label: "Materials / Resources", icon: FileText },
  { key: "people", label: "Human Resources", icon: UsersRound }, { key: "payroll", label: "Payroll", icon: BadgeDollarSign },
  { key: "finance", label: "Finance & accounting", icon: CircleDollarSign },
];
const secondaryNav: NavItem[] = [
  { key: "reports", label: "Performance & reports", icon: BarChart3 },
  { key: "settings", label: "Administration", icon: Settings },
  { key: "help", label: "Help", icon: CircleHelp },
];

const sectionTabs: Partial<Record<PageKey, SectionTab[]>> = {
  work: [{key:"work",label:"Approvals"},{key:"actions",label:"Action center"}],
  accounts: [{key:"accounts",label:"Accounts"},{key:"quickVisit",label:"Quick Visit"},{key:"salesMap",label:"Map"},{key:"accountSetup",label:"Account setup"},{key:"accountHealth",label:"Account health"},{key:"crmTools",label:"CRM tools"}],
  orders: [{key:"orders",label:"Orders"},{key:"orderCash",label:"Invoices & payments"}],
  inventory: [{key:"inventory",label:"Fulfillment"},{key:"inventoryLedger",label:"Inventory ledger"}],
  people: [{key:"people",label:"HR home"},{key:"employees",label:"Employee directory"},{key:"newHire",label:"New hire"},{key:"onboarding",label:"Onboarding queue"},{key:"trainingAdmin",label:"Training setup"}],
  finance: [{key:"finance",label:"Finance"},{key:"accounting",label:"Accounting"}],
  reports: [{key:"reports",label:"Reports"},{key:"performance",label:"Performance"},{key:"reportingCenter",label:"Reporting center"},{key:"audit",label:"Audit trail"}],
  settings: [{key:"settings",label:"Administration"},{key:"dataExchange",label:"Data exchange"}],
};
const pageParent: Partial<Record<PageKey, PageKey>> = {
  actions:"work", quickVisit:"accounts", salesMap:"accounts", accountSetup:"accounts", accountHealth:"accounts", crmTools:"accounts", orderCash:"orders", inventoryLedger:"inventory",
  employees:"people", newHire:"people", onboarding:"people", trainingAdmin:"people", accounting:"finance", performance:"reports",
  reportingCenter:"reports", audit:"reports", dataExchange:"settings",
};
const pageLabels: Partial<Record<PageKey,string>> = {
  actions:"Action center", quickVisit:"Quick Visit", salesMap:"Account map", accountSetup:"Account setup", accountHealth:"Account health", crmTools:"CRM tools", orderCash:"Invoices & payments", timekeeping:"Timekeeping", materials:"Materials & Resources", products:"Products",
  inventoryLedger:"Inventory ledger", employees:"Employee directory", newHire:"New hire", onboarding:"Onboarding queue", trainingAdmin:"Training setup",
  brandAmbassadors:"Brand Ambassadors",
  accounting:"Accounting", performance:"Performance", reportingCenter:"Reporting center", audit:"Audit trail", dataExchange:"Data exchange",
};
const demoTourIds = new Set(["usr-flo", "usr-mia", "usr-avery", "usr-jordan", "usr-customer"]);
const labelFor = (item: NavItem, user: WorkspaceUser) => user.role === "Brand Ambassador" ? (item.key === "brandAmbassadors" ? "My schedule" : item.label) : user.role !== "Customer" ? item.label : item.key === "home" ? "Account overview" : item.key === "accounts" ? "My account" : item.key === "orders" ? "My orders" : item.label;

function NavButton({ item, user }: { item: NavItem; user: WorkspaceUser }) {
  const { activePage, navigate, scope, data } = useWorkspace(); const Icon = item.icon; const label = labelFor(item, user);
  const accountIds = new Set(scope.accounts.map((account) => account.id));
  const earnedSignals = item.key === "accounts" ? evaluateSalesRepAccountBonuses(data).filter((signal) => signal.status === "Earned" && accountIds.has(signal.accountId)).length : 0;
  const pending = item.key === "work" ? scope.approvals.filter((entry) => entry.status === "Pending").length : earnedSignals;
  const selected = activePage === item.key || pageParent[activePage] === item.key;
  return <button className={`nav-item ${selected ? "is-active" : ""}`} onClick={() => navigate(item.key)} aria-current={selected ? "page" : undefined} title={label}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{pending > 0 && <i className="nav-count">{pending}</i>}</button>;
}

function SectionSubnav(){
  const {activePage,currentUser,navigate}=useWorkspace();
  if(!currentUser)return null;
  const root=pageParent[activePage]??activePage;
  const tabs=(sectionTabs[root]??[]).filter((tab)=>canAccessPage(currentUser,tab.key));
  if(tabs.length<2)return null;
  return <nav className="section-subnav" aria-label="Section navigation">{tabs.map((tab)=><button key={tab.key} className={activePage===tab.key?"is-active":""} onClick={()=>navigate(tab.key)}>{tab.label}</button>)}</nav>;
}

function PageView() {
  const { activePage } = useWorkspace();
  switch (activePage) {
    case "home": return <DashboardPage/>;
    case "work": return <WorkPage/>;
    case "actions": return <ActionCenterPage/>;
    case "accounts": return <AccountsPage/>;
    case "quickVisit": return <QuickVisitPage/>;
    case "salesMap": return <SalesMapPage/>;
    case "accountSetup": return <AccountSetupPage/>;
    case "accountHealth": return <AccountHealthPage/>;
    case "crmTools": return <CrmToolsPage/>;
    case "dispatch": return <DispatchPage/>;
    case "retail": return <RetailPage/>;
    case "orders": return <OrdersPage/>;
    case "orderCash": return <OrderCashPage/>;
    case "inventory": return <InventoryPage/>;
    case "inventoryLedger": return <InventoryLedgerPage/>;
    case "products": return <ProductsPage/>;
    case "marketing": return <MarketingPage/>;
    case "brandAmbassadors": return <BrandAmbassadorsPage/>;
    case "people": return <PeoplePage/>;
    case "timekeeping": return <TimekeepingPage/>;
    case "materials": return <MaterialsPage/>;
    case "employees": return <EmployeeDirectoryPage/>;
    case "newHire": return <NewHirePage/>;
    case "onboarding": return <OnboardingQueuePage/>;
    case "trainingAdmin": return <TrainingSetupPage/>;
    case "payroll": return <PayrollPage/>;
    case "finance": return <FinancePage/>;
    case "accounting": return <AccountingWorkspacePage/>;
    case "reports": return <ReportsPage/>;
    case "performance": return <PerformanceWorkspacePage/>;
    case "reportingCenter": return <ReportingCenterPage/>;
    case "audit": return <AuditWorkspacePage/>;
    case "settings": return <SettingsPage/>;
    case "dataExchange": return <DataExchangePage/>;
    case "help": return <HelpPage/>;
    default: return <DashboardPage/>;
  }
}

export function AppShell() {
  const { data, scope, currentUser, activePage, sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed, navigate, logout, switchUser, markNotificationsRead } = useWorkspace();
  const { crm } = useCrm(); const { commerce } = useCommerce(); const runtime = useRuntimeMode(); const generated = useNotifications(); const firebase = useFirebaseSessionOptional();
  const [searchOpen, setSearchOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [userOpen, setUserOpen] = useState(false); const [query, setQuery] = useState("");
  const [passwordOpen,setPasswordOpen]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [passwordError,setPasswordError]=useState(""); const [passwordBusy,setPasswordBusy]=useState(false);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setUserOpen(false); } }; addEventListener("keydown", listener); return () => removeEventListener("keydown", listener); }, []);
  if (!currentUser) return null;

  const allowedPrimary = primaryNav.filter((item) => canAccessPage(currentUser, item.key)); const allowedSecondary = secondaryNav.filter((item) => canAccessPage(currentUser, item.key));
  const switchableUsers = runtime.isDemo ? data.users.filter((user) => demoTourIds.has(user.id)) : [];
  const unread = generated.unreadCount;
  const normalized = query.trim().toLowerCase(); const searchResults: SearchResult[] = [];
  if (normalized) {
    const accountIds = new Set(scope.accounts.map((account) => account.id));
    for (const account of scope.accounts.filter((account) => [account.name, account.locationName, account.location, account.streetAddress, account.contactName, account.phone, account.email, account.channel].join(" ").toLowerCase().includes(normalized)).slice(0, 6)) searchResults.push({ id: `account-${account.id}`, type: "Location", title: account.locationName ?? account.name, detail: `${account.location} · ${account.stage}`, page: "accounts", focus: account.id, icon: "location" });
    for (const contact of crm.contacts.filter((contact) => !contact.locationId || accountIds.has(contact.locationId)).filter((contact) => [contact.name, contact.role, contact.email, contact.phone, contact.decisionRole].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `contact-${contact.id}`, type: "Contact", title: contact.name, detail: `${contact.role}${contact.phone ? ` · ${contact.phone}` : ""}`, page: "accounts", focus: contact.locationId, icon: "person" });
    for (const order of scope.orders.filter((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); return `${order.number} ${account?.name ?? ""} ${account?.locationName ?? ""}`.toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `order-${order.id}`, type: "Order", title: order.number, detail: `${order.cases} cases · ${order.status}`, page: "orders", focus: order.id, icon: "order" });
    for (const appointment of scope.appointments.filter((item) => { const account = scope.accounts.find((account) => account.id === item.accountId); return [item.type, item.objective, item.date, item.startTime, item.location, account?.name].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `appointment-${appointment.id}`, type: "Appointment", title: appointment.type, detail: `${appointment.date} ${appointment.startTime} · ${appointment.status}`, page: "dispatch", focus: appointment.id, icon: "calendar" });
    for (const invoice of commerce.invoices.filter((invoice) => scope.orders.some((order) => order.id === invoice.orderId)).filter((invoice) => { const order = scope.orders.find((item) => item.id === invoice.orderId); const account = scope.accounts.find((item) => item.id === invoice.accountId); return [invoice.number, order?.number, account?.name, invoice.status].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `invoice-${invoice.id}`, type: "Invoice", title: invoice.number, detail: `${invoice.status} · ${invoice.total.toFixed(2)}`, page: "orderCash", focus: invoice.orderId, icon: "invoice" });
    if (canAccessPage(currentUser, "people")) for (const user of scope.users.filter((user) => [user.name, user.email, user.title, user.role, user.team].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `user-${user.id}`, type: "Person", title: user.name, detail: `${user.title} · ${user.email}`, page: "employees", focus: user.id, icon: "person" });
    if (canAccessPage(currentUser, "inventory")) for (const lot of scope.inventory.filter((lot) => [lot.lotCode, lot.product, lot.location, lot.status].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `lot-${lot.id}`, type: "Inventory lot", title: lot.lotCode, detail: `${lot.product} · ${lot.status}`, page: "inventory", focus: lot.id, icon: "inventory" });
  }
  const visibleSearchResults = searchResults.slice(0, 24);
  const allNav = [...primaryNav, ...secondaryNav]; const rootPage=pageParent[activePage]??activePage; const activeNav = allNav.find((item) => item.key === rootPage); const pageName = pageLabels[activePage] ?? (activeNav ? labelFor(activeNav, currentUser) : "Home"); const customerMode = currentUser.role === "Customer";
  const openResult = (page: PageKey, focus?: string) => { if (focus) sessionStorage.setItem("momentum-focus-record", focus); navigate(page); setSearchOpen(false); setQuery(""); }; const markAll = () => { markNotificationsRead(); generated.markAllRead(); };
  const resultIcon = (result: SearchResult) => result.icon === "location" ? <Building2 size={18}/> : result.icon === "calendar" ? <CalendarDays size={18}/> : result.icon === "person" ? <UsersRound size={18}/> : result.icon === "inventory" ? <Boxes size={18}/> : result.icon === "invoice" ? <CircleDollarSign size={18}/> : <ShoppingCart size={18}/>;
  const changePassword=async(event:FormEvent)=>{event.preventDefault();setPasswordError("");if(!firebase){setPasswordError("Firebase Authentication is not connected.");return;}if(newPassword.length<10||!/[a-z]/.test(newPassword)||!/[A-Z]/.test(newPassword)||!/\d/.test(newPassword)){setPasswordError("Use at least 10 characters with upper-case, lower-case, and a digit.");return;}if(newPassword!==confirmPassword){setPasswordError("The two passwords do not match.");return;}setPasswordBusy(true);const result=await firebase.changePassword(newPassword);setPasswordBusy(false);if(!result.ok){setPasswordError(result.message??"Password change failed.");return;}setPasswordOpen(false);setNewPassword("");setConfirmPassword("");};

  return <div className={`app-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}><aside className={`sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}><div className="sidebar__top"><BrandMark/><button className="sidebar__collapse" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div><button className="sidebar-search" onClick={() => setSearchOpen(true)} title="Search records"><Search size={17}/><span>Search records</span><kbd>⌘ K</kbd></button><nav className="sidebar__nav" aria-label="Primary navigation"><p>Operate</p>{allowedPrimary.map((item) => <NavButton key={item.key} item={item} user={currentUser}/>)}{allowedSecondary.length > 0 && <p>Reference</p>}{allowedSecondary.map((item) => <NavButton key={item.key} item={item} user={currentUser}/>)}</nav></aside>{sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"/>}<div className="app-main"><header className="topbar"><div className="topbar__left"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21}/></button><nav className="topbar__location" aria-label="Breadcrumb"><button className="breadcrumb-home" onClick={() => navigate("home")} disabled={activePage === "home"}>Momentum</button><ChevronRight size={14}/><strong>{pageName}</strong></nav></div><div className="topbar__actions">{firebase&&<SyncStatusPill/>}<button className="topbar-search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={19}/></button>{!customerMode && <div className="popover-wrap"><button className="icon-button topbar__notification" onClick={() => { setNotificationsOpen((open) => !open); setUserOpen(false); }} aria-label={`${unread} unread notifications`}><Bell size={19}/>{unread > 0 && <i>{unread}</i>}</button>{notificationsOpen && <div className="popover notification-popover"><header><div><strong>Notifications</strong><small>{unread} unread</small></div><button onClick={markAll}>Mark all read</button></header><div className="notification-list">{generated.currentUserItems.slice(0, 12).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · action notification</small></div></article>)}{generated.currentUserItems.length === 0 && <div className="popover-empty">No action notifications. Routine movement stays in Audit.</div>}</div></div>}</div>}<div className="popover-wrap"><button className="user-button" onClick={() => { setUserOpen((open) => !open); setNotificationsOpen(false); }}><Avatar initials={currentUser.initials} color={currentUser.accent} size="sm"/><span><strong>{currentUser.firstName}</strong><small>{currentUser.role}</small></span><ChevronDown size={14}/></button>{userOpen && <div className="popover user-popover"><div className="user-popover__current"><Avatar initials={currentUser.initials} color={currentUser.accent}/><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div>{runtime.isDemo&&<><p>Switch demo role</p>{switchableUsers.map((user) => <button key={user.id} className={user.id === currentUser.id ? "is-current" : ""} onClick={() => { switchUser(user.id); setUserOpen(false); }}><Avatar initials={user.initials} color={user.accent} size="sm"/><span><strong>{user.name}</strong><small>{user.title}</small></span></button>)}</>}{firebase&&<button onClick={()=>{setUserOpen(false);setPasswordOpen(true)}}><KeyRound size={16}/><span><strong>Change password</strong><small>Update your own sign-in password</small></span></button>}<button className="user-popover__logout" onClick={logout}><LogOut size={16}/><span>Sign out</span></button></div>}</div></div></header><div className="page-container"><SectionSubnav/><PageView/></div></div><Modal open={searchOpen} title="Search Momentum" description={customerMode ? "Find your linked account, location, or order." : "Search customers, locations, contacts, phone numbers, email, appointments, orders, invoices, people, and inventory within your scope."} onClose={() => { setSearchOpen(false); setQuery(""); }} wide><div className="command-search"><Search size={20}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={customerMode ? "Search location or order…" : "Search records…"}/><kbd>ESC</kbd></div><div className="command-results">{!query && <div className="command-empty"><Command size={28}/><p>Start typing to search records you can access.</p></div>}{query && visibleSearchResults.length === 0 && <div className="command-empty"><p>No matching records in your scope.</p></div>}{visibleSearchResults.map((result) => <button key={result.id} onClick={() => openResult(result.page, result.focus)}><span className="command-result__icon">{resultIcon(result)}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><span>{result.type}</span><ChevronRight size={16}/></button>)}</div></Modal><Modal open={passwordOpen} title="Change password" description="Update your own Firebase Authentication password. Momentum never stores it." onClose={()=>{setPasswordOpen(false);setPasswordError("")}} footer={<><Button variant="ghost" onClick={()=>setPasswordOpen(false)}>Cancel</Button><Button type="submit" form="self-password-form" disabled={passwordBusy}>Save new password</Button></>}><form id="self-password-form" className="access-gate-form" onSubmit={changePassword}><label><span>New password</span><input type="password" required autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)}/></label><label><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)}/></label>{passwordError&&<p className="form-error" role="alert">{passwordError}</p>}</form></Modal></div>;
}
