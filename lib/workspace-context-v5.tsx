"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  accountIsVisible,
  canAccessPage,
  canAdvanceFulfillment,
  canCreateAccount,
  canCreateOrder,
  canCreateScheduleItem,
  canManageSchedule,
  canPublishBulletinTo,
  canReviewApproval,
  getWorkspaceScope,
} from "./access";
import { createDemoData } from "./demo-data";
import type {
  Account,
  Appointment,
  AppointmentOutcome,
  AppointmentStatus,
  Bulletin,
  CustomerAccount,
  OrderStatus,
  PageKey,
  Team,
  WorkspaceData,
  WorkspaceUser,
} from "./types";

const DATA_KEY = "momentum-demo-workspace-v5";
const SESSION_KEY = "momentum-demo-session-v2";
const SIDEBAR_KEY = "momentum-sidebar-collapsed-v1";
const nowStamp = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const plusHours = (hours: number) => { const date = new Date(); date.setHours(date.getHours() + hours); return date.toISOString(); };
const localTime = () => new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const minutesBetween = (start: string, end: string) => {
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  return Math.max(0, endHours * 60 + endMinutes - startHours * 60 - startMinutes);
};
const validTime = (value?: string) => !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minuteOfDay = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const parentCustomerName = (name: string) => name.replace(/\s+#\d+\s*$/, "").trim() || name;
const customerIdFor = (name: string) => `cust-${slug(parentCustomerName(name))}`;
const dateKeyFrom = (date: Date) => date.toISOString().slice(0, 10);

const previousWeekRange = () => {
  const current = new Date();
  const mondayDistance = (current.getDay() + 6) % 7;
  const start = new Date(current);
  start.setDate(current.getDate() - mondayDistance - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: dateKeyFrom(start),
    end: dateKeyFrom(end),
    day: (offset: number) => { const date = new Date(start); date.setDate(start.getDate() + offset); return dateKeyFrom(date); },
  };
};

const normalizeCustomerHierarchy = (data: WorkspaceData): WorkspaceData => {
  const customers = new Map((data.customers ?? []).map((customer) => [customer.id, customer]));
  const accounts = data.accounts.map((account) => {
    const customerId = account.customerId ?? customerIdFor(account.name);
    const customerName = parentCustomerName(account.name);
    if (!customers.has(customerId)) {
      customers.set(customerId, {
        id: customerId,
        name: customerName,
        accountType: customerName !== account.name ? "Chain / franchise" : "Independent",
        billingContactName: account.contactName,
        billingEmail: account.email,
        billingPhone: account.phone,
        createdAt: nowStamp(),
      });
    }
    return {
      ...account,
      customerId,
      locationName: account.locationName ?? account.name,
      originatorId: account.originatorId ?? account.ownerId,
      accountManagerId: account.accountManagerId ?? account.ownerId,
      responsibilityStartedAt: account.responsibilityStartedAt ?? nowStamp(),
    };
  });
  const customerByLocation = new Map(accounts.map((account) => [account.id, account.customerId]));
  return {
    ...data,
    customers: [...customers.values()],
    accounts,
    appointments: data.appointments.map((appointment) => ({
      ...appointment,
      customerId: appointment.customerId ?? customerByLocation.get(appointment.accountId),
      priority: appointment.priority ?? "Normal",
      tags: appointment.tags ?? [],
    })),
  };
};

const createNormalizedDemoData = (): WorkspaceData => {
  const data = normalizeCustomerHierarchy(createDemoData());
  const previousWeek = previousWeekRange();
  const jordanRows = [
    { id: "te-jordan-mon", userId: "usr-jordan", date: previousWeek.day(0), clockIn: "08:00", mealStart: "12:00", mealEnd: "12:30", clockOut: "17:00", breakMinutes: 30, source: "Demo mobile" as const },
    { id: "te-jordan-tue", userId: "usr-jordan", date: previousWeek.day(1), clockIn: "08:15", mealStart: "12:15", mealEnd: "12:45", clockOut: "16:45", breakMinutes: 30, source: "Demo mobile" as const },
    { id: "te-jordan-wed", userId: "usr-jordan", date: previousWeek.day(2), clockIn: "08:00", mealStart: "12:00", mealEnd: "12:30", clockOut: "16:30", breakMinutes: 30, source: "Manual correction" as const, note: "Clock-out correction retained as a separate source note for review." },
    { id: "te-jordan-thu", userId: "usr-jordan", date: previousWeek.day(3), clockIn: "08:30", mealStart: "12:30", mealEnd: "12:45", clockOut: "16:45", breakMinutes: 15, source: "Demo mobile" as const },
  ];
  return {
    ...data,
    users: data.users.map((user) => user.id === "usr-mia" ? { ...user, accent: "#e49e13" } : user.id === "usr-flo" ? { ...user, accent: "#0b2e92" } : user.id === "usr-avery" ? { ...user, accent: "#123fae" } : user.id === "usr-jordan" ? { ...user, accent: "#ee0607" } : user),
    timeEntries: [...jordanRows, ...data.timeEntries.filter((entry) => entry.userId !== "usr-jordan")],
    timecards: data.timecards.map((card) => card.id === "tc-jordan" ? { ...card, weekStart: previousWeek.start, weekEnd: previousWeek.end } : card),
    approvals: data.approvals.map((approval) => approval.id === "apr-2" ? { ...approval, detail: "32.50 recorded hours · four daily records · employee attested" } : approval),
    notifications: data.notifications.map((notification) => notification.id === "note-2" ? { ...notification, title: "Two approvals need review", detail: "Open each source record before deciding." } : notification),
  };
};

type NewAccount = Pick<Account, "name" | "location" | "channel" | "contactName" | "contactRole" | "phone" | "email"> & { customerName?: string; locationName?: string; streetAddress?: string };
type NewOrder = { accountId: string; cases: number; pricePerCase?: number };
type NewAppointment = Pick<Appointment, "accountId" | "date" | "startTime" | "duration" | "type" | "objective"> & { ownerId?: string; priority?: Appointment["priority"]; tags?: string[]; arrivalWindow?: string };
type AppointmentCloseout = { outcome: AppointmentOutcome; closeoutNote: string; nextAction: string; nextActionDate: string };
type NewBulletin = { title: string; body: string; audience: Bulletin["audience"]; team?: Team; priority: Bulletin["priority"]; expiresAt?: string };
type TimeEntryCorrectionInput = { clockIn: string; mealStart?: string; mealEnd?: string; clockOut?: string; breakMinutes: number };
type Scope = ReturnType<typeof getWorkspaceScope>;

type WorkspaceContextValue = {
  data: WorkspaceData;
  scope: Scope;
  currentUser: WorkspaceUser | null;
  ready: boolean;
  activePage: PageKey;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  navigate: (page: PageKey) => void;
  login: (email: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  switchUser: (userId: string) => void;
  createAccount: (account: NewAccount) => string | null;
  createAppointment: (appointment: NewAppointment) => string | null;
  advanceAppointment: (id: string) => void;
  completeAppointment: (id: string, closeout: AppointmentCloseout) => boolean;
  reassignAppointment: (id: string, ownerId: string) => void;
  moveAppointment: (id: string, ownerId: string | undefined, date: string, startTime: string) => boolean;
  setOrderStatus: (id: string, status: OrderStatus) => void;
  reconcileOrderPayment: (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => void;
  createOrder: (order: NewOrder) => string | null;
  updatePlacement: (id: string, stock: number, facings: number, cold: boolean, shelfPrice: number) => void;
  decideApproval: (id: string, decision: "Approved" | "Returned") => void;
  resolveInventoryHold: (id: string, decision: "Release" | "Retain", reason: string) => boolean;
  toggleClock: () => void;
  startMeal: () => void;
  endMeal: () => void;
  correctTimeEntry: (id: string, values: TimeEntryCorrectionInput, reason: string) => boolean;
  submitTimecard: (id: string) => void;
  decideTimecard: (id: string, decision: "Manager approved" | "Returned") => void;
  createBulletin: (bulletin: NewBulletin) => boolean;
  acknowledgeBulletin: (id: string) => void;
  markNotificationsRead: () => void;
  resetDemo: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const nextAppointment: Record<AppointmentStatus, AppointmentStatus> = { Scheduled: "Dispatched", Dispatched: "En route", "En route": "Arrived", Arrived: "Arrived", Completed: "Completed", "Needs follow-up": "Needs follow-up" };
const nextFulfillment: Partial<Record<OrderStatus, OrderStatus>> = { Approved: "Allocated", Allocated: "Out for delivery", "Out for delivery": "Delivered" };

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(() => createNormalizedDemoData());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(DATA_KEY);
        if (saved) setData(normalizeCustomerHierarchy(JSON.parse(saved) as WorkspaceData));
        setCurrentUserId(localStorage.getItem(SESSION_KEY));
        setSidebarCollapsedState(localStorage.getItem(SIDEBAR_KEY) === "true");
      } catch {
        localStorage.removeItem(DATA_KEY);
        localStorage.removeItem(SESSION_KEY);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }, [data, ready]);

  const currentUser = useMemo(() => data.users.find((user) => user.id === currentUserId) ?? null, [currentUserId, data.users]);
  const scope = useMemo(() => getWorkspaceScope(data, currentUser), [data, currentUser]);
  const setSidebarCollapsed = useCallback((collapsed: boolean) => { setSidebarCollapsedState(collapsed); localStorage.setItem(SIDEBAR_KEY, String(collapsed)); }, []);
  const navigate = useCallback((page: PageKey) => { setActivePage(canAccessPage(currentUser, page) ? page : "home"); setSidebarOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, [currentUser]);

  const login = useCallback((email: string, password: string) => {
    const user = data.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password !== "admin") return { ok: false, message: "Use a demo email and the password admin." };
    setCurrentUserId(user.id);
    setActivePage("home");
    localStorage.setItem(SESSION_KEY, user.id);
    return { ok: true };
  }, [data.users]);
  const logout = useCallback(() => { setCurrentUserId(null); setActivePage("home"); localStorage.removeItem(SESSION_KEY); }, []);
  const switchUser = useCallback((id: string) => { if (!data.users.some((user) => user.id === id)) return; setCurrentUserId(id); setActivePage("home"); localStorage.setItem(SESSION_KEY, id); }, [data.users]);

  const createAccount = useCallback((account: NewAccount) => {
    if (!currentUser || !canCreateAccount(currentUser)) return null;
    const id = `acc-${Date.now()}`;
    const customerName = account.customerName?.trim() || account.name.trim();
    const customerId = `cust-${slug(customerName)}`;
    const customer: CustomerAccount = { id: customerId, name: customerName, accountType: customerName === account.name ? "Independent" : "Chain / franchise", billingContactName: account.contactName, billingEmail: account.email, billingPhone: account.phone, createdAt: nowStamp() };
    setData((current) => ({
      ...current,
      customers: (current.customers ?? []).some((item) => item.id === customerId) ? current.customers : [customer, ...(current.customers ?? [])],
      accounts: [{ ...account, id, customerId, locationName: account.locationName?.trim() || account.name, streetAddress: account.streetAddress, stage: "Prospect", ownerId: currentUser.id, originatorId: currentUser.id, accountManagerId: currentUser.id, responsibilityStartedAt: nowStamp(), lastActivity: "Location created", nextAction: "Qualify the decision-maker and buying process", nextActionDate: todayKey(), health: "New", lifetimeCases: 0, reorderCount: 0, notes: "Created in the local demo workspace." }, ...current.accounts],
      activities: [{ id: `act-${Date.now()}`, accountId: id, type: "note", title: "Customer location created", detail: `${customerName} · ${account.locationName?.trim() || account.name} added.`, at: nowStamp(), userId: currentUser.id }, ...current.activities],
    }));
    return id;
  }, [currentUser]);

  const createAppointment = useCallback((appointment: NewAppointment) => {
    if (!currentUser || !canCreateScheduleItem(currentUser)) return null;
    const account = data.accounts.find((item) => item.id === appointment.accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const ownerId = currentUser.role === "Sales Representative" ? currentUser.id : appointment.ownerId || undefined;
    if (ownerId && !data.users.some((user) => user.id === ownerId && user.role !== "Customer")) return null;
    const owner = data.users.find((user) => user.id === ownerId);
    const id = `apt-${Date.now()}`;
    setData((current) => ({
      ...current,
      appointments: [{ ...appointment, id, ownerId, customerId: account.customerId, status: "Scheduled", location: account.streetAddress || account.location, priority: appointment.priority ?? "Normal", tags: appointment.tags ?? [], assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? nowStamp() : undefined }, ...current.appointments],
      activities: [{ id: `act-${Date.now()}`, accountId: account.id, type: "visit", title: `${appointment.type} scheduled`, detail: `${appointment.date} at ${appointment.startTime} · ${owner ? `assigned to ${owner.name}` : "left unassigned for dispatch"}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities],
    }));
    return id;
  }, [currentUser, data]);

  const advanceAppointment = useCallback((id: string) => {
    if (!currentUser) return;
    setData((current) => {
      const appointment = current.appointments.find((item) => item.id === id);
      if (!appointment?.ownerId || (appointment.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return current;
      const status = nextAppointment[appointment.status];
      if (status === appointment.status) return current;
      return { ...current, appointments: current.appointments.map((item) => item.id === id ? { ...item, status } : item), activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "visit", title: `${appointment.type} · ${status}`, detail: `Work moved to ${status.toLowerCase()}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities] };
    });
  }, [currentUser]);

  const completeAppointment = useCallback((id: string, closeout: AppointmentCloseout) => {
    if (!currentUser || !closeout.closeoutNote.trim() || !closeout.nextAction.trim() || !closeout.nextActionDate) return false;
    const appointment = data.appointments.find((item) => item.id === id);
    if (!appointment || appointment.status !== "Arrived" || (appointment.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return false;
    setData((current) => ({
      ...current,
      appointments: current.appointments.map((item) => item.id === id ? { ...item, status: "Completed", completedAt: nowStamp(), ...closeout, closeoutNote: closeout.closeoutNote.trim(), nextAction: closeout.nextAction.trim() } : item),
      accounts: current.accounts.map((account) => account.id === appointment.accountId ? { ...account, lastActivity: `${appointment.type}: ${closeout.outcome}`, nextAction: closeout.nextAction.trim(), nextActionDate: closeout.nextActionDate, stage: closeout.outcome === "Order placed" ? "Opening order" : account.stage, closerId: closeout.outcome === "Order placed" ? appointment.ownerId ?? account.closerId : account.closerId } : account),
      activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "visit", title: `${appointment.type} completed · ${closeout.outcome}`, detail: `${closeout.closeoutNote.trim()} Next: ${closeout.nextAction.trim()} on ${closeout.nextActionDate}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities],
    }));
    return true;
  }, [currentUser, data.appointments]);

  const reassignAppointment = useCallback((id: string, ownerId: string) => {
    if (!currentUser || !canManageSchedule(currentUser)) return;
    setData((current) => {
      const appointment = current.appointments.find((item) => item.id === id);
      if (!appointment || appointment.status !== "Scheduled") return current;
      const owner = ownerId ? current.users.find((user) => user.id === ownerId && user.role !== "Customer") : undefined;
      if (ownerId && !owner) return current;
      const prior = current.users.find((user) => user.id === appointment.ownerId);
      return {
        ...current,
        appointments: current.appointments.map((item) => item.id === id ? { ...item, ownerId: ownerId || undefined, assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? nowStamp() : undefined } : item),
        activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "note", title: ownerId ? "Appointment assigned" : "Appointment unassigned", detail: `${prior?.name ?? "Unassigned"} → ${owner?.name ?? "Holding area"}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities],
      };
    });
  }, [currentUser]);

  const moveAppointment = useCallback((id: string, ownerId: string | undefined, date: string, startTime: string) => {
    if (!currentUser || !canManageSchedule(currentUser)) return false;
    let moved = false;
    setData((current) => {
      const appointment = current.appointments.find((item) => item.id === id);
      if (!appointment || appointment.status !== "Scheduled") return current;
      if (ownerId && !current.users.some((user) => user.id === ownerId && user.role !== "Customer")) return current;
      moved = true;
      const before = `${appointment.ownerId ?? "Unassigned"} · ${appointment.date} ${appointment.startTime}`;
      const after = `${ownerId ?? "Unassigned"} · ${date} ${startTime}`;
      return { ...current, appointments: current.appointments.map((item) => item.id === id ? { ...item, ownerId, date, startTime, assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? nowStamp() : undefined } : item), activities: [{ id: `act-${Date.now()}`, accountId: appointment.accountId, type: "note", title: "Dispatch schedule changed", detail: `${before} → ${after}.`, at: nowStamp(), userId: currentUser.id }, ...current.activities] };
    });
    return moved;
  }, [currentUser]);

  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {
    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;
    setData((current) => {
      const order = current.orders.find((item) => item.id === id);
      if (!order || nextFulfillment[order.status] !== status) return current;
      return { ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };
    });
  }, [currentUser]);

  const reconcileOrderPayment = useCallback((id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {
    setData((current) => {
      const order = current.orders.find((item) => item.id === id);
      if (!order) return current;
      const account = current.accounts.find((item) => item.id === order.accountId);
      const becamePaid = status === "Paid" && order.paymentStatus !== "Paid";
      return {
        ...current,
        orders: current.orders.map((item) => item.id === id ? { ...item, paymentStatus: status, paidAt: status === "Paid" ? paidAt ?? todayKey() : undefined } : item),
        accounts: becamePaid && account ? current.accounts.map((item) => item.id === account.id ? { ...item, lastActivity: `Payment cleared for ${order.number}`, lifetimeCases: item.lifetimeCases + order.cases, reorderCount: item.lifetimeCases > 0 ? item.reorderCount + 1 : item.reorderCount } : item) : current.accounts,
        activities: becamePaid ? [{ id: `act-${Date.now()}`, accountId: order.accountId, type: "order", title: "Payment cleared", detail: `${order.number} settled. Payment is now eligible for compensation, pricing, and collected-sales logic.`, at: nowStamp(), userId: currentUser?.id ?? "system" }, ...current.activities] : current.activities,
      };
    });
  }, [currentUser]);

  const createOrder = useCallback(({ accountId, cases, pricePerCase }: NewOrder) => {
    if (!currentUser || !canCreateOrder(currentUser) || cases < 1) return null;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const prior = data.orders.find((order) => order.accountId === accountId && ["Delivered", "Paid"].includes(order.status) && order.pricePerCase > 0);
    const customer = currentUser.role === "Customer";
    const price = customer ? prior?.pricePerCase : pricePerCase;
    if (!price || price <= 0) return null;
    const id = `ord-${Date.now()}`;
    const number = `GE-${data.orders.length + 1050}`;
    const reviewers = data.users.filter((user) => user.role === "Administrator" || user.id === currentUser.managerId).map((user) => user.id);
    setData((current) => ({
      ...current,
      orders: [{ id, number, accountId, cases, pricePerCase: price, amount: cases * price, status: "Awaiting approval", placedAt: todayKey(), ownerId: currentUser.id, priceBasis: customer ? "Prior demo order snapshot" : "Demo entered price", paymentStatus: "Not invoiced" }, ...current.orders],
      accounts: current.accounts.map((item) => item.id === accountId ? { ...item, stage: "Opening order", lastActivity: `Order request ${number} submitted` } : item),
      approvals: [{ id: `apr-${Date.now()}`, type: "Order", title: `Review order ${number}`, detail: `${cases} cases · ${customer ? "prior order snapshot" : "demo-entered price"} · ${account.locationName ?? account.name}`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "High", status: "Pending" }, ...current.approvals],
      notifications: [{ id: `note-${Date.now()}`, title: `Order ${number} needs review`, detail: `${account.locationName ?? account.name} · ${cases} cases`, at: nowStamp(), readBy: [], tone: "info", audienceUserIds: reviewers }, ...current.notifications],
    }));
    return id;
  }, [currentUser, data]);

  const updatePlacement = useCallback((id: string, observedStock: number, facings: number, cold: boolean, shelfPrice: number) => {
    if (!currentUser || !["Administrator", "Sales Manager", "Sales Representative"].includes(currentUser.role)) return;
    const placement = data.placements.find((item) => item.id === id);
    const account = data.accounts.find((item) => item.id === placement?.accountId);
    if (!placement || !account || !accountIsVisible(data, currentUser, account)) return;
    setData((current) => ({ ...current, placements: current.placements.map((item) => item.id === id ? { ...item, observedStock, facings, cold, shelfPrice, lastChecked: todayKey(), status: observedStock === 0 ? "Out of stock" : facings === 0 || !cold ? "Check soon" : "Healthy" } : item) }));
  }, [currentUser, data]);

  const decideApproval = useCallback((id: string, decision: "Approved" | "Returned") => {
    if (!currentUser) return;
    setData((current) => {
      const approval = current.approvals.find((item) => item.id === id);
      if (!approval || approval.status !== "Pending" || !canReviewApproval(current, currentUser, approval)) return current;
      return {
        ...current,
        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision } : item),
        orders: current.orders.map((order) => approval.type === "Order" && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
        notifications: [{ id: `note-${Date.now()}`, title: `${approval.type} ${decision.toLowerCase()}`, detail: approval.title, at: nowStamp(), readBy: [], tone: decision === "Approved" ? "success" : "warning", audienceUserIds: approval.requesterId ? [approval.requesterId] : undefined }, ...current.notifications],
      };
    });
  }, [currentUser]);

  const resolveInventoryHold = useCallback((id: string, decision: "Release" | "Retain", reason: string) => {
    if (!currentUser || !["Administrator", "Operations"].includes(currentUser.role) || reason.trim().length < 8) return false;
    const lot = data.inventory.find((item) => item.id === id);
    if (!lot || lot.status !== "Quality hold") return false;
    setData((current) => ({ ...current, inventory: current.inventory.map((item) => item.id === id ? { ...item, status: decision === "Release" ? "Available" : "Quality hold", available: decision === "Release" ? item.onHand - item.reserved : 0, holdDecision: `${decision}: ${reason.trim()}`, holdResolvedAt: decision === "Release" ? nowStamp() : undefined, holdResolvedBy: currentUser.id } : item), notifications: [{ id: `note-${Date.now()}`, title: `${lot.lotCode} hold ${decision === "Release" ? "released" : "retained"}`, detail: reason.trim(), at: nowStamp(), readBy: [currentUser.id], tone: decision === "Release" ? "success" : "warning", audienceUserIds: current.users.filter((user) => ["Administrator", "Operations"].includes(user.role)).map((user) => user.id) }, ...current.notifications] }));
    return true;
  }, [currentUser, data.inventory]);

  const toggleClock = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData((current) => {
      const active = current.timeEntries.find((item) => item.userId === currentUser.id && !item.clockOut);
      if (active?.mealStart && !active.mealEnd) return current;
      return active ? { ...current, timeEntries: current.timeEntries.map((item) => item.id === active.id ? { ...item, clockOut: localTime() } : item) } : { ...current, timeEntries: [{ id: `te-${Date.now()}`, userId: currentUser.id, date: todayKey(), clockIn: localTime(), breakMinutes: 0, source: "Demo desktop" }, ...current.timeEntries] };
    });
  }, [currentUser]);
  const startMeal = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData((current) => { const active = current.timeEntries.find((item) => item.userId === currentUser.id && !item.clockOut); if (!active || active.mealStart) return current; return { ...current, timeEntries: current.timeEntries.map((item) => item.id === active.id ? { ...item, mealStart: localTime() } : item) }; });
  }, [currentUser]);
  const endMeal = useCallback(() => {
    if (!currentUser || currentUser.role === "Customer") return;
    setData((current) => { const active = current.timeEntries.find((item) => item.userId === currentUser.id && !item.clockOut); if (!active?.mealStart || active.mealEnd) return current; const mealEnd = localTime(); return { ...current, timeEntries: current.timeEntries.map((item) => item.id === active.id ? { ...item, mealEnd, breakMinutes: minutesBetween(active.mealStart!, mealEnd) } : item) }; });
  }, [currentUser]);

  const correctTimeEntry = useCallback((id: string, values: TimeEntryCorrectionInput, reason: string) => {
    if (!currentUser || currentUser.role === "Customer" || reason.trim().length < 3 || !validTime(values.clockIn) || !validTime(values.mealStart) || !validTime(values.mealEnd) || !validTime(values.clockOut) || values.breakMinutes < 0) return false;
    if (values.clockOut && minuteOfDay(values.clockOut) < minuteOfDay(values.clockIn)) return false;
    if ((values.mealStart && !values.mealEnd) || (!values.mealStart && values.mealEnd)) return false;
    if (values.mealStart && values.mealEnd && (minuteOfDay(values.mealStart) < minuteOfDay(values.clockIn) || minuteOfDay(values.mealEnd) < minuteOfDay(values.mealStart) || (values.clockOut && minuteOfDay(values.mealEnd) > minuteOfDay(values.clockOut)))) return false;
    let changed = false;
    setData((current) => {
      const entry = current.timeEntries.find((item) => item.id === id && item.userId === currentUser.id);
      if (!entry) return current;
      const card = current.timecards.find((item) => item.userId === currentUser.id && entry.date >= item.weekStart && entry.date <= item.weekEnd && (item.status === "Open" || item.status === "Returned"));
      if (!card) return current;
      const before = { clockIn: entry.clockIn, mealStart: entry.mealStart, mealEnd: entry.mealEnd, clockOut: entry.clockOut, breakMinutes: entry.breakMinutes };
      const same = before.clockIn === values.clockIn && before.mealStart === values.mealStart && before.mealEnd === values.mealEnd && before.clockOut === values.clockOut && before.breakMinutes === values.breakMinutes;
      if (same) return current;
      changed = true;
      return { ...current, timeEntries: current.timeEntries.map((item) => item.id === id ? { ...item, ...values, source: "Manual correction", note: reason.trim(), corrections: [{ at: nowStamp(), by: currentUser.id, reason: reason.trim(), before }, ...(item.corrections ?? [])] } : item) };
    });
    return changed;
  }, [currentUser]);

  const submitTimecard = useCallback((id: string) => {
    if (!currentUser) return;
    setData((current) => {
      const card = current.timecards.find((item) => item.id === id && item.userId === currentUser.id && (item.status === "Open" || item.status === "Returned"));
      if (!card) return current;
      if (current.timeEntries.some((item) => item.userId === currentUser.id && item.date >= card.weekStart && item.date <= card.weekEnd && (!item.clockOut || Boolean(item.mealStart && !item.mealEnd)))) return current;
      const exists = current.approvals.some((item) => item.type === "Timecard" && item.recordId === id && item.status === "Pending");
      return { ...current, timecards: current.timecards.map((item) => item.id === id ? { ...item, status: "Submitted", submittedAt: nowStamp(), attested: true, approvedAt: undefined, approverId: undefined } : item), approvals: exists ? current.approvals : [{ id: `apr-${Date.now()}`, type: "Timecard", title: `${currentUser.name} · weekly timecard`, detail: `${card.weekStart} through ${card.weekEnd} · employee attested`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "Normal", status: "Pending" }, ...current.approvals] };
    });
  }, [currentUser]);

  const decideTimecard = useCallback((id: string, decision: "Manager approved" | "Returned") => {
    if (!currentUser) return;
    setData((current) => {
      const card = current.timecards.find((item) => item.id === id);
      const approval = current.approvals.find((item) => item.type === "Timecard" && item.recordId === id && item.status === "Pending");
      if (!card || card.userId === currentUser.id || !approval || !canReviewApproval(current, currentUser, approval)) return current;
      const stamp = nowStamp();
      return { ...current, timecards: current.timecards.map((item) => item.id === id ? { ...item, status: decision, attested: decision === "Returned" ? false : item.attested, approvedAt: decision === "Manager approved" ? stamp : undefined, approverId: decision === "Manager approved" ? currentUser.id : undefined, returnedAt: decision === "Returned" ? stamp : item.returnedAt, returnedBy: decision === "Returned" ? currentUser.id : item.returnedBy } : item), approvals: current.approvals.map((item) => item.id === approval.id ? { ...item, status: decision === "Manager approved" ? "Approved" : "Returned" } : item), notifications: [{ id: `note-${Date.now()}`, title: `Timecard ${decision === "Manager approved" ? "approved" : "returned"}`, detail: `${card.weekStart} through ${card.weekEnd}`, at: stamp, readBy: [], tone: decision === "Manager approved" ? "success" : "warning", audienceUserIds: [card.userId] }, ...current.notifications] };
    });
  }, [currentUser]);

  const createBulletin = useCallback((bulletin: NewBulletin) => {
    if (!currentUser || !bulletin.title.trim() || !bulletin.body.trim() || !canPublishBulletinTo(currentUser, bulletin.audience, bulletin.team)) return false;
    setData((current) => ({ ...current, bulletins: [{ id: `blt-${Date.now()}`, ...bulletin, title: bulletin.title.trim(), body: bulletin.body.trim(), authorId: currentUser.id, publishedAt: nowStamp(), acknowledgedBy: [currentUser.id] }, ...current.bulletins] }));
    return true;
  }, [currentUser]);
  const acknowledgeBulletin = useCallback((id: string) => { if (!currentUser) return; setData((current) => ({ ...current, bulletins: current.bulletins.map((item) => item.id === id && !item.acknowledgedBy.includes(currentUser.id) ? { ...item, acknowledgedBy: [...item.acknowledgedBy, currentUser.id] } : item) })); }, [currentUser]);
  const markNotificationsRead = useCallback(() => { if (!currentUser) return; const ids = new Set(scope.notifications.map((item) => item.id)); setData((current) => ({ ...current, notifications: current.notifications.map((item) => ids.has(item.id) && !item.readBy.includes(currentUser.id) ? { ...item, readBy: [...item.readBy, currentUser.id] } : item) })); }, [currentUser, scope.notifications]);
  const resetDemo = useCallback(() => { if (currentUser?.role !== "Administrator") return; setData(createNormalizedDemoData()); setActivePage("home"); }, [currentUser]);

  const value = useMemo<WorkspaceContextValue>(() => ({ data, scope, currentUser, ready, activePage, sidebarOpen, sidebarCollapsed, setSidebarOpen, setSidebarCollapsed, navigate, login, logout, switchUser, createAccount, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, moveAppointment, setOrderStatus, reconcileOrderPayment, createOrder, updatePlacement, decideApproval, resolveInventoryHold, toggleClock, startMeal, endMeal, correctTimeEntry, submitTimecard, decideTimecard, createBulletin, acknowledgeBulletin, markNotificationsRead, resetDemo }), [data, scope, currentUser, ready, activePage, sidebarOpen, sidebarCollapsed, setSidebarCollapsed, navigate, login, logout, switchUser, createAccount, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, moveAppointment, setOrderStatus, reconcileOrderPayment, createOrder, updatePlacement, decideApproval, resolveInventoryHold, toggleClock, startMeal, endMeal, correctTimeEntry, submitTimecard, decideTimecard, createBulletin, acknowledgeBulletin, markNotificationsRead, resetDemo]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
