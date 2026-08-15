"use client";

import {
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Eye,
  PackageCheck,
  RefreshCcw,
  Snowflake,
  Store,
  TrendingUp,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate } from "../ui";

export function RetailPage() {
  const { data, updatePlacement, navigate } = useWorkspace();
  const [selectedId, setSelectedId] = useState(data.placements[0]?.id ?? "");
  const selected = data.placements.find((placement) => placement.id === selectedId) ?? data.placements[0];
  const [check, setCheck] = useState({ observedStock: selected?.observedStock ?? 0, facings: selected?.facings ?? 0, cold: selected?.cold ?? false });

  const selectPlacement = (placementId: string) => {
    const placement = data.placements.find((item) => item.id === placementId);
    if (!placement) return;
    setSelectedId(placementId);
    setCheck({
      observedStock: placement.observedStock,
      facings: placement.facings,
      cold: placement.cold,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    updatePlacement(selected.id, check.observedStock, check.facings, check.cold);
  };

  const healthy = data.placements.filter((placement) => placement.status === "Healthy").length;
  const cold = data.placements.filter((placement) => placement.cold).length;
  const due = data.placements.filter((placement) => placement.status !== "Healthy").length;

  return (
    <div className="page page--retail">
      <PageHeader
        eyebrow="Market execution"
        title="Retail execution"
        description="Prove delivery, placement, consumer movement, and reorder as separate facts."
      />

      <div className="commercial-proof-chain">
        {[
          [PackageCheck, "Sell-in", "Order recorded", data.orders.length],
          [Store, "Placement", "Available to buy", data.placements.length],
          [Eye, "Observation", "Stock checked", data.placements.filter((item) => item.lastChecked).length],
          [RefreshCcw, "Reorder", "Customer bought again", data.accounts.filter((item) => item.reorderCount > 0).length],
        ].map(([Icon, title, detail, count], index) => {
          const StepIcon = Icon as typeof Store;
          return (
            <div className="proof-step" key={title as string}>
              <span><StepIcon size={20} /></span>
              <div><small>{index + 1}. {title as string}</small><strong>{count as number}</strong><p>{detail as string}</p></div>
              {index < 3 && <ChevronRight className="proof-step__arrow" size={18} />}
            </div>
          );
        })}
      </div>

      <div className="retail-kpis">
        <div><span><Store size={19} /></span><div><small>Healthy placements</small><strong>{healthy} / {data.placements.length}</strong></div></div>
        <div><span><Snowflake size={19} /></span><div><small>Cold availability</small><strong>{cold} / {data.placements.length}</strong></div></div>
        <div><span><CircleAlert size={19} /></span><div><small>Checks needing action</small><strong>{due}</strong></div></div>
        <div className="retail-source-note"><TrendingUp size={18} /><p>Consumer sell-through is not claimed without an identified source and confidence level.</p></div>
      </div>

      <div className="retail-layout">
        <Section title="Active placements" description="Demo records by store location" className="placement-list-panel">
          <div className="placement-grid">
            {data.placements.map((placement) => {
              const account = data.accounts.find((item) => item.id === placement.accountId);
              return (
                <button key={placement.id} onClick={() => selectPlacement(placement.id)} className={`placement-card ${selected?.id === placement.id ? "is-selected" : ""}`}>
                  <div className="placement-card__top"><span><Store size={18} /></span><StatusPill tone={placement.status === "Healthy" ? "success" : placement.status === "Out of stock" ? "danger" : "warning"}>{placement.status}</StatusPill></div>
                  <h3>{account?.name}</h3>
                  <p>{placement.location}</p>
                  <div className="placement-card__stats">
                    <div><small>Observed units</small><strong>{placement.observedStock}</strong></div>
                    <div><small>Facings</small><strong>{placement.facings}</strong></div>
                    <div><small>Cold</small><strong>{placement.cold ? "Yes" : "No"}</strong></div>
                  </div>
                  <footer><span>Checked {formatDate(placement.lastChecked, { month: "short", day: "numeric" })}</span><ChevronRight size={16} /></footer>
                </button>
              );
            })}
          </div>
        </Section>

        {selected && (() => {
          const account = data.accounts.find((item) => item.id === selected.accountId);
          return (
            <Section title="Placement check" description={account?.name} className="placement-detail" action={<StatusPill tone="gold">Demo</StatusPill>}>
              <div className="placement-detail__product">
                <span className="product-can" aria-hidden="true"><i>GE</i></span>
                <div><small>Product record</small><strong>{selected.product}</strong><p>{selected.location} · ${selected.shelfPrice.toFixed(2)} observed shelf price</p></div>
              </div>

              <div className="movement-estimate">
                <div><small>Cases delivered</small><strong>{selected.casesDelivered}</strong></div>
                <div><small>Observed stock</small><strong>{selected.observedStock} units</strong></div>
                <div><small>Evidence source</small><strong>{selected.source}</strong></div>
              </div>
              <p className="movement-caveat"><CircleAlert size={15} /> No unit conversion or sell-through estimate is calculated until the product case configuration is approved.</p>

              <form className="placement-check-form" onSubmit={submit}>
                <Field label="Observed units"><input type="number" min="0" value={check.observedStock} onChange={(event) => setCheck({ ...check, observedStock: Number(event.target.value) })} /></Field>
                <Field label="Facings"><input type="number" min="0" value={check.facings} onChange={(event) => setCheck({ ...check, facings: Number(event.target.value) })} /></Field>
                <label className="toggle-field"><span><strong>Cold availability</strong><small>Product available chilled</small></span><input type="checkbox" checked={check.cold} onChange={(event) => setCheck({ ...check, cold: event.target.checked })} /><i /></label>
                <div className="evidence-row"><span><Camera size={17} /> Photo evidence</span><small>Unavailable in the local tour</small></div>
                <Button type="submit" icon={<Check size={17} />}>Save observation</Button>
              </form>

              <button className="reorder-link" onClick={() => navigate("orders")}><RefreshCcw size={17} /><span>Move to reorder workflow</span><ChevronRight size={16} /></button>
            </Section>
          );
        })()}
      </div>
    </div>
  );
}
