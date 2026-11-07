"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpDown, Search } from "lucide-react";
import { useWorkspace } from "../../lib/workspace-context";
import { useCrm } from "../../lib/crm-context";
import { useRuntimeMode } from "../../lib/runtime-mode";
import { momentumStorage } from "../../lib/persistence";
import { navigateToRoute } from "../../lib/navigation-store";
import { downloadCsv } from "../../lib/browser-export";
import type { OpportunityStage, CrmContact } from "../../lib/crm-engine";
import { visibleDeals, visibleContacts, dealCsvColumns, dealCsvRows, contactCsvColumns, contactCsvRows } from "../../lib/crm-review-records";

const stages: OpportunityStage[] = ["Prospecting", "Qualified", "Sample / evaluation", "Commercial review", "Order pending", "Won", "Lost"];
const openStages = stages.filter(stage => stage !== "Won" && stage !== "Lost");
const link = (path: string) => navigateToRoute(path);
const canWriteDemo = (isDemo: boolean, role?: string) =>
  isDemo && momentumStorage.mode() === "local" && ["Administrator", "Sales Manager", "Sales Representative"].includes(role ?? "");

function PageHeader({ title, back, action }: { title: string; back?: string; action?: { label: string; path: string } }) {
  return <header className="prototype-heading">
    {back && <button className="prototype-back" type="button" onClick={() => link(back)}><ArrowLeft size={15}/> Back</button>}
    <h1>{title}</h1>
    {action && <button type="button" onClick={() => link(action.path)}>{action.label}</button>}
  </header>;
}

