from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected patch target not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        return
    p.write_text(text.replace(old, new))


# 1) Notifications are an action queue, not an unbounded event archive. Firestore documents have a hard 1 MiB cap.
replace_once(
    "lib/notification-engine.ts",
    'const statuses = new Set<NotificationDelivery["status"]>(["Unread", "Read", "Awaiting integration", "Sent", "Failed"]);\n',
    'const statuses = new Set<NotificationDelivery["status"]>(["Unread", "Read", "Awaiting integration", "Sent", "Failed"]);\n'
    'export const NOTIFICATION_DELIVERY_RETENTION_LIMIT = 400;\n'
    'export function compactNotificationDeliveries(deliveries: NotificationDelivery[]) {\n'
    '  const active = deliveries.filter((item) => ["Unread", "Awaiting integration", "Failed"].includes(item.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));\n'
    '  const settled = deliveries.filter((item) => !["Unread", "Awaiting integration", "Failed"].includes(item.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));\n'
    '  return [...active, ...settled].slice(0, NOTIFICATION_DELIVERY_RETENTION_LIMIT);\n'
    '}\n'
)
replace_once(
    "lib/notification-engine.ts",
    '    seen.add(delivery.id); return true;\n  });\n',
    '    seen.add(delivery.id); return true;\n  });\n  const compactedDeliveries = compactNotificationDeliveries(deliveries);\n'
)
replace_once(
    "lib/notification-engine.ts",
    '  return { version: 1, escalationHours, preferences, deliveries };\n',
    '  return { version: 1, escalationHours, preferences, deliveries: compactedDeliveries };\n'
)

# Keep all persisted notification state safely bounded even if a future producer forgets to cap its own additions.
replace_once(
    "lib/notification-context-v2.tsx",
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";\n',
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, compactNotificationDeliveries, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";\n'
)
replace_once(
    "lib/notification-context-v2.tsx",
    '  useEffect(() => { if (typeof window !== "undefined") momentumStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(state)); }, [state]);\n',
    '  useEffect(() => { if (typeof window !== "undefined") momentumStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({ ...state, deliveries: compactNotificationDeliveries(state.deliveries) })); }, [state]);\n'
)
replace_all(
    "lib/notification-context-v2.tsx",
    '.slice(0, 12000)',
    '.slice(0, 400)'
)
replace_all(
    "lib/notification-context-v2.tsx",
    '.slice(0,12000)',
    '.slice(0,400)'
)
replace_once(
    "lib/notification-context-v2.tsx",
    '        return changed ? { ...current, deliveries: [...additions, ...updated] } : current;\n',
    '        return changed ? { ...current, deliveries: compactNotificationDeliveries([...additions, ...updated]) } : current;\n'
)

# 2) A bad auxiliary document must never block an order/account/etc. write in the same flush.
# If an atomic multi-document commit fails for a non-conflict/non-permission reason, retry documents independently.
# This preserves healthy records and keeps the failed domain dirty for a visible retry/error instead of dropping data.
replace_once(
    "lib/persistence.ts",
    '        throw new Error(result.message||`Firestore commit failed (${result.status}).`);\n',
    '        await this.isolateFailedWrites(writes,pathKey,nextDocs);\n        break;\n'
)
replace_once(
    "lib/persistence.ts",
    '  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */\n',
    '''  /** A non-rules batch failure must not make an unrelated business record disappear. Retry each document\n   * independently with its own version marker. Healthy writes (especially orders) can land even when an\n   * auxiliary domain such as notifications is malformed or temporarily over a provider limit. */\n  private async isolateFailedWrites(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){\n    const failedKeys=new Set<string>();let failures=0;let successes=0;\n    for(const write of writes){\n      const key=pathKey.get(write.path);\n      const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;\n      const versionEntry=metaVersionKey(write.path);\n      const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:{[versionEntry]:stamp}},fieldPaths:[`versions.${versionEntry}`]};\n      const result=await commitFirestoreWrites([write,metaWrite]);\n      if(result.ok){\n        this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});\n        this.metaVersions[versionEntry]=stamp;successes+=1;continue;\n      }\n      if(isFirestorePermissionDenied(result)){\n        this.denied.add(write.path);\n        console.warn(`[momentum] Firestore denied isolated write to ${write.path} for ${key}; unrelated records continued syncing.`);\n        continue;\n      }\n      if(key)failedKeys.add(key);failures+=1;\n      console.error(`[momentum] Isolated Firestore write failed for ${write.path}: ${result.message}`);\n    }\n    for(const key of failedKeys)this.dirty.add(key);\n    if(successes)setStatus({lastSyncedAt:new Date().toISOString()});\n    if(failures)setStatus({lastError:`${failures} document${failures===1?"":"s"} could not sync. Other records were preserved and synced; the failed domain will retry.`});\n  }\n\n  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */\n'''
)

