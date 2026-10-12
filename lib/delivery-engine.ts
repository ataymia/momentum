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

export type DeliverySignaturePoint = [number, number];
export type DeliverySignatureDraft = {
  strokes: DeliverySignaturePoint[][];
  recipientName?: string;
};
export type DeliverySignature = DeliverySignatureDraft & {
  signedAt: string;
  capturedBy: string;
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
  signature?: DeliverySignature;
  history: DeliveryEvent[];
};

export type AdminDeliveryOverride = {
  id:string;orderId:string;actorId:string;recordedAt:string;deliveredAt:string;
  performedBy?:string;reason:string;movementIds:string[];
  kind:"Admin override";status:"Delivered";
};
export type DeliveryState = { version: 1; tasks: DeliveryTask[]; overrides: AdminDeliveryOverride[] };

const statusValues = new Set<DeliveryTaskStatus>(["Accepted", "Loaded", "In transit", "Delivered", "Cancelled"]);
const eventTypes = new Set<DeliveryEventType>(["Accepted", "Assigned", "Loaded", "Departed", "Delivered", "Cancelled", "Payment collected", "Note"]);
const paymentMethods = new Set<PaymentMethod>(["Card", "ACH", "Wire", "Cash", "Check", "Other"]);
const validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const finitePositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
const finitePoint = (value: unknown): value is DeliverySignaturePoint => Array.isArray(value) && value.length === 2 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) && value[0] >= 0 && value[0] <= 1000 && value[1] >= 0 && value[1] <= 300;
const normalizeSignature = (value: unknown, userIds: Set<string>): DeliverySignature | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const signature = value as Partial<DeliverySignature>;
  if (!validInstant(signature.signedAt) || !signature.capturedBy || !userIds.has(signature.capturedBy) || !Array.isArray(signature.strokes)) return undefined;
  const strokes = signature.strokes
    .filter((stroke): stroke is DeliverySignaturePoint[] => Array.isArray(stroke) && stroke.length >= 2 && stroke.length <= 300 && stroke.every(finitePoint))
    .slice(0, 80);
  const totalPoints = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  if (!strokes.length || totalPoints > 1200) return undefined;
  return {
    strokes,
    recipientName: text(signature.recipientName) || undefined,
    signedAt: signature.signedAt!,
    capturedBy: signature.capturedBy,
  };
};

export const createDeliverySeed = (): DeliveryState => ({ version: 1, tasks: [], overrides: [] });

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
    signature: normalizeSignature(task.signature, userIds),
    history: task.history.map((event) => ({ ...event, note: text(event.note) || undefined })),
  }));
  const overrides=(Array.isArray(raw.overrides)?raw.overrides:[])
    .filter((item):item is AdminDeliveryOverride=>Boolean(item&&item.id&&item.orderId&&item.actorId&&item.reason?.trim()&&
      item.kind==="Admin override"&&item.status==="Delivered"&&validInstant(item.recordedAt)&&validInstant(item.deliveredAt)&&
      Array.isArray(item.movementIds)&&item.movementIds.length>0&&item.movementIds.every((id)=>typeof id==="string"&&id.trim())))
    .filter((item,index,items)=>items.findIndex((other)=>other.orderId===item.orderId)===index);
  return { version: 1, tasks, overrides };
}

export function deliveryStatusForOrder(state: DeliveryState, order: Order) {
  if(state.overrides?.some((entry)=>entry.orderId===order.id))return "Delivered";
  const task = deliveryTaskForOrder(state, order.id);
  if (task) return task.status;
  if (order.status === "Approved") return "Ready for packing";
  if (order.status === "Allocated") return "Packed / ready for driver";
  if (order.status === "Out for delivery") return "In transit";
  if (["Delivered", "Paid"].includes(order.status)) return "Delivered";
  return order.status;
}
