"use client";

import { ChevronDown, History, MapPin, PackageCheck, RefreshCcw, Store, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { ACCOUNT_PRICING_TIERS, accountHealthSnapshot } from "../../lib/account-health";
import { useCrm } from "../../lib/crm-context";
import type { Account, PremiseType, PricingTier } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { RecordHistory } from "../audit/record-history";
import { Button, Field, StatusPill, formatDate, formatMoney } from "../ui";

const premiseOptions: PremiseType[] = ["Unclassified", "On-premise", "Off-premise", "Hybrid"];
const tierTone = (tier?: PricingTier) => tier === "A" ? "success" as const : tier === "B" ? "gold" as const : tier === "C" ? "warning" as const : "neutral" as const;

function AccountProfile({ account }: { account: Account }) {
  const { data, currentUser, updateAccountCommercial, transferAccountResponsibility } = useWorkspace();
  const { crm, recordResponsibility } = useCrm();
  const snapshot = accountHealthSnapshot(data, account);
  const [premiseType, setPremiseType] = useState<PremiseType>(account.premiseType ?? "Unclassified");
  const [businessType, setBusinessType] = useState(account.businessType ?? account.channel);
  const [categoryReviewDate, setCategoryReviewDate] = useState(account.categoryReviewDate ?? "");
  const [handoffTo, setHandoffTo] = useState(account.ownerId);
  const [handoffReason, setHandoffReason] = useState("");
  const currentOwner = data.users.find((user) => user.id === account.ownerId);
  const originator = data.users.find((user) => user.id === account.originatorId);
  const closer = data.users.find((user) => user.id === account.closerId);
  const orders = data.orders.filter((order) => order.accountId === account.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const contacts = crm.contacts.filter((contact) => contact.locationId === account.id || (!contact.locationId && contact.customerId === account.customerId));
  const salesUsers = data.users.filter((user) => ["Sales Representative", "Sales Manager"].includes(user.role));
  const canEdit = Boolean(currentUser && ["Administrator", "Sales Manager", "Sales Representative"].includes(currentUser.role));
  const canTransfer = Boolean(currentUser && ["Administrator", "Sales Manager"].includes(currentUser.role));

  const saveClassification = () => updateAccountCommercial(account.id, { premiseType, businessType: businessType.trim() || account.channel, categoryReviewDate: categoryReviewDate || undefined });
  const setTier = (tier: PricingTier) => updateAccountCommercial(account.id, { pricingTier: tier });
  const transfer = () => {
    if (!handoffTo || handoffTo === account.ownerId || !handoffReason.trim()) return;
    const priorOwner = account.ownerId;
    if (!transferAccountResponsibility(account.id, handoffTo, handoffReason.trim())) return;
    recordResponsibility({ locationId: account.id, fromUserId: priorOwner, toUserId: handoffTo, reason: handoffReason.trim() });
    setHandoffReason("");
  };

  return <details className="crm-expand-profile">
    <summary>
      <span className="crm-expand-profile__icon"><Store size={18}/></span>
      <span className="crm-expand-profile__identity"><strong>{account.locationName ?? account.name}</strong><small>{account.streetAddress ? `${account.streetAddress} · ` : ""}{account.location}</small></span>
      <span><StatusPill tone={tierTone(account.pricingTier)}>{account.pricingTier ? `Tier ${account.pricingTier}` : "Price not assigned"}</StatusPill></span>
      <span className="crm-expand-profile__health"><strong>{snapshot.daysSinceLastOrder == null ? "No order" : `${snapshot.daysSinceLastOrder}d`}</strong><small>since last order</small></span>
      <ChevronDown size={17}/>
    </summary>
    <div className="crm-expand-profile__body">
      <div className="crm-profile-kpis">
        <div><span>Last order</span><strong>{snapshot.lastOrderDate ? formatDate(snapshot.lastOrderDate) : "None"}</strong><small>{snapshot.daysSinceLastOrder == null ? "No order history" : `${snapshot.daysSinceLastOrder} days ago`}</small></div>
        <div><span>Rolling 90-day paid cases</span><strong>{snapshot.rolling90PaidCases}</strong><small>{snapshot.rolling90PaidOrderCount} paid order{snapshot.rolling90PaidOrderCount === 1 ? "" : "s"}</small></div>
        <div><span>3-month monthly average</span><strong>{snapshot.rolling3MonthMonthlyAverage}</strong><small>Paid cases / month</small></div>
        <div><span>Category review</span><strong>{snapshot.categoryReviewDate ? formatDate(snapshot.categoryReviewDate) : "Not set"}</strong><small>{snapshot.categoryReviewDue ? "Review due" : "Current"}</small></div>
      </div>

      <div className="crm-profile-columns">
        <section>
          <h3>Main details</h3>
          <dl className="crm-profile-facts">
            <div><dt>Business</dt><dd>{account.name}</dd></div>
            <div><dt>Location</dt><dd><MapPin size={13}/> {account.streetAddress ?? account.location}</dd></div>
            <div><dt>Current rep</dt><dd>{currentOwner?.name ?? "Unassigned"}</dd></div>
            <div><dt>Opening rep</dt><dd>{originator?.name ?? "Not recorded"}</dd></div>
            <div><dt>Closer</dt><dd>{closer?.name ?? "Not recorded"}</dd></div>
            <div><dt>Stage</dt><dd>{account.stage}</dd></div>
          </dl>
        </section>
        <section>
          <h3>Pricing</h3>
          <div className="crm-tier-picker">{(["A", "B", "C"] as PricingTier[]).map((tier) => <button key={tier} className={account.pricingTier === tier ? "is-active" : ""} disabled={!canEdit} onClick={() => setTier(tier)}><strong>{tier}</strong><span>{formatMoney(ACCOUNT_PRICING_TIERS[tier].pricePerCase)}/case</span></button>)}</div>
          {account.pricingUpdatedAt && <small className="crm-profile-note">Last changed {formatDate(account.pricingUpdatedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} by {data.users.find((user) => user.id === account.pricingUpdatedBy)?.name ?? "recorded user"}</small>}
        </section>
      </div>

      <div className="crm-profile-columns">
        <section>
          <h3>Classification</h3>
          <div className="form-grid crm-profile-form"><Field label="Premise"><select disabled={!canEdit} value={premiseType} onChange={(event) => setPremiseType(event.target.value as PremiseType)}>{premiseOptions.map((option) => <option key={option}>{option}</option>)}</select></Field><Field label="Business type"><input disabled={!canEdit} value={businessType} onChange={(event) => setBusinessType(event.target.value)}/></Field><Field label="Next category review"><input disabled={!canEdit} type="date" value={categoryReviewDate} onChange={(event) => setCategoryReviewDate(event.target.value)}/></Field>{canEdit && <Button size="sm" onClick={saveClassification}>Save classification</Button>}</div>
        </section>
        <section>
          <h3>Contacts</h3>
          <div className="crm-profile-list">{contacts.slice(0, 6).map((contact) => <div key={contact.id}><strong>{contact.name}</strong><span>{contact.role}{contact.phone ? ` · ${contact.phone}` : ""}{contact.email ? ` · ${contact.email}` : ""}</span></div>)}{contacts.length === 0 && <span>No contacts recorded.</span>}</div>
        </section>
      </div>

      {canTransfer && <section className="crm-handoff-panel"><div><UserRoundCheck size={18}/><div><strong>Responsibility handoff</strong><span>Changes future responsibility only. Existing order credit stays with the rep who created each order.</span></div></div><div className="crm-handoff-controls"><select value={handoffTo} onChange={(event) => setHandoffTo(event.target.value)}>{salesUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><input placeholder="Reason for handoff" value={handoffReason} onChange={(event) => setHandoffReason(event.target.value)}/><Button size="sm" variant="secondary" disabled={handoffTo === account.ownerId || !handoffReason.trim()} onClick={transfer}>Transfer</Button></div></section>}

      <div className="crm-profile-columns">
        <section>
          <h3><PackageCheck size={15}/> Order history</h3>
          <div className="crm-profile-list">{orders.slice(0, 8).map((order) => { const credited = data.users.find((user) => user.id === (order.creditedRepId ?? order.ownerId)); return <div key={order.id}><strong>{order.number} · {order.product ?? "Golden Eagle"} · {order.cases} cases</strong><span>{formatDate(order.placedAt)} · {formatMoney(order.pricePerCase)}/case · credit: {credited?.name ?? "No sales rep"}</span></div>; })}{orders.length === 0 && <span>No orders recorded.</span>}</div>
        </section>
        <section>
          <h3><RefreshCcw size={15}/> Responsibility history</h3>
          <div className="crm-profile-list">{crm.responsibilityHistory.filter((event) => event.locationId === account.id).slice(0, 8).map((event) => <div key={event.id}><strong>{data.users.find((user) => user.id === event.fromUserId)?.name ?? "Unassigned"} → {data.users.find((user) => user.id === event.toUserId)?.name ?? "Unknown"}</strong><span>{event.reason} · {formatDate(event.effectiveAt, { month: "short", day: "numeric", year: "numeric" })}</span></div>)}</div>
        </section>
      </div>

      <section className="crm-profile-history"><h3><History size={15}/> Change history</h3><RecordHistory accountId={account.id} limit={20}/></section>
    </div>
  </details>;
}

export function AccountProfilePanel() {
  const { scope, currentUser } = useWorkspace();
  if (!currentUser || currentUser.role === "Customer") return null;
  return <section className="crm-expandable-profiles"><header><div><h2>Account profiles</h2><p>Expand an account to review pricing, ownership, classification, order credit, and change history.</p></div><StatusPill tone="info">{scope.accounts.length} in scope</StatusPill></header><div>{scope.accounts.map((account) => <AccountProfile key={account.id} account={account}/>)}</div></section>;
}
