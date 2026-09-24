import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {onRequest} from "firebase-functions/v2/https";

const ORDER_COLLECTION = "orderRecords";
const ACCESS_COLLECTION = "userAccess";
const DIRECTORY_COLLECTION = "employeeDirectory";
const ACTIVE = "Active";
const SUBMIT_ROLES = new Set([
  "Administrator",
  "Sales Manager",
  "Sales Representative",
  "Customer",
]);
const ALL_ORDER_ROLES = new Set([
  "Administrator",
  "Operations",
  "Warehouse",
]);
const PROCESSED_STATUSES = new Set([
  "Approved",
  "Allocated",
  "Out for delivery",
  "Delivered",
  "Paid",
]);
const ORDER_STATUSES = new Set([
  "Awaiting approval",
  "Approved",
  "Allocated",
  "Out for delivery",
  "Delivered",
  "Paid",
  "Draft",
]);
const PAYMENT_STATUSES = new Set([
  "Not invoiced",
  "Open",
  "Partially paid",
  "Paid",
]);
const PRODUCTS = new Set([
  "0.25L (8.4oz) Golden Eagle Energy Drink (24pack)",
  "0.25L (8.4oz) Golden Eagle SugarFree (24pack)",
  "0.25L (8.4oz) Golden Eagle Tropical Edition (24pack)",
  "0.25L (8.4oz) Golden Eagle RED Edition (24pack)",
  "0.25L (8.4oz) Golden Eagle Blue (Zero) Edition (24pack)",
  "0.25L (8.4oz) Golden Eagle Strawberry Edition (24pack)",
]);

type RequestLike = {headers: {authorization?: string}};
type Caller = {
  uid: string;
  role: string;
  team: string;
  managerId?: string;
  managedTeams: string[];
  name: string;
  accountIds: string[];
};
type JsonResponse = {
  status: (code: number) => {json: (body: unknown) => unknown};
};
type Raw = Record<string, unknown>;

