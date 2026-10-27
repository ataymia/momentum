"use client";

import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, FileText, KeyRound, LayoutDashboard, LogOut, Mail, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, UsersRound, X } from "lucide-react";
import { FormEvent, Suspense, lazy, useEffect, useState } from "react";
import { canAccessPage } from "../lib/access";
import { useFirebaseSessionOptional } from "../lib/firebase-session-context";
import {traceNavigationCommit} from "../lib/performance-diagnostics";
import { useNotifications } from "../lib/notification-context";
import { useRuntimeMode } from "../lib/runtime-mode";
import type { PageKey, WorkspaceUser } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import {useNavigationPage} from "../lib/navigation-store";
import { AccountsPage } from "./pages/accounts";

import { DashboardPage } from "./pages/dashboard";
import { DispatchPage } from "./pages/dispatch";




import { OrdersPage } from "./pages/orders";





import { SettingsPage } from "./pages/settings";
import { WorkPage } from "./pages/work";


import { DeviceNavigation } from "./navigation/device-navigation";
import {GlobalSearchModal} from "./global-search-modal";
import { SyncStatusPill } from "./settings/firebase-access-panel";
import { Avatar, BrandMark, Button, Modal, formatDate } from "./ui";

// Load rarely used workspaces on demand; do not parse all departmental pages before Home renders.
const BrandAmbassadorsPage=lazy(()=>import("./pages/brand-ambassadors").then((module)=>({default:module.BrandAmbassadorsPage})));
const FinancePage=lazy(()=>import("./pages/finance").then((module)=>({default:module.FinancePage})));
const HelpPage=lazy(()=>import("./pages/help").then((module)=>({default:module.HelpPage})));
const InventoryPage=lazy(()=>import("./pages/inventory").then((module)=>({default:module.InventoryPage})));
const MarketingPage=lazy(()=>import("./pages/marketing").then((module)=>({default:module.MarketingPage})));
const AccountSetupPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.AccountSetupPage})));
const MaterialsPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.MaterialsPage})));
const ProductsPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.ProductsPage})));
const QuickVisitPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.QuickVisitPage})));
const SalesMapPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.SalesMapPage})));
const TimekeepingPage=lazy(()=>import("./pages/operations-tools").then((module)=>({default:module.TimekeepingPage})));
const PayrollPage=lazy(()=>import("./pages/payroll").then((module)=>({default:module.PayrollPage})));
const PeoplePage=lazy(()=>import("./pages/people").then((module)=>({default:module.PeoplePage})));
const ReportsPage=lazy(()=>import("./pages/reports").then((module)=>({default:module.ReportsPage})));
const RetailPage=lazy(()=>import("./pages/retail").then((module)=>({default:module.RetailPage})));
const WorkforceLivePage=lazy(()=>import("./pages/workforce-live").then((module)=>({default:module.WorkforceLivePage})));
const AccountHealthPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.AccountHealthPage})));
const AccountingWorkspacePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.AccountingWorkspacePage})));
const ActionCenterPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.ActionCenterPage})));
const AuditWorkspacePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.AuditWorkspacePage})));
const DataExchangePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.DataExchangePage})));
const EmployeeDirectoryPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.EmployeeDirectoryPage})));
const InventoryLedgerPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.InventoryLedgerPage})));
const NewHirePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.NewHirePage})));
const OnboardingQueuePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.OnboardingQueuePage})));
const OrderCashPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.OrderCashPage})));
const PerformanceWorkspacePage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.PerformanceWorkspacePage})));
const ReportingCenterPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.ReportingCenterPage})));
const TrainingSetupPage=lazy(()=>import("./pages/focused-workspace-pages").then((module)=>({default:module.TrainingSetupPage})));

type NavItem = { key: PageKey; label: string; icon: typeof LayoutDashboard };
type SectionTab = { key: PageKey; label: string };

