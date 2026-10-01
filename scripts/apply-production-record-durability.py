from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Patch anchor not found in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Enhanced commercial workspace: critical order lifecycle mutations must write
# to Momentum persistence synchronously, before any UI can claim cloud sync.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context.tsx",
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";',
    'import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";',
)
replace_once(
    "lib/workspace-context.tsx",
    '''  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));
  const [warehouseSession, setWarehouseSession] = useState(false);

  useEffect(() => {
''',
    '''  const [commercial, setCommercial] = useState<CommercialState>(() => readCommercial(base.data));
  const commercialRef = useRef(commercial);
  const [warehouseSession, setWarehouseSession] = useState(false);
  const commitCommercialState = (next: CommercialState) => {
    commercialRef.current = next;
    momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(next));
    setCommercial(next);
    return momentumStorage.flushAndConfirm(COMMERCIAL_KEY);
  };

  useEffect(() => { commercialRef.current = commercial; }, [commercial]);

  useEffect(() => {
''',
)
replace_once(
    "lib/workspace-context.tsx",
    '  useRemoteStorageSync(COMMERCIAL_KEY, () => setCommercial(readCommercial(base.data)));',
    '  useRemoteStorageSync(COMMERCIAL_KEY, () => { const next = readCommercial(base.data); commercialRef.current = next; setCommercial(next); });',
)

old_decide = '''  const decideApproval = (id: string, decision: "Approved" | "Returned") => {
    const approval = commercial.approvals.find((item) => item.id === id);
    if (!approval) {
      base.decideApproval(id, decision);
      return;
    }
    if (!currentUser || approval.status !== "Pending" || !canReviewApproval(data, currentUser, approval)) return;
    if(approval.type==="Territory exception"){
      let returnReason="";
      if(decision==="Returned"){
        if(typeof window==="undefined")return;
        returnReason=window.prompt("Why is this territory exception being returned? This note will be kept with the account history.")?.trim()??"";
        if(returnReason.length<3)return;
      }
      const accountId=approval.recordId;
      setCommercial((state)=>({...state,approvals:state.approvals.map((item)=>item.id===id?{...item,status:decision}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:now(),userId:currentUser.id},...state.activities]:state.activities}));
      return;
    }
    let returnReason: string | undefined;
    if (decision === "Returned") {
      if (typeof window === "undefined") return;
      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();
      if (!returnReason || returnReason.length < 3) return;
    }
    const decidedAt = now();
    setCommercial((state) => ({
      ...state,
      approvals: state.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),
      orders: state.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: state.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...state.activities] : state.activities,
    }));
    window.setTimeout(() => void momentumStorage.flush(), 0);
  };
'''
new_decide = '''  const decideApproval = (id: string, decision: "Approved" | "Returned") => {
    const current = commercialRef.current;
    const approval = current.approvals.find((item) => item.id === id);
    if (!approval) {
      base.decideApproval(id, decision);
      return;
    }
    if (!currentUser || approval.status !== "Pending" || !canReviewApproval(data, currentUser, approval)) return;
    if(approval.type==="Territory exception"){
      let returnReason="";
      if(decision==="Returned"){
        if(typeof window==="undefined")return;
        returnReason=window.prompt("Why is this territory exception being returned? This note will be kept with the account history.")?.trim()??"";
        if(returnReason.length<3)return;
      }
      const accountId=approval.recordId;
      const next: CommercialState={...current,approvals:current.approvals.map((item)=>item.id===id?{...item,status:decision,decidedBy:currentUser.id,decidedAt:now(),returnReason:returnReason||undefined}:item),activities:accountId?[{id:uid("act-territory-review"),accountId,type:"note",title:decision==="Approved"?"Territory exception validated":"Territory exception returned",detail:decision==="Approved"?`${approval.detail} Reviewed and approved by ${currentUser.name}.`:`${approval.detail} Returned by ${currentUser.name}: ${returnReason}`,at:now(),userId:currentUser.id},...current.activities]:current.activities};
      void commitCommercialState(next);
      return;
    }
    let returnReason: string | undefined;
    if (decision === "Returned") {
      if (typeof window === "undefined") return;
      returnReason = window.prompt("What needs to be corrected before this order can be approved?")?.trim();
      if (!returnReason || returnReason.length < 3) return;
    }
    const decidedAt = now();
    const next: CommercialState = {
      ...current,
      approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt, returnReason } : item),
      orders: current.orders.map((order) => order.id === approval.recordId ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
      activities: approval.recordId ? [{ id: uid("act-approval"), accountId: current.orders.find((order) => order.id === approval.recordId)?.accountId, type: "order", title: decision === "Approved" ? "Order approved" : "Order returned for edits", detail: decision === "Approved" ? `${approval.title} approved by ${currentUser.name}.` : `${approval.title} returned by ${currentUser.name}: ${returnReason}`, at: decidedAt, userId: currentUser.id }, ...current.activities] : current.activities,
    };
    void commitCommercialState(next);
  };
'''
replace_once("lib/workspace-context.tsx", old_decide, new_decide)

