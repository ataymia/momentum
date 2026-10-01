from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Delivery patch anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Delivery state: enter persistence synchronously before UI checks cloud sync.
# ---------------------------------------------------------------------------
replace_once(
    "lib/delivery-context.tsx",
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";',
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";',
)
replace_once(
    "lib/delivery-context.tsx",
    '  const [state, setState] = useState<DeliveryState>(() => read());\n  const canReconcileCancelledDelivery',
    '  const [state, setState] = useState<DeliveryState>(() => read());\n  const stateRef = useRef(state);\n  const commitDeliveryState = (next: DeliveryState) => { stateRef.current = next; momentumStorage.setItem(DELIVERY_STORAGE_KEY, JSON.stringify(next)); setState(next); return momentumStorage.flushAndConfirm(DELIVERY_STORAGE_KEY); };\n  useEffect(() => { stateRef.current = state; }, [state]);\n  const canReconcileCancelledDelivery',
)
replace_once(
    "lib/delivery-context.tsx",
    '  useRemoteStorageSync(DELIVERY_STORAGE_KEY, () => setState(read()));',
    '  useRemoteStorageSync(DELIVERY_STORAGE_KEY, () => { const next = read(); stateRef.current = next; setState(next); });',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: [record, ...current.tasks] }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: [record, ...current.tasks] });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Loaded", loadedAt: stamp }, { type: "Loaded", actorId: currentUser!.id }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Loaded", loadedAt: stamp }, { type: "Loaded", actorId: currentUser!.id }) : item) });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "In transit", departedAt: stamp }, { type: "Departed", actorId: currentUser!.id }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "In transit", departedAt: stamp }, { type: "Departed", actorId: currentUser!.id }) : item) });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Delivered", deliveredAt: stamp, note: note?.trim() || item.note }, { type: "Delivered", actorId: currentUser!.id, note: note?.trim() || undefined }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Delivered", deliveredAt: stamp, note: note?.trim() || item.note }, { type: "Delivered", actorId: currentUser!.id, note: note?.trim() || undefined }) : item) });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, collections: [record, ...(item.collections ?? [])] }, { type: "Payment collected", actorId: currentUser!.id, note: `${method} · $${amount.toFixed(2)}${record.reference ? ` · ${record.reference}` : ""}. Pending Finance reconciliation.` }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, collections: [record, ...(item.collections ?? [])] }, { type: "Payment collected", actorId: currentUser!.id, note: `${method} · $${amount.toFixed(2)}${record.reference ? ` · ${record.reference}` : ""}. Pending Finance reconciliation.` }) : item) });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, note: note.trim() }, { type: "Note", actorId: currentUser!.id, note: note.trim() }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, note: note.trim() }, { type: "Note", actorId: currentUser!.id, note: note.trim() }) : item) });\n    return { ok: true };',
)
replace_once(
    "lib/delivery-context.tsx",
    '    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id }, { type: "Cancelled", actorId: currentUser.id, note: reason.trim() }) : item) }));\n    return { ok: true };',
    '    const current = stateRef.current;\n    void commitDeliveryState({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? appendEvent({ ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id }, { type: "Cancelled", actorId: currentUser.id, note: reason.trim() }) : item) });\n    return { ok: true };',
)

# ---------------------------------------------------------------------------
# Inventory ledger: reservations/custody/delivery movement must be journaled
# before delivery UI calls flushAndConfirm.
# ---------------------------------------------------------------------------
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'import { ReactNode, createContext, useContext, useEffect, useState } from "react";',
    'import { ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());useEffect(',
    'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());const ledgerRef=useRef(ledger);const commitLedger=(next:InventoryLedgerState)=>{ledgerRef.current=next;momentumStorage.setItem(INVENTORY_LEDGER_STORAGE_KEY,JSON.stringify(next));setLedger(next);return momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY);};useEffect(()=>{ledgerRef.current=ledger;},[ledger]);useEffect(',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'useRemoteStorageSync(INVENTORY_LEDGER_STORAGE_KEY,()=>setLedger(read()));',
    'useRemoteStorageSync(INVENTORY_LEDGER_STORAGE_KEY,()=>{const next=read();ledgerRef.current=next;setLedger(next);});',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'if(additions.length)setLedger((state)=>({...state,reservations:[...additions,...state.reservations]}));\n    setOrderStatus(orderId,"Allocated");',
    'if(additions.length){const current=ledgerRef.current;void commitLedger({...current,reservations:[...additions,...current.reservations]});}\n    setOrderStatus(orderId,"Allocated");',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'if(movements.length)setLedger((state)=>({...state,movements:[...movements,...state.movements]}));return true;};',
    'if(movements.length){const current=ledgerRef.current;void commitLedger({...current,movements:[...movements,...current.movements]});}return true;};',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    'const fulfilledAt=now();setLedger((state)=>({...state,movements:[...movements,...state.movements],reservations:state.reservations.map((item)=>item.orderId===orderId&&item.status==="Active"?{...item,status:"Fulfilled",fulfilledAt}:item)}));setOrderStatus(orderId,"Delivered");return true;};',
    'const fulfilledAt=now();const current=ledgerRef.current;void commitLedger({...current,movements:[...movements,...current.movements],reservations:current.reservations.map((item)=>item.orderId===orderId&&item.status==="Active"?{...item,status:"Fulfilled",fulfilledAt}:item)});setOrderStatus(orderId,"Delivered");return true;};',
)

