from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}\n--- needle ---\n{old}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{path}: expected at least {minimum} matches, found {count}\n--- needle ---\n{old}")
    write(path, text.replace(old, new))


# ---------------------------------------------------------------------------
# Notification storage must stay comfortably under Firestore's 1 MiB document
# ceiling. The audit trail remains the long-form history; the bell is bounded.
# ---------------------------------------------------------------------------
replace_once(
    "lib/notification-engine.ts",
    'const statuses = new Set<NotificationDelivery["status"]>(["Unread", "Read", "Awaiting integration", "Sent", "Failed"]);\nconst validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));',
    '''const statuses = new Set<NotificationDelivery["status"]>(["Unread", "Read", "Awaiting integration", "Sent", "Failed"]);\nexport const MAX_PERSISTED_NOTIFICATION_DELIVERIES = 500;\nexport function compactNotificationDeliveries(deliveries: NotificationDelivery[]): NotificationDelivery[] {\n  const seen = new Set<string>();\n  const unique: NotificationDelivery[] = [];\n  for (const delivery of deliveries) {\n    if (!delivery?.id || seen.has(delivery.id)) continue;\n    seen.add(delivery.id);\n    unique.push(delivery);\n  }\n  const actionable = unique.filter((delivery) => !["Read", "Sent"].includes(delivery.status));\n  const resolved = unique.filter((delivery) => ["Read", "Sent"].includes(delivery.status));\n  return [...actionable, ...resolved].slice(0, MAX_PERSISTED_NOTIFICATION_DELIVERIES);\n}\nconst validInstant = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));''',
)
replace_once(
    "lib/notification-engine.ts",
    '  return { version: 1, escalationHours, preferences, deliveries };',
    '  return { version: 1, escalationHours, preferences, deliveries: compactNotificationDeliveries(deliveries) };',
)

replace_once(
    "lib/notification-context-v2.tsx",
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";',
    'import { NOTIFICATION_STORAGE_KEY, NotificationDelivery, NotificationPreference, NotificationState, auditEventCreatesNotification, compactNotificationDeliveries, createNotificationSeed, deliveryKey, enabledChannels, normalizeNotificationState, notificationCopy, programPricingDaysRemaining, resolveNotificationRecipients } from "./notification-engine";',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '  useEffect(() => { if (typeof window !== "undefined") momentumStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(state)); }, [state]);',
    '  useEffect(() => { if (typeof window !== "undefined") momentumStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify({ ...state, deliveries: compactNotificationDeliveries(state.deliveries) })); }, [state]);',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '      const retained = current.deliveries.filter((delivery) => !auditEventIds.has(delivery.sourceEventId) || eventById.has(delivery.sourceEventId));',
    '''      const retained = current.deliveries.filter((delivery) => {\n        const auditDerived = delivery.sourceEventId.startsWith("audit-") || auditEventIds.has(delivery.sourceEventId);\n        return !auditDerived || eventById.has(delivery.sourceEventId);\n      });''',
)
replace_once(
    "lib/notification-context-v2.tsx",
    '      return copyChanged || additions.length ? { ...current, deliveries: [...additions, ...refreshed].slice(0, 12000) } : current;',
    '      return copyChanged || additions.length ? { ...current, deliveries: compactNotificationDeliveries([...additions, ...refreshed]) } : current;',
)
replace_all(
    "lib/notification-context-v2.tsx",
    'deliveries: [...additions, ...retained].slice(0, 12000)',
    'deliveries: compactNotificationDeliveries([...additions, ...retained])',
    minimum=1,
)
replace_all(
    "lib/notification-context-v2.tsx",
    'deliveries:[...additions,...retained].slice(0,12000)',
    'deliveries:compactNotificationDeliveries([...additions,...retained])',
    minimum=1,
)
replace_once(
    "lib/notification-context-v2.tsx",
    '        return changed ? { ...current, deliveries: [...additions, ...updated] } : current;',
    '        return changed ? { ...current, deliveries: compactNotificationDeliveries([...additions, ...updated]) } : current;',
)

