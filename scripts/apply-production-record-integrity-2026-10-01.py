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
        raise SystemExit(f"{path}: expected exactly one match, found {count}\n--- needle ---\n{old[:700]}")
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{path}: expected at least {minimum} matches, found {count}\n--- needle ---\n{old[:700]}")
    write(path, text.replace(old, new))


# ---------------------------------------------------------------------------
# 1. Firestore pending-journal hardening.
# A legacy local snapshot must never replay over newer cloud records when a
# different employee/browser has already changed them. Journal v2 records the
# Firestore base snapshot and performs a three-way merge on crash recovery.
# Also make flushAndConfirm fail loudly for keys Firestore actually rejected.
# ---------------------------------------------------------------------------
replace_once(
    "lib/persistence.ts",
    'const PENDING_JOURNAL_PREFIX="momentum-firestore-pending-v1";\nconst pendingJournalKey=(uid:string,key:string)=>`${PENDING_JOURNAL_PREFIX}:${uid}:${key}`;\n',
    '''const PENDING_JOURNAL_PREFIX="momentum-firestore-pending-v1";\nconst pendingJournalKey=(uid:string,key:string)=>`${PENDING_JOURNAL_PREFIX}:${uid}:${key}`;\ntype PendingJournalV2={journalVersion:2;value:string;base:string|null;savedAt:string};\nconst pendingJournal=(value:string,base:string|null):PendingJournalV2=>({journalVersion:2,value,base,savedAt:new Date().toISOString()});\n''',
)
replace_once(
    "lib/persistence.ts",
    '  private dirty=new Set<string>();\n  private denied=new Set<string>();\n',
    '  private dirty=new Set<string>();\n  private denied=new Set<string>();\n  private failedKeys=new Map<string,string>();\n',
)
replace_once(
    "lib/persistence.ts",
    '''    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));\n    // Recover any locally journaled Firestore state that did not finish syncing before a reload/crash.\n    for(const spec of DOMAIN_SPECS){\n      const pending=local()?.getItem(pendingJournalKey(this.scope.uid,spec.key));\n      if(typeof pending==="string"){this.cache.set(spec.key,pending);this.dirty.add(spec.key);}\n    }\n''',
    '''    for(const spec of DOMAIN_SPECS)this.cache.set(spec.key,this.assemble(spec));\n    // Recover an interrupted local write without letting an old browser snapshot overwrite newer cloud work.\n    // Journal v2 stores the Firestore base that the local edit started from, so recovery can perform the same\n    // record-level three-way merge used for live conflicts. Pre-v2 journals are trusted only when no cloud\n    // state exists; otherwise they are discarded as unsafe legacy snapshots.\n    for(const spec of DOMAIN_SPECS){\n      const journalKey=pendingJournalKey(this.scope.uid,spec.key);\n      const raw=local()?.getItem(journalKey);\n      if(typeof raw!=="string")continue;\n      const remote=this.assemble(spec);\n      try{\n        const candidate=JSON.parse(raw) as unknown;\n        if(isRecord(candidate)&&candidate.journalVersion===2&&typeof candidate.value==="string"&&(typeof candidate.base==="string"||candidate.base===null)){\n          const localState=JSON.parse(candidate.value);\n          const baseState=candidate.base?JSON.parse(candidate.base):{};\n          const localDocs=shardState(spec,localState);\n          const baseDocs=shardState(spec,baseState);\n          const overrides=new Map<string,Record<string,unknown>|null>();\n          for(const doc of domainDocuments(spec,this.scope)){\n            const localDoc=localDocs.get(doc.path);\n            if(!localDoc)continue;\n            const remoteDoc=this.docs.get(doc.path)?.data??null;\n            const baseDoc=baseDocs.get(doc.path);\n            overrides.set(doc.path,documentReplacesOnWrite(doc.path)?localDoc:mergeDocument(baseDoc,localDoc,remoteDoc));\n          }\n          const recovered=this.assemble(spec,overrides);\n          if(recovered!==remote){this.cache.set(spec.key,recovered);this.dirty.add(spec.key);}\n          else local()?.removeItem(journalKey);\n          continue;\n        }\n        if(remote===null){this.cache.set(spec.key,raw);this.dirty.add(spec.key);}\n        else local()?.removeItem(journalKey);\n      }catch{local()?.removeItem(journalKey);}\n    }\n''',
)
replace_once(
    "lib/persistence.ts",
    '''  async flushAndConfirm(key:string,timeoutMs:number){\n    const started=Date.now();\n    while(Date.now()-started<timeoutMs){\n      if(!this.flushing&&this.dirty.has(key))await this.flush();\n      if(!this.flushing&&!this.dirty.has(key))return{ok:true};\n      await new Promise((resolve)=>setTimeout(resolve,75));\n    }\n    return{ok:false,message:status.lastError??"Momentum cloud did not confirm this change before the safety timeout."};\n  }\n''',
    '''  async flushAndConfirm(key:string,timeoutMs:number){\n    const started=Date.now();\n    while(Date.now()-started<timeoutMs){\n      const failed=this.failedKeys.get(key);\n      if(failed)return{ok:false,message:failed};\n      if(!this.flushing&&this.dirty.has(key))await this.flush();\n      const afterFlushFailure=this.failedKeys.get(key);\n      if(afterFlushFailure)return{ok:false,message:afterFlushFailure};\n      if(!this.flushing&&!this.dirty.has(key))return{ok:true};\n      await new Promise((resolve)=>setTimeout(resolve,75));\n    }\n    return{ok:false,message:this.failedKeys.get(key)??status.lastError??"Momentum cloud did not confirm this change before the safety timeout."};\n  }\n''',
)
replace_once(
    "lib/persistence.ts",
    '''  setItem(key:string,value:string){\n    if(this.cache.get(key)===value)return;\n    this.cache.set(key,value);\n    local()?.setItem(pendingJournalKey(this.scope.uid,key),value);\n    this.dirty.add(key);\n''',
    '''  setItem(key:string,value:string){\n    if(this.cache.get(key)===value)return;\n    const spec=DOMAIN_BY_KEY.get(key);\n    const base=spec?this.assemble(spec):null;\n    this.cache.set(key,value);\n    local()?.setItem(pendingJournalKey(this.scope.uid,key),JSON.stringify(pendingJournal(value,base)));\n    this.failedKeys.delete(key);\n    this.dirty.add(key);\n''',
)
replace_once(
    "lib/persistence.ts",
    '        if(writes.length===0){for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));break;}\n',
    '        if(writes.length===0){for(const key of keys){local()?.removeItem(pendingJournalKey(this.scope.uid,key));this.failedKeys.delete(key);}break;}\n',
)
replace_once(
    "lib/persistence.ts",
    '          for(const key of keys)local()?.removeItem(pendingJournalKey(this.scope.uid,key));\n          setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined});\n',
    '          for(const key of keys){local()?.removeItem(pendingJournalKey(this.scope.uid,key));this.failedKeys.delete(key);}\n          setStatus({lastSyncedAt:new Date().toISOString(),lastError:undefined});\n',
)
replace_once(
    "lib/persistence.ts",
    '''    for(const key of touchedKeys){\n      if(failedKeys.has(key)){this.dirty.add(key);continue;}\n      local()?.removeItem(pendingJournalKey(this.scope.uid,key));\n    }\n''',
    '''    for(const key of touchedKeys){\n      if(failedKeys.has(key)){this.failedKeys.set(key,messages[0]??"Momentum cloud rejected part of this change.");this.dirty.add(key);continue;}\n      this.failedKeys.delete(key);\n      local()?.removeItem(pendingJournalKey(this.scope.uid,key));\n    }\n''',
)
replace_once(
    "lib/persistence.ts",
    '''  private async isolateDenied(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){\n    for(const write of writes){\n      const result=await commitFirestoreWrites([write]);\n      if(result.ok){this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});continue;}\n      if(isFirestorePermissionDenied(result)){\n        this.denied.add(write.path);\n        console.warn(`[momentum] Firestore denied write to ${write.path} for ${pathKey.get(write.path)}; the change stays local to this browser.`);\n        continue;\n      }\n      if(isFirestoreConflict(result)){const key=pathKey.get(write.path);if(key)this.dirty.add(key);continue;}\n      throw new Error(result.message);\n    }\n''',
    '''  private async isolateDenied(writes:FirestoreWrite[],pathKey:Map<string,string>,nextDocs:Map<string,Record<string,unknown>>){\n    const failed=new Set<string>();\n    for(const write of writes){\n      const key=pathKey.get(write.path);\n      const result=await commitFirestoreWrites([write]);\n      if(result.ok){this.docs.set(write.path,{data:nextDocs.get(write.path)??null,updateTime:result.updateTimes[write.path]});continue;}\n      if(isFirestorePermissionDenied(result)){\n        this.denied.add(write.path);\n        if(key)failed.add(key);\n        console.warn(`[momentum] Firestore denied write to ${write.path} for ${key}; the change stays local to this browser.`);\n        continue;\n      }\n      if(isFirestoreConflict(result)){if(key)this.dirty.add(key);continue;}\n      throw new Error(result.message);\n    }\n    for(const key of failed)this.failedKeys.set(key,"Security Rules rejected this change. Momentum cloud did not save it.");\n''',
)

