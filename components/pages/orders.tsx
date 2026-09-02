"use client";

import { AlertCircle, ArrowRight, Box, CheckCircle2, ChevronRight, CircleDollarSign, Copy, FileText, PackageSearch, Plus, ReceiptText, Search, ShieldAlert, Store, Truck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { canAdvanceFulfillment, canCreateOrder, isCustomer } from "../../lib/access";
import { productInventoryStatus } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { evaluatePartnerPricing } from "../../lib/pricing-engine";
import type { OrderStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

const lifecycle: OrderStatus[] = ["Draft","Awaiting approval","Approved","Allocated","Out for delivery","Delivered","Paid"];
const fulfillmentNext: Partial<Record<OrderStatus, OrderStatus>> = { Approved:"Allocated", Allocated:"Out for delivery", "Out for delivery":"Delivered" };
const toneForOrder = (status: OrderStatus) => status === "Paid" || status === "Delivered" ? "success" as const : status === "Awaiting approval" ? "warning" as const : status === "Draft" ? "neutral" as const : "info" as const;
const pricingTone = (status: string) => status === "Partner pricing" || status === "Intro partner pricing" ? "success" as const : status === "Standard pricing" ? "warning" as const : "info" as const;

export function OrdersPage() {
  const { data, scope, currentUser, createOrder, setOrderStatus, navigate } = useWorkspace();
  const { ledger } = useInventoryLedger();
  const focusId = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-focus-record") : null;
  const intent = typeof window !== "undefined" ? window.sessionStorage.getItem("momentum-order-intent") : null;
  const focusedOrder = scope.orders.find(order => order.id === focusId);
  const focusedAccount = scope.accounts.find(account => account.id === focusId);
  const focusedAccountOrder = scope.orders.find(order => order.accountId === focusId);
  const initialAccountId = focusedAccount?.id ?? scope.accounts[0]?.id ?? "";
  const products = [...new Set(data.inventory.map((lot) => lot.product))].sort();
  const initialProduct = focusedOrder?.product ?? products[0] ?? "Golden Eagle";
  const initialPricing = initialAccountId ? evaluatePartnerPricing(data, initialAccountId) : null;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(focusedOrder?.id ?? focusedAccountOrder?.id ?? scope.orders[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(intent === "new-order");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ accountId:initialAccountId, product:initialProduct, cases:10, pricePerCase:initialPricing?.currentPricePerCase ?? 0 });
  const customerMode = isCustomer(currentUser);
  const canFulfill = canAdvanceFulfillment(currentUser);
  const canReview = currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager";
  const formPricing = form.accountId ? evaluatePartnerPricing(data, form.accountId) : null;
  const tierPriceLocked = Boolean(formPricing?.currentPricePerCase);
  const stock = form.product ? productInventoryStatus(ledger,data,form.product) : null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("momentum-focus-record");
      window.sessionStorage.removeItem("momentum-order-intent");
    }
  }, [focusId, intent]);

  const orders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return scope.orders.filter((order) => {
      const account = scope.accounts.find((item) => item.id === order.accountId);
      return !normalized || `${order.number} ${account?.name} ${account?.locationName ?? ""} ${order.product ?? ""} ${order.status}`.toLowerCase().includes(normalized);
    });
  }, [query, scope.accounts, scope.orders]);

  const selected = scope.orders.find((order) => order.id === selectedId) ?? orders[0];
  const selectedAccount = scope.accounts.find((account) => account.id === selected?.accountId);
  const selectedPricing = selectedAccount ? evaluatePartnerPricing(data, selectedAccount.id) : null;
  const selectedStock = selected?.product ? productInventoryStatus(ledger,data,selected.product) : null;
  const creditedRep = selected ? data.users.find((user) => user.id === (selected.creditedRepId ?? selected.ownerId) && user.role === "Sales Representative") : undefined;
  const openValue = scope.orders.filter((order) => order.paymentStatus !== "Paid").reduce((sum,order) => sum + order.amount,0);
  const deliveredCases = scope.orders.filter((order) => ["Delivered","Paid"].includes(order.status)).reduce((sum,order) => sum + order.cases,0);
  const currentIndex = selected ? lifecycle.indexOf(selected.status) : -1;
  const nextStatus = selected ? fulfillmentNext[selected.status] ?? null : null;
  const canCorrect = Boolean(selected && currentUser && (selected.ownerId === currentUser.id || currentUser.role === "Administrator"));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.product) { setFormError("Select a product."); return; }
    if (!customerMode && (!form.pricePerCase || form.pricePerCase <= 0) && !formPricing?.currentPricePerCase) { setFormError("Assign an A/B/C pricing tier on the account or enter an authorized price before submitting."); return; }
    const lockedPrice = formPricing?.currentPricePerCase;
    const id = createOrder({ accountId:form.accountId, product:form.product, cases:form.cases, pricePerCase:lockedPrice ?? form.pricePerCase, inventoryAvailableAtOrder:stock?.available });
    if (!id) { setFormError(customerMode ? "A current account price is required for this reorder." : "Choose an account, product, quantity, and valid account price."); return; }
    setSelectedId(id); setCreateOpen(false); setFormError("");
  };
  const createCorrectedReplacement = () => {
    if (!selected || !canCorrect) return;
    const pricing = evaluatePartnerPricing(data, selected.accountId);
    const product = selected.product ?? products[0] ?? "Golden Eagle";
    const available = productInventoryStatus(ledger,data,product).available;
    const id = createOrder({ accountId:selected.accountId, product, cases:selected.cases, pricePerCase:pricing.currentPricePerCase ?? selected.pricePerCase, inventoryAvailableAtOrder:available });
    if (!id) { setFormError("This returned order could not be resubmitted from the current role."); return; }
    setSelectedId(id);
  };
  const openDraft = (order?: typeof selected) => {
    const accountId = order?.accountId ?? focusedAccount?.id ?? scope.accounts[0]?.id ?? "";
    const pricing = accountId ? evaluatePartnerPricing(data, accountId) : null;
    const product = order?.product ?? products[0] ?? "Golden Eagle";
    setForm({ accountId, product, cases:order?.cases ?? 10, pricePerCase:pricing?.currentPricePerCase ?? order?.pricePerCase ?? 0 });
    setCreateOpen(true); setFormError("");
  };
  const changeOrderAccount = (accountId: string) => {
    const pricing = evaluatePartnerPricing(data, accountId);
    setForm(current => ({ ...current, accountId, pricePerCase:pricing.currentPricePerCase ?? 0 }));
    setFormError("");
  };

  return <div className="page page--orders">
    <PageHeader title={customerMode ? "My orders" : "Orders"} actions={canCreateOrder(currentUser) ? <Button variant="gold" icon={<Plus size={17} />} onClick={()=>openDraft()}>{customerMode ? "Place order" : "Draft order"}</Button> : undefined}/>
    <div className="order-stats"><div><span><ReceiptText size={18} /></span><div><small>{customerMode ? "Your orders" : "Orders in scope"}</small><strong>{scope.orders.length}</strong></div></div><div><span><CircleDollarSign size={18} /></span><div><small>Open amount</small><strong>{formatMoney(openValue)}</strong></div></div><div><span><Truck size={18} /></span><div><small>Delivered cases</small><strong>{deliveredCases}</strong></div></div><div><span><PackageSearch size={18}/></span><div><small>Products tracked</small><strong>{products.length}</strong></div></div></div>
    <div className="orders-layout"><Section className="orders-list" title="Order register"><label className="table-search order-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, account, or product…" /></label><div className="order-table order-table--head"><span>Order</span><span>Customer</span><span>Cases</span><span>Amount</span><span>Status</span><span /></div><div className="order-table-body">{orders.map((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); return <button className={`order-table ${selected?.id === order.id ? "is-selected" : ""}`} key={order.id} onClick={() => setSelectedId(order.id)}><span><strong>{order.number}</strong><small>{order.product ?? "Golden Eagle"}</small></span><span><strong>{account?.name}</strong><small>{account?.locationName ?? account?.location}</small></span><span>{order.cases}</span><span>{formatMoney(order.amount)}</span><span><StatusPill tone={toneForOrder(order.status)}>{order.status}</StatusPill></span><ChevronRight size={16} /></button>; })}</div></Section>
      {selected && <Section className="order-detail" title={selected.number} action={<StatusPill tone={toneForOrder(selected.status)}>{selected.status}</StatusPill>}><div className="order-detail__body"><div className="order-price-card"><div><span>Order total</span><strong>{formatMoney(selected.amount)}</strong><small>{selected.cases} cases × {formatMoney(selected.pricePerCase)}</small></div><span><FileText size={24} /></span></div><div className="order-detail-actions">{canCreateOrder(currentUser)&&<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>openDraft(selected)}>Copy / reorder</Button>}</div><div className="order-lifecycle" aria-label="Order lifecycle">{lifecycle.map((status,index) => <div className={index <= currentIndex ? "is-complete" : ""} key={status}><span>{index < currentIndex ? <CheckCircle2 size={14} /> : index + 1}</span><small>{status}</small></div>)}</div><dl className="order-facts"><div><dt>Product</dt><dd>{selected.product ?? "Golden Eagle"}</dd></div><div><dt>Pricing tier</dt><dd>{selectedAccount?.pricingTier ? `${selectedAccount.pricingTier} · ${formatMoney(selected.pricePerCase)}/case` : selected.priceBasis}</dd></div><div><dt>Sales credit</dt><dd>{creditedRep?.name ?? "No sales rep credit"}</dd></div><div><dt>Payment</dt><dd>{selected.paymentStatus}</dd></div><div><dt>Available at submission</dt><dd>{selected.inventoryAvailableAtOrder ?? "Not recorded"}</dd></div><div><dt>Available now</dt><dd>{selectedStock?.available ?? "Not tracked"}</dd></div></dl>{selected.lowStockApprovalRequired&&<div className="order-stock-gate"><ShieldAlert size={20}/><div><strong>Low-stock manager approval</strong><p>This request was created while the product had fewer than 50 available sellable cases. It cannot proceed to fulfillment until an authorized manager approves the order.</p></div></div>}{selectedStock?.reorderNeeded&&<div className="order-stock-gate order-stock-gate--reorder"><PackageSearch size={20}/><div><strong>Warehouse reorder flag</strong><p>{selectedStock.available} available sellable cases remain. Management and warehouse should replenish below 500 cases.</p></div></div>}{selected.status === "Awaiting approval" ? <div className="order-approval-callout"><Store size={20} /><div><strong>{canReview ? "Approval required" : "Order is under review"}</strong><p>{selected.lowStockApprovalRequired ? "The reviewer must verify low-stock availability before authorizing fulfillment." : "An authorized reviewer must approve the order before fulfillment begins."}</p></div>{canReview && <Button size="sm" onClick={() => navigate("work")}>Review</Button>}</div> : selected.status === "Draft" ? <div className="order-approval-callout"><AlertCircle size={20}/><div><strong>Returned for correction</strong><p>The original request remains in history.</p></div>{canCorrect && <Button size="sm" onClick={createCorrectedReplacement}>Create corrected replacement</Button>}</div> : nextStatus && canFulfill ? <Button size="lg" icon={<ArrowRight size={17} />} onClick={() => setOrderStatus(selected.id,nextStatus)}>Move to {nextStatus.toLowerCase()}</Button> : nextStatus ? <div className="order-approval-callout"><Truck size={20}/><div><strong>Fulfillment in progress</strong><p>Authorized operations staff control order status. Warehouse staff manage inventory custody and reservations separately.</p></div></div> : selected.status === "Delivered" ? <div className="order-approval-callout"><CircleDollarSign size={20}/><div><strong>Delivery complete · payment pending</strong><p>Delivery does not mark the order paid.</p></div></div> : <div className="order-complete"><CheckCircle2 size={20} /><span>Paid record locked</span></div>}{formError && <p className="form-error" role="alert">{formError}</p>}</div></Section>}
    </div>
    <Modal open={createOpen} title={customerMode ? "Place order" : "Create order request"} onClose={() => { setCreateOpen(false); setFormError(""); }} footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="new-order-form">Submit</Button></>}><form id="new-order-form" className="form-grid" onSubmit={submit}><Field label={customerMode ? "Your account" : "Customer account"}><select value={form.accountId} onChange={(event) => changeOrderAccount(event.target.value)}>{scope.accounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.locationName ?? account.location}</option>)}</select></Field><Field label="Product"><select value={form.product} onChange={(event)=>setForm({...form,product:event.target.value})}>{products.map((product)=><option key={product}>{product}</option>)}</select></Field><Field label="Cases"><input type="number" min="1" required value={form.cases} onChange={(event) => setForm({ ...form, cases:Number(event.target.value) })} /></Field>{!customerMode && <Field label={tierPriceLocked ? "Account price per case" : "Authorized price per case"}><input type="number" min="0.01" step="0.01" required value={tierPriceLocked ? formPricing?.currentPricePerCase ?? "" : form.pricePerCase || ""} readOnly={tierPriceLocked} onChange={(event) => setForm({ ...form, pricePerCase:Number(event.target.value) })} /></Field>}<div className="partner-price-order-card"><Store size={18}/><div><small>Pricing</small><strong>{formPricing?.currentPricePerCase ? `${scope.accounts.find((account)=>account.id===form.accountId)?.pricingTier ? `Tier ${scope.accounts.find((account)=>account.id===form.accountId)?.pricingTier}` : formPricing.status}` : "Price not assigned"}</strong><p>{formPricing?.currentPricePerCase ? `${formatMoney(formPricing.currentPricePerCase)} per case` : "Assign A, B, or C on the account, or enter an authorized price."}</p></div>{formPricing?.currentPricePerCase&&<StatusPill tone={pricingTone(formPricing.status)}>{formatMoney(formPricing.currentPricePerCase)}</StatusPill>}</div>{stock&&<div className={`order-inventory-check ${stock.requiresManagerApproval?"is-critical":stock.reorderNeeded?"is-reorder":""}`}><Box size={19}/><div><span>Available sellable inventory</span><strong>{stock.available} cases</strong><small>{stock.requiresManagerApproval?"Manager approval required before this sale can proceed.":stock.reorderNeeded?"Warehouse reorder flag is active.":"Stock level does not trigger a threshold."}</small></div></div>}<div className="order-preview"><Box size={20} /><div><span>{customerMode ? "Requested quantity" : "Request total"}</span><strong>{customerMode ? `${form.cases} cases` : (formPricing?.currentPricePerCase ?? form.pricePerCase) > 0 ? formatMoney(form.cases * (formPricing?.currentPricePerCase ?? form.pricePerCase)) : "Price required"}</strong></div></div>{formError && <p className="form-error field--full" role="alert">{formError}</p>}{stock?.requiresManagerApproval&&<div className="form-callout form-callout--warning"><ShieldAlert size={17}/><p>Submitting creates an approval request. Do not represent this quantity as committed until management approves the low-stock sale.</p></div>}</form></Modal>
  </div>;
}