# ---------------------------------------------------------------------------
# Notification deliveries are a bounded derived action queue, so intentional
# pruning must be allowed. Other record collections continue preserving omitted
# remote records to prevent silent deletion during partial cross-browser sync.
# ---------------------------------------------------------------------------
replace_once(
    "lib/firestore-domains.ts",
    '  write?:RoleRule;\n};',
    '  write?:RoleRule;\n  /** Derived/bounded fields may intentionally replace their prior persisted collection. */\n  replaceOnWrite?:boolean;\n};',
)
replace_once(
    "lib/firestore-domains.ts",
    '{key:"momentum-notification-rules-v1",id:"notificationRules",read:"activeEmployee",write:ADMIN,fields:{preferences:perUser(),deliveries:restricted("activeEmployee","activeEmployee")}},',
    '{key:"momentum-notification-rules-v1",id:"notificationRules",read:"activeEmployee",write:ADMIN,fields:{preferences:perUser(),deliveries:{...restricted("activeEmployee","activeEmployee"),replaceOnWrite:true}}},',
)
replace_once(
    "lib/firestore-domains.ts",
    'export function documentWritable(path:string,scope:PersistenceScope){const parsed=parseDocPath(path);if(!parsed)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);if(!spec)return false;if(parsed.uid){const fieldSpec=spec.fields[parsed.field];return Boolean(fieldSpec?.userIdField)&&userShardWritable(spec,fieldSpec,parsed.uid,scope);}const fieldSpec=parsed.field===ROOT_FIELD?undefined:spec.fields[parsed.field];return roleAllows(fieldSpec?.write??spec.write,scope);}',
    'export function documentWritable(path:string,scope:PersistenceScope){const parsed=parseDocPath(path);if(!parsed)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);if(!spec)return false;if(parsed.uid){const fieldSpec=spec.fields[parsed.field];return Boolean(fieldSpec?.userIdField)&&userShardWritable(spec,fieldSpec,parsed.uid,scope);}const fieldSpec=parsed.field===ROOT_FIELD?undefined:spec.fields[parsed.field];return roleAllows(fieldSpec?.write??spec.write,scope);}\nexport function documentReplacesOnWrite(path:string){const parsed=parseDocPath(path);if(!parsed||parsed.uid||parsed.field===ROOT_FIELD)return false;const spec=DOMAIN_SPECS.find((item)=>item.id===parsed.domainId);return spec?.fields[parsed.field]?.replaceOnWrite===true;}',
)