# ---------------------------------------------------------------------------
# 2. Never let a stale approval record move an already-approved/fulfilled order
# backward. Pending/Returned can only control an order that has not yet reached
# Approved. A real corrected resubmission explicitly moves the order itself back
# to Awaiting approval before opening a new Pending cycle.
# ---------------------------------------------------------------------------
replace_once(
    "lib/order-approval-engine.ts",
    '  if (approval.status === "Pending" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Awaiting approval" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Draft" };\n',
    '  if (approval.status === "Pending" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Awaiting approval" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Draft" };\n',
)

# ---------------------------------------------------------------------------
# 3. Critical order state writes are persisted synchronously at mutation time,
# not left solely to a later React effect. This closes the tab/reload race that
# could make a successful-looking approval/delivery revert on the next login.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context-v5.tsx",
    'const DATA_KEY = "momentum-demo-workspace-v5";\n',
    'export const WORKSPACE_STORAGE_KEY = "momentum-demo-workspace-v5";\nconst DATA_KEY = WORKSPACE_STORAGE_KEY;\n',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '''  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {\n    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;\n    setData((current) => {\n      const order = current.orders.find((item) => item.id === id);\n      if (!order || nextFulfillment[order.status] !== status) return current;\n      return { ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };\n    });\n  }, [currentUser]);\n''',
    '''  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {\n    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;\n    setData((current) => {\n      const order = current.orders.find((item) => item.id === id);\n      if (!order || nextFulfillment[order.status] !== status) return current;\n      const next={ ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };\n      momentumStorage.setItem(DATA_KEY,JSON.stringify(next));void momentumStorage.flush();\n      return next;\n    });\n  }, [currentUser]);\n''',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '''      return {\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt } : item),\n        orders: current.orders.map((order) => ["Order", "Low stock sale"].includes(approval.type) && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        activities: approval.recordId ? [{ id: `act-${Date.now()}`, accountId: current.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: `${approval.title} ${decision.toLowerCase()} by ${currentUser.name}.`, at: decidedAt, userId: currentUser.id }, ...current.activities] : current.activities,\n      };\n''',
    '''      const next={\n        ...current,\n        approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt } : item),\n        orders: current.orders.map((order) => ["Order", "Low stock sale"].includes(approval.type) && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        activities: approval.recordId ? [{ id: `act-${Date.now()}`, accountId: current.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: `${approval.title} ${decision.toLowerCase()} by ${currentUser.name}.`, at: decidedAt, userId: currentUser.id }, ...current.activities] : current.activities,\n      };\n      momentumStorage.setItem(DATA_KEY,JSON.stringify(next));void momentumStorage.flush();\n      return next;\n''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({\n      ...state,\n      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),\n      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,\n    }));\n    window.setTimeout(() => void momentumStorage.flush(), 0);\n''',
    '''    setCommercial((state) => {\n      const next={\n        ...state,\n        approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),\n        orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),\n        activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,\n      };\n      momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(next));void momentumStorage.flush();\n      return next;\n    });\n''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) }));\n''',
    '''    setCommercial((state) => {const next={ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(next));void momentumStorage.flush();return next;});\n''',
)