old_status = '''  const setOrderStatus = (id: string, status: OrderStatus) => {
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) {
      base.setOrderStatus(id, status);
      return;
    }
    if (!currentUser || !canAdvanceFulfillment(currentUser) || nextFulfillment[order.status] !== status) return;
    setCommercial((state) => ({ ...state, orders: state.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) }));
  };
'''
new_status = '''  const setOrderStatus = (id: string, status: OrderStatus) => {
    const current = commercialRef.current;
    const order = current.orders.find((item) => item.id === id);
    if (!order) {
      base.setOrderStatus(id, status);
      return;
    }
    if (!currentUser || !canAdvanceFulfillment(currentUser) || nextFulfillment[order.status] !== status) return;
    const next: CommercialState = { ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };
    void commitCommercialState(next);
  };
'''
replace_once("lib/workspace-context.tsx", old_status, new_status)

# Critical edit/cancel already write immediately. Route them through the same single commit primitive so
# the in-memory ref, local journal, React state, and cloud confirmation cannot drift apart.
replace_once(
    "lib/workspace-context.tsx",
    '    momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));setCommercial(nextCommercial);window.setTimeout(()=>void momentumStorage.flush(),0);return{ok:true,status:nextStatus};',
    '    void commitCommercialState(nextCommercial);return{ok:true,status:nextStatus};',
)
replace_once(
    "lib/workspace-context.tsx",
    '''    momentumStorage.setItem(COMMERCIAL_KEY, JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    void momentumStorage.flush();
    return { ok: true };''',
    '''    void commitCommercialState(nextCommercial);
    return { ok: true };''',
)

# ---------------------------------------------------------------------------
# Legacy/base workspace: production still reconciles older workspace records.
# Give those approval and fulfillment mutations the same immediate durability.
# ---------------------------------------------------------------------------
replace_once(
    "lib/workspace-context-v5.tsx",
    'import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";',
    'import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '''  const [data, setData] = useState<WorkspaceData>(() => production ? hydrateProductionWorkspace(directory ?? []) : createNormalizedDemoData());
  const [demoUserId, setDemoUserId] = useState<string | null>(null);''',
    '''  const [data, setData] = useState<WorkspaceData>(() => production ? hydrateProductionWorkspace(directory ?? []) : createNormalizedDemoData());
  const dataRef = useRef(data);
  const commitWorkspaceData = (next: WorkspaceData) => {
    dataRef.current = next;
    momentumStorage.setItem(DATA_KEY, JSON.stringify(next));
    setData(next);
    return momentumStorage.flushAndConfirm(DATA_KEY);
  };
  const [demoUserId, setDemoUserId] = useState<string | null>(null);''',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '  const currentUserId = production ? firebase?.session?.uid ?? null : demoUserId;\n',
    '  const currentUserId = production ? firebase?.session?.uid ?? null : demoUserId;\n  useEffect(() => { dataRef.current = data; }, [data]);\n',
)
replace_once(
    "lib/workspace-context-v5.tsx",
    '  useRemoteStorageSync(DATA_KEY, () => { if (production) setData(hydrateProductionWorkspace(directory ?? [])); });',
    '  useRemoteStorageSync(DATA_KEY, () => { if (production) { const next = hydrateProductionWorkspace(directory ?? []); dataRef.current = next; setData(next); } });',
)

old_base_status='''  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {
    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;
    setData((current) => {
      const order = current.orders.find((item) => item.id === id);
      if (!order || nextFulfillment[order.status] !== status) return current;
      return { ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };
    });
  }, [currentUser]);
'''
new_base_status='''  const setOrderStatus = useCallback((id: string, status: OrderStatus) => {
    if (!currentUser || !canAdvanceFulfillment(currentUser)) return;
    const current = dataRef.current;
    const order = current.orders.find((item) => item.id === id);
    if (!order || nextFulfillment[order.status] !== status) return;
    const next = { ...current, orders: current.orders.map((item) => item.id === id ? { ...item, status, paymentStatus: status === "Delivered" && item.paymentStatus === "Not invoiced" ? "Open" : item.paymentStatus } : item) };
    void commitWorkspaceData(next);
  }, [currentUser]);
