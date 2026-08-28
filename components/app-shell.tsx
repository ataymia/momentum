"use client";

import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, Command, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canAccessPage } from "../lib/access";
import { evaluateSalesRepAccountBonuses } from "../lib/bonus-engine";
import type { PageKey, WorkspaceUser } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import { AccountingPanel } from "./accounting/accounting-panel";
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

type NavItem={key:PageKey;label:string;icon:typeof LayoutDashboard};
const primaryNav:NavItem[]=[
  {key:"home",label:"Home",icon:LayoutDashboard},{key:"work",label:"My work",icon:CheckSquare2},
  {key:"accounts",label:"CRM & sales",icon:Building2},{key:"dispatch",label:"Dispatch board",icon:CalendarDays},
  {key:"retail",label:"Retail execution",icon:Store},{key:"orders",label:"Orders & billing",icon:ShoppingCart},
  {key:"inventory",label:"Inventory & fulfillment",icon:Boxes},{key:"marketing",label:"Marketing",icon:Megaphone},
  {key:"people",label:"Human Resources",icon:UsersRound},{key:"payroll",label:"Payroll",icon:BadgeDollarSign},
  {key:"finance",label:"Finance & accounting",icon:CircleDollarSign},
];
const secondaryNav:NavItem[]=[{key:"reports",label:"Performance & reports",icon:BarChart3},{key:"settings",label:"Administration",icon:Settings}];
const labelFor=(item:NavItem,user:WorkspaceUser)=>user.role!=="Customer"?item.label:item.key==="home"?"Account overview":item.key==="accounts"?"My account":item.key==="orders"?"My orders":item.label;

function NavButton({item,user}:{item:NavItem;user:WorkspaceUser}){
  const {activePage,navigate,scope,data}=useWorkspace();const Icon=item.icon;const label=labelFor(item,user);
  const accountIds=new Set(scope.accounts.map((account)=>account.id));
  const earnedSignals=item.key==="accounts"?evaluateSalesRepAccountBonuses(data).filter((signal)=>signal.status==="Earned"&&accountIds.has(signal.accountId)).length:0;
  const pending=item.key==="work"?scope.approvals.filter((entry)=>entry.status==="Pending").length:earnedSignals;
  return <button className={`nav-item ${activePage===item.key?"is-active":""}`} onClick={()=>navigate(item.key)} aria-current={activePage===item.key?"page":undefined} title={label}><Icon size={18} strokeWidth={1.9}/><span>{label}</span>{pending>0&&<i className="nav-count">{pending}</i>}</button>;
}

function PageView(){
  const{activePage}=useWorkspace();
  switch(activePage){
    case"home":return <><DashboardPage/><DashboardPerformance/></>;
    case"work":return <WorkPage/>;
    case"accounts":return <><AccountsPage/><CrmDepthPanel/></>;
    case"dispatch":return <DispatchPage/>;
    case"retail":return <RetailPage/>;
    case"orders":return <><OrdersPage/><OrderCashPanel/></>;
    case"inventory":return <><InventoryPage/><InventoryLedgerPanel/></>;
    case"marketing":return <MarketingPage/>;
    case"people":return <><PeoplePage/><AdvancedHcmPanel/></>;
    case"payroll":return <PayrollPage/>;
    case"finance":return <><FinancePage/><AccountingPanel/></>;
    case"reports":return <><ReportsPage/><ReportingCenter/></>;
    case"settings":return <SettingsPage/>;
    default:return <DashboardPage/>;
  }
}

