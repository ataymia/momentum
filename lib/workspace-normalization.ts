import { isValidCalendarDateKey } from "./date-time";
import type { Account, Activity, Appointment, Approval, Bulletin, CustomerAccount, InventoryLot, Notification, Order, Placement, TimeEntry, Timecard, WorkspaceData, WorkspaceUser } from "./types";

const roles = new Set(["Administrator", "Sales Manager", "Sales Representative", "Operations", "Warehouse", "Customer"]);
const teams = new Set(["Leadership", "Sales", "Operations", "Customer"]);
const accountStages = new Set(["Prospect", "Qualified", "Sampled", "Opening order", "Placed", "Reordered", "At risk"]);
const healthStates = new Set(["Strong", "Watch", "New", "At risk"]);
const accountTypes = new Set(["Independent", "Chain / franchise", "Distributor", "Other"]);
const premiseTypes = new Set(["On-premise", "Off-premise", "Hybrid", "Unclassified"]);
const pricingTiers = new Set(["A", "B", "C"]);
const activityTypes = new Set(["call", "visit", "sample", "order", "placement", "note"]);
const appointmentTypes = new Set(["First visit", "Sample drop", "Placement check", "Reorder", "Delivery"]);
const appointmentStatuses = new Set(["Scheduled", "Dispatched", "En route", "Arrived", "Completed", "Needs follow-up"]);
const appointmentOutcomes = new Set(["Order placed", "Follow-up scheduled", "Placement verified", "No decision", "Closed lost", "Delivery completed"]);
const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid"]);
const paymentStatuses = new Set(["Not invoiced", "Open", "Partially paid", "Paid"]);
const placementSources = new Set(["Physical count", "Customer estimate", "Demo POS feed"]);
const placementStatuses = new Set(["Healthy", "Check soon", "Out of stock"]);
const inventoryStatuses = new Set(["Available", "Quality hold", "Low stock"]);
const approvalTypes = new Set(["Order", "Low stock sale", "Timecard", "Price exception", "Inventory adjustment", "Leave", "Expense", "Marketing spend", "Compensation"]);
const approvalPriorities = new Set(["Normal", "High", "Urgent"]);
const approvalStatuses = new Set(["Pending", "Approved", "Returned"]);
const timeSources = new Set(["Demo mobile", "Demo desktop", "Manual correction"]);
const timecardStatuses = new Set(["Open", "Submitted", "Manager approved", "Returned", "Payroll ready"]);
const notificationTones = new Set(["info", "warning", "success"]);
const bulletinAudiences = new Set(["Company", "Team"]);
const bulletinPriorities = new Set(["Update", "Important", "Urgent"]);

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const optionalText = (value: unknown) => text(value) || undefined;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown) => finite(value) && Number(value) >= 0;
const wholeNonnegative = (value: unknown) => Number.isInteger(value) && Number(value) >= 0;
const wholePositive = (value: unknown) => Number.isInteger(value) && Number(value) > 0;
const validTime = (value: unknown) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = (value: unknown) => typeof value === "string" && isValidCalendarDateKey(value);
const validInstant = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const validDateOrInstant = (value: unknown) => validDate(value) || validInstant(value);
const optionalValidDate = (value: unknown) => value === undefined || value === null || value === "" || validDate(value);
const optionalValidInstant = (value: unknown) => value === undefined || value === null || value === "" || validInstant(value);
const optionalFinite = (value: unknown) => value === undefined || value === null || finite(value);
const optionalTime = (value: unknown) => value === undefined || value === null || value === "" || validTime(value);
const uniqueById = <T extends { id: string }>(records: T[]) => { const seen = new Set<string>(); return records.filter((record) => !seen.has(record.id) && (seen.add(record.id), true)); };
const list = (root: Record<string, unknown>, key: string, fallback: unknown[]) => Array.isArray(root[key]) ? root[key] as unknown[] : fallback;
const stringList = (value: unknown, allowed?: Set<string>) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && (!allowed || allowed.has(item))))] : [];

