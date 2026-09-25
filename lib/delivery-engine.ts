import type { PaymentMethod } from "./commerce-engine";
import type { Order, WorkspaceData } from "./types";

export const DELIVERY_STORAGE_KEY = "momentum-delivery-v1";

export type DeliveryTaskStatus = "Accepted" | "Loaded" | "In transit" | "Delivered" | "Cancelled";
export type DeliveryEventType = "Accepted" | "Assigned" | "Loaded" | "Departed" | "Delivered" | "Cancelled" | "Payment collected" | "Note";

export type DeliveryEvent = {
  id: string;
  type: DeliveryEventType;
  at: string;
  actorId: string;
  note?: string;
};

export type DeliveryCollection = {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  recordedAt: string;
  recordedBy: string;
};

export type DeliveryTask = {
  id: string;
  orderId: string;
  driverId: string;
  status: DeliveryTaskStatus;
  acceptedAt: string;
  acceptedBy: string;
  loadedAt?: string;
  departedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  note?: string;
  collections?: DeliveryCollection[];
  history: DeliveryEvent[];
};

export type DeliveryState = { version: 1; tasks: DeliveryTask[] };

const statusValues = new Set<DeliveryTaskStatus>(["Accepted", "Loaded", "In transit", "Delivered", "Cancelled"]);
const eventTypes = new Set<DeliveryEventType>(["Accepted", "Assigned", "Loaded", "Departed", "Delivered", "Cancelled", "Payment collected", "Note"]);
const paymentMethods = new Set<PaymentMethod>(["Card", "ACH", "Wire", "Cash", "Check", "Other"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finitePositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

export const createDeliverySeed = (): DeliveryState => ({ version: 1, tasks: [] });

export function processedForDelivery(order: Order) {
  return ["Approved", "Allocated", "Out for delivery", "Delivered", "Paid"].includes(order.status);
}

export function deliveryTaskForOrder(state: DeliveryState, orderId: string) {
  return state.tasks.find((task) => task.orderId === orderId && task.status !== "Cancelled");
}

export function normalizeDeliveryState(input: unknown, data: WorkspaceData): DeliveryState {
  if (!input || typeof input !== "object") return createDeliverySeed();
  const raw = input as Partial<DeliveryState>;
  if (raw.version !== 1 || !Array.isArray(raw.tasks)) return createDeliverySeed();
  const orderIds = new Set(data.orders.map((order) => order.id));
  const driverIds = new Set(data.users.filter((user) => user.role === "Delivery Driver").map((user) => user.id));
  const userIds = new Set(data.users.map((user) => user.id));
  const seenTasks = new Set<string>();
  const seenOrders = new Set<string>();
  const tasks = raw.tasks.filter((task): task is DeliveryTask => {
    if (!task || typeof task !== "object" || !task.id || seenTasks.has(task.id) || seenOrders.has(task.orderId)) return false;
    if (!orderIds.has(task.orderId) || !driverIds.has(task.driverId) || !statusValues.has(task.status)) return false;
    if (!validInstant(task.acceptedAt) || !task.acceptedBy) return false;
    if (task.loadedAt && !validInstant(task.loadedAt)) return false;
    if (task.departedAt && !validInstant(task.departedAt)) return false;
    if (task.deliveredAt && !validInstant(task.deliveredAt)) return false;
    if (task.cancelledAt && !validInstant(task.cancelledAt)) return false;
    if (task.status === "Loaded" && !task.loadedAt) return false;
    if (task.status === "In transit" && (!task.loadedAt || !task.departedAt)) return false;
    if (task.status === "Delivered" && (!task.loadedAt || !task.departedAt || !task.deliveredAt)) return false;
    if (task.status === "Cancelled" && (!task.cancelledAt || !task.cancelledBy)) return false;
    if (!Array.isArray(task.history)) return false;
    if (!task.history.every((event) => event && event.id && eventTypes.has(event.type) && validInstant(event.at) && event.actorId)) return false;
    if (task.collections !== undefined && !Array.isArray(task.collections)) return false;
    if ((task.collections ?? []).some((collection) => !collection?.id || !finitePositive(collection.amount) || !paymentMethods.has(collection.method) || !validInstant(collection.recordedAt) || !userIds.has(collection.recordedBy) || (collection.method === "Check" && !text(collection.reference)))) return false;
    seenTasks.add(task.id);
    seenOrders.add(task.orderId);
    return true;
  }).map((task) => ({
    ...task,
    note: text(task.note) || undefined,
    collections: (task.collections ?? []).map((collection) => ({ ...collection, reference: text(collection.reference) || undefined })),
    history: task.history.map((event) => ({ ...event, note: text(event.note) || undefined })),
  }));
  return { version: 1, tasks };
}

export function deliveryStatusForOrder(state: DeliveryState, order: Order) {
  const task = deliveryTaskForOrder(state, order.id);
  if (task) return task.status;
  if (order.status === "Approved") return "Ready for packing";
  if (order.status === "Allocated") return "Packed / ready for driver";
  if (order.status === "Out for delivery") return "In transit";
  if (["Delivered", "Paid"].includes(order.status)) return "Delivered";
  return order.status;
}
