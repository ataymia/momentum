from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path:str)->str:return (ROOT/path).read_text()
def write(path:str,text:str)->None:(ROOT/path).write_text(text)
def replace_once(path:str,old:str,new:str)->None:
    text=read(path);count=text.count(old)
    if count!=1:raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:350]!r}")
    write(path,text.replace(old,new,1))
def replace_all(path:str,old:str,new:str,minimum:int=1)->None:
    text=read(path);count=text.count(old)
    if count<minimum:raise SystemExit(f"{path}: expected at least {minimum} anchors, found {count}: {old[:350]!r}")
    write(path,text.replace(old,new))

# An already-approved order is not allowed to move backward because an old Pending/Returned
# approval replica survived somewhere. A genuine resubmission changes the order itself first.
replace_once("lib/order-approval-engine.ts",
'  if (approval.status === "Pending" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Awaiting approval" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] <= fulfillmentRank.Approved) return { ...order, status: "Draft" };',
'  if (approval.status === "Pending" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Awaiting approval" };\n  if (approval.status === "Returned" && fulfillmentRank[order.status] < fulfillmentRank.Approved) return { ...order, status: "Draft" };')

# The approval queue and bell both require the linked order to actually be awaiting approval.
replace_once("components/pages/work-v2.tsx",
'  const pending=scope.approvals.filter((approval)=>approval.status==="Pending");',
'  const pending=scope.approvals.filter((approval)=>approval.status==="Pending"&&(!orderApproval(approval.type)||scope.orders.find((order)=>order.id===approval.recordId)?.status==="Awaiting approval"));')
replace_once("lib/notification-engine.ts",
'''    if(["Order","Low stock sale"].includes(approval.type)){\n      if(!approval.recordId||!data.orders.some((order)=>order.id===approval.recordId))return null;\n      return{targetPage:"orders",targetRecordId:approval.recordId,actionLabel:approval.status==="Pending"?"Review order":"Open order"};\n    }''',
'''    if(["Order","Low stock sale"].includes(approval.type)){\n      if(!approval.recordId)return null;\n      const order=data.orders.find((item)=>item.id===approval.recordId);\n      if(!order)return null;\n      if(approval.status==="Pending"&&order.status!=="Awaiting approval")return null;\n      return{targetPage:"orders",targetRecordId:approval.recordId,actionLabel:approval.status==="Pending"?"Review order":"Open order"};\n    }''')

# Delivery and inventory state are operational evidence, so write their new state to the
# persistence boundary in the same mutation that changes React state. This makes subsequent
# flushAndConfirm calls meaningful rather than racing the next render/effect.
replace_once("lib/delivery-context.tsx",
'  const [state, setState] = useState<DeliveryState>(() => read());',
'  const [state, setState] = useState<DeliveryState>(() => read());\n  const commitState=(updater:(current:DeliveryState)=>DeliveryState)=>setState((current)=>{const next=updater(current);if(next!==current){momentumStorage.setItem(DELIVERY_STORAGE_KEY,JSON.stringify(next));void momentumStorage.flush();}return next;});')
replace_all("lib/delivery-context.tsx",'setState((current) => ({ ...current, tasks:','commitState((current) => ({ ...current, tasks:',minimum=6)

replace_once("lib/inventory-ledger-context-v2.tsx",
'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());useEffect(',
'const[ledger,setLedger]=useState<InventoryLedgerState>(()=>read());const commitLedger=(updater:(current:InventoryLedgerState)=>InventoryLedgerState)=>setLedger((current)=>{const next=updater(current);if(next!==current){momentumStorage.setItem(INVENTORY_LEDGER_STORAGE_KEY,JSON.stringify(next));void momentumStorage.flush();}return next;});useEffect(')
replace_all("lib/inventory-ledger-context-v2.tsx",'setLedger((state)=>({...state','commitLedger((state)=>({...state',minimum=6)

# Show immutable order creator on the primary order register and summary.
replace_once("components/pages/orders-v3.tsx",
'<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>',
'<div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Placed by</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div>')
replace_once("components/pages/orders-v3.tsx",
'<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span>',
'<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span><strong>{data.users.find((user)=>user.id===o.ownerId)?.name??o.ownerId}</strong><small>Order creator</small></span><span>{o.cases}</span>')
replace_once("components/pages/orders-v3.tsx",
'<small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"}</small>',
'<small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"} · Placed by {placedBy?.name??selected.ownerId}</small>')
replace_once("app/globals.css",'  grid-template-columns:88px minmax(150px,1fr) 54px 74px 128px 16px;','  grid-template-columns:88px minmax(150px,1fr) minmax(110px,.75fr) 54px 74px 128px 16px;')

# Account-level order history is also an order screen and must retain creator visibility.
replace_once("components/pages/accounts.tsx",
'<span><strong>{order.number}</strong><small>{order.product??"Golden Eagle"}</small></span><span>{formatDate(order.placedAt,{month:"short",day:"numeric",year:"numeric"})}</span>',
'<span><strong>{order.number}</strong><small>{order.product??"Golden Eagle"} · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</small></span><span>{formatDate(order.placedAt,{month:"short",day:"numeric",year:"numeric"})}</span>')

