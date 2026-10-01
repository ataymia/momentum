from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path:str,old:str,new:str)->None:
    p=ROOT/path
    text=p.read_text()
    if new in text:return
    count=text.count(old)
    if count!=1:raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:220]!r}")
    p.write_text(text.replace(old,new,1))

replace_once(
    "components/app-shell-v4.tsx",
    'for (const order of scope.orders.filter((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); return `${order.number} ${account?.name ?? ""} ${account?.locationName ?? ""}`.toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `order-${order.id}`, type: "Order", title: order.number, detail: `${order.cases} cases · ${order.status}`, page: "orders", focus: order.id, icon: "order" });',
    'for (const order of scope.orders.filter((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); const placedBy=data.users.find((user)=>user.id===order.ownerId); return `${order.number} ${account?.name ?? ""} ${account?.locationName ?? ""} ${placedBy?.name??order.ownerId}`.toLowerCase().includes(normalized); }).slice(0, 5)) { const placedBy=data.users.find((user)=>user.id===order.ownerId); searchResults.push({ id: `order-${order.id}`, type: "Order", title: order.number, detail: `${order.cases} cases · ${order.status} · Placed by ${placedBy?.name??order.ownerId}`, page: "orders", focus: order.id, icon: "order" }); }'
)
replace_once(
    "components/app-shell-v4.tsx",
    'for (const invoice of commerce.invoices.filter((invoice) => scope.orders.some((order) => order.id === invoice.orderId)).filter((invoice) => { const order = scope.orders.find((item) => item.id === invoice.orderId); const account = scope.accounts.find((item) => item.id === invoice.accountId); return [invoice.number, order?.number, account?.name, invoice.status].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `invoice-${invoice.id}`, type: "Invoice", title: invoice.number, detail: `${invoice.status} · ${invoice.total.toFixed(2)}`, page: "orderCash", focus: invoice.orderId, icon: "invoice" });',
    'for (const invoice of commerce.invoices.filter((invoice) => scope.orders.some((order) => order.id === invoice.orderId)).filter((invoice) => { const order = scope.orders.find((item) => item.id === invoice.orderId); const account = scope.accounts.find((item) => item.id === invoice.accountId); const placedBy=data.users.find((user)=>user.id===order?.ownerId); return [invoice.number, order?.number, account?.name, invoice.status, placedBy?.name].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) { const order=scope.orders.find((item)=>item.id===invoice.orderId); const placedBy=data.users.find((user)=>user.id===order?.ownerId); searchResults.push({ id: `invoice-${invoice.id}`, type: "Invoice", title: invoice.number, detail: `${invoice.status} · ${invoice.total.toFixed(2)} · Placed by ${placedBy?.name??order?.ownerId??"Not recorded"}`, page: "orderCash", focus: invoice.orderId, icon: "invoice" }); }'
)
replace_once(
    "tests/production-record-consistency.test.ts",
    '  const marketing=readFileSync("components/pages/marketing.tsx","utf8");\n  assert.match(dashboard,/Placed by/);\n  assert.match(inventory,/Placed by/);\n  assert.match(marketing,/Placed by/);',
    '  const marketing=readFileSync("components/pages/marketing.tsx","utf8");\n  const search=readFileSync("components/app-shell-v4.tsx","utf8");\n  assert.match(dashboard,/Placed by/);\n  assert.match(inventory,/Placed by/);\n  assert.match(marketing,/Placed by/);\n  assert.match(search,/Placed by/);'
)
print("Global order creator visibility patch applied.")
