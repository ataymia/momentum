from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"PATCH FAILED: expected text not found in {path}: {old[:160]!r}")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH FAILED: expected one match in {path}, found {count}")
    target.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    print(f"wrote {path}")


# ---------- Approval integrity ----------
replace_once(
    "lib/types.ts",
    '  priority: ApprovalPriority;\n  status: ApprovalStatus;\n};',
    '  priority: ApprovalPriority;\n  status: ApprovalStatus;\n  decidedBy?: string;\n  decidedAt?: string;\n  returnReason?: string;\n};',
)

replace_once(
    "lib/access.ts",
    '''export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {\n  if (!user) return false;\n  if (user.role === "Administrator") return true;\n  if (user.role !== "Sales Manager") return false;\n  if (approval.requesterId && managedUserIds(data, user).has(approval.requesterId)) return approval.requesterId !== user.id;\n  return Boolean(approval.team && (user.managedTeams ?? []).includes(approval.team));\n};''',
    '''export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {\n  if (!user) return false;\n  // Sales orders have one authoritative Administrator approval. A Sales Manager may still review\n  // manager-owned workflows such as timecards, but cannot create a second order decision.\n  if (["Order", "Low stock sale"].includes(approval.type)) return user.role === "Administrator";\n  if (user.role === "Administrator") return true;\n  if (user.role !== "Sales Manager") return false;\n  if (approval.requesterId && managedUserIds(data, user).has(approval.requesterId)) return approval.requesterId !== user.id;\n  return Boolean(approval.team && (user.managedTeams ?? []).includes(approval.team));\n};''',
)

write("lib/order-approval-engine.ts", '''import type { Approval, Order } from "./types";\n\nconst fulfillmentRank: Record<Order["status"], number> = {\n  Draft: 0,\n  "Awaiting approval": 1,\n  Approved: 2,\n  Allocated: 3,\n  "Out for delivery": 4,\n  Delivered: 5,\n  Paid: 6,\n};\n\nconst instant = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).getTime() : 0;\nconst isFinal = (approval: Approval) => approval.status !== "Pending";\n\nexport function canonicalApproval(a: Approval, b: Approval): Approval {\n  if (isFinal(a) !== isFinal(b)) return isFinal(a) ? a : b;\n  const aAt = instant(a.decidedAt) || instant(a.submittedAt);\n  const bAt = instant(b.decidedAt) || instant(b.submittedAt);\n  return bAt > aAt ? b : a;\n}\n\n/** One operational approval per order. Source replicas remain in persistence/audit, but stale Pending copies do not create a second task. */\nexport function reconcileApprovals(primary: Approval[], secondary: Approval[]): Approval[] {\n  const byId = new Map<string, Approval>();\n  for (const approval of [...secondary, ...primary]) {\n    const existing = byId.get(approval.id);\n    byId.set(approval.id, existing ? canonicalApproval(existing, approval) : approval);\n  }\n  const ordinary: Approval[] = [];\n  const orderByRecord = new Map<string, Approval>();\n  for (const approval of byId.values()) {\n    if (!["Order", "Low stock sale"].includes(approval.type) || !approval.recordId) { ordinary.push(approval); continue; }\n    const existing = orderByRecord.get(approval.recordId);\n    orderByRecord.set(approval.recordId, existing ? canonicalApproval(existing, approval) : approval);\n  }\n  return [...orderByRecord.values(), ...ordinary].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));\n}\n\nexport function approvalForOrder(approvals: Approval[], orderId: string) {\n  return approvals.find((approval) => approval.recordId === orderId && ["Order", "Low stock sale"].includes(approval.type));\n}\n\nexport function reconcileOrderWithApproval(order: Order, approval?: Approval): Order {\n  if (!approval) return order;\n  if (approval.status === "Approved" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Approved" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Draft" };\n  return order;\n}\n\nexport function reconcileOrders(primary: Order[], secondary: Order[], approvals: Approval[]): Order[] {\n  const byId = new Map<string, Order>();\n  for (const order of [...secondary, ...primary]) {\n    const existing = byId.get(order.id);\n    if (!existing) { byId.set(order.id, order); continue; }\n    const advanced = fulfillmentRank[order.status] >= fulfillmentRank[existing.status] ? order : existing;\n    const other = advanced === order ? existing : order;\n    byId.set(order.id, { ...other, ...advanced });\n  }\n  return [...byId.values()].map((order) => reconcileOrderWithApproval(order, approvalForOrder(approvals, order.id)));\n}\n''')