type DurableRecord = {
  version: 1;
  order: Raw;
  approval: Raw;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const positiveInt = (value: unknown) =>
  Number.isInteger(value) && Number(value) > 0;
const finitePositive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNonnegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const object = (value: unknown): value is Raw =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const isoDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isoInstant = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const send = (response: JsonResponse, status: number, body: unknown) => {
  response.status(status).json(body);
};

async function callerFor(request: RequestLike): Promise<Caller | null> {
  const authorization = request.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ?
    authorization.slice("Bearer ".length).trim() : "";
  if (!token) return null;
  let uid = "";
  try {
    uid = (await getAuth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
  const db = getFirestore();
  const [accessSnapshot, directorySnapshot] = await Promise.all([
    db.collection(ACCESS_COLLECTION).doc(uid).get(),
    db.collection(DIRECTORY_COLLECTION).doc(uid).get(),
  ]);
  if (!accessSnapshot.exists) return null;
  const access = accessSnapshot.data() ?? {};
  if (access.accountState !== ACTIVE || typeof access.role !== "string") return null;
  const directory = directorySnapshot.data() ?? {};
  return {
    uid,
    role: text(access.role),
    team: text(access.team),
    managerId: text(access.managerId) || undefined,
    managedTeams: Array.isArray(access.managedTeams) ?
      access.managedTeams.filter((item): item is string => typeof item === "string") : [],
    name: text(directory.name) || text(access.email) || uid,
    accountIds: Array.isArray(directory.accountIds) ?
      directory.accountIds.filter((item): item is string => typeof item === "string") : [],
  };
}

async function accountAllowed(caller: Caller, accountId: string) {
  if (caller.role === "Administrator") return true;
  if (caller.role === "Customer") return caller.accountIds.includes(accountId);
  if (caller.role === "Sales Manager") {
    const accessSnapshots = await getFirestore().collection(ACCESS_COLLECTION).get();
    const managed = new Set<string>([caller.uid]);
    for (const snapshot of accessSnapshots.docs) {
      const data = snapshot.data();
      if (
        snapshot.id === caller.uid ||
        data.managerId === caller.uid ||
        (typeof data.team === "string" && caller.managedTeams.includes(data.team))
      ) managed.add(snapshot.id);
    }
    const owner = await effectiveAccountOwner(accountId);
    return !owner || managed.has(owner);
  }
  if (caller.role === "Sales Representative") {
    const owner = await effectiveAccountOwner(accountId);
    return !owner || owner === caller.uid;
  }
  return false;
}

async function effectiveAccountOwner(accountId: string): Promise<string | null> {
  const db = getFirestore();
  const [accountsSnapshot, commercialRoot] = await Promise.all([
    db.doc("domains/workspace/fields/accounts").get(),
    db.doc("domains/commercial/fields/_root").get(),
  ]);
  const accountItems = accountsSnapshot.data()?.items;
  const account = Array.isArray(accountItems) ?
    accountItems.find((item) => object(item) && item.id === accountId) as Raw | undefined : undefined;
  if (!account) return null;
  const patches = commercialRoot.data()?.data;
  const accountPatches = object(patches) && object(patches.accountPatches) ?
    patches.accountPatches : undefined;
  const patch = accountPatches && object(accountPatches[accountId]) ?
    accountPatches[accountId] : undefined;
  return text(patch?.ownerId) || text(account.ownerId) || null;
}

function validateSubmission(rawOrder: unknown, rawApproval: unknown) {
  if (!object(rawOrder) || !object(rawApproval)) return "Order payload is malformed.";
  const lines = rawOrder.lines;
  if (!text(rawOrder.id) || !text(rawOrder.number) || !text(rawOrder.accountId)) {
    return "Order identity is incomplete.";
  }
  if (!Array.isArray(lines) || lines.length < 1) return "At least one SKU line is required.";
  if (!positiveInt(rawOrder.cases) || !finitePositive(rawOrder.pricePerCase) ||
      !finiteNonnegative(rawOrder.amount) || !isoDate(rawOrder.placedAt)) {
    return "Order quantity, pricing, or date is invalid.";
  }
  if (rawOrder.status !== "Awaiting approval" || rawOrder.paymentStatus !== "Not invoiced") {
    return "New orders must enter the approval queue before fulfillment or payment.";
  }
  let cases = 0;
  let amount = 0;
  for (const line of lines) {
    if (!object(line) || !text(line.id) || !PRODUCTS.has(text(line.product)) ||
        !positiveInt(line.cases) || !finitePositive(line.pricePerCase) ||
        !finiteNonnegative(line.amount)) {
      return "One or more SKU lines are invalid.";
    }
    const expected = Number(line.cases) * Number(line.pricePerCase);
    if (Math.abs(Number(line.amount) - expected) > 0.01) {
      return "A SKU line amount does not match quantity times price.";
    }
    if (Math.abs(Number(line.pricePerCase) - Number(rawOrder.pricePerCase)) > 0.001) {
      return "All SKU lines must use the order's authorized case price.";
    }
    cases += Number(line.cases);
    amount += Number(line.amount);
  }
  if (cases !== Number(rawOrder.cases) || Math.abs(amount - Number(rawOrder.amount)) > 0.01) {
    return "Order totals do not match the submitted SKU lines.";
  }
  if (rawApproval.status !== "Pending" ||
      !["Order", "Low stock sale"].includes(text(rawApproval.type)) ||
      text(rawApproval.recordId) !== text(rawOrder.id) ||
      !isoInstant(rawApproval.submittedAt) || !isoInstant(rawApproval.dueAt)) {
    return "Approval payload is malformed.";
  }
  return null;
}

function normalizedSubmission(caller: Caller, order: Raw, approval: Raw): DurableRecord {
  const now = new Date().toISOString();
  const ownerId = caller.uid;
  const normalizedOrder: Raw = {
    ...order,
    ownerId,
    ...(caller.role === "Sales Representative" ? {creditedRepId: caller.uid} : {}),
    status: "Awaiting approval",
    paymentStatus: "Not invoiced",
  };
  const normalizedApproval: Raw = {
    ...approval,
    requesterId: caller.uid,
    requestedBy: caller.name,
    team: caller.role === "Customer" ? "Sales" : caller.team,
    recordId: text(order.id),
    status: "Pending",
    decidedBy: null,
    decidedAt: null,
    returnReason: null,
  };
  return {
    version: 1,
    order: normalizedOrder,
    approval: normalizedApproval,
    createdAt: now,
    createdBy: caller.uid,
    updatedAt: now,
  };
}

function recordVisible(caller: Caller, record: DurableRecord, managedIds: Set<string>) {
  const order = record.order;
  if (ALL_ORDER_ROLES.has(caller.role)) return true;
  if (caller.role === "Delivery Driver") return PROCESSED_STATUSES.has(text(order.status));
  if (caller.role === "Sales Manager") return managedIds.has(text(order.ownerId));
  return text(order.ownerId) === caller.uid;
}

export const submitOrder = onRequest(
  {cors: true, region: "us-central1"},
  async (request, response) => {
    if (request.method !== "POST") {
      send(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }
    const caller = await callerFor(request);
    if (!caller || !SUBMIT_ROLES.has(caller.role)) {
      send(response, 403, {ok: false, message: "This account cannot submit orders."});
      return;
    }
    const problem = validateSubmission(request.body?.order, request.body?.approval);
    if (problem) {
      send(response, 400, {ok: false, message: problem});
      return;
    }
    const order = request.body.order as Raw;
    const approval = request.body.approval as Raw;
    if (!(await accountAllowed(caller, text(order.accountId)))) {
      send(response, 403, {ok: false, message: "That account is outside your current order scope."});
      return;
    }
    const record = normalizedSubmission(caller, order, approval);
    const ref = getFirestore().collection(ORDER_COLLECTION).doc(text(order.id));
    try {
      await ref.create(record);
      send(response, 201, {ok: true, record});
    } catch (error) {
      const code = object(error) ? text(error.code) : "";
      if (code.includes("already-exists") || code === "6") {
        const existing = await ref.get();
        const value = existing.data() as DurableRecord | undefined;
        if (value?.createdBy === caller.uid && value.order.number === order.number) {
          send(response, 200, {ok: true, record: value});
          return;
        }
        send(response, 409, {ok: false, message: "That order identifier already exists."});
        return;
      }
      console.error("submitOrder failed", error);
      send(response, 500, {ok: false, message: "The order could not be durably stored. Nothing was submitted."});
    }
  },
);

export const listOrders = onRequest(
  {cors: true, region: "us-central1"},
  async (request, response) => {
    if (request.method !== "POST") {
      send(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }
    const caller = await callerFor(request);
    if (!caller) {
      send(response, 401, {ok: false, message: "Sign in again."});
      return;
    }
    if (caller.role === "Brand Ambassador") {
      send(response, 200, {ok: true, records: []});
      return;
    }
    const managedIds = new Set<string>([caller.uid]);
    if (caller.role === "Sales Manager") {
      const snapshots = await getFirestore().collection(ACCESS_COLLECTION).get();
      for (const snapshot of snapshots.docs) {
        const data = snapshot.data();
        if (
          data.managerId === caller.uid ||
          (typeof data.team === "string" && caller.managedTeams.includes(data.team))
        ) managedIds.add(snapshot.id);
      }
    }
    const snapshot = await getFirestore().collection(ORDER_COLLECTION).get();
    const records = snapshot.docs
      .map((doc) => doc.data() as DurableRecord)
      .filter((record) => record?.version === 1 && object(record.order) && object(record.approval))
      .filter((record) => recordVisible(caller, record, managedIds))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    send(response, 200, {ok: true, records});
  },
);

export const decideOrder = onRequest(
  {cors: true, region: "us-central1"},
  async (request, response) => {
    if (request.method !== "POST") {
      send(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }
    const caller = await callerFor(request);
    if (!caller || caller.role !== "Administrator") {
      send(response, 403, {ok: false, message: "Only an active Administrator can decide an order."});
      return;
    }
    const orderId = text(request.body?.orderId);
    const decision = text(request.body?.decision);
    const returnReason = text(request.body?.returnReason);
    if (!orderId || !["Approved", "Returned"].includes(decision) ||
        (decision === "Returned" && returnReason.length < 3)) {
      send(response, 400, {ok: false, message: "Decision payload is incomplete."});
      return;
    }
    const ref = getFirestore().collection(ORDER_COLLECTION).doc(orderId);
    try {
      const record = await getFirestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new Error("ORDER_NOT_FOUND");
        const current = snapshot.data() as DurableRecord;
        const currentStatus = text(current.approval.status);
        if (currentStatus !== "Pending") {
          if (currentStatus === decision) return current;
          throw new Error("ORDER_ALREADY_DECIDED");
        }
        const at = new Date().toISOString();
        const next: DurableRecord = {
          ...current,
          order: {
            ...current.order,
            status: decision === "Approved" ? "Approved" : "Draft",
          },
          approval: {
            ...current.approval,
            status: decision,
            decidedBy: caller.uid,
            decidedAt: at,
            ...(decision === "Returned" ? {returnReason} : {returnReason: null}),
          },
          updatedAt: at,
        };
        transaction.set(ref, next);
        return next;
      });
      send(response, 200, {ok: true, record});
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "ORDER_NOT_FOUND") {
        send(response, 404, {ok: false, message: "The durable order record was not found."});
        return;
      }
      if (code === "ORDER_ALREADY_DECIDED") {
        send(response, 409, {ok: false, message: "This order already has a final Administrator decision."});
        return;
      }
      console.error("decideOrder failed", error);
      send(response, 500, {ok: false, message: "The order decision could not be stored."});
    }
  },
);