function normalizeUsers(raw: unknown[], fallback: WorkspaceUser[]) {
  const users = uniqueById(raw.flatMap((value): WorkspaceUser[] => {
    if (!object(value)) return [];
    const id = text(value.id); const name = text(value.name); const firstName = text(value.firstName); const email = text(value.email).toLowerCase(); const initials = text(value.initials); const title = text(value.title); const role = text(value.role); const team = text(value.team); const accent = text(value.accent);
    if (!id || !name || !firstName || !email || !email.includes("@") || !initials || !title || !roles.has(role) || !teams.has(team) || !accent) return [];
    return [{ id, name, firstName, email, initials, title, role: role as WorkspaceUser["role"], team: team as WorkspaceUser["team"], managerId: optionalText(value.managerId), managedTeams: stringList(value.managedTeams, teams) as WorkspaceUser["managedTeams"], accountIds: stringList(value.accountIds), accent }];
  }));
  const dedupedEmails = new Set<string>();
  const valid = users.filter((user) => !dedupedEmails.has(user.email) && (dedupedEmails.add(user.email), true));
  return valid.some((user) => user.role === "Administrator") ? valid : fallback;
}

function normalizeCustomers(raw: unknown[], fallback: CustomerAccount[]) {
  const normalized = uniqueById(raw.flatMap((value): CustomerAccount[] => {
    if (!object(value)) return [];
    const id = text(value.id); const name = text(value.name); const accountType = text(value.accountType); const createdAt = text(value.createdAt);
    if (!id || !name || !accountTypes.has(accountType) || !validInstant(createdAt)) return [];
    return [{ id, name, accountType: accountType as CustomerAccount["accountType"], billingContactName: optionalText(value.billingContactName), billingEmail: optionalText(value.billingEmail), billingPhone: optionalText(value.billingPhone), notes: optionalText(value.notes), createdAt }];
  }));
  return normalized.length ? normalized : fallback;
}

function normalizeCorrection(value: unknown, userIds: Set<string>) {
  if (!object(value) || !validInstant(value.at) || !userIds.has(text(value.by)) || !text(value.reason) || !object(value.before)) return undefined;
  const before = value.before;
  if (!validTime(before.clockIn) || !optionalTime(before.mealStart) || !optionalTime(before.mealEnd) || !optionalTime(before.clockOut) || !nonnegative(before.breakMinutes)) return undefined;
  return { at: text(value.at), by: text(value.by), reason: text(value.reason), before: { clockIn: text(before.clockIn), mealStart: optionalText(before.mealStart), mealEnd: optionalText(before.mealEnd), clockOut: optionalText(before.clockOut), breakMinutes: Number(before.breakMinutes) } };
}

