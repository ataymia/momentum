from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "components/commerce/order-cash-panel-v2.tsx",
    '''              return <button id={`commerce-${invoice.id}`} key={invoice.id} className={`account-table ${selected?.id === invoice.id ? "is-selected" : ""} ${focusedInvoice?.id === invoice.id ? "is-focused" : ""}`} onClick={() => setSelectedId(invoice.id)}><span className="account-name-cell"><i><FileText size={17} /></i><span><strong>{invoice.number}</strong><small>{location ? locationLabel(location) : "Location"} · {order?.number}</small></span></span><span><StatusPill tone={invoiceTone(status)}>{status}</StatusPill></span><span>{formatMoney(invoice.total)}</span><span>{open > 0 ? `${formatMoney(open)} due` : "Settled"}</span></button>;''',
    '''              const placedBy = order ? data.users.find((user) => user.id === order.ownerId) : undefined;
              return <button id={`commerce-${invoice.id}`} key={invoice.id} className={`account-table ${selected?.id === invoice.id ? "is-selected" : ""} ${focusedInvoice?.id === invoice.id ? "is-focused" : ""}`} onClick={() => setSelectedId(invoice.id)}><span className="account-name-cell"><i><FileText size={17} /></i><span><strong>{invoice.number}</strong><small>{location ? locationLabel(location) : "Location"} · {order?.number} · Placed by {placedBy?.name ?? order?.ownerId ?? "Not recorded"}</small></span></span><span><StatusPill tone={invoiceTone(status)}>{status}</StatusPill></span><span>{formatMoney(invoice.total)}</span><span>{open > 0 ? `${formatMoney(open)} due` : "Settled"}</span></button>;''',
)

replace_once(
    "components/commerce/order-cash-panel-v2.tsx",
    '''          <div className="company-rule-facts"><div><span>Invoice</span><strong>{selected.number}</strong><small>{selectedOrder?.number}</small></div><div><span>Cleared</span><strong>{formatMoney(paid)}</strong><small>{pending > 0 ? `${formatMoney(pending)} pending` : "No pending settlement"}</small></div><div><span>Balance</span><strong>{formatMoney(balance)}</strong><small>{recordable < balance ? `${formatMoney(recordable)} still recordable` : arAgingBucket(selected, balance)}</small></div><div><span>Status</span><strong>{computedInvoiceStatus(commerce, selected)}</strong><small>{selected.terms}{selected.dueDate ? ` · due ${selected.dueDate}` : ""}</small></div></div>''',
    '''          <div className="company-rule-facts"><div><span>Invoice</span><strong>{selected.number}</strong><small>{selectedOrder?.number}</small></div><div><span>Placed by</span><strong>{selectedOrder ? data.users.find((user) => user.id === selectedOrder.ownerId)?.name ?? selectedOrder.ownerId : "Not recorded"}</strong><small>Original order creator</small></div><div><span>Cleared</span><strong>{formatMoney(paid)}</strong><small>{pending > 0 ? `${formatMoney(pending)} pending` : "No pending settlement"}</small></div><div><span>Balance</span><strong>{formatMoney(balance)}</strong><small>{recordable < balance ? `${formatMoney(recordable)} still recordable` : arAgingBucket(selected, balance)}</small></div><div><span>Status</span><strong>{computedInvoiceStatus(commerce, selected)}</strong><small>{selected.terms}{selected.dueDate ? ` · due ${selected.dueDate}` : ""}</small></div></div>''',
)

replace_once(
    "tests/production-record-consistency.test.ts",
    '''  const search=readFileSync("components/app-shell-v4.tsx","utf8");
  assert.match(dashboard,/Placed by/);
  assert.match(inventory,/Placed by/);
  assert.match(marketing,/Placed by/);
  assert.match(search,/Placed by/);''',
    '''  const search=readFileSync("components/app-shell-v4.tsx","utf8");
  const orderCash=readFileSync("components/commerce/order-cash-panel-v2.tsx","utf8");
  assert.match(dashboard,/Placed by/);
  assert.match(inventory,/Placed by/);
  assert.match(marketing,/Placed by/);
  assert.match(search,/Placed by/);
  assert.match(orderCash,/Placed by/);''',
)

print("Order creator coverage patch applied.")
