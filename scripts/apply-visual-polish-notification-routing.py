from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH FAILED: expected one match in {path}, found {count}: {old[:180]!r}")
    target.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def append_once(path: str, marker: str, addition: str) -> None:
    target = ROOT / path
    text = target.read_text()
    if marker in text:
        print(f"already present in {path}: {marker}")
        return
    target.write_text(text.rstrip() + "\n\n" + addition.rstrip() + "\n")
    print(f"appended {path}")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    print(f"wrote {path}")


# ---------------------------------------------------------------------------
# 1. Audit ownership: never attribute a passive update to a stale requester,
# owner, or whoever happens to be looking at the record.
# ---------------------------------------------------------------------------
replace_once(
    "lib/audit-engine.ts",
    '''const provenanceFields = ["decidedBy", "approvedBy", "fulfilledBy", "reviewedBy", "resolvedBy", "returnedBy", "approverId", "updatedBy", "changedBy", "actorId", "assignedBy", "createdBy", "submittedBy", "provisionedBy", "requesterId"] as const;\nfunction inferredActorId(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"], changes: AuditChange[]) {\n  const snapshot=after??before;const payload = snapshot?.payload;\n  if (!payload||!snapshot) return undefined;\n  if ((snapshot.module==="CRM"&&snapshot.collection==="interactions")||(snapshot.module==="Workspace"&&snapshot.collection==="activities")) { const worker=text(payload.userId); if(worker)return worker; }\n  if (action === "Updated") {\n    const changed = new Set(changes.map((item) => item.field));\n    for (const field of provenanceFields) { const value = changed.has(field) ? text(payload[field]) : undefined; if (value) return value; }\n  }\n  for (const field of provenanceFields) { const value = text(payload[field]); if (value) return value; }\n  return undefined;\n}''',
    '''const creationActorFields = ["createdBy", "submittedBy", "requesterId", "ownerId", "userId", "actorId", "provisionedBy"] as const;\nconst mutationActorFields = ["decidedBy", "approvedBy", "fulfilledBy", "reviewedBy", "resolvedBy", "returnedBy", "cancelledBy", "deletedBy", "approverId", "updatedBy", "changedBy", "actorId", "assignedBy", "claimedBy", "completedBy"] as const;\nfunction changedActor(payload:Record<string,unknown>,changes:AuditChange[],fields:readonly string[]){const changed=new Set(changes.map((item)=>item.field));for(const field of fields){const value=changed.has(field)?text(payload[field]):undefined;if(value)return value;}return undefined;}\nfunction inferredActorId(before: AuditSnapshot | undefined, after: AuditSnapshot | undefined, action: AuditEvent["action"], changes: AuditChange[]) {\n  const snapshot=after??before;const payload = snapshot?.payload;\n  if (!payload||!snapshot) return undefined;\n  if ((snapshot.module==="CRM"&&snapshot.collection==="interactions")||(snapshot.module==="Workspace"&&snapshot.collection==="activities")) { const worker=text(payload.userId); if(worker)return worker; }\n  if (action === "Created") { for (const field of creationActorFields) { const value=text(payload[field]); if(value)return value; } return undefined; }\n  if (action === "Updated") return changedActor(payload,changes,mutationActorFields);\n  if (action === "Deleted") return text(payload.deletedBy);\n  return undefined;\n}''',
)

# ---------------------------------------------------------------------------
# 2. Notification actions: verified actor copy, stale-action cleanup, and
# exact navigation targets.
# ---------------------------------------------------------------------------
replace_once(
    "lib/notification-engine.ts",
    'import type { Account, WorkspaceData, WorkspaceUser } from "./types";',
    'import type { Account, PageKey, WorkspaceData, WorkspaceUser } from "./types";',
)
replace_once(
    "lib/notification-engine.ts",
    'export type NotificationDelivery = { id: string; sourceEventId: string; recipientUserId: string; channel: NotificationChannel; title: string; detail: string; tone: "info" | "warning" | "success"; createdAt: string; status: "Unread" | "Read" | "Awaiting integration" | "Sent" | "Failed"; readAt?: string; escalatedAt?: string; escalationOf?: string };',
    'export type NotificationDelivery = { id: string; sourceEventId: string; recipientUserId: string; channel: NotificationChannel; title: string; detail: string; tone: "info" | "warning" | "success"; createdAt: string; status: "Unread" | "Read" | "Awaiting integration" | "Sent" | "Failed"; readAt?: string; escalatedAt?: string; escalationOf?: string; targetPage?: PageKey; targetRecordId?: string; actionLabel?: string };',
)
replace_once(
    "lib/notification-engine.ts",
    '''  if (event.module === "HCM" && event.collection === "leaveRequests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  return false;\n}\n\nconst collectionNames:''',
    '''  if (event.module === "HCM" && event.collection === "leaveRequests") return event.action === "Created" || (event.action === "Updated" && changedTo(event, "status", "Returned"));\n  return false;\n}\n\nexport type NotificationTarget={targetPage:PageKey;targetRecordId?:string;actionLabel:string};\nexport function notificationTarget(event:AuditEvent,data:WorkspaceData):NotificationTarget|null{\n  if(event.collection==="approvals"){\n    const approval=data.approvals.find((item)=>item.id===event.entityId);\n    if(!approval)return null;\n    if(event.action==="Created"&&approval.status!=="Pending")return null;\n    if(event.action==="Updated"&&changedTo(event,"status","Returned")&&approval.status!=="Returned")return null;\n    if(["Order","Low stock sale"].includes(approval.type)){\n      if(!approval.recordId||!data.orders.some((order)=>order.id===approval.recordId))return null;\n      return{targetPage:"orders",targetRecordId:approval.recordId,actionLabel:approval.status==="Pending"?"Review order":"Open order"};\n    }\n    if(approval.type==="Territory exception")return{targetPage:"salesMap",targetRecordId:approval.recordId,actionLabel:"Review territory exception"};\n    return{targetPage:"work",targetRecordId:approval.id,actionLabel:"Open approval"};\n  }\n  if(event.collection==="timecards"){\n    const card=data.timecards.find((item)=>item.id===event.entityId);if(!card)return null;\n    if(changedTo(event,"status","Submitted")&&card.status!=="Submitted")return null;\n    if(changedTo(event,"status","Returned")&&card.status!=="Returned")return null;\n    return{targetPage:"timekeeping",targetRecordId:card.id,actionLabel:"Open timecard"};\n  }\n  if(event.module==="Marketing"&&event.collection==="requests")return{targetPage:"marketing",targetRecordId:event.entityId,actionLabel:"Open marketing request"};\n  if(event.module==="HCM"&&event.collection==="leaveRequests")return{targetPage:"people",targetRecordId:event.entityId,actionLabel:"Open HR request"};\n  if(event.module==="Field tracking"&&event.collection==="departureAlerts")return{targetPage:"dispatch",targetRecordId:event.entityId,actionLabel:"Open dispatch"};\n  return null;\n}\n\nconst collectionNames:''',
)
replace_once(
    "lib/notification-engine.ts",
    '''const actorName = (event: AuditEvent, data?: WorkspaceData) => data?.users.find((user) => user.id === event.actorId)?.firstName || data?.users.find((user) => user.id === event.actorId)?.name || "A team member";''',
    '''const notificationCreationActors=new Set(["createdBy","submittedBy","requesterId","ownerId","userId","actorId","provisionedBy"]);\nconst notificationMutationActors=new Set(["decidedBy","approvedBy","fulfilledBy","reviewedBy","resolvedBy","returnedBy","cancelledBy","deletedBy","approverId","updatedBy","changedBy","actorId","assignedBy","claimedBy","completedBy"]);\nconst notificationActorVerified=(event:AuditEvent)=>{if(event.actorId==="system")return false;if(event.id.startsWith("audit-manual-"))return true;const fields=event.action==="Created"?notificationCreationActors:notificationMutationActors;return event.changes.some((change)=>fields.has(change.field)&&change.after===event.actorId);};\nconst actorName = (event: AuditEvent, data?: WorkspaceData) => notificationActorVerified(event) ? (data?.users.find((user) => user.id === event.actorId)?.firstName || data?.users.find((user) => user.id === event.actorId)?.name || "A team member") : "A team member";''',
)