replace_once(
    "lib/commercial-state.ts",
    '''    if (!id || baseApprovalIds.has(id) || !approvalTypes.has(type) || !text(raw.title) || !text(raw.detail) || !text(raw.requestedBy) || (requesterId && !userById.has(requesterId)) || !linkedRecordValid || !validInstant(raw.submittedAt) || !validInstant(raw.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status)) return [];\n    return [{ id, type: type as Approval["type"], title: text(raw.title), detail: text(raw.detail), requestedBy: text(raw.requestedBy), requesterId, recordId, team: raw.team === "Customer" ? "Sales" : ["Leadership", "Sales", "Operations"].includes(text(raw.team)) ? text(raw.team) as Approval["team"] : undefined, submittedAt: text(raw.submittedAt), dueAt: text(raw.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];''',
    '''    if (!id || baseApprovalIds.has(id) || !approvalTypes.has(type) || !text(raw.title) || !text(raw.detail) || !text(raw.requestedBy) || !linkedRecordValid || !validInstant(raw.submittedAt) || !validInstant(raw.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status)) return [];\n    const decidedBy = optionalText(raw.decidedBy);\n    if (!optionalValidInstant(raw.decidedAt)) return [];\n    return [{ id, type: type as Approval["type"], title: text(raw.title), detail: text(raw.detail), requestedBy: text(raw.requestedBy), requesterId, recordId, team: raw.team === "Customer" ? "Sales" : ["Leadership", "Sales", "Operations"].includes(text(raw.team)) ? text(raw.team) as Approval["team"] : undefined, submittedAt: text(raw.submittedAt), dueAt: text(raw.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"], decidedBy, decidedAt: optionalText(raw.decidedAt), returnReason: optionalText(raw.returnReason) }];''',
)

replace_once(
    "lib/workspace-normalization.ts",
    '''    if (!id || !approvalTypes.has(type) || !text(value.title) || !text(value.detail) || !text(value.requestedBy) || (requesterId && !userIds.has(requesterId)) || !validInstant(value.submittedAt) || !validInstant(value.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status) || (team && !teams.has(team))) return [];\n    return [{ id, type: type as Approval["type"], title: text(value.title), detail: text(value.detail), requestedBy: text(value.requestedBy), requesterId, recordId, team: team as Approval["team"], submittedAt: text(value.submittedAt), dueAt: text(value.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];''',
    '''    if (!id || !approvalTypes.has(type) || !text(value.title) || !text(value.detail) || !text(value.requestedBy) || !validInstant(value.submittedAt) || !validInstant(value.dueAt) || !approvalPriorities.has(priority) || !approvalStatuses.has(status) || (team && !teams.has(team))) return [];\n    const decidedBy = optionalText(value.decidedBy);\n    if (!optionalValidInstant(value.decidedAt)) return [];\n    return [{ id, type: type as Approval["type"], title: text(value.title), detail: text(value.detail), requestedBy: text(value.requestedBy), requesterId, recordId, team: team as Approval["team"], submittedAt: text(value.submittedAt), dueAt: text(value.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"], decidedBy, decidedAt: optionalText(value.decidedAt), returnReason: optionalText(value.returnReason) }];''',
)

