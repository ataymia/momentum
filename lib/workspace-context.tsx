"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { accountIsVisible, canAdvanceFulfillment, canManageSchedule, canReviewApproval, getWorkspaceScope } from "./access";
import { pricingTierPrice } from "./account-health";
import { findAccountDuplicate } from "./duplicate-engine";
import type { Account, Activity, Appointment, AppointmentStatus, Approval, InventoryLot, Order, OrderStatus, PremiseType, PricingTier, WorkspaceData, WorkspaceUser } from "./types";
import { WorkspaceProvider as BaseWorkspaceProvider, useWorkspace as useBaseWorkspace } from "./workspace-context-v5";

const COMMERCIAL_KEY = "momentum-commercial-controls-v1";
const WAREHOUSE_SESSION_KEY = "momentum-warehouse-session-v1";
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const plusDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const warehouseUser: WorkspaceUser = {
  id: "usr-warehouse",
  name: "Warehouse Demo",
  firstName: "Warehouse",
  email: "warehouse@momentum.demo",
  initials: "WH",
  title: "Warehouse Coordinator",
  role: "Warehouse",
  team: "Operations",
  managerId: "usr-mia",
  accent: "#53657d",
};

const tropicalLot: InventoryLot = {
  id: "lot-demo-tropical",
  lotCode: "DEMO-TROP-01",
  product: "Golden Eagle Tropical · demo SKU",
  receivedAt: plusDays(today(), -20),
  bestBy: plusDays(today(), 330),
  onHand: 44,
  reserved: 0,
  available: 44,
  status: "Low stock",
  location: "Phoenix demo warehouse",
};

type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount">>;
type CommercialState = {
  version: 1;
  accountPatches: Record<string, CommercialAccountPatch>;
  orders: Order[];
  appointments: Appointment[];
  approvals: Approval[];
  activities: Activity[];
  inventoryLots: InventoryLot[];
};

type EnhancedOrderInput = { accountId: string; cases: number; pricePerCase?: number; product?: string; inventoryAvailableAtOrder?: number };
type CommercialAccountInput = { premiseType?: PremiseType; businessType?: string; categoryReviewDate?: string; pricingTier?: PricingTier };
type BaseWorkspace = ReturnType<typeof useBaseWorkspace>;
type NewAppointmentInput = Parameters<BaseWorkspace["createAppointment"]>[0];
type AppointmentCloseout = Parameters<BaseWorkspace["completeAppointment"]>[1];
type EnhancedWorkspace = Omit<BaseWorkspace, "data" | "scope" | "currentUser" | "login" | "logout" | "switchUser" | "createAccount" | "createOrder" | "createAppointment" | "advanceAppointment" | "completeAppointment" | "reassignAppointment" | "moveAppointment" | "decideApproval" | "setOrderStatus" | "reconcileOrderPayment" | "resetDemo"> & {
  data: WorkspaceData;
  scope: ReturnType<typeof getWorkspaceScope>;
  currentUser: WorkspaceUser | null;
  login: (email: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  switchUser: (userId: string) => void;
  createAccount: BaseWorkspace["createAccount"];
  createOrder: (order: EnhancedOrderInput) => string | null;
  createAppointment: (appointment: NewAppointmentInput) => string | null;
  advanceAppointment: (id: string) => void;
  completeAppointment: (id: string, closeout: AppointmentCloseout) => boolean;
  reassignAppointment: (id: string, ownerId: string) => void;
  moveAppointment: (id: string, ownerId: string | undefined, date: string, startTime: string) => boolean;
  decideApproval: (id: string, decision: "Approved" | "Returned") => void;
  setOrderStatus: (id: string, status: OrderStatus) => void;
  reconcileOrderPayment: (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => void;
  updateAccountCommercial: (accountId: string, patch: CommercialAccountInput) => boolean;
  transferAccountResponsibility: (accountId: string, toUserId: string, reason: string) => boolean;
  importInventoryLots: (lots: InventoryLot[]) => number;
  resetDemo: () => void;
};

const EnhancedWorkspaceContext = createContext<EnhancedWorkspace | null>(null);
const nextAppointment: Record<AppointmentStatus, AppointmentStatus> = { Scheduled: "Dispatched", Dispatched: "En route", "En route": "Arrived", Arrived: "Arrived", Completed: "Completed", "Needs follow-up": "Needs follow-up" };
const nextFulfillment: Partial<Record<OrderStatus, OrderStatus>> = { Approved: "Allocated", Allocated: "Out for delivery", "Out for delivery": "Delivered" };

function inferredTier(data: WorkspaceData, accountId: string): PricingTier | undefined {
  const price = data.orders.filter((order) => order.accountId === accountId && order.pricePerCase > 0).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0]?.pricePerCase;
  return price === 24 ? "A" : price === 27 ? "B" : price === 30 ? "C" : undefined;
}

function seedCommercial(data: WorkspaceData): CommercialState {
  const accountPatches: Record<string, CommercialAccountPatch> = {};
  for (const account of data.accounts) {
    accountPatches[account.id] = {
      premiseType: account.premiseType ?? "Unclassified",
      businessType: account.businessType ?? account.channel,
      categoryReviewDate: account.categoryReviewDate ?? plusDays(today(), 90),
      pricingTier: account.pricingTier ?? inferredTier(data, account.id),
    };
  }
  return { version: 1, accountPatches, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [] };
}

function readCommercial(data: WorkspaceData): CommercialState {
  if (typeof window === "undefined") return seedCommercial(data);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(COMMERCIAL_KEY) ?? "null") as Partial<CommercialState> | null;
    if (!parsed || parsed.version !== 1) return seedCommercial(data);
    return {
      version: 1,
      accountPatches: { ...seedCommercial(data).accountPatches, ...(parsed.accountPatches ?? {}) },
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      inventoryLots: Array.isArray(parsed.inventoryLots) ? parsed.inventoryLots : [],
    };
  } catch {
    return seedCommercial(data);
  }
}