# ---------------------------------------------------------------------------
# Persistence hardening:
# 1. one failed document can never poison unrelated business writes;
# 2. unsynced state is journaled per signed-in employee and survives reload;
# 3. bounded derived fields can intentionally prune old records;
# 4. cross-user freshness improves from 20s to 5s.
# ---------------------------------------------------------------------------
replace_once(
    "lib/persistence.ts",
    'import { DOMAIN_BY_KEY, DOMAIN_SPECS, EMPLOYEE_DIRECTORY_META_KEY, ROOT_FIELD, assembleState, domainDocuments, isDomainStorageKey, metaVersionKey, parseDocPath, recordIdentity, shardState, type DomainSpec } from "./firestore-domains";',
    'import { DOMAIN_BY_KEY, DOMAIN_SPECS, EMPLOYEE_DIRECTORY_META_KEY, ROOT_FIELD, assembleState, documentReplacesOnWrite, domainDocuments, isDomainStorageKey, metaVersionKey, parseDocPath, recordIdentity, shardState, type DomainSpec } from "./firestore-domains";',
)
replace_once(
    "lib/persistence.ts",
    'const local=()=>typeof window==="undefined"?null:window.localStorage;',
    'const local=()=>typeof window==="undefined"?null:window.localStorage;\nconst PENDING_JOURNAL_PREFIX="momentum-firestore-pending-v1";\nconst pendingJournalKey=(uid:string,key:string)=>`${PENDING_JOURNAL_PREFIX}:${uid}:${key}`;',
)
replace_once(
    "lib/persistence.ts",
    '    this.pollIntervalMs=options.pollIntervalMs??20_000;',
    '    this.pollIntervalMs=options.pollIntervalMs??5_000;',
)
replace_once(
    "lib/persistence.ts",
    '    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));\n    setStatus({mode:"firestore",pending:0,flushing:false,lastSyncedAt:new Date().toISOString(),lastError:undefined,conflicts:0,deniedDocuments:[...this.denied]});\n    if(typeof window!=="undefined"){\n      this.pollTimer=window.setInterval(()=>void this.poll(),this.pollIntervalMs);\n      window.addEventListener("focus",this.handleFocus);\n      document.addEventListener("visibilitychange",this.handleFocus);\n      window.addEventListener("pagehide",this.handlePageHide);\n    }',
    '''    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));\n    // Recover any locally journaled Firestore state that did not finish syncing before a reload/crash.\n    for(const spec of DOMAIN_SPECS){\n      const pending=local()?.getItem(pendingJournalKey(this.scope.uid,spec.key));\n      if(pending!==null){this.cache.set(spec.key,pending);this.dirty.add(spec.key);}\n    }\n    setStatus({mode:"firestore",pending:this.dirty.size,flushing:false,lastSyncedAt:new Date().toISOString(),lastError:undefined,conflicts:0,deniedDocuments:[...this.denied]});\n    if(typeof window!=="undefined"){\n      this.pollTimer=window.setInterval(()=>void this.poll(),this.pollIntervalMs);\n      window.addEventListener("focus",this.handleFocus);\n      document.addEventListener("visibilitychange",this.handleFocus);\n      window.addEventListener("pagehide",this.handlePageHide);\n    }\n    if(this.dirty.size)this.scheduleFlush(50);''',
)
replace_once(
    "lib/persistence.ts",
    '    this.cache.set(key,value);\n    this.dirty.add(key);',
    '    this.cache.set(key,value);\n    local()?.setItem(pendingJournalKey(this.scope.uid,key),value);\n    this.dirty.add(key);',
)
replace_once(
    "lib/persistence.ts",
    '        // Existing Firestore records survive a locally omitted/temporarily unrecognized record.\n        const next=base?.data?mergeDocument(base.data,proposed,base.data):proposed;',
    '        // Existing business records survive a locally omitted/temporarily unrecognized record.\n        // Bounded derived queues (currently notification deliveries) are intentionally replaceable so\n        // old items can actually be pruned below Firestore document-size limits.\n        const next=base?.data?(documentReplacesOnWrite(doc.path)?proposed:mergeDocument(base.data,proposed,base.data)):proposed;',
)
replace_once(
    "lib/persistence.ts",
    '        if(writes.length===0)break;',
    '        if(writes.length===0){for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));break;}',
)
replace_once(
    "lib/persistence.ts",
    '          this.retryDelay=0;\n          setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined});\n          break;',
    '          this.retryDelay=0;\n          for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));\n          setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined});\n          break;',
)
replace_once(
    "lib/persistence.ts",
    '        if(isFirestorePermissionDenied(result)){\n          await this.isolateDenied(writes,pathKey,nextDocs);\n          break;\n        }\n        throw new Error(result.message||`Firestore commit failed (${result.status}).`);',
    '''        if(isFirestorePermissionDenied(result)){\n          await this.isolateDenied(writes,pathKey,nextDocs);\n          break;\n        }\n        // A size/validation failure in one noncritical document must never block an order, account,\n        // inventory movement, or any other unrelated record in the same flush. Isolate the writes and\n        // commit every healthy document independently.\n        await this.isolateWriteFailures(writes,pathKey,nextDocs);\n        break;''',
)
replace_once(
    "lib/persistence.ts",
    '  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */\n  private async isolateDenied',
    '''  /** A non-conflict batch failed. Commit healthy documents independently so one bad shard cannot poison unrelated records. */\n  private async isolateWriteFailures(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){\n    const failedKeys=new Set<string>();\n    const touchedKeys=new Set<string>();\n    const messages:string[]=[];\n    let anySuccess=false;\n    for(const write of writes){\n      const key=pathKey.get(write.path);if(key)touchedKeys.add(key);\n      const stamp=`${new Date().toISOString()}#${Math.random().toString(36).slice(2,8)}`;\n      const versionEntry=metaVersionKey(write.path);\n      const metaWrite:FirestoreWrite={kind:"merge",path:PLATFORM_META_DOCUMENT,data:{versions:{[versionEntry]:stamp}},fieldPaths:[`versions.${versionEntry}`]};\n      const result=await commitFirestoreWrites([write,metaWrite]);\n      if(result.ok){\n        this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});\n        this.metaVersions[versionEntry]=stamp;anySuccess=true;continue;\n      }\n      if(key)failedKeys.add(key);\n      if(isFirestorePermissionDenied(result)){this.denied.add(write.path);messages.push(`${write.path}: Security Rules rejected the write.`);continue;}\n      if(isFirestoreConflict(result)){setStatus({conflicts:status.conflicts+1});messages.push(`${write.path}: concurrent update; retrying.`);continue;}\n      messages.push(`${write.path}: ${result.message||`Firestore write failed (${result.status}).`}`);\n    }\n    for(const key of touchedKeys){\n      if(failedKeys.has(key)){this.dirty.add(key);continue;}\n      local()?.removeItem(pendingJournalKey(this.scope.uid,key));\n    }\n    this.retryDelay=failedKeys.size?Math.min(this.retryDelay?this.retryDelay*2:2_000,60_000):0;\n    setStatus({lastSyncedAt:anySuccess?new Date().toISOString():status.lastSyncedAt,lastError:messages.length?`Some changes are still safely queued: ${messages.slice(0,2).join(" | ")}`:undefined});\n    if(this.dirty.size)this.scheduleFlush(this.retryDelay||200);\n  }\n\n  /** A batch failed on rules. Retry one document at a time so the offending shard is identified and parked. */\n  private async isolateDenied''',
)
replace_once(
    "lib/persistence.ts",
    '      const merged=localDoc?mergeDocument(base?.data,localDoc,snapshot.data):snapshot.data;',
    '      const merged=localDoc?(documentReplacesOnWrite(snapshot.path)?localDoc:mergeDocument(base?.data,localDoc,snapshot.data)):snapshot.data;',
)
replace_once(
    "lib/persistence.ts",
    '          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=mergeDocument(base?.data,localShard,snapshot.data);}catch{/* keep remote */}}',
    '          if(raw!=null){try{const localShard=shardState(spec,JSON.parse(raw)).get(snapshot.path);if(localShard)override=documentReplacesOnWrite(snapshot.path)?localShard:mergeDocument(base?.data,localShard,snapshot.data);}catch{/* keep remote */}}',
)