replace_once(
    "lib/workspace-context.tsx",
    'import { paidAccountRollupAfterPayment } from "./workspace-controls";',
    'import { paidAccountRollupAfterPayment } from "./workspace-controls";\nimport { reconcileApprovals, reconcileOrders } from "./order-approval-engine";',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    const orderIds = new Set(commercial.orders.map((order) => order.id));\n    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    return {\n      ...base.data,\n      users,\n      inventory,\n      accounts,\n      territories:commercial.territories,\n      orders: [...commercial.orders, ...baseOrders.filter((order) => !orderIds.has(order.id))],\n      appointments: [...commercial.appointments, ...base.data.appointments.filter((item) => !appointmentIds.has(item.id))],\n      approvals: [...commercial.approvals, ...base.data.approvals.filter((approval) => !commercial.approvals.some((entry) => entry.id === approval.id))],\n      activities: [...commercial.activities, ...base.data.activities],\n    };''',
    '''    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    const approvals = reconcileApprovals(commercial.approvals, base.data.approvals);\n    const orders = reconcileOrders(commercial.orders, baseOrders, approvals);\n    return {\n      ...base.data,\n      users,\n      inventory,\n      accounts,\n      territories:commercial.territories,\n      orders,\n      appointments: [...commercial.appointments, ...base.data.appointments.filter((item) => !appointmentIds.has(item.id))],\n      approvals,\n      activities: [...commercial.activities, ...base.data.activities],\n    };''',
)

replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({ ...state, approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision } : item), orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order) }));\n  };''',
    '''    let returnReason: string | undefined;\n    if (decision === "Returned") {\n      if (typeof window === "undefined") return;\n      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();\n      if (!returnReason || returnReason.length < 3) return;\n    }\n    const decidedAt = now();\n    setCommercial((state) => ({\n      ...state,\n      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),\n      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,\n    }));\n    window.setTimeout(() => void momentumStorage.flush(), 0);\n  };''',
)

# Legacy/base order workflow gets the same provenance and no separate legacy bell message.
replace_once(
    "lib/workspace-context-v5.tsx",
    '''    const reviewers = data.users.filter((user) => user.role === "Administrator" || user.id === currentUser.managerId).map((user) => user.id);\n    setData((current) => ({''',
    '''    setData((current) => ({''',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '''      approvals: [{ id: `apr-${Date.now()}`, type: "Order", title: `Review order ${number}`, detail: `${cases} cases · ${customer ? "prior order snapshot" : "demo-entered price"} · ${account.locationName ?? account.name}`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "High", status: "Pending" }, ...current.approvals],\n      notifications: [{ id: `note-${Date.now()}`, title: `Order ${number} needs review`, detail: `${account.locationName ?? account.name} · ${cases} cases`, at: nowStamp(), readBy: [], tone: "info", audienceUserIds: reviewers }, ...current.notifications],''',
    '''      approvals: [{ id: `apr-${Date.now()}`, type: "Order", title: `Review order ${number}`, detail: `${cases} cases · ${customer ? "prior order snapshot" : "demo-entered price"} · ${account.locationName ?? account.name}`, requestedBy: currentUser.name, requesterId: currentUser.id, recordId: id, team: currentUser.team, submittedAt: nowStamp(), dueAt: plusHours(24), priority: "High", status: "Pending" }, ...current.approvals],''',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '''      return {\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision } : item),\n        orders: current.orders.map((order) => approval.type === "Order" && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        notifications: [{ id: `note-${Date.now()}`, title: `${approval.type} ${decision.toLowerCase()}`, detail: approval.title, at: nowStamp(), readBy: [], tone: decision === "Approved" ? "success" : "warning", audienceUserIds: approval.requesterId ? [approval.requesterId] : undefined }, ...current.notifications],\n      };''',
    '''      const decidedAt = nowStamp();\n      return {\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt } : item),\n        orders: current.orders.map((order) => ["Order", "Low stock sale"].includes(approval.type) && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        activities: approval.recordId ? [{ id: `act-${Date.now()}`, accountId: current.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: `${approval.title} ${decision.toLowerCase()} by ${currentUser.name}.`, at: decidedAt, userId: currentUser.id }, ...current.activities] : current.activities,\n      };''',
)