export function AppShell(){
  const {data,scope,currentUser,activePage,sidebarOpen,sidebarCollapsed,setSidebarOpen,setSidebarCollapsed,navigate,logout,switchUser,markNotificationsRead}=useWorkspace();
  const [searchOpen,setSearchOpen]=useState(false);const[notificationsOpen,setNotificationsOpen]=useState(false);const[userOpen,setUserOpen]=useState(false);const[query,setQuery]=useState("");
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSearchOpen(true);}if(event.key==="Escape"){setSearchOpen(false);setNotificationsOpen(false);setUserOpen(false);}};addEventListener("keydown",listener);return()=>removeEventListener("keydown",listener);},[]);
  const allowedPrimary=currentUser?primaryNav.filter((item)=>canAccessPage(currentUser,item.key)):[];const allowedSecondary=currentUser?secondaryNav.filter((item)=>canAccessPage(currentUser,item.key)):[];
  const unread=currentUser?.role==="Customer"?0:scope.notifications.filter((item)=>!item.readBy.includes(currentUser?.id??"")).length;
  const searchResults=useMemo(()=>{const normalized=query.trim().toLowerCase();if(!normalized)return[];const accounts=(currentUser&&canAccessPage(currentUser,"accounts")?scope.accounts:[]).filter((account)=>[account.name,account.locationName,account.location,account.contactName,account.channel].join(" ").toLowerCase().includes(normalized)).slice(0,5).map((account)=>({id:account.id,type:"Location",title:account.locationName??account.name,detail:`${account.location} · ${account.stage}`,page:"accounts" as PageKey,focus:account.id}));const orders=scope.orders.filter((order)=>{const account=scope.accounts.find((item)=>item.id===order.accountId);return`${order.number} ${account?.name??""} ${account?.locationName??""}`.toLowerCase().includes(normalized);}).slice(0,4).map((order)=>({id:order.id,type:"Order",title:order.number,detail:`${order.cases} cases · ${order.status}`,page:"orders" as PageKey,focus:order.id}));return[...accounts,...orders];},[currentUser,query,scope.accounts,scope.orders]);
  if(!currentUser)return null;
  const allNav=[...primaryNav,...secondaryNav];const activeNav=allNav.find((item)=>item.key===activePage);const pageName=activeNav?labelFor(activeNav,currentUser):"Home";const customerMode=currentUser.role==="Customer";
  const openResult=(page:PageKey,focus:string)=>{sessionStorage.setItem("momentum-focus-record",focus);navigate(page);setSearchOpen(false);setQuery("");};
  return <div className={`app-layout ${sidebarCollapsed?"is-sidebar-collapsed":""}`}><aside className={`sidebar ${sidebarOpen?"is-open":""} ${sidebarCollapsed?"is-collapsed":""}`}><div className="sidebar__top"><BrandMark/><button className="sidebar__collapse" onClick={()=>setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed?"Expand menu":"Collapse menu"} title={sidebarCollapsed?"Expand menu":"Collapse menu"}>{sidebarCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><button className="sidebar__close" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"><X size={20}/></button></div><button className="sidebar-search" onClick={()=>setSearchOpen(true)} title="Search records"><Search size={17}/><span>Search records</span><kbd>⌘ K</kbd></button><nav className="sidebar__nav" aria-label="Primary navigation"><p>Operate</p>{allowedPrimary.map((item)=><NavButton key={item.key} item={item} user={currentUser}/>)}{allowedSecondary.length>0&&<p>Understand</p>}{allowedSecondary.map((item)=><NavButton key={item.key} item={item} user={currentUser}/>)}</nav></aside>{sidebarOpen&&<button className="sidebar-scrim" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"/>}<div className="app-main"><header className="topbar"><div className="topbar__left"><button className="menu-button" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={21}/></button><nav className="topbar__location" aria-label="Breadcrumb"><button className="breadcrumb-home" onClick={()=>navigate("home")} disabled={activePage==="home"}>Momentum</button><ChevronRight size={14}/><strong>{pageName}</strong></nav></div><div className="topbar__actions"><button className="topbar-search-mobile" onClick={()=>setSearchOpen(true)} aria-label="Search"><Search size={19}/></button>{!customerMode&&<div className="popover-wrap"><button className="icon-button topbar__notification" onClick={()=>{setNotificationsOpen((open)=>!open);setUserOpen(false);}} aria-label={`${unread} unread notifications`}><Bell size={19}/>{unread>0&&<i>{unread}</i>}</button>{notificationsOpen&&<div className="popover notification-popover"><header><div><strong>Notifications</strong><small>{unread} unread</small></div><button onClick={markNotificationsRead}>Mark all read</button></header><div className="notification-list">{scope.notifications.slice(0,6).map((notification)=>{const unreadItem=!notification.readBy.includes(currentUser.id);return <article key={notification.id} className={unreadItem?"is-unread":""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.at,{hour:"numeric",minute:"2-digit"})}</small></div></article>;})}{scope.notifications.length===0&&<div className="popover-empty">No notifications.</div>}</div></div>}</div>}<div className="popover-wrap"><button className="user-button" onClick={()=>{setUserOpen((open)=>!open);setNotificationsOpen(false);}}><Avatar initials={currentUser.initials} color={currentUser.accent} size="sm"/><span><strong>{currentUser.firstName}</strong><small>{currentUser.role}</small></span><ChevronDown size={14}/></button>{userOpen&&<div className="popover user-popover"><div className="user-popover__current"><Avatar initials={currentUser.initials} color={currentUser.accent}/><div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div></div><p>Tour another demo role</p>{data.users.map((user)=><button key={user.id} className={user.id===currentUser.id?"is-current":""} onClick={()=>{switchUser(user.id);setUserOpen(false);}}><Avatar initials={user.initials} color={user.accent} size="sm"/><span><strong>{user.name}</strong><small>{user.role}</small></span></button>)}<button className="user-popover__logout" onClick={logout}><LogOut size={16}/><span>Sign out of demo</span></button></div>}</div></div></header><div className="demo-banner"><StatusPill tone="gold">Demo workspace</StatusPill><span>{customerMode?"Fictional customer account and order history · no live payments":"Fictional records · native workflow prototype · Firebase and payment rails not connected"}</span>{currentUser.role==="Administrator"&&<button onClick={()=>navigate("settings")}>Integration status</button>}</div><div className="page-container"><PageView/></div></div><Modal open={searchOpen} title="Search Momentum" description={customerMode?"Find your account, location, or order.":"Find a customer location or order within your assigned scope."} onClose={()=>{setSearchOpen(false);setQuery("");}} wide><div className="command-search"><Search size={20}/><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={customerMode?"Search location or order…":"Search customer, location, or order…"}/><kbd>ESC</kbd></div><div className="command-results">{!query&&<div className="command-empty"><Command size={28}/><p>Start typing to search records you can access.</p></div>}{query&&searchResults.length===0&&<div className="command-empty"><p>No matching records in your scope.</p></div>}{searchResults.map((result)=><button key={result.id} onClick={()=>openResult(result.page,result.focus)}><span className="command-result__icon">{result.type==="Location"?<Building2 size={18}/>:<ShoppingCart size={18}/>}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><span>{result.type}</span><ChevronRight size={16}/></button>)}</div></Modal></div>;
}