# ---------------------------------------------------------------------------
# Global sync visibility. A user must see when cloud persistence is unhealthy.
# ---------------------------------------------------------------------------
replace_once(
    "components/app-shell-v4.tsx",
    'import { Avatar, BrandMark, Button, Modal, formatDate } from "./ui";',
    'import { SyncStatusPill } from "./settings/firebase-access-panel";\nimport { Avatar, BrandMark, Button, Modal, formatDate } from "./ui";',
)
replace_once(
    "components/app-shell-v4.tsx",
    '<div className="topbar__actions"><button className="topbar-search-mobile"',
    '<div className="topbar__actions">{firebase&&<SyncStatusPill/>}<button className="topbar-search-mobile"',
)
replace_once(
    "components/settings/firebase-access-panel.tsx",
    '  const label = sync.lastError ? sync.lastError : sync.flushing ? "Saving to Firestore…" : sync.pending ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} pending` : sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : "Connected to Firestore";\n  return <span className="sync-status-pill" data-tone={tone} title={sync.deniedDocuments.length ? `Rules denied: ${sync.deniedDocuments.join(", ")}` : undefined}><RefreshCcw size={12} />{label}</span>;',
    '  const label = sync.lastError ? "Sync error" : sync.flushing ? "Saving…" : sync.pending ? `${sync.pending} pending` : sync.lastSyncedAt ? "Cloud synced" : "Connected";\n  const detail = sync.lastError ?? (sync.deniedDocuments.length ? `Rules denied: ${sync.deniedDocuments.join(", ")}` : undefined);\n  return <span className="sync-status-pill" data-tone={tone} title={detail}><RefreshCcw size={12} />{label}</span>;',
)