# Delivery task mutations persist immediately as well as through the existing effect.
replace_once(
    "lib/delivery-context.tsx",
    '  const [state, setState] = useState<DeliveryState>(() => read());\n',
    '  const [state, setState] = useState<DeliveryState>(() => read());\n  const commitState=(updater:(current:DeliveryState)=>DeliveryState)=>setState((current)=>{const next=updater(current);if(next!==current){momentumStorage.setItem(DELIVERY_STORAGE_KEY,JSON.stringify(next));void momentumStorage.flush();}return next;});\n',
)
replace_all(
    "lib/delivery-context.tsx",
    'setState((current) => ({ ...current, tasks:',
    'commitState((current) => ({ ...current, tasks:',
    minimum=6,
)

# Inventory custody/reservation mutations also persist immediately.
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());useEffect(',
    'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());const commitLedger=(updater:(current:InventoryLedgerState)=>InventoryLedgerState)=>setLedger((current)=>{const next=updater(current);if(next!==current){momentumStorage.setItem(INVENTORY_LEDGER_STORAGE_KEY,JSON.stringify(next));void momentumStorage.flush();}return next;});useEffect(',
)
replace_all(
    "lib/inventory-ledger-context-v2.tsx",
    'setLedger((state)=>({...state',
    'commitLedger((state)=>({...state',
    minimum=6,
)

