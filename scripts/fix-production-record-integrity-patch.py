from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{path}: patch anchor missing: {old[:300]!r}")
    p.write_text(text.replace(old, new, 1))


# The main production-integrity patch intentionally coalesces delivery imports.
# Keep the inventory storage key import because delivery cloud confirmation checks it.
p = ROOT / "components/pages/deliveries.tsx"
text = p.read_text()
inventory_import = 'import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";\n'
anchor = 'import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";\n'
if inventory_import not in text:
    if anchor not in text:
        raise SystemExit("deliveries.tsx: workspace import anchor missing")
    text = text.replace(anchor, anchor + inventory_import, 1)
p.write_text(text)

# Account order history is another real order surface. Show the immutable order creator there too.
patch(
    "components/pages/accounts.tsx",
    '<span><strong>{order.number}</strong><small>{order.product??"Golden Eagle"}</small></span><span>{formatDate(order.placedAt,{month:"short",day:"numeric",year:"numeric"})}</span>',
    '<span><strong>{order.number}</strong><small>{order.product??"Golden Eagle"} · Placed by {data.users.find((user)=>user.id===order.ownerId)?.name??order.ownerId}</small></span><span>{formatDate(order.placedAt,{month:"short",day:"numeric",year:"numeric"})}</span>',
)

# Avoid a hooks dependency warning from deriving a synthetic key for an array prop.
p = ROOT / "components/finance/invoice-print-center.tsx"
text = p.read_text()
text = text.replace(
    '  const allowedKey=allowedOrderIds?.join("|")??"";\n  const orderIds = useMemo(() => {const scoped=new Set(scope.orders.map((order)=>order.id));return new Set(allowedOrderIds?allowedOrderIds.filter((id)=>scoped.has(id)):[...scoped]);}, [scope.orders,allowedKey]);\n',
    '  const orderIds = useMemo(() => {const scoped=new Set(scope.orders.map((order)=>order.id));return new Set(allowedOrderIds?allowedOrderIds.filter((id)=>scoped.has(id)):[...scoped]);}, [scope.orders,allowedOrderIds]);\n',
)
p.write_text(text)

# Extend the regression guard so the account-level order history cannot lose attribution later.
p = ROOT / "tests/platform-critical-invariants.test.ts"
text = p.read_text()
needle = '    const invoices=readFileSync(new URL("../components/finance/invoice-print-center.tsx",import.meta.url),"utf8");\n    const domains=readFileSync(new URL("../lib/firestore-domains.ts",import.meta.url),"utf8");\n'
replacement = needle + '    const accounts=readFileSync(new URL("../components/pages/accounts.tsx",import.meta.url),"utf8");\n'
if replacement not in text:
    if needle not in text:
        raise SystemExit("platform-critical-invariants.test.ts: attribution test anchor missing")
    text = text.replace(needle, replacement, 1)
assertion = '    assert.match(invoices,/Placed by/);\n'
if '    assert.match(accounts,/Placed by/);\n' not in text:
    if assertion not in text:
        raise SystemExit("platform-critical-invariants.test.ts: invoice attribution assertion missing")
    text = text.replace(assertion, assertion + '    assert.match(accounts,/Placed by/);\n', 1)
p.write_text(text)

print("Production integrity follow-up patch applied.")
