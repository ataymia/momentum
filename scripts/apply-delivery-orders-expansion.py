from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if new in text:
        print(f"already patched {path}")
        return
    if old not in text:
        raise SystemExit(f"PATCH FAILED in {path}: expected text not found\n{old[:500]}")
    p.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)
    print(f"wrote {path}")


# ---------------------------------------------------------------------------
# Order lifecycle: terminal cancellation with immutable evidence.
# ---------------------------------------------------------------------------
replace_once(
    "lib/types.ts",
    '''  | "Out for delivery"\n  | "Delivered"\n  | "Paid";''',
    '''  | "Out for delivery"\n  | "Delivered"\n  | "Paid"\n  | "Cancelled";''',
)
replace_once(
    "lib/types.ts",
    '''  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n};''',
    '''  /** Authoritative SKU breakdown. Legacy single-SKU orders may omit this and are treated as one line. */\n  lines?: OrderLine[];\n  /** Terminal cancellation evidence. Cancelled orders are retained, never deleted. */\n  cancelledAt?: string;\n  cancelledBy?: string;\n  cancellationReason?: string;\n};''',
)
replace_once(
    "lib/workspace-normalization.ts",
    'const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid"]);',
    'const orderStatuses = new Set(["Draft", "Awaiting approval", "Approved", "Allocated", "Out for delivery", "Delivered", "Paid", "Cancelled"]);',
)
replace_once(
    "lib/workspace-normalization.ts",
    '''    if (!optionalValidDate(value.paidAt) || !optionalValidDate(value.firstSettledAt) || !optionalFinite(value.inventoryAvailableAtOrder)) return [];''',
    '''    if (!optionalValidDate(value.paidAt) || !optionalValidDate(value.firstSettledAt) || !optionalFinite(value.inventoryAvailableAtOrder) || !optionalValidInstant(value.cancelledAt)) return [];\n    if (status === "Cancelled" && (!optionalText(value.cancelledBy) || !optionalText(value.cancellationReason) || !optionalText(value.cancelledAt))) return [];''',
)
replace_once(
    "lib/workspace-normalization.ts",
    '''lowStockApprovalRequired: typeof value.lowStockApprovalRequired === "boolean" ? value.lowStockApprovalRequired : undefined, lines }];''',
    '''lowStockApprovalRequired: typeof value.lowStockApprovalRequired === "boolean" ? value.lowStockApprovalRequired : undefined, lines, cancelledAt: optionalText(value.cancelledAt), cancelledBy: optionalText(value.cancelledBy), cancellationReason: optionalText(value.cancellationReason) }];''',
)

replace_once(
    "lib/order-approval-engine.ts",
    '''  Delivered: 5,\n  Paid: 6,\n};''',
    '''  Delivered: 5,\n  Paid: 6,\n  Cancelled: 7,\n};''',
)
replace_once(
    "lib/order-approval-engine.ts",
    '''export function reconcileOrderWithApproval(order: Order, approval?: Approval): Order {\n  if (!approval) return order;''',
    '''export function reconcileOrderWithApproval(order: Order, approval?: Approval): Order {\n  // Cancellation is terminal for an undelivered order. A stale approval must never resurrect it.\n  if (order.status === "Cancelled") return order;\n  if (!approval) return order;''',
)
replace_once(
    "lib/order-approval-engine.ts",
    '''    const advanced = fulfillmentRank[order.status] >= fulfillmentRank[existing.status] ? order : existing;\n    const other = advanced === order ? existing : order;\n    byId.set(order.id, { ...other, ...advanced });''',
    '''    // Cancellation and fulfillment are separate terminal branches. Delivery/payment evidence wins over\n    // a stale cancellation replica; otherwise cancellation wins over any pre-delivery replica.\n    if (order.status === "Cancelled" || existing.status === "Cancelled") {\n      const delivered = [order, existing].find((candidate) => ["Delivered", "Paid"].includes(candidate.status));\n      const cancelled = order.status === "Cancelled" ? order : existing;\n      const other = cancelled === order ? existing : order;\n      byId.set(order.id, delivered ?? { ...other, ...cancelled });\n      continue;\n    }\n    const advanced = fulfillmentRank[order.status] >= fulfillmentRank[existing.status] ? order : existing;\n    const other = advanced === order ? existing : order;\n    byId.set(order.id, { ...other, ...advanced });''',
)

# Cancelled orders are not sales activity / open customer work.
replace_once(
    "lib/sales-field-engine.ts",
    '''  const orders=data.orders.filter((order)=>(order.creditedRepId===userId||(!order.creditedRepId&&order.ownerId===userId))&&inWeek(order.placedAt));''',
    '''  const orders=data.orders.filter((order)=>order.status!=="Cancelled"&&(order.creditedRepId===userId||(!order.creditedRepId&&order.ownerId===userId))&&inWeek(order.placedAt));''',
)
replace_once(
    "components/pages/dashboard.tsx",
    '''  const open = scope.orders.filter(order => !["Delivered","Paid"].includes(order.status));''',
    '''  const open = scope.orders.filter(order => !["Delivered","Paid","Cancelled"].includes(order.status));''',
)

# ---------------------------------------------------------------------------
# Firestore delivery visibility. The original delivery patch existed in a
# script but the commercial overrides were never present on main. That made
# new commercial orders + current lots invisible to Delivery Drivers.
# ---------------------------------------------------------------------------
replace_once(
    "lib/firestore-domains.ts",
    '''  {key:"momentum-commercial-controls-v1",id:"commercial",read:OPERATIONAL,write:OPERATIONAL,fields:{orders:{},appointments:{},approvals:{},activities:{},inventoryLots:{},territories:{}}},''',
    '''  {key:"momentum-commercial-controls-v1",id:"commercial",read:OPERATIONAL,write:OPERATIONAL,fields:{orders:{read:[...OPERATIONAL,"Delivery Driver"],write:[...OPERATIONAL,"Delivery Driver"]},appointments:{},approvals:{},activities:{},inventoryLots:{read:[...OPERATIONAL,"Delivery Driver"]},territories:{}}},''',
)

