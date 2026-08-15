"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { accountIsVisible, canAccessPage, canAdvanceFulfillment, canCreateAccount, canCreateOrder, canCreateScheduleItem, canManageSchedule, canPublishBulletinTo, canReviewApproval, getWorkspaceScope } from "./access";
import { createDemoData } from "./demo-data";
import type { Account, Appointment, AppointmentOutcome, AppointmentStatus, Bulletin, OrderStatus, PageKey, Team, WorkspaceData, WorkspaceUser } from "./types";

const DATA_KEY = "momentum-demo-workspace-v2";
const SESSION_KEY = "momentum-demo-session-v2";
const SIDEBAR_KEY = "momentum-sidebar-collapsed-v1";
const nowStamp = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const plusHours = (hours: number) => { const date = new Date(); date.setHours(date.getHours() + hours); return date.toISOString(); };
const localTime = () => new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

type NewAccount = Pick<Account, "name"|"location"|"channel"|"contactName"|"contactRole"|"phone"|"email">;
type NewOrder = { accountId: string; cases: number; pricePerCase?: number };
type NewAppointment = Pick<Appointment, "accountId"|"date"|"startTime"|"duration"|"type"|"objective"> & { ownerId?: string };
type AppointmentCloseout = { outcome: AppointmentOutcome; closeoutNote: string; nextAction: string; nextActionDate: string };
type NewBulletin = { title: string; body: string; audience: Bulletin["audience"]; team?: Team; priority: Bulletin["priority"]; expiresAt?: string };
type Scope = ReturnType<typeof getWorkspaceScope>;

