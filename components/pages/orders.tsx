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
import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";
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
  const { scope, currentUser, createOrder, setOrderStatus, navigate } = useWorkspace();
  const [query, setQuery] = useState("");
  const focusId = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null;
  const focusedOrder = scope.orders.find(order => order.id === focusId);
  const focusedAccountOrder = scope.orders.find(order => order.accountId === focusId);
  const [selectedId, setSelectedId] = useState(focusedOrder?.id ?? focusedAccountOrder?.id ?? scope.orders[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ accountId: scope.accounts[0]?.id ?? "", cases: 10, pricePerCase: 24 });
  const customerMode = isCustomer(currentUser);
  const canFulfill = canAdvanceFulfillment(currentUser);
  const canReview = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";

  const orders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return scope.orders.filter((order) => {
      const account = scope.accounts.find((item) => item.id === order.accountId);
      return !normalized || `${order.number} ${account?.name} ${order.status}`.toLowerCase().includes(normalized);
    });
  }, [query, scope.accounts, scope.orders]);

  const selected = scope.orders.find((order) => order.id === selectedId) ?? orders[0];
  const selectedAccount = scope.accounts.find((account) => account.id === selected?.accountId);
  const openValue = scope.orders.filter((order) => order.paymentStatus !== "Paid").reduce((sum, order) => sum + order.amount, 0);
  const deliveredCases = scope.orders.filter((order) => ["Delivered", "Paid"].includes(order.status)).reduce((sum, order) => sum + order.cases, 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = createOrder(form);
    if (!id) { setFormError(customerMode ? "A prior delivered order price is required for this demo reorder." : "Choose an account and enter valid order quantities."); return; }
    setSelectedId(id);
    setCreateOpen(false);
    setFormError("");
  };

  const currentIndex = selected ? lifecycle.indexOf(selected.status) : -1;
  const nextStatus = currentIndex >= 0 && currentIndex < lifecycle.length - 1 ? lifecycle[currentIndex + 1] : null;

  return (
    <div className="page page--orders">
      <PageHeader
        eyebrow="Commercial operations"
        title={customerMode ? "My orders" : "Orders"}
        description={customerMode ? "Place an order and follow its status from review through delivery." : "Track orders from review through fulfillment, delivery, and payment."}
        actions={canCreateOrder(currentUser) ? <Button variant="gold" icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>{customerMode ? "Place order" : "Draft order"}</Button> : undefined}
      />

      <div className="order-stats">
        <div><span><ReceiptText size={18} /></span><div><small>{customerMode ? "Your orders" : "Orders in scope"}</small><strong>{scope.orders.length}</strong></div></div>
        <div><span><CircleDollarSign size={18} /></span><div><small>Open amount</small><strong>{formatMoney(openValue)}</strong></div></div>
        <div><span><Truck size={18} /></span><div><small>Delivered cases</small><strong>{deliveredCases}</strong></div></div>
        <div className="order-stats__warning"><AlertCircle size={18} /><p>{customerMode ? "Tour totals use the prior fictional order snapshot and remain subject to review." : "Tour prices are fictional entries. Production pricing will come from an approved price book or authorized exception."}</p></div>
      </div>

      <div className="orders-layout">
        <Section className="orders-list" title="Order register" description="Every order retains its own price snapshot">
          <label className="table-search order-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order or account…" /></label>
          <div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span /></div>
          <div className="order-table-body">
            {orders.map((order) => {
              const account = scope.accounts.find((item) => item.id === order.accountId);
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
                <div><dt>Price basis</dt><dd>{selected.priceBasis}<StatusPill tone="warning" dot={false}>Tour only</StatusPill></dd></div>
                <div><dt>Payment</dt><dd>{selected.paymentStatus}</dd></div>
                <div><dt>Product</dt><dd>Golden Eagle · tour SKU</dd></div>
                <div><dt>Inventory</dt><dd>{["Approved", "Allocated", "Out for delivery", "Delivered", "Paid"].includes(selected.status) ? "Eligible for reservation" : "Not reserved"}</dd></div>
              </dl>

              {selected.status === "Awaiting approval" ? (
                <div className="order-approval-callout">
                  <ShieldCheck size={20} />
                  <div><strong>{canReview ? "Controlled approval required" : "Order is under review"}</strong><p>{canReview ? "Open the approval and underlying order before making a decision." : "An authorized reviewer must approve the order before fulfillment begins."}</p></div>
                  {canReview && <Button size="sm" onClick={() => navigate("work")}>Review</Button>}
                </div>
              ) : nextStatus && canFulfill ? (
                <Button size="lg" icon={<ArrowRight size={17} />} onClick={() => setOrderStatus(selected.id, nextStatus)}>
                  Move to {nextStatus.toLowerCase()}
                </Button>
              ) : selected.status === "Draft" ? (
                <div className="order-approval-callout"><AlertCircle size={20}/><div><strong>Returned for correction</strong><p>The order owner must review the returned request before submitting a replacement.</p></div></div>
              ) : nextStatus ? (
                <div className="order-approval-callout"><Truck size={20}/><div><strong>Fulfillment in progress</strong><p>Only authorized operations staff can advance delivery and payment status.</p></div></div>
              ) : (
                <div className="order-complete"><CheckCircle2 size={20} /><span>Paid record locked · eligible for compensation evaluation</span></div>
              )}
            </div>
          </Section>
        )}
      </div>

      <Modal
        open={createOpen}
        title={customerMode ? "Place an order" : "Create draft order"}
        description={customerMode ? "Submit a reorder for the account linked to this login." : "This creates a linked order and approval request."}
        onClose={() => setCreateOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="new-order-form">Create & submit</Button></>}
      >
        <form id="new-order-form" className="form-grid" onSubmit={submit}>
          <Field label={customerMode ? "Your account" : "Customer account"}>
            <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
              {scope.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </Field>
          <Field label="Cases"><input type="number" min="1" required value={form.cases} onChange={(event) => setForm({ ...form, cases: Number(event.target.value) })} /></Field>
          {!customerMode && <Field label="Demo price per case" hint="Fictional tour value only">
            <input type="number" min="0.01" step="0.01" required value={form.pricePerCase} onChange={(event) => setForm({ ...form, pricePerCase: Number(event.target.value) })} />
          </Field>}
          <div className="order-preview"><Box size={20} /><div><span>{customerMode ? "Requested quantity" : "Draft total"}</span><strong>{customerMode ? `${form.cases} cases` : formatMoney(form.cases * form.pricePerCase)}</strong></div></div>
          {formError && <p className="form-error field--full" role="alert">{formError}</p>}
          <div className="form-callout form-callout--warning"><AlertCircle size={17} /><p>Creating this record does not quote or commit Golden Eagle to binding commercial terms.</p></div>
        </form>
      </Modal>
    </div>
  );
}