# ---------------------------------------------------------------------------
# Delivery UI: success means all relevant records are cloud-confirmed.
# Also surface the order creator in both card and detail view.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/deliveries.tsx",
    'import { deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";\nimport { useDelivery } from "../../lib/delivery-context";',
    'import { DELIVERY_STORAGE_KEY, deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";\nimport { useDelivery } from "../../lib/delivery-context";',
)
replace_once(
    "components/pages/deliveries.tsx",
    'import { orderLinesFor } from "../../lib/order-lines";\nimport { useSyncStatus } from "../../lib/persistence";',
    'import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";\nimport { orderLinesFor } from "../../lib/order-lines";\nimport { momentumStorage, useSyncStatus } from "../../lib/persistence";',
)
replace_once(
    "components/pages/deliveries.tsx",
    'import { useWorkspace } from "../../lib/workspace-context";',
    'import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";',
)
replace_once(
    "components/pages/deliveries.tsx",
    '  const run = (result: { ok: boolean; message?: string }, success: string) => setNotice(result.ok ? success : result.message ?? "The delivery update was not accepted.");',
    '  const run = async (result: { ok: boolean; message?: string }, success: string) => { if(!result.ok){setNotice(result.message??"The delivery update was not accepted.");return;} setNotice("Saving to Momentum cloud…"); const delivery=await momentumStorage.flushAndConfirm(DELIVERY_STORAGE_KEY); const inventory=await momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY); const commercial=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY); const failed=[delivery,inventory,commercial].find((item)=>!item.ok); setNotice(failed?`The change is safely queued on this device but is NOT fully cloud-confirmed. Do not repeat the action. ${failed.message??"Check the sync indicator."}`:success); };',
)
# All run(...) calls in JSX/event callbacks should intentionally fire the async guard.
p=Path("components/pages/deliveries.tsx")
s=p.read_text()
s=s.replace('onClick={() => run(', 'onClick={() => void run(')
s=s.replace('if (reason) run(', 'if (reason) void run(')
s=s.replace('if (note) run(', 'if (note) void run(')
s=s.replace(')) run(markDelivered(', ')) void run(markDelivered(')
p.write_text(s)

replace_once(
    "components/pages/deliveries.tsx",
    '    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;\n    const status = deliveryStatusForOrder(state, order);',
    '    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;\n    const orderCreator = data.users.find((user) => user.id === order.ownerId);\n    const status = deliveryStatusForOrder(state, order);',
)
replace_once(
    "components/pages/deliveries.tsx",
    '<div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>\n        <div><span>Terms</span>',
    '<div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>\n        <div><span>Placed by</span><strong>{orderCreator?.name ?? order.ownerId}</strong><small>{order.placedAt}</small></div>\n        <div><span>Terms</span>',
)
replace_once(
    "components/pages/deliveries.tsx",
    '  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;\n  const detailLines',
    '  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;\n  const detailOrderCreator = detailOrder ? data.users.find((user) => user.id === detailOrder.ownerId) : undefined;\n  const detailLines',
)
replace_once(
    "components/pages/deliveries.tsx",
    '<div><span>Driver</span><strong>{detailDriver?.name ?? "Unassigned"}</strong><small>{detailTask?.status ?? "Not claimed"}</small></div>\n          </div>',
    '<div><span>Driver</span><strong>{detailDriver?.name ?? "Unassigned"}</strong><small>{detailTask?.status ?? "Not claimed"}</small></div>\n            <div><span>Placed by</span><strong>{detailOrderCreator?.name ?? detailOrder.ownerId}</strong><small>{detailOrder.placedAt}</small></div>\n          </div>',
)

# ---------------------------------------------------------------------------
# Orders register/detail: creator must be unmistakable on every main order view.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/orders-v3.tsx",
    '<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>',
    '<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>',
)
# Add creator beneath the customer/location without changing the existing grid.
replace_once(
    "components/pages/orders-v3.tsx",
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span>',
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small><small>Placed by {data.users.find((user)=>user.id===o.ownerId)?.name??o.ownerId}</small></span><span>{o.cases}</span>',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '<div><span>Placed</span><strong>{selected.placedAt}</strong><small>{placedBy?.name??selected.ownerId}</small></div>',
    '<div><span>Placed by</span><strong>{placedBy?.name??selected.ownerId}</strong><small>{selected.placedAt}</small></div>',
)

print("Delivery durability and order attribution patch applied.")