# Invoice print center can be embedded in a delivery workspace and identifies the order creator.
replace_once("components/finance/invoice-print-center.tsx",
'export function InvoicePrintCenter() {\n  const { data, scope } = useWorkspace();',
'type InvoicePrintCenterProps={allowedOrderIds?:string[];title?:string;description?:string};\n\nexport function InvoicePrintCenter({allowedOrderIds,title="Customer invoices",description="Print a single invoice or select multiple invoices for a delivery run. Browser print also supports Save as PDF."}:InvoicePrintCenterProps={}) {\n  const { data, scope } = useWorkspace();')
replace_once("components/finance/invoice-print-center.tsx",
'  const orderIds = useMemo(() => new Set(scope.orders.map((order) => order.id)), [scope.orders]);',
'  const orderIds = useMemo(() => {const scoped=new Set(scope.orders.map((order)=>order.id));return new Set(allowedOrderIds?allowedOrderIds.filter((id)=>scoped.has(id)):[...scoped]);}, [scope.orders,allowedOrderIds]);')
replace_once("components/finance/invoice-print-center.tsx",
'    const order = data.orders.find((item) => item.id === invoice.orderId);',
'    const order = data.orders.find((item) => item.id === invoice.orderId);\n    const placedBy = order ? data.users.find((user) => user.id === order.ownerId) : undefined;')
replace_once("components/finance/invoice-print-center.tsx",
'<div><span>Cases</span><strong>{lines.reduce((sum, line) => sum + line.cases, 0)}</strong></div>',
'<div><span>Cases</span><strong>{lines.reduce((sum, line) => sum + line.cases, 0)}</strong></div>\n        <div><span>Placed by</span><strong>{placedBy?.name ?? order?.ownerId ?? "Not recorded"}</strong></div>')
replace_once("components/finance/invoice-print-center.tsx",
'<Section title="Customer invoices" description="Print a single invoice or select multiple invoices for a delivery run. Browser print also supports Save as PDF.">',
'<Section title={title} description={description}>')
replace_once("components/finance/invoice-print-center.tsx",
'<span>Select</span><span>Invoice</span><span>Location</span><span>Total</span><span>Balance</span><span>Status</span><span>Actions</span>',
'<span>Select</span><span>Invoice</span><span>Location</span><span>Placed by</span><span>Total</span><span>Balance</span><span>Status</span><span>Actions</span>')
replace_once("components/finance/invoice-print-center.tsx",
'        const checked = selectedSet.has(invoice.id);\n        return <div className="finance-order-row invoice-register__row" key={invoice.id}><span><button',
'        const checked = selectedSet.has(invoice.id);\n        const order=data.orders.find((item)=>item.id===invoice.orderId);const placedBy=data.users.find((user)=>user.id===order?.ownerId);\n        return <div className="finance-order-row invoice-register__row" key={invoice.id}><span><button')
replace_once("components/finance/invoice-print-center.tsx",
'</button></span><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{formatMoney(invoice.total)}</span>',
'</button></span><span><strong>{invoice.number}</strong></span><span>{location?.locationName ?? location?.name}</span><span>{placedBy?.name??order?.ownerId??"Not recorded"}</span><span>{formatMoney(invoice.total)}</span>')

