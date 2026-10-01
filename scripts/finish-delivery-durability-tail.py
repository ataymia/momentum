from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Tail patch anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))

# The first delivery durability pass intentionally stops if exact UI spacing has drifted.
# Finish using the current production markup.
replace_once(
    "components/pages/deliveries.tsx",
    '          <div><span>Driver</span><strong>{detailDriver?.name ?? "Unassigned"}</strong><small>{detailTask?.status ?? "Not claimed"}</small></div>\n        </div>',
    '          <div><span>Driver</span><strong>{detailDriver?.name ?? "Unassigned"}</strong><small>{detailTask?.status ?? "Not claimed"}</small></div>\n          <div><span>Placed by</span><strong>{detailOrderCreator?.name ?? detailOrder.ownerId}</strong><small>{detailOrder.placedAt}</small></div>\n        </div>',
)

# Order register and full-order detail both identify the original creator.
replace_once(
    "components/pages/orders-v3.tsx",
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small></span><span>{o.cases}</span>',
    '<span><strong>{a?.name}</strong><small>{a?.locationName??a?.location}</small><small>Placed by {data.users.find((user)=>user.id===o.ownerId)?.name??o.ownerId}</small></span><span>{o.cases}</span>',
)
replace_once(
    "components/pages/orders-v3.tsx",
    '<div><span>Placed</span><strong>{selected.placedAt}</strong><small>{placedBy?.name??selected.ownerId}</small></div>',
    '<div><span>Placed by</span><strong>{placedBy?.name??selected.ownerId}</strong><small>{selected.placedAt}</small></div>',
)

print("Delivery tail patch applied.")
