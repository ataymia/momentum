"use client";

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { DELIVERY_STORAGE_KEY, DeliveryEvent, DeliveryState, DeliveryTask, createDeliverySeed, deliveryTaskForOrder, normalizeDeliveryState, processedForDelivery } from "./delivery-engine";
import { useInventoryLedger } from "./inventory-ledger-context";
import { momentumStorage, useRemoteStorageSync } from "./persistence";
import { useRuntimeMode } from "./runtime-mode";
import { useWorkspace } from "./workspace-context";

const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type MutationResult = { ok: boolean; message?: string };
type DeliveryContextValue = {
  state: DeliveryState;
  taskForOrder: (orderId: string) => DeliveryTask | undefined;
  claimDelivery: (orderId: string) => MutationResult;
  assignDelivery: (orderId: string, driverId: string) => MutationResult;
  cancelDelivery: (orderId: string, reason: string) => MutationResult;
  prepareDelivery: (orderId: string) => MutationResult;
  markLoaded: (orderId: string) => MutationResult;
  startDelivery: (orderId: string) => MutationResult;
  markDelivered: (orderId: string, note?: string) => MutationResult;
  addDeliveryNote: (orderId: string, note: string) => MutationResult;
  resetDelivery: () => void;
};

const DeliveryContext = createContext<DeliveryContextValue | null>(null);