# ---------- Correct audit actor attribution ----------
replace_once(
    "lib/audit-engine.ts",
    '''export function diffAuditableRecords(previous: Map<string, AuditSnapshot>, current: Map<string, AuditSnapshot>, actor: { id: string; role: string }, at = new Date().toISOString()): AuditEvent[] { const events: AuditEvent[] = []; const keys = new Set([...previous.keys(), ...current.keys()]); let sequence = 0; for (const key of keys) { const before = previous.get(key); const after = current.get(key); if (before && after) { let same = false; try { same = JSON.stringify(before.payload) === JSON.stringify(after.payload); } catch { same = false; } if (same) continue; } const snapshot = after ?? before; if (!snapshot) continue; const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated"; const changes = changeList(before?.payload, after?.payload); const changedFields = changes.map((item) => item.field).join(", "); events.push({ id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`, at, actorId: actor.id, actorRole: actor.role, action, module: snapshot.module, collection: snapshot.collection, entityType: snapshot.entityType, entityId: snapshot.entityId, label: snapshot.label, summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`, sensitivity: snapshot.sensitivity, relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId, relatedUserId: after?.relatedUserId ?? before?.relatedUserId, changes }); } return events; }''',
    '''const provenanceFields = ["decidedBy", "approvedBy", "fulfilledBy", "reviewedBy", "resolvedBy", "returnedBy", "approverId", "updatedBy", "changedBy", "actorId", "assignedBy", "createdBy", "submittedBy", "provisionedBy", "requesterId"] as const;\nfunction inferredActorId(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"], changes: AuditChange[]) {\n  const payload = after?.payload ?? before?.payload;\n  if (!payload) return undefined;\n  if (action === "Updated") {\n    const changed = new Set(changes.map((item) => item.field));\n    for (const field of provenanceFields) { const value = changed.has(field) ? text(payload[field]) : undefined; if (value) return value; }\n  }\n  for (const field of provenanceFields) { const value = text(payload[field]); if (value) return value; }\n  return undefined;\n}\nexport function diffAuditableRecords(previous: Map<string, AuditSnapshot>, current: Map<string, AuditSnapshot>, actor: { id: string; role: string }, at = new Date().toISOString(), users: WorkspaceUser[] = []): AuditEvent[] { const events: AuditEvent[] = []; const keys = new Set([...previous.keys(), ...current.keys()]); let sequence = 0; for (const key of keys) { const before = previous.get(key); const after = current.get(key); if (before && after) { let same = false; try { same = JSON.stringify(before.payload) === JSON.stringify(after.payload); } catch { same = false; } if (same) continue; } const snapshot = after ?? before; if (!snapshot) continue; const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated"; const changes = changeList(before?.payload, after?.payload); const inferredId = inferredActorId(before, after, action, changes); const inferredUser = inferredId ? users.find((user) => user.id === inferredId) : undefined; const resolvedActor = inferredId ? { id: inferredId, role: inferredUser?.role ?? "Recorded user" } : actor; const changedFields = changes.map((item) => item.field).join(", "); events.push({ id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`, at, actorId: resolvedActor.id, actorRole: resolvedActor.role, action, module: snapshot.module, collection: snapshot.collection, entityType: snapshot.entityType, entityId: snapshot.entityId, label: snapshot.label, summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`, sensitivity: snapshot.sensitivity, relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId, relatedUserId: after?.relatedUserId ?? before?.relatedUserId, changes }); } return events; }''',
)
replace_once(
    "lib/audit-context.tsx",
    '''    const actor = { id: currentUser?.id ?? "system", role: currentUser?.role ?? "System" };\n    const additions = diffAuditableRecords(previous.current, snapshots, actor);''',
    '''    // A passive Firestore refresh may represent another employee's work. Never infer the current viewer as actor.\n    const additions = diffAuditableRecords(previous.current, snapshots, { id: "system", role: "System" }, new Date().toISOString(), data.users);''',
)
replace_once("lib/audit-context.tsx", '  }, [snapshots, currentUser]);', '  }, [snapshots, data.users]);')

