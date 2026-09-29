from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if new in text:
        print(f"already patched {path}")
        return
    if old not in text:
        raise SystemExit(f"PATCH FAILED in {path}: expected text not found\n{old[:800]}")
    p.write_text(text.replace(old, new, 1))
    print(f"patched {path}")

# Commerce is Administrator-write only. A sales-user cancellation must not create a
# local-only invoice mutation that Firestore will correctly refuse. Administrators
# reconcile/void cancellation-linked invoices when their authorized commerce context runs.
replace_once(
    "lib/commerce-context.tsx",
    '''  useEffect(() => {\n    const handle = window.setTimeout(() => {\n      setCommerce((state) => {\n        let changed = false;''',
    '''  useEffect(() => {\n    if (!canManageCash) return;\n    const handle = window.setTimeout(() => {\n      setCommerce((state) => {\n        let changed = false;''',
)
replace_once(
    "lib/commerce-context.tsx",
    '''    return () => window.clearTimeout(handle);\n  }, [data.orders]);\n\n  useEffect(() => {\n    if (typeof window !== "undefined") momentumStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerce));''',
    '''    return () => window.clearTimeout(handle);\n  }, [canManageCash, data.orders]);\n\n  useEffect(() => {\n    if (typeof window !== "undefined") momentumStorage.setItem(COMMERCE_STORAGE_KEY, JSON.stringify(commerce));''',
)
replace_once(
    "lib/commerce-context.tsx",
    '''        const order = data.orders.find((item) => item.id === invoice.orderId);\n        if (!order) continue;\n        const clearedAmount = invoicePaidAmount(commerce, invoice.id);''',
    '''        const order = data.orders.find((item) => item.id === invoice.orderId);\n        if (!order || order.status === "Cancelled" || invoice.status === "Void") continue;\n        const clearedAmount = invoicePaidAmount(commerce, invoice.id);''',
)

# Delivery state is not writable by Sales. Only a role authorized for the delivery
# domain may close an unstarted assignment after the commercial order is cancelled.
replace_once(
    "lib/delivery-context.tsx",
    '''  const [state, setState] = useState<DeliveryState>(() => read());\n\n  useEffect(() => {\n    const handle = window.setTimeout(() => setState((current) => {''',
    '''  const [state, setState] = useState<DeliveryState>(() => read());\n  const canReconcileCancelledDelivery = Boolean(currentUser && ["Administrator", "Operations", "Delivery Driver"].includes(currentUser.role));\n\n  useEffect(() => {\n    const handle = window.setTimeout(() => setState((current) => {''',
)
replace_once(
    "lib/delivery-context.tsx",
    '''        const order = data.orders.find((item) => item.id === task.orderId);\n        if (!order || order.status !== "Cancelled" || task.status === "Cancelled" || ["Loaded", "In transit", "Delivered"].includes(task.status)) return task;''',
    '''        const order = data.orders.find((item) => item.id === task.orderId);\n        if (!canReconcileCancelledDelivery || !order || order.status !== "Cancelled" || task.status === "Cancelled" || ["Loaded", "In transit", "Delivered"].includes(task.status)) return task;''',
)
replace_once(
    "lib/delivery-context.tsx",
    '''    return () => window.clearTimeout(handle);\n  }, [data]);\n  useEffect(() => {''',
    '''    return () => window.clearTimeout(handle);\n  }, [canReconcileCancelledDelivery, data]);\n  useEffect(() => {''',
)

# Sales users do not have Inventory Ledger write permission. They may cancel an Approved
# order themselves only while no inventory reservation exists. If inventory has already
# been reserved, management must release it as part of the cancellation.
replace_once(
    "components/pages/orders-v3.tsx",
    '''  if(selectedHasFinancialActivity){setError("This order has payment or credit activity. Finance must resolve that activity before the order can be cancelled.");return}\n  setCancelling(true);setError("");\n  if(selected.status==="Approved"&&!releaseOrderReservationsForEdit(selected.id)){setCancelling(false);setError("This approved order cannot be cancelled because inventory has already moved, the inventory period is locked, or the reservation could not be safely released.");return}''',
    '''  if(selectedHasFinancialActivity){setError("This order has payment or credit activity. Finance must resolve that activity before the order can be cancelled.");return}\n  if(selected.status==="Approved"&&currentUser?.role!=="Administrator"&&reserved>0){setError("Inventory is already reserved for this approved order. Ask an Administrator to cancel it so the reservation can be released safely.");return}\n  setCancelling(true);setError("");\n  if(selected.status==="Approved"&&!releaseOrderReservationsForEdit(selected.id)){setCancelling(false);setError("This approved order cannot be cancelled because inventory has already moved, the inventory period is locked, or the reservation could not be safely released.");return}''',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '''  const inventoryConfirmed=selected.status==="Approved"?await momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY):{ok:true as const,message:undefined};''',
    '''  const inventoryConfirmed=selected.status==="Approved"&&currentUser?.role==="Administrator"?await momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY):{ok:true as const,message:undefined};''',
)

replace_once(
    "tests/order-cancellation-delivery.test.ts",
    '''  assert.match(commerce,/cancelled before fulfillment/);\n  assert.match(delivery,/order.status !== "Cancelled"/);''',
    '''  assert.match(commerce,/if \(!canManageCash\) return/);\n  assert.match(commerce,/cancelled before fulfillment/);\n  assert.match(commerce,/order.status === "Cancelled" \\|\\| invoice.status === "Void"/);\n  assert.match(delivery,/canReconcileCancelledDelivery/);\n  assert.match(delivery,/order.status !== "Cancelled"/);\n  assert.match(page,/Inventory is already reserved for this approved order/);''',
)

print("cancellation permission guardrails applied")
