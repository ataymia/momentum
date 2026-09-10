import { addCalendarDays, isValidCalendarDateKey } from "./date-time";
import type { Account, Activity, Appointment, Approval, InventoryLot, Order, PricingTier, WorkspaceData } from "./types";

export type CommercialAccountPatch = Partial<Pick<Account, "premiseType" | "businessType" | "categoryReviewDate" | "pricingTier" | "pricingUpdatedAt" | "pricingUpdatedBy" | "ownerId" | "accountManagerId" | "responsibilityStartedAt" | "lastActivity" | "nextAction" | "nextActionDate" | "stage" | "closerId" | "lifetimeCases" | "reorderCount">>;
export type CommercialState = { version: 1; accountPatches: Record<string, CommercialAccountPatch>; orders: Order[]; appointments: Appointment[]; approvals: Approval[]; activities: Activity[]; inventoryLots: InventoryLot[] };

const premiseTypes = new Set(["On-premise", "Off-premise", "Hybrid", "Unclassified"]);
const pricingTiers = new Set(["A", "B", "C"]);
const accountStages = new Set(["Prospect", "Qualified", "Sampled", "Opening order", "Placed", "Reordered", "At risk"]);
const appointmentTypes = new Set(["First visit", "Sample drop", "Placement check", "Reorder", "Delivery"]);
const appointmentStatuses = new Set(["Scheduled", "Dispatched", "En route", "Arrived", "Completed", "Needs follow-up"]);
const appointmentOutcomes = new Set(["Order placed", "Follow-up scheduled", "Placement verified", "No decision", "Closed lost", "Delivery completed"]);
const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid"]);
const paymentStatuses = new Set(["Not invoiced", "Open", "Partially paid", "Paid"]);
const approvalTypes = new Set(["Order", "Low stock sale"]);
const approvalPriorities = new Set(["Normal", "High", "Urgent"]);
const approvalStatuses = new Set(["Pending", "Approved", "Returned"]);
const activityTypes = new Set(["call", "visit", "sample", "order", "placement", "note"]);
const inventoryStatuses = new Set(["Available", "Quality hold", "Low stock"]);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown) => text(value) || undefined;
const validDate = (value: unknown) => typeof value === "string" && isValidCalendarDateKey(value);
const validInstant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const validDateOrInstant = (value: unknown) => validDate(value) || validInstant(value);
const validTime = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const optionalValidDate = (value: unknown) => value === undefined || value === null || value === "" || validDate(value);
const optionalValidInstant = (value: unknown) => value === undefined || value === null || value === "" || validInstant(value);
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const wholePositive = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const wholeNonnegative = (value: unknown) => Number.isInteger(value) && Number(value) >= 0;
const uniqueById = <T extends { id: string }>(records: T[]) => { const seen = new Set<string>(); return records.filter((record) => !seen.has(record.id) && (seen.add(record.id), true)); };

function inferredTier(data: WorkspaceData, accountId: string): PricingTier | undefined {
  const price = data.orders.filter((order) => order.accountId === accountId && Number.isFinite(order.pricePerCase) && order.pricePerCase > 0).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0]?.pricePerCase;
  return price === 24 ? "A" : price === 27 ? "B" : price === 30 ? "C" : undefined;
}

export function seedCommercialState(data: WorkspaceData, todayKey: string): CommercialState {
  const accountPatches: Record<string, CommercialAccountPatch> = {};
  for (const account of data.accounts) accountPatches[account.id] = { premiseType: account.premiseType ?? "Unclassified", businessType: account.businessType ?? account.channel, categoryReviewDate: account.categoryReviewDate ?? addCalendarDays(todayKey, 90), pricingTier: account.pricingTier ?? inferredTier(data, account.id) };
  return { version: 1, accountPatches, orders: [], appointments: [], approvals: [], activities: [], inventoryLots: [] };
}

