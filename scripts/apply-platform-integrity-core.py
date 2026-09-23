from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"PATCH FAILED: expected text not found in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"PATCH FAILED: expected one match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def append_once(path: str, marker: str, addition: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if marker in text:
        print(f"already patched {path}")
        return
    target.write_text(text.rstrip() + "\n\n" + addition.strip() + "\n")
    print(f"patched {path}")


# ---------------------------------------------------------------------------
# 1. Approval records become self-describing decisions rather than anonymous
#    status flips. This is additive and stays inside the existing workspace /
#    commercial Firestore records.
# ---------------------------------------------------------------------------
replace_once(
    "lib/types.ts",
    '''  priority: ApprovalPriority;\n  status: ApprovalStatus;\n};''',
    '''  priority: ApprovalPriority;\n  status: ApprovalStatus;\n  /** The Administrator who made the final decision. Absent while pending or on legacy records. */\n  decidedBy?: string;\n  decidedAt?: string;\n  /** Required business correction when a record is returned for edits. */\n  returnReason?: string;\n};''',
)

# One Administrator decision is authoritative for sales orders. Sales Manager
# approval remains available for other manager-owned workflows such as timecards.
replace_once(
    "lib/access.ts",
    '''export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {\n  if (!user) return false;\n  if (user.role === "Administrator") return true;\n  if (user.role !== "Sales Manager") return false;\n  if (approval.requesterId && managedUserIds(data, user).has(approval.requesterId)) return approval.requesterId !== user.id;\n  return Boolean(approval.team && (user.managedTeams ?? []).includes(approval.team));\n};''',
    '''export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {\n  if (!user) return false;\n  // Orders require one Administrator decision. Once that record is decided, every Administrator sees\n  // the same final state rather than receiving a second approval task.\n  if (["Order", "Low stock sale"].includes(approval.type)) return user.role === "Administrator";\n  if (user.role === "Administrator") return true;\n  if (user.role !== "Sales Manager") return false;\n  if (approval.requesterId && managedUserIds(data, user).has(approval.requesterId)) return approval.requesterId !== user.id;\n  return Boolean(approval.team && (user.managedTeams ?? []).includes(approval.team));\n};''',
)

# ---------------------------------------------------------------------------
# 2. Canonical order/approval reconciliation. Production historically carried
#    both workspace and commercial records. A final decision must beat a stale
#    pending copy, and fulfillment statuses must never be downgraded.
# ---------------------------------------------------------------------------
(ROOT / "lib/order-approval-engine.ts").write_text('''import type { Approval, Order } from "./types";\n\nconst fulfillmentRank: Record<Order["status"], number> = {\n  Draft: 0,\n  "Awaiting approval": 1,\n  Approved: 2,\n  Allocated: 3,\n  "Out for delivery": 4,\n  Delivered: 5,\n  Paid: 6,\n};\n\nconst instant = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).getTime() : 0;\nconst isFinal = (approval: Approval) => approval.status !== "Pending";\n\n/** Prefer a final decision to a stale Pending replica. Between two final copies, prefer the later decision. */\nexport function canonicalApproval(a: Approval, b: Approval): Approval {\n  if (isFinal(a) !== isFinal(b)) return isFinal(a) ? a : b;\n  const aAt = instant(a.decidedAt) || instant(a.submittedAt);\n  const bAt = instant(b.decidedAt) || instant(b.submittedAt);\n  return bAt > aAt ? b : a;\n}\n\n/**\n * Merge approval arrays by approval id and by underlying order recordId. This deliberately returns only\n * one active Order/Low-stock approval per order. The original source copies remain in Firestore/audit history;\n * the operational workspace exposes one authoritative task.\n */\nexport function reconcileApprovals(primary: Approval[], secondary: Approval[]): Approval[] {\n  const byId = new Map<string, Approval>();\n  for (const item of [...secondary, ...primary]) {\n    const existing = byId.get(item.id);\n    byId.set(item.id, existing ? canonicalApproval(existing, item) : item);\n  }\n  const output: Approval[] = [];\n  const orderByRecord = new Map<string, Approval>();\n  for (const approval of byId.values()) {\n    if (!["Order", "Low stock sale"].includes(approval.type) || !approval.recordId) {\n      output.push(approval);\n      continue;\n    }\n    const existing = orderByRecord.get(approval.recordId);\n    orderByRecord.set(approval.recordId, existing ? canonicalApproval(existing, approval) : approval);\n  }\n  return [...orderByRecord.values(), ...output].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));\n}\n\nexport function approvalForOrder(approvals: Approval[], orderId: string) {\n  return approvals.find((approval) => approval.recordId === orderId && ["Order", "Low stock sale"].includes(approval.type));\n}\n\n/** Never let a stale approval/order replica move an order backward after fulfillment has started. */\nexport function reconcileOrderWithApproval(order: Order, approval?: Approval): Order {\n  if (!approval) return order;\n  if (approval.status === "Approved" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Approved" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Draft" };\n  return order;\n}\n\nexport function reconcileOrders(primary: Order[], secondary: Order[], approvals: Approval[]): Order[] {\n  const byId = new Map<string, Order>();\n  for (const order of [...secondary, ...primary]) {\n    const existing = byId.get(order.id);\n    if (!existing) { byId.set(order.id, order); continue; }\n    // Preserve the furthest legitimate fulfillment state while letting the newer copy supply other fields.\n    const advanced = fulfillmentRank[order.status] >= fulfillmentRank[existing.status] ? order : existing;\n    const other = advanced === order ? existing : order;\n    byId.set(order.id, { ...other, ...advanced });\n  }\n  return [...byId.values()].map((order) => reconcileOrderWithApproval(order, approvalForOrder(approvals, order.id)));\n}\n''')
print("wrote lib/order-approval-engine.ts")

# Commercial normalization retains decision provenance on persisted approval records.
replace_once(
    "lib/commercial-state.ts",
    '''    return [{ id, type: type as Approval["type"], title: text(raw.title), detail: text(raw.detail), requestedBy: text(raw.requestedBy), requesterId, recordId, team: raw.team === "Customer" ? "Sales" : ["Leadership", "Sales", "Operations"].includes(text(raw.team)) ? text(raw.team) as Approval["team"] : undefined, submittedAt: text(raw.submittedAt), dueAt: text(raw.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];''',
    '''    const decidedBy = optionalText(raw.decidedBy);\n    if (decidedBy && !userById.has(decidedBy)) return [];\n    if (!optionalValidInstant(raw.decidedAt)) return [];\n    return [{ id, type: type as Approval["type"], title: text(raw.title), detail: text(raw.detail), requestedBy: text(raw.requestedBy), requesterId, recordId, team: raw.team === "Customer" ? "Sales" : ["Leadership", "Sales", "Operations"].includes(text(raw.team)) ? text(raw.team) as Approval["team"] : undefined, submittedAt: text(raw.submittedAt), dueAt: text(raw.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"], decidedBy, decidedAt: optionalText(raw.decidedAt), returnReason: optionalText(raw.returnReason) }];''',
)

# Workspace normalization retains the same additive decision metadata.
# Use a narrow insertion after the status validation in the approvals block.
replace_once(
    "lib/workspace-normalization.ts",
    '''    return [{ id, type: type as Approval["type"], title: text(value.title), detail: text(value.detail), requestedBy: text(value.requestedBy), requesterId, recordId, team: teams.has(text(value.team)) ? text(value.team) as Approval["team"] : undefined, submittedAt: text(value.submittedAt), dueAt: text(value.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"] }];''',
    '''    const decidedBy = optionalText(value.decidedBy);\n    if (decidedBy && !userIds.has(decidedBy)) return [];\n    if (!optionalValidInstant(value.decidedAt)) return [];\n    return [{ id, type: type as Approval["type"], title: text(value.title), detail: text(value.detail), requestedBy: text(value.requestedBy), requesterId, recordId, team: teams.has(text(value.team)) ? text(value.team) as Approval["team"] : undefined, submittedAt: text(value.submittedAt), dueAt: text(value.dueAt), priority: priority as Approval["priority"], status: status as Approval["status"], decidedBy, decidedAt: optionalText(value.decidedAt), returnReason: optionalText(value.returnReason) }];''',
)

# Enhanced workspace: reconcile split records instead of blindly letting one store shadow the other.
replace_once(
    "lib/workspace-context.tsx",
    '''import { paidAccountRollupAfterPayment } from "./workspace-controls";''',
    '''import { paidAccountRollupAfterPayment } from "./workspace-controls";\nimport { reconcileApprovals, reconcileOrders } from "./order-approval-engine";''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    const orderIds = new Set(commercial.orders.map((order) => order.id));\n    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    return {\n      ...base.data,\n      users,\n      inventory,\n      accounts,\n      territories:commercial.territories,\n      orders: [...commercial.orders, ...baseOrders.filter((order) => !orderIds.has(order.id))],\n      appointments: [...commercial.appointments, ...base.data.appointments.filter((item) => !appointmentIds.has(item.id))],\n      approvals: [...commercial.approvals, ...base.data.approvals.filter((approval) => !commercial.approvals.some((entry) => entry.id === approval.id))],\n      activities: [...commercial.activities, ...base.data.activities],\n    };''',
    '''    const appointmentIds = new Set(commercial.appointments.map((item) => item.id));\n    const approvals = reconcileApprovals(commercial.approvals, base.data.approvals);\n    const orders = reconcileOrders(commercial.orders, baseOrders, approvals);\n    return {\n      ...base.data,\n      users,\n      inventory,\n      accounts,\n      territories:commercial.territories,\n      orders,\n      appointments: [...commercial.appointments, ...base.data.appointments.filter((item) => !appointmentIds.has(item.id))],\n      approvals,\n      activities: [...commercial.activities, ...base.data.activities],\n    };''',
)

# Approval decisions now retain actor/time/reason and flush promptly. A Returned order receives an explicit
# correction reason instead of silently turning into a Draft with no explanation.
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({ ...state, approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision } : item), orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order) }));\n  };''',
    '''    let returnReason: string | undefined;\n    if (decision === "Returned") {\n      if (typeof window === "undefined") return;\n      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();\n      if (!returnReason || returnReason.length < 3) return;\n    }\n    const decidedAt = now();\n    setCommercial((state) => ({\n      ...state,\n      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),\n      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,\n    }));\n    window.setTimeout(() => void momentumStorage.flush(), 0);\n  };''',
)

# Base workspace receives identical decision provenance for legacy/base orders. Stop creating a second legacy
# bell item here; actionable notifications are generated from the authoritative audit decision instead.
replace_once(
    "lib/workspace-context-v5.tsx",
    '''      return {\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision } : item),\n        orders: current.orders.map((order) => approval.type === "Order" && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        notifications: [{ id: `note-${Date.now()}`, title: `${approval.type} ${decision.toLowerCase()}`, detail: approval.title, at: nowStamp(), readBy: [], tone: decision === "Approved" ? "success" : "warning", audienceUserIds: approval.requesterId ? [approval.requesterId] : undefined }, ...current.notifications],\n      };''',
    '''      const decidedAt = nowStamp();\n      return {\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt } : item),\n        orders: current.orders.map((order) => ["Order", "Low stock sale"].includes(approval.type) && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        activities: approval.recordId ? [{ id: `act-${Date.now()}`, accountId: current.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: `${approval.title} ${decision.toLowerCase()} by ${currentUser.name}.`, at: decidedAt, userId: currentUser.id }, ...current.activities] : current.activities,\n      };''',
)

# New base/demo orders no longer create their own parallel legacy notification. The approval audit event is the
# one notification source. This removes double-bell behavior while preserving the approval itself.
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

# ---------------------------------------------------------------------------
# 3. Passive Firestore synchronization must never claim the current viewer made
#    someone else's change. Infer an actor only from explicit provenance fields;
#    otherwise record the sync as System.
# ---------------------------------------------------------------------------
replace_once(
    "lib/audit-engine.ts",
    '''export function diffAuditableRecords(previous: Map<string, AuditSnapshot>, current: Map<string, AuditSnapshot>, actor: { id: string; role: string }, at = new Date().toISOString()): AuditEvent[] { const events: AuditEvent[] = []; const keys = new Set([...previous.keys(), ...current.keys()]); let sequence = 0; for (const key of keys) { const before = previous.get(key); const after = current.get(key); if (before && after) { let same = false; try { same = JSON.stringify(before.payload) === JSON.stringify(after.payload); } catch { same = false; } if (same) continue; } const snapshot = after ?? before; if (!snapshot) continue; const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated"; const changes = changeList(before?.payload, after?.payload); const changedFields = changes.map((item) => item.field).join(", "); events.push({ id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`, at, actorId: actor.id, actorRole: actor.role, action, module: snapshot.module, collection: snapshot.collection, entityType: snapshot.entityType, entityId: snapshot.entityId, label: snapshot.label, summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`, sensitivity: snapshot.sensitivity, relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId, relatedUserId: after?.relatedUserId ?? before?.relatedUserId, changes }); } return events; }''',
    '''const provenanceFields = ["decidedBy", "approvedBy", "fulfilledBy", "reviewedBy", "resolvedBy", "returnedBy", "approverId", "updatedBy", "changedBy", "actorId", "assignedBy", "createdBy", "submittedBy", "provisionedBy", "requesterId"] as const;\nfunction inferredActorId(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"], changes: AuditChange[]) {\n  const payload = after?.payload ?? before?.payload;\n  if (!payload) return undefined;\n  if (action === "Updated") {\n    const changed = new Set(changes.map((item) => item.field));\n    for (const field of provenanceFields) {\n      if (!changed.has(field)) continue;\n      const value = text(payload[field]);\n      if (value) return value;\n    }\n  }\n  for (const field of provenanceFields) {\n    const value = text(payload[field]);\n    if (value) return value;\n  }\n  return undefined;\n}\n\nexport function diffAuditableRecords(previous: Map<string, AuditSnapshot>, current: Map<string, AuditSnapshot>, actor: { id: string; role: string }, at = new Date().toISOString(), users: WorkspaceUser[] = []): AuditEvent[] { const events: AuditEvent[] = []; const keys = new Set([...previous.keys(), ...current.keys()]); let sequence = 0; for (const key of keys) { const before = previous.get(key); const after = current.get(key); if (before && after) { let same = false; try { same = JSON.stringify(before.payload) === JSON.stringify(after.payload); } catch { same = false; } if (same) continue; } const snapshot = after ?? before; if (!snapshot) continue; const action: AuditEvent["action"] = !before ? "Created" : !after ? "Deleted" : "Updated"; const changes = changeList(before?.payload, after?.payload); const inferredId = inferredActorId(before, after, action, changes); const inferredUser = inferredId ? users.find((user) => user.id === inferredId) : undefined; const resolvedActor = inferredId ? { id: inferredId, role: inferredUser?.role ?? "Recorded user" } : actor; const changedFields = changes.map((item) => item.field).join(", "); events.push({ id: `audit-${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2, 6)}`, at, actorId: resolvedActor.id, actorRole: resolvedActor.role, action, module: snapshot.module, collection: snapshot.collection, entityType: snapshot.entityType, entityId: snapshot.entityId, label: snapshot.label, summary: action === "Updated" ? `${snapshot.label} updated${changedFields ? `: ${changedFields}` : ""}` : `${snapshot.label} ${action.toLowerCase()}`, sensitivity: snapshot.sensitivity, relatedAccountId: after?.relatedAccountId ?? before?.relatedAccountId, relatedUserId: after?.relatedUserId ?? before?.relatedUserId, changes }); } return events; }''',
)
replace_once(
    "lib/audit-context.tsx",
    '''    const actor = { id: currentUser?.id ?? "system", role: currentUser?.role ?? "System" };\n    const additions = diffAuditableRecords(previous.current, snapshots, actor);''',
    '''    // Snapshot changes may have arrived from another browser. Never guess that the current viewer caused\n    // them. Explicit provenance fields identify the actor when available; otherwise the event is System.\n    const additions = diffAuditableRecords(previous.current, snapshots, { id: "system", role: "System" }, new Date().toISOString(), data.users);''',
)
replace_once(
    "lib/audit-context.tsx",
    '''  }, [snapshots, currentUser]);''',
    '''  }, [snapshots, data.users]);''',
)

# ---------------------------------------------------------------------------
# 4. Notifications are action items, not a second audit log.
# ---------------------------------------------------------------------------
replace_once(
    "lib/notification-engine.ts",
    '''export function auditEventCreatesNotification(event: AuditEvent) {\n  if (event.module !== "Field tracking") return true;\n  return event.collection === "departureAlerts" && event.action === "Created";\n}''',
    '''const changedTo = (event: AuditEvent, field: string, value: string) => event.changes.some((change) => change.field === field && change.after === value);\n\n/**\n * The bell is an action queue, not an audit mirror. Routine creates/edits remain fully visible in Audit but\n * never create a bell item. Email/SMS use this same gate when those integrations are enabled later.\n */\nexport function auditEventCreatesNotification(event: AuditEvent) {\n  if (event.module === "Field tracking") return event.collection === "departureAlerts" && event.action === "Created";\n  if (event.collection === "approvals") {\n    if (event.action === "Created") return changedTo(event, "status", "Pending");\n    return event.action === "Updated" && changedTo(event, "status", "Returned");\n  }\n  if (event.collection === "timecards") return event.action === "Updated" && (changedTo(event, "status", "Submitted") || changedTo(event, "status", "Returned"));\n  if (event.module === "Marketing" && event.collection === "requests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  if (event.module === "HCM" && event.collection === "leaveRequests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  if (event.module === "Identity" && event.collection === "drafts") return event.action === "Updated" && changedTo(event, "status", "Failed");\n  return false;\n}''',
)

# Special-case approval recipient routing before the existing generic resolver logic.
replace_once(
    "lib/notification-engine.ts",
    '''export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {\n  const recipients = new Set<string>();''',
    '''export function resolveNotificationRecipients(event: AuditEvent, data: WorkspaceData): string[] {\n  const recipients = new Set<string>();\n  if (event.collection === "approvals" && event.action === "Created") {\n    for (const user of data.users) if (user.role === "Administrator") recipients.add(user.id);\n    recipients.delete(event.actorId);\n    return [...recipients];\n  }\n  if (event.collection === "approvals" && event.action === "Updated" && event.relatedUserId) {\n    if (event.relatedUserId !== event.actorId && data.users.some((user) => user.id === event.relatedUserId)) recipients.add(event.relatedUserId);\n    return [...recipients];\n  }''',
)

# Prune old audit-derived noise from the generated delivery list. It remains in Audit; only the bell clears.
replace_once(
    "lib/notification-context-v2.tsx",
    '''      const sourceEvents = audit.events.slice(0, 500).filter(auditEventCreatesNotification);\n      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));\n      let copyChanged = false;\n      const refreshed = current.deliveries.map((delivery) => {''',
    '''      const sourceEvents = audit.events.slice(0, 500).filter(auditEventCreatesNotification);\n      const eventById = new Map(sourceEvents.map((event) => [event.id, event]));\n      const auditEventIds = new Set(audit.events.slice(0, 500).map((event) => event.id));\n      // Historical deliveries generated from routine audit events are removed from the bell only. Their source\n      // events remain intact in the Audit trail. Non-audit alerts (inventory thresholds, escalation records) stay.\n      const retainedDeliveries = current.deliveries.filter((delivery) => !auditEventIds.has(delivery.sourceEventId) || eventById.has(delivery.sourceEventId));\n      let copyChanged = retainedDeliveries.length !== current.deliveries.length;\n      const refreshed = retainedDeliveries.map((delivery) => {''',
)

# Stop mixing the deprecated workspace notification feed into the live bell. Audit + actionable generated
# notifications are now the operational source; legacy records remain preserved in workspace history.
replace_once(
    "components/app-shell-v4.tsx",
    '''  const legacyUnread = currentUser.role === "Customer" ? 0 : scope.notifications.filter((item) => !item.readBy.includes(currentUser.id)).length; const unread = legacyUnread + generated.unreadCount;''',
    '''  const unread = generated.unreadCount;''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''{generated.currentUserItems.slice(0, 8).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · automated rule</small></div></article>)}{scope.notifications.slice(0, 6).map((notification) => { const unreadItem = !notification.readBy.includes(currentUser.id); return <article key={notification.id} className={unreadItem ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.at, { hour: "numeric", minute: "2-digit" })}</small></div></article>; })}{generated.currentUserItems.length === 0 && scope.notifications.length === 0 && <div className="popover-empty">No notifications.</div>}''',
    '''{generated.currentUserItems.slice(0, 12).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · action notification</small></div></article>)}{generated.currentUserItems.length === 0 && <div className="popover-empty">No action notifications. Routine activity stays in Audit.</div>}''',
)

# ---------------------------------------------------------------------------
# 5. Cross-browser coherence. Five-second meta polling keeps active workspaces
#    close without changing Firebase architecture. High-value writes already flush.
# ---------------------------------------------------------------------------
replace_once(
    "lib/firebase-session-context.tsx",
    '''    await attachFirestorePersistence({scope,onDirectoryChange:()=>{''',
    '''    await attachFirestorePersistence({scope,pollIntervalMs:5_000,onDirectoryChange:()=>{''',
)

# ---------------------------------------------------------------------------
# 6. CRM dependency-lag hardening. Intrinsically valid records survive when a
#    dependent account/customer/user shard has not arrived yet. UI relationship
#    resolution can catch up on the next Firestore poll without erasing source data.
# ---------------------------------------------------------------------------
replace_once(
    "lib/crm-engine.ts",
    '''    if (!id || seen.has(id) || !locationById.has(locationId) || !userIds.has(userId) || !interactionTypes.has(type) || !text(record.summary) || !instant(record.occurredAt) || !optionalDate(record.nextActionDate) || (record.contactId && !contactById.has(record.contactId))) return [];''',
    '''    if (!id || seen.has(id) || !locationId || !userId || !interactionTypes.has(type) || !text(record.summary) || !instant(record.occurredAt) || !optionalDate(record.nextActionDate)) return [];''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    if (!id || seen.has(id) || !customerIds.has(customerId) || (locationId && !locationById.has(locationId)) || !contactScopes.has(scope) || !decisionRoles.has(decisionRole) || !text(record.name) || !text(record.role) || typeof record.primary !== "boolean" || typeof record.active !== "boolean" || !instant(record.createdAt) || !userIds.has(text(record.createdBy))) return [];''',
    '''    if (!id || seen.has(id) || !customerId || !contactScopes.has(scope) || !decisionRoles.has(decisionRole) || !text(record.name) || !text(record.role) || typeof record.primary !== "boolean" || typeof record.active !== "boolean" || !instant(record.createdAt) || !text(record.createdBy)) return [];''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    if (!id || seen.has(id) || !customerIds.has(customerId) || !locationById.has(locationId) || !userIds.has(ownerId) || !opportunityStages.has(stage) || !opportunityStatuses.has(status) || !text(record.name) || !instant(record.createdAt) || !instant(record.updatedAt) || !userIds.has(text(record.createdBy))) return [];''',
    '''    if (!id || seen.has(id) || !customerId || !locationId || !ownerId || !opportunityStages.has(stage) || !opportunityStatuses.has(status) || !text(record.name) || !instant(record.createdAt) || !instant(record.updatedAt) || !text(record.createdBy)) return [];''',
)
replace_once(
    "lib/crm-engine.ts",
    '''    if (!id || seen.has(id) || !locationById.has(locationId) || (fromUserId && !userIds.has(fromUserId)) || !userIds.has(toUserId) || !instant(record.effectiveAt) || !text(record.reason) || !userIds.has(text(record.changedBy))) return [];''',
    '''    if (!id || seen.has(id) || !locationId || !toUserId || !instant(record.effectiveAt) || !text(record.reason) || !text(record.changedBy)) return [];''',
)

# CRM writes are business records, so force a near-immediate Firestore flush like workspace/commercial writes.
replace_once(
    "lib/crm-context.tsx",
    '''  useEffect(() => {\n    if (typeof window !== "undefined") momentumStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(state));\n  }, [state]);''',
    '''  useEffect(() => {\n    if (typeof window !== "undefined") {\n      momentumStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(state));\n      void momentumStorage.flush();\n    }\n  }, [state]);''',
)

# ---------------------------------------------------------------------------
# 7. Regression tests for the exact failure modes reported in production.
# ---------------------------------------------------------------------------
append_once(
    "tests/post-launch-regressions.test.ts",
    'describe("platform integrity regressions"',
    '''import { canReviewApproval } from "../lib/access";\nimport { collectAuditableRecords, diffAuditableRecords } from "../lib/audit-engine";\nimport { reconcileApprovals, reconcileOrders } from "../lib/order-approval-engine";\nimport { auditEventCreatesNotification } from "../lib/notification-engine";\n\ndescribe("platform integrity regressions", () => {\n  test("one Administrator order decision beats a stale Pending replica", () => {\n    const pending = { id:"apr-order", type:"Order" as const, title:"Review order GE-2000", detail:"10 cases", requestedBy:"Rep Alpha", requesterId:REP_A, recordId:"ord-2000", team:"Sales" as const, submittedAt:"2026-09-22T16:00:00.000Z", dueAt:"2026-09-23T16:00:00.000Z", priority:"High" as const, status:"Pending" as const };\n    const approved = { ...pending, status:"Approved" as const, decidedBy:ADMIN_ID, decidedAt:"2026-09-22T16:05:00.000Z" };\n    const approvals = reconcileApprovals([pending], [approved]);\n    assert.equal(approvals.length, 1);\n    assert.equal(approvals[0].status, "Approved");\n    const order = { id:"ord-2000", number:"GE-2000", accountId:"acc-1", cases:10, pricePerCase:24, amount:240, status:"Awaiting approval" as const, placedAt:"2026-09-22", ownerId:REP_A, priceBasis:"Test", paymentStatus:"Not invoiced" as const };\n    assert.equal(reconcileOrders([order], [], approvals)[0].status, "Approved");\n  });\n\n  test("Sales Managers cannot approve orders but Administrators can", () => {\n    const data = emptyWorkspace([admin, repA, user("uid-manager", "Sales Manager", { role:"Sales Manager", title:"Sales Manager", managedTeams:["Sales"] })]);\n    const approval = { id:"apr-order", type:"Order" as const, title:"Review order", detail:"10 cases", requestedBy:"Rep Alpha", requesterId:REP_A, recordId:"ord-1", team:"Sales" as const, submittedAt:"2026-09-22T16:00:00.000Z", dueAt:"2026-09-23T16:00:00.000Z", priority:"High" as const, status:"Pending" as const };\n    assert.equal(canReviewApproval(data, data.users.find((item)=>item.role==="Sales Manager")!, approval), false);\n    assert.equal(canReviewApproval(data, admin, approval), true);\n  });\n\n  test("passive remote changes are never attributed to the current viewer without provenance", () => {\n    const before = collectAuditableRecords("Workspace", { orders:[{ id:"ord-1", number:"GE-1", status:"Awaiting approval" }] });\n    const after = collectAuditableRecords("Workspace", { orders:[{ id:"ord-1", number:"GE-1", status:"Approved" }] });\n    const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-09-22T17:00:00.000Z", [admin, repA]);\n    assert.equal(event.actorId, "system");\n  });\n\n  test("explicit decidedBy provenance identifies the real actor", () => {\n    const before = collectAuditableRecords("Workspace", { approvals:[{ id:"apr-1", title:"Review GE-1", status:"Pending", requesterId:REP_A }] });\n    const after = collectAuditableRecords("Workspace", { approvals:[{ id:"apr-1", title:"Review GE-1", status:"Approved", requesterId:REP_A, decidedBy:ADMIN_ID }] });\n    const [event] = diffAuditableRecords(before, after, { id:"system", role:"System" }, "2026-09-22T17:00:00.000Z", [admin, repA]);\n    assert.equal(event.actorId, ADMIN_ID);\n  });\n\n  test("routine audit movement stays out of the notification bell", () => {\n    const routine = { id:"audit-1", at:"2026-09-22T17:00:00.000Z", actorId:REP_A, actorRole:"Sales Representative", action:"Updated" as const, module:"CRM", collection:"interactions", entityType:"CRM.interactions", entityId:"i-1", label:"Visit", summary:"Visit updated", sensitivity:"operational" as const, changes:[{field:"summary",before:"A",after:"B"}] };\n    assert.equal(auditEventCreatesNotification(routine), false);\n    assert.equal(auditEventCreatesNotification({ ...routine, action:"Created", module:"Workspace", collection:"approvals", changes:[{field:"status",after:"Pending"}] }), true);\n  });\n});''',
)

# package test script must include any new dedicated test file only if one is created; these regressions live in
# the already-included post-launch suite, so no package change is required.

print("PASS: platform integrity core patch applied")