'''
replace_once("lib/workspace-context-v5.tsx", old_base_status, new_base_status)

# Rewrite the base approval setter generically between stable function anchors.
p = Path("lib/workspace-context-v5.tsx")
s = p.read_text()
start = s.find('  const decideApproval = useCallback((id: string, decision: "Approved" | "Returned") => {')
end = s.find('  const resolveInventoryHold =', start)
if start < 0 or end < 0:
    raise SystemExit("Base approval function anchors not found")
old = s[start:end]
if 'commitWorkspaceData(next)' not in old:
    new = '''  const decideApproval = useCallback((id: string, decision: "Approved" | "Returned") => {
    if (!currentUser) return;
    const current = dataRef.current;
    const approval = current.approvals.find((item) => item.id === id);
    if (!approval || approval.status !== "Pending" || !canReviewApproval(current, currentUser, approval)) return;
    const decidedAt = nowStamp();
    const next: WorkspaceData = {
      ...current,
      approvals: current.approvals.map((item) => item.id === id ? { ...item, status: decision, decidedBy: currentUser.id, decidedAt } : item),
      orders: current.orders.map((order) => ["Order", "Low stock sale"].includes(approval.type) && (order.id === approval.recordId || approval.title.includes(order.number)) ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" } : order),
    };
    void commitWorkspaceData(next);
  }, [currentUser]);

'''
    p.write_text(s[:start] + new + s[end:])

# ---------------------------------------------------------------------------
# Approval UX: the order creator must be visible, even when a later editor or
# approval requester is somebody else.
# ---------------------------------------------------------------------------
replace_once(
    "components/pages/work-v2.tsx",
    '  const approvalCard=(approval:Approval)=>{const Icon=iconFor(approval.type);const requester=data.users.find((user)=>user.id===approval.requesterId);const allowed=canReviewApproval(data,currentUser,approval);return <article className="approval-card" key={approval.id}>',
    '  const approvalCard=(approval:Approval)=>{const Icon=iconFor(approval.type);const requester=data.users.find((user)=>user.id===approval.requesterId);const linkedOrder=orderApproval(approval.type)?scope.orders.find((order)=>order.id===approval.recordId):undefined;const orderCreator=linkedOrder?data.users.find((user)=>user.id===linkedOrder.ownerId):undefined;const allowed=canReviewApproval(data,currentUser,approval);return <article className="approval-card" key={approval.id}>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<span>Submitted by {approval.requestedBy}</span>',
    '<span>{linkedOrder?`Placed by ${orderCreator?.name??linkedOrder.ownerId}`:`Submitted by ${approval.requestedBy}`}</span>',
)
replace_once(
    "components/pages/work-v2.tsx",
    '<div><span>Submitted by</span><strong>{reviewApproval.requestedBy}</strong></div><div><span>Sales rep</span><strong>{reviewSalesRep?.name??"Not recorded on this order"}</strong></div>',
    '<div><span>Placed by</span><strong>{data.users.find((user)=>user.id===reviewOrder.ownerId)?.name??reviewOrder.ownerId}</strong></div><div><span>Sales credit</span><strong>{reviewSalesRep?.name??"Not recorded on this order"}</strong></div><div><span>Approval submitted by</span><strong>{reviewApproval.requestedBy}</strong></div>',
)

# Regression tests for the exact production incident.
replace_once(
    "tests/production-record-consistency.test.ts",
    'test("Delivery Driver invoice access is read-only in the persistence domain",()=>{',
    '''test("critical approval and fulfillment changes enter persistence before cloud confirmation is checked",()=>{
  const commercial=readFileSync("lib/workspace-context.tsx","utf8");
  const base=readFileSync("lib/workspace-context-v5.tsx","utf8");
  assert.match(commercial,/const commitCommercialState =/);
  assert.match(commercial,/momentumStorage\.setItem\(COMMERCIAL_KEY, JSON\.stringify\(next\)\)/);
  assert.match(commercial,/void commitCommercialState\(next\)/);
  assert.match(base,/const commitWorkspaceData =/);
  assert.match(base,/momentumStorage\.setItem\(DATA_KEY, JSON\.stringify\(next\)\)/);
  assert.match(base,/void commitWorkspaceData\(next\)/);
});

test("approval review identifies the original order creator separately from later approval submitters",()=>{
  const work=readFileSync("components/pages/work-v2.tsx","utf8");
  assert.match(work,/Placed by/);
  assert.match(work,/Approval submitted by/);
  assert.match(work,/Sales credit/);
  assert.match(work,/linkedOrder\.ownerId/);
});

test("Delivery Driver invoice access is read-only in the persistence domain",()=>{''',
)

print("Production record durability patch applied.")