export function normalizeCommercialState(input: unknown, data: WorkspaceData, todayKey: string): CommercialState {
  const seed = seedCommercialState(data, todayKey);
  if (!object(input) || input.version !== 1) return seed;
  const accountIds = new Set(data.accounts.map((account) => account.id));
  const userById = new Map(data.users.map((user) => [user.id, user]));
  const internalSalesIds = new Set(data.users.filter((user) => ["Administrator", "Sales Manager", "Sales Representative"].includes(user.role)).map((user) => user.id));
  const salesRepIds = new Set(data.users.filter((user) => user.role === "Sales Representative").map((user) => user.id));
  const baseOrderIds = new Set(data.orders.map((record) => record.id));
  const baseAppointmentIds = new Set(data.appointments.map((record) => record.id));
  const baseApprovalIds = new Set(data.approvals.map((record) => record.id));
  const baseActivityIds = new Set(data.activities.map((record) => record.id));
  const baseInventoryIds = new Set(data.inventory.map((record) => record.id));
  const baseLotCodes = new Set(data.inventory.map((record) => record.lotCode.trim().toLowerCase()));
  const placementById = new Map(data.placements.map((placement) => [placement.id, placement]));
  const productNames = new Set(data.inventory.map((lot) => lot.product));

  const accountPatches: Record<string, CommercialAccountPatch> = { ...seed.accountPatches };
  if (object(input.accountPatches)) for (const [accountId, raw] of Object.entries(input.accountPatches)) {
    if (!accountIds.has(accountId) || !object(raw)) continue;
    const patch: CommercialAccountPatch = {};
    const premiseType = optionalText(raw.premiseType); if (premiseType && premiseTypes.has(premiseType)) patch.premiseType = premiseType as Account["premiseType"];
    const businessType = optionalText(raw.businessType); if (businessType) patch.businessType = businessType;
    if (validDate(raw.categoryReviewDate)) patch.categoryReviewDate = text(raw.categoryReviewDate);
    const pricingTier = optionalText(raw.pricingTier); if (pricingTier && pricingTiers.has(pricingTier)) patch.pricingTier = pricingTier as PricingTier;
    if (validInstant(raw.pricingUpdatedAt)) patch.pricingUpdatedAt = text(raw.pricingUpdatedAt);
    const pricingUpdatedBy = optionalText(raw.pricingUpdatedBy); if (pricingUpdatedBy && userById.has(pricingUpdatedBy)) patch.pricingUpdatedBy = pricingUpdatedBy;
    const ownerId = optionalText(raw.ownerId); if (ownerId && internalSalesIds.has(ownerId)) patch.ownerId = ownerId;
    const accountManagerId = optionalText(raw.accountManagerId); if (accountManagerId && internalSalesIds.has(accountManagerId)) patch.accountManagerId = accountManagerId;
    if (validInstant(raw.responsibilityStartedAt)) patch.responsibilityStartedAt = text(raw.responsibilityStartedAt);
    const lastActivity = optionalText(raw.lastActivity); if (lastActivity) patch.lastActivity = lastActivity;
    const nextAction = optionalText(raw.nextAction); if (nextAction) patch.nextAction = nextAction;
    if (validDate(raw.nextActionDate)) patch.nextActionDate = text(raw.nextActionDate);
    const stage = optionalText(raw.stage); if (stage && accountStages.has(stage)) patch.stage = stage as Account["stage"];
    const closerId = optionalText(raw.closerId); if (closerId && internalSalesIds.has(closerId)) patch.closerId = closerId;
    if (wholeNonnegative(raw.lifetimeCases)) patch.lifetimeCases = Number(raw.lifetimeCases);
    if (wholeNonnegative(raw.reorderCount)) patch.reorderCount = Number(raw.reorderCount);
    accountPatches[accountId] = { ...accountPatches[accountId], ...patch };
  }

  const rawOrders = Array.isArray(input.orders) ? input.orders : [];
  const orders = uniqueById(rawOrders.flatMap((raw): Order[] => {
    if (!object(raw)) return [];
    const id = text(raw.id); const accountId = text(raw.accountId); const ownerId = text(raw.ownerId); const status = text(raw.status); const paymentStatus = text(raw.paymentStatus); const product = text(raw.product); const cases = Number(raw.cases); const price = Number(raw.pricePerCase); const amount = Number(raw.amount);
    const owner = userById.get(ownerId);
    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountIds.has(accountId) || !owner || (owner.role === "Customer" && !(owner.accountIds ?? []).includes(accountId)) || !wholePositive(cases) || !finite(price) || price <= 0 || !finite(amount) || amount < 0 || Math.abs(amount - cases * price) > 0.01 || !orderStatuses.has(status) || !paymentStatuses.has(paymentStatus) || !validDateOrInstant(raw.placedAt) || !text(raw.priceBasis) || !product || !productNames.has(product) || !finite(raw.inventoryAvailableAtOrder) || Number(raw.inventoryAvailableAtOrder) < 0) return [];
    if (!optionalValidDate(raw.paidAt) || !optionalValidDate(raw.firstSettledAt)) return [];
    const creditedRepId = optionalText(raw.creditedRepId); if (creditedRepId && !salesRepIds.has(creditedRepId)) return [];
    const sourcePlacementId = optionalText(raw.sourcePlacementId); const placement = sourcePlacementId ? placementById.get(sourcePlacementId) : undefined;
    if (sourcePlacementId && (!placement || placement.accountId !== accountId || placement.product !== product)) return [];
    const settlementEvidence = optionalText(raw.firstSettledAt) || optionalText(raw.paidAt);
    const safePaymentStatus = paymentStatus === "Paid" && !settlementEvidence ? "Open" : paymentStatus;
    const safeStatus = status === "Paid" && safePaymentStatus !== "Paid" ? "Delivered" : status;
    return [{ id, number: text(raw.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(raw.placedAt), ownerId, paidAt: optionalText(raw.paidAt), firstSettledAt: optionalText(raw.firstSettledAt), priceBasis: text(raw.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product, creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: Number(raw.inventoryAvailableAtOrder), lowStockApprovalRequired: typeof raw.lowStockApprovalRequired === "boolean" ? raw.lowStockApprovalRequired : undefined }];
  }));
  const orderIds = new Set(orders.map((order) => order.id));

  const rawAppointments = Array.isArray(input.appointments) ? input.appointments : [];
  const appointments = uniqueById(rawAppointments.flatMap((raw): Appointment[] => {
    if (!object(raw)) return [];
    const id = text(raw.id); const accountId = text(raw.accountId); const ownerId = optionalText(raw.ownerId); const type = text(raw.type); const status = text(raw.status); const outcome = optionalText(raw.outcome);
    if (!id || baseAppointmentIds.has(id) || !accountIds.has(accountId) || (ownerId && !internalSalesIds.has(ownerId)) || !validDate(raw.date) || !validTime(raw.startTime) || !wholePositive(raw.duration) || !appointmentTypes.has(type) || !appointmentStatuses.has(status) || !text(raw.objective) || !text(raw.location) || (outcome && !appointmentOutcomes.has(outcome)) || !optionalValidInstant(raw.completedAt) || !optionalValidDate(raw.nextActionDate) || !optionalValidInstant(raw.assignedAt)) return [];
    const account = data.accounts.find((item) => item.id === accountId)!;
    return [{ ...raw, id, accountId, ownerId, customerId: account.customerId, date: text(raw.date), startTime: text(raw.startTime), duration: Number(raw.duration), type: type as Appointment["type"], status: status as Appointment["status"], objective: text(raw.objective), location: text(raw.location), outcome: outcome as Appointment["outcome"], closeoutNote: optionalText(raw.closeoutNote), nextAction: optionalText(raw.nextAction), nextActionDate: optionalText(raw.nextActionDate), priority: ["Normal", "High", "Urgent"].includes(text(raw.priority)) ? text(raw.priority) as Appointment["priority"] : "Normal", tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === "string") : [], assignedBy: internalSalesIds.has(text(raw.assignedBy)) ? text(raw.assignedBy) : undefined, assignedAt: optionalText(raw.assignedAt) } as Appointment];
  }));

  const rawApprovals = Array.isArray(input.approvals) ? input.approvals : [];
  const approvals = uniqueById(rawApprovals.flatMap((raw): Approval[] => {
    if (!object(raw)) return [];
    const id = text(raw.id); const type = text(raw.type); const requesterId = optionalText(raw.requesterId); const recordId = optionalText(raw.recordId); const priority = text(raw.priority); const status = text(raw.status);
    if (!id || baseApprovalIds.has(id) || !approvalTypes.has(type) || !text(raw.title) || !text(raw.detail) || !text(raw.requestedBy) || (requesterId && !userById.has(requesterId)) || !recordId || !orderIds.has(recordId) || !validInstant(raw.submittedAt) || !validInstant(raw.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status)) return [];
    return [{ id, type: type as Approval["type"], title: text(raw.title), detail: text(raw.detail), requestedBy: text(raw.requestedBy), requesterId, recordId, team: raw.team === "Customer" ? "Sales" : ["Leadership", "Sales", "Operations"].includes(text(raw.team)) ? text(raw.team) as Approval["team"] : undefined, submittedAt: text(raw.submittedAt), dueAt: text(raw.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];
  }));

  const rawActivities = Array.isArray(input.activities) ? input.activities : [];
  const activities = uniqueById(rawActivities.flatMap((raw): Activity[] => {
    if (!object(raw)) return [];
    const id = text(raw.id); const accountId = optionalText(raw.accountId); const type = text(raw.type); const userId = text(raw.userId);
    if (!id || baseActivityIds.has(id) || (accountId && !accountIds.has(accountId)) || !activityTypes.has(type) || (!userById.has(userId) && userId !== "system") || !text(raw.title) || !text(raw.detail) || !validInstant(raw.at)) return [];
    return [{ id, accountId, type: type as Activity["type"], title: text(raw.title), detail: text(raw.detail), at: text(raw.at), userId }];
  }));

  const seenLotCodes = new Set(baseLotCodes);
  const rawLots = Array.isArray(input.inventoryLots) ? input.inventoryLots : [];
  const inventoryLots = uniqueById(rawLots.flatMap((raw): InventoryLot[] => {
    if (!object(raw)) return [];
    const id = text(raw.id); const lotCode = text(raw.lotCode); const status = text(raw.status); const onHand = Number(raw.onHand); const code = lotCode.toLowerCase();
    if (!id || baseInventoryIds.has(id) || !lotCode || seenLotCodes.has(code) || !text(raw.product) || !validDate(raw.receivedAt) || !validDate(raw.bestBy) || !wholeNonnegative(onHand) || Number(raw.reserved) !== 0 || !inventoryStatuses.has(status) || !text(raw.location)) return [];
    seenLotCodes.add(code);
    return [{ id, lotCode, product: text(raw.product), receivedAt: text(raw.receivedAt), bestBy: text(raw.bestBy), onHand, reserved: 0, available: status === "Quality hold" ? 0 : onHand, status: status as InventoryLot["status"], location: text(raw.location), holdReason: optionalText(raw.holdReason) }];
  }));

  return { version: 1, accountPatches, orders, appointments, approvals, activities, inventoryLots };
}