# ---------------------------------------------------------------------------
# Workspace order cancellation. Only Administrators may cancel the commercial
# order itself. We intentionally block cancellation after inventory custody has
# begun; loaded/delivered goods use delivery exceptions/returns instead.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context.tsx",
    '''  reconcileOrderPayment: (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => void;''',
    '''  reconcileOrderPayment: (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => void;\n  cancelOrder: (id: string, reason: string) => { ok: boolean; message?: string };''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''function inferredTier(data: WorkspaceData, accountId: string): PricingTier | undefined {\n  const price = data.orders.filter((order) => order.accountId === accountId && Number.isFinite(order.pricePerCase) && order.pricePerCase > 0).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0]?.pricePerCase;''',
    '''function inferredTier(data: WorkspaceData, accountId: string): PricingTier | undefined {\n  const price = data.orders.filter((order) => order.accountId === accountId && order.status !== "Cancelled" && Number.isFinite(order.pricePerCase) && order.pricePerCase > 0).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0]?.pricePerCase;''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''  const reconcileOrderPayment = (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {''',
    '''  const cancelOrder = (id: string, reason: string) => {\n    if (!currentUser || currentUser.role !== "Administrator") return { ok: false, message: "Administrator access is required to cancel an order." };\n    const cleanReason = reason.trim();\n    if (cleanReason.length < 3) return { ok: false, message: "Enter a cancellation reason." };\n    const order = commercial.orders.find((item) => item.id === id);\n    if (!order) return { ok: false, message: "Only shared commercial orders can be cancelled from this screen." };\n    if (["Allocated", "Out for delivery", "Delivered", "Paid"].includes(order.status)) return { ok: false, message: "Fulfillment has already started. Use the delivery/return exception workflow instead of cancelling this order." };\n    if (order.status === "Cancelled") return { ok: true };\n    const stamp = now();\n    setCommercial((state) => ({\n      ...state,\n      orders: state.orders.map((item) => item.id === id ? { ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id, cancellationReason: cleanReason } : item),\n      approvals: state.approvals.map((item) => item.recordId === id && ["Order", "Low stock sale"].includes(item.type) && item.status === "Pending" ? { ...item, status: "Returned", decidedBy: currentUser.id, decidedAt: stamp, returnReason: `Order cancelled: ${cleanReason}` } : item),\n      accountPatches: { ...state.accountPatches, [order.accountId]: { ...(state.accountPatches[order.accountId] ?? {}), lastActivity: `Order ${order.number} cancelled` } },\n      activities: [{ id: uid("act-order-cancel"), accountId: order.accountId, type: "order", title: "Order cancelled", detail: `${order.number} cancelled by ${currentUser.name}: ${cleanReason}`, at: stamp, userId: currentUser.id }, ...state.activities],\n    }));\n    return { ok: true };\n  };\n\n  const reconcileOrderPayment = (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {''',
)
replace_once(
    "lib/workspace-context.tsx",
    '''decideApproval, setOrderStatus, reconcileOrderPayment, updateAccountCommercial,''',
    '''decideApproval, setOrderStatus, reconcileOrderPayment, cancelOrder, updateAccountCommercial,''',
)

