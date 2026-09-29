from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if new in text:
        print(f"already patched {path}")
        return
    if old not in text:
        raise SystemExit(f"PATCH FAILED in {path}: expected text not found\n{old[:700]}")
    p.write_text(text.replace(old, new, 1))
    print(f"patched {path}")


def write(path: str, content: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    print(f"wrote {path}")


write(
    "lib/order-cancellation.ts",
    '''import type { Order, WorkspaceUser } from "./types";

const cancellableStatuses = new Set<Order["status"]>(["Draft", "Awaiting approval", "Approved"]);

/**
 * Order cancellation authority is intentionally narrower than edit authority.
 * Administrators may cancel any pre-fulfillment order. Sales Representatives and
 * Sales Managers may cancel only orders they personally submitted. Customer
 * self-cancellation is not enabled until the commercial policy is explicitly approved.
 */
export function canCancelOrder(user: WorkspaceUser | null | undefined, order: Order | null | undefined) {
  if (!user || !order || !cancellableStatuses.has(order.status)) return false;
  if (user.role === "Administrator") return true;
  const selfServiceRole = user.role === "Sales Representative" || user.role === "Sales Manager";
  return selfServiceRole && order.ownerId === user.id;
}

export function orderCancellationAccessMessage(user: WorkspaceUser | null | undefined, order: Order | null | undefined) {
  if (!user) return "Sign in before cancelling an order.";
  if (!order) return "Order not found.";
  if (order.status === "Cancelled") return "This order is already cancelled.";
  if (!cancellableStatuses.has(order.status)) return "Fulfillment has already started. Use the delivery/return exception workflow instead of cancelling this order.";
  if (user.role === "Administrator") return "";
  if ((user.role === "Sales Representative" || user.role === "Sales Manager") && order.ownerId !== user.id) return "You can cancel only orders you personally submitted.";
  return "You do not have permission to cancel this order.";
}
''',
)

replace_once(
    "lib/workspace-context.tsx",
    'import { productsEquivalent } from "./order-lines";\nimport { reconcileApprovals, reconcileOrders } from "./order-approval-engine";',
    'import { productsEquivalent } from "./order-lines";\nimport { canCancelOrder, orderCancellationAccessMessage } from "./order-cancellation";\nimport { reconcileApprovals, reconcileOrders } from "./order-approval-engine";',
)

replace_once(
    "lib/workspace-context.tsx",
    '''  const cancelOrder = (id: string, reason: string) => {
    if (!currentUser || currentUser.role !== "Administrator") return { ok: false, message: "Administrator access is required to cancel an order." };
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return { ok: false, message: "Enter a cancellation reason." };
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) return { ok: false, message: "Only shared commercial orders can be cancelled from this screen." };
    if (["Allocated", "Out for delivery", "Delivered", "Paid"].includes(order.status)) return { ok: false, message: "Fulfillment has already started. Use the delivery/return exception workflow instead of cancelling this order." };
    if (order.status === "Cancelled") return { ok: true };
    const stamp = now();
    setCommercial((state) => ({
      ...state,
      orders: state.orders.map((item) => item.id === id ? { ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id, cancellationReason: cleanReason } : item),
      approvals: state.approvals.map((item) => item.recordId === id && ["Order", "Low stock sale"].includes(item.type) && item.status === "Pending" ? { ...item, status: "Returned", decidedBy: currentUser.id, decidedAt: stamp, returnReason: `Order cancelled: ${cleanReason}` } : item),
      accountPatches: { ...state.accountPatches, [order.accountId]: { ...(state.accountPatches[order.accountId] ?? {}), lastActivity: `Order ${order.number} cancelled` } },
      activities: [{ id: uid("act-order-cancel"), accountId: order.accountId, type: "order", title: "Order cancelled", detail: `${order.number} cancelled by ${currentUser.name}: ${cleanReason}`, at: stamp, userId: currentUser.id }, ...state.activities],
    }));
    return { ok: true };
  };''',
    '''  const cancelOrder = (id: string, reason: string) => {
    if (!currentUser) return { ok: false, message: "Sign in before cancelling an order." };
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return { ok: false, message: "Enter a cancellation reason." };
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) return { ok: false, message: "Only shared commercial orders can be cancelled from this screen." };
    if (order.status === "Cancelled") return { ok: true };
    if (!canCancelOrder(currentUser, order)) return { ok: false, message: orderCancellationAccessMessage(currentUser, order) };
    if (["Partially paid", "Paid"].includes(order.paymentStatus)) return { ok: false, message: "This order has payment activity. Finance must resolve it before the order can be cancelled." };
    const stamp = now();
    const nextCommercial: CommercialState = {
      ...commercial,
      orders: commercial.orders.map((item) => item.id === id ? { ...item, status: "Cancelled", cancelledAt: stamp, cancelledBy: currentUser.id, cancellationReason: cleanReason } : item),
      approvals: commercial.approvals.map((item) => item.recordId === id && ["Order", "Low stock sale"].includes(item.type) && item.status === "Pending" ? { ...item, status: "Returned", decidedBy: currentUser.id, decidedAt: stamp, returnReason: `Order cancelled: ${cleanReason}` } : item),
      accountPatches: { ...commercial.accountPatches, [order.accountId]: { ...(commercial.accountPatches[order.accountId] ?? {}), lastActivity: `Order ${order.number} cancelled` } },
      activities: [{ id: uid("act-order-cancel"), accountId: order.accountId, type: "order", title: "Order cancelled", detail: `${order.number} cancelled by ${currentUser.name}: ${cleanReason}`, at: stamp, userId: currentUser.id }, ...commercial.activities],
    };
    momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    void momentumStorage.flush();
    return { ok: true };
  };''',
)

replace_once(
    "lib/inventory-ledger-context-v2.tsx",
    '''  const releaseOrderReservationsForEdit=(orderId:string)=>{if(!currentUser||locked())return false;const order=data.orders.find((item)=>item.id===orderId);if(!order||!["Draft","Awaiting approval","Approved"].includes(order.status))return false;const ownOrder=order.ownerId===currentUser.id&&["Sales Representative","Sales Manager","Customer"].includes(currentUser.role);if(currentUser.role!=="Administrator"&&!ownOrder)return false;if(orderOutboundQuantity(ledger,orderId)>0)return false;const active=ledger.reservations.filter((item)=>item.orderId===orderId&&item.status==="Active");if(active.some((reservation)=>orderLotWarehouseNetOutbound(ledger,orderId,reservation.lotId)>0))return false;if(!active.length)return true;const releasedAt=now();setLedger((state)=>({...state,reservations:state.reservations.map((item)=>item.orderId===orderId&&item.status==="Active"?{...item,status:"Released",releasedAt}:item)}));return true;};''',
    '''  const releaseOrderReservationsForEdit=(orderId:string)=>{if(!currentUser)return false;const order=data.orders.find((item)=>item.id===orderId);if(!order||!["Draft","Awaiting approval","Approved"].includes(order.status))return false;const ownOrder=order.ownerId===currentUser.id&&["Sales Representative","Sales Manager","Customer"].includes(currentUser.role);if(currentUser.role!=="Administrator"&&!ownOrder)return false;if(orderOutboundQuantity(ledger,orderId)>0)return false;const active=ledger.reservations.filter((item)=>item.orderId===orderId&&item.status==="Active");if(active.some((reservation)=>orderLotWarehouseNetOutbound(ledger,orderId,reservation.lotId)>0))return false;if(!active.length)return true;if(locked())return false;const releasedAt=now();const nextLedger={...ledger,reservations:ledger.reservations.map((item)=>item.orderId===orderId&&item.status==="Active"?{...item,status:"Released" as const,releasedAt}:item)};momentumStorage.setItem(INVENTORY_LEDGER_STORAGE_KEY,JSON.stringify(nextLedger));setLedger(nextLedger);void momentumStorage.flush();return true;};''',
)

replace_once(
    "lib/commerce-context.tsx",
    '''  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommerce((state) => normalizeCommerceState(state, data));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    if (typeof window !== "undefined") momentumStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerce));
  }, [commerce]);''',
    '''  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommerce((state) => normalizeCommerceState(state, data));
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setCommerce((state) => {
        let changed = false;
        const invoices = state.invoices.map((invoice) => {
          const order = data.orders.find((item) => item.id === invoice.orderId);
          if (!order || order.status !== "Cancelled" || invoice.status === "Void") return invoice;
          const paymentIds = new Set(state.allocations.filter((allocation) => allocation.invoiceId === invoice.id).map((allocation) => allocation.paymentId));
          const hasPaymentActivity = state.payments.some((payment) => paymentIds.has(payment.id) && ["Pending", "Cleared"].includes(payment.status));
          const hasCreditActivity = state.credits.some((credit) => credit.invoiceId === invoice.id && credit.status !== "Void");
          if (hasPaymentActivity || hasCreditActivity) return invoice;
          changed = true;
          return { ...invoice, status: "Void" as const, voidReason: `Order ${order.number} cancelled before fulfillment${order.cancellationReason ? `: ${order.cancellationReason}` : "."}` };
        });
        return changed ? { ...state, invoices } : state;
      });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [data.orders]);

  useEffect(() => {
    if (typeof window !== "undefined") momentumStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerce));
  }, [commerce]);''',
)

replace_once(
    "lib/delivery-context.tsx",
    '''  useEffect(() => {
    const handle = window.setTimeout(() => setState((current) => normalizeDeliveryState(current, data)), 0);
    return () => window.clearTimeout(handle);
  }, [data]);''',
    '''  useEffect(() => {
    const handle = window.setTimeout(() => setState((current) => {
      const normalized = normalizeDeliveryState(current, data);
      let changed = false;
      const tasks = normalized.tasks.map((task) => {
        const order = data.orders.find((item) => item.id === task.orderId);
        if (!order || order.status !== "Cancelled" || task.status === "Cancelled" || ["Loaded", "In transit", "Delivered"].includes(task.status)) return task;
        changed = true;
        const cancelledAt = order.cancelledAt ?? now();
        const cancelledBy = order.cancelledBy ?? "system";
        const note = `Order cancelled${order.cancellationReason ? `: ${order.cancellationReason}` : "."}`;
        return {
          ...task,
          status: "Cancelled" as const,
          cancelledAt,
          cancelledBy,
          history: [{ id: uid("delivery-event"), type: "Cancelled" as const, at: cancelledAt, actorId: cancelledBy, note }, ...task.history],
        };
      });
      return changed ? { ...normalized, tasks } : normalized;
    }), 0);
    return () => window.clearTimeout(handle);
  }, [data]);''',
)

replace_once(
    "components/pages/orders-v3.tsx",
    'import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";\nimport { activeReservedForOrder, orderCanAdvanceInventory, orderDeliveryQuantity, orderOutboundQuantity, productInventoryStatus } from "../../lib/inventory-ledger";',
    'import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";\nimport { useCommerce } from "../../lib/commerce-context";\nimport { activeReservedForOrder, INVENTORY_LEDGER_STORAGE_KEY, orderCanAdvanceInventory, orderDeliveryQuantity, orderOutboundQuantity, productInventoryStatus } from "../../lib/inventory-ledger";',
)
replace_once(
    "components/pages/orders-v3.tsx",
    'import { useInventoryLedger } from "../../lib/inventory-ledger-context";\nimport { orderLinesFor } from "../../lib/order-lines";',
    'import { useInventoryLedger } from "../../lib/inventory-ledger-context";\nimport { canCancelOrder } from "../../lib/order-cancellation";\nimport { orderLinesFor } from "../../lib/order-lines";',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const{data,scope,currentUser,createOrder,editOrder,cancelOrder,navigate}=useWorkspace();
 const{ledger,advanceOrderFulfillment,releaseOrderReservationsForEdit}=useInventoryLedger();
 const firebase=useFirebaseSessionOptional();''',
    ''' const{data,scope,currentUser,createOrder,editOrder,cancelOrder,navigate}=useWorkspace();
 const{ledger,advanceOrderFulfillment,releaseOrderReservationsForEdit}=useInventoryLedger();
 const{commerce}=useCommerce();
 const firebase=useFirebaseSessionOptional();''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const[detailOpen,setDetailOpen]=useState(false);
 const[error,setError]=useState("");
 const[submitting,setSubmitting]=useState(false);''',
    ''' const[detailOpen,setDetailOpen]=useState(false);
 const[cancelOpen,setCancelOpen]=useState(false);
 const[cancelReason,setCancelReason]=useState("");
 const[cancelling,setCancelling]=useState(false);
 const[error,setError]=useState("");
 const[submitting,setSubmitting]=useState(false);''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const canEdit=(order:Order|undefined)=>Boolean(order&&currentUser&&["Draft","Awaiting approval","Approved"].includes(order.status)&&(currentUser.role==="Administrator"||(order.ownerId===currentUser.id&&["Sales Representative","Sales Manager","Customer"].includes(currentUser.role))));''',
    ''' const canEdit=(order:Order|undefined)=>Boolean(order&&currentUser&&["Draft","Awaiting approval","Approved"].includes(order.status)&&(currentUser.role==="Administrator"||(order.ownerId===currentUser.id&&["Sales Representative","Sales Manager","Customer"].includes(currentUser.role))));
 const canCancel=(order:Order|undefined)=>canCancelOrder(currentUser,order);
 const selectedInvoice=selected?commerce.invoices.find((invoice)=>invoice.orderId===selected.id):undefined;
 const selectedInvoicePaymentIds=new Set(selectedInvoice?commerce.allocations.filter((allocation)=>allocation.invoiceId===selectedInvoice.id).map((allocation)=>allocation.paymentId):[]);
 const selectedHasFinancialActivity=Boolean(selectedInvoice&&(commerce.payments.some((payment)=>selectedInvoicePaymentIds.has(payment.id)&&["Pending","Cleared"].includes(payment.status))||commerce.credits.some((credit)=>credit.invoiceId===selectedInvoice.id&&credit.status!=="Void")));''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' const advance=()=>{if(!selected||!nextStatus)return;if(!advanceOrderFulfillment(selected.id,nextStatus)){setError("Inventory evidence is incomplete for the next fulfillment step. Open Inventory to finish reservations or custody records.");return}setError("")};
 const cancelSelected=()=>{if(!selected)return;const reason=window.prompt(`Why is ${selected.number} being cancelled? This reason will remain in order history.`)?.trim()??"";if(!reason)return;const result=cancelOrder(selected.id,reason);setError(result.ok?"":result.message??"Order cancellation failed.");if(result.ok)setDetailOpen(false)};''',
    ''' const advance=()=>{if(!selected||!nextStatus)return;if(!advanceOrderFulfillment(selected.id,nextStatus)){setError("Inventory evidence is incomplete for the next fulfillment step. Open Inventory to finish reservations or custody records.");return}setError("")};
 const openCancellation=()=>{if(!selected||!canCancel(selected))return;setCancelReason("");setError("");setCancelOpen(true)};
 const confirmCancellation=async()=>{
  if(!selected||cancelling)return;
  const reason=cancelReason.trim();
  if(reason.length<3){setError("Enter a cancellation reason before cancelling the order.");return}
  if(selectedHasFinancialActivity){setError("This order has payment or credit activity. Finance must resolve that activity before the order can be cancelled.");return}
  setCancelling(true);setError("");
  if(selected.status==="Approved"&&!releaseOrderReservationsForEdit(selected.id)){setCancelling(false);setError("This approved order cannot be cancelled because inventory has already moved, the inventory period is locked, or the reservation could not be safely released.");return}
  const result=cancelOrder(selected.id,reason);
  if(!result.ok){setCancelling(false);setError(result.message??"Order cancellation failed.");return}
  const commercialConfirmed=await momentumStorage.flushAndConfirm(COMMERCIAL_KEY);
  const inventoryConfirmed=selected.status==="Approved"?await momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY):{ok:true as const,message:undefined};
  setCancelling(false);setCancelOpen(false);setDetailOpen(false);
  if(!commercialConfirmed.ok||!inventoryConfirmed.ok){setError(`${selected.number} is cancelled on this device, but Momentum cloud has not confirmed every cancellation record yet. Do not recreate or cancel it again. ${commercialConfirmed.message??inventoryConfirmed.message??"Use the sync indicator and retry after access/connectivity is corrected."}`);return}
  setError("");
 };''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '''<div className="order-detail-actions"><Button size="sm" onClick={()=>setDetailOpen(true)}>View full order</Button>{canEdit(selected)&&<Button size="sm" variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openEditor(selected)}>{selected.status==="Draft"?"Edit and resubmit":"Edit order"}</Button>}{canCreateOrder(currentUser)&&selected.status!=="Cancelled"&&<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>openDraft(selected)}>Copy / reorder</Button>}</div>''',
    '''<div className="order-detail-actions"><Button size="sm" onClick={()=>setDetailOpen(true)}>View full order</Button>{canEdit(selected)&&<Button size="sm" variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openEditor(selected)}>{selected.status==="Draft"?"Edit and resubmit":"Edit order"}</Button>}{canCancel(selected)&&<Button size="sm" variant="danger" icon={<XCircle size={14}/>} onClick={openCancellation}>Cancel order</Button>}{canCreateOrder(currentUser)&&selected.status!=="Cancelled"&&<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>openDraft(selected)}>Copy / reorder</Button>}</div>''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '''{currentUser?.role==="Administrator"&&["Draft","Awaiting approval","Approved"].includes(selected.status)&&<Button variant="secondary" icon={<XCircle size={15}/>} onClick={cancelSelected}>Cancel order</Button>}''',
    '''{canCancel(selected)&&<Button variant="danger" icon={<XCircle size={15}/>} onClick={openCancellation}>Cancel order</Button>}''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    ''' {selected.status==="Cancelled"&&<Section title="Cancellation"><div className="form-callout"><XCircle size={17}/><p><strong>{selected.cancellationReason}</strong><br/>{selected.cancelledAt?new Date(selected.cancelledAt).toLocaleString():""}{cancelledBy?` · ${cancelledBy.name}`:""}</p></div></Section>}</div></Modal>}
 <Modal open={open} title={editingOrder?`Edit ${editingOrder.number}`:"Create order request"}''',
    ''' {selected.status==="Cancelled"&&<Section title="Cancellation"><div className="form-callout"><XCircle size={17}/><p><strong>{selected.cancellationReason}</strong><br/>{selected.cancelledAt?new Date(selected.cancelledAt).toLocaleString():""}{cancelledBy?` · ${cancelledBy.name}`:""}</p></div></Section>}</div></Modal>}
 {selected&&<Modal open={cancelOpen} title={`Cancel ${selected.number}`} description="Cancel this order before fulfillment starts. The cancellation stays in order history." onClose={()=>{if(!cancelling)setCancelOpen(false)}} footer={<><Button variant="ghost" disabled={cancelling} onClick={()=>setCancelOpen(false)}>Keep order</Button><Button variant="danger" disabled={cancelling||cancelReason.trim().length<3||selectedHasFinancialActivity} icon={<XCircle size={15}/>} onClick={()=>void confirmCancellation()}>{cancelling?"Confirming with cloud…":"Confirm cancellation"}</Button></>}><div className="form-grid"><Field label="Cancellation reason" className="field--full"><textarea autoFocus rows={4} value={cancelReason} onChange={(event)=>setCancelReason(event.target.value)} placeholder="Example: Entered under the wrong account"/></Field>{selectedHasFinancialActivity?<div className="form-callout field--full"><AlertCircle size={17}/><p>This order has payment or credit activity. Finance must resolve that activity before cancellation.</p></div>:<div className="form-callout field--full"><XCircle size={17}/><p>Cancellation is final for this order record. Any pending order approval is closed, safe pre-fulfillment inventory reservations are released, and the reason, person, and time are retained in history.</p></div>}{error&&<p className="form-error field--full" role="alert">{error}</p>}</div></Modal>}
 <Modal open={open} title={editingOrder?`Edit ${editingOrder.number}`:"Create order request"}''',
)

