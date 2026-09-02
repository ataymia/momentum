"use client";

import { Camera, Check, ChevronRight, CircleAlert, Eye, PackageCheck, RefreshCcw, Snowflake, Store, TrendingUp } from "lucide-react";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, PageHeader, Section, StatusPill, formatDate } from "../ui";

export function RetailPage() {
  const { scope, updatePlacement, navigate } = useWorkspace();
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const selected = scope.placements.find((placement) => placement.id === selectedId);
  const [check, setCheck] = useState({ observedStock:0, facings:0, cold:false, shelfPrice:0 });

  const selectPlacement = (placementId: string) => {
    const placement = scope.placements.find((item) => item.id === placementId);
    if (!placement) return;
    setSelectedId(placementId);
    setCheck({ observedStock:placement.observedStock, facings:placement.facings, cold:placement.cold, shelfPrice:placement.shelfPrice });
    setDetailOpen(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    updatePlacement(selected.id, check.observedStock, check.facings, check.cold, check.shelfPrice);
    setDetailOpen(false);
  };
  const healthy = scope.placements.filter((placement) => placement.status === "Healthy").length;
  const cold = scope.placements.filter((placement) => placement.cold).length;
  const due = scope.placements.filter((placement) => placement.status !== "Healthy").length;
  const beginReorder = () => {
    if (!selected) return;
    window.sessionStorage.setItem("momentum-focus-record", selected.accountId);
    window.sessionStorage.setItem("momentum-order-intent", "new-order");
    setDetailOpen(false);
    navigate("orders");
  };
  const openAccount = () => {
    if (!selected) return;
    window.sessionStorage.setItem("momentum-focus-record", selected.accountId);
    setDetailOpen(false);
    navigate("accounts");
  };

  const selectedAccount = selected ? scope.accounts.find((item) => item.id === selected.accountId) : undefined;

  return <div className="page page--retail">
    <PageHeader eyebrow="Market execution" title="Retail execution" description="Prove delivery, placement, observation, and reorder as separate operational facts." />
    <div className="commercial-proof-chain">{[[PackageCheck, "Sell-in", "Order recorded", scope.orders.length],[Store, "Placement", "Available to buy", scope.placements.length],[Eye, "Observation", "Stock checked", scope.placements.filter((item) => item.lastChecked).length],[RefreshCcw, "Reorder", "Customer bought again", scope.accounts.filter((item) => item.reorderCount > 0).length]].map(([Icon,title,detail,count],index) => { const StepIcon = Icon as typeof Store; return <div className="proof-step" key={title as string}><span><StepIcon size={20} /></span><div><small>{index + 1}. {title as string}</small><strong>{count as number}</strong><p>{detail as string}</p></div>{index < 3 && <ChevronRight className="proof-step__arrow" size={18} />}</div>; })}</div>
    <div className="retail-kpis"><div><span><Store size={19} /></span><div><small>Healthy placements</small><strong>{healthy} / {scope.placements.length}</strong></div></div><div><span><Snowflake size={19} /></span><div><small>Cold availability</small><strong>{cold} / {scope.placements.length}</strong></div></div><div><span><CircleAlert size={19} /></span><div><small>Checks needing action</small><strong>{due}</strong></div></div><div className="retail-source-note"><TrendingUp size={18} /><p>Consumer sell-through is not claimed without an identified source and confidence level.</p></div></div>
    <Section title="Active placements" description="Select a store card to open a distinct placement-check window instead of a second sidebar." className="placement-list-panel placement-list-panel--full"><div className="placement-grid">{scope.placements.map((placement) => { const account = scope.accounts.find((item) => item.id === placement.accountId); return <button key={placement.id} onClick={() => selectPlacement(placement.id)} className="placement-card"><div className="placement-card__top"><span><Store size={18} /></span><StatusPill tone={placement.status === "Healthy" ? "success" : placement.status === "Out of stock" ? "danger" : "warning"}>{placement.status}</StatusPill></div><h3>{account?.name}</h3><p>{placement.location}</p><div className="placement-card__stats"><div><small>Observed units</small><strong>{placement.observedStock}</strong></div><div><small>Facings</small><strong>{placement.facings}</strong></div><div><small>Cold</small><strong>{placement.cold ? "Yes" : "No"}</strong></div></div><footer><span>Checked {formatDate(placement.lastChecked, { month:"short", day:"numeric" })}</span><span className="placement-card__open">Open check <ChevronRight size={16} /></span></footer></button>; })}</div></Section>

    <Modal open={detailOpen&&Boolean(selected)} title="Placement check" description={selectedAccount?`${selectedAccount.name} · ${selected?.location??""}`:"Retail placement"} onClose={()=>setDetailOpen(false)} footer={<><Button variant="ghost" onClick={()=>setDetailOpen(false)}>Close</Button><Button variant="secondary" onClick={openAccount}>Open full account</Button><Button type="submit" form="placement-check-form" icon={<Check size={16}/>}>Save observation</Button></>} wide>
      {selected&&<div className="retail-placement-modal"><div className="placement-detail__product"><span className="product-can" aria-hidden="true"><i>GE</i></span><div><small>Product record</small><strong>{selected.product}</strong><p>{selected.location} · ${selected.shelfPrice.toFixed(2)} observed shelf price</p></div><StatusPill tone={selected.status === "Healthy" ? "success" : selected.status === "Out of stock" ? "danger" : "warning"}>{selected.status}</StatusPill></div><div className="movement-estimate"><div><small>Cases delivered</small><strong>{selected.casesDelivered}</strong></div><div><small>Observed stock</small><strong>{selected.observedStock} units</strong></div><div><small>Evidence source</small><strong>{selected.source}</strong></div></div><p className="movement-caveat"><CircleAlert size={15} /> No unit conversion or sell-through estimate is calculated until the product case configuration is approved.</p><form id="placement-check-form" className="placement-check-form retail-placement-modal__form" onSubmit={submit}><Field label="Observed units"><input type="number" min="0" value={check.observedStock} onChange={(event) => setCheck({ ...check, observedStock:Number(event.target.value) })} /></Field><Field label="Facings"><input type="number" min="0" value={check.facings} onChange={(event) => setCheck({ ...check, facings:Number(event.target.value) })} /></Field><Field label="Observed shelf price"><input type="number" min="0" step="0.01" value={check.shelfPrice} onChange={(event) => setCheck({ ...check, shelfPrice:Number(event.target.value) })} /></Field><label className="toggle-field"><span><strong>Cold availability</strong><small>Product available chilled</small></span><input type="checkbox" checked={check.cold} onChange={(event) => setCheck({ ...check, cold:event.target.checked })} /><i /></label><div className="evidence-row"><span><Camera size={17} /> Photo evidence</span><small>Unavailable until Firebase Storage is connected</small></div></form><div className="retail-placement-modal__actions"><Button variant="secondary" icon={<Store size={16}/>} onClick={openAccount}>Open account workspace</Button><Button variant="gold" icon={<RefreshCcw size={16}/>} onClick={beginReorder}>Start reorder</Button></div></div>}
    </Modal>
  </div>;
}
