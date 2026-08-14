"use client";

import {
  Building2,
  CalendarPlus,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Store,
  UserRound,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { AccountStage } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import {
  Avatar,
  Button,
  Field,
  Modal,
  PageHeader,
  StatusPill,
  formatDate,
} from "../ui";

const stages: Array<"All" | AccountStage> = [
  "All",
  "Prospect",
  "Qualified",
  "Sampled",
  "Opening order",
  "Placed",
  "Reordered",
  "At risk",
];

const stageTone = (stage: AccountStage) => {
  if (stage === "Reordered" || stage === "Placed") return "success" as const;
  if (stage === "At risk") return "danger" as const;
  if (stage === "Opening order" || stage === "Sampled") return "gold" as const;
  return "info" as const;
};

export function AccountsPage() {
  const { data, createAccount, navigate } = useWorkspace();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<(typeof stages)[number]>("All");
  const [selectedId, setSelectedId] = useState(data.accounts[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    location: "Phoenix, AZ",
    channel: "Independent retail",
    contactName: "",
    contactRole: "Owner / buyer",
    phone: "",
    email: "",
  });

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.accounts.filter((account) => {
      const matchesStage = stage === "All" || account.stage === stage;
      const matchesQuery =
        !normalized ||
        [account.name, account.location, account.channel, account.contactName]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesStage && matchesQuery;
    });
  }, [data.accounts, query, stage]);

  const selected = data.accounts.find((account) => account.id === selectedId) ?? filtered[0];
  const owner = data.users.find((user) => user.id === selected?.ownerId);
  const accountActivities = data.activities.filter((activity) => activity.accountId === selected?.id);
  const accountOrders = data.orders.filter((order) => order.accountId === selected?.id);
  const accountPlacements = data.placements.filter((placement) => placement.accountId === selected?.id);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = createAccount(form);
    setSelectedId(id);
    setCreateOpen(false);
    setForm({
      name: "",
      location: "Phoenix, AZ",
      channel: "Independent retail",
      contactName: "",
      contactRole: "Owner / buyer",
      phone: "",
      email: "",
    });
  };

  return (
    <div className="page page--accounts">
      <PageHeader
        eyebrow="Revenue operations"
        title="Sales & accounts"
        description="One customer record from first conversation through paid reorder."
        actions={<Button variant="gold" icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>New account</Button>}
      />

      <div className="account-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts, buyers, locations…" />
        </label>
        <div className="stage-filters" role="group" aria-label="Filter by stage">
          {stages.map((item) => (
            <button key={item} className={stage === item ? "is-active" : ""} onClick={() => setStage(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="account-workspace">
        <section className="account-list-panel">
          <div className="list-summary">
            <span><strong>{filtered.length}</strong> demo accounts</span>
            <small>Sorted by next action</small>
          </div>
          <div className="account-table account-table--head">
            <span>Account</span><span>Stage</span><span>Owner</span><span>Next action</span><span />
          </div>
          <div className="account-table-body">
            {filtered.map((account) => {
              const accountOwner = data.users.find((user) => user.id === account.ownerId);
              return (
                <button
                  className={`account-table ${selected?.id === account.id ? "is-selected" : ""}`}
                  key={account.id}
                  onClick={() => setSelectedId(account.id)}
                >
                  <span className="account-name-cell">
                    <i><Store size={17} /></i>
                    <span><strong>{account.name}</strong><small>{account.location} · {account.channel}</small></span>
                  </span>
                  <span><StatusPill tone={stageTone(account.stage)}>{account.stage}</StatusPill></span>
                  <span className="account-owner-cell">
                    {accountOwner && <><Avatar initials={accountOwner.initials} color={accountOwner.accent} size="sm" /><span>{accountOwner.firstName}</span></>}
                  </span>
                  <span className="account-action-cell"><strong>{account.nextAction}</strong><small>{formatDate(account.nextActionDate, { month: "short", day: "numeric" })}</small></span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
            {filtered.length === 0 && <div className="list-empty">No demo accounts match these filters.</div>}
          </div>
        </section>

        {selected && (
          <aside className="account-detail">
            <header className="account-detail__header">
              <div className="account-detail__logo"><Building2 size={23} /></div>
              <div><StatusPill tone={stageTone(selected.stage)}>{selected.stage}</StatusPill><h2>{selected.name}</h2><p><MapPin size={14} /> {selected.location} · {selected.channel}</p></div>
            </header>

            <div className="account-detail__actions">
              <Button variant="primary" size="sm" icon={<CalendarPlus size={15} />} onClick={() => navigate("dispatch")}>Schedule</Button>
              <Button variant="secondary" size="sm" icon={<Plus size={15} />} onClick={() => navigate("orders")}>Draft order</Button>
            </div>

            <div className="account-detail__metrics">
              <div><span>Lifetime cases</span><strong>{selected.lifetimeCases}</strong></div>
              <div><span>Reorders</span><strong>{selected.reorderCount}</strong></div>
              <div><span>Placement</span><strong>{accountPlacements.length ? "Recorded" : "None"}</strong></div>
            </div>

            <section className="detail-section">
              <h3>Next best action</h3>
              <div className="next-action-card">
                <span>{formatDate(selected.nextActionDate, { month: "short", day: "numeric" })}</span>
                <div><strong>{selected.nextAction}</strong><p>Owned by {owner?.name ?? "Unassigned"}</p></div>
                <ChevronRight size={17} />
              </div>
            </section>

            <section className="detail-section">
              <h3>Buyer</h3>
              <div className="contact-card">
                <span><UserRound size={17} /></span>
                <div><strong>{selected.contactName}</strong><p>{selected.contactRole}</p></div>
              </div>
              <a href={`tel:${selected.phone}`}><Phone size={15} /> {selected.phone}</a>
              <a href={`mailto:${selected.email}`}><Mail size={15} /> {selected.email}</a>
            </section>

            <section className="detail-section">
              <div className="detail-section__heading"><h3>Account timeline</h3><span>{accountActivities.length + accountOrders.length} records</span></div>
              <div className="mini-timeline">
                {accountActivities.slice(0, 4).map((activity) => (
                  <article key={activity.id}>
                    <i />
                    <div><strong>{activity.title}</strong><p>{activity.detail}</p><small>{formatDate(activity.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>
                  </article>
                ))}
                {accountActivities.length === 0 && <p className="detail-muted">No activity yet.</p>}
              </div>
            </section>

            <section className="detail-section detail-section--note">
              <h3>Internal note</h3>
              <p>{selected.notes}</p>
            </section>
          </aside>
        )}
      </div>

      <Modal
        open={createOpen}
        title="Create demo account"
        description="Start one controlled account record and its first next action."
        onClose={() => setCreateOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="new-account-form">Create account</Button></>}
      >
        <form id="new-account-form" className="form-grid" onSubmit={submit}>
          <Field label="Business name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example Market" /></Field>
          <Field label="Location"><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Channel">
            <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })}>
              <option>Independent retail</option><option>Convenience store</option><option>Restaurant / nightlife</option><option>Gym / fitness</option><option>Vending</option><option>Distributor</option>
            </select>
          </Field>
          <Field label="Decision-maker"><input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Full name" /></Field>
          <Field label="Contact role"><input value={form.contactRole} onChange={(event) => setForm({ ...form, contactRole: event.target.value })} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(602) 555-0123" /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="buyer@example.test" /></Field>
          <div className="form-callout"><Store size={17} /><p>Duplicate detection and business identity checks will run server-side once persistence is connected.</p></div>
        </form>
      </Modal>
    </div>
  );
}