export function normalizeWorkspaceData(input: unknown, fallback: WorkspaceData): WorkspaceData {
  if (!object(input)) return fallback;
  const root = input;
  const users = normalizeUsers(list(root, "users", fallback.users), fallback.users);
  const userIds = new Set(users.map((user) => user.id));
  const internalUserIds = new Set(users.filter((user) => user.role !== "Customer").map((user) => user.id));

  const fallbackCustomers = fallback.customers ?? [];
  const customers = normalizeCustomers(list(root, "customers", fallbackCustomers), fallbackCustomers);
  const customerIds = new Set(customers.map((customer) => customer.id));

  const accounts = uniqueById(list(root, "accounts", fallback.accounts).flatMap((value): Account[] => {
    if (!object(value)) return [];
    const id = text(value.id); const ownerId = text(value.ownerId); const stage = text(value.stage); const health = text(value.health); const customerId = optionalText(value.customerId);
    if (!id || !text(value.name) || !text(value.location) || !text(value.channel) || !accountStages.has(stage) || !internalUserIds.has(ownerId) || !healthStates.has(health) || !validDate(value.nextActionDate) || !wholeNonnegative(value.lifetimeCases) || !wholeNonnegative(value.reorderCount)) return [];
    const userRef = (candidate: unknown) => { const idValue = optionalText(candidate); return idValue && internalUserIds.has(idValue) ? idValue : undefined; };
    const pricingTier = optionalText(value.pricingTier); const premiseType = optionalText(value.premiseType);
    if (pricingTier && !pricingTiers.has(pricingTier)) return [];
    if (premiseType && !premiseTypes.has(premiseType)) return [];
    if (!optionalValidDate(value.categoryReviewDate) || !optionalValidInstant(value.pricingUpdatedAt) || !optionalValidInstant(value.responsibilityStartedAt)) return [];
    return [{ ...value, id, name: text(value.name), location: text(value.location), channel: text(value.channel), stage: stage as Account["stage"], ownerId, contactName: text(value.contactName), contactRole: text(value.contactRole), phone: text(value.phone), email: text(value.email), lastActivity: text(value.lastActivity), nextAction: text(value.nextAction), nextActionDate: text(value.nextActionDate), health: health as Account["health"], lifetimeCases: Number(value.lifetimeCases), reorderCount: Number(value.reorderCount), notes: text(value.notes), customerId: customerId && customerIds.has(customerId) ? customerId : undefined, locationName: optionalText(value.locationName), streetAddress: optionalText(value.streetAddress), city: optionalText(value.city), state: optionalText(value.state), postalCode: optionalText(value.postalCode), originatorId: userRef(value.originatorId), accountManagerId: userRef(value.accountManagerId), closerId: userRef(value.closerId), responsibilityStartedAt: optionalText(value.responsibilityStartedAt), premiseType: premiseType as Account["premiseType"], businessType: optionalText(value.businessType), categoryReviewDate: optionalText(value.categoryReviewDate), pricingTier: pricingTier as Account["pricingTier"], pricingUpdatedAt: optionalText(value.pricingUpdatedAt), pricingUpdatedBy: userRef(value.pricingUpdatedBy) } as Account];
  }));
  const accountIds = new Set(accounts.map((account) => account.id));

  const placements = uniqueById(list(root, "placements", fallback.placements).flatMap((value): Placement[] => {
    if (!object(value)) return [];
    const id = text(value.id); const accountId = text(value.accountId); const source = text(value.source); const status = text(value.status);
    if (!id || !accountIds.has(accountId) || !text(value.product) || !wholeNonnegative(value.casesDelivered) || !wholeNonnegative(value.facings) || !finite(value.shelfPrice) || Number(value.shelfPrice) < 0 || !wholeNonnegative(value.observedStock) || !validDate(value.lastChecked) || !validDate(value.nextCheck) || !placementSources.has(source) || !placementStatuses.has(status) || typeof value.cold !== "boolean") return [];
    return [{ id, accountId, product: text(value.product), casesDelivered: Number(value.casesDelivered), facings: Number(value.facings), location: text(value.location), cold: value.cold, shelfPrice: Number(value.shelfPrice), observedStock: Number(value.observedStock), lastChecked: text(value.lastChecked), nextCheck: text(value.nextCheck), source: source as Placement["source"], status: status as Placement["status"] }];
  }));
  const placementIds = new Set(placements.map((placement) => placement.id));

  const orders = uniqueById(list(root, "orders", fallback.orders).flatMap((value): Order[] => {
    if (!object(value)) return [];
    const id = text(value.id); const accountId = text(value.accountId); const ownerId = text(value.ownerId); const status = text(value.status); const paymentStatus = text(value.paymentStatus); const price = Number(value.pricePerCase); const cases = Number(value.cases); const amount = Number(value.amount);
    const owner = users.find((user) => user.id === ownerId);
    if (!id || !text(value.number) || !accountIds.has(accountId) || !owner || (owner.role === "Customer" && !(owner.accountIds ?? []).includes(accountId)) || !wholePositive(cases) || !finite(price) || price <= 0 || !finite(amount) || amount < 0 || Math.abs(amount - cases * price) > 0.01 || !orderStatuses.has(status) || !paymentStatuses.has(paymentStatus) || !validDateOrInstant(value.placedAt) || !text(value.priceBasis)) return [];
    if (!optionalValidDate(value.paidAt) || !optionalValidDate(value.firstSettledAt) || !optionalFinite(value.inventoryAvailableAtOrder)) return [];
    const settlementEvidence = optionalText(value.firstSettledAt) || optionalText(value.paidAt);
    const safePaymentStatus = paymentStatus === "Paid" && !settlementEvidence ? "Open" : paymentStatus;
    const safeStatus = status === "Paid" && safePaymentStatus !== "Paid" ? "Delivered" : status;
    const creditedRepId = optionalText(value.creditedRepId); const sourcePlacementId = optionalText(value.sourcePlacementId);
    if (creditedRepId && users.find((user) => user.id === creditedRepId)?.role !== "Sales Representative") return [];
    if (sourcePlacementId && !placementIds.has(sourcePlacementId)) return [];
    return [{ id, number: text(value.number), accountId, cases, pricePerCase: price, amount, status: safeStatus as Order["status"], placedAt: text(value.placedAt), ownerId, paidAt: optionalText(value.paidAt), firstSettledAt: optionalText(value.firstSettledAt), priceBasis: text(value.priceBasis), paymentStatus: safePaymentStatus as Order["paymentStatus"], product: optionalText(value.product), creditedRepId, sourcePlacementId, inventoryAvailableAtOrder: finite(value.inventoryAvailableAtOrder) ? Number(value.inventoryAvailableAtOrder) : undefined, lowStockApprovalRequired: typeof value.lowStockApprovalRequired === "boolean" ? value.lowStockApprovalRequired : undefined }];
  }));
  const orderIds = new Set(orders.map((order) => order.id));

  const inventory = uniqueById(list(root, "inventory", fallback.inventory).flatMap((value): InventoryLot[] => {
    if (!object(value)) return [];
    const id = text(value.id); const status = text(value.status); const onHand = Number(value.onHand); const reserved = Number(value.reserved);
    if (!id || !text(value.lotCode) || !text(value.product) || !validDate(value.receivedAt) || !validDate(value.bestBy) || !wholeNonnegative(onHand) || !wholeNonnegative(reserved) || reserved > onHand || !inventoryStatuses.has(status) || !text(value.location) || !optionalValidInstant(value.holdResolvedAt)) return [];
    const available = status === "Quality hold" ? 0 : onHand - reserved;
    return [{ id, lotCode: text(value.lotCode), product: text(value.product), receivedAt: text(value.receivedAt), bestBy: text(value.bestBy), onHand, reserved, available, status: status as InventoryLot["status"], location: text(value.location), holdReason: optionalText(value.holdReason), holdDecision: optionalText(value.holdDecision), holdResolvedAt: optionalText(value.holdResolvedAt), holdResolvedBy: internalUserIds.has(text(value.holdResolvedBy)) ? text(value.holdResolvedBy) : undefined }];
  }));
  const inventoryIds = new Set(inventory.map((lot) => lot.id));

  const appointments = uniqueById(list(root, "appointments", fallback.appointments).flatMap((value): Appointment[] => {
    if (!object(value)) return [];
    const id = text(value.id); const accountId = text(value.accountId); const ownerId = optionalText(value.ownerId); const type = text(value.type); const status = text(value.status); const outcome = optionalText(value.outcome);
    if (!id || !accountIds.has(accountId) || (ownerId && !internalUserIds.has(ownerId)) || !validDate(value.date) || !validTime(value.startTime) || !wholePositive(value.duration) || !appointmentTypes.has(type) || !appointmentStatuses.has(status) || !text(value.objective) || !text(value.location) || (outcome && !appointmentOutcomes.has(outcome)) || !optionalValidInstant(value.completedAt) || !optionalValidDate(value.nextActionDate) || !optionalValidInstant(value.assignedAt) || !optionalValidInstant(value.arrivalVerifiedAt) || !optionalValidInstant(value.geofenceDepartureAt) || !optionalValidInstant(value.geofenceExceptionAt)) return [];
    if (![value.arrivalLatitude, value.arrivalLongitude, value.arrivalAccuracyMeters, value.arrivalDistanceMiles, value.geofenceDepartureLatitude, value.geofenceDepartureLongitude, value.geofenceDepartureAccuracyMeters, value.geofenceDepartureDistanceMiles].every(optionalFinite)) return [];
    const account = accounts.find((item) => item.id === accountId)!;
    return [{ ...value, id, accountId, ownerId, customerId: account.customerId, date: text(value.date), startTime: text(value.startTime), duration: Number(value.duration), type: type as Appointment["type"], status: status as Appointment["status"], objective: text(value.objective), location: text(value.location), outcome: outcome as Appointment["outcome"], closeoutNote: optionalText(value.closeoutNote), nextAction: optionalText(value.nextAction), nextActionDate: optionalText(value.nextActionDate), priority: ["Normal", "High", "Urgent"].includes(text(value.priority)) ? text(value.priority) as Appointment["priority"] : "Normal", tags: stringList(value.tags), requiredSkills: stringList(value.requiredSkills), confirmed: typeof value.confirmed === "boolean" ? value.confirmed : undefined, arrivalWindow: optionalText(value.arrivalWindow), assignedBy: internalUserIds.has(text(value.assignedBy)) ? text(value.assignedBy) : undefined, assignedAt: optionalText(value.assignedAt), geofenceExceptionBy: internalUserIds.has(text(value.geofenceExceptionBy)) ? text(value.geofenceExceptionBy) : undefined } as Appointment];
  }));

  const activities = uniqueById(list(root, "activities", fallback.activities).flatMap((value): Activity[] => {
    if (!object(value)) return [];
    const id = text(value.id); const accountId = optionalText(value.accountId); const type = text(value.type); const userId = text(value.userId);
    if (!id || (accountId && !accountIds.has(accountId)) || !activityTypes.has(type) || (!userIds.has(userId) && userId !== "system") || !text(value.title) || !text(value.detail) || !validInstant(value.at)) return [];
    return [{ id, accountId, type: type as Activity["type"], title: text(value.title), detail: text(value.detail), at: text(value.at), userId }];
  }));

  const timeEntries = uniqueById(list(root, "timeEntries", fallback.timeEntries).flatMap((value): TimeEntry[] => {
    if (!object(value)) return [];
    const id = text(value.id); const userId = text(value.userId); const source = text(value.source);
    if (!id || !internalUserIds.has(userId) || !validDate(value.date) || !validTime(value.clockIn) || !optionalTime(value.clockOut) || !optionalTime(value.mealStart) || !optionalTime(value.mealEnd) || !nonnegative(value.breakMinutes) || !timeSources.has(source)) return [];
    if ((value.mealStart && !value.mealEnd && value.clockOut) || (!value.mealStart && value.mealEnd)) return [];
    const corrections = Array.isArray(value.corrections) ? value.corrections.map((item) => normalizeCorrection(item, internalUserIds)).filter((item): item is NonNullable<typeof item> => Boolean(item)) : undefined;
    return [{ id, userId, date: text(value.date), clockIn: text(value.clockIn), clockOut: optionalText(value.clockOut), mealStart: optionalText(value.mealStart), mealEnd: optionalText(value.mealEnd), breakMinutes: Number(value.breakMinutes), source: source as TimeEntry["source"], note: optionalText(value.note), corrections }];
  }));

  const timecards = uniqueById(list(root, "timecards", fallback.timecards).flatMap((value): Timecard[] => {
    if (!object(value)) return [];
    const id = text(value.id); const userId = text(value.userId); const status = text(value.status);
    if (!id || !internalUserIds.has(userId) || !validDate(value.weekStart) || !validDate(value.weekEnd) || text(value.weekEnd) < text(value.weekStart) || !timecardStatuses.has(status) || typeof value.attested !== "boolean" || !optionalValidInstant(value.submittedAt) || !optionalValidInstant(value.approvedAt) || !optionalValidInstant(value.returnedAt)) return [];
    return [{ id, userId, weekStart: text(value.weekStart), weekEnd: text(value.weekEnd), status: status as Timecard["status"], submittedAt: optionalText(value.submittedAt), approvedAt: optionalText(value.approvedAt), approverId: internalUserIds.has(text(value.approverId)) ? text(value.approverId) : undefined, attested: value.attested, returnedAt: optionalText(value.returnedAt), returnedBy: internalUserIds.has(text(value.returnedBy)) ? text(value.returnedBy) : undefined, returnReason: optionalText(value.returnReason) }];
  }));
  const timecardIds = new Set(timecards.map((card) => card.id));

  const approvals = uniqueById(list(root, "approvals", fallback.approvals).flatMap((value): Approval[] => {
    if (!object(value)) return [];
    const id = text(value.id); const type = text(value.type); const requesterId = optionalText(value.requesterId); const recordId = optionalText(value.recordId); const priority = text(value.priority); const status = text(value.status); const team = optionalText(value.team);
    if (!id || !approvalTypes.has(type) || !text(value.title) || !text(value.detail) || !text(value.requestedBy) || (requesterId && !userIds.has(requesterId)) || !validInstant(value.submittedAt) || !validInstant(value.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status) || (team && !teams.has(team))) return [];
    if (recordId && ["Order", "Low stock sale", "Price exception"].includes(type) && !orderIds.has(recordId)) return [];
    if (recordId && type === "Timecard" && !timecardIds.has(recordId)) return [];
    if (recordId && type === "Inventory adjustment" && !inventoryIds.has(recordId)) return [];
    return [{ id, type: type as Approval["type"], title: text(value.title), detail: text(value.detail), requestedBy: text(value.requestedBy), requesterId, recordId, team: team as Approval["team"], submittedAt: text(value.submittedAt), dueAt: text(value.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];
  }));

  const notifications = uniqueById(list(root, "notifications", fallback.notifications).flatMap((value): Notification[] => {
    if (!object(value)) return [];
    const id = text(value.id); const tone = text(value.tone);
    if (!id || !text(value.title) || !text(value.detail) || !validInstant(value.at) || !notificationTones.has(tone)) return [];
    return [{ id, title: text(value.title), detail: text(value.detail), at: text(value.at), readBy: stringList(value.readBy).filter((idValue) => userIds.has(idValue)), tone: tone as Notification["tone"], audienceUserIds: Array.isArray(value.audienceUserIds) ? stringList(value.audienceUserIds).filter((idValue) => userIds.has(idValue)) : undefined }];
  }));

  const bulletins = uniqueById(list(root, "bulletins", fallback.bulletins).flatMap((value): Bulletin[] => {
    if (!object(value)) return [];
    const id = text(value.id); const audience = text(value.audience); const team = optionalText(value.team); const priority = text(value.priority); const authorId = text(value.authorId);
    if (!id || !text(value.title) || !text(value.body) || !bulletinAudiences.has(audience) || (audience === "Team" && (!team || !teams.has(team))) || !bulletinPriorities.has(priority) || !internalUserIds.has(authorId) || !validInstant(value.publishedAt) || !optionalValidInstant(value.expiresAt)) return [];
    return [{ id, title: text(value.title), body: text(value.body), audience: audience as Bulletin["audience"], team: audience === "Team" ? team as Bulletin["team"] : undefined, priority: priority as Bulletin["priority"], authorId, publishedAt: text(value.publishedAt), expiresAt: optionalText(value.expiresAt), acknowledgedBy: stringList(value.acknowledgedBy).filter((idValue) => userIds.has(idValue)) }];
  }));

  const safeUsers = users.map((user) => ({ ...user, managerId: user.managerId && internalUserIds.has(user.managerId) && user.managerId !== user.id ? user.managerId : undefined, accountIds: user.role === "Customer" ? (user.accountIds ?? []).filter((id) => accountIds.has(id)) : user.accountIds }));
  return { users: safeUsers, customers, accounts, activities, appointments, orders, placements, inventory, approvals, timeEntries, timecards, notifications, bulletins };
}