# Sidebar should still scroll when needed, but the browser scrollbar chrome is intentionally hidden.
replace_once(
    "app/globals.css",
    '.sidebar__nav {\n  overflow-y:auto;\n}',
    '.sidebar__nav {\n  overflow-y:auto;\n  scrollbar-width:none;\n  -ms-overflow-style:none;\n}\n.sidebar__nav::-webkit-scrollbar {\n  width:0;\n  height:0;\n  display:none;\n}',
)

# ---------------------------------------------------------------------------
# Regression tests for the exact production incident.
# ---------------------------------------------------------------------------
replace_once(
    "tests/platform-critical-invariants.test.ts",
    'import { auditEventCreatesNotification } from "../lib/notification-engine";',
    'import { MAX_PERSISTED_NOTIFICATION_DELIVERIES, auditEventCreatesNotification, compactNotificationDeliveries } from "../lib/notification-engine";\nimport { documentReplacesOnWrite } from "../lib/firestore-domains";',
)
append = r'''

describe("production persistence incident guards", () => {
  test("notification delivery storage is bounded far below the Firestore document ceiling", () => {
    const deliveries = Array.from({ length: 1600 }, (_, index) => ({
      id: `notice-${index}`,
      sourceEventId: `audit-${index}`,
      recipientUserId: "admin",
      channel: "In app" as const,
      title: `Action ${index}`,
      detail: "Requires attention",
      tone: "warning" as const,
      createdAt: new Date(2026, 8, 23, 12, 0, index % 60).toISOString(),
      status: index < 700 ? "Unread" as const : "Read" as const,
    }));
    const compacted = compactNotificationDeliveries(deliveries);
    assert.equal(compacted.length, MAX_PERSISTED_NOTIFICATION_DELIVERIES);
    assert.ok(compacted.every((item) => item.status === "Unread"), "actionable entries are kept ahead of resolved history");
  });

  test("notification deliveries may be intentionally replaced while business records remain merge-protected", () => {
    assert.equal(documentReplacesOnWrite("domains/notificationRules/fields/deliveries"), true);
    assert.equal(documentReplacesOnWrite("domains/commercial/fields/orders"), false);
  });

  test("persistence isolates a failed document instead of poisoning unrelated writes and journals pending state", () => {
    const source = readFileSync(new URL("../lib/persistence.ts", import.meta.url), "utf8");
    assert.match(source, /isolateWriteFailures/);
    assert.match(source, /momentum-firestore-pending-v1/);
    assert.match(source, /documentReplacesOnWrite/);
  });

  test("production app exposes cloud sync health and hides sidebar scrollbar chrome", () => {
    const shell = readFileSync(new URL("../components/app-shell-v4.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    assert.match(shell, /SyncStatusPill/);
    assert.match(css, /sidebar__nav::-webkit-scrollbar/);
    assert.match(css, /scrollbar-width:none/);
  });
});
'''
path = ROOT / "tests/platform-critical-invariants.test.ts"
text = path.read_text()
if 'describe("production persistence incident guards"' not in text:
    path.write_text(text.rstrip() + append + "\n")

print("PASS: urgent order persistence, notification-size, sync visibility, and sidebar patch applied")