# ---------------------------------------------------------------------------
# Inventory: allow a claimed driver task to prepare an Approved order by
# reserving FEFO sellable lots for each SKU in one atomic local ledger update.
# The delivery context is the authorization gate tying this to the claimed task.
# ---------------------------------------------------------------------------
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''import { arizonaDateKey } from "./date-time";''',
    '''import { arizonaDateKey } from "./date-time";\nimport { orderLinesFor, productsEquivalent } from "./order-lines";''',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''InventoryCount, InventoryLedgerState, InventoryMovement, InventoryReservation, MovementType, activeReservedForOrder, createInventoryLedgerSeed, holdNodeId, movementCanPost, nodeLotBalance, normalizeInventoryLedger, orderCanAdvanceInventory, orderDeliveryQuantity, orderLotWarehouseNetOutbound, orderOutboundQuantity, reservationCanCreate, warehouseNodeId''',
    '''InventoryCount, InventoryLedgerState, InventoryMovement, InventoryReservation, MovementType, activeReservedForOrder, activeReservedForOrderProduct, createInventoryLedgerSeed, holdNodeId, movementCanPost, nodeLotBalance, normalizeInventoryLedger, orderCanAdvanceInventory, orderDeliveryQuantity, orderLotWarehouseNetOutbound, orderOutboundQuantity, reservationCanCreate, warehouseAvailable, warehouseNodeId''',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''advanceOrderFulfillment:(orderId:string,status:FulfillmentStatus)=>boolean;loadOrderForDelivery:(orderId:string,driverId:string)=>boolean;''',
    '''advanceOrderFulfillment:(orderId:string,status:FulfillmentStatus)=>boolean;prepareOrderForDelivery:(orderId:string)=>boolean;loadOrderForDelivery:(orderId:string,driverId:string)=>boolean;''',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''  const deliveryActor=(driverId:string)=>Boolean(currentUser&&((currentUser.role==="Delivery Driver"&&currentUser.id===driverId)||["Administrator","Operations","Warehouse"].includes(currentUser.role)));''',
    '''  const deliveryActor=(driverId:string)=>Boolean(currentUser&&((currentUser.role==="Delivery Driver"&&currentUser.id===driverId)||["Administrator","Operations","Warehouse"].includes(currentUser.role)));\n  const prepareOrderForDelivery=(orderId:string)=>{\n    if(!currentUser||!["Delivery Driver","Administrator","Operations","Warehouse"].includes(currentUser.role)||locked())return false;\n    const order=data.orders.find((item)=>item.id===orderId);if(!order||order.status!=="Approved")return false;\n    let working=ledger;const additions:InventoryReservation[]=[];\n    const lots=[...data.inventory].filter((lot)=>lot.status!=="Quality hold").sort((a,b)=>a.bestBy.localeCompare(b.bestBy)||a.receivedAt.localeCompare(b.receivedAt));\n    for(const line of orderLinesFor(order)){\n      let needed=line.cases-activeReservedForOrderProduct(working,data,orderId,line.product);\n      if(needed<=0)continue;\n      for(const lot of lots.filter((candidate)=>productsEquivalent(candidate.product,line.product))){\n        const available=warehouseAvailable(working,lot.id);if(available<=0)continue;\n        const quantity=Math.min(needed,available);\n        if(quantity<=0)continue;\n        const reservation:InventoryReservation={id:uid("reservation-pack"),orderId,lotId:lot.id,quantity,status:"Active",createdAt:now(),createdBy:currentUser.id};\n        additions.push(reservation);working={...working,reservations:[reservation,...working.reservations]};needed-=quantity;if(needed<=0)break;\n      }\n      if(needed>0)return false;\n    }\n    if(additions.length)setLedger((state)=>({...state,reservations:[...additions,...state.reservations]}));\n    setOrderStatus(orderId,"Allocated");\n    return true;\n  };''',
)
replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''advanceOrderFulfillment,loadOrderForDelivery,startOrderDelivery,completeOrderDelivery''',
    '''advanceOrderFulfillment,prepareOrderForDelivery,loadOrderForDelivery,startOrderDelivery,completeOrderDelivery''',
)

# ---------------------------------------------------------------------------
# Delivery context: prepare/pack step, driver release-before-load, and task
# persistence remain separate from order cancellation.
# ---------------------------------------------------------------------------
replace_once(
    "lib/delivery-context.tsx",
    '''  markLoaded: (orderId: string) => MutationResult;''',
    '''  prepareDelivery: (orderId: string) => MutationResult;\n  markLoaded: (orderId: string) => MutationResult;''',
)
replace_once(
    "lib/delivery-context.tsx",
    '''  const markLoaded = (orderId: string): MutationResult => {''',
    '''  const prepareDelivery = (orderId: string): MutationResult => {\n    const task = taskForActor(orderId);\n    if (!task || task.status !== "Accepted") return { ok: false, message: "Claim or assign the delivery before packing it." };\n    const order = data.orders.find((item) => item.id === orderId);\n    if (!order) return { ok: false, message: "Order not found." };\n    if (order.status === "Allocated") return { ok: true };\n    if (order.status !== "Approved") return { ok: false, message: "Only an approved order can be packed." };\n    if (!inventory.prepareOrderForDelivery(orderId)) return { ok: false, message: "The full SKU mix is not available in sellable warehouse inventory. No partial packing was saved." };\n    return { ok: true };\n  };\n\n  const markLoaded = (orderId: string): MutationResult => {''',
)
replace_once(
    "lib/delivery-context.tsx",
    '''  const cancelDelivery = (orderId: string, reason: string): MutationResult => {\n    if (!canManage || !currentUser || reason.trim().length < 3) return { ok: false, message: "Management must enter a reason to cancel or reassign a delivery." };\n    const task = taskForOrder(orderId);\n    if (!task || ["In transit", "Delivered"].includes(task.status)) return { ok: false, message: "An in-transit or delivered task cannot be cancelled here." };''',
    '''  const cancelDelivery = (orderId: string, reason: string): MutationResult => {\n    if (!currentUser || reason.trim().length < 3) return { ok: false, message: "Enter a reason to release or cancel the delivery assignment." };\n    const task = taskForOrder(orderId);\n    const ownAccepted = Boolean(isDriver && task?.driverId === currentUser.id && task.status === "Accepted");\n    if (!canManage && !ownAccepted) return { ok: false, message: "Only management or the driver holding an unstarted assignment can release it." };\n    if (!task || ["Loaded", "In transit", "Delivered"].includes(task.status)) return { ok: false, message: "A loaded, in-transit, or delivered task cannot be released here." };''',
)
replace_once(
    "lib/delivery-context.tsx",
    '''state, taskForOrder, claimDelivery, assignDelivery, cancelDelivery, markLoaded, startDelivery''',
    '''state, taskForOrder, claimDelivery, assignDelivery, cancelDelivery, prepareDelivery, markLoaded, startDelivery''',
)

# ---------------------------------------------------------------------------
# Orders UI: row click opens a complete order view, and Administrators can
# cancel pre-fulfillment orders with required free-text evidence.
# ---------------------------------------------------------------------------
write("components/pages/orders-v3.tsx", r'''"use client";
import { AlertCircle, Box, Building2, CheckCircle2, ChevronRight, CircleDollarSign, Copy, FileText, Mail, MapPin, PackageSearch, Phone, Plus, Store, Trash2, Truck, UserRound, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";
import { activeReservedForOrder, orderCanAdvanceInventory, orderDeliveryQuantity, orderOutboundQuantity, productInventoryStatus } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { orderLinesFor } from "../../lib/order-lines";
import { GOLDEN_EAGLE_SKUS } from "../../lib/product-catalog";
import { useFirebaseSessionOptional } from "../../lib/firebase-session-context";
import { momentumStorage } from "../../lib/persistence";
import { evaluatePartnerPricing } from "../../lib/pricing-engine";
import type { OrderStatus } from "../../lib/types";
import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatMoney } from "../ui";
const lifecycle:OrderStatus[]=["Draft","Awaiting approval","Approved","Allocated","Out for delivery","Delivered","Paid"];
const fulfillmentNext:Partial<Record<OrderStatus,"Allocated"|"Out for delivery"|"Delivered">>={Approved:"Allocated",Allocated:"Out for delivery","Out for delivery":"Delivered"};
const tone=(status:OrderStatus)=>["Paid","Delivered"].includes(status)?"success" as const:status==="Cancelled"?"danger" as const:status==="Awaiting approval"?"warning" as const:status==="Draft"?"neutral" as const:"info" as const;
type DraftLine={id:string;product:string;cases:number};const skuOptions=GOLDEN_EAGLE_SKUS.filter((sku)=>sku.active);
const newLine=(product=skuOptions[0]?.description??"Golden Eagle",cases=10):DraftLine=>({id:`draft-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,product,cases});
const addressFor=(account:{streetAddress?:string;city?:string;state?:string;postalCode?:string;location:string})=>[account.streetAddress,account.city||account.location,account.state,account.postalCode].filter(Boolean).join(", ");
export function OrdersPage(){
 const{data,scope,currentUser,createOrder,cancelOrder,navigate}=useWorkspace();const{ledger,advanceOrderFulfillment}=useInventoryLedger();const firebase=useFirebaseSessionOptional();
 const focusId=typeof window!=="undefined"?sessionStorage.getItem("momentum-focus-record"):null;const focused=scope.orders.find((o)=>o.id===focusId);const focusedAccount=scope.accounts.find((a)=>a.id===focusId);
 const[query,setQuery]=useState("");const[selectedId,setSelectedId]=useState(focused?.id??scope.orders[0]?.id??"");const[open,setOpen]=useState(false);const[detailOpen,setDetailOpen]=useState(false);const[error,setError]=useState("");const[submitting,setSubmitting]=useState(false);
 const[accountId,setAccountId]=useState(focusedAccount?.id??scope.accounts[0]?.id??"");const[lines,setLines]=useState<DraftLine[]>([newLine()]);const customerMode=isCustomer(currentUser);const canFulfill=canAdvanceFulfillment(currentUser);
 useEffect(()=>{if(focusId)sessionStorage.removeItem("momentum-focus-record")},[focusId]);
 const orders=useMemo(()=>{const q=query.trim().toLowerCase();return scope.orders.filter((o)=>{const a=scope.accounts.find((x)=>x.id===o.accountId);return!q||`${o.number} ${a?.name??""} ${orderLinesFor(o).map((l)=>l.product).join(" ")} ${o.status}`.toLowerCase().includes(q)})},[query,scope.orders,scope.accounts]);
 const selected=scope.orders.find((o)=>o.id===selectedId)??orders[0];const selectedLines=selected?orderLinesFor(selected):[];const selectedApproval=selected?scope.approvals.find((approval)=>approval.recordId===selected.id&&["Order","Low stock sale"].includes(approval.type)):undefined;const currentIndex=selected?lifecycle.indexOf(selected.status):-1;const nextStatus=selected?fulfillmentNext[selected.status]??null:null;
 const selectedAccount=selected?scope.accounts.find((a)=>a.id===selected.accountId):undefined;const selectedCustomer=selectedAccount?.customerId?(data.customers??[]).find((c)=>c.id===selectedAccount.customerId):undefined;const placedBy=selected?data.users.find((u)=>u.id===selected.ownerId):undefined;const cancelledBy=selected?.cancelledBy?data.users.find((u)=>u.id===selected.cancelledBy):undefined;
 const reserved=selected?activeReservedForOrder(ledger,selected.id):0;const outbound=selected?orderOutboundQuantity(ledger,selected.id):0;const delivered=selected?orderDeliveryQuantity(ledger,selected.id):0;const inventoryReady=Boolean(selected&&nextStatus&&orderCanAdvanceInventory(ledger,selected,nextStatus));
 const pricing=accountId?evaluatePartnerPricing(data,accountId):null;const price=pricing?.currentPricePerCase;const requestCases=lines.reduce((s,l)=>s+(Number.isInteger(l.cases)&&l.cases>0?l.cases:0),0);
 const openDraft=(order?:typeof selected)=>{setAccountId(order?.accountId??focusedAccount?.id??scope.accounts[0]?.id??"");setLines(order?orderLinesFor(order).map((l)=>newLine(l.product,l.cases)):[newLine()]);setError("");setOpen(true)};
 const submit=async(e:FormEvent)=>{e.preventDefault();if(submitting)return;if(firebase&&currentUser?.role!=="Customer"&&firebase.access?.accountState!=="Active"){setError(`Your Momentum access is ${firebase.access?.accountState??"not active"}. The order was not submitted.`);return}if(!price){setError("Current account pricing must be configured before this order can be submitted.");return}if(!lines.length||lines.some((l)=>!Number.isInteger(l.cases)||l.cases<1)){setError("Every order line needs a whole-number case quantity of at least 1.");return}setSubmitting(true);setError("");const id=createOrder({accountId,lines:lines.map((l)=>({...l,inventoryAvailableAtOrder:productInventoryStatus(ledger,data,l.product).available}))});if(!id){setSubmitting(false);setError("Momentum rejected this request. Review the account, pricing, quantities, and permissions. Nothing was silently submitted.");return}const confirmed=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY);setSubmitting(false);setSelectedId(id);if(!confirmed.ok){setError(`Order ${id} is safely queued on this device but Momentum cloud has NOT confirmed it. Do not submit it again. ${confirmed.message??"Use the sync indicator and retry after access/connectivity is corrected."}`);return}setOpen(false);setError("")};
 const advance=()=>{if(!selected||!nextStatus)return;if(!advanceOrderFulfillment(selected.id,nextStatus)){setError("Inventory evidence is incomplete for the next fulfillment step. Open Inventory to finish reservations or custody records.");return}setError("")};
 const cancelSelected=()=>{if(!selected)return;const reason=window.prompt(`Why is ${selected.number} being cancelled? This reason will remain in order history.`)?.trim()??"";if(!reason)return;const result=cancelOrder(selected.id,reason);setError(result.ok?"":result.message??"Order cancellation failed.");if(result.ok)setDetailOpen(false)};
 return <div className="page page--orders"><PageHeader title={customerMode?"My orders":"Orders"} actions={canCreateOrder(currentUser)?<Button variant="gold" icon={<Plus size={17}/>} onClick={()=>openDraft()}>{customerMode?"Place order":"Create order"}</Button>:undefined}/>
 <div className="order-stats"><div><span><FileText size={18}/></span><div><small>Orders in scope</small><strong>{scope.orders.length}</strong></div></div><div><span><CircleDollarSign size={18}/></span><div><small>Open amount</small><strong>{formatMoney(scope.orders.filter(o=>o.paymentStatus!=="Paid"&&o.status!=="Cancelled").reduce((s,o)=>s+o.amount,0))}</strong></div></div><div><span><Truck size={18}/></span><div><small>Delivered cases</small><strong>{scope.orders.filter(o=>["Delivered","Paid"].includes(o.status)).reduce((s,o)=>s+o.cases,0)}</strong></div></div><div><span><PackageSearch size={18}/></span><div><small>Canonical SKUs</small><strong>{skuOptions.length}</strong></div></div></div>
 <div className="orders-layout"><Section className="orders-list" title="Order register" description="Click any order to open the complete customer, delivery, product, payment and history view."><label className="table-search order-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search order, account, SKU, or status…"/></label><div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span/></div><div className="order-table-body">{orders.map(o=>{const a=scope.accounts.find(x=>x.id===o.accountId);return <button className={`order-table ${selected?.id===o.id?"is-selected":""}`} key={o.id} onClick={()=>{setSelectedId(o.id);setDetailOpen(true)}}><span><strong>{o.number}</strong><small>{orderLinesFor(o).length===1?orderLinesFor(o)[0].product:`${orderLinesFor(o).length} SKUs`}</small></span><span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span><span>{formatMoney(o.amount)}</span><span><StatusPill tone={tone(o.status)}>{o.status}</StatusPill></span><ChevronRight size={16}/></button>})}</div></Section>
 {selected&&<Section className="order-detail" title={selected.number} action={<StatusPill tone={tone(selected.status)}>{selected.status}</StatusPill>}><div className="order-detail__body"><div className="order-price-card"><div><span>Order total</span><strong>{formatMoney(selected.amount)}</strong><small>{selected.cases} total cases · {selectedLines.length} SKU{selectedLines.length===1?"":"s"}</small></div><span><FileText size={24}/></span></div><div className="order-detail-actions"><Button size="sm" onClick={()=>setDetailOpen(true)}>View full order</Button>{canCreateOrder(currentUser)&&selected.status!=="Cancelled"&&<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>openDraft(selected)}>Copy / reorder</Button>}</div><div className="company-request-list">{selectedLines.map(l=><article key={l.id}><span><Box size={16}/></span><div><small>Order line</small><strong>{l.cases} cases · {l.product}</strong><p>{formatMoney(l.pricePerCase)} / case · {formatMoney(l.amount)}</p></div></article>)}</div>{selected.status!=="Cancelled"&&<div className="order-lifecycle">{lifecycle.map((s,i)=><div className={i<=currentIndex?"is-complete":""} key={s}><span>{i<currentIndex?<CheckCircle2 size={14}/>:i+1}</span><small>{s}</small></div>)}</div>}<dl className="order-facts"><div><dt>Reserved</dt><dd>{reserved}/{selected.cases}</dd></div><div><dt>Outbound custody</dt><dd>{outbound}/{selected.cases}</dd></div><div><dt>Delivered</dt><dd>{delivered}/{selected.cases}</dd></div><div><dt>Payment</dt><dd>{selected.paymentStatus}</dd></div></dl>
 {selected.status==="Cancelled"?<div className="order-approval-callout"><XCircle size={20}/><div><strong>Order cancelled</strong><p>{selected.cancellationReason}</p></div></div>:selected.status==="Awaiting approval"?<div className="order-approval-callout"><Store size={20}/><div><strong>One Administrator approval required</strong><p>Once either Administrator approves this order, that decision is authoritative for the shared order record.</p></div>{currentUser?.role==="Administrator"&&<Button size="sm" onClick={()=>navigate("work")}>Review</Button>}</div>:selected.status==="Draft"?<div className="order-approval-callout"><AlertCircle size={20}/><div><strong>Returned for edits</strong><p>{selectedApproval?.returnReason?`Correction requested: ${selectedApproval.returnReason}`:"The original record remains in history. Copy it to submit a corrected replacement."}</p></div></div>:nextStatus&&canFulfill&&inventoryReady?<Button size="lg" onClick={advance}>Move to {nextStatus.toLowerCase()}</Button>:nextStatus&&canFulfill?<div className="order-approval-callout"><PackageSearch size={20}/><div><strong>Inventory evidence required</strong><p>Reserve the exact SKU mix and complete custody evidence before moving forward.</p></div><Button size="sm" variant="secondary" onClick={()=>navigate("inventory")}>Open inventory</Button></div>:null}{error&&<p className="form-error" role="alert">{error}</p>}</div></Section>}</div>
 {selected&&<Modal open={detailOpen} title={`${selected.number} · full order`} description="Customer, delivery, product, payment and order-control details." onClose={()=>setDetailOpen(false)} wide footer={<><Button variant="ghost" onClick={()=>setDetailOpen(false)}>Close</Button>{currentUser?.role==="Administrator"&&["Draft","Awaiting approval","Approved"].includes(selected.status)&&<Button variant="secondary" icon={<XCircle size={15}/>} onClick={cancelSelected}>Cancel order</Button>}</>}><div style={{display:"grid",gap:18}}><div className="company-rule-facts"><div><span>Status</span><strong>{selected.status}</strong><small>{selected.paymentStatus}</small></div><div><span>Total</span><strong>{formatMoney(selected.amount)}</strong><small>{selected.cases} cases</small></div><div><span>Placed</span><strong>{selected.placedAt}</strong><small>{placedBy?.name??selected.ownerId}</small></div><div><span>Terms</span><strong>{selectedCustomer?.paymentTerms??"COD"}</strong><small>{selected.priceBasis}</small></div></div>
 <Section title="Company & delivery location"><div className="company-request-list"><article><span><Building2 size={17}/></span><div><small>Company</small><strong>{selectedCustomer?.name??selectedAccount?.name??"Unknown customer"}</strong><p>{selectedAccount?.locationName??selectedAccount?.name}</p></div></article><article><span><MapPin size={17}/></span><div><small>Delivery address</small><strong>{selectedAccount?addressFor(selectedAccount):"Address unavailable"}</strong><p>{selectedAccount?.notes||"No location note."}</p></div></article><article><span><UserRound size={17}/></span><div><small>Primary contact</small><strong>{selectedAccount?.contactName||"Not recorded"}{selectedAccount?.contactRole?` · ${selectedAccount.contactRole}`:""}</strong><p>{selectedAccount?.phone||"No phone"}{selectedAccount?.email?` · ${selectedAccount.email}`:""}</p></div></article>{selectedCustomer&&(selectedCustomer.accountsPayableContactName||selectedCustomer.billingContactName)&&<article><span><Mail size={17}/></span><div><small>Billing / A/P</small><strong>{selectedCustomer.accountsPayableContactName??selectedCustomer.billingContactName}</strong><p>{selectedCustomer.accountsPayablePhone??selectedCustomer.billingPhone??""}{(selectedCustomer.accountsPayableEmail??selectedCustomer.billingEmail)?` · ${selectedCustomer.accountsPayableEmail??selectedCustomer.billingEmail}`:""}</p></div></article>}</div></Section>
 <Section title="Products"><div className="company-request-list">{selectedLines.map(l=><article key={l.id}><span><Box size={16}/></span><div><strong>{l.product}</strong><p>{l.cases} cases · {formatMoney(l.pricePerCase)} / case · {formatMoney(l.amount)}</p></div></article>)}</div></Section>
 {selected.status==="Cancelled"&&<Section title="Cancellation"><div className="form-callout"><XCircle size={17}/><p><strong>{selected.cancellationReason}</strong><br/>{selected.cancelledAt?new Date(selected.cancelledAt).toLocaleString():""}{cancelledBy?` · ${cancelledBy.name}`:""}</p></div></Section>}</div></Modal>}
 <Modal open={open} title="Create order request" description="Add as many Golden Eagle SKUs as the customer needs. There is no 10-case maximum. One Administrator approval covers the complete order." onClose={()=>setOpen(false)} wide footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="order-v3-form" disabled={submitting}>{submitting?"Confirming with cloud…":"Submit order"}</Button></>}><form id="order-v3-form" className="form-grid" onSubmit={submit}><Field label="Customer account" className="field--full"><select value={accountId} onChange={e=>setAccountId(e.target.value)}>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.locationName??a.location}</option>)}</select></Field>{lines.map((line,index)=><div className="field--full form-grid" key={line.id}><Field label={`Product ${index+1}`}><select value={line.product} onChange={e=>setLines(rows=>rows.map(r=>r.id===line.id?{...r,product:e.target.value}:r))}>{skuOptions.map(s=><option value={s.description} key={s.id}>{s.description}</option>)}</select></Field><Field label="Cases"><input type="number" min="1" step="1" required value={line.cases} onChange={e=>setLines(rows=>rows.map(r=>r.id===line.id?{...r,cases:Number(e.target.value)}:r))}/></Field><div className="field--full"><small>{productInventoryStatus(ledger,data,line.product).available} currently available sellable cases</small>{lines.length>1&&<Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14}/>} onClick={()=>setLines(rows=>rows.filter(r=>r.id!==line.id))}>Remove line</Button>}</div></div>)}<div className="field--full"><Button type="button" variant="secondary" icon={<Plus size={15}/>} onClick={()=>setLines(rows=>[...rows,newLine()])}>Add another product</Button></div><div className="order-preview"><Box size={20}/><div><span>Request total</span><strong>{requestCases} cases · {price?formatMoney(requestCases*price):"Pricing setup required"}</strong></div></div>{error&&<p className="form-error field--full" role="alert">{error}</p>}</form></Modal></div>
}''')

# ---------------------------------------------------------------------------
# Delivery-driver command center. All unassigned approved orders are visible;
# drivers claim, pack/allocate, load, depart and deliver with a complete route
# card. Assignment release is allowed only before loading.
# ---------------------------------------------------------------------------
write("components/pages/deliveries.tsx", r'''"use client";
import { Box, CheckCircle2, Mail, MapPin, PackageCheck, PackageOpen, Phone, Route, Truck, UserCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { deliveryStatusForOrder, processedForDelivery } from "../../lib/delivery-engine";
import { useDelivery } from "../../lib/delivery-context";
import { orderLinesFor } from "../../lib/order-lines";
import { useSyncStatus } from "../../lib/persistence";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, PageHeader, Section, StatusPill, formatMoney } from "../ui";
const tone=(status:string)=>status==="Delivered"?"success" as const:status==="In transit"||status==="Loaded"?"info" as const:status.includes("ready")||status==="Accepted"?"warning" as const:"neutral" as const;
const fullAddress=(account:{streetAddress?:string;city?:string;state?:string;postalCode?:string;location:string})=>[account.streetAddress,account.city||account.location,account.state,account.postalCode].filter(Boolean).join(", ");
export function DeliveriesPage(){
 const{data,currentUser,navigate}=useWorkspace();const{state,taskForOrder,claimDelivery,assignDelivery,cancelDelivery,prepareDelivery,markLoaded,startDelivery,markDelivered,addDeliveryNote}=useDelivery();const sync=useSyncStatus();const[driverByOrder,setDriverByOrder]=useState<Record<string,string>>({});const[notice,setNotice]=useState("");
 const isDriver=currentUser?.role==="Delivery Driver";const canManage=Boolean(currentUser&&["Administrator","Operations"].includes(currentUser.role));const drivers=data.users.filter((u)=>u.role==="Delivery Driver");
 const eligible=useMemo(()=>data.orders.filter(processedForDelivery).sort((a,b)=>b.placedAt.localeCompare(a.placedAt)),[data.orders]);
 const visible=eligible.filter((order)=>{const task=taskForOrder(order.id);if(!isDriver)return true;return!task||task.driverId===currentUser?.id});
 const ready=visible.filter((order)=>!taskForOrder(order.id)||taskForOrder(order.id)?.status==="Accepted");const active=visible.filter((order)=>["Loaded","In transit"].includes(taskForOrder(order.id)?.status??""));const complete=visible.filter((order)=>taskForOrder(order.id)?.status==="Delivered");
 const run=(result:{ok:boolean;message?:string},success:string)=>setNotice(result.ok?success:result.message??"The delivery update was not accepted.");
 const syncText=sync.lastError?`Sync issue: ${sync.lastError}`:sync.pending||sync.flushing?`Saving ${sync.pending||1} change${sync.pending===1?"":"s"}…`:sync.mode==="firestore"?"Cloud synced":"Local demo";
 const card=(orderId:string)=>{const order=data.orders.find((i)=>i.id===orderId)!;const task=taskForOrder(order.id);const account=data.accounts.find((i)=>i.id===order.accountId);const customer=account?.customerId?(data.customers??[]).find((c)=>c.id===account.customerId):undefined;const driver=task?data.users.find((u)=>u.id===task.driverId):undefined;const status=deliveryStatusForOrder(state,order);const ownTask=Boolean(isDriver&&task?.driverId===currentUser?.id);const selectedDriver=driverByOrder[order.id]??drivers[0]?.id??"";const lines=orderLinesFor(order);
 return <article key={order.id} className="company-request-list__item" style={{display:"grid",gap:14}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}><div><small>{order.number}</small><strong style={{display:"block",fontSize:"1.08rem"}}>{account?.locationName??account?.name??"Unknown customer"}</strong><p style={{margin:"4px 0"}}><MapPin size={14} style={{verticalAlign:"-2px"}}/> {account?fullAddress(account):"Location unavailable"}</p>{account?.phone&&<p style={{margin:"4px 0"}}><Phone size={14} style={{verticalAlign:"-2px"}}/> {account.phone}</p>}</div><StatusPill tone={tone(status)}>{status}</StatusPill></div>
 <div className="company-rule-facts"><div><span>Cases</span><strong>{order.cases}</strong><small>{lines.length} SKU{lines.length===1?"":"s"}</small></div><div><span>Order total</span><strong>{formatMoney(order.amount)}</strong><small>{order.paymentStatus}</small></div><div><span>Driver</span><strong>{driver?.name??"Unassigned"}</strong><small>{task?"Claimed":"Available to claim"}</small></div><div><span>Terms</span><strong>{customer?.paymentTerms??"COD"}</strong><small>Order {order.status}</small></div></div>
 <details open={Boolean(ownTask||task?.status==="In transit")}><summary>Delivery details</summary><div style={{display:"grid",gap:10,marginTop:10}}><div className="company-request-list">{lines.map((line)=><article key={line.id}><span><Box size={15}/></span><div><strong>{line.product}</strong><p>{line.cases} cases · {formatMoney(line.amount)}</p></div></article>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}><div><small>Primary contact</small><p><UserRound size={14}/> {account?.contactName||"Not recorded"}{account?.contactRole?` · ${account.contactRole}`:""}</p><p>{account?.phone||"No phone"}{account?.email?` · ${account.email}`:""}</p></div>{customer&&(customer.billingContactName||customer.accountsPayableContactName)&&<div><small>Billing / A/P contact</small><p><Mail size={14}/> {customer.accountsPayableContactName??customer.billingContactName}</p><p>{customer.accountsPayablePhone??customer.billingPhone??""}</p></div>}<div><small>Delivery note / location note</small><p>{task?.note??account?.notes??"No delivery note recorded."}</p></div></div></div></details>
 {!task&&isDriver&&<Button size="sm" icon={<UserCheck size={15}/>} onClick={()=>run(claimDelivery(order.id),`${order.number} claimed. You can now pack it.`)}>Claim delivery</Button>}
 {!task&&canManage&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><select value={selectedDriver} onChange={(e)=>setDriverByOrder((c)=>({...c,[order.id]:e.target.value}))}>{drivers.map((d)=><option value={d.id} key={d.id}>{d.name}</option>)}</select><Button size="sm" disabled={!selectedDriver} onClick={()=>run(assignDelivery(order.id,selectedDriver),`${order.number} assigned.`)}>Assign driver</Button></div>}
 {task?.status==="Accepted"&&(ownTask||canManage)&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>{order.status==="Approved"&&<Button size="sm" icon={<PackageCheck size={15}/>} onClick={()=>run(prepareDelivery(order.id),`${order.number} packed and inventory reserved.`)}>Pack / reserve inventory</Button>}{order.status==="Allocated"&&<Button size="sm" icon={<PackageOpen size={15}/>} onClick={()=>run(markLoaded(order.id),`${order.number} loaded into driver custody.`)}>Mark loaded</Button>}<Button size="sm" variant="ghost" onClick={()=>{const reason=window.prompt("Why is this delivery assignment being released?")?.trim()??"";if(reason)run(cancelDelivery(order.id,reason),`${order.number} returned to the delivery queue.`)}}>{ownTask?"Release assignment":"Cancel assignment"}</Button></div>}
 {task?.status==="Loaded"&&(ownTask||canManage)&&<Button size="sm" icon={<Truck size={15}/>} onClick={()=>run(startDelivery(order.id),`${order.number} is now in transit.`)}>Start delivery</Button>}
 {task?.status==="In transit"&&(ownTask||canManage)&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button size="sm" icon={<CheckCircle2 size={15}/>} onClick={()=>{if(window.confirm(`Confirm ${order.number} was delivered to ${account?.locationName??account?.name??"the customer"}?`))run(markDelivered(order.id),`${order.number} delivered and inventory posted to the customer.`)}}>Mark delivered</Button><Button size="sm" variant="secondary" onClick={()=>{const note=window.prompt("Add a delivery note")?.trim()??"";if(note)run(addDeliveryNote(order.id,note),"Delivery note saved.")}}>Add note</Button></div>}
 {task?.history?.length?<details><summary>Delivery history ({task.history.length})</summary><div style={{display:"grid",gap:6,marginTop:8}}>{task.history.map((event)=><small key={event.id}>{new Date(event.at).toLocaleString()} · {event.type}{event.note?` · ${event.note}`:""}</small>)}</div></details>:null}</article>};
 return <div className="page page--deliveries"><PageHeader title={isDriver?"My deliveries":"Delivery operations"} description={isDriver?"Claim any unassigned approved order, pack the exact SKU mix, load it into your custody, start the route and confirm delivery.":"Assign, monitor and reconcile the delivery queue."} actions={<StatusPill tone={sync.lastError?"danger":sync.pending||sync.flushing?"warning":"success"}>{syncText}</StatusPill>}/>{notice&&<p className="form-notice" role="status">{notice}</p>}<div className="company-rule-facts"><div><span>Available / accepted</span><strong>{ready.length}</strong><small>Orders ready for driver action</small></div><div><span>Loaded / in transit</span><strong>{active.length}</strong><small>Active driver custody</small></div><div><span>Delivered</span><strong>{complete.length}</strong><small>Completed delivery records</small></div><div><span>Drivers</span><strong>{drivers.length}</strong><small>{drivers.length?"Provisioned delivery users":"No delivery drivers provisioned"}</small></div></div><Section title="Delivery queue" description="Unassigned approved orders are visible to every Delivery Driver. Claiming prevents another driver from taking the same active task."><div className="company-request-list">{visible.filter((o)=>taskForOrder(o.id)?.status!=="Delivered").map((o)=>card(o.id))}{visible.filter((o)=>taskForOrder(o.id)?.status!=="Delivered").length===0&&<div className="review-empty"><Route size={23}/><p>No active deliveries in your scope.</p></div>}</div></Section>{complete.length>0&&<Section title="Completed deliveries"><div className="company-request-list">{complete.slice(0,25).map((o)=>card(o.id))}</div></Section>}{!isDriver&&<Section title="Inventory fulfillment" description="Inventory reservations and custody remain auditable. Open Inventory for manual exceptions, counts, holds and reconciliation."><Button variant="secondary" icon={<PackageCheck size={15}/>} onClick={()=>navigate("inventory")}>Open inventory fulfillment</Button></Section>}</div>;
}''')

# ---------------------------------------------------------------------------
# Regression tests for the two production requirements.
# ---------------------------------------------------------------------------
write("tests/order-cancellation-delivery.test.ts", r'''import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileOrderWithApproval } from "../lib/order-approval-engine";
import type { Approval, Order } from "../lib/types";

const baseOrder:Order={id:"ord-1",number:"GE-1",accountId:"acc-1",cases:10,pricePerCase:24,amount:240,status:"Cancelled",placedAt:"2026-09-24",ownerId:"rep-1",priceBasis:"Tier A",paymentStatus:"Not invoiced",cancelledAt:"2026-09-24T17:00:00.000Z",cancelledBy:"admin-1",cancellationReason:"Customer requested cancellation"};
const approval:Approval={id:"apr-1",type:"Order",title:"Review",detail:"10 cases",requestedBy:"Rep",requesterId:"rep-1",recordId:"ord-1",team:"Sales",submittedAt:"2026-09-24T16:00:00.000Z",dueAt:"2026-09-25T16:00:00.000Z",priority:"High",status:"Approved",decidedAt:"2026-09-24T16:30:00.000Z",decidedBy:"admin-1"};

test("a stale approved copy cannot resurrect a cancelled order",()=>{assert.equal(reconcileOrderWithApproval(baseOrder,approval).status,"Cancelled")});

test("delivery driver reads live commercial orders and current inventory lots",()=>{const source=readFileSync("lib/firestore-domains.ts","utf8");assert.match(source,/orders:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\],write:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/);assert.match(source,/inventoryLots:\{read:\[\.\.\.OPERATIONAL,"Delivery Driver"\]\}/)});

test("order cancellation is evidence-preserving and blocks fulfillment-stage cancellation",()=>{const source=readFileSync("lib/workspace-context.tsx","utf8");assert.match(source,/cancellationReason: cleanReason/);assert.match(source,/\["Allocated", "Out for delivery", "Delivered", "Paid"\]\.includes\(order\.status\)/)});

test("delivery workflow includes claim, pack, load, route and delivery",()=>{const page=readFileSync("components/pages/deliveries.tsx","utf8");for(const label of ["Claim delivery","Pack / reserve inventory","Mark loaded","Start delivery","Mark delivered"])assert.match(page,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))});
''')

print("delivery/order expansion patch applied")