# ---------- Action-only notifications ----------
replace_once(
    "lib/notification-engine.ts",
    '''export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {\n  if (event.sensitivity === "admin") {''',
    '''export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {\n  if (event.collection === "approvals" && event.action === "Created") {\n    return data.users.filter((user) => user.role === "Administrator" && user.id !== event.actorId).map((user) => user.id);\n  }\n  if (event.collection === "approvals" && event.action === "Updated" && event.relatedUserId) {\n    return event.relatedUserId === event.actorId ? [] : [event.relatedUserId];\n  }\n  if (event.sensitivity === "admin") {''',
)
replace_once(
    "lib/notification-engine.ts",
    '''export function auditEventCreatesNotification(event: AuditEvent) {\n  if (event.module !== "Field tracking") return true;\n  return event.collection === "departureAlerts" && event.action === "Created";\n}''',
    '''const changedTo = (event: AuditEvent, field: string, value: string) => event.changes.some((change) => change.field === field && change.after === value);\n\n/** The bell is an action queue. Routine activity stays in Audit and never becomes an in-app/email/SMS action. */\nexport function auditEventCreatesNotification(event: AuditEvent) {\n  if (event.module === "Field tracking") return event.collection === "departureAlerts" && event.action === "Created";\n  if (event.collection === "approvals") {\n    if (event.action === "Created") return changedTo(event, "status", "Pending");\n    return event.action === "Updated" && changedTo(event, "status", "Returned");\n  }\n  if (event.collection === "timecards") return event.action === "Updated" && (changedTo(event, "status", "Submitted") || changedTo(event, "status", "Returned"));\n  if (event.module === "Marketing" && event.collection === "requests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  if (event.module === "HCM" && event.collection === "leaveRequests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  return false;\n}''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''      const sourceEvents = audit.events.slice(0, 500).filter(auditEventCreatesNotification);\n      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));\n      let copyChanged = false;\n      const refreshed = current.deliveries.map((delivery) => {''',
    '''      const auditWindow = audit.events.slice(0, 500);\n      const sourceEvents = auditWindow.filter(auditEventCreatesNotification);\n      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));\n      const auditEventIds = new Set(auditWindow.map((event) => event.id));\n      // Remove only old bell deliveries derived from routine audit events. The audit source itself is preserved.\n      const retained = current.deliveries.filter((delivery) => !auditEventIds.has(delivery.sourceEventId) || eventById.has(delivery.sourceEventId));\n      let copyChanged = retained.length !== current.deliveries.length;\n      const refreshed = retained.map((delivery) => {''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''  const legacyUnread = currentUser.role === "Customer" ? 0 : scope.notifications.filter((item) => !item.readBy.includes(currentUser.id)).length; const unread = legacyUnread + generated.unreadCount;''',
    '''  const unread = generated.unreadCount;''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''{generated.currentUserItems.slice(0, 8).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · automated rule</small></div></article>)}{scope.notifications.slice(0, 6).map((notification) => { const unreadItem = !notification.readBy.includes(currentUser.id); return <article key={notification.id} className={unreadItem ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.at, { hour: "numeric", minute: "2-digit" })}</small></div></article>; })}{generated.currentUserItems.length === 0 && scope.notifications.length === 0 && <div className="popover-empty">No notifications.</div>}''',
    '''{generated.currentUserItems.slice(0, 12).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · action notification</small></div></article>)}{generated.currentUserItems.length === 0 && <div className="popover-empty">No action notifications. Routine movement stays in Audit.</div>}''',
)

# ---------- Faster cross-client convergence without a Firebase architecture change ----------
replace_once(
    "lib/firebase-session-context.tsx",
    '    await attachFirestorePersistence({scope,onDirectoryChange:()=>{',
    '    await attachFirestorePersistence({scope,pollIntervalMs:5_000,onDirectoryChange:()=>{',
)

