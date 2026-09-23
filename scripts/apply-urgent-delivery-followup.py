from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    s = p.read_text()
    if old not in s:
        if new and new in s:
            return
        raise SystemExit(f"FOLLOWUP FAILED: expected text not found in {path}: {old[:180]}")
    p.write_text(s.replace(old, new, 1))
    print(f"patched {path}")


# Remove dependency checks that can delete a valid record when another Firestore
# field document arrives slightly later in another browser.
replace_once(
    "lib/workspace-normalization.ts",
    '    if (sourcePlacementId && !placementIds.has(sourcePlacementId)) return [];\n',
    '',
)
replace_once(
    "lib/workspace-normalization.ts",
    '    if (recordId && ["Order", "Low stock sale", "Price exception"].includes(type) && !orderIds.has(recordId)) return [];\n    if (recordId && type === "Territory exception" && !accountIds.has(recordId)) return [];\n    if (recordId && type === "Timecard" && !timecardIds.has(recordId)) return [];\n    if (recordId && type === "Inventory adjustment" && !inventoryIds.has(recordId)) return [];\n',
    '',
)

# The IDs below become intentionally unused after the eventual-consistency fix.
for old in [
    '  const placementIds = new Set(placements.map((placement) => placement.id));\n',
    '  const orderIds = new Set(orders.map((order) => order.id));\n',
    '  const inventoryIds = new Set(inventory.map((lot) => lot.id));\n',
    '  const timecardIds = new Set(timecards.map((card) => card.id));\n',
]:
    p = ROOT / "lib/workspace-normalization.ts"
    s = p.read_text()
    if old in s:
        p.write_text(s.replace(old, '', 1))
        print("cleaned lib/workspace-normalization.ts")

for old in [
    '  const orderIds = new Set(orders.map((order) => order.id));\n',
    '  const placementById = new Map(data.placements.map((placement) => [placement.id, placement]));\n',
]:
    p = ROOT / "lib/commercial-state.ts"
    s = p.read_text()
    if old in s:
        p.write_text(s.replace(old, '', 1))
        print("cleaned lib/commercial-state.ts")

# Delivery drivers can review inventory but must not see a hold-resolution button
# that their role cannot execute.
p = ROOT / "components/pages/inventory.tsx"
s = p.read_text()
old = '{selectedLot.status === "Quality hold" && <button onClick={() => setHoldOpen(true)}><ShieldAlert size={16} /> Resolve hold</button>}'
new = '{selectedLot.status === "Quality hold" && currentUser && ["Administrator","Operations"].includes(currentUser.role) && <button onClick={() => setHoldOpen(true)}><ShieldAlert size={16} /> Resolve hold</button>}'
if old in s:
    p.write_text(s.replace(old, new, 1))
    print("patched components/pages/inventory.tsx")
elif new not in s:
    raise SystemExit("FOLLOWUP FAILED: inventory hold control pattern not found")

print("PASS: follow-up cleanup applied.")
