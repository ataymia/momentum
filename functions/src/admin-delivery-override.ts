import {randomUUID} from "node:crypto";
import {getFirestore} from "firebase-admin/firestore";
import {overrideSourceAvailable} from "./admin-delivery-inventory";

type Entry = {lotId: string; fromNodeId: string; quantity: number};
type BusinessRecord = Record<string, unknown>;
type OverrideResult = {
  orderId: string;
  deliveredAt: string;
  movementIds: string[];
};

const isObject = (value: unknown): value is BusinessRecord =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const txt = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" &&
    Number.isFinite(value) ? value : 0;
const items = (doc: BusinessRecord | undefined): BusinessRecord[] =>
  Array.isArray(doc?.items) ? doc.items.filter(isObject) : [];
const key = (value: string) => value.trim().toLowerCase();

export class DeliveryOverrideError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const fail = (status: number, message: string): never => {
  throw new DeliveryOverrideError(status, message);
};

export async function commitAdminDeliveryOverride(
  actorId: string,
  body: unknown,
): Promise<OverrideResult> {
  if (!isObject(body)) return fail(400, "Delivery details are missing.");
  const orderId = txt(body.orderId);
  const reason = txt(body.reason);
  const performedBy = txt(body.performedBy);
  const deliveredAt = txt(body.deliveredAt);
  const stamp = new Date().toISOString();
  const date = Date.parse(deliveredAt);

  if (!orderId || reason.length < 5 || reason.length > 500 ||
      !performedBy || !Number.isFinite(date) ||
      date > Date.now() + 300000) {
    return fail(400, "Enter an eligible order, actual delivery time, " +
      "who delivered it, and a clear reason.");
  }
  if (!Array.isArray(body.allocations) || !body.allocations.length ||
      body.allocations.length > 100) {
    return fail(400, "Choose the inventory lots and source locations " +
      "actually delivered.");
  }

  const allocations: Entry[] = [];
  for (const raw of body.allocations) {
    if (!isObject(raw) || !txt(raw.lotId) || !txt(raw.fromNodeId) ||
        !Number.isInteger(raw.quantity) || number(raw.quantity) <= 0) {
      return fail(400, "Each lot needs a source and a positive " +
        "whole-case quantity.");
    }
    allocations.push({
      lotId: txt(raw.lotId),
      fromNodeId: txt(raw.fromNodeId),
      quantity: number(raw.quantity),
    });
  }

  const firestore = getFirestore();
  const prefix = "domains/";
  const commercialRef = firestore.doc(prefix + "commercial/fields/orders");
  const workspaceRef = firestore.doc(prefix + "workspace/fields/orders");
  const accountsRef = firestore.doc(prefix + "workspace/fields/accounts");
  const workspaceLotsRef = firestore.doc(prefix + "workspace/fields/inventory");
  const extraLotsRef = firestore.doc(prefix + "commercial/fields/inventoryLots");
  const movementsRef = firestore.doc(prefix + "inventoryLedger/fields/movements");
  const nodesRef = firestore.doc(prefix + "inventoryLedger/fields/nodes");
  const reservationsRef = firestore.doc(
    prefix + "inventoryLedger/fields/reservations");
  const tasksRef = firestore.doc(prefix + "delivery/fields/tasks");
  const overridesRef = firestore.doc(prefix + "delivery/fields/overrides");
  const activityRef = firestore.doc(prefix + "commercial/fields/activities");
  const auditRef = firestore.collection("adminDeliveryOverrides").doc(orderId);
  const metaRef = firestore.doc("platform/meta");

  return firestore.runTransaction(async (tx) => {
    const [
      commercialSnap, workspaceSnap, accountsSnap, workspaceLotsSnap,
      extraLotsSnap, movementsSnap, nodesSnap, reservationsSnap,
      tasksSnap, overridesSnap, activitySnap, auditSnap,
    ] = await Promise.all([
      tx.get(commercialRef), tx.get(workspaceRef), tx.get(accountsRef),
      tx.get(workspaceLotsRef), tx.get(extraLotsRef), tx.get(movementsRef),
      tx.get(nodesRef), tx.get(reservationsRef), tx.get(tasksRef),
      tx.get(overridesRef), tx.get(activityRef), tx.get(auditRef),
    ]);

    if (auditSnap.exists) {
      return fail(409, "This order already has an admin delivery override.");
    }

    const commercialOrders = items(commercialSnap.data());
    const workspaceOrders = items(workspaceSnap.data());
    const order = commercialOrders.find((row) => txt(row.id) === orderId) ??
      workspaceOrders.find((row) => txt(row.id) === orderId);
    if (!order) return fail(404, "Order not found in the shared register.");
    const status = txt(order.status);
    if (!["Approved", "Allocated", "Out for delivery", "Paid"].includes(status)) {
      return fail(409, "Only approved or fulfillment-stage orders qualify.");
    }
    const placedAt = Date.parse(txt(order.placedAt));
    if (Number.isFinite(placedAt) && date < placedAt) {
      return fail(400, "Delivery cannot predate order placement.");
    }

    const accountId = txt(order.accountId);
    const account = items(accountsSnap.data()).find(
      (row) => txt(row.id) === accountId);
    if (!account) return fail(409, "The customer location is missing.");

    const expected = new Map<string, number>();
    const lines = Array.isArray(order.lines) && order.lines.length ?
      order.lines.filter(isObject) : [{
        product: order.product,
        cases: order.cases,
      } as BusinessRecord];
    for (const line of lines) {
      const product = key(txt(line.product));
      const quantity = number(line.cases);
      if (!product || !Number.isInteger(quantity) || quantity <= 0) {
        return fail(409, "Order SKU lines are incomplete.");
      }
      expected.set(product, (expected.get(product) ?? 0) + quantity);
    }

    const lots = new Map<string, BusinessRecord>();
    for (const lot of [
      ...items(workspaceLotsSnap.data()),
      ...items(extraLotsSnap.data()),
    ]) lots.set(txt(lot.id), lot);

    const nodes = items(nodesSnap.data());
    const sourceNodes = new Map(nodes.map((node) => [txt(node.id), node]));
    const movements = items(movementsSnap.data());
    const reservations = items(reservationsSnap.data());
    if (movements.some((row) => txt(row.relatedOrderId) === orderId &&
        txt(row.type) === "Delivery")) {
      return fail(409, "Delivery inventory was already posted for this order.");
    }
    if (!movements.length) {
      return fail(409, "The movement ledger is empty. Reconcile stock first.");
    }
    const customerNodeId = "node-account-" + accountId;
    const customerNode = sourceNodes.get(customerNodeId);
    if (customerNode && txt(customerNode.type) !== "Customer") {
      return fail(409, "The customer's custody node is invalid.");
    }
    const nextNodes = customerNode ? nodes : [...nodes, {
      id: customerNodeId,
      name: (txt(account.locationName) || txt(account.name)) +
        " customer location",
      type: "Customer",
      active: true,
      accountId,
    }];

    const observed = new Map<string, number>();
    const additions: BusinessRecord[] = [];
    const working = movements.slice();
    for (const entry of allocations) {
      const lot = lots.get(entry.lotId);
      const source = sourceNodes.get(entry.fromNodeId);
      if (!lot || txt(lot.status) === "Quality hold" ||
          !source || source.active !== true ||
          !["Warehouse", "Vehicle", "Bin", "Employee custody"].includes(
            txt(source.type))) {
        return fail(409, "Selected inventory lot or stock source is ineligible.");
      }
      const product = key(txt(lot.product));
      if (!expected.has(product)) {
        return fail(409, "Selected inventory lot does not match the order SKU.");
      }
      if (!overrideSourceAvailable(
        working, reservations, entry, txt(source.type), orderId)) {
        return fail(409, "The stock source lacks uncommitted, order-linked " +
          "cases. Protect other orders' reservations and custody first.");
      }
      observed.set(product, (observed.get(product) ?? 0) + entry.quantity);
      const movement: BusinessRecord = {
        id: "admin-delivery-" + randomUUID(),
        lotId: entry.lotId,
        product: txt(lot.product),
        quantity: entry.quantity,
        type: "Delivery",
        fromNodeId: entry.fromNodeId,
        toNodeId: customerNodeId,
        relatedOrderId: orderId,
        reason: "Admin delivery override: " + reason,
        at: deliveredAt,
        actorId,
      };
      additions.push(movement);
      working.push(movement);
    }
    if ([...expected].some(([sku, cases]) => observed.get(sku) !== cases) ||
        observed.size !== expected.size) {
      return fail(409, "Delivered quantities must match every ordered SKU.");
    }

    const override = {
      id: "admin-override-" + randomUUID(),
      orderId,
      actorId,
      recordedAt: stamp,
      deliveredAt,
      performedBy,
      reason,
      movementIds: additions.map((row) => txt(row.id)),
      kind: "Admin override",
      status: "Delivered",
    };
    const markDelivered = (row: BusinessRecord): BusinessRecord => ({
      ...row,
      status: "Delivered",
      paymentStatus: txt(row.paymentStatus) === "Not invoiced" ?
        "Open" : row.paymentStatus,
    });
    const touched = [
      movementsRef.path,
      overridesRef.path,
      commercialRef.path,
      activityRef.path,
    ];
    tx.set(movementsRef, {items: [...additions, ...movements]});
    tx.set(overridesRef, {
      items: [override, ...items(overridesSnap.data())],
    });
    if (!customerNode) {
      tx.set(nodesRef, {items: nextNodes});
      touched.push(nodesRef.path);
    }
    if (commercialOrders.some((row) => txt(row.id) === orderId)) {
      tx.set(commercialRef, {
        items: commercialOrders.map((row) =>
          txt(row.id) === orderId ? markDelivered(row) : row),
      });
    } else {
      tx.set(workspaceRef, {
        items: workspaceOrders.map((row) =>
          txt(row.id) === orderId ? markDelivered(row) : row),
      });
      touched.splice(touched.indexOf(commercialRef.path), 1);
      touched.push(workspaceRef.path);
    }

    const tasks = items(tasksSnap.data());
    const existingTask = tasks.find((row) =>
      txt(row.orderId) === orderId && txt(row.status) !== "Cancelled");
    if (existingTask) {
      if (txt(existingTask.status) === "Delivered") {
        return fail(409, "The driver already completed this delivery.");
      }
      const closed = {
        ...existingTask,
        status: "Cancelled",
        cancelledAt: stamp,
        cancelledBy: actorId,
        note: "Off-route delivery completed: " + reason,
        history: [
          ...(Array.isArray(existingTask.history) ?
            existingTask.history : []),
          {
            id: "admin-close-" + randomUUID(),
            type: "Cancelled",
            at: stamp,
            actorId,
            note: "Administrative override ended assigned driver route: " +
              reason,
          },
        ],
      };
      tx.set(tasksRef, {
        items: tasks.map((row) =>
          txt(row.id) === txt(existingTask.id) ? closed : row),
      });
      touched.push(tasksRef.path);
    }

    if (reservations.some((row) =>
      txt(row.orderId) === orderId && txt(row.status) === "Active")) {
      tx.set(reservationsRef, {
        items: reservations.map((row) =>
          txt(row.orderId) === orderId && txt(row.status) === "Active" ? {
            ...row,
            status: "Fulfilled",
            fulfilledAt: stamp,
          } : row),
      });
      touched.push(reservationsRef.path);
    }

    tx.set(activityRef, {
      items: [{
        id: "act-admin-delivery-" + randomUUID(),
        accountId,
        type: "order",
        title: "Administrative delivery override",
        detail: "Order " + txt(order.number) + " delivered by " +
          performedBy + ". Approved by Administrator. Reason: " + reason,
        at: stamp,
        userId: actorId,
      }, ...items(activitySnap.data())],
    });
    tx.create(auditRef, override);

    const version = stamp + "#" + randomUUID().slice(0, 6);
    const versions: Record<string, string> = {};
    for (const path of touched) {
      versions[path.replace(/[^A-Za-z0-9]+/g, "_")] = version;
    }
    tx.set(metaRef, {versions}, {merge: true});
    return {orderId, deliveredAt, movementIds: override.movementIds};
  });
}