# ---------------------------------------------------------------------------
# 4. Operational approval queue only shows a Pending order approval when the
# linked order is actually Awaiting approval. Approved/fulfilled orders cannot
# be resurrected into My Work by a stale Pending replica. Confirm decisions in
# Firestore before calling them complete.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/work-v2.tsx",
    'import { useState } from "react";\n',
    'import { useState } from "react";\nimport { momentumStorage } from "../../lib/persistence";\nimport { COMMERCIAL_KEY } from "../../lib/workspace-context";\nimport { WORKSPACE_STORAGE_KEY } from "../../lib/workspace-context-v5";\n',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const [returnNote,setReturnNote]=useState("");\n',
    '  const [returnNote,setReturnNote]=useState("");\n  const [decisionNotice,setDecisionNotice]=useState("");\n',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const pending=scope.approvals.filter((approval)=>approval.status==="Pending");\n',
    '  const pending=scope.approvals.filter((approval)=>approval.status==="Pending"&&(!orderApproval(approval.type)||scope.orders.find((order)=>order.id===approval.recordId)?.status==="Awaiting approval"));\n',
)
replace_once(
    "components/pages/work-v2.tsx",
    '  const decide=(decision:"Approved"|"Returned")=>{if(!reviewApproval)return;if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else decideApproval(reviewApproval.id,decision);setReviewId(null);setReturnNote("");};\n',
    '  const decide=async(decision:"Approved"|"Returned")=>{if(!reviewApproval)return;setDecisionNotice("Saving decision to Momentum cloud…");if(reviewApproval.type==="Timecard"&&reviewTimecard){if(decision==="Returned"&&!returnNote.trim())return;if(decision==="Returned")auditReturn(reviewTimecard.id,returnNote);else auditApprove(reviewTimecard.id);decideTimecard(reviewTimecard.id,decision==="Approved"?"Manager approved":"Returned");}else decideApproval(reviewApproval.id,decision);const [commercial,workspace]=await Promise.all([momentumStorage.flushAndConfirm(COMMERCIAL_KEY),momentumStorage.flushAndConfirm(WORKSPACE_STORAGE_KEY)]);if(!commercial.ok||!workspace.ok){setDecisionNotice(`Decision is still on this device but Momentum cloud has NOT confirmed it. Do not approve it again. ${commercial.message??workspace.message??"Check the sync status."}`);return;}setDecisionNotice("");setReviewId(null);setReturnNote("");};\n',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<Button icon={<Check size={15}/>} onClick={()=>decide("Approved")}>Approve</Button>',
    '<Button icon={<Check size={15}/>} onClick={()=>void decide("Approved")}>Approve</Button>',
)
replace_once(
    "components/pages/work-v2.tsx",
    'onClick={()=>decide("Returned")}>Return</Button>',
    'onClick={()=>void decide("Returned")}>Return</Button>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<div><span>Location</span><strong>{reviewAccount?.locationName??reviewAccount?.location??"—"}</strong></div><div><span>Quantity</span><strong>{reviewOrder.cases} total cases</strong></div>',
    '<div><span>Location</span><strong>{reviewAccount?.locationName??reviewAccount?.location??"—"}</strong></div><div><span>Placed by</span><strong>{data.users.find((user)=>user.id===reviewOrder.ownerId)?.name??reviewApproval.requestedBy}</strong></div><div><span>Quantity</span><strong>{reviewOrder.cases} total cases</strong></div>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<p>{detailFor(approval)}</p><div className="approval-card__meta">',
    '<p>{detailFor(approval)}</p>{orderApproval(approval.type)&&<p><strong>Placed by {data.users.find((user)=>user.id===scope.orders.find((order)=>order.id===approval.recordId)?.ownerId)?.name??approval.requestedBy}</strong></p>}<div className="approval-card__meta">',
)
replace_once(
    "components/pages/work-v2.tsx",
    '      {reviewApproval&&<div className="record-review">',
    '      {reviewApproval&&<div className="record-review">{decisionNotice&&<p className={decisionNotice.includes("NOT confirmed")?"form-error":"form-notice"} role="status">{decisionNotice}</p>}',
)

