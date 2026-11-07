"use client";

import { Bell, ChevronDown, ChevronRight, KeyRound, LogOut, Mail, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { FormEvent, Suspense, lazy, useEffect, useRef, useState } from "react";
import { canAccessPage } from "../lib/access";
import { useFirebaseSessionOptional } from "../lib/firebase-session-context";
import {traceNavigationCommit} from "../lib/performance-diagnostics";
import { useNotifications } from "../lib/notification-context";
import { useRuntimeMode } from "../lib/runtime-mode";
import { useWorkspace } from "../lib/workspace-context";
import {startRouteNavigation, useNavigationPage, useNavigationReady, useNavigationRoute} from "../lib/navigation-store";
import {MENU_GROUPS, CUSTOMER_MENU, canVisitRoute, canShowModuleInMenu, requiresPrototypePage, routeLabel} from "../lib/navigation-route-registry";

import {activeMenuPath} from "../lib/navigation-route-contract";
import {SidebarRouteLink} from "./navigation/sidebar-route-link";
import { AccountsPage } from "./pages/accounts";

import { DashboardPage } from "./pages/dashboard";
import { DispatchPage } from "./pages/dispatch";




import { OrdersPage } from "./pages/orders";





import { SettingsPage } from "./pages/settings";
import { WorkPage } from "./pages/work";


import { SyncStatusPill } from "./settings/firebase-access-panel";
import { Avatar, BrandMark, Button, Modal, formatDate } from "./ui";

const GlobalSearchModal=lazy(()=>import("./global-search-modal").then((module)=>({default:module.GlobalSearchModal})));
const PrototypeOperationsHub=lazy(()=>import("./prototype/operations-hub").then(module=>({default:module.PrototypeOperationsHub})));

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

const demoTourIds = new Set(["usr-flo", "usr-mia", "usr-avery", "usr-jordan", "usr-customer"]);

function NavigationGroups(){
  const {currentUser,setSidebarOpen}=useWorkspace();
  const path=useNavigationRoute();
  const [expanded,setExpanded]=useState<Record<string,boolean>>({"Workspace":true,"Sales & CRM":true,"Commerce":true});
  const [collapsedActivePath,setCollapsedActivePath]=useState<string|null>(null);
  const visiblePaths=MENU_GROUPS.flatMap(group=>group.entries).filter(entry=>canShowModuleInMenu(currentUser,entry.path)).map(entry=>entry.path);
  const activePath=activeMenuPath(path,visiblePaths);
  const matching=MENU_GROUPS.find(group=>group.entries.some(entry=>entry.path===activePath));
  if(!currentUser)return null;
  if(currentUser.role==="Customer") return <nav className="sidebar__nav prototype-sidebar-nav" aria-label="Customer portal navigation">
    <div className="prototype-nav-group"><div className="prototype-nav-group-title">Customer Portal</div>
    <div className="prototype-nav-group-entries">{CUSTOMER_MENU.filter(entry=>canVisitRoute(currentUser,entry.path)).map(entry=>
    <SidebarRouteLink key={entry.path} path={entry.path} active={activeMenuPath(path,CUSTOMER_MENU.map(item=>item.path))===entry.path}
      className={"nav-item prototype-nav-item"+(activeMenuPath(path,CUSTOMER_MENU.map(item=>item.path))===entry.path?" is-active":"")} onNavigate={()=>setSidebarOpen(false)}>
      <span>{entry.label}</span>{entry.state==="planned"&&<small className="prototype-nav-planned">Planned</small>}
    </SidebarRouteLink>)}</div></div></nav>;
  return <nav className="sidebar__nav prototype-sidebar-nav" aria-label="Primary navigation">
    {MENU_GROUPS.map(group=>{
      const visible=group.entries.filter(entry=>canShowModuleInMenu(currentUser,entry.path));
      if(!visible.length)return null;
      const open=matching?.label===group.label ? collapsedActivePath!==path : expanded[group.label]===true;
      return <div className="prototype-nav-group" key={group.label}>
        <button type="button" className="prototype-nav-group-title" aria-expanded={open}
          onClick={()=>{
            if(matching?.label===group.label) {
              setCollapsedActivePath(current=>current===path?null:path);
            } else {
              setExpanded(current=>({...current,[group.label]:!current[group.label]}));
            }
          }}>
          <span>{group.label}</span>{open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
        </button>
        {open&&<div className="prototype-nav-group-entries">{visible.map(entry=>
          <SidebarRouteLink key={entry.path} path={entry.path} active={entry.path===activePath}
            className={"nav-item prototype-nav-item"+(entry.path===activePath?" is-active":"")}
            onNavigate={()=>setSidebarOpen(false)}>
            <span>{entry.label}</span>{entry.state==="planned"&&<small className="prototype-nav-planned">Planned</small>}
          </SidebarRouteLink>)}</div>}
      </div>;
    })}
  </nav>;
}

function PageView() {
  const activePage=useNavigationPage(); const route=useNavigationRoute(); const navigationReady=useNavigationReady();
  const {currentUser}=useWorkspace();
  useEffect(()=>{if(navigationReady)traceNavigationCommit(activePage);},[activePage,navigationReady]);
  if(!navigationReady)return <div className="page" role="status">Opening page…</div>;
  // Client shell gating complements, but never replaces, backend record and role permissions.
  if(!canVisitRoute(currentUser,route))return <div className="page" role="alert"><h1>Page unavailable</h1><p>This link is unavailable or your role does not have access.</p></div>;
  if(requiresPrototypePage(route))return <PrototypeOperationsHub/>;
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
  const activePage=useNavigationPage(); const activeRoute=useNavigationRoute();
  const runtime = useRuntimeMode(); const generated = useNotifications(); const firebase = useFirebaseSessionOptional();
  const [searchOpen, setSearchOpen] = useState(false); const [notificationsOpen, setNotificationsOpen] = useState(false); const [userOpen, setUserOpen] = useState(false);
  const sidebarRef=useRef<HTMLElement>(null);
  const menuTriggerRef=useRef<HTMLButtonElement>(null);
  const [emailOpen,setEmailOpen]=useState(false); const [newEmail,setNewEmail]=useState(""); const [currentPassword,setCurrentPassword]=useState(""); const [emailError,setEmailError]=useState(""); const [emailMessage,setEmailMessage]=useState(""); const [emailBusy,setEmailBusy]=useState(false);
  const [passwordOpen,setPasswordOpen]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [passwordError,setPasswordError]=useState(""); const [passwordBusy,setPasswordBusy]=useState(false);
  useEffect(()=>startRouteNavigation(),[]);
  useEffect(()=>{
    if(!currentUser)return;
    const label=canVisitRoute(currentUser,activeRoute)?routeLabel(activeRoute):"Page unavailable";
    document.title=label+" | Momentum Distribution";
  },[activeRoute,currentUser]);
  useEffect(()=>{
    if(!sidebarOpen||!window.matchMedia("(max-width:1023px)").matches)return;
    const drawer=sidebarRef.current;
    const trigger=menuTriggerRef.current;
    if(!drawer)return;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const buttons=()=>[...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
      .filter(item=>item.getClientRects().length>0);
    (drawer.querySelector<HTMLButtonElement>(".sidebar__close")??buttons()[0])?.focus();
    const keyHandler=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setSidebarOpen(false);return;}
      if(event.key!=="Tab")return;
      const candidates=buttons();
      if(!candidates.length)return;
      const first=candidates[0],last=candidates[candidates.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    const handleResize=()=>{if(window.innerWidth>=1024)setSidebarOpen(false);};
    document.addEventListener("keydown",keyHandler);
    window.addEventListener("resize",handleResize);
    return ()=>{
      document.body.style.overflow=oldOverflow;
      document.removeEventListener("keydown",keyHandler);
      window.removeEventListener("resize",handleResize);
      trigger?.focus();
    };
  },[sidebarOpen,setSidebarOpen]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } if (event.key === "Escape") { setSearchOpen(false); setNotificationsOpen(false); setUserOpen(false); } }; addEventListener("keydown", listener); return () => removeEventListener("keydown", listener); }, []);
  if (!currentUser) return null;

  const switchableUsers = runtime.isDemo ? data.users.filter((user) => demoTourIds.has(user.id)) : [];
  const unread = generated.unreadCount;
  const unreadItems = generated.currentUserItems.filter(item=>item.status==="Unread");
  const pageName = canVisitRoute(currentUser,activeRoute) ? routeLabel(activeRoute) : "Page unavailable"; const customerMode = currentUser.role === "Customer";
  const openNotification=(notification:(typeof generated.currentUserItems)[number])=>{generated.markRead(notification.id);if(notification.targetRecordId)sessionStorage.setItem("momentum-focus-record",notification.targetRecordId);const target=notification.targetPage;if(target&&canAccessPage(currentUser,target))navigate(target);else if(canAccessPage(currentUser,"work"))navigate("work");else navigate("home");setNotificationsOpen(false);};
  const markAll = () => { markNotificationsRead(); generated.markAllRead(); };
  const changeEmail=async(event:FormEvent)=>{event.preventDefault();setEmailError("");setEmailMessage("");if(!firebase){setEmailError("Firebase Authentication is not connected.");return;}const normalized=newEmail.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)){setEmailError("Enter a valid e-mail address.");return;}if(normalized===currentUser.email.toLowerCase()){setEmailError("That is already your sign-in e-mail.");return;}if(!currentPassword){setEmailError("Enter your current password.");return;}setEmailBusy(true);const result=await firebase.changeOwnEmail(newEmail,currentPassword);setEmailBusy(false);if(!result.ok){setEmailError(result.message??"E-mail change failed.");return;}setEmailMessage(result.message??"Sign-in e-mail updated.");setCurrentPassword("");setNewEmail(normalized);};
  const changePassword=async(event:FormEvent)=>{event.preventDefault();setPasswordError("");if(!firebase){setPasswordError("Firebase Authentication is not connected.");return;}if(newPassword.length<10||!/[a-z]/.test(newPassword)||!/[A-Z]/.test(newPassword)||!/\d/.test(newPassword)){setPasswordError("Use at least 10 characters with upper-case, lower-case, and a digit.");return;}if(newPassword!==confirmPassword){setPasswordError("The two passwords do not match.");return;}setPasswordBusy(true);const result=await firebase.changePassword(newPassword);setPasswordBusy(false);if(!result.ok){setPasswordError(result.message??"Password change failed.");return;}setPasswordOpen(false);setNewPassword("");setConfirmPassword("");};

  return <div className={`app-layout ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}><aside ref={sidebarRef} id="momentum-primary-sidebar" className={`sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}><div className="sidebar__top"><BrandMark onDark/><button className="sidebar__collapse" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div><button className="sidebar-search" onClick={() => setSearchOpen(true)} title="Search records"><Search size={17}/><span>Search records</span><kbd>⌘ K</kbd></button><NavigationGroups/></aside>{sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu"/>}<div className="app-main"><header className="topbar"><div className="topbar__left"><button ref={menuTriggerRef} className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="momentum-primary-sidebar"><Menu size={21}/></button><nav className="topbar__location" aria-label="Breadcrumb"><button className="breadcrumb-home" onClick={() => navigate("home")} disabled={activePage === "home"}>Momentum</button><ChevronRight size={14}/><strong>{pageName}</strong></nav></div><div className="topbar__actions">{firebase&&<SyncStatusPill/>}<button className="topbar-search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={19}/></button>{!customerMode && <div className="popover-wrap"><button className="icon-button topbar__notification" onClick={() => { setNotificationsOpen((open) => !open); setUserOpen(false); }} aria-label={`${unread} unread notifications`}><Bell size={19}/>{unread > 0 && <i>{unread}</i>}</button>{notificationsOpen && <div className="popover notification-popover"><header><div><strong>Notifications</strong><small>{unread} unread</small></div><button onClick={markAll}>Clear all</button></header><div className="notification-list">{unreadItems.slice(0, 12).map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.status === "Unread" ? "is-unread" : ""}`} onClick={()=>openNotification(notification)}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{`${notification.timestampSource==="first-seen"?"First seen ":""}${formatDate(notification.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`} · {notification.actionLabel??"Open action"}</small></div><ChevronRight size={16}/></button>)}{unreadItems.length === 0 && <div className="popover-empty">No action notifications. Routine movement stays in Audit.</div>}</div></div>}</div>}<div className="popover-wrap"><button className="user-button" onClick={() => { setUserOpen((open) => !open); setNotificationsOpen(false); }}><Avatar initials={currentUser.initials} color={currentUser.accent} size="sm"/><span><strong>{currentUser.firstName}</strong><small>{currentUser.role}</small></span><ChevronDown size={14}/></button>{userOpen && <div className="popover user-popover"><div className="user-popover__current"><Avatar initials={currentUser.initials} color={currentUser.accent}/><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div>{runtime.isDemo&&<><p>Switch demo role</p>{switchableUsers.map((user) => <button key={user.id} className={user.id === currentUser.id ? "is-current" : ""} onClick={() => { switchUser(user.id); setUserOpen(false); }}><Avatar initials={user.initials} color={user.accent} size="sm"/><span><strong>{user.name}</strong><small>{user.title}</small></span></button>)}</>}{firebase&&<button onClick={()=>{setUserOpen(false);setEmailOpen(true);setNewEmail(currentUser.email);setCurrentPassword("");setEmailError("");setEmailMessage("")}}><Mail size={16}/><span><strong>Change email</strong><small>Update your own sign-in email</small></span></button>}{firebase&&<button onClick={()=>{setUserOpen(false);setPasswordOpen(true)}}><KeyRound size={16}/><span><strong>Change password</strong><small>Update your own sign-in password</small></span></button>}<button className="user-popover__logout" onClick={logout}><LogOut size={16}/><span>Sign out</span></button></div>}</div></div></header><div className="page-container"><Suspense fallback={<div className="page" role="status" aria-live="polite">Opening section…</div>}><PageView/></Suspense></div></div>{searchOpen&&<Suspense fallback={<div role="status" className="command-empty">Opening search…</div>}><GlobalSearchModal onClose={()=>setSearchOpen(false)}/></Suspense>}<Modal open={emailOpen} title="Change email" description="Update your own sign-in email. Your username stays the same." onClose={()=>{setEmailOpen(false);setEmailError("");setEmailMessage("");setCurrentPassword("")}} footer={<><Button variant="ghost" onClick={()=>setEmailOpen(false)}>Close</Button><Button type="submit" form="self-email-form" disabled={emailBusy}>Save email</Button></>}><form id="self-email-form" className="access-gate-form" onSubmit={changeEmail}><label><span>Current sign-in email</span><input type="email" value={currentUser.email} readOnly/></label><label><span>New email</span><input type="email" required autoComplete="email" value={newEmail} onChange={(event)=>setNewEmail(event.target.value)}/></label><label><span>Current password</span><input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)}/></label>{emailError&&<p className="form-error" role="alert">{emailError}</p>}{emailMessage&&<p className="form-notice" role="status">{emailMessage}</p>}</form></Modal><Modal open={passwordOpen} title="Change password" description="Update your own Firebase Authentication password. Momentum never stores it." onClose={()=>{setPasswordOpen(false);setPasswordError("")}} footer={<><Button variant="ghost" onClick={()=>setPasswordOpen(false)}>Cancel</Button><Button type="submit" form="self-password-form" disabled={passwordBusy}>Save new password</Button></>}><form id="self-password-form" className="access-gate-form" onSubmit={changePassword}><label><span>New password</span><input type="password" required autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)}/></label><label><span>Confirm new password</span><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)}/></label>{passwordError&&<p className="form-error" role="alert">{passwordError}</p>}</form></Modal></div>;
}
