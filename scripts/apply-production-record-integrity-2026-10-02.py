from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Patch anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Commercial state: write the exact mutation into Momentum storage before the
# UI can call flushAndConfirm. Previously several admin actions only called
# React setState first, so flushAndConfirm could return before the changed
# state had even reached the persistence boundary.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context.tsx",
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";',
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";',
)
replace_once(
    "lib/workspace-context.tsx",
    '  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));\n  const [warehouseSession, setWarehouseSession] = useState(false);',
    '''  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));
  const commercialRef = useRef(commercial);
  const [warehouseSession, setWarehouseSession] = useState(false);

  const commitCommercialState = (updater: (current: CommercialState) => CommercialState) => {
    const current = commercialRef.current;
    const next = updater(current);
    if (next === current) return current;
    commercialRef.current = next;
    momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(next));
    setCommercial(next);
    void momentumStorage.flush();
    return next;
  };

  useEffect(() => { commercialRef.current = commercial; }, [commercial]);''',
)
replace_once(
    "lib/workspace-context.tsx",
    '  useRemoteStorageSync(COMMERCIAL_KEY, () => setCommercial(readCommercial(base.data)));',
    '''  useRemoteStorageSync(COMMERCIAL_KEY, () => {
    const next = readCommercial(base.data);
    commercialRef.current = next;
    setCommercial(next);
  });''',
)

# Territory review decisions also need immediate persistence.
replace_once(
    "lib/workspace-context.tsx",
    '      setCommercial((state)=>({...state,approvals:state.approvals.map((item)=>item.id===id?{...item,status:decision}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:now(),userId:currentUser.id},...state.activities]:state.activities}));',
    '      commitCommercialState((state)=>({...state,approvals:state.approvals.map((item)=>item.id===id?{...item,status:decision}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:now(),userId:currentUser.id},...state.activities]:state.activities}));',
)

# Order approval decision: persist before returning to caller. This closes the
# false-positive cloud-confirmation window that could put approved orders back
# in the queue on another account or next login.
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({
      ...state,
      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),
      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,
    }));''',
    '''    commitCommercialState((state) => ({
      ...state,
      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),
      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,
    }));''',
)

# Fulfillment progression is a production custody change. Persist it before
# returning so Delivery's flushAndConfirm can actually confirm the mutation.
replace_once(
    "lib/workspace-context.tsx",
    '    setCommercial((state) => ({ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) }));',
    '    commitCommercialState((state) => ({ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) }));',
)

# Payment reconciliation is also authoritative commercial state.
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({
      ...state,
      orders: state.orders.map((item) => item.id === id ? { ...item, paymentStatus: status, paidAt: status === "Paid" ? paidAt ?? today() : undefined } : item),''',
    '''    commitCommercialState((state) => ({
      ...state,
      orders: state.orders.map((item) => item.id === id ? { ...item, paymentStatus: status, paidAt: status === "Paid" ? paidAt ?? today() : undefined } : item),''',
)

# Customer/account admin edits should not rely on a later React effect either.
replace_once(
    "lib/workspace-context.tsx",
    '''    setCommercial((state) => ({
      ...state,
      accountPatches: {
        ...state.accountPatches,
        [accountId]: {''',
    '''    commitCommercialState((state) => ({
      ...state,
      accountPatches: {
        ...state.accountPatches,
        [accountId]: {''',
)
replace_once(
    "lib/workspace-context.tsx",
    '    setCommercial((state)=>({...state,customerPatches:{...state.customerPatches,[customerId]:{...(state.customerPatches[customerId]??{}),...clean}},activities:[{id:uid("act-customer-commercial"),accountId:data.accounts.find((account)=>account.customerId===customerId)?.id,type:"note",title:management?"Customer commercial setup updated":"Customer onboarding information updated",detail:`${customer.name} setup updated by ${currentUser.name}.`,at:now(),userId:currentUser.id},...state.activities]}));',
    '    commitCommercialState((state)=>({...state,customerPatches:{...state.customerPatches,[customerId]:{...(state.customerPatches[customerId]??{}),...clean}},activities:[{id:uid("act-customer-commercial"),accountId:data.accounts.find((account)=>account.customerId===customerId)?.id,type:"note",title:management?"Customer commercial setup updated":"Customer onboarding information updated",detail:`${customer.name} setup updated by ${currentUser.name}.`,at:now(),userId:currentUser.id},...state.activities]}));',
)