# Stale pending approval notifications also stop being actionable when the order is no longer awaiting approval.
replace_once(
    "lib/notification-engine.ts",
    '''    if(["Order","Low stock sale"].includes(approval.type)){\n      if(!approval.recordId||!data.orders.some((order)=>order.id===approval.recordId))return null;\n      return{targetPage:"orders",targetRecordId:approval.recordId,actionLabel:approval.status==="Pending"?"Review order":"Open order"};\n    }\n''',
    '''    if(["Order","Low stock sale"].includes(approval.type)){\n      if(!approval.recordId)return null;\n      const order=data.orders.find((item)=>item.id===approval.recordId);\n      if(!order)return null;\n      if(approval.status==="Pending"&&order.status!=="Awaiting approval")return null;\n      return{targetPage:"orders",targetRecordId:approval.recordId,actionLabel:approval.status==="Pending"?"Review order":"Open order"};\n    }\n''',
)

# ---------------------------------------------------------------------------
# 5. Every operational order view identifies who actually placed the order.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/orders-v3.tsx",
    '<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>',
    '<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Placed by</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span>',
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span><strong>{data.users.find((user)=>user.id===o.ownerId)?.name??o.ownerId}</strong><small>Order creator</small></span><span>{o.cases}</span>',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '<small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"}</small>',
    '<small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"} · Placed by {placedBy?.name??selected.ownerId}</small>',
)
replace_once(
    "app/globals.css",
    '  grid-template-columns:88px minmax(150px,1fr) 54px 74px 128px 16px;\n',
    '  grid-template-columns:88px minmax(150px,1fr) minmax(110px,.75fr) 54px 74px 128px 16px;\n',
)