function DealForm({ id }: { id?: string }) {
  const { scope, currentUser } = useWorkspace();
  const { crm, addOpportunity, updateOpportunity } = useCrm();
  const runtime = useRuntimeMode();
  const permitted = visibleDeals(crm.opportunities, scope.accounts, currentUser);
  const existing = id ? permitted.find(deal => deal.id === id) : undefined;
  const locations = scope.accounts.filter(account => Boolean(account.customerId && account.ownerId));
  const [locationId, setLocationId] = useState(existing?.locationId ?? locations[0]?.id ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [stage, setStage] = useState<OpportunityStage>(existing?.stage ?? "Prospecting");
  const [cases, setCases] = useState(existing?.estimatedCases === undefined ? "" : String(existing.estimatedCases));
  const [close, setClose] = useState(existing?.expectedCloseDate ?? "");
  const [nextAction, setNextAction] = useState(existing?.nextAction ?? "");
  const [nextDate, setNextDate] = useState(existing?.nextActionDate ?? "");
  const [lossReason, setLossReason] = useState(existing?.lossReason ?? "");
  const [error, setError] = useState("");
  if (!canWriteDemo(runtime.isDemo, currentUser?.role)) return <section className="prototype-panel">Creating or editing deals is disabled for connected business data.</section>;
  if (id && !existing) return <section className="prototype-panel">Deal not found or inaccessible.</section>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = locations.find(item => item.id === locationId);
    if (!account || !account.customerId || !name.trim() || !nextAction.trim() || !nextDate) {
      setError("Select a linked business and enter a deal name, next action and follow-up date."); return;
    }
    if (cases !== "" && (!Number.isFinite(Number(cases)) || Number(cases) < 0)) { setError("Estimated cases must be zero or greater."); return; }
    if (stage === "Lost" && !lossReason.trim()) { setError("Enter a loss reason to close a deal as lost."); return; }
    const update = {
      name: name.trim(), stage, estimatedCases: cases === "" ? undefined : Number(cases),
      expectedCloseDate: close || undefined, nextAction: nextAction.trim(), nextActionDate: nextDate,
      status: stage === "Won" ? "Won" as const : stage === "Lost" ? "Lost" as const : "Open" as const,
      lossReason: stage === "Lost" ? lossReason.trim() : undefined,
    };
    if (existing) {
      const result = updateOpportunity(existing.id, update);
      if (!result.ok) { setError(result.message ?? "The change was not saved."); return; }
      link("/crm/deals/" + encodeURIComponent(existing.id)); return;
    }
    const result = addOpportunity({
      ...update, customerId: account.customerId, locationId: account.id, ownerId: account.ownerId,
    });
    if (!result) { setError("The opportunity could not be saved. Check the account assignment and permissions."); return; }
    link("/crm/deals/" + encodeURIComponent(result));
  };
  return <div><PageHeader title={id ? "Edit deal" : "New deal"} back={id ? "/crm/deals/" + encodeURIComponent(id) : "/crm/deals"}/>
    <section className="prototype-panel"><form onSubmit={submit} className="prototype-controls">
      <label>Business <select value={locationId} onChange={event => setLocationId(event.target.value)} disabled={Boolean(id)} required>
        {locations.map(account => <option key={account.id} value={account.id}>{account.name} · {account.location}</option>)}
      </select></label>
      <label>Deal name <input value={name} onChange={event => setName(event.target.value)} required maxLength={160}/></label>
      <label>Stage <select value={stage} onChange={event => setStage(event.target.value as OpportunityStage)}>
        {(id ? stages : openStages).map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>Estimated cases <input type="number" min="0" step="1" value={cases} onChange={event => setCases(event.target.value)}/></label>
      <label>Expected close <input type="date" value={close} onChange={event => setClose(event.target.value)}/></label>
      <label>Next action <input value={nextAction} onChange={event => setNextAction(event.target.value)} required maxLength={240}/></label>
      <label>Follow-up date <input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} required/></label>
      {stage === "Lost" && <label>Loss reason <input value={lossReason} onChange={event => setLossReason(event.target.value)} required maxLength={300}/></label>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={!locations.length}>{id ? "Save deal" : "Create deal"}</button>
    </form></section>
  </div>;
}

export function CrmDealsExperience({ id, edit = false, create = false }: { id?: string; edit?: boolean; create?: boolean }) {
  const { scope, data, currentUser } = useWorkspace();
  const { crm } = useCrm();
  const runtime = useRuntimeMode();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Open");
  const [owner, setOwner] = useState("all");
  const [stage, setStage] = useState("all");
  const [sort, setSort] = useState<"name" | "stage" | "nextActionDate" | "expectedCloseDate">("nextActionDate");
  const [asc, setAsc] = useState(true);
  const [layout, setLayout] = useState<"list" | "board">("list");
  const names = useMemo(() => new Map(data.users.map(user => [user.id, user.name])), [data.users]);
  const accounts = useMemo(() => new Map(scope.accounts.map(account => [account.id, account])), [scope.accounts]);
  const accessible = useMemo(() => visibleDeals(crm.opportunities, scope.accounts, currentUser), [crm.opportunities, scope.accounts, currentUser]);
  const rows = useMemo(() => accessible
    .filter(deal => status === "all" || deal.status === status)
    .filter(deal => stage === "all" || deal.stage === stage)
    .filter(deal => owner === "all" || deal.ownerId === owner)
    .filter(deal => [deal.name, accounts.get(deal.locationId)?.name, deal.nextAction, names.get(deal.ownerId)].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (asc ? 1 : -1) * (String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }) || a.id.localeCompare(b.id))),
    [accessible, status, stage, owner, search, sort, asc, accounts, names]);
  if (edit || create) return <DealForm id={edit ? id : undefined}/>;
  if (id) {
    const deal = accessible.find(item => item.id === id);
    if (!deal) return <section className="prototype-panel">Deal not found or inaccessible.</section>;
    const account = accounts.get(deal.locationId);
    const orders = scope.orders.filter(order => order.accountId === deal.locationId && !order.testOnly);
    return <div><PageHeader title={deal.name} back="/crm/deals" action={canWriteDemo(runtime.isDemo, currentUser?.role) ? {label:"Edit deal",path:"/crm/deals/" + encodeURIComponent(deal.id) + "/edit"} : undefined}/>
      <div className="prototype-columns">
        <section className="prototype-panel"><h2>Opportunity</h2><dl className="prototype-facts">
          <div><dt>Stage</dt><dd>{deal.stage}</dd></div><div><dt>Status</dt><dd>{deal.status}</dd></div>
          <div><dt>Business</dt><dd>{account ? <button type="button" className="prototype-link" onClick={() => link("/sales/customers/" + encodeURIComponent(account.id))}>{account.name}</button> : "Restricted"}</dd></div>
          <div><dt>Owner</dt><dd>{names.get(deal.ownerId) ?? "Unavailable"}</dd></div>
          <div><dt>Estimated cases</dt><dd>{deal.estimatedCases ?? "Not estimated"}</dd></div>
          <div><dt>Expected close</dt><dd>{deal.expectedCloseDate ?? "Not scheduled"}</dd></div>
          <div><dt>Next action</dt><dd>{deal.nextAction || "Not recorded"}</dd></div>
          <div><dt>Follow-up</dt><dd>{deal.nextActionDate || "Not scheduled"}</dd></div>
          {deal.lossReason && <div><dt>Loss reason</dt><dd>{deal.lossReason}</dd></div>}
        </dl></section>
        <section className="prototype-panel"><h2>Location order history</h2>
          {orders.map(order => <p key={order.id} className="prototype-activity"><button type="button" className="prototype-link" onClick={() => link("/sales/orders/" + encodeURIComponent(order.id))}>{order.number}</button><span>{order.status} · {order.placedAt.slice(0,10)}</span></p>)}
          {!orders.length && <p>No orders recorded at this business.</p>}
          <p className="prototype-note">Location orders are not automatically credited to this deal.</p>
        </section>
      </div>
    </div>;
  }
  const selectSort = (field: typeof sort) => { if (sort === field) setAsc(value => !value); else { setSort(field); setAsc(true); } };
  const header = (field: typeof sort, label: string) => <button type="button" onClick={() => selectSort(field)}>{label}<ArrowUpDown size={13}/></button>;
  return <div><PageHeader title="Deals" action={canWriteDemo(runtime.isDemo, currentUser?.role) ? {label:"New deal",path:"/crm/deals/new"} : undefined}/>
    <section className="prototype-panel"><div className="prototype-controls">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search deals" placeholder="Deal, business or next action" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <label>Status <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All</option>{["Open","Won","Lost"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Stage <select value={stage} onChange={event => setStage(event.target.value)}><option value="all">All stages</option>{stages.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Owner <select value={owner} onChange={event => setOwner(event.target.value)}><option value="all">All visible reps</option>{[...new Set(accessible.map(deal => deal.ownerId))].map(id => <option key={id} value={id}>{names.get(id) ?? id}</option>)}</select></label>
      <button type="button" onClick={() => setLayout(layout === "list" ? "board" : "list")}>{layout === "list" ? "Board view" : "List view"}</button>
      <button type="button" disabled={!rows.length} onClick={() => downloadCsv("momentum-visible-deals.csv",dealCsvRows(rows,scope.accounts,data.users),dealCsvColumns)}>Download CSV</button>
    </div>
    {layout === "board" ? <div className="prototype-columns">{stages.map(column => <section key={column} className="prototype-panel"><h2>{column} ({rows.filter(deal => deal.stage === column).length})</h2>
      {rows.filter(deal => deal.stage === column).map(deal => <p key={deal.id} className="prototype-activity"><button type="button" className="prototype-link" onClick={() => link("/crm/deals/" + encodeURIComponent(deal.id))}>{deal.name}</button><span>{accounts.get(deal.locationId)?.name ?? "Restricted"} · {deal.nextActionDate || "No follow-up"}</span></p>)}
    </section>)}</div> : <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      <th>{header("name","Deal")}</th><th>Business</th><th>{header("stage","Stage")}</th><th>Owner</th>
      <th>{header("expectedCloseDate","Expected close")}</th><th>{header("nextActionDate","Follow-up")}</th><th>Estimated cases</th>
    </tr></thead><tbody>{rows.map(deal => <tr key={deal.id}>
      <td><button type="button" className="prototype-link" onClick={() => link("/crm/deals/" + encodeURIComponent(deal.id))}>{deal.name}</button></td>
      <td>{accounts.get(deal.locationId)?.name ?? "Restricted"}</td><td>{deal.stage}</td>
      <td>{names.get(deal.ownerId) ?? "Unavailable"}</td><td>{deal.expectedCloseDate ?? "None"}</td><td>{deal.nextActionDate ?? "None"}</td><td>{deal.estimatedCases ?? "None"}</td>
    </tr>)}</tbody></table></div>}
    {!rows.length && <div className="prototype-empty">No matching recorded deals.</div>}
  </section></div>;
}