# ---------------------------------------------------------------------------
# Delivery state: same race existed here. commitState previously wrote inside a
# React state updater, while the page immediately called flushAndConfirm.
# Make the persistence write synchronous with the user's action.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Approval list: show creator on the card itself, not only after opening the
# modal. Other operational order surfaces already carry Placed by; this makes
# the approval queue consistent too.
# ---------------------------------------------------------------------------
old_detail='''if(orderApproval(approval.type)){const order=scope.orders.find((item)=>item.id===approval.recordId);const account=scope.accounts.find((item)=>item.id===order?.accountId);return order?`${order.cases} cases across ${orderLinesFor(order).length} SKU${orderLinesFor(order).length===1?"":"s"} · ${formatMoney(order.amount)} · ${account?.locationName??account?.name??"Linked account"}`:approval.detail;}'''
new_detail='''if(orderApproval(approval.type)){const order=scope.orders.find((item)=>item.id===approval.recordId);const account=scope.accounts.find((item)=>item.id===order?.accountId);const creator=order?data.users.find((user)=>user.id===order.ownerId):undefined;return order?`${order.cases} cases across ${orderLinesFor(order).length} SKU${orderLinesFor(order).length===1?"":"s"} · ${formatMoney(order.amount)} · ${account?.locationName??account?.name??"Linked account"} · Placed by ${creator?.name??order.ownerId}`:approval.detail;}'''
replace_once("components/pages/work-v2.tsx", old_detail, new_detail)

# ---------------------------------------------------------------------------
# Tighten the regression guard so it checks that authoritative mutations write
# through synchronously, rather than merely finding setItem somewhere later in
# the same large source file.
# ---------------------------------------------------------------------------
replace_once(
    "tests/production-record-consistency.test.ts",
    '''test("every commercial order state mutation writes through the persistence boundary",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(workspace,/Order approved[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
  assert.match(workspace,/nextFulfillment\\[order\\.status\\][\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY/);
  assert.match(workspace,/const reconcileOrderPayment[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);
});''',
    '''test("authoritative commercial mutations cross the persistence boundary before cloud confirmation",()=>{
  const workspace=readFileSync("lib/workspace-context.tsx","utf8");
  assert.match(workspace,/const commitCommercialState[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY, JSON\\.stringify\\(next\\)\\)[\\s\\S]*setCommercial\\(next\\)/);
  const decide=workspace.slice(workspace.indexOf("const decideApproval"),workspace.indexOf("const setOrderStatus"));
  const fulfillment=workspace.slice(workspace.indexOf("const setOrderStatus"),workspace.indexOf("const cancelOrder"));
  const payment=workspace.slice(workspace.indexOf("const reconcileOrderPayment"),workspace.indexOf("const importInventoryLots"));
  assert.match(decide,/commitCommercialState/);
  assert.match(fulfillment,/commitCommercialState/);
  assert.match(payment,/commitCommercialState/);
});

test("delivery mutations write the changed state before the page can confirm cloud persistence",()=>{
  const delivery=readFileSync("lib/delivery-context.tsx","utf8");
  const commit=delivery.slice(delivery.indexOf("const commitState"),delivery.indexOf("const canReconcileCancelledDelivery"));
  assert.match(commit,/momentumStorage\\.setItem\\(DELIVERY_STORAGE_KEY,JSON\\.stringify\\(next\\)\\)/);
  assert.match(commit,/setState\\(next\\)/);
  assert.doesNotMatch(commit,/setState\\(\\(current\\)=>/);
});''',
)

print("Production record integrity patch applied.")