# Delivery cards and full detail show order creator.
replace_once(
    "components/pages/deliveries.tsx",
    'import { useWorkspace } from "../../lib/workspace-context";\n',
    'import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";\nimport { WORKSPACE_STORAGE_KEY } from "../../lib/workspace-context-v5";\nimport { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";\nimport { DELIVERY_STORAGE_KEY } from "../../lib/delivery-engine";\nimport { momentumStorage } from "../../lib/persistence";\nimport { InvoicePrintCenter } from "../finance/invoice-print-center";\n',
)
# Remove the duplicate delivery-engine/persistence imports created by the richer import block above.
replace_once(
    "components/pages/deliveries.tsx",
    'import { deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";\n',
    'import { DELIVERY_STORAGE_KEY, deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";\n',
)
replace_once(
    "components/pages/deliveries.tsx",
    'import { useSyncStatus } from "../../lib/persistence";\n',
    'import { momentumStorage, useSyncStatus } from "../../lib/persistence";\n',
)
# Clean duplicate imports introduced above.
text=read("components/pages/deliveries.tsx")
text=text.replace('import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";\nimport { DELIVERY_STORAGE_KEY } from "../../lib/delivery-engine";\nimport { momentumStorage } from "../../lib/persistence";\n','')
write("components/pages/deliveries.tsx",text)
replace_once(
    "components/pages/deliveries.tsx",
    '  const run = (result: { ok: boolean; message?: string }, success: string) => setNotice(result.ok ? success : result.message ?? "The delivery update was not accepted.");\n',
    '  const run = async(result: { ok: boolean; message?: string }, success: string) => {if(!result.ok){setNotice(result.message??"The delivery update was not accepted.");return;}setNotice("Saving delivery change to Momentum cloud…");const checks=await Promise.all([momentumStorage.flushAndConfirm(DELIVERY_STORAGE_KEY),momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY),momentumStorage.flushAndConfirm(COMMERCIAL_KEY),momentumStorage.flushAndConfirm(WORKSPACE_STORAGE_KEY)]);const failed=checks.find((item)=>!item.ok);setNotice(failed?`Change is still on this device but Momentum cloud has NOT confirmed every record. Do not repeat the action. ${failed.message??"Check the sync status."}`:success);};\n',
)
replace_once(
    "components/pages/deliveries.tsx",
    '    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;\n',
    '    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;\n    const placedBy = data.users.find((user) => user.id === order.ownerId);\n',
)
replace_once(
    "components/pages/deliveries.tsx",
    '        <div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>\n',
    '        <div><span>Placed by</span><strong>{placedBy?.name ?? order.ownerId}</strong><small>Order creator</small></div>\n        <div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>\n',
)
replace_once(
    "components/pages/deliveries.tsx",
    '  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;\n',
    '  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;\n  const detailPlacedBy = detailOrder ? data.users.find((user) => user.id === detailOrder.ownerId) : undefined;\n',
)
replace_once(
    "components/pages/deliveries.tsx",
    '      <Section title="Delivery queue" description="Each card shows the essentials. Use View details for the complete order, contacts, requests, payment record and delivery history.">',
    '      <InvoicePrintCenter allowedOrderIds={visible.map((order)=>order.id)} title={isDriver?"Delivery invoices":"Delivery-run invoices"} description="Print one invoice or a complete delivery batch directly from the delivery workspace." />\n\n      <Section title="Delivery queue" description="Each card shows the essentials. Use View details for the complete order, contacts, requests, payment record and delivery history.">',
)
replace_once(
    "components/pages/deliveries.tsx",
    '<div><span>Status</span><strong>{detailStatus}</strong><small>Order {detailOrder.status}</small></div>\n          <div><span>Cases</span>',
    '<div><span>Status</span><strong>{detailStatus}</strong><small>Order {detailOrder.status}</small></div>\n          <div><span>Placed by</span><strong>{detailPlacedBy?.name??detailOrder.ownerId}</strong><small>Order creator</small></div>\n          <div><span>Cases</span>',
)