function ContactForm() {
  const { scope, currentUser } = useWorkspace();
  const { addContact } = useCrm();
  const runtime = useRuntimeMode();
  const locations = scope.accounts.filter(account => Boolean(account.customerId));
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [decisionRole, setDecisionRole] = useState<CrmContact["decisionRole"]>("Decision maker");
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState("");
  if (!canWriteDemo(runtime.isDemo,currentUser?.role)) return <section className="prototype-panel">Contact changes are disabled against connected business data.</section>;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = locations.find(value => value.id === locationId);
    if (!account?.customerId || !name.trim() || !role.trim()) { setError("Choose a linked location and enter a name and role."); return; }
    const id = addContact({scope:"Location",customerId:account.customerId,locationId:account.id,name:name.trim(),role:role.trim(),email:email.trim() || undefined,phone:phone.trim() || undefined,decisionRole,primary,active:true});
    if (!id) { setError("Contact could not be saved with these permissions."); return; }
    link("/crm/contacts/" + encodeURIComponent(id));
  };
  return <div><PageHeader title="New contact" back="/crm/contacts"/><section className="prototype-panel"><form className="prototype-controls" onSubmit={submit}>
    <label>Business <select value={locationId} onChange={event => setLocationId(event.target.value)} required>{locations.map(account => <option key={account.id} value={account.id}>{account.name} · {account.location}</option>)}</select></label>
    <label>Name <input required maxLength={140} value={name} onChange={event => setName(event.target.value)}/></label>
    <label>Role <input required maxLength={100} value={role} onChange={event => setRole(event.target.value)}/></label>
    <label>Decision role <select value={decisionRole} onChange={event => setDecisionRole(event.target.value as CrmContact["decisionRole"])}>{["Decision maker","Influencer","Billing","Operations","Other"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Email <input type="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
    <label>Phone <input type="tel" value={phone} onChange={event => setPhone(event.target.value)}/></label>
    <label><input type="checkbox" checked={primary} onChange={event => setPrimary(event.target.checked)}/> Primary contact</label>
    {error && <p role="alert">{error}</p>}<button type="submit" disabled={!locations.length}>Create contact</button>
  </form></section></div>;
}

export function CrmContactsExperience({ id, create = false }: { id?: string; create?: boolean }) {
  const { scope, currentUser } = useWorkspace();
  const { crm } = useCrm();
  const runtime = useRuntimeMode();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "role" | "decisionRole">("name");
  const [ascending, setAscending] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);
  const accessible = useMemo(() => visibleContacts(crm.contacts,scope.accounts,currentUser), [crm.contacts,scope.accounts,currentUser]);
  const locationById = useMemo(() => new Map(scope.accounts.map(account => [account.id,account])), [scope.accounts]);
  const getLocation = (contact: CrmContact) => contact.locationId ? locationById.get(contact.locationId) : scope.accounts.find(account => Boolean(account.customerId && account.customerId === contact.customerId));
  const rows = accessible.filter(contact => (!activeOnly || contact.active) && [contact.name,contact.role,contact.email,contact.phone,getLocation(contact)?.name].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b) => (ascending ? 1 : -1) * (String(a[sort]).localeCompare(String(b[sort]),undefined,{numeric:true}) || a.id.localeCompare(b.id)));
  if (create) return <ContactForm/>;
  if (id) {
    const contact = accessible.find(record => record.id === id);
    if (!contact) return <section className="prototype-panel">Contact not found or inaccessible.</section>;
    const location = getLocation(contact);
    const activities = crm.interactions.filter(item => item.contactId === contact.id && (!contact.locationId || item.locationId === contact.locationId));
    return <div><PageHeader title={contact.name} back="/crm/contacts"/><div className="prototype-columns">
      <section className="prototype-panel"><h2>Contact</h2><dl className="prototype-facts">
        <div><dt>Role</dt><dd>{contact.role}</dd></div><div><dt>Decision role</dt><dd>{contact.decisionRole}</dd></div>
        <div><dt>Email</dt><dd>{contact.email ?? "Not recorded"}</dd></div><div><dt>Phone</dt><dd>{contact.phone ?? "Not recorded"}</dd></div>
        <div><dt>Status</dt><dd>{contact.active ? "Active" : "Inactive"}</dd></div>
        <div><dt>Business</dt><dd>{location ? <button type="button" className="prototype-link" onClick={() => link("/sales/customers/" + encodeURIComponent(location.id))}>{location.name}</button> : "Restricted"}</dd></div>
      </dl></section><section className="prototype-panel"><h2>Linked interactions</h2>
      {activities.map(activity => <p key={activity.id} className="prototype-activity"><strong>{activity.type} · {activity.occurredAt.slice(0,10)}</strong><span>{activity.summary}</span></p>)}
      {!activities.length && <p>No linked interactions.</p>}
      </section></div></div>;
  }
  const header = (field: typeof sort, label: string) => <button type="button" onClick={() => { if (sort === field) setAscending(value => !value); else { setSort(field);setAscending(true); } }}>{label}<ArrowUpDown size={13}/></button>;
  return <div><PageHeader title="Contacts" action={canWriteDemo(runtime.isDemo,currentUser?.role) ? {label:"New contact",path:"/crm/contacts/new"} : undefined}/>
    <section className="prototype-panel"><div className="prototype-controls">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search contacts" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, business, role, email or phone"/></label>
      <label><input type="checkbox" checked={activeOnly} onChange={event => setActiveOnly(event.target.checked)}/> Active only</label>
      <button type="button" disabled={!rows.length} onClick={() => downloadCsv("momentum-visible-contacts.csv",contactCsvRows(rows,scope.accounts),contactCsvColumns)}>Download CSV</button>
    </div>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      <th>{header("name","Contact")}</th><th>Business</th><th>{header("role","Role")}</th><th>{header("decisionRole","Decision role")}</th><th>Email</th><th>Phone</th><th>Status</th>
    </tr></thead><tbody>{rows.map(contact => <tr key={contact.id}>
      <td><button type="button" className="prototype-link" onClick={() => link("/crm/contacts/" + encodeURIComponent(contact.id))}>{contact.name}</button></td>
      <td>{getLocation(contact)?.name ?? "Restricted"}</td><td>{contact.role}</td><td>{contact.decisionRole}</td><td>{contact.email ?? "None"}</td><td>{contact.phone ?? "None"}</td><td>{contact.active ? "Active" : "Inactive"}</td>
    </tr>)}</tbody></table></div>
    {!rows.length && <div className="prototype-empty">No matching recorded contacts.</div>}
    <p className="prototype-note">{rows.length} authorized contacts.</p>
    </section></div>;
}