const primaryNav: NavItem[] = [
  { key: "home", label: "Home", icon: LayoutDashboard }, { key: "work", label: "My work", icon: CheckSquare2 },
  { key: "accounts", label: "CRM & sales", icon: Building2 }, { key: "dispatch", label: "Dispatch board", icon: CalendarDays },
  { key: "orders", label: "Orders & billing", icon: ShoppingCart },
  { key: "inventory", label: "Inventory & fulfillment", icon: Boxes }, { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "brandAmbassadors", label: "Brand Ambassadors", icon: PartyPopper },
  { key: "timekeeping", label: "Clock In / Timekeeping", icon: CalendarDays },

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
  accounts: [{key:"accounts",label:"Accounts"},{key:"quickVisit",label:"Quick Visit"},{key:"salesMap",label:"Map"},{key:"accountSetup",label:"Account setup"}],
  orders: [{key:"orders",label:"Orders"},{key:"orderCash",label:"Invoices & payments"}],
  inventory: [{key:"inventory",label:"Fulfillment"},{key:"inventoryLedger",label:"Inventory ledger"},{key:"products",label:"Products"}],
  people: [{key:"people",label:"HR home"},{key:"materials",label:"Training & resources"},{key:"employees",label:"Employee directory"},{key:"newHire",label:"New hire"},{key:"onboarding",label:"Onboarding queue"},{key:"trainingAdmin",label:"Training setup"}],
  finance: [{key:"finance",label:"Finance"},{key:"accounting",label:"Accounting"}],
  reports: [{key:"reports",label:"Reports"},{key:"performance",label:"Performance"},{key:"reportingCenter",label:"Reporting center"},{key:"audit",label:"Audit trail"}],
  settings: [{key:"settings",label:"Administration"},{key:"workforceLive",label:"Workforce live"},{key:"dataExchange",label:"Data exchange"}],
};
const pageParent: Partial<Record<PageKey, PageKey>> = {
  actions:"work", quickVisit:"accounts", salesMap:"accounts", accountSetup:"accounts", accountHealth:"accounts", orderCash:"orders", inventoryLedger:"inventory", products:"inventory",
  materials:"people", employees:"people", newHire:"people", onboarding:"people", trainingAdmin:"people", accounting:"finance", performance:"reports",
  reportingCenter:"reports", audit:"reports", workforceLive:"settings", dataExchange:"settings",
};
const pageLabels: Partial<Record<PageKey,string>> = {
  actions:"Action center", quickVisit:"Quick Visit", salesMap:"Account map", accountSetup:"Account setup", accountHealth:"Account health", orderCash:"Invoices & payments", timekeeping:"Timekeeping", materials:"Training & resources", products:"Products",
  inventoryLedger:"Inventory ledger", employees:"Employee directory", newHire:"New hire", onboarding:"Onboarding queue", trainingAdmin:"Training setup",
  brandAmbassadors:"Brand Ambassadors",
  accounting:"Accounting", performance:"Performance", reportingCenter:"Reporting center", audit:"Audit trail", workforceLive:"Workforce live", dataExchange:"Data exchange",
};
const demoTourIds = new Set(["usr-flo", "usr-mia", "usr-avery", "usr-jordan", "usr-customer"]);
const labelFor = (item: NavItem, user: WorkspaceUser) => user.role === "Brand Ambassador" ? (item.key === "brandAmbassadors" ? "My schedule" : item.label) : user.role !== "Customer" ? item.label : item.key === "home" ? "Account overview" : item.key === "accounts" ? "My account" : item.key === "orders" ? "My orders" : item.label;

function NavButton({ item, user }: { item: NavItem; user: WorkspaceUser }) {
  const { navigate, scope } = useWorkspace(); const activePage=useNavigationPage(); const Icon = item.icon; const label = labelFor(item, user);
  // Navigation must remain cheap on phones. The full bonus ledger is calculated only inside Sales incentives.
  const pending = item.key === "work" ? scope.approvals.filter((entry) => entry.status === "Pending").length : 0;
  const selected = activePage === item.key || pageParent[activePage] === item.key;
  return <button className={`nav-item ${selected ? "is-active" : ""}`} onClick={() => navigate(item.key)} aria-current={selected ? "page" : undefined} title={label}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{pending > 0 && <i className="nav-count">{pending}</i>}</button>;
}

function SectionSubnav(){
  const {currentUser,navigate}=useWorkspace(); const activePage=useNavigationPage();
  if(!currentUser)return null;
  const root=pageParent[activePage]??activePage;
  const tabs=(sectionTabs[root]??[]).filter((tab)=>canAccessPage(currentUser,tab.key));
  if(tabs.length<2)return null;
  return <nav className="section-subnav" aria-label="Section navigation">{tabs.map((tab)=><button key={tab.key} className={activePage===tab.key?"is-active":""} onClick={()=>navigate(tab.key)}>{tab.label}</button>)}</nav>;
}

function PageView() {
  const activePage=useNavigationPage();
  useEffect(()=>traceNavigationCommit(activePage),[activePage]);
  switch (activePage) {
    case "home": return <DashboardPage/>;
    case "work": return <WorkPage/>;
    case "actions": return <ActionCenterPage/>;
    case "accounts": return <AccountsPage/>;
    case "quickVisit": return <QuickVisitPage/>;
    case "salesMap": return <SalesMapPage/>;
    case "accountSetup": return <AccountSetupPage/>;
    case "accountHealth": return <AccountHealthPage/>;
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
    case "workforceLive": return <WorkforceLivePage/>;
    case "dataExchange": return <DataExchangePage/>;
    case "help": return <HelpPage/>;
    default: return <DashboardPage/>;
  }
}

