"use client";

import {
  Banknote,
  Box,
  CheckCircle2,
  Eye,
  Mail,
  MapPin,
  Megaphone,
  PackageCheck,
  PackageOpen,
  Phone,
  Route,
  Truck,
  UserCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { PaymentMethod } from "../../lib/commerce-engine";
import { DELIVERY_STORAGE_KEY, deliveryStatusForOrder, processedForDelivery, type DeliverySignaturePoint } from "../../lib/delivery-engine";
import { useDelivery } from "../../lib/delivery-context";
import { INVENTORY_LEDGER_STORAGE_KEY } from "../../lib/inventory-ledger";
import { orderLinesFor } from "../../lib/order-lines";
import { momentumStorage, useSyncStatus } from "../../lib/persistence";
import { useMarketing } from "../../lib/marketing-context";
import { COMMERCIAL_KEY, useWorkspace } from "../../lib/workspace-context";
import { DeliverySignaturePad } from "../delivery/signature-pad";
import { InvoicePrintCenter } from "../finance/invoice-print-center";
import { Button, Modal, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

const tone = (status: string) => status === "Delivered" ? "success" as const : status === "In transit" || status === "Loaded" ? "info" as const : status.includes("ready") || status === "Accepted" ? "warning" as const : "neutral" as const;
const fullAddress = (account: { streetAddress?: string; city?: string; state?: string; postalCode?: string; location: string }) => [account.streetAddress, account.city || account.location, account.state, account.postalCode].filter(Boolean).join(", ");
type CollectionDraft = { amount: string; method: PaymentMethod; reference: string };
const defaultCollection = (amount: number): CollectionDraft => ({ amount: amount > 0 ? amount.toFixed(2) : "", method: "Check", reference: "" });

export function DeliveriesPage() {
  const { data, currentUser, navigate } = useWorkspace();
  const marketing = useMarketing().state;
  const {
    state,
    taskForOrder,
    claimDelivery,
    assignDelivery,
    cancelDelivery,
    prepareDelivery,
    markLoaded,
    startDelivery,
    markDelivered,
    recordDeliveryCollection,
    addDeliveryNote,
  } = useDelivery();
  const sync = useSyncStatus();
  const [driverByOrder, setDriverByOrder] = useState<Record<string, string>>({});
  const [collectionDrafts, setCollectionDrafts] = useState<Record<string, CollectionDraft>>({});
  const [notice, setNotice] = useState("");
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [signingOrderId, setSigningOrderId] = useState<string | null>(null);
  const [signatureStrokes, setSignatureStrokes] = useState<DeliverySignaturePoint[][]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [signatureError, setSignatureError] = useState("");

  const isDriver = currentUser?.role === "Delivery Driver";
  const canManage = Boolean(currentUser && ["Administrator", "Operations"].includes(currentUser.role));
  const drivers = data.users.filter((user) => user.role === "Delivery Driver");
  const eligible = useMemo(() => data.orders.filter(processedForDelivery).sort((a, b) => b.placedAt.localeCompare(a.placedAt)), [data.orders]);
  const approvedMarketingRequests = useMemo(() => marketing.deliveryNotices.filter((request) => request.status === "Approved").sort((a, b) => b.approvedAt.localeCompare(a.approvedAt)), [marketing.deliveryNotices]);
  const visible = eligible.filter((order) => {
    const task = taskForOrder(order.id);
    if (!isDriver) return true;
    return !task || task.driverId === currentUser?.id;
  });
  const ready = visible.filter((order) => !taskForOrder(order.id) || taskForOrder(order.id)?.status === "Accepted");
  const active = visible.filter((order) => ["Loaded", "In transit"].includes(taskForOrder(order.id)?.status ?? ""));
  const complete = visible.filter((order) => taskForOrder(order.id)?.status === "Delivered");
  const run = async(result: { ok: boolean; message?: string }, success: string) => {if(!result.ok){setNotice(result.message??"The delivery update was not accepted.");return;}setNotice("Saving delivery change to Momentum cloud…");const checks=await Promise.all([momentumStorage.flushAndConfirm(DELIVERY_STORAGE_KEY),momentumStorage.flushAndConfirm(INVENTORY_LEDGER_STORAGE_KEY),momentumStorage.flushAndConfirm(COMMERCIAL_KEY)]);const failed=checks.find((item)=>!item.ok);setNotice(failed?`Change is still on this device but Momentum cloud has NOT confirmed every record. Do not repeat the action. ${failed.message??"Check the sync status."}`:success);};
  const openSignature = (orderId: string) => { setSigningOrderId(orderId); setSignatureStrokes([]); setRecipientName(""); setSignatureError(""); };
  const closeSignature = () => { setSigningOrderId(null); setSignatureStrokes([]); setRecipientName(""); setSignatureError(""); };
  const completeSignedDelivery = async () => {
    if (!signingOrderId) return;
    if (!signatureStrokes.some((stroke) => stroke.length >= 2)) { setSignatureError("Have the recipient sign in the box before completing the delivery."); return; }
    const order = data.orders.find((item) => item.id === signingOrderId);
    const result = markDelivered(signingOrderId, { strokes: signatureStrokes, recipientName });
    if (!result.ok) { setSignatureError(result.message ?? "The delivery could not be completed."); return; }
    closeSignature();
    await run(result, `${order?.number ?? "Delivery"} delivered. Signature saved to the delivery record and invoice.`);
  };
  const syncText = sync.lastError ? `Sync issue: ${sync.lastError}` : sync.pending || sync.flushing ? `Saving ${sync.pending || 1} change${sync.pending === 1 ? "" : "s"}…` : sync.mode === "firestore" ? "Cloud synced" : "Local demo";

  const card = (orderId: string) => {
    const order = data.orders.find((item) => item.id === orderId)!;
    const task = taskForOrder(order.id);
    const account = data.accounts.find((item) => item.id === order.accountId);
    const customer = account?.customerId ? (data.customers ?? []).find((item) => item.id === account.customerId) : undefined;
    const driver = task ? data.users.find((user) => user.id === task.driverId) : undefined;
    const placedBy = data.users.find((user) => user.id === order.ownerId);
    const status = deliveryStatusForOrder(state, order);
    const ownTask = Boolean(isDriver && task?.driverId === currentUser?.id);
    const selectedDriver = driverByOrder[order.id] ?? drivers[0]?.id ?? "";
    const lines = orderLinesFor(order);
    const linkedMarketing = approvedMarketingRequests.filter((request) => request.accountId === order.accountId);
    const collected = (task?.collections ?? []).reduce((sum, item) => sum + item.amount, 0);
    const remaining = Math.max(0, order.amount - collected);
    const collectionDraft = collectionDrafts[order.id] ?? defaultCollection(remaining);
    const canRecordCollection = Boolean((ownTask || canManage) && task && ["In transit", "Delivered"].includes(task.status) && remaining > 0);
    const updateCollection = (patch: Partial<CollectionDraft>) => setCollectionDrafts((current) => ({ ...current, [order.id]: { ...collectionDraft, ...patch } }));
    const saveCollection = () => {
      const result = recordDeliveryCollection(order.id, Number(collectionDraft.amount), collectionDraft.method, collectionDraft.reference);
      run(result, result.ok ? `${order.number} payment collection recorded for Finance reconciliation.` : "Payment collection was not saved.");
      if (result.ok) setCollectionDrafts((current) => ({ ...current, [order.id]: defaultCollection(Math.max(0, remaining - Number(collectionDraft.amount))) }));
    };

    return <article key={order.id} className="company-request-list__item delivery-card">
      <div className="delivery-card__header">
        <div className="delivery-card__identity">
          <small>{order.number}</small>
          <strong>{account?.locationName ?? account?.name ?? "Unknown customer"}</strong>
          <p><MapPin size={16} /> {account ? fullAddress(account) : "Location unavailable"}</p>
          {account?.phone && <p><Phone size={16} /> {account.phone}</p>}
        </div>
        <StatusPill tone={tone(status)}>{status}</StatusPill>
      </div>

      <div className="company-rule-facts delivery-card__facts">
        <div><span>Cases</span><strong>{order.cases}</strong><small>{lines.length} SKU{lines.length === 1 ? "" : "s"}</small></div>
        <div><span>Order total</span><strong>{formatMoney(order.amount)}</strong><small>{order.paymentStatus}</small></div>
        <div><span>Placed by</span><strong>{placedBy?.name ?? order.ownerId}</strong><small>Order creator</small></div>
        <div><span>Driver</span><strong>{driver?.name ?? "Unassigned"}</strong><small>{task ? "Claimed" : "Available to claim"}</small></div>
        <div><span>Terms</span><strong>{customer?.paymentTerms ?? "COD"}</strong><small>{collected > 0 ? `${formatMoney(collected)} collected · Finance pending` : `Order ${order.status}`}</small></div>
      </div>

      {linkedMarketing.length > 0 && <div className="delivery-marketing-alert"><Megaphone size={18} /><div><strong>Approved request for this location</strong>{linkedMarketing.map((request) => <p key={request.id}><b>{request.title}</b> · {request.detail}{request.neededBy ? ` · needed ${formatDate(request.neededBy, { month: "short", day: "numeric" })}` : ""}</p>)}</div></div>}

      <div className="delivery-card__actions">
        <Button type="button" size="sm" variant="secondary" icon={<Eye size={15} />} onClick={() => setDetailOrderId(order.id)}>View details</Button>
        {!task && isDriver && <Button type="button" size="sm" icon={<UserCheck size={15} />} onClick={() => run(claimDelivery(order.id), `${order.number} claimed. You can now pack it.`)}>Claim delivery</Button>}
        {!task && canManage && <><select value={selectedDriver} onChange={(event) => setDriverByOrder((current) => ({ ...current, [order.id]: event.target.value }))}>{drivers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><Button type="button" size="sm" disabled={!selectedDriver} onClick={() => run(assignDelivery(order.id, selectedDriver), `${order.number} assigned.`)}>Assign driver</Button></>}
        {task?.status === "Accepted" && (ownTask || canManage) && <>{order.status === "Approved" && <Button type="button" size="sm" icon={<PackageCheck size={15} />} onClick={() => run(prepareDelivery(order.id), `${order.number} packed and inventory reserved.`)}>Pack / reserve</Button>}{order.status === "Allocated" && <Button type="button" size="sm" icon={<PackageOpen size={15} />} onClick={() => run(markLoaded(order.id), `${order.number} loaded into driver custody.`)}>Mark loaded</Button>}<Button type="button" size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Why is this delivery assignment being released?")?.trim() ?? ""; if (reason) run(cancelDelivery(order.id, reason), `${order.number} returned to the delivery queue.`); }}>{ownTask ? "Release assignment" : "Cancel assignment"}</Button></>}
        {task?.status === "Loaded" && (ownTask || canManage) && <Button type="button" size="sm" icon={<Truck size={15} />} onClick={() => run(startDelivery(order.id), `${order.number} is now in transit.`)}>Start delivery</Button>}
        {task?.status === "In transit" && (ownTask || canManage) && <><Button type="button" size="sm" icon={<CheckCircle2 size={15} />} onClick={() => openSignature(order.id)}>Complete delivery & sign</Button><Button type="button" size="sm" variant="secondary" onClick={() => { const note = window.prompt("Add a delivery note")?.trim() ?? ""; if (note) run(addDeliveryNote(order.id, note), "Delivery note saved."); }}>Add note</Button></>}
      </div>

      {canRecordCollection && <div className="delivery-payment-collection">
        <label><small>Amount collected</small><input type="number" min="0.01" step="0.01" max={remaining} value={collectionDraft.amount} onChange={(event) => updateCollection({ amount: event.target.value })} /></label>
        <label><small>Payment method</small><select value={collectionDraft.method} onChange={(event) => updateCollection({ method: event.target.value as PaymentMethod })}><option>Cash</option><option>Check</option><option>ACH</option><option>Wire</option><option>Card</option><option>Other</option></select></label>
        <label><small>{collectionDraft.method === "Check" ? "Check number / reference" : "Reference / confirmation"}</small><input required={collectionDraft.method === "Check"} value={collectionDraft.reference} onChange={(event) => updateCollection({ reference: event.target.value })} placeholder={collectionDraft.method === "Check" ? "Required for checks" : "Optional unless available"} /></label>
        <Button type="button" size="sm" icon={<Banknote size={15} />} onClick={saveCollection}>Record collection</Button>
        <small style={{ gridColumn: "1/-1" }}>Records what the driver physically collected. Finance still reconciles settlement before the invoice becomes paid.</small>
      </div>}
    </article>;
  };

  const detailOrder = detailOrderId ? data.orders.find((item) => item.id === detailOrderId) : undefined;
  const detailTask = detailOrder ? taskForOrder(detailOrder.id) : undefined;
  const detailAccount = detailOrder ? data.accounts.find((item) => item.id === detailOrder.accountId) : undefined;
  const detailCustomer = detailAccount?.customerId ? (data.customers ?? []).find((item) => item.id === detailAccount.customerId) : undefined;
  const detailDriver = detailTask ? data.users.find((user) => user.id === detailTask.driverId) : undefined;
  const detailPlacedBy = detailOrder ? data.users.find((user) => user.id === detailOrder.ownerId) : undefined;
  const detailLines = detailOrder ? orderLinesFor(detailOrder) : [];
  const detailMarketing = detailOrder ? approvedMarketingRequests.filter((request) => request.accountId === detailOrder.accountId) : [];
  const detailCollected = (detailTask?.collections ?? []).reduce((sum, item) => sum + item.amount, 0);
  const detailStatus = detailOrder ? deliveryStatusForOrder(state, detailOrder) : "";

  return <>
    <div className="page page--deliveries">
      <PageHeader title={isDriver ? "My deliveries" : "Delivery operations"} description={isDriver ? "Claim approved orders, verify the exact SKU mix, collect delivery payment when required, and confirm delivery." : "Assign, monitor and reconcile the delivery queue."} actions={<StatusPill tone={sync.lastError ? "danger" : sync.pending || sync.flushing ? "warning" : "success"}>{syncText}</StatusPill>} />
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <div className="company-rule-facts"><div><span>Available / accepted</span><strong>{ready.length}</strong><small>Ready for driver action</small></div><div><span>Loaded / in transit</span><strong>{active.length}</strong><small>Active driver custody</small></div><div><span>Delivered</span><strong>{complete.length}</strong><small>Completed delivery records</small></div><div><span>Drivers</span><strong>{drivers.length}</strong><small>{drivers.length ? "Provisioned delivery users" : "No delivery drivers provisioned"}</small></div></div>

      {approvedMarketingRequests.length > 0 && <Section title="Approved marketing / delivery requests" description="Approved requests stay visible here and repeat on the matching delivery card."><div className="delivery-marketing-request-list">{approvedMarketingRequests.map((request) => { const account = request.accountId ? data.accounts.find((item) => item.id === request.accountId) : undefined; const requester = data.users.find((item) => item.id === request.requesterId); return <article key={request.id}><span><Megaphone size={17} /></span><div><small>{request.type}{request.neededBy ? ` · needed ${formatDate(request.neededBy, { month: "short", day: "numeric" })}` : ""}</small><strong>{request.title}</strong><p>{request.detail}</p><em>{account ? (account.locationName ?? account.name) : "No location linked"}{requester ? ` · requested by ${requester.name}` : ""}</em></div><StatusPill tone="warning">Approved</StatusPill></article>; })}</div></Section>}

      <InvoicePrintCenter allowedOrderIds={visible.map((order)=>order.id)} title={isDriver?"Delivery invoices":"Delivery-run invoices"} description="Print one invoice or a complete delivery batch directly from the delivery workspace."/>

      <Section title="Delivery queue" description="Each card shows the essentials. Use View details for the complete order, contacts, requests, payment record and delivery history."><div className="company-request-list">{visible.filter((order) => taskForOrder(order.id)?.status !== "Delivered").map((order) => card(order.id))}{visible.filter((order) => taskForOrder(order.id)?.status !== "Delivered").length === 0 && <div className="review-empty"><Route size={23} /><p>No active deliveries in your scope.</p></div>}</div></Section>
      {complete.length > 0 && <Section title="Completed deliveries"><div className="company-request-list">{complete.slice(0, 25).map((order) => card(order.id))}</div></Section>}
      {!isDriver && <Section title="Inventory fulfillment" description="Inventory reservations and custody remain auditable. Open Inventory for manual exceptions, counts, holds and reconciliation."><Button type="button" variant="secondary" icon={<PackageCheck size={15} />} onClick={() => navigate("inventory")}>Open inventory fulfillment</Button></Section>}
    </div>

    <Modal open={Boolean(detailOrder)} title={detailOrder ? `${detailOrder.number} · Delivery details` : "Delivery details"} description={detailAccount?.locationName ?? detailAccount?.name ?? "Order and customer detail"} onClose={() => setDetailOrderId(null)} wide footer={<Button type="button" variant="ghost" onClick={() => setDetailOrderId(null)}>Close</Button>}>
      {detailOrder && <div className="delivery-detail">
        <div className="company-rule-facts">
          <div><span>Status</span><strong>{detailStatus}</strong><small>Order {detailOrder.status}</small></div>
          <div><span>Placed by</span><strong>{detailPlacedBy?.name??detailOrder.ownerId}</strong><small>Order creator</small></div>
          <div><span>Cases</span><strong>{detailOrder.cases}</strong><small>{detailLines.length} SKU{detailLines.length === 1 ? "" : "s"}</small></div>
          <div><span>Order total</span><strong>{formatMoney(detailOrder.amount)}</strong><small>{detailOrder.paymentStatus}</small></div>
          <div><span>Driver</span><strong>{detailDriver?.name ?? "Unassigned"}</strong><small>{detailTask?.status ?? "Not claimed"}</small></div>
        </div>

        <Section title="Items"><div className="company-request-list">{detailLines.map((line) => <article key={line.id}><span><Box size={15} /></span><div><strong>{line.product}</strong><p>{line.cases} cases · {formatMoney(line.pricePerCase)} / case · {formatMoney(line.amount)}</p></div></article>)}</div></Section>

        <Section title="Customer & delivery"><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
          <div><small>Delivery location</small><p><MapPin size={14} /> {detailAccount ? fullAddress(detailAccount) : "Location unavailable"}</p></div>
          <div><small>Primary contact</small><p><UserRound size={14} /> {detailAccount?.contactName || "Not recorded"}{detailAccount?.contactRole ? ` · ${detailAccount.contactRole}` : ""}</p><p>{detailAccount?.phone || "No phone"}{detailAccount?.email ? ` · ${detailAccount.email}` : ""}</p></div>
          <div><small>Billing / A/P contact</small><p><Mail size={14} /> {detailCustomer?.accountsPayableContactName ?? detailCustomer?.billingContactName ?? "Not recorded"}</p><p>{detailCustomer?.accountsPayablePhone ?? detailCustomer?.billingPhone ?? "No phone"}{detailCustomer?.accountsPayableExtension ? ` ext. ${detailCustomer.accountsPayableExtension}` : ""}</p><p>{detailCustomer?.accountsPayableEmail ?? detailCustomer?.billingEmail ?? ""}</p></div>
          <div><small>Terms</small><p><strong>{detailCustomer?.paymentTerms ?? "COD"}</strong></p><p>{detailCollected > 0 ? `${formatMoney(detailCollected)} collected at delivery · Finance reconciliation pending` : "No delivery collection recorded."}</p></div>
        </div></Section>

        {detailMarketing.length > 0 && <Section title="Approved special requests"><div className="delivery-marketing-request-list">{detailMarketing.map((request) => <article key={request.id}><span><Megaphone size={17} /></span><div><small>{request.type}{request.neededBy ? ` · needed ${formatDate(request.neededBy, { month: "short", day: "numeric" })}` : ""}</small><strong>{request.title}</strong><p>{request.detail}</p></div><StatusPill tone="warning">Approved</StatusPill></article>)}</div></Section>}

        <Section title="Delivery note"><p>{detailTask?.note ?? detailAccount?.notes ?? "No delivery note recorded."}</p></Section>

        {detailTask?.signature && <Section title="Delivery signature"><div className="delivery-signature-record"><svg viewBox="0 0 1000 300" aria-label="Recipient delivery signature">{detailTask.signature.strokes.map((stroke, index) => <polyline key={index} points={stroke.map(([x,y]) => `${x},${y}`).join(" ")} />)}</svg><div><strong>{detailTask.signature.recipientName || "Recipient signature"}</strong><small>Signed {formatDate(detailTask.signature.signedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></div></Section>}

        {(detailTask?.collections ?? []).length > 0 && <Section title="Payment collected at delivery"><div className="company-request-list">{detailTask!.collections!.map((collection) => <article key={collection.id}><span><Banknote size={16} /></span><div><strong>{formatMoney(collection.amount)} · {collection.method}</strong><p>{collection.reference ? `Reference: ${collection.reference} · ` : ""}Finance settlement/reconciliation is still required.</p><small>{formatDate(collection.recordedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}</div></Section>}

        {(detailTask?.history ?? []).length > 0 && <Section title="Delivery history"><div style={{ display: "grid", gap: 7 }}>{detailTask!.history.map((event) => <p key={event.id} style={{ margin: 0 }}><small>{new Date(event.at).toLocaleString()} · {event.type}{event.note ? ` · ${event.note}` : ""}</small></p>)}</div></Section>}
      </div>}
    </Modal>

    <Modal open={Boolean(signingOrderId)} title="Complete delivery" description="Capture the recipient signature before posting the delivery as complete." onClose={closeSignature} footer={<><Button type="button" variant="ghost" onClick={closeSignature}>Cancel</Button><Button type="button" icon={<CheckCircle2 size={16}/>} onClick={completeSignedDelivery}>Save signature & complete</Button></>}>
      <div className="delivery-signature-modal">
        <p className="delivery-signature-modal__order">{signingOrderId ? data.orders.find((item) => item.id === signingOrderId)?.number : ""} · {signingOrderId ? data.accounts.find((account) => account.id === data.orders.find((item) => item.id === signingOrderId)?.accountId)?.locationName ?? data.accounts.find((account) => account.id === data.orders.find((item) => item.id === signingOrderId)?.accountId)?.name : ""}</p>
        <DeliverySignaturePad strokes={signatureStrokes} onChange={(strokes) => { setSignatureStrokes(strokes); setSignatureError(""); }} />
        <label className="delivery-signature-name"><span>Recipient name <small>optional</small></span><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Name of person receiving delivery" autoComplete="name" /></label>
        <p className="delivery-signature-note">This signature records delivery presence and is copied onto the Momentum invoice. It is not a separate contract or payment authorization.</p>
        {signatureError && <p className="form-error" role="alert">{signatureError}</p>}
      </div>
    </Modal>
  </>;
}