function EnhancedWorkspaceProvider({ children }: { children: ReactNode }) {
  const base = useBaseWorkspace();
  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));
  const [warehouseSession, setWarehouseSession] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(COMMERCIAL_KEY, JSON.stringify(commercial));
  }, [commercial]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => setWarehouseSession(window.localStorage.getItem(WAREHOUSE_SESSION_KEY) === "true"), 0);
    return () => window.clearTimeout(handle);
  }, []);

  const data = useMemo<WorkspaceData>(() => {
    const users = base.data.users.some((user) => user.id === warehouseUser.id) ? base.data.users : [...base.data.users, warehouseUser];
    const extraLots = [...commercial.inventoryLots];
    if (!base.data.inventory.some((lot) => lot.id === tropicalLot.id) && !extraLots.some((lot) => lot.id === tropicalLot.id)) extraLots.push(tropicalLot);
    const extraLotIds = new Set(extraLots.map((lot) => lot.id));
    const inventory = [...extraLots, ...base.data.inventory.filter((lot) => !extraLotIds.has(lot.id))];
    const accounts = base.data.accounts.map((account) => ({ ...account, ...(commercial.accountPatches[account.id] ?? {}) }));
    const salesRepIds = new Set(users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
    const baseOrders = base.data.orders.map((order) => ({
      ...order,
      product: order.product ?? base.data.placements.find((placement) => placement.accountId === order.accountId)?.product ?? base.data.inventory[0]?.product ?? "Golden Eagle",
      creditedRepId: order.creditedRepId ?? (salesRepIds.has(order.ownerId) ? order.ownerId : undefined),
    }));
    const orderIds = new Set(commercial.orders.map((order) => order.id));
    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));
    return {
      ...base.data,
      users,
      inventory,
      accounts,
      orders: [...commercial.orders, ...baseOrders.filter((order) => !orderIds.has(order.id))],
      appointments: [...commercial.appointments, ...base.data.appointments.filter((item) => !appointmentIds.has(item.id))],
      approvals: [...commercial.approvals, ...base.data.approvals.filter((approval) => !commercial.approvals.some((entry) => entry.id === approval.id))],
      activities: [...commercial.activities, ...base.data.activities],
    };
  }, [base.data, commercial]);

  const currentUser = useMemo(() => warehouseSession ? data.users.find((user) => user.id === warehouseUser.id) ?? null : base.currentUser ? data.users.find((user) => user.id === base.currentUser?.id) ?? base.currentUser : null, [base.currentUser, data.users, warehouseSession]);
  const scope = useMemo(() => getWorkspaceScope(data, currentUser), [data, currentUser]);

  const login = (email: string, password: string) => {
    if (email.trim().toLowerCase() === warehouseUser.email && password === "admin") {
      base.logout();
      setWarehouseSession(true);
      window.localStorage.setItem(WAREHOUSE_SESSION_KEY, "true");
      return { ok: true };
    }
    setWarehouseSession(false);
    window.localStorage.removeItem(WAREHOUSE_SESSION_KEY);
    return base.login(email, password);
  };

  const logout = () => {
    setWarehouseSession(false);
    window.localStorage.removeItem(WAREHOUSE_SESSION_KEY);
    base.logout();
  };

  const switchUser = (userId: string) => {
    if (userId === warehouseUser.id) {
      base.logout();
      setWarehouseSession(true);
      window.localStorage.setItem(WAREHOUSE_SESSION_KEY, "true");
      return;
    }
    setWarehouseSession(false);
    window.localStorage.removeItem(WAREHOUSE_SESSION_KEY);
    base.switchUser(userId);
  };

  const createAccount: BaseWorkspace["createAccount"] = (account) => {
    if (findAccountDuplicate(data.accounts, account)) return null;
    const id = base.createAccount(account);
    if (id) setCommercial((state) => ({ ...state, accountPatches: { ...state.accountPatches, [id]: { premiseType: "Unclassified", businessType: account.channel, categoryReviewDate: plusDays(today(), 90) } } }));
    return id;
  };

  const updateAccountCommercial = (accountId: string, patch: CommercialAccountInput) => {
    if (!currentUser || !["Administrator", "Sales Manager", "Sales Representative"].includes(currentUser.role)) return false;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return false;
    const pricingChanged = patch.pricingTier !== undefined && patch.pricingTier !== account.pricingTier;
    setCommercial((state) => ({
      ...state,
      accountPatches: {
        ...state.accountPatches,
        [accountId]: {
          ...(state.accountPatches[accountId] ?? {}),
          ...patch,
          ...(pricingChanged ? { pricingUpdatedAt: now(), pricingUpdatedBy: currentUser.id } : {}),
        },
      },
      activities: [{ id: uid("act-commercial"), accountId, type: "note", title: pricingChanged ? "Pricing tier changed" : "Account classification updated", detail: pricingChanged ? `Pricing tier ${account.pricingTier ?? "Unassigned"} → ${patch.pricingTier}.` : "Commercial account fields updated.", at: now(), userId: currentUser.id }, ...state.activities],
    }));
    return true;
  };

  const transferAccountResponsibility = (accountId: string, toUserId: string, reason: string) => {
    if (!currentUser || !["Administrator", "Sales Manager"].includes(currentUser.role) || reason.trim().length < 3) return false;
    const account = data.accounts.find((item) => item.id === accountId);
    const target = data.users.find((user) => user.id === toUserId && ["Sales Representative", "Sales Manager"].includes(user.role));
    if (!account || !target || !accountIsVisible(data, currentUser, account)) return false;
    const from = data.users.find((user) => user.id === account.ownerId);
    setCommercial((state) => ({
      ...state,
      accountPatches: {
        ...state.accountPatches,
        [accountId]: {
          ...(state.accountPatches[accountId] ?? {}),
          ownerId: target.id,
          accountManagerId: target.id,
          responsibilityStartedAt: now(),
          lastActivity: `Responsibility transferred to ${target.name}`,
        },
      },
      activities: [{ id: uid("act-handoff"), accountId, type: "note", title: "Sales responsibility transferred", detail: `${from?.name ?? "Unassigned"} → ${target.name}. ${reason.trim()} Historical order attribution remains unchanged.`, at: now(), userId: currentUser.id }, ...state.activities],
    }));
    return true;
  };

  const createAppointment = (appointment: NewAppointmentInput) => {
    if (!currentUser || ["Customer", "Warehouse"].includes(currentUser.role)) return null;
    const account = data.accounts.find((item) => item.id === appointment.accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const ownerId = currentUser.role === "Sales Representative" ? currentUser.id : appointment.ownerId || undefined;
    if (ownerId && !data.users.some((user) => user.id === ownerId && user.role !== "Customer" && user.role !== "Warehouse")) return null;
    const owner = data.users.find((user) => user.id === ownerId);
    const id = uid("apt");
    const record: Appointment = { ...appointment, id, ownerId, customerId: account.customerId, status: "Scheduled", location: account.streetAddress || account.location, priority: appointment.priority ?? "Normal", tags: appointment.tags ?? [], assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? now() : undefined };
    setCommercial((state) => ({ ...state, appointments: [record, ...state.appointments], activities: [{ id: uid("act-appt"), accountId: account.id, type: "visit", title: `${appointment.type} scheduled`, detail: `${appointment.date} at ${appointment.startTime} · ${owner ? `assigned to ${owner.name}` : "left unassigned"}.`, at: now(), userId: currentUser.id }, ...state.activities] }));
    return id;
  };

  const advanceAppointment = (id: string) => {
    const enhanced = commercial.appointments.find((item) => item.id === id);
    if (!enhanced) {
      base.advanceAppointment(id);
      return;
    }
    if (!currentUser || !enhanced.ownerId || (enhanced.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return;
    const status = nextAppointment[enhanced.status];
    if (status === enhanced.status) return;
    setCommercial((state) => ({ ...state, appointments: state.appointments.map((item) => item.id === id ? { ...item, status } : item), activities: [{ id: uid("act-appt"), accountId: enhanced.accountId, type: "visit", title: `${enhanced.type} · ${status}`, detail: `Work moved to ${status.toLowerCase()}.`, at: now(), userId: currentUser.id }, ...state.activities] }));
  };

  const completeAppointment = (id: string, closeout: AppointmentCloseout) => {
    const enhanced = commercial.appointments.find((item) => item.id === id);
    if (!enhanced) return base.completeAppointment(id, closeout);
    if (!currentUser || !closeout.closeoutNote.trim() || !closeout.nextAction.trim() || !closeout.nextActionDate || enhanced.status !== "Arrived" || (enhanced.ownerId !== currentUser.id && !canManageSchedule(currentUser))) return false;
    setCommercial((state) => ({
      ...state,
      appointments: state.appointments.map((item) => item.id === id ? { ...item, status: "Completed", completedAt: now(), ...closeout, closeoutNote: closeout.closeoutNote.trim(), nextAction: closeout.nextAction.trim() } : item),
      accountPatches: {
        ...state.accountPatches,
        [enhanced.accountId]: {
          ...(state.accountPatches[enhanced.accountId] ?? {}),
          lastActivity: `${enhanced.type}: ${closeout.outcome}`,
          nextAction: closeout.nextAction.trim(),
          nextActionDate: closeout.nextActionDate,
          stage: closeout.outcome === "Order placed" ? "Opening order" : data.accounts.find((item) => item.id === enhanced.accountId)?.stage,
          closerId: closeout.outcome === "Order placed" ? enhanced.ownerId : undefined,
        },
      },
      activities: [{ id: uid("act-closeout"), accountId: enhanced.accountId, type: "visit", title: `${enhanced.type} completed · ${closeout.outcome}`, detail: `${closeout.closeoutNote.trim()} Next: ${closeout.nextAction.trim()} on ${closeout.nextActionDate}.`, at: now(), userId: currentUser.id }, ...state.activities],
    }));
    return true;
  };

  const reassignAppointment = (id: string, ownerId: string) => {
    const enhanced = commercial.appointments.find((item) => item.id === id);
    if (!enhanced) {
      base.reassignAppointment(id, ownerId);
      return;
    }
    if (!currentUser || !canManageSchedule(currentUser) || enhanced.status !== "Scheduled") return;
    const owner = ownerId ? data.users.find((user) => user.id === ownerId && user.role !== "Customer" && user.role !== "Warehouse") : undefined;
    if (ownerId && !owner) return;
    const prior = data.users.find((user) => user.id === enhanced.ownerId);
    setCommercial((state) => ({ ...state, appointments: state.appointments.map((item) => item.id === id ? { ...item, ownerId: ownerId || undefined, assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? now() : undefined } : item), activities: [{ id: uid("act-assign"), accountId: enhanced.accountId, type: "note", title: ownerId ? "Appointment assigned" : "Appointment unassigned", detail: `${prior?.name ?? "Unassigned"} → ${owner?.name ?? "Holding area"}.`, at: now(), userId: currentUser.id }, ...state.activities] }));
  };

  const moveAppointment = (id: string, ownerId: string | undefined, date: string, startTime: string) => {
    const enhanced = commercial.appointments.find((item) => item.id === id);
    if (!enhanced) return base.moveAppointment(id, ownerId, date, startTime);
    if (!currentUser || !canManageSchedule(currentUser) || enhanced.status !== "Scheduled") return false;
    if (ownerId && !data.users.some((user) => user.id === ownerId && user.role !== "Customer" && user.role !== "Warehouse")) return false;
    const before = `${enhanced.ownerId ?? "Unassigned"} · ${enhanced.date} ${enhanced.startTime}`;
    const after = `${ownerId ?? "Unassigned"} · ${date} ${startTime}`;
    setCommercial((state) => ({ ...state, appointments: state.appointments.map((item) => item.id === id ? { ...item, ownerId, date, startTime, assignedBy: ownerId ? currentUser.id : undefined, assignedAt: ownerId ? now() : undefined } : item), activities: [{ id: uid("act-move"), accountId: enhanced.accountId, type: "note", title: "Dispatch schedule changed", detail: `${before} → ${after}.`, at: now(), userId: currentUser.id }, ...state.activities] }));
    return true;
  };

  const createOrder = ({ accountId, cases, pricePerCase, product, inventoryAvailableAtOrder }: EnhancedOrderInput) => {
    if (!currentUser || !["Administrator", "Sales Manager", "Sales Representative", "Customer"].includes(currentUser.role) || cases < 1) return null;
    const account = data.accounts.find((item) => item.id === accountId);
    if (!account || !accountIsVisible(data, currentUser, account)) return null;
    const selectedProduct = product || data.inventory[0]?.product || "Golden Eagle";
    const prior = data.orders.filter((order) => order.accountId === accountId && ["Delivered", "Paid"].includes(order.status) && order.pricePerCase > 0).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0];
    const customer = currentUser.role === "Customer";
    const tierPrice = pricingTierPrice(account.pricingTier);
    const price = customer ? prior?.pricePerCase : tierPrice ?? pricePerCase;
    if (!price || price <= 0) return null;
    const available = inventoryAvailableAtOrder ?? data.inventory.filter((lot) => lot.product === selectedProduct).reduce((sum, lot) => sum + lot.available, 0);
    const lowStock = available < 50;
    const id = uid("ord");
    const number = `GE-${data.orders.length + 1050}`;
    const creditedRepId = currentUser.role === "Sales Representative" ? currentUser.id : undefined;
    const order: Order = { id, number, accountId, cases, pricePerCase: price, amount: cases * price, status: "Awaiting approval", placedAt: today(), ownerId: currentUser.id, creditedRepId, product: selectedProduct, inventoryAvailableAtOrder: available, lowStockApprovalRequired: lowStock, priceBasis: customer ? "Prior demo order snapshot" : tierPrice ? "Account pricing tier" : "Demo entered price", paymentStatus: "Not invoiced" };
    const approval: Approval = { id: uid("apr"), type: lowStock ? "Low stock sale" : "Order", title: lowStock ? `Low-stock approval · ${number}` : `Review order ${number}`, detail: `${selectedProduct} · ${cases} cases · ${available} available sellable cases · ${account.locationName ?? account.name}`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.role === "Customer" ? "Sales" : currentUser.team, submittedAt: now(), dueAt: new Date(Date.now() + 86400000).toISOString(), priority: lowStock ? "Urgent" : "High", status: "Pending" };
    setCommercial((state) => ({ ...state, orders: [order, ...state.orders], approvals: [approval, ...state.approvals], accountPatches: { ...state.accountPatches, [accountId]: { ...(state.accountPatches[accountId] ?? {}), stage: "Opening order", lastActivity: `Order request ${number} submitted` } }, activities: [{ id: uid("act-order"), accountId, type: "order", title: lowStock ? "Low-stock order submitted" : "Order submitted", detail: `${number} · ${selectedProduct} · ${cases} cases · ${available} available at submission.`, at: now(), userId: currentUser.id }, ...state.activities] }));
    return id;
  };

  const decideApproval = (id: string, decision: "Approved" | "Returned") => {
    const approval = commercial.approvals.find((item) => item.id === id);
    if (!approval) {
      base.decideApproval(id, decision);
      return;
    }
    if (!currentUser || approval.status !== "Pending" || !canReviewApproval(data, currentUser, approval)) return;
    setCommercial((state) => ({ ...state, approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision } : item), orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order) }));
  };

  const setOrderStatus = (id: string, status: OrderStatus) => {
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) {
      base.setOrderStatus(id, status);
      return;
    }
    if (!currentUser || !canAdvanceFulfillment(currentUser) || nextFulfillment[order.status] !== status) return;
    setCommercial((state) => ({ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) }));
  };

  const reconcileOrderPayment = (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) {
      base.reconcileOrderPayment(id, status, paidAt);
      return;
    }
    const becamePaid = status === "Paid" && order.paymentStatus !== "Paid";
    setCommercial((state) => ({
      ...state,
      orders: state.orders.map((item) => item.id === id ? { ...item, paymentStatus: status, paidAt: status === "Paid" ? paidAt ?? today() : undefined } : item),
      accountPatches: becamePaid ? {
        ...state.accountPatches,
        [order.accountId]: {
          ...(state.accountPatches[order.accountId] ?? {}),
          lastActivity: `Payment cleared for ${order.number}`,
          lifetimeCases: (data.accounts.find((account) => account.id === order.accountId)?.lifetimeCases ?? 0) + order.cases,
          reorderCount: (data.accounts.find((account) => account.id === order.accountId)?.lifetimeCases ?? 0) > 0 ? (data.accounts.find((account) => account.id === order.accountId)?.reorderCount ?? 0) + 1 : (data.accounts.find((account) => account.id === order.accountId)?.reorderCount ?? 0),
        },
      } : state.accountPatches,
      activities: becamePaid ? [{ id: uid("act-paid"), accountId: order.accountId, type: "order", title: "Payment cleared", detail: `${order.number} settled. Credit remains with ${order.creditedRepId ? data.users.find((user) => user.id === order.creditedRepId)?.name ?? "the creating rep" : "the recorded order source"}.`, at: now(), userId: currentUser?.id ?? "system" }, ...state.activities] : state.activities,
    }));
  };

  const importInventoryLots = (lots: InventoryLot[]) => {
    if (!currentUser || !["Administrator", "Operations", "Warehouse"].includes(currentUser.role)) return 0;
    const existingCodes = new Set(data.inventory.map((lot) => lot.lotCode.trim().toLowerCase()));
    const seenCodes = new Set(existingCodes);
    const valid: InventoryLot[] = [];
    for (const lot of lots) {
      const code = lot.lotCode.trim().toLowerCase();
      if (!code || !lot.product.trim() || lot.onHand < 0 || seenCodes.has(code)) continue;
      seenCodes.add(code);
      const reserved = Math.max(0, lot.reserved || 0);
      valid.push({ ...lot, id: lot.id || uid("lot-import"), reserved, available: Math.max(0, lot.onHand - reserved) });
    }
    if (!valid.length) return 0;
    setCommercial((state) => ({ ...state, inventoryLots: [...valid, ...state.inventoryLots] }));
    return valid.length;
  };

  const resetDemo = () => {
    base.resetDemo();
    setCommercial(seedCommercial(base.data));
    setWarehouseSession(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(COMMERCIAL_KEY);
      window.localStorage.removeItem(WAREHOUSE_SESSION_KEY);
    }
  };

  const value: EnhancedWorkspace = { ...base, data, scope, currentUser, login, logout, switchUser, createAccount, createOrder, createAppointment, advanceAppointment, completeAppointment, reassignAppointment, moveAppointment, decideApproval, setOrderStatus, reconcileOrderPayment, updateAccountCommercial, transferAccountResponsibility, importInventoryLots, resetDemo };
  return <EnhancedWorkspaceContext.Provider value={value}>{children}</EnhancedWorkspaceContext.Provider>;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return <BaseWorkspaceProvider><EnhancedWorkspaceProvider>{children}</EnhancedWorkspaceProvider></BaseWorkspaceProvider>;
}

export function useWorkspace() {
  const workspace = useContext(EnhancedWorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return workspace;
}