type WorkspaceContextValue = {
  data: WorkspaceData; scope: Scope; currentUser: WorkspaceUser | null; ready: boolean; activePage: PageKey;
  sidebarOpen: boolean; sidebarCollapsed: boolean; setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void; navigate: (page: PageKey) => void;
  login: (email: string, password: string) => { ok: boolean; message?: string }; logout: () => void;
  switchUser: (userId: string) => void; createAccount: (account: NewAccount) => string | null;
  createAppointment: (appointment: NewAppointment) => string | null; advanceAppointment: (id: string) => void;
  completeAppointment: (id: string, closeout: AppointmentCloseout) => boolean; reassignAppointment: (id: string, ownerId: string) => void;
  setOrderStatus: (id: string, status: OrderStatus) => void; createOrder: (order: NewOrder) => string | null;
  updatePlacement: (id: string, stock: number, facings: number, cold: boolean, shelfPrice: number) => void;
  decideApproval: (id: string, decision: "Approved"|"Returned") => void;
  resolveInventoryHold: (id: string, decision: "Release"|"Retain", reason: string) => boolean;
  toggleClock: () => void; submitTimecard: (id: string) => void;
  decideTimecard: (id: string, decision: "Manager approved"|"Returned") => void;
  createBulletin: (bulletin: NewBulletin) => boolean; acknowledgeBulletin: (id: string) => void;
  markNotificationsRead: () => void; resetDemo: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const nextAppointment: Record<AppointmentStatus, AppointmentStatus> = { Scheduled: "Dispatched", Dispatched: "En route", "En route": "Arrived", Arrived: "Arrived", Completed: "Completed", "Needs follow-up": "Needs follow-up" };
const nextOrder: Partial<Record<OrderStatus, OrderStatus>> = { Approved: "Allocated", Allocated: "Out for delivery", "Out for delivery": "Delivered", Delivered: "Paid" };

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(() => createDemoData());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedData = localStorage.getItem(DATA_KEY);
        if (savedData) setData(JSON.parse(savedData) as WorkspaceData);
        setCurrentUserId(localStorage.getItem(SESSION_KEY));
        setSidebarCollapsedState(localStorage.getItem(SIDEBAR_KEY) === "true");
      } catch { localStorage.removeItem(DATA_KEY); localStorage.removeItem(SESSION_KEY); }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(DATA_KEY, JSON.stringify(data)); }, [data, ready]);

  const currentUser = useMemo(() => data.users.find(user => user.id === currentUserId) ?? null, [currentUserId, data.users]);
  const scope = useMemo(() => getWorkspaceScope(data, currentUser), [data, currentUser]);
  const setSidebarCollapsed = useCallback((collapsed: boolean) => { setSidebarCollapsedState(collapsed); localStorage.setItem(SIDEBAR_KEY, String(collapsed)); }, []);
  const navigate = useCallback((page: PageKey) => { setActivePage(canAccessPage(currentUser, page) ? page : "home"); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, [currentUser]);

  const login = useCallback((email: string, password: string) => {
    const user = data.users.find(item => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password !== "admin") return { ok: false, message: "Use a demo email and the password admin." };
    setCurrentUserId(user.id); setActivePage("home"); localStorage.setItem(SESSION_KEY, user.id); return { ok: true };
  }, [data.users]);
  const logout = useCallback(() => { setCurrentUserId(null); setActivePage("home"); localStorage.removeItem(SESSION_KEY); }, []);
  const switchUser = useCallback((id: string) => { if (!data.users.some(user => user.id === id)) return; setCurrentUserId(id); setActivePage("home"); localStorage.setItem(SESSION_KEY, id); }, [data.users]);

  const createAccount = useCallback((account: NewAccount) => {
    if (!currentUser || !canCreateAccount(currentUser)) return null;
    const id = `acc-${Date.now()}`;
    setData(current => ({ ...current,
      accounts: [{ ...account, id, stage: "Prospect", ownerId: currentUser.id, lastActivity: "Account created", nextAction: "Qualify the decision-maker and buying process", nextActionDate: todayKey(), health: "New", lifetimeCases: 0, reorderCount: 0, notes: "Created in the local demo workspace." }, ...current.accounts],
      activities: [{ id: `act-${Date.now()}`, accountId: id, type: "note", title: "Account created", detail: "New prospect added to the demo workspace.", at: nowStamp(), userId: currentUser.id }, ...current.activities]
    }));
    return id;
  }, [currentUser]);

  const createAppointment = useCallback((appointment: NewAppointment) => {
    if (!currentUser || !canCreateScheduleItem(currentUser)) return null;
    const account = data.accounts.find(item => item.id === appointment.accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const ownerId = currentUser.role === "Sales Representative" ? currentUser.id : appointment.ownerId ?? currentUser.id;
    const owner = data.users.find(user => user.id === ownerId && user.role !== "Customer");
    if (!owner) return null;
    const id = `apt-${Date.now()}`;
    setData(current => ({ ...current,
      appointments: [{ ...appointment, id, ownerId, status: "Scheduled", location: account.location }, ...current.appointments],
      activities: [{ id: `act-${Date.now()}`, accountId: account.id, type: "visit", title: `${appointment.type} scheduled`, detail: `${appointment.date} at ${appointment.startTime} · assigned to ${owner.name}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities]
    }));
    return id;
  }, [currentUser, data]);

  const advanceAppointment = useCallback((id: string) => {
    if (!currentUser) return;
    setData(current => {
      const appointment = current.appointments.find(item => item.id === id);
      if (!appointment || (appointment.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return current;
      const status = nextAppointment[appointment.status];
      if (status === appointment.status) return current;
      const account = current.accounts.find(item => item.id === appointment.accountId);
      return { ...current,
        appointments: current.appointments.map(item => item.id === id ? { ...item, status } : item),
        activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "visit", title: `${appointment.type} · ${status}`, detail: `${account?.name ?? "Account"} moved to ${status.toLowerCase()}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities]
      };
    });
  }, [currentUser]);

  const completeAppointment = useCallback((id: string, closeout: AppointmentCloseout) => {
    if (!currentUser || !closeout.closeoutNote.trim() || !closeout.nextAction.trim() || !closeout.nextActionDate) return false;
    const appointment = data.appointments.find(item => item.id === id);
    if (!appointment || appointment.status !== "Arrived" || (appointment.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return false;
    setData(current => ({ ...current,
      appointments: current.appointments.map(item => item.id === id ? { ...item, status: "Completed", completedAt: nowStamp(), ...closeout, closeoutNote: closeout.closeoutNote.trim(), nextAction: closeout.nextAction.trim() } : item),
      accounts: current.accounts.map(account => account.id === appointment.accountId ? { ...account, lastActivity: `${appointment.type}: ${closeout.outcome}`, nextAction: closeout.nextAction.trim(), nextActionDate: closeout.nextActionDate, stage: closeout.outcome === "Order placed" ? "Opening order" : account.stage } : account),
      activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "visit", title: `${appointment.type} completed · ${closeout.outcome}`, detail: `${closeout.closeoutNote.trim()} Next: ${closeout.nextAction.trim()} on ${closeout.nextActionDate}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities]
    }));
    return true;
  }, [currentUser, data.appointments]);

  const reassignAppointment = useCallback((id: string, ownerId: string) => {
    if (!currentUser || !canManageSchedule(currentUser)) return;
    setData(current => {
      const appointment = current.appointments.find(item => item.id === id);
      const owner = current.users.find(user => user.id === ownerId && user.role !== "Customer");
      if (!appointment || !owner) return current;
      return { ...current,
        appointments: current.appointments.map(item => item.id === id ? { ...item, ownerId } : item),
        activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "note", title: "Appointment reassigned", detail: `Ownership moved to ${owner.name}. Original history was preserved.`, at: nowStamp(), userId: currentUser.id }, ...current.activities]
      };
    });
  }, [currentUser]);

  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {
    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;
    setData(current => {
      const order = current.orders.find(item => item.id === id);
      if (!order || nextOrder[order.status] !== status) return current;
      return { ...current, orders: current.orders.map(item => item.id === id ? { ...item, status, paymentStatus: status === "Paid" ? "Paid" : status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };
    });
  }, [currentUser]);

  const createOrder = useCallback(({ accountId, cases, pricePerCase }: NewOrder) => {
    if (!currentUser || !canCreateOrder(currentUser) || cases < 1) return null;
    const account = data.accounts.find(item => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const prior = data.orders.find(order => order.accountId === accountId && ["Delivered","Paid"].includes(order.status) && order.pricePerCase > 0);
    const customer = currentUser.role === "Customer";
    const price = customer ? prior?.pricePerCase : pricePerCase;
    if (!price || price <= 0) return null;
    const id = `ord-${Date.now()}`; const number = `GE-${data.orders.length + 1050}`;
    const reviewers = data.users.filter(user => user.role === "Administrator" || user.id === currentUser.managerId).map(user => user.id);
    setData(current => ({ ...current,
      orders: [{ id, number, accountId, cases, pricePerCase: price, amount: cases * price, status: "Awaiting approval", placedAt: todayKey(), ownerId: currentUser.id, priceBasis: customer ? "Prior demo order snapshot" : "Demo entered price", paymentStatus: "Not invoiced" }, ...current.orders],
      accounts: current.accounts.map(item => item.id === accountId ? { ...item, stage: "Opening order", lastActivity: `Order request ${number} submitted` } : item),
      approvals: [{ id: `apr-${Date.now()}`, type: "Order", title: `Review order ${number}`, detail: `${cases} cases · ${customer ? "prior order snapshot" : "demo-entered price"} · ${account.name}`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "High", status: "Pending" }, ...current.approvals],
      notifications: [{ id: `note-${Date.now()}`, title: `Order ${number} needs review`, detail: `${account.name} · ${cases} cases`, at: nowStamp(), readBy: [], tone: "info", audienceUserIds: reviewers }, ...current.notifications]
    }));
    return id;
  }, [currentUser, data]);

  const updatePlacement = useCallback((id: string, observedStock: number, facings: number, cold: boolean, shelfPrice: number) => {
    if (!currentUser || !["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)) return;
    const placement = data.placements.find(item => item.id === id);
    const account = data.accounts.find(item => item.id === placement?.accountId);
    if (!placement || !account || !accountIsVisible(data, currentUser, account)) return;
    setData(current => ({ ...current, placements: current.placements.map(item => item.id === id ? { ...item, observedStock, facings, cold, shelfPrice, lastChecked: todayKey(), status: observedStock === 0 ? "Out of stock" : facings === 0 || !cold ? "Check soon" : "Healthy" } : item) }));
  }, [currentUser, data]);

  const decideApproval = useCallback((id: string, decision: "Approved"|"Returned") => {
    if (!currentUser) return;
    setData(current => {
      const approval = current.approvals.find(item => item.id === id);
      if (!approval || approval.status !== "Pending" || !canReviewApproval(current, currentUser, approval)) return current;
      return { ...current,
        approvals: current.approvals.map(item => item.id === id ? { ...item, status: decision } : item),
        orders: current.orders.map(order => approval.type === "Order" && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
        notifications: [{ id: `note-${Date.now()}`, title: `${approval.type} ${decision.toLowerCase()}`, detail: approval.title, at: nowStamp(), readBy: [], tone: decision === "Approved" ? "success" : "warning", audienceUserIds: approval.requesterId ? [approval.requesterId] : undefined }, ...current.notifications]
      };
    });
  }, [currentUser]);

  const resolveInventoryHold = useCallback((id: string, decision: "Release"|"Retain", reason: string) => {
    if (!currentUser || !["Administrator","Operations"].includes(currentUser.role) || reason.trim().length < 8) return false;
    const lot = data.inventory.find(item => item.id === id);
    if (!lot || lot.status !== "Quality hold") return false;
    setData(current => ({ ...current,
      inventory: current.inventory.map(item => item.id === id ? { ...item, status: decision === "Release" ? "Available" : "Quality hold", available: decision === "Release" ? item.onHand - item.reserved : 0, holdDecision: `${decision}: ${reason.trim()}`, holdResolvedAt: decision === "Release" ? nowStamp() : undefined, holdResolvedBy: currentUser.id } : item),
      notifications: [{ id: `note-${Date.now()}`, title: `${lot.lotCode} hold ${decision === "Release" ? "released" : "retained"}`, detail: reason.trim(), at: nowStamp(), readBy: [currentUser.id], tone: decision === "Release" ? "success" : "warning", audienceUserIds: current.users.filter(user => ["Administrator","Operations"].includes(user.role)).map(user => user.id) }, ...current.notifications]
    }));
    return true;
  }, [currentUser, data.inventory]);

  const toggleClock = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData(current => {
      const active = current.timeEntries.find(item => item.userId === currentUser.id && !item.clockOut);
      return active ? { ...current, timeEntries: current.timeEntries.map(item => item.id === active.id ? { ...item, clockOut: localTime() } : item) } :
        { ...current, timeEntries: [{ id: `te-${Date.now()}`, userId: currentUser.id, date: todayKey(), clockIn: localTime(), breakMinutes: 0, source: "Demo desktop" }, ...current.timeEntries] };
    });
  }, [currentUser]);

  const submitTimecard = useCallback((id: string) => {
    if (!currentUser) return;
    setData(current => {
      const card = current.timecards.find(item => item.id === id && item.userId === currentUser.id && item.status === "Open");
      if (!card) return current;
      const exists = current.approvals.some(item => item.type === "Timecard" && item.recordId === id && item.status === "Pending");
      return { ...current,
        timecards: current.timecards.map(item => item.id === id ? { ...item, status: "Submitted", submittedAt: nowStamp(), attested: true } : item),
        approvals: exists ? current.approvals : [{ id: `apr-${Date.now()}`, type: "Timecard", title: `${currentUser.name} · weekly timecard`, detail: `${card.weekStart} through ${card.weekEnd} · employee attested`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "Normal", status: "Pending" }, ...current.approvals]
      };
    });
  }, [currentUser]);

  const decideTimecard = useCallback((id: string, decision: "Manager approved"|"Returned") => {
    if (!currentUser) return;
    setData(current => {
      const card = current.timecards.find(item => item.id === id);
      const approval = current.approvals.find(item => item.type === "Timecard" && item.recordId === id && item.status === "Pending");
      if (!card || card.userId === currentUser.id || !approval || !canReviewApproval(current, currentUser, approval)) return current;
      return { ...current,
        timecards: current.timecards.map(item => item.id === id ? { ...item, status: decision, approvedAt: decision === "Manager approved" ? nowStamp() : undefined, approverId: currentUser.id } : item),
        approvals: current.approvals.map(item => item.id === approval.id ? { ...item, status: decision === "Manager approved" ? "Approved" : "Returned" } : item)
      };
    });
  }, [currentUser]);

  const createBulletin = useCallback((bulletin: NewBulletin) => {
    if (!currentUser || !bulletin.title.trim() || !bulletin.body.trim() || !canPublishBulletinTo(currentUser, bulletin.audience, bulletin.team)) return false;
    setData(current => ({ ...current, bulletins: [{ id: `blt-${Date.now()}`, ...bulletin, title: bulletin.title.trim(), body: bulletin.body.trim(), authorId: currentUser.id, publishedAt: nowStamp(), acknowledgedBy: [currentUser.id] }, ...current.bulletins] }));
    return true;
  }, [currentUser]);
  const acknowledgeBulletin = useCallback((id: string) => { if (!currentUser) return; setData(current => ({ ...current, bulletins: current.bulletins.map(item => item.id === id && !item.acknowledgedBy.includes(currentUser.id) ? { ...item, acknowledgedBy: [...item.acknowledgedBy, currentUser.id] } : item) })); }, [currentUser]);
  const markNotificationsRead = useCallback(() => { if (!currentUser) return; const ids = new Set(scope.notifications.map(item => item.id)); setData(current => ({ ...current, notifications: current.notifications.map(item => ids.has(item.id) && !item.readBy.includes(currentUser.id) ? { ...item, readBy: [...item.readBy, currentUser.id] } : item) })); }, [currentUser, scope.notifications]);
  const resetDemo = useCallback(() => { if (currentUser?.role !== "Administrator") return; setData(createDemoData()); setActivePage("home"); }, [currentUser]);

  const value = useMemo<WorkspaceContextValue>(() => ({ data, scope, currentUser, ready, activePage, sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed, navigate, login, logout, switchUser, createAccount, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, setOrderStatus, createOrder, updatePlacement, decideApproval, resolveInventoryHold, toggleClock, submitTimecard, decideTimecard, createBulletin, acknowledgeBulletin, markNotificationsRead, resetDemo }), [data, scope, currentUser, ready, activePage, sidebarOpen, sidebarCollapsed, setSidebarCollapsed, navigate, login, logout, switchUser, createAccount, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, setOrderStatus, createOrder, updatePlacement, decideApproval, resolveInventoryHold, toggleClock, submitTimecard, decideTimecard, createBulletin, acknowledgeBulletin, markNotificationsRead, resetDemo]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