replace_once(
    "tests/order-cancellation-delivery.test.ts",
    'import { reconcileOrderWithApproval } from "../lib/order-approval-engine";\nimport type { Approval, Order } from "../lib/types";',
    'import { canCancelOrder } from "../lib/order-cancellation";\nimport { reconcileOrderWithApproval } from "../lib/order-approval-engine";\nimport type { Approval, Order, WorkspaceUser } from "../lib/types";',
)
replace_once(
    "tests/order-cancellation-delivery.test.ts",
    '''test("a stale approved copy cannot resurrect a cancelled order",()=>{assert.equal(reconcileOrderWithApproval(baseOrder,approval).status,"Cancelled")});''',
    '''test("a stale approved copy cannot resurrect a cancelled order",()=>{assert.equal(reconcileOrderWithApproval(baseOrder,approval).status,"Cancelled")});

test("sales users can cancel only their own pre-fulfillment orders while admins can cancel any",()=>{
  const rep={id:"rep-1",name:"Rep One",firstName:"Rep",email:"rep@test.com",initials:"RO",title:"Sales Rep",role:"Sales Representative",team:"Sales",accent:"#000"} as WorkspaceUser;
  const manager={...rep,id:"mgr-1",role:"Sales Manager",title:"Sales Manager"} as WorkspaceUser;
  const admin={...rep,id:"admin-1",role:"Administrator",title:"Administrator"} as WorkspaceUser;
  const own={...baseOrder,status:"Awaiting approval" as const,cancelledAt:undefined,cancelledBy:undefined,cancellationReason:undefined};
  const other={...own,ownerId:"rep-2"};
  assert.equal(canCancelOrder(rep,own),true);
  assert.equal(canCancelOrder(manager,{...own,ownerId:manager.id}),true);
  assert.equal(canCancelOrder(rep,other),false);
  assert.equal(canCancelOrder(admin,other),true);
  assert.equal(canCancelOrder(rep,{...own,status:"Allocated"}),false);
});''',
)
replace_once(
    "tests/order-cancellation-delivery.test.ts",
    '''test("order cancellation is evidence-preserving and blocks fulfillment-stage cancellation",()=>{const source=readFileSync("lib/workspace-context.tsx","utf8");assert.match(source,/cancellationReason: cleanReason/);assert.match(source,/\\["Allocated", "Out for delivery", "Delivered", "Paid"\\]\\.includes\\(order\\.status\\)/)});''',
    '''test("order cancellation is evidence-preserving, self-service for the creator, and cloud-confirmed",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  const page=readFileSync("components/pages/orders-v3.tsx","utf8");
  const inventory=readFileSync("lib/inventory-ledger-context-v2.tsx","utf8");
  const commerce=readFileSync("lib/commerce-context.tsx","utf8");
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  assert.match(workspace,/canCancelOrder\\(currentUser, order\\)/);
  assert.match(workspace,/cancellationReason: cleanReason/);
  assert.match(workspace,/payment activity/);
  assert.match(page,/Cancellation reason/);
  assert.match(page,/Confirm cancellation/);
  assert.match(page,/flushAndConfirm\\(COMMERCIAL_KEY\\)/);
  assert.match(page,/flushAndConfirm\\(INVENTORY_LEDGER_STORAGE_KEY\\)/);
  assert.match(inventory,/status:"Released" as const/);
  assert.match(commerce,/cancelled before fulfillment/);
  assert.match(delivery,/order.status !== "Cancelled"/);
});''',
)

replace_once(
    "package.json",
    'tests/delivery-driver.test.ts tests/platform-integrity.test.ts',
    'tests/delivery-driver.test.ts tests/order-cancellation-delivery.test.ts tests/platform-integrity.test.ts',
)

print("self-order cancellation hotfix applied")