# Invoice center can be embedded in Delivery and shows order creator in the register and printable document.
replace_once(
    "components/finance/invoice-print-center.tsx",
    'export function InvoicePrintCenter() {\n  const { data, scope } = useWorkspace();\n',
    'type InvoicePrintCenterProps={allowedOrderIds?:string[];title?:string;description?:string};\n\nexport function InvoicePrintCenter({allowedOrderIds,title="Customer invoices",description="Print a single invoice or select multiple invoices for a delivery run. Browser print also supports Save as PDF."}:InvoicePrintCenterProps={}) {\n  const { data, scope } = useWorkspace();\n',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '  const orderIds = useMemo(() => new Set(scope.orders.map((order) => order.id)), [scope.orders]);\n',
    '  const allowedKey=allowedOrderIds?.join("|")??"";\n  const orderIds = useMemo(() => {const scoped=new Set(scope.orders.map((order)=>order.id));return new Set(allowedOrderIds?allowedOrderIds.filter((id)=>scoped.has(id)):[...scoped]);}, [scope.orders,allowedKey]);\n',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '    const order = data.orders.find((item) => item.id === invoice.orderId);\n',
    '    const order = data.orders.find((item) => item.id === invoice.orderId);\n    const placedBy = order ? data.users.find((user) => user.id === order.ownerId) : undefined;\n',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '<div><span>Cases</span><strong>{lines.reduce((sum, line) => sum + line.cases, 0)}</strong></div>\n',
    '<div><span>Cases</span><strong>{lines.reduce((sum, line) => sum + line.cases, 0)}</strong></div>\n        <div><span>Placed by</span><strong>{placedBy?.name ?? order?.ownerId ?? "Not recorded"}</strong></div>\n',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '<Section title="Customer invoices" description="Print a single invoice or select multiple invoices for a delivery run. Browser print also supports Save as PDF.">',
    '<Section title={title} description={description}>',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '<span>Select</span><span>Invoice</span><span>Location</span><span>Total</span><span>Balance</span><span>Status</span><span>Actions</span>',
    '<span>Select</span><span>Invoice</span><span>Location</span><span>Placed by</span><span>Total</span><span>Balance</span><span>Status</span><span>Actions</span>',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '        const checked = selectedSet.has(invoice.id);\n        return <div className="finance-order-row invoice-register__row" key={invoice.id}><span><button',
    '        const checked = selectedSet.has(invoice.id);\n        const order=data.orders.find((item)=>item.id===invoice.orderId);const placedBy=data.users.find((user)=>user.id===order?.ownerId);\n        return <div className="finance-order-row invoice-register__row" key={invoice.id}><span><button',
)
replace_once(
    "components/finance/invoice-print-center.tsx",
    '</button></span><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{formatMoney(invoice.total)}</span>',
    '</button></span><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{placedBy?.name??order?.ownerId??"Not recorded"}</span><span>{formatMoney(invoice.total)}</span>',
)

# Delivery Drivers need read-only invoice/payment context to print the same authoritative invoice records.
replace_once(
    "lib/firestore-domains.ts",
    '{key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},',
    '{key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations","Delivery Driver"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},',
)