export function AppShell() {
  const { data, scope, currentUser, sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed, navigate, logout, switchUser, markNotificationsRead } = useWorkspace();
  const activePage=useNavigationPage();
  const runtime = useRuntimeMode(); const generated = useNotifications(); const firebase = useFirebaseSessionOptional();
  const [searchOpen, setSearchOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [userOpen, setUserOpen] = useState(false); 
  const [emailOpen,setEmailOpen]=useState(false); const [newEmail,setNewEmail]=useState(""); const [currentPassword,setCurrentPassword]=useState(""); const [emailError,setEmailError]=useState(""); const [emailMessage,setEmailMessage]=useState(""); const [emailBusy,setEmailBusy]=useState(false);
  const [passwordOpen,setPasswordOpen]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [passwordError,setPasswordError]=useState(""); const [passwordBusy,setPasswordBusy]=useState(false);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setUserOpen(false); } }; addEventListener("keydown", listener); return () => removeEventListener("keydown", listener); }, []);
  if (!currentUser) return null;

  const allowedPrimary = primaryNav.map((item): NavItem => item.key === "people" && !canAccessPage(currentUser, "people") && canAccessPage(currentUser, "materials") ? { ...item, key: "materials", label: "HR / Training" } : item).filter((item) => canAccessPage(currentUser, item.key)); const allowedSecondary = secondaryNav.filter((item) => canAccessPage(currentUser, item.key));
  const switchableUsers = runtime.isDemo ? data.users.filter((user) => demoTourIds.has(user.id)) : [];
  const unread = generated.unreadCount;
  const allNav = [...primaryNav, ...secondaryNav]; const rootPage=pageParent[activePage]??activePage; const activeNav = allNav.find((item) => item.key === rootPage); const pageName = pageLabels[activePage] ?? (activeNav ? labelFor(activeNav, currentUser) : "Home"); const customerMode = currentUser.role === "Customer";
  const openNotification=(notification:(typeof generated.currentUserItems)[number])=>{generated.markRead(notification.id);if(notification.targetRecordId)sessionStorage.setItem("momentum-focus-record",notification.targetRecordId);const target=notification.targetPage;if(target&&canAccessPage(currentUser,target))navigate(target);else if(canAccessPage(currentUser,"work"))navigate("work");else navigate("home");setNotificationsOpen(false);};
  const markAll = () => { markNotificationsRead(); generated.markAllRead(); };
  const changeEmail=async(event:FormEvent)=>{event.preventDefault();setEmailError("");setEmailMessage("");if(!firebase){setEmailError("Firebase Authentication is not connected.");return;}const normalized=newEmail.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)){setEmailError("Enter a valid e-mail address.");return;}if(normalized===currentUser.email.toLowerCase()){setEmailError("That is already your sign-in e-mail.");return;}if(!currentPassword){setEmailError("Enter your current password.");return;}setEmailBusy(true);const result=await firebase.changeOwnEmail(newEmail,currentPassword);setEmailBusy(false);if(!result.ok){setEmailError(result.message??"E-mail change failed.");return;}setEmailMessage(result.message??"Sign-in e-mail updated.");setCurrentPassword("");setNewEmail(normalized);};
  const changePassword=async(event:FormEvent)=>{event.preventDefault();setPasswordError("");if(!firebase){setPasswordError("Firebase Authentication is not connected.");return;}if(newPassword.length<10||!/[a-z]/.test(newPassword)||!/[A-Z]/.test(newPassword)||!/\d/.test(newPassword)){setPasswordError("Use at least 10 characters with upper-case, lower-case, and a digit.");return;}if(newPassword!==confirmPassword){setPasswordError("The two passwords do not match.");return;}setPasswordBusy(true);const result=await firebase.changePassword(newPassword);setPasswordBusy(false);if(!result.ok){setPasswordError(result.message??"Password change failed.");return;}setPasswordOpen(false);setNewPassword("");setConfirmPassword("");};

  return <div className={`app-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}><aside className={`sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}><div className="sidebar__top"><BrandMark onDark/><button className="sidebar__collapse" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div><button className="sidebar-search" onClick={() => setSearchOpen(true)} title="Search records"><Search size={17}/><span>Search records</span><kbd>⌘ K</kbd></button><nav className="sidebar__nav" aria-label="Primary navigation"><p>Operate</p>{allowedPrimary.map((item) => <NavButton key={item.key} item={item} user={currentUser}/>)}{allowedSecondary.length > 0 && <p>Reference</p>}{allowedSecondary.map((item) => <NavButton key={item.key} item={item} user={currentUser}/>)}</nav></aside>{sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"/>}<div className="app-main"><header className="topbar"><div className="topbar__left"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={21}/></button><nav className="topbar__location" aria-label="Breadcrumb"><button className="breadcrumb-home" onClick={() => navigate("home")} disabled={activePage === "home"}>Momentum</button><ChevronRight size={14}/><strong>{pageName}</strong></nav></div><div className="topbar__actions">{firebase&&<SyncStatusPill/>}<button className="topbar-search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={19}/></button>{!customerMode && <div className="popover-wrap"><button className="icon-button topbar__notification" onClick={() => { setNotificationsOpen((open) => !open); setUserOpen(false); }} aria-label={`${unread} unread notifications`}><Bell size={19}/>{unread > 0 && <i>{unread}</i>}</button>{notificationsOpen && <div className="popover notification-popover"><header><div><strong>Notifications</strong><small>{unread} unread</small></div><button onClick={markAll}>Mark all read</button></header><div className="notification-list">{generated.currentUserItems.slice(0, 12).map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.status === "Unread" ? "is-unread" : ""}`} onClick={()=>openNotification(notification)}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · {notification.actionLabel??"Open action"}</small></div><ChevronRight size={16}/></button>)}{generated.currentUserItems.length === 0 && <div className="popover-empty">No action notifications. Routine movement stays in Audit.</div>}</div></div>}</div>}<div className="popover-wrap"><button className="user-button" onClick={() => { setUserOpen((open) => !open); setNotificationsOpen(false); }}><Avatar initials={currentUser.initials} color={currentUser.accent} size="sm"/><span><strong>{currentUser.firstName}</strong><small>{currentUser.role}</small></span><ChevronDown size={14}/></button>{userOpen && <div className="popover user-popover"><div className="user-popover__current"><Avatar initials={currentUser.initials} color={currentUser.accent}/><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div>{runtime.isDemo&&<><p>Switch demo role</p>{switchableUsers.map((user) => <button key={user.id} className={user.id === currentUser.id ? "is-current" : ""} onClick={() => { switchUser(user.id); setUserOpen(false); }}><Avatar initials={user.initials} color={user.accent} size="sm"/><span><strong>{user.name}</strong><small>{user.title}</small></span></button>)}</>}{firebase&&<button onClick={()=>{setUserOpen(false);setEmailOpen(true);setNewEmail(currentUser.email);setCurrentPassword("");setEmailError("");setEmailMessage("")}}><Mail size={16}/><span><strong>Change email</strong><small>Update your own sign-in email</small></span></button>}{firebase&&<button onClick={()=>{setUserOpen(false);setPasswordOpen(true)}}><KeyRound size={16}/><span><strong>Change password</strong><small>Update your own sign-in password</small></span></button>}<button className="user-popover__logout" onClick={logout}><LogOut size={16}/><span>Sign out</span></button></div>}</div></div></header><div className="page-container"><SectionSubnav/><Suspense fallback={<div className="page" role="status" aria-live="polite">Opening section…</div>}><PageView/></Suspense></div></div><DeviceNavigation items={[...allowedPrimary,...allowedSecondary]} currentUser={currentUser} rootPage={rootPage} pageParent={pageParent}/>{searchOpen&&<GlobalSearchModal onClose={()=>setSearchOpen(false)}/>}<Modal open={emailOpen} title="Change email" description="Update your own sign-in email. Your username stays the same." onClose={()=>{setEmailOpen(false);setEmailError("");setEmailMessage("");setCurrentPassword("")}} footer={<><Button variant="ghost" onClick={()=>setEmailOpen(false)}>Close</Button><Button type="submit" form="self-email-form" disabled={emailBusy}>Save email</Button></>}><form id="self-email-form" className="access-gate-form" onSubmit={changeEmail}><label><span>Current sign-in email</span><input type="email" value={currentUser.email} readOnly/></label><label><span>New email</span><input type="email" required autoComplete="email" value={newEmail} onChange={(event)=>setNewEmail(event.target.value)}/></label><label><span>Current password</span><input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)}/></label>{emailError&&<p className="form-error" role="alert">{emailError}</p>}{emailMessage&&<p className="form-notice" role="status">{emailMessage}</p>}</form></Modal><Modal open={passwordOpen} title="Change password" description="Update your own Firebase Authentication password. Momentum never stores it." onClose={()=>{setPasswordOpen(false);setPasswordError("")}} footer={<><Button variant="ghost" onClick={()=>setPasswordOpen(false)}>Cancel</Button><Button type="submit" form="self-password-form" disabled={passwordBusy}>Save new password</Button></>}><form id="self-password-form" className="access-gate-form" onSubmit={changePassword}><label><span>New password</span><input type="password" required autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)}/></label><label><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)}/></label>{passwordError&&<p className="form-error" role="alert">{passwordError}</p>}</form></Modal></div>;
}