# ---------------------------------------------------------------------------
# 3. Notification context keeps only currently-actionable audit notifications,
# refreshes routes, supports single-read, and gives synthetic alerts routes too.
# ---------------------------------------------------------------------------
replace_once(
    "lib/notification-context-v2.tsx",
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, compactNotificationDeliveries, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";',
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, compactNotificationDeliveries, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, notificationTarget, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";',
)
replace_once(
    "lib/notification-context-v2.tsx",
    'type NotificationContextValue = { state: NotificationState; currentUserItems: NotificationDelivery[]; unreadCount: number; updatePreference: (userId: string, patch: Partial<NotificationPreference>) => boolean; setEscalationHours: (hours: number) => boolean; markAllRead: () => void; resetNotifications: () => boolean };',
    'type NotificationContextValue = { state: NotificationState; currentUserItems: NotificationDelivery[]; unreadCount: number; updatePreference: (userId: string, patch: Partial<NotificationPreference>) => boolean; setEscalationHours: (hours: number) => boolean; markRead: (id:string) => void; markAllRead: () => void; resetNotifications: () => boolean };',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '      const sourceEvents = auditWindow.filter(auditEventCreatesNotification).slice(0,500);',
    '      const sourceEvents = auditWindow.filter((event)=>auditEventCreatesNotification(event)&&notificationTarget(event,data)!==null).slice(0,500);',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''        const copy = notificationCopy(event, data);\n        if (delivery.title === copy.title && delivery.detail === copy.detail && delivery.tone === copy.tone) return delivery;\n        copyChanged = true;\n        return { ...delivery, title: copy.title, detail: copy.detail, tone: copy.tone };''',
    '''        const copy = notificationCopy(event, data);\n        const target=notificationTarget(event,data);\n        if(!target)return delivery;\n        if (delivery.title === copy.title && delivery.detail === copy.detail && delivery.tone === copy.tone && delivery.targetPage===target.targetPage && delivery.targetRecordId===target.targetRecordId && delivery.actionLabel===target.actionLabel) return delivery;\n        copyChanged = true;\n        return { ...delivery, title: copy.title, detail: copy.detail, tone: copy.tone, ...target };''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''      for (const event of sourceEvents) {\n        const copy = notificationCopy(event, data);\n        for (const userId of resolveNotificationRecipients(event, data)) {''',
    '''      for (const event of sourceEvents) {\n        const copy = notificationCopy(event, data);\n        const target=notificationTarget(event,data);if(!target)continue;\n        for (const userId of resolveNotificationRecipients(event, data)) {''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''            additions.push({ id: uid("notice"), sourceEventId: event.id, recipientUserId: userId, channel, title: copy.title, detail: copy.detail, tone: copy.tone, createdAt: event.at, status: channel === "In app" ? "Unread" : "Awaiting integration" });''',
    '''            additions.push({ id: uid("notice"), sourceEventId: event.id, recipientUserId: userId, channel, title: copy.title, detail: copy.detail, tone: copy.tone, createdAt: event.at, status: channel === "In app" ? "Unread" : "Awaiting integration", ...target });''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''            additions.push({ id: uid("stock-alert"), sourceEventId, recipientUserId, channel, title, detail, tone: "warning", createdAt: new Date().toISOString(), status: channel === "In app" ? "Unread" : "Awaiting integration" });''',
    '''            additions.push({ id: uid("stock-alert"), sourceEventId, recipientUserId, channel, title, detail, tone: "warning", createdAt: new Date().toISOString(), status: channel === "In app" ? "Unread" : "Awaiting integration", targetPage:"inventory", actionLabel:"Open inventory fulfillment" });''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''additions.push({id:uid("pricing-alert"),sourceEventId,recipientUserId,channel,title,detail,tone:"warning",createdAt:new Date().toISOString(),status:channel==="In app"?"Unread":"Awaiting integration"});''',
    '''additions.push({id:uid("pricing-alert"),sourceEventId,recipientUserId,channel,title,detail,tone:"warning",createdAt:new Date().toISOString(),status:channel==="In app"?"Unread":"Awaiting integration",targetPage:"accounts",targetRecordId:account.id,actionLabel:"Open account"});''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''for (const recipientUserId of recipients) { additions.push({ id: uid("escalation"), sourceEventId: delivery.sourceEventId, recipientUserId, channel: "In app", title: `Needs attention: ${delivery.title}`, detail: `${user?.name ?? "A team member"} has not opened this notification within the ${current.escalationHours}-hour follow-up window.`, tone: "warning", createdAt: checkedAt, status: "Unread", escalationOf: delivery.id }); created = true; }''',
    '''for (const recipientUserId of recipients) { additions.push({ id: uid("escalation"), sourceEventId: delivery.sourceEventId, recipientUserId, channel: "In app", title: `Needs attention: ${delivery.title}`, detail: `${user?.name ?? "A team member"} has not opened this notification within the ${current.escalationHours}-hour follow-up window.`, tone: "warning", createdAt: checkedAt, status: "Unread", escalationOf: delivery.id, targetPage:delivery.targetPage, targetRecordId:delivery.targetRecordId, actionLabel:delivery.actionLabel }); created = true; }''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''  const markAllRead = () => { if (!currentUser) return; const at = new Date().toISOString(); setState((current) => ({ ...current, deliveries: current.deliveries.map((item) => item.recipientUserId === currentUser.id && item.channel === "In app" && item.status === "Unread" ? { ...item, status: "Read", readAt: at } : item) })); };''',
    '''  const markRead = (id:string) => { if(!currentUser)return;const at=new Date().toISOString();setState((current)=>({...current,deliveries:current.deliveries.map((item)=>item.id===id&&item.recipientUserId===currentUser.id&&item.channel==="In app"&&item.status==="Unread"?{...item,status:"Read",readAt:at}:item)})); };\n  const markAllRead = () => { if (!currentUser) return; const at = new Date().toISOString(); setState((current) => ({ ...current, deliveries: current.deliveries.map((item) => item.recipientUserId === currentUser.id && item.channel === "In app" && item.status === "Unread" ? { ...item, status: "Read", readAt: at } : item) })); };''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '''  return <NotificationContext.Provider value={{ state, currentUserItems, unreadCount, updatePreference, setEscalationHours, markAllRead, resetNotifications }}>{children}</NotificationContext.Provider>;''',
    '''  return <NotificationContext.Provider value={{ state, currentUserItems, unreadCount, updatePreference, setEscalationHours, markRead, markAllRead, resetNotifications }}>{children}</NotificationContext.Provider>;''',
)

# ---------------------------------------------------------------------------
# 4. Notification UI is clickable/actionable. CRM Tools is retired.
# ---------------------------------------------------------------------------
replace_once(
    "components/app-shell-v4.tsx",
    'import { AccountHealthPage, AccountingWorkspacePage, ActionCenterPage, AuditWorkspacePage, CrmToolsPage, DataExchangePage, EmployeeDirectoryPage, InventoryLedgerPage, NewHirePage, OnboardingQueuePage, OrderCashPage, PerformanceWorkspacePage, ReportingCenterPage, TrainingSetupPage } from "./pages/focused-workspace-pages";',
    'import { AccountHealthPage, AccountingWorkspacePage, ActionCenterPage, AuditWorkspacePage, DataExchangePage, EmployeeDirectoryPage, InventoryLedgerPage, NewHirePage, OnboardingQueuePage, OrderCashPage, PerformanceWorkspacePage, ReportingCenterPage, TrainingSetupPage } from "./pages/focused-workspace-pages";',
)
replace_once(
    "components/app-shell-v4.tsx",
    '  accounts: [{key:"accounts",label:"Accounts"},{key:"quickVisit",label:"Quick Visit"},{key:"salesMap",label:"Map"},{key:"accountSetup",label:"Account setup"},{key:"accountHealth",label:"Account health"},{key:"crmTools",label:"CRM tools"}],',
    '  accounts: [{key:"accounts",label:"Accounts"},{key:"quickVisit",label:"Quick Visit"},{key:"salesMap",label:"Map"},{key:"accountSetup",label:"Account setup"},{key:"accountHealth",label:"Account health"}],',
)
replace_once(
    "components/app-shell-v4.tsx",
    '  actions:"work", quickVisit:"accounts", salesMap:"accounts", accountSetup:"accounts", accountHealth:"accounts", crmTools:"accounts", orderCash:"orders", inventoryLedger:"inventory",',
    '  actions:"work", quickVisit:"accounts", salesMap:"accounts", accountSetup:"accounts", accountHealth:"accounts", orderCash:"orders", inventoryLedger:"inventory",',
)
replace_once(
    "components/app-shell-v4.tsx",
    '  actions:"Action center", quickVisit:"Quick Visit", salesMap:"Account map", accountSetup:"Account setup", accountHealth:"Account health", crmTools:"CRM tools", orderCash:"Invoices & payments", timekeeping:"Timekeeping", materials:"Materials & Resources", products:"Products",',
    '  actions:"Action center", quickVisit:"Quick Visit", salesMap:"Account map", accountSetup:"Account setup", accountHealth:"Account health", orderCash:"Invoices & payments", timekeeping:"Timekeeping", materials:"Materials & Resources", products:"Products",',
)
replace_once(
    "components/app-shell-v4.tsx",
    '    case "crmTools": return <CrmToolsPage/>;\n',
    '',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''  const openResult = (page: PageKey, focus?: string) => { if (focus) sessionStorage.setItem("momentum-focus-record", focus); navigate(page); setSearchOpen(false); setQuery(""); }; const markAll = () => { markNotificationsRead(); generated.markAllRead(); };''',
    '''  const openResult = (page: PageKey, focus?: string) => { if (focus) sessionStorage.setItem("momentum-focus-record", focus); navigate(page); setSearchOpen(false); setQuery(""); };\n  const openNotification=(notification:(typeof generated.currentUserItems)[number])=>{generated.markRead(notification.id);if(notification.targetRecordId)sessionStorage.setItem("momentum-focus-record",notification.targetRecordId);const target=notification.targetPage;if(target&&canAccessPage(currentUser,target))navigate(target);else if(canAccessPage(currentUser,"work"))navigate("work");else navigate("home");setNotificationsOpen(false);};\n  const markAll = () => { markNotificationsRead(); generated.markAllRead(); };''',
)
replace_once(
    "components/app-shell-v4.tsx",
    '''{generated.currentUserItems.slice(0, 12).map((notification) => <article key={notification.id} className={notification.status === "Unread" ? "is-unread" : ""}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · action notification</small></div></article>)}''',
    '''{generated.currentUserItems.slice(0, 12).map((notification) => <button type="button" key={notification.id} className={`notification-item ${notification.status === "Unread" ? "is-unread" : ""}`} onClick={()=>openNotification(notification)}><i className={`notification-dot notification-dot--${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{formatDate(notification.createdAt, { hour: "numeric", minute: "2-digit" })} · {notification.actionLabel??"Open action"}</small></div><ChevronRight size={16}/></button>)}''',
)

target = ROOT / "lib/access.ts"
text = target.read_text()
old_access = '"accountHealth","crmTools","dispatch"'
new_access = '"accountHealth","dispatch"'
count = text.count(old_access)
if count != 3:
    raise SystemExit(f"PATCH FAILED: expected three CRM Tools access entries, found {count}")
target.write_text(text.replace(old_access, new_access))
print("patched lib/access.ts (retired CRM Tools for three roles)")

# ---------------------------------------------------------------------------
# 5. Focused order notifications reopen the exact full-order modal.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/orders-v3.tsx",
    ' useEffect(()=>{if(focusId)sessionStorage.removeItem("momentum-focus-record")},[focusId]);',
    ' useEffect(()=>{if(!focusId)return;const target=scope.orders.find((order)=>order.id===focusId);if(target){setSelectedId(target.id);setDetailOpen(true)}sessionStorage.removeItem("momentum-focus-record")},[focusId,scope.orders]);',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '><div style={{display:"grid",gap:18}}><div className="company-rule-facts">',
    '><div className="order-full-detail"><div className="company-rule-facts">',
)

# ---------------------------------------------------------------------------
# 6. Approved marketing requests get a shared, read-only delivery projection.
# This lets drivers see the request without exposing Marketing administration.
# ---------------------------------------------------------------------------
replace_once(
    "lib/marketing-engine.ts",
    'export type MarketingRequest={id:string;requesterId:string;type:MarketingRequestType;accountId?:string;campaignId?:string;title:string;detail:string;quantity?:number;materialItemId?:string;neededBy?:string;status:"Submitted"|"Approved"|"Returned"|"Fulfilled";submittedAt:string;decidedAt?:string;decidedBy?:string;fulfilledAt?:string;fulfilledBy?:string};\nexport type CampaignStatus=',
    'export type MarketingRequest={id:string;requesterId:string;type:MarketingRequestType;accountId?:string;campaignId?:string;title:string;detail:string;quantity?:number;materialItemId?:string;neededBy?:string;status:"Submitted"|"Approved"|"Returned"|"Fulfilled";submittedAt:string;decidedAt?:string;decidedBy?:string;fulfilledAt?:string;fulfilledBy?:string};\nexport type DeliveryMarketingNotice={id:string;requestId:string;requesterId:string;type:MarketingRequestType;accountId?:string;title:string;detail:string;quantity?:number;neededBy?:string;approvedAt:string;approvedBy:string;status:"Approved"|"Fulfilled";fulfilledAt?:string};\nexport type CampaignStatus=',
)
replace_once(
    "lib/marketing-engine.ts",
    'export type MarketingState={version:3;requests:MarketingRequest[];campaigns:Campaign[];',
    'export type MarketingState={version:3;requests:MarketingRequest[];deliveryNotices:DeliveryMarketingNotice[];campaigns:Campaign[];',
)
replace_once(
    "lib/marketing-engine.ts",
    'const validOptionalDate=(value?:string)=>value===undefined||isValidCalendarDateKey(value);',
    'const validOptionalDate=(value?:string)=>value===undefined||isValidCalendarDateKey(value);\nconst validInstant=(value?:string)=>value===undefined||!Number.isNaN(new Date(value).getTime());',
)
replace_once(
    "lib/marketing-engine.ts",
    'export function createMarketingSeed():MarketingState{return{version:3,requests:[],campaigns:',
    'export function createMarketingSeed():MarketingState{return{version:3,requests:[],deliveryNotices:[],campaigns:',
)
replace_once(
    "lib/marketing-engine.ts",
    '''  const requests=Array.isArray(state.requests)?state.requests.filter((item)=>item&&item.id&&item.requesterId&&item.title?.trim()&&item.detail?.trim()&&(item.quantity===undefined||finitePositive(item.quantity))&&validOptionalDate(item.neededBy)):[];\n  const spend=''',
    '''  const requests=Array.isArray(state.requests)?state.requests.filter((item)=>item&&item.id&&item.requesterId&&item.title?.trim()&&item.detail?.trim()&&(item.quantity===undefined||finitePositive(item.quantity))&&validOptionalDate(item.neededBy)):[];\n  const storedDeliveryNotices=Array.isArray(state.deliveryNotices)?state.deliveryNotices.filter((item):item is DeliveryMarketingNotice=>Boolean(item&&item.id&&item.requestId&&item.requesterId&&item.title?.trim()&&item.detail?.trim()&&["Approved","Fulfilled"].includes(item.status)&&validInstant(item.approvedAt)&&validInstant(item.fulfilledAt))):[];\n  const derivedDeliveryNotices:DeliveryMarketingNotice[]=requests.filter((item)=>item.status==="Approved"||item.status==="Fulfilled").map((item)=>({id:`delivery-notice-${item.id}`,requestId:item.id,requesterId:item.requesterId,type:item.type,accountId:item.accountId,title:item.title,detail:item.detail,quantity:item.quantity,neededBy:item.neededBy,approvedAt:item.decidedAt??item.submittedAt,approvedBy:item.decidedBy??"system",status:item.status as "Approved"|"Fulfilled",fulfilledAt:item.fulfilledAt}));\n  const noticeByRequest=new Map<string,DeliveryMarketingNotice>();for(const item of [...storedDeliveryNotices,...derivedDeliveryNotices])noticeByRequest.set(item.requestId,item);const deliveryNotices=[...noticeByRequest.values()];\n  const spend=''',
)
replace_once(
    "lib/marketing-engine.ts",
    '  return{version:3,requests,campaigns,spend,assets,materials,materialMovements,touches,attributions,partnerships};',
    '  return{version:3,requests,deliveryNotices,campaigns,spend,assets,materials,materialMovements,touches,attributions,partnerships};',
)
replace_once(
    "lib/marketing-context.tsx",
    '  const decideRequest=(id:string,status:"Approved"|"Returned")=>{if(!isAdmin)return;setState((s)=>({...s,requests:s.requests.map((request)=>request.id===id&&request.status==="Submitted"?{...request,status,decidedAt:now(),decidedBy:currentUser?.id}:request)}));};',
    '''  const decideRequest=(id:string,status:"Approved"|"Returned")=>{if(!isAdmin)return;const decidedAt=now();setState((s)=>{const request=s.requests.find((item)=>item.id===id&&item.status==="Submitted");if(!request)return s;const requests=s.requests.map((item)=>item.id===id?{...item,status,decidedAt,decidedBy:currentUser?.id}:item);const deliveryNotices=s.deliveryNotices.filter((item)=>item.requestId!==id);if(status==="Approved")deliveryNotices.unshift({id:`delivery-notice-${id}`,requestId:id,requesterId:request.requesterId,type:request.type,accountId:request.accountId,title:request.title,detail:request.detail,quantity:request.quantity,neededBy:request.neededBy,approvedAt:decidedAt,approvedBy:currentUser?.id??"system",status:"Approved"});return{...s,requests,deliveryNotices};});};''',
)
replace_once(
    "lib/marketing-context.tsx",
    '''return{...s,materialMovements:movements,requests:s.requests.map((item)=>item.id===id?{...item,status:"Fulfilled",fulfilledAt:now(),fulfilledBy:currentUser?.id}:item)};''',
    '''const fulfilledAt=now();return{...s,materialMovements:movements,requests:s.requests.map((item)=>item.id===id?{...item,status:"Fulfilled",fulfilledAt,fulfilledBy:currentUser?.id}:item),deliveryNotices:s.deliveryNotices.map((item)=>item.requestId===id?{...item,status:"Fulfilled",fulfilledAt}:item)};''',
)
replace_once(
    "lib/firestore-domains.ts",
    '{key:"momentum-marketing-v3",id:"marketing",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{requests:perUser("requesterId"),campaigns:{},spend:{},assets:{},materials:{},materialMovements:{},touches:{},attributions:{},partnerships:{}}},',
    '{key:"momentum-marketing-v3",id:"marketing",read:OPERATIONAL,write:ADMIN_MANAGER,fields:{requests:perUser("requesterId"),deliveryNotices:{read:[...OPERATIONAL,"Delivery Driver"],write:ADMIN_MANAGER},campaigns:{},spend:{},assets:{},materials:{},materialMovements:{},touches:{},attributions:{},partnerships:{}}},',
)

# Delivery page shows all approved requests and repeats account-linked requests
# directly on the delivery card so they cannot be missed during loading.
replace_once(
    "components/pages/deliveries.tsx",
    'import { Box, CheckCircle2, Mail, MapPin, PackageCheck, PackageOpen, Phone, Route, Truck, UserCheck, UserRound } from "lucide-react";',
    'import { Box, CheckCircle2, Mail, MapPin, Megaphone, PackageCheck, PackageOpen, Phone, Route, Truck, UserCheck, UserRound } from "lucide-react";',
)
replace_once(
    "components/pages/deliveries.tsx",
    'import { useSyncStatus } from "../../lib/persistence";',
    'import { useSyncStatus } from "../../lib/persistence";\nimport { useMarketing } from "../../lib/marketing-context";',
)
replace_once(
    "components/pages/deliveries.tsx",
    'import { Button, PageHeader, Section, StatusPill, formatMoney } from "../ui";',
    'import { Button, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";',
)
replace_once(
    "components/pages/deliveries.tsx",
    ' const{data,currentUser,navigate}=useWorkspace();const{state,taskForOrder,claimDelivery,assignDelivery,cancelDelivery,prepareDelivery,markLoaded,startDelivery,markDelivered,addDeliveryNote}=useDelivery();const sync=useSyncStatus();',
    ' const{data,currentUser,navigate}=useWorkspace();const marketing=useMarketing().state;const{state,taskForOrder,claimDelivery,assignDelivery,cancelDelivery,prepareDelivery,markLoaded,startDelivery,markDelivered,addDeliveryNote}=useDelivery();const sync=useSyncStatus();',
)
replace_once(
    "components/pages/deliveries.tsx",
    ' const eligible=useMemo(()=>data.orders.filter(processedForDelivery).sort((a,b)=>b.placedAt.localeCompare(a.placedAt)),[data.orders]);',
    ' const eligible=useMemo(()=>data.orders.filter(processedForDelivery).sort((a,b)=>b.placedAt.localeCompare(a.placedAt)),[data.orders]);\n const approvedMarketingRequests=useMemo(()=>marketing.deliveryNotices.filter((request)=>request.status==="Approved").sort((a,b)=>b.approvedAt.localeCompare(a.approvedAt)),[marketing.deliveryNotices]);',
)
replace_once(
    "components/pages/deliveries.tsx",
    'const selectedDriver=driverByOrder[order.id]??drivers[0]?.id??"";const lines=orderLinesFor(order);',
    'const selectedDriver=driverByOrder[order.id]??drivers[0]?.id??"";const lines=orderLinesFor(order);const linkedMarketing=approvedMarketingRequests.filter((request)=>request.accountId===order.accountId);',
)
replace_once(
    "components/pages/deliveries.tsx",
    ''' <div className="company-rule-facts"><div><span>Cases</span><strong>{order.cases}</strong><small>{lines.length} SKU{lines.length===1?"":"s"}</small></div><div><span>Order total</span><strong>{formatMoney(order.amount)}</strong><small>{order.paymentStatus}</small></div><div><span>Driver</span><strong>{driver?.name??"Unassigned"}</strong><small>{task?"Claimed":"Available to claim"}</small></div><div><span>Terms</span><strong>{customer?.paymentTerms??"COD"}</strong><small>Order {order.status}</small></div></div>''',
    ''' <div className="company-rule-facts"><div><span>Cases</span><strong>{order.cases}</strong><small>{lines.length} SKU{lines.length===1?"":"s"}</small></div><div><span>Order total</span><strong>{formatMoney(order.amount)}</strong><small>{order.paymentStatus}</small></div><div><span>Driver</span><strong>{driver?.name??"Unassigned"}</strong><small>{task?"Claimed":"Available to claim"}</small></div><div><span>Terms</span><strong>{customer?.paymentTerms??"COD"}</strong><small>Order {order.status}</small></div></div>\n {linkedMarketing.length>0&&<div className="delivery-marketing-alert"><Megaphone size={18}/><div><strong>Approved request for this location</strong>{linkedMarketing.map((request)=><p key={request.id}><b>{request.title}</b> · {request.detail}{request.neededBy?` · needed ${formatDate(request.neededBy,{month:"short",day:"numeric"})}`:""}</p>)}</div></div>}''',
)
replace_once(
    "components/pages/deliveries.tsx",
    '''</div></div><Section title="Delivery queue" description="Unassigned approved orders are visible to every Delivery Driver. Claiming prevents another driver from taking the same active task."><div className="company-request-list">''',
    '''</div></div>{approvedMarketingRequests.length>0&&<Section title="Approved marketing / delivery requests" description="Every approved marketing request is visible to drivers. Account-linked requests are also repeated on the matching delivery card before loading."><div className="delivery-marketing-request-list">{approvedMarketingRequests.map((request)=>{const account=request.accountId?data.accounts.find((item)=>item.id===request.accountId):undefined;const requester=data.users.find((item)=>item.id===request.requesterId);return <article key={request.id}><span><Megaphone size={17}/></span><div><small>{request.type}{request.neededBy?` · needed ${formatDate(request.neededBy,{month:"short",day:"numeric"})}`:""}</small><strong>{request.title}</strong><p>{request.detail}</p><em>{account?(account.locationName??account.name):"No location linked"}{requester?` · requested by ${requester.name}`:""}</em></div><StatusPill tone="warning">Approved</StatusPill></article>})}</div></Section>}<Section title="Delivery queue" description="Unassigned approved orders are visible to every Delivery Driver. Claiming prevents another driver from taking the same active task."><div className="company-request-list">''',
)

# ---------------------------------------------------------------------------
# 7. Visual polish: stop arbitrary letter-stacking, fix the full-order layout,
# make Administration tables readable, and make notifications feel clickable.
# ---------------------------------------------------------------------------
write("app/visual-polish-v2.css", '''/* Momentum visual QA pass: layout resilience without changing business logic. */

/* Action labels and pills should wrap on words, never stack one letter per line. */
.page-container :is(button,.button,.status-pill),
.notification-popover :is(button,strong,small) {
  overflow-wrap:normal!important;
  word-break:normal!important;
  hyphens:none;
}

/* Full order modal: icon, then content. The old generic request grid pushed content to the far right. */
.order-full-detail {
  display:grid;
  gap:18px;
  text-align:left;
}
.order-full-detail .company-request-list article {
  grid-template-columns:40px minmax(0,1fr)!important;
  align-items:start!important;
  gap:12px!important;
  min-height:0;
  padding:14px 16px;
}
.order-full-detail .company-request-list article>span {
  width:36px;
  height:36px;
  display:grid;
  place-items:center;
  border-radius:10px;
  color:var(--blue-600);
  background:var(--blue-100);
}
.order-full-detail .company-request-list article>div {
  min-width:0;
  text-align:left;
}
.order-full-detail .company-request-list strong,
.order-full-detail .company-request-list p {
  overflow-wrap:break-word;
  word-break:normal;
}
.order-full-detail .company-request-list strong { font-size:12px; line-height:1.4; }
.order-full-detail .company-request-list p { font-size:10px; line-height:1.5; }
.order-full-detail .company-rule-facts strong { font-size:14px; overflow-wrap:break-word; }

/* Administration: give permission columns real minimum widths instead of crushing words. */
.permission-panel {
  overflow-x:auto!important;
  scrollbar-width:thin;
}
.permission-table {
  grid-template-columns:minmax(190px,1.45fr) repeat(5,minmax(112px,1fr))!important;
  min-width:820px;
}
.permission-table>span {
  min-width:0;
  padding-inline:11px!important;
}
.permission-table small {
  display:block;
  font-size:9px!important;
  line-height:1.35;
  white-space:normal;
  overflow-wrap:break-word!important;
  word-break:normal!important;
}
.permission-table--head span {
  font-size:9px!important;
  line-height:1.2;
  white-space:normal;
}

/* Security cards need the whole width. Two half-width panels were squeezing the gate badge vertically. */
.settings-bottom-grid {
  grid-template-columns:minmax(0,1fr)!important;
}
.security-checklist>div {
  grid-template-columns:40px minmax(0,1fr) max-content!important;
  align-items:center!important;
}
.security-checklist .status-pill {
  width:max-content;
  min-width:max-content;
  white-space:nowrap;
}

/* Delivery marketing requests and order-linked reminders. */
.delivery-marketing-alert {
  display:grid;
  grid-template-columns:34px minmax(0,1fr);
  gap:10px;
  align-items:start;
  padding:12px 14px;
  border:1px solid #ead18a;
  border-radius:11px;
  background:#fff9e6;
  color:#5e4708;
}
.delivery-marketing-alert>svg { margin-top:1px; color:#9a6b00; }
.delivery-marketing-alert strong { display:block; color:var(--navy-950); font-size:11px; }
.delivery-marketing-alert p { margin:4px 0 0; font-size:10px; line-height:1.45; }
.delivery-marketing-request-list article {
  display:grid;
  grid-template-columns:40px minmax(0,1fr) auto;
  gap:12px;
  align-items:start;
  padding:14px 16px;
  border-bottom:1px solid var(--line);
}
.delivery-marketing-request-list article:last-child { border-bottom:0; }
.delivery-marketing-request-list article>span {
  width:36px;height:36px;display:grid;place-items:center;border-radius:10px;
  color:#9a6b00;background:var(--gold-100);
}
.delivery-marketing-request-list small { color:var(--blue-600); font-size:9px; font-weight:760; }
.delivery-marketing-request-list strong { display:block; margin-top:4px; font-size:11px; }
.delivery-marketing-request-list p { margin:4px 0 0; color:var(--muted); font-size:10px; line-height:1.5; }
.delivery-marketing-request-list em { display:block; margin-top:6px; color:var(--subtle); font-size:9px; font-style:normal; }

/* Notifications are buttons because they are actions. */
.notification-list .notification-item {
  appearance:none;
  width:100%;
  border:0;
  border-bottom:1px solid #eff1f4;
  background:#fff;
  color:inherit;
  text-align:left;
  display:grid;
  grid-template-columns:10px minmax(0,1fr) 18px;
  align-items:start;
  gap:10px;
  padding:13px 14px;
  cursor:pointer;
}
.notification-list .notification-item:hover,
.notification-list .notification-item:focus-visible { background:#f7f9fd; outline:none; }
.notification-list .notification-item.is-unread { background:#f5f8ff; }
.notification-list .notification-item.is-unread:hover { background:#eef4ff; }
.notification-list .notification-item>div { min-width:0; }
.notification-list .notification-item>svg { color:var(--subtle); margin-top:3px; }
.notification-list .notification-item strong { display:block; font-size:11px; line-height:1.35; }
.notification-list .notification-item p { margin:4px 0; color:var(--muted); font-size:10px; line-height:1.45; }
.notification-list .notification-item small { color:var(--blue-600); font-size:9px; }

/* Keep natural scrolling but remove ugly scrollbar chrome from navigation. */
.sidebar__nav,.company-tabs { scrollbar-width:none; }
.sidebar__nav::-webkit-scrollbar,.company-tabs::-webkit-scrollbar { width:0; height:0; display:none; }

@media (max-width:900px) {
  .modal--wide { width:min(940px,calc(100vw - 24px)); }
  .permission-table { min-width:760px; }
  .delivery-marketing-request-list article { grid-template-columns:36px minmax(0,1fr); }
  .delivery-marketing-request-list .status-pill { grid-column:2; justify-self:start; }
}

@media (max-width:680px) {
  .order-full-detail .company-rule-facts { grid-template-columns:1fr 1fr!important; }
  .security-checklist>div { grid-template-columns:36px minmax(0,1fr)!important; align-items:start!important; }
  .security-checklist .status-pill { grid-column:2; justify-self:start; min-width:0; }
}
''')
replace_once(
    "app/layout.tsx",
    'import "./production-polish.css";',
    'import "./production-polish.css";\nimport "./visual-polish-v2.css";',
)

# ---------------------------------------------------------------------------
# 8. Regression coverage for this pass.
# ---------------------------------------------------------------------------
replace_once(
    "tests/platform-critical-invariants.test.ts",
    'import { MAX_PERSISTED_NOTIFICATION_BYTES, MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries } from "../lib/notification-engine";',
    'import { MAX_PERSISTED_NOTIFICATION_BYTES, MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries, notificationTarget } from "../lib/notification-engine";\nimport { collectAuditableRecords, diffAuditableRecords } from "../lib/audit-engine";\nimport { normalizeMarketingState } from "../lib/marketing-engine";',
)
replace_once(
    "tests/platform-critical-invariants.test.ts",
    'import type { Approval, Order } from "../lib/types";',
    'import type { Approval, Order, WorkspaceData } from "../lib/types";',
)
append_once(
    "tests/platform-critical-invariants.test.ts",
    'describe("notification routing and actor integrity"',
    '''describe("notification routing and actor integrity", () => {\n  test("an unrelated update is never attributed to a stale requester", () => {\n    const before=collectAuditableRecords("Marketing",{requests:[{id:"req-1",requesterId:"megan",title:"Mini fridge",detail:"Deliver with order",status:"Submitted"}]});\n    const after=collectAuditableRecords("Marketing",{requests:[{id:"req-1",requesterId:"megan",title:"Mini fridge",detail:"Deliver with approved order",status:"Submitted"}]});\n    const events=diffAuditableRecords(before,after,{id:"viewer-mia",role:"Administrator"},"2026-09-24T18:00:00.000Z",[]);\n    assert.equal(events.length,1);\n    assert.equal(events[0].actorId,"system");\n  });\n\n  test("an explicit decision actor remains the actor", () => {\n    const before=collectAuditableRecords("Workspace",{approvals:[{id:"apr-9",title:"Review order",requesterId:"matt",status:"Pending"}]});\n    const after=collectAuditableRecords("Workspace",{approvals:[{id:"apr-9",title:"Review order",requesterId:"matt",status:"Approved",decidedBy:"mia"}]});\n    const events=diffAuditableRecords(before,after,{id:"system",role:"System"},"2026-09-24T18:00:00.000Z",[{id:"mia",name:"Mia",firstName:"Mia",email:"mia@test.co",initials:"MM",title:"Director",role:"Administrator",team:"Leadership",accent:"#000"} as never]);\n    assert.equal(events[0].actorId,"mia");\n  });\n\n  test("resolved or orphaned order approvals cannot survive as ghost action notifications", () => {\n    const event={id:"audit-order",at:"2026-09-24T18:00:00.000Z",actorId:"matt",actorRole:"Sales Representative",action:"Created" as const,module:"Workspace",collection:"approvals",entityType:"Workspace.approvals",entityId:"apr-1",label:"Review GE-1",summary:"Approval created",sensitivity:"manager" as const,changes:[{field:"status",after:"Pending"}]};\n    const empty={users:[],accounts:[],orders:[],approvals:[],timecards:[]} as unknown as WorkspaceData;\n    assert.equal(notificationTarget(event,empty),null);\n    const live={...empty,orders:[order],approvals:[pending]} as WorkspaceData;\n    assert.deepEqual(notificationTarget(event,live),{targetPage:"orders",targetRecordId:"ord-1",actionLabel:"Review order"});\n    const resolved={...live,approvals:[{...pending,status:"Approved" as const,decidedBy:"mia",decidedAt:"2026-09-24T18:01:00.000Z"}]} as WorkspaceData;\n    assert.equal(notificationTarget(event,resolved),null);\n  });\n\n  test("notification UI routes directly to its action target and supports individual read state", () => {\n    const shell=readFileSync(new URL("../components/app-shell-v4.tsx",import.meta.url),"utf8");\n    const context=readFileSync(new URL("../lib/notification-context-v2.tsx",import.meta.url),"utf8");\n    assert.match(shell,/openNotification/);\n    assert.match(shell,/targetRecordId/);\n    assert.match(context,/markRead/);\n  });\n});\n\ndescribe("delivery marketing projection and visual QA", () => {\n  test("approved marketing requests derive a delivery-safe projection", () => {\n    const state=normalizeMarketingState({requests:[{id:"req-1",requesterId:"matt",type:"Creative",accountId:"acc-1",title:"Mini fridge",detail:"Deliver with order",status:"Approved",submittedAt:"2026-09-24T17:00:00.000Z",decidedAt:"2026-09-24T17:05:00.000Z",decidedBy:"mia"}]});\n    assert.equal(state.deliveryNotices.length,1);\n    assert.equal(state.deliveryNotices[0].requestId,"req-1");\n    assert.equal(state.deliveryNotices[0].status,"Approved");\n  });\n\n  test("delivery page surfaces approved requests and the order modal uses the fixed detail layout", () => {\n    const delivery=readFileSync(new URL("../components/pages/deliveries.tsx",import.meta.url),"utf8");\n    const orders=readFileSync(new URL("../components/pages/orders-v3.tsx",import.meta.url),"utf8");\n    const css=readFileSync(new URL("../app/visual-polish-v2.css",import.meta.url),"utf8");\n    assert.match(delivery,/Approved marketing \/ delivery requests/);\n    assert.match(delivery,/deliveryNotices/);\n    assert.match(orders,/order-full-detail/);\n    assert.match(css,/grid-template-columns:40px minmax\(0,1fr\)/);\n    assert.match(css,/permission-table/);\n  });\n\n  test("CRM Tools is retired from navigation and role access", () => {\n    const shell=readFileSync(new URL("../components/app-shell-v4.tsx",import.meta.url),"utf8");\n    const access=readFileSync(new URL("../lib/access.ts",import.meta.url),"utf8");\n    assert.doesNotMatch(shell,/label:\"CRM tools\"/);\n    assert.doesNotMatch(access,/\"crmTools\"/);\n  });\n});''',
)

# Firestore rules conformance explicitly includes Delivery Driver now that the
# driver receives a shared read-only Marketing delivery projection.
replace_once(
    "tests/firestore-rules.test.ts",
    'const OPS = "uid-ops";\nconst ONBOARDING = "uid-onboarding";',
    'const OPS = "uid-ops";\nconst DRIVER = "uid-driver";\nconst ONBOARDING = "uid-onboarding";',
)
replace_once(
    "tests/firestore-rules.test.ts",
    '  accessRecord(OPS, "Operations", "Operations"),\n  accessRecord(ONBOARDING,',
    '  accessRecord(OPS, "Operations", "Operations"),\n  accessRecord(DRIVER, "Delivery Driver", "Operations"),\n  accessRecord(ONBOARDING,',
)
replace_once(
    "tests/firestore-rules.test.ts",
    '  for (const uid of [ADMIN, MANAGER, REP, OPS, ONBOARDING, BA_OF_REP]) {',
    '  for (const uid of [ADMIN, MANAGER, REP, OPS, DRIVER, ONBOARDING, BA_OF_REP]) {',
)
append_once(
    "tests/firestore-rules.test.ts",
    'describe("Delivery Driver approved marketing visibility"',
    '''describe("Delivery Driver approved marketing visibility", () => {\n  test("driver can read the shared delivery notice projection but cannot write it or read campaign administration", async () => {\n    const db=dbFor(DRIVER);\n    await assertSucceeds(getDoc(doc(db,"domains/marketing/fields/deliveryNotices")));\n    await assertFails(setDoc(doc(db,"domains/marketing/fields/deliveryNotices"),{items:[]}));\n    await assertFails(getDoc(doc(db,"domains/marketing/fields/campaigns")));\n  });\n});''',
)

print("visual polish, delivery marketing visibility, CRM retirement, and notification routing patch applied")