# ---------- CRM no-loss dependency handling ----------
replace_once(
    "lib/crm-engine.ts",
    '''    if(!contact?.id||seedContactIds.has(contact.id)||!contactScopes.has(contact.scope)||!customerIds.has(contact.customerId)||!contact.name?.trim()||!contact.role?.trim()||!decisionRoles.has(contact.decisionRole)||typeof contact.primary!=="boolean"||typeof contact.active!=="boolean"||!validTimestamp(contact.createdAt)||!(contact.createdBy==="system"||employeeIds.has(contact.createdBy)))return false;\n    if(contact.scope==="Location"){const location=contact.locationId?locationById.get(contact.locationId):undefined;if(!location||location.customerId!==contact.customerId)return false;}''',
    '''    if(!contact?.id||seedContactIds.has(contact.id)||!contactScopes.has(contact.scope)||!contact.customerId||!contact.name?.trim()||!contact.role?.trim()||!decisionRoles.has(contact.decisionRole)||typeof contact.primary!=="boolean"||typeof contact.active!=="boolean"||!validTimestamp(contact.createdAt)||!contact.createdBy)return false;\n    if(contact.scope==="Location"&&!contact.locationId)return false;''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    const location=interaction&&locationById.get(interaction.locationId);\n    if(!interaction?.id||seedInteractionIds.has(interaction.id)||!location||!employeeIds.has(interaction.userId)||!interactionTypes.has(interaction.type)||!validTimestamp(interaction.occurredAt)||!interaction.summary?.trim())return false;''',
    '''    if(!interaction?.id||seedInteractionIds.has(interaction.id)||!interaction.locationId||!interaction.userId||!interactionTypes.has(interaction.type)||!validTimestamp(interaction.occurredAt)||!interaction.summary?.trim())return false;''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    if(interaction.contactId){const contact=contactById.get(interaction.contactId);if(!contact||!contact.active||!(contact.scope==="Location"?contact.locationId===location.id&&contact.customerId===location.customerId:contact.customerId===location.customerId))return false;}''',
    '''    if(interaction.contactId){const contact=contactById.get(interaction.contactId);if(contact&&!contact.active)return false;}''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    const location=opportunity&&locationById.get(opportunity.locationId);\n    if(!opportunity?.id||!location||location.customerId!==opportunity.customerId||!opportunity.name?.trim()||!opportunityStages.has(opportunity.stage)||!opportunityStatuses.has(opportunity.status)||!responsibilityUsers.has(opportunity.ownerId)||!employeeIds.has(opportunity.createdBy)||!validTimestamp(opportunity.createdAt)||!validTimestamp(opportunity.updatedAt))return false;''',
    '''    if(!opportunity?.id||!opportunity.locationId||!opportunity.customerId||!opportunity.ownerId||!opportunity.name?.trim()||!opportunityStages.has(opportunity.stage)||!opportunityStatuses.has(opportunity.status)||!opportunity.createdBy||!validTimestamp(opportunity.createdAt)||!validTimestamp(opportunity.updatedAt))return false;''',
)
replace_once(
    "lib/crm-engine.ts",
    '''  const storedResponsibility=uniqueById((Array.isArray(state.responsibilityHistory)?state.responsibilityHistory:[]).filter((event):event is ResponsibilityEvent=>Boolean(event?.id&&locationById.has(event.locationId)&&responsibilityUsers.has(event.toUserId)&&(!event.fromUserId||responsibilityUsers.has(event.fromUserId))&&event.fromUserId!==event.toUserId&&validTimestamp(event.effectiveAt)&&event.reason?.trim()&&(event.changedBy==="system"||employeeIds.has(event.changedBy))&&(!event.acceptedAt||validTimestamp(event.acceptedAt)))));''',
    '''  const storedResponsibility=uniqueById((Array.isArray(state.responsibilityHistory)?state.responsibilityHistory:[]).filter((event):event is ResponsibilityEvent=>Boolean(event?.id&&event.locationId&&event.toUserId&&event.fromUserId!==event.toUserId&&validTimestamp(event.effectiveAt)&&event.reason?.trim()&&event.changedBy&&(!event.acceptedAt||validTimestamp(event.acceptedAt)))));''',
)
replace_once(
    "lib/crm-context.tsx",
    '''  useEffect(() => {\n    if (typeof window !== "undefined") momentumStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(state));\n  }, [state]);''',
    '''  useEffect(() => {\n    if (typeof window !== "undefined") { momentumStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(state)); void momentumStorage.flush(); }\n  }, [state]);''',
)