# ---------------------------------------------------------------------------
# 6. Regression coverage for the exact production incident and new driver print
# path, including stale-journal safety, non-regression, cloud confirmation and
# order attribution visibility.
# ---------------------------------------------------------------------------
replace_once(
    "tests/platform-critical-invariants.test.ts",
    '''  test("a more advanced fulfillment state cannot be overwritten by a stale order replica", () => {\n    const approvedOrder: Order = { ...order, status: "Approved" };\n    const deliveredOrder: Order = { ...order, status: "Delivered" };\n    const result = reconcileOrders([approvedOrder], [deliveredOrder], []);\n    assert.equal(result.length, 1);\n    assert.equal(result[0].status, "Delivered");\n  });\n''',
    '''  test("a more advanced fulfillment state cannot be overwritten by a stale order replica", () => {\n    const approvedOrder: Order = { ...order, status: "Approved" };\n    const deliveredOrder: Order = { ...order, status: "Delivered" };\n    const result = reconcileOrders([approvedOrder], [deliveredOrder], []);\n    assert.equal(result.length, 1);\n    assert.equal(result[0].status, "Delivered");\n  });\n\n  test("a stale Pending or Returned approval cannot move an already approved order backward", () => {\n    const approvedOrder:Order={...order,status:"Approved"};\n    assert.equal(reconcileOrders([approvedOrder],[],[pending])[0].status,"Approved");\n    const returned:Approval={...pending,status:"Returned",decidedBy:"admin",decidedAt:"2026-09-23T16:04:00.000Z",returnReason:"stale"};\n    assert.equal(reconcileOrders([approvedOrder],[],[returned])[0].status,"Approved");\n  });\n''',
)
replace_once(
    "tests/platform-critical-invariants.test.ts",
    '''  test("persistence isolates a failed document instead of poisoning unrelated writes and journals pending state", () => {\n    const source = readFileSync(new URL("../lib/persistence.ts", import.meta.url), "utf8");\n    assert.match(source, /isolateWriteFailures/);\n    assert.match(source, /momentum-firestore-pending-v1/);\n    assert.match(source, /documentReplacesOnWrite/);\n  });\n''',
    '''  test("persistence isolates failures, uses a three-way recovery journal, and never falsely confirms a rejected key", () => {\n    const source = readFileSync(new URL("../lib/persistence.ts", import.meta.url), "utf8");\n    assert.match(source, /isolateWriteFailures/);\n    assert.match(source, /journalVersion:2/);\n    assert.match(source, /Pre-v2 journals are trusted only when no cloud/);\n    assert.match(source, /failedKeys/);\n    assert.match(source, /Security Rules rejected this change/);\n    assert.match(source, /documentReplacesOnWrite/);\n  });\n''',
)
replace_once(
    "tests/platform-critical-invariants.test.ts",
    '''  test("delivery page surfaces approved requests and the order modal uses the fixed detail layout", () => {\n    const delivery=readFileSync(new URL("../components/pages/deliveries.tsx",import.meta.url),"utf8");\n    const orders=readFileSync(new URL("../components/pages/orders-v3.tsx",import.meta.url),"utf8");\n''',
    '''  test("delivery page surfaces approved requests and the order modal uses the fixed detail layout", () => {\n    const delivery=readFileSync(new URL("../components/pages/deliveries.tsx",import.meta.url),"utf8");\n    const orders=readFileSync(new URL("../components/pages/orders-v3.tsx",import.meta.url),"utf8");\n''',
)
# Add a new production guard near the end of the delivery/visual block.
replace_once(
    "tests/platform-critical-invariants.test.ts",
    '''  test("CRM Tools is retired from navigation and role access", () => {\n''',
    '''  test("delivery, approval, order and invoice views expose order creator and delivery can print invoices", () => {\n    const delivery=readFileSync(new URL("../components/pages/deliveries.tsx",import.meta.url),"utf8");\n    const orders=readFileSync(new URL("../components/pages/orders-v3.tsx",import.meta.url),"utf8");\n    const work=readFileSync(new URL("../components/pages/work-v2.tsx",import.meta.url),"utf8");\n    const invoices=readFileSync(new URL("../components/finance/invoice-print-center.tsx",import.meta.url),"utf8");\n    const domains=readFileSync(new URL("../lib/firestore-domains.ts",import.meta.url),"utf8");\n    assert.match(delivery,/InvoicePrintCenter/);\n    assert.match(delivery,/Placed by/);\n    assert.match(orders,/Placed by/);\n    assert.match(work,/Placed by/);\n    assert.match(invoices,/Placed by/);\n    assert.match(domains,/momentum-commerce-v1[\\s\\S]*Delivery Driver/);\n    assert.match(delivery,/flushAndConfirm\\(DELIVERY_STORAGE_KEY\\)/);\n    assert.match(work,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n  });\n\n  test("CRM Tools is retired from navigation and role access", () => {\n''',
)

print("Production record integrity patch applied.")