export function DeliveryProvider({ children }: { children: ReactNode }) {
  const { data, currentUser } = useWorkspace();
  const inventory = useInventoryLedger();
  const runtime = useRuntimeMode();
  const read = () => {
    if (typeof window === "undefined") return createDeliverySeed();
    try { return normalizeDeliveryState(JSON.parse(momentumStorage.getItem(DELIVERY_STORAGE_KEY) ?? "null"), data); }
    catch { return createDeliverySeed(); }
  };
  const [state, setState] = useState<DeliveryState>(() => read());

  useEffect(() => {
    const handle = window.setTimeout(() => setState((current) => normalizeDeliveryState(current, data)), 0);
    return () => window.clearTimeout(handle);
  }, [data]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      momentumStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(state));
      void momentumStorage.flush();
    }
  }, [state]);
  useRemoteStorageSync(DELIVERY_STORAGE_KEY, () => setState(read()));

  const taskForOrder = (orderId: string) => deliveryTaskForOrder(state, orderId);
  const drivers = useMemo(() => data.users.filter((user) => user.role === "Delivery Driver"), [data.users]);
  const canManage = Boolean(currentUser && ["Administrator", "Operations"].includes(currentUser.role));
  const isDriver = currentUser?.role === "Delivery Driver";
  const appendEvent = (task: DeliveryTask, event: Omit<DeliveryEvent, "id" | "at">): DeliveryTask => ({
    ...task,
    history: [{ id: uid("delivery-event"), at: now(), ...event }, ...task.history],
  });

  const createAssignment = (orderId: string, driverId: string, type: "Accepted" | "Assigned"): MutationResult => {
    if (!currentUser) return { ok: false, message: "Sign in first." };
    const order = data.orders.find((item) => item.id === orderId);
    const driver = drivers.find((item) => item.id === driverId);
    if (!order || !processedForDelivery(order) || !driver) return { ok: false, message: "That order or driver is not eligible for delivery." };
    const existing = taskForOrder(orderId);
    if (existing) return existing.driverId === driverId ? { ok: true } : { ok: false, message: "That order is already assigned to another driver." };
    const stamp = now();
    const record: DeliveryTask = {
      id: uid("delivery"),
      orderId,
      driverId,
      status: "Accepted",
      acceptedAt: stamp,
      acceptedBy: currentUser.id,
      history: [{ id: uid("delivery-event"), type, at: stamp, actorId: currentUser.id, note: type === "Assigned" ? `Assigned to ${driver.name}.` : `${driver.name} accepted the delivery.` }],
    };
    setState((current) => ({ ...current, tasks: [record, ...current.tasks] }));
    return { ok: true };
  };

  const claimDelivery = (orderId: string): MutationResult => {
    if (!currentUser || !isDriver) return { ok: false, message: "Only a Delivery Driver can claim an unassigned delivery." };
    return createAssignment(orderId, currentUser.id, "Accepted");
  };

  const assignDelivery = (orderId: string, driverId: string): MutationResult => {
    if (!canManage) return { ok: false, message: "Administrator or Operations access is required to assign a delivery." };
    return createAssignment(orderId, driverId, "Assigned");
  };

  const taskForActor = (orderId: string) => {
    const task = taskForOrder(orderId);
    if (!task || !currentUser) return undefined;
    if (canManage || task.driverId === currentUser.id) return task;
    return undefined;
  };

  const prepareDelivery = (orderId: string): MutationResult => {
    const task = taskForActor(orderId);
    if (!task || task.status !== "Accepted") return { ok: false, message: "Claim or assign the delivery before packing it." };
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, message: "Order not found." };
    if (order.status === "Allocated") return { ok: true };
    if (order.status !== "Approved") return { ok: false, message: "Only an approved order can be packed." };
    if (!inventory.prepareOrderForDelivery(orderId)) return { ok: false, message: "The full SKU mix is not available in sellable warehouse inventory. No partial packing was saved." };
    return { ok: true };
  };

  const markLoaded = (orderId: string): MutationResult => {
    const task = taskForActor(orderId);
    if (!task || task.status !== "Accepted") return { ok: false, message: "Accept or assign the delivery before loading it." };
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return { ok: false, message: "Order not found." };
    if (order.status !== "Allocated") return { ok: false, message: "Warehouse must reserve and allocate the full order before the driver can load it." };
    if (!inventory.loadOrderForDelivery(orderId, task.driverId)) return { ok: false, message: "The reserved inventory could not be transferred into driver custody. Check the allocation and lot balances." };
    const stamp = now();
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Loaded", loadedAt: stamp }, { type: "Loaded", actorId: currentUser!.id }) : item) }));
    return { ok: true };
  };

  const startDelivery = (orderId: string): MutationResult => {
    const task = taskForActor(orderId);
    if (!task || task.status !== "Loaded") return { ok: false, message: "The order must be loaded before departure." };
    if (!inventory.startOrderDelivery(orderId, task.driverId)) return { ok: false, message: "Momentum could not start the delivery. Confirm all cases are in driver custody." };
    const stamp = now();
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "In transit", departedAt: stamp }, { type: "Departed", actorId: currentUser!.id }) : item) }));
    return { ok: true };
  };

  const markDelivered = (orderId: string, note?: string): MutationResult => {
    const task = taskForActor(orderId);
    if (!task || task.status !== "In transit") return { ok: false, message: "The delivery must be in transit before it can be completed." };
    if (!inventory.completeOrderDelivery(orderId, task.driverId)) return { ok: false, message: "Delivery inventory could not be posted. Confirm the driver has the full order in custody." };
    const stamp = now();
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Delivered", deliveredAt: stamp, note: note?.trim() || item.note }, { type: "Delivered", actorId: currentUser!.id, note: note?.trim() || undefined }) : item) }));
    return { ok: true };
  };

  const addDeliveryNote = (orderId: string, note: string): MutationResult => {
    const task = taskForActor(orderId);
    if (!task || !note.trim()) return { ok: false, message: "Enter a delivery note." };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, note: note.trim() }, { type: "Note", actorId: currentUser!.id, note: note.trim() }) : item) }));
    return { ok: true };
  };

  const cancelDelivery = (orderId: string, reason: string): MutationResult => {
    if (!currentUser || reason.trim().length < 3) return { ok: false, message: "Enter a reason to release or cancel the delivery assignment." };
    const task = taskForOrder(orderId);
    const ownAccepted = Boolean(isDriver && task?.driverId === currentUser.id && task.status === "Accepted");
    if (!canManage && !ownAccepted) return { ok: false, message: "Only management or the driver holding an unstarted assignment can release it." };
    if (!task || ["Loaded", "In transit", "Delivered"].includes(task.status)) return { ok: false, message: "A loaded, in-transit, or delivered task cannot be released here." };
    const stamp = now();
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id }, { type: "Cancelled", actorId: currentUser.id, note: reason.trim() }) : item) }));
    return { ok: true };
  };

  const resetDelivery = () => {
    if (runtime.isDemo && currentUser?.role === "Administrator") setState(createDeliverySeed());
  };

  return <DeliveryContext.Provider value={{ state, taskForOrder, claimDelivery, assignDelivery, cancelDelivery, prepareDelivery, markLoaded, startDelivery, markDelivered, addDeliveryNote, resetDelivery }}>{children}</DeliveryContext.Provider>;
}

export function useDelivery() {
  const value = useContext(DeliveryContext);
  if (!value) throw new Error("useDelivery must be used inside DeliveryProvider");
  return value;
}