# ---------- Tests ----------
write("tests/platform-integrity.test.ts", '''import assert from "node:assert/strict";\nimport test, { describe } from "node:test";\nimport { canReviewApproval } from "../lib/access";\nimport { collectAuditableRecords, diffAuditableRecords } from "../lib/audit-engine";\nimport { auditEventCreatesNotification } from "../lib/notification-engine";\nimport { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";\nimport type { Approval, Order, WorkspaceData, WorkspaceUser } from "../lib/types";\n\nconst ADMIN = "admin"; const REP = "rep"; const MANAGER = "manager";\nconst user=(id:string,role:WorkspaceUser["role"],team:WorkspaceUser["team"]):WorkspaceUser=>({id,name:id,firstName:id,email:`${id}@test.local`,initials:id.slice(0,2).toUpperCase(),title:role,role,team,accent:"#53657d",managerId:role==="Sales Representative"?MANAGER:undefined,managedTeams:role==="Sales Manager"?["Sales"]:undefined});\nconst users=[user(ADMIN,"Administrator","Leadership"),user(MANAGER,"Sales Manager","Sales"),user(REP,"Sales Representative","Sales")];\nconst data:WorkspaceData={users,customers:[],accounts:[],activities:[],appointments:[],orders:[],placements:[],inventory:[],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};\nconst pending:Approval={id:"apr",type:"Order",title:"Review GE-1",detail:"10 cases",requestedBy:"rep",requesterId:REP,recordId:"ord",team:"Sales",submittedAt:"2026-09-22T16:00:00.000Z",dueAt:"2026-09-23T16:00:00.000Z",priority:"High",status:"Pending"};\n\ndescribe("order approval coherence",()=>{\n  test("one Administrator decision dominates stale Pending replicas",()=>{const approved={...pending,status:"Approved" as const,decidedBy:ADMIN,decidedAt:"2026-09-22T16:05:00.000Z"};const approvals=reconcileApprovals([pending],[approved]);assert.equal(approvals.length,1);assert.equal(approvals[0].status,"Approved");const order:Order={id:"ord",number:"GE-1",accountId:"acc",cases:10,pricePerCase:24,amount:240,status:"Awaiting approval",placedAt:"2026-09-22",ownerId:REP,priceBasis:"test",paymentStatus:"Not invoiced"};assert.equal(reconcileOrders([order],[],approvals)[0].status,"Approved");});\n  test("Sales Manager cannot approve an order",()=>{assert.equal(canReviewApproval(data,users[1],pending),false);assert.equal(canReviewApproval(data,users[0],pending),true);});\n});\n\ndescribe("audit actor integrity",()=>{\n  test("passive changes without provenance are System, never the viewer",()=>{const before=collectAuditableRecords("Workspace",{orders:[{id:"ord",number:"GE-1",status:"Awaiting approval"}]});const after=collectAuditableRecords("Workspace",{orders:[{id:"ord",number:"GE-1",status:"Approved"}]});const[event]=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-22T17:00:00.000Z",users);assert.equal(event.actorId,"system");});\n  test("explicit decidedBy identifies the actual actor",()=>{const before=collectAuditableRecords("Workspace",{approvals:[{id:"apr",title:"Review",status:"Pending",requesterId:REP}]});const after=collectAuditableRecords("Workspace",{approvals:[{id:"apr",title:"Review",status:"Approved",requesterId:REP,decidedBy:ADMIN}]});const[event]=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-22T17:00:00.000Z",users);assert.equal(event.actorId,ADMIN);});\n});\n\ndescribe("notification classification",()=>{\n  const routine={id:"audit",at:"2026-09-22T17:00:00.000Z",actorId:REP,actorRole:"Sales Representative",action:"Updated" as const,module:"CRM",collection:"interactions",entityType:"CRM.interactions",entityId:"i",label:"Visit",summary:"Visit updated",sensitivity:"operational" as const,changes:[{field:"summary",before:"a",after:"b"}]};\n  test("routine audit movement does not ring the bell",()=>assert.equal(auditEventCreatesNotification(routine),false));\n  test("a newly pending approval is actionable",()=>assert.equal(auditEventCreatesNotification({...routine,action:"Created",module:"Workspace",collection:"approvals",changes:[{field:"status",after:"Pending"}]}),true));\n});\n''')

replace_once(
    "package.json",
    'tests/firebase-auth-routing.test.ts tests/delivery-driver.test.ts',
    'tests/firebase-auth-routing.test.ts tests/delivery-driver.test.ts tests/platform-integrity.test.ts',
)

print("PASS: platform integrity core v2 patch applied")
