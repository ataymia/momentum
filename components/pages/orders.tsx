"use client";

import {
  AlertCircle,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { OrderStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

const lifecycle: OrderStatus[] = [
  "Draft",
  "Awaiting approval",
  "Approved",
  "Allocated",
  "Out for delivery",
  "Delivered",
  "Paid",
];

const toneForOrder = (status: OrderStatus) => {
  if (status === "Paid" || status === "Delivered") return "success" as const;
  if (status === "Awaiting approval") return "warning" as const;
  if (status === "Draft") return "neutral" as const;
  return "info" as const;
};

export function OrdersPage() {
  const { data, createOrder, setOrderStatus, navigate } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(data.orders[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ accountId: data.accounts[0]?.id ?? "", cases: 10, pricePerCase: 24 });

  const orders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.orders.filter((order) => {
      const account = data.accounts.find((item) => item.id === order.accountId);
      return !normalized || `${order.number} ${account?.name} ${order.status}`.toLowerCase().includes(normalized);
    });
  }, [data.accounts, data.orders, query]);

  const selected = data.orders.find((order) => order.id === selectedId) ?? orders[0];
  const selectedAccount = data.accounts.find((account) => account.id === selected?.accountId);
  const openValue = data.orders.filter((order) => order.paymentStatus !== "Paid").reduce((sum, order) => sum + order.amount, 0);
  const deliveredCases = data.orders.filter((order) => ["Delivered", "Paid"].includes(order.status)).reduce((sum, order) => sum + order.cases, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = createOrder(form);
    setSelectedId(id);
    setCreateOpen(false);
  };

  const currentIndex = selected ? lifecycle.indexOf(selected.status) : -1;
  const nextStatus = currentIndex >= 0 && currentIndex < lifecycle.length - 1 ? lifecycle[currentIndex + 1] : null;

  return (
    <div className="page page--orders">
      <PageHeader
        eyebrow="Commercial operations"
        title="Orders"
        description="Controlled handoff from proposed terms to delivery, collection, and reorder."
        actions={<Button variant="gold" icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>Draft order</Button>}
      />

      <div className="order-stats">
        <div><span><ReceiptText size={18} /></span><div><small>Demo orders</small><strong>{data.orders.length}</strong></div></div>
        <div><span><CircleDollarSign size={18} /></span><div><small>Open amount</small><strong>{formatMoney(openValue)}</strong></div></div>
        <div><span><Truck size={18} /></span><div><small>Delivered cases</small><strong>{deliveredCases}</strong></div></div>
        <div className="order-stats__warning"><AlertCircle size={18} /><p>All prices are proposed demo terms—not approved quotes.</p></div>
      </div>

      <div className="orders-layout">
        <Section className="orders-list" title="Order register" description="Every order retains its own price snapshot">
          <label className="table-search order-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or account…" /></label>
          <div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span /></div>
          <div className="order-table-body">
            {orders.map((order) => {
              const account = data.accounts.find((item) => item.id === order.accountId);
              return (
                <button className={`order-table ${selected?.id === order.id ? "is-selected" : ""}`} key={order.id} onClick={() => setSelectedId(order.id)}>
                  <span><strong>{order.number}</strong><small>{formatDate(order.placedAt, { month: "short", day: "numeric" })}</small></span>
                  <span><strong>{account?.name}</strong><small>{order.priceBasis}</small></span>
                  <span>{order.cases}</span>
                  <span>{formatMoney(order.amount)}</span>
                  <span><StatusPill tone={toneForOrder(order.status)}>{order.status}</StatusPill></span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </Section>

        {selected && (
          <Section className="order-detail" title={selected.number} description={selectedAccount?.name} action={<StatusPill tone={toneForOrder(selected.status)}>{selected.status}</StatusPill>}>
            <div className="order-detail__body">
              <div className="order-price-card">
                <div><span>Order total</span><strong>{formatMoney(selected.amount)}</strong><small>{selected.cases} cases × {formatMoney(selected.pricePerCase)}</small></div>
                <span><FileText size={24} /></span>
              </div>

              <div className="order-lifecycle" aria-label="Order lifecycle">
                {lifecycle.map((status, index) => (
                  <div className={index <= currentIndex ? "is-complete" : ""} key={status}>
                    <span>{index < currentIndex ? <CheckCircle2 size={14} /> : index + 1}</span>
                    <small>{status}</small>
                  </div>
                ))}
              </div>

              <dl className="order-facts">
                <div><dt>Price basis</dt><dd>{selected.priceBasis}<StatusPill tone="warning" dot={false}>Proposed</StatusPill></dd></div>
                <div><dt>Payment</dt><dd>{selected.paymentStatus}</dd></div>
                <div><dt>Product</dt><dd>Golden Eagle · SKU pending verification</dd></div>
                <div><dt>Inventory</dt><dd>{["Approved", "Allocated", "Out for delivery", "Delivered", "Paid"].includes(selected.status) ? "Eligible for reservation" : "Not reserved"}</dd></div>
              </dl>

              {selected.status === "Awaiting approval" ? (
                <div className="order-approval-callout">
                  <ShieldCheck size={20} />
                  <div><strong>Controlled approval required</strong><p>The requested price cannot move into fulfillment until an authorized reviewer approves it.</p></div>
                  <Button size="sm" onClick={() => navigate("work")}>Review</Button>
                </div>
              ) : nextStatus ? (
                <Button size="lg" icon={<ArrowRight size={17} />} onClick={() => setOrderStatus(selected.id, nextStatus)}>
                  Move to {nextStatus.toLowerCase()}
                </Button>
              ) : (
                <div className="order-complete"><CheckCircle2 size={20} /><span>Paid record locked · eligible for compensation evaluation</span></div>
              )}
            </div>
          </Section>
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create demo draft order"
        description="This creates a linked order and approval request."
        onClose={() => setCreateOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="new-order-form">Create & submit</Button></>}
      >
        <form id="new-order-form" className="form-grid" onSubmit={submit}>
          <Field label="Customer account">
            <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
              {data.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </Field>
          <Field label="Cases"><input type="number" min="1" required value={form.cases} onChange={(event) => setForm({ ...form, cases: Number(event.target.value) })} /></Field>
          <Field label="Proposed price per case" hint="Demo only · commercial policy is not approved">
            <select value={form.pricePerCase} onChange={(event) => setForm({ ...form, pricePerCase: Number(event.target.value) })}>
              <option value={24}>$24 · proposed introductory/partner</option><option value={27}>$27 · proposed preferred</option><option value={30}>$30 · proposed standard</option>
            </select>
          </Field>
          <div className="order-preview"><Box size={20} /><div><span>Draft total</span><strong>{formatMoney(form.cases * form.pricePerCase)}</strong></div></div>
          <div className="form-callout form-callout--warning"><AlertCircle size={17} /><p>Creating this record does not quote or commit Golden Eagle to binding commercial terms.</p></div>
        </form>
      </Modal>
    </div>
  );
}
