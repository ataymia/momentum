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
const normalizeSignature = (value: unknown, task: DeliveryTask): DeliverySignature | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const signature = value as Partial<DeliverySignature>;
  // Delivery proof survives staff separation or a restricted user directory.
  // Match it to the recorded Delivered event rather than today's roster.
  const recorded = task.history.some((event) =>
    event.type === "Delivered" &&
    event.actorId === signature.capturedBy &&
    validInstant(event.at) && validInstant(signature.signedAt) &&
    Math.abs(new Date(event.at).getTime() -
      new Date(signature.signedAt!).getTime()) <= 60_000);
  if (!validInstant(signature.signedAt) || !signature.capturedBy || !recorded ||
      !Array.isArray(signature.strokes)) return undefined;
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

/** Verify the cloud-refreshed signed delivery matches the user's captured strokes.
 * Never use cached "Delivered" state or an unsigned inventory posting as proof.
 */
export function signedDeliveryCloudConfirmed(
  deliveryRaw: string | null,
  commercialRaw: string | null,
  inventoryRaw: string | null,
  orderId: string,
  capturedStrokes: DeliverySignaturePoint[][],
): boolean {
  if (!deliveryRaw || !commercialRaw || !inventoryRaw || !orderId ||
      capturedStrokes.length === 0) return false;
  try {
    const saved = JSON.parse(deliveryRaw) as Partial<DeliveryState>;
    if (!Array.isArray(saved.tasks)) return false;
    const task = saved.tasks.find((item) => item?.orderId === orderId);
    if (!task || task.status !== "Delivered" || !validInstant(task.deliveredAt) ||
        !Array.isArray(task.history)) return false;
    const signature = normalizeSignature(task.signature, task);
    if (!signature || JSON.stringify(signature.strokes) !==
      JSON.stringify(capturedStrokes.filter((stroke) => stroke.length >= 2))) return false;
    const commercial = JSON.parse(commercialRaw) as {orders?: Array<{id:string;status:string;cases:number}>};
    const order = commercial.orders?.find((item) => item.id === orderId);
    if (!order || !["Delivered", "Paid"].includes(order.status) ||
        !Number.isInteger(order.cases) || order.cases < 1) return false;
    const ledger = JSON.parse(inventoryRaw) as {
      movements?: Array<{relatedOrderId?:string;type?:string;quantity?:number}>;
    };
    const delivered = ledger.movements?.filter((item) =>
      item.relatedOrderId === orderId && item.type === "Delivery").reduce((total,item) =>
      total + (typeof item.quantity === "number" && Number.isFinite(item.quantity) ?
        item.quantity : 0), 0) ?? 0;
    return delivered >= order.cases;
  } catch { return false; }
}

export function normalizeDeliveryState(input: unknown, data: WorkspaceData): DeliveryState {
  if (!input || typeof input !== "object") return createDeliverySeed();
  const raw = input as Partial<DeliveryState>;
  if (raw.version !== 1 || !Array.isArray(raw.tasks)) return createDeliverySeed();
  const orderIds = new Set(data.orders.map((order) => order.id));
  const driverIds = new Set(data.users.filter((user) => user.role === "Delivery Driver").map((user) => user.id));
  // Rep deliveries are server-written and valid only on their own orders.
  // Admin/Operations must retain these tasks on every normalization cycle.
  const repIds = new Set(data.users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
  const ownerByOrder = new Map(data.orders.map((order) => [order.id, order.ownerId]));
  const userIds = new Set(data.users.map((user) => user.id));
  const seenTasks = new Set<string>();
  const seenOrders = new Set<string>();
  const tasks = raw.tasks.filter((task): task is DeliveryTask => {
    if (!task || typeof task !== "object" || !task.id || seenTasks.has(task.id) || seenOrders.has(task.orderId)) return false;
    if (!orderIds.has(task.orderId) ||
        (!driverIds.has(task.driverId) &&
         !(ownerByOrder.get(task.orderId) === task.driverId &&
           (repIds.has(task.driverId) || !data.users.some((user) => user.id === task.driverId)) &&
           task.acceptedBy === task.driverId) &&
         task.status !== "Delivered") ||
        !statusValues.has(task.status)) return false;
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
    signature: normalizeSignature(task.signature, task),
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