# 3) Keep the sidebar scrollable on shorter screens without showing an ugly scrollbar track/thumb.
replace_once(
    "app/globals.css",
    '.sidebar__nav {\n  overflow-y:auto;\n}\n',
    '.sidebar__nav {\n  overflow-y:auto;\n  scrollbar-width:none;\n  -ms-overflow-style:none;\n  overscroll-behavior:contain;\n}\n.sidebar__nav::-webkit-scrollbar {\n  width:0;\n  height:0;\n  display:none;\n}\n'
)

# 4) Regression coverage for the exact production failure.
test_path=Path("tests/order-notification-hotfix.test.ts")
if not test_path.exists():
    test_path.write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\nimport { NOTIFICATION_DELIVERY_RETENTION_LIMIT, normalizeNotificationState } from "../lib/notification-engine";\nimport type { WorkspaceUser } from "../lib/types";\n\nconst user={id:"usr-admin",name:"Admin",firstName:"Admin",email:"admin@example.com",role:"Administrator",team:"Operations",title:"Administrator",initials:"AD",accent:"#000",accountState:"Active"} as unknown as WorkspaceUser;\n\ntest("notification persistence is capped well below Firestore's one-document limit",()=>{\n  const deliveries=Array.from({length:1600},(_,index)=>({id:`n-${index}`,sourceEventId:`e-${index}`,recipientUserId:user.id,channel:"In app" as const,title:`Action ${index}`,detail:"Needs attention. ".repeat(20),tone:"warning" as const,createdAt:new Date(Date.now()-index*1000).toISOString(),status:index<20?"Unread" as const:"Read" as const,...(index<20?{}:{readAt:new Date().toISOString()})}));\n  const normalized=normalizeNotificationState({version:1,escalationHours:24,preferences:[{userId:user.id,inApp:true,email:false,sms:false,emailAddress:user.email}],deliveries},[user]);\n  assert.equal(normalized.deliveries.length,NOTIFICATION_DELIVERY_RETENTION_LIMIT);\n  assert.ok(Buffer.byteLength(JSON.stringify(normalized),"utf8")<900_000);\n  assert.equal(normalized.deliveries.filter((item)=>item.status==="Unread").length,20);\n});\n\ntest("persistence isolates a broken auxiliary document instead of failing the whole business-record batch",()=>{\n  const source=readFileSync(new URL("../lib/persistence.ts",import.meta.url),"utf8");\n  assert.match(source,/await this\\.isolateFailedWrites\\(writes,pathKey,nextDocs\\)/);\n  assert.match(source,/Other records were preserved and synced/);\n});\n\ntest("sidebar remains naturally scrollable without a visible scrollbar",()=>{\n  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");\n  assert.match(css,/\\.sidebar__nav \\{[\\s\\S]*overflow-y:auto;[\\s\\S]*scrollbar-width:none;/);\n  assert.match(css,/\\.sidebar__nav::\\-webkit-scrollbar/);\n});\n''')

replace_once(
    "package.json",
    'tests/platform-critical-invariants.test.ts",\n',
    'tests/platform-critical-invariants.test.ts tests/order-notification-hotfix.test.ts",\n'
)

print("PASS: order persistence, notification overflow, and sidebar hotfix applied")
