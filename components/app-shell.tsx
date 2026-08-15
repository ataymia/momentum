"use client";

import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingCart,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PageKey, Role } from "../lib/types";
import { useWorkspace } from "../lib/workspace-context";
import { AccountsPage } from "./pages/accounts";
import { DashboardPage } from "./pages/dashboard";
import { DispatchPage } from "./pages/dispatch";
import { InventoryPage } from "./pages/inventory";
import { OrdersPage } from "./pages/orders";
import { PeoplePage } from "./pages/people";
import { ReportsPage } from "./pages/reports";
import { RetailPage } from "./pages/retail";
import { SettingsPage } from "./pages/settings";
import { WorkPage } from "./pages/work";
import { Avatar, BrandMark, Modal, StatusPill, formatDate } from "./ui";

type NavItem = {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

const primaryNav: NavItem[] = [
  { key: "home", label: "Control tower", icon: LayoutDashboard },
  { key: "work", label: "My work", icon: CheckSquare2 },
  { key: "accounts", label: "Sales & accounts", icon: Building2, roles: ["Administrator", "Executive", "Sales Manager", "Sales Representative"] },
  { key: "dispatch", label: "Schedule & dispatch", icon: CalendarDays, roles: ["Administrator", "Executive", "Sales Manager", "Sales Representative", "Operations"] },
  { key: "retail", label: "Retail execution", icon: Store, roles: ["Administrator", "Executive", "Sales Manager", "Sales Representative"] },
  { key: "orders", label: "Orders", icon: ShoppingCart, roles: ["Administrator", "Executive", "Sales Manager", "Sales Representative", "Operations"] },
  { key: "inventory", label: "Supply & inventory", icon: Boxes, roles: ["Administrator", "Executive", "Sales Manager", "Operations"] },
  { key: "people", label: "People & time", icon: UsersRound },
];

const secondaryNav: NavItem[] = [
  { key: "reports", label: "Reports", icon: BarChart3 },
  {
    key: "settings",
    label: "Administration",
    icon: Settings,
    roles: ["Administrator", "Executive"],
  },
];

function NavButton({ item }: { item: NavItem }) {
  const { activePage, navigate, data } = useWorkspace();
  const Icon = item.icon;
  return (
    <button
      className={`nav-item ${activePage === item.key ? "is-active" : ""}`}
      onClick={() => navigate(item.key)}
      aria-current={activePage === item.key ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{item.label}</span>
      {item.key === "work" && data.approvals.filter((approval) => approval.status === "Pending").length > 0 && <i className="nav-count">{data.approvals.filter((approval) => approval.status === "Pending").length}</i>}
    </button>
  );
}

function PageView() {
  const { activePage } = useWorkspace();
  switch (activePage) {
    case "home":
      return <DashboardPage />;
    case "work":
      return <WorkPage />;
    case "accounts":
      return <AccountsPage />;
    case "dispatch":
      return <DispatchPage />;
    case "retail":
      return <RetailPage />;
    case "orders":
      return <OrdersPage />;
    case "inventory":
      return <InventoryPage />;
    case "people":
      return <PeoplePage />;
    case "reports":
      return <ReportsPage />;
    case "settings":
      return <SettingsPage />;
  }
}

export function AppShell() {
  const {
    data,
    currentUser,
    activePage,
    sidebarOpen,
    setSidebarOpen,
    navigate,
    logout,
    switchUser,
    markNotificationsRead,
  } = useWorkspace();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setUserOpen(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const unread = data.notifications.filter((item) => !item.read).length;
  const allowedSecondary = secondaryNav.filter(
    (item) => !item.roles || (currentUser && item.roles.includes(currentUser.role)),
  );
  const allowedPrimary = primaryNav.filter(
    (item) => !item.roles || (currentUser && item.roles.includes(currentUser.role)),
  );

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const accountResults = data.accounts
      .filter((account) =>
        [account.name, account.location, account.contactName, account.channel]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .slice(0, 5)
      .map((account) => ({
        id: account.id,
        type: "Account",
        title: account.name,
        detail: `${account.location} · ${account.stage}`,
        page: "accounts" as PageKey,
        focus: account.id,
      }));
    const orderResults = data.orders
      .filter((order) => order.number.toLowerCase().includes(normalized))
      .slice(0, 4)
      .map((order) => ({
        id: order.id,
        type: "Order",
        title: order.number,
        detail: `${order.cases} cases · ${order.status}`,
        page: "orders" as PageKey,
        focus: order.id,
      }));
    return [...accountResults, ...orderResults];
  }, [data.accounts, data.orders, query]);

  const openResult = (page: PageKey, focus: string) => {
    window.sessionStorage.setItem("momentum-focus-record", focus);
    navigate(page);
    setSearchOpen(false);
    setQuery("");
  };

  const pageName = [...primaryNav, ...secondaryNav].find((item) => item.key === activePage)?.label;

  if (!currentUser) return null;

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar__top">
          <BrandMark />
          <button className="sidebar__close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <button className="sidebar-search" onClick={() => setSearchOpen(true)}>
          <Search size={17} />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="sidebar__nav" aria-label="Primary navigation">
          <p>Operate</p>
          {allowedPrimary.map((item) => <NavButton key={item.key} item={item} />)}
          <p>Understand</p>
          {allowedSecondary.map((item) => <NavButton key={item.key} item={item} />)}
        </nav>

      </aside>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={21} />
            </button>
            <div className="topbar__location">
              <span>Momentum</span>
              <ChevronRight size={14} />
              <strong>{pageName}</strong>
            </div>
          </div>

          <div className="topbar__actions">
            <button className="topbar-search-mobile" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={19} />
            </button>
            <div className="popover-wrap">
              <button
                className="icon-button topbar__notification"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setUserOpen(false);
                }}
                aria-label={`${unread} unread notifications`}
              >
                <Bell size={19} />
                {unread > 0 && <i>{unread}</i>}
              </button>
              {notificationsOpen && (
                <div className="popover notification-popover">
                  <header>
                    <div>
                      <strong>Notifications</strong>
                      <small>{unread} unread</small>
                    </div>
                    <button onClick={markNotificationsRead}>Mark all read</button>
                  </header>
                  <div className="notification-list">
                    {data.notifications.slice(0, 6).map((notification) => (
                      <article key={notification.id} className={!notification.read ? "is-unread" : ""}>
                        <i className={`notification-dot notification-dot--${notification.tone}`} />
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.detail}</p>
                          <small>{formatDate(notification.at, { hour: "numeric", minute: "2-digit" })}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="popover-wrap">
              <button
                className="user-button"
                onClick={() => {
                  setUserOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                <Avatar initials={currentUser.initials} color={currentUser.accent} size="sm" />
                <span>
                  <strong>{currentUser.firstName}</strong>
                  <small>{currentUser.role}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {userOpen && (
                <div className="popover user-popover">
                  <div className="user-popover__current">
                    <Avatar initials={currentUser.initials} color={currentUser.accent} />
                    <div><strong>{currentUser.name}</strong><small>{currentUser.email}</small></div>
                  </div>
                  <p>Switch demo role</p>
                  {data.users.map((user) => (
                    <button
                      key={user.id}
                      className={user.id === currentUser.id ? "is-current" : ""}
                      onClick={() => {
                        switchUser(user.id);
                        setUserOpen(false);
                      }}
                    >
                      <Avatar initials={user.initials} color={user.accent} size="sm" />
                      <span><strong>{user.name}</strong><small>{user.role}</small></span>
                    </button>
                  ))}
                  <button className="user-popover__logout" onClick={logout}>
                    <LogOut size={16} /><span>Sign out of demo</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="demo-banner">
          <StatusPill tone="gold">Demo workspace</StatusPill>
          <span>Fictional records · proposed commercial terms · no live integrations</span>
          <button onClick={() => navigate("settings")}>Integration status</button>
        </div>

        <div className="page-container">
          <PageView />
        </div>
      </div>

      <Modal
        open={searchOpen}
        title="Search Momentum"
        description="Find a demo account, contact, order, or operational record."
        onClose={() => {
          setSearchOpen(false);
          setQuery("");
        }}
        wide
      >
        <div className="command-search">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Desert Lantern, GE-1047…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          {!query && (
            <div className="command-empty">
              <Command size={28} />
              <p>Start typing to search across the workspace.</p>
            </div>
          )}
          {query && searchResults.length === 0 && (
            <div className="command-empty"><p>No matching demo records.</p></div>
          )}
          {searchResults.map((result) => (
            <button key={result.id} onClick={() => openResult(result.page, result.focus)}>
              <span className="command-result__icon">
                {result.type === "Account" ? <Building2 size={18} /> : <ShoppingCart size={18} />}
              </span>
              <div><strong>{result.title}</strong><small>{result.detail}</small></div>
              <span>{result.type}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </Modal>

    </div>
  );
}
