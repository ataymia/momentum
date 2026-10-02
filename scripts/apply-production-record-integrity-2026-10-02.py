from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Patch anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


# The commercial order/approval mutations on current main already write the
# nextCommercial snapshot before the UI calls flushAndConfirm. The remaining
# equivalent race is Delivery: commitState previously performed the storage
# write inside React's state-updater callback, so the page could call
# flushAndConfirm before that callback ran. Make the write synchronous with the
# user's click and keep a ref current for rapid sequential field actions.
replace_once(
    "lib/delivery-context.tsx",
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";',
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";',
)
replace_once(
    "lib/delivery-context.tsx",
    '''  const [state, setState] = useState<DeliveryState>(() => read());
  const commitState=(updater:(current:DeliveryState)=>DeliveryState)=>setState((current)=>{const next=updater(current);if(next!==current){momentumStorage.setItem(DELIVERY_STORAGE_KEY,JSON.stringify(next));void momentumStorage.flush();}return next;});''',
    '''  const [state, setState] = useState<DeliveryState>(() => read());
  const stateRef = useRef(state);
  const commitState=(updater:(current:DeliveryState)=>DeliveryState)=>{
    const current=stateRef.current;
    const next=updater(current);
    if(next===current)return current;
    stateRef.current=next;
    momentumStorage.setItem(DELIVERY_STORAGE_KEY,JSON.stringify(next));
    setState(next);
    void momentumStorage.flush();
    return next;
  };
  useEffect(()=>{stateRef.current=state;},[state]);''',
)
replace_once(
    "lib/delivery-context.tsx",
    '  useRemoteStorageSync(DELIVERY_STORAGE_KEY, () => setState(read()));',
    '''  useRemoteStorageSync(DELIVERY_STORAGE_KEY, () => {
    const next=read();
    stateRef.current=next;
    setState(next);
  });''',
)

# The approval modal already shows the submitting rep. Put the creator directly
# on the approval card detail too so the identity is visible on every order
# surface before anyone opens another screen.
old_detail='''if(orderApproval(approval.type)){const order=scope.orders.find((item)=>item.id===approval.recordId);const account=scope.accounts.find((item)=>item.id===order?.accountId);return order?`${order.cases} cases across ${orderLinesFor(order).length} SKU${orderLinesFor(order).length===1?"":"s"} · ${formatMoney(order.amount)} · ${account?.locationName??account?.name??"Linked account"}`:approval.detail;}'''
new_detail='''if(orderApproval(approval.type)){const order=scope.orders.find((item)=>item.id===approval.recordId);const account=scope.accounts.find((item)=>item.id===order?.accountId);const creator=order?data.users.find((user)=>user.id===order.ownerId):undefined;return order?`${order.cases} cases across ${orderLinesFor(order).length} SKU${orderLinesFor(order).length===1?"":"s"} · ${formatMoney(order.amount)} · ${account?.locationName??account?.name??"Linked account"} · Placed by ${creator?.name??order.ownerId}`:approval.detail;}'''
replace_once("components/pages/work-v2.tsx", old_detail, new_detail)

# Strengthen the regression guard. The old test could pass merely because a
# setItem call appeared later in the very large file. Slice each authoritative
# function and require its own persistence write.
replace_once(
    "tests/production-record-consistency.test.ts",
    '''test("every commercial order state mutation writes through the persistence boundary",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(workspace,/Order approved[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
  assert.match(workspace,/nextFulfillment\\[order\\.status\\][\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY/);
  assert.match(workspace,/const reconcileOrderPayment[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
});''',
    '''test("every authoritative commercial order mutation persists its own snapshot before returning",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  const decide=workspace.slice(workspace.indexOf("const decideApproval"),workspace.indexOf("const setOrderStatus"));
  const fulfillment=workspace.slice(workspace.indexOf("const setOrderStatus"),workspace.indexOf("const cancelOrder"));
  const payment=workspace.slice(workspace.indexOf("const reconcileOrderPayment"),workspace.indexOf("const importInventoryLots"));
  assert.match(decide,/const nextCommercial:[^=]*=/);
  assert.match(decide,/momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
  assert.match(fulfillment,/momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
  assert.match(payment,/momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
});

test("delivery mutations enter persistence before the page can ask for cloud confirmation",()=>{
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  const commit=delivery.slice(delivery.indexOf("const commitState"),delivery.indexOf("const canReconcileCancelledDelivery"));
  assert.match(commit,/momentumStorage\\.setItem\\(DELIVERY_STORAGE_KEY,JSON\\.stringify\\(next\\)\\)/);
  assert.match(commit,/setState\\(next\\)/);
  assert.doesNotMatch(commit,/setState\\(\\(current\\)=>/);
});''',
)

print("Production record integrity patch applied.")