# Delivery page: show creator, allow invoice printing there, and do not claim an action succeeded
# until the shared delivery/inventory/order records have been cloud-confirmed.
replace_once("components/pages/deliveries.tsx",
'import { deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";',
'import { DELIVERY_STORAGE_KEY, deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";')
replace_once("components/pages/deliveries.tsx",
'import { orderLinesFor } from "../../lib/order-lines";',
'import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";\nimport { orderLinesFor } from "../../lib/order-lines";')
replace_once("components/pages/deliveries.tsx",
'import { useSyncStatus } from "../../lib/persistence";',
'import { momentumStorage, useSyncStatus } from "../../lib/persistence";')
replace_once("components/pages/deliveries.tsx",
'import { useWorkspace } from "../../lib/workspace-context";',
'import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";\nimport { InvoicePrintCenter } from "../finance/invoice-print-center";')
replace_once("components/pages/deliveries.tsx",
'  const run = (result: { ok: boolean; message?: string }, success: string) => setNotice(result.ok ? success : result.message ?? "The delivery update was not accepted.");',
'  const run = async(result: { ok: boolean; message?: string }, success: string) => {if(!result.ok){setNotice(result.message??"The delivery update was not accepted.");return;}setNotice("Saving delivery change to Momentum cloud…");const checks=await Promise.all([momentumStorage.flushAndConfirm(DELIVERY_STORAGE_KEY),momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY),momentumStorage.flushAndConfirm(COMMERCIAL_KEY)]);const failed=checks.find((item)=>!item.ok);setNotice(failed?`Change is still on this device but Momentum cloud has NOT confirmed every record. Do not repeat the action. ${failed.message??"Check the sync status."}`:success);};')
replace_once("components/pages/deliveries.tsx",
'    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;',
'    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;\n    const placedBy = data.users.find((user) => user.id === order.ownerId);')
replace_once("components/pages/deliveries.tsx",
'        <div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>',
'        <div><span>Placed by</span><strong>{placedBy?.name ?? order.ownerId}</strong><small>Order creator</small></div>\n        <div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>')
replace_once("components/pages/deliveries.tsx",
'  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;',
'  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;\n  const detailPlacedBy = detailOrder ? data.users.find((user) => user.id === detailOrder.ownerId) : undefined;')
replace_once("components/pages/deliveries.tsx",
'      <Section title="Delivery queue" description="Each card shows the essentials. Use View details for the complete order, contacts, requests, payment record and delivery history.">',
'      <InvoicePrintCenter allowedOrderIds={visible.map((order)=>order.id)} title={isDriver?"Delivery invoices":"Delivery-run invoices"} description="Print one invoice or a complete delivery batch directly from the delivery workspace."/>\n\n      <Section title="Delivery queue" description="Each card shows the essentials. Use View details for the complete order, contacts, requests, payment record and delivery history.">')
replace_once("components/pages/deliveries.tsx",
'<div><span>Status</span><strong>{detailStatus}</strong><small>Order {detailOrder.status}</small></div>\n          <div><span>Cases</span>',
'<div><span>Status</span><strong>{detailStatus}</strong><small>Order {detailOrder.status}</small></div>\n          <div><span>Placed by</span><strong>{detailPlacedBy?.name??detailOrder.ownerId}</strong><small>Order creator</small></div>\n          <div><span>Cases</span>')

# Drivers need the authoritative invoice balance/payment context for the orders they deliver.
# This is read-only; commerce write authority remains Administrator-only.
replace_once("lib/firestore-domains.ts",
'{key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},',
'{key:"momentum-commerce-v1",id:"commerce",read:["Administrator","Sales Manager","Sales Representative","Operations","Delivery Driver"],write:ADMIN,fields:{invoices:{},payments:{},allocations:{},credits:{},refunds:{},notes:{}}},')

# Make the already-validated production consistency suite part of every normal test run.
replace_once("package.json",
' tests/invoice-delivery-ui.test.ts\",',
' tests/invoice-delivery-ui.test.ts tests/production-record-consistency.test.ts\",')

# Add regression coverage for the newly requested surfaces and stale approval protection.
replace_once("tests/production-record-consistency.test.ts",
'''test("Administrator approval UI identifies the submitting rep before decision",()=>{\n  const ui=readFileSync("components/pages/work-v2.tsx","utf8");\n  assert.match(ui,/Sales rep/);\n  assert.match(ui,/Submitted by/);\n  assert.match(ui,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n});''',
'''test("Administrator approval UI identifies the submitting rep before decision",()=>{\n  const ui=readFileSync("components/pages/work-v2.tsx","utf8");\n  assert.match(ui,/Sales rep/);\n  assert.match(ui,/Submitted by/);\n  assert.match(ui,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);\n  assert.match(ui,/orderApproval\\(approval.type\\).*Awaiting approval/);\n});\n\ntest("stale Pending or Returned approval cannot move an approved order backward",()=>{\n  const approved=order("Approved");\n  assert.equal(reconcileOrders([approved],[],[pending])[0].status,"Approved");\n  const returned={...pending,status:"Returned" as const,decidedBy:admin.id,decidedAt:"2026-10-01T16:05:00.000Z",returnReason:"stale"};\n  assert.equal(reconcileOrders([approved],[],[returned])[0].status,"Approved");\n});\n\ntest("every operational order surface identifies the creator and Delivery can print invoices",()=>{\n  const orders=readFileSync("components/pages/orders-v3.tsx","utf8");\n  const work=readFileSync("components/pages/work-v2.tsx","utf8");\n  const delivery=readFileSync("components/pages/deliveries.tsx","utf8");\n  const accounts=readFileSync("components/pages/accounts.tsx","utf8");\n  const invoices=readFileSync("components/finance/invoice-print-center.tsx","utf8");\n  assert.match(orders,/Placed by/);\n  assert.match(work,/Submitted by/);\n  assert.match(delivery,/Placed by/);\n  assert.match(accounts,/Placed by/);\n  assert.match(invoices,/Placed by/);\n  assert.match(delivery,/InvoicePrintCenter/);\n  assert.match(delivery,/flushAndConfirm\\(DELIVERY_STORAGE_KEY\\)/);\n});\n\ntest("Delivery Driver invoice access is read-only in the persistence domain",()=>{\n  const domains=readFileSync("lib/firestore-domains.ts","utf8");\n  assert.match(domains,/momentum-commerce-v1[\\s\\S]*Delivery Driver/);\n  assert.match(domains,/momentum-commerce-v1[\\s\\S]*write:ADMIN/);\n});''')

print("Final production integrity patch applied.")
