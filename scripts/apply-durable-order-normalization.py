from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "lib/commercial-state.ts"
text = path.read_text()

old = '''    const owner = userById.get(ownerId);\n    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountId || !owner || (owner.role === "Customer" && !(owner.accountIds ?? []).includes(accountId)) || !wholePositive(cases) || !finite(price) || price <= 0 || !finite(amount) || amount < 0 || Math.abs(amount - cases * price) > 0.01 || !orderStatuses.has(status) || !paymentStatuses.has(paymentStatus) || !validDateOrInstant(raw.placedAt) || !text(raw.priceBasis) || !product || !finite(raw.inventoryAvailableAtOrder) || Number(raw.inventoryAvailableAtOrder) < 0) return [];\n'''
new = '''    const owner = userById.get(ownerId);\n    // Identity directory arrival is eventually consistent. A temporarily missing owner profile must never\n    // erase an otherwise valid business order. Customer ownership is enforced when the profile is present.\n    if (!id || baseOrderIds.has(id) || !text(raw.number) || !accountId || (owner?.role === "Customer" && !(owner.accountIds ?? []).includes(accountId)) || !wholePositive(cases) || !finite(price) || price <= 0 || !finite(amount) || amount < 0 || Math.abs(amount - cases * price) > 0.01 || !orderStatuses.has(status) || !paymentStatuses.has(paymentStatus) || !validDateOrInstant(raw.placedAt) || !text(raw.priceBasis) || !product || !finite(raw.inventoryAvailableAtOrder) || Number(raw.inventoryAvailableAtOrder) < 0) return [];\n'''
if new not in text:
    if old not in text:
        raise SystemExit("PATCH FAILED: owner dependency marker not found")
    text = text.replace(old, new, 1)

old = '''    const creditedRepId = optionalText(raw.creditedRepId); if (creditedRepId && !salesRepIds.has(creditedRepId)) return [];\n'''
new = '''    // Preserve recorded attribution even if the employee directory shard has not arrived yet. The durable\n    // server ledger binds new Sales Representative submissions to the authenticated Firebase UID.\n    const creditedRepId = optionalText(raw.creditedRepId);\n'''
if new not in text:
    if old not in text:
        raise SystemExit("PATCH FAILED: credited rep dependency marker not found")
    text = text.replace(old, new, 1)

path.write_text(text)
print("PASS: commercial order normalization no longer deletes records during directory sync gaps")
