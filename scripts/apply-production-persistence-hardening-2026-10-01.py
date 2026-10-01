from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read(path:str)->str:return (ROOT/path).read_text()
def write(path:str,text:str)->None:(ROOT/path).write_text(text)
def replace_once(path:str,old:str,new:str)->None:
    text=read(path);count=text.count(old)
    if count!=1:raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:220]!r}")
    write(path,text.replace(old,new,1))
def replace_between(path:str,start:str,end:str,new:str)->None:
    text=read(path);a=text.find(start)
    if a<0:raise SystemExit(f"{path}: start anchor missing: {start!r}")
    b=text.find(end,a+len(start))
    if b<0:raise SystemExit(f"{path}: end anchor missing: {end!r}")
    write(path,text[:a]+new+text[b:])

# Keep payment reconciliation under the exact same immediate persistence rule
# as create/edit/approve/cancel/fulfillment. This prevents a successful-looking
# UI mutation from existing only in React memory until a later effect happens.
replace_between(
    "lib/workspace-context.tsx",
    '  const reconcileOrderPayment = (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {',
    '  const importInventoryLots = (lots: InventoryLot[]) => {',
'''  const reconcileOrderPayment = (id: string, status: "Open" | "Partially paid" | "Paid", paidAt?: string) => {
    if (!canReconcileOrderPayment(currentUser)) return;
    if (status === "Paid" && paidAt !== undefined && !isValidCalendarDateKey(paidAt)) return;
    const order = commercial.orders.find((item) => item.id === id);
    if (!order) {
      base.reconcileOrderPayment(id, status, paidAt);
      return;
    }
    const becamePaid = status === "Paid" && order.paymentStatus !== "Paid";
    const lostPaid = order.paymentStatus === "Paid" && status !== "Paid";
    const paidStatusChanged = becamePaid || lostPaid;
    const rollup = paidStatusChanged ? paidAccountRollupAfterPayment(data, order.accountId, order.id, status) : undefined;
    const nextCommercial:CommercialState={
      ...commercial,
      orders:commercial.orders.map((item)=>item.id===id?{...item,paymentStatus:status,paidAt:status==="Paid"?paidAt??today():undefined}:item),
      accountPatches:paidStatusChanged&&rollup?{...commercial.accountPatches,[order.accountId]:{...(commercial.accountPatches[order.accountId]??{}),lastActivity:becamePaid?`Payment cleared for ${order.number}`:`Payment status changed for ${order.number}: ${status}`,lifetimeCases:rollup.lifetimeCases,reorderCount:rollup.reorderCount}}:commercial.accountPatches,
      activities:paidStatusChanged?[{id:uid(becamePaid?"act-paid":"act-payment-reversal"),accountId:order.accountId,type:"order",title:becamePaid?"Payment cleared":"Cleared payment reduced or reversed",detail:becamePaid?`${order.number} settled. Credit remains with ${order.creditedRepId?data.users.find((user)=>user.id===order.creditedRepId)?.name??"the creating rep":"the recorded order source"}.`:`${order.number} changed from Paid to ${status}. Paid-case totals, pricing eligibility, sales incentives, and downstream payroll must revalidate from the revised source state.`,at:now(),userId:currentUser!.id},...commercial.activities]:commercial.activities,
    };
    momentumStorage.setItem(COMMERCIAL_KEY,JSON.stringify(nextCommercial));
    setCommercial(nextCommercial);
    void momentumStorage.flush();
  };

''')

# Order creator visibility on the remaining concrete order surfaces.
replace_once("components/pages/dashboard.tsx",'  const { scope, currentUser, navigate } = useWorkspace();','  const { data, scope, currentUser, navigate } = useWorkspace();')
replace_once("components/pages/dashboard.tsx",'<div><strong>{order.number}</strong><p>{order.cases} cases · {formatMoney(order.amount)}</p></div>','<div><strong>{order.number}</strong><p>{order.cases} cases · {formatMoney(order.amount)} · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</p></div>')
replace_once("components/inventory/inventory-ledger-panel-v2.tsx",'<p>{item.reason}{order ? ` · ${order.number}` : ""}</p>','<p>{item.reason}{order ? ` · ${order.number} · Placed by ${data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}` : ""}</p>')
replace_once("components/inventory/inventory-ledger-panel-v2.tsx",'<p>{location ? locationLabel(location) : "Location"}</p>{item.status==="Active"&&','<p>{location ? locationLabel(location) : "Location"}{order?` · Placed by ${data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}`:""}</p>{item.status==="Active"&&')
replace_once("components/inventory/inventory-ledger-panel-v2.tsx",'<option key={order.id} value={order.id}>{order.number} · {order.cases} cases</option>','<option key={order.id} value={order.id}>{order.number} · {order.cases} cases · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</option>')
replace_once("components/inventory/inventory-ledger-panel-v2.tsx",'<option key={order.id} value={order.id}>{order.number} · {order.cases - (reservedByOrder.get(order.id) ?? 0)} unreserved cases</option>','<option key={order.id} value={order.id}>{order.number} · {order.cases - (reservedByOrder.get(order.id) ?? 0)} unreserved cases · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</option>')
replace_once("components/pages/marketing.tsx",'data.orders.filter((order)=>order.accountId===accountId).map((order)=>({id:order.id,label:`${order.number} · ${order.cases} cases · ${order.paymentStatus}`}))','data.orders.filter((order)=>order.accountId===accountId).map((order)=>({id:order.id,label:`${order.number} · ${order.cases} cases · ${order.paymentStatus} · Placed by ${data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}`}))')

path="tests/production-record-consistency.test.ts";text=read(path)
append='''\n\ntest("every commercial order state mutation writes through the persistence boundary",()=>{\n  const workspace=readFileSync("lib/workspace-context.tsx","utf8");\n  assert.match(workspace,/Order approved[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);\n  assert.match(workspace,/nextFulfillment\\[order\\.status\\][\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY/);\n  assert.match(workspace,/const reconcileOrderPayment[\\s\\S]*momentumStorage\\.setItem\\(COMMERCIAL_KEY,JSON\\.stringify\\(nextCommercial\\)\\)/);\n});\n\ntest("secondary order surfaces identify who placed each concrete order",()=>{\n  const dashboard=readFileSync("components/pages/dashboard.tsx","utf8");\n  const inventory=readFileSync("components/inventory/inventory-ledger-panel-v2.tsx","utf8");\n  const marketing=readFileSync("components/pages/marketing.tsx","utf8");\n  assert.match(dashboard,/Placed by/);\n  assert.match(inventory,/Placed by/);\n  assert.match(marketing,/Placed by/);\n});\n'''
if 'every commercial order state mutation writes through the persistence boundary' not in text:write(path,text+append)
print("Production persistence hardening patch applied.")
