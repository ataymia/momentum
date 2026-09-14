"use client";

import { ContactRound, MessageSquareText, Plus, Target, UserRoundCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import type { CrmContact, CrmInteraction, Opportunity, OpportunityStage } from "../../lib/crm-engine";
import { useCrm } from "../../lib/crm-context";
import { customerForLocation } from "../../lib/crm-hierarchy";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill, formatDate } from "../ui";

const openOpportunityStages: OpportunityStage[] = ["Prospecting", "Qualified", "Sample / evaluation", "Commercial review", "Order pending"];
const opportunityTone = (status: Opportunity["status"]) => status === "Won" ? "success" as const : status === "Lost" ? "danger" as const : "info" as const;

export function CrmDepthPanel({ accountId }: { accountId?: string } = {}) {
  const { data, scope, currentUser } = useWorkspace();
  const { crm, addContact, addInteraction, addOpportunity, updateOpportunity } = useCrm();
  const selected = accountId ? scope.accounts.find((item) => item.id === accountId) : undefined;
  const customer = selected ? customerForLocation(data, selected) : undefined;
  const [contactOpen, setContactOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [lostOpportunityId, setLostOpportunityId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [error, setError] = useState("");
  const [contactForm, setContactForm] = useState({ scope: "Location" as CrmContact["scope"], name: "", role: "", email: "", phone: "", decisionRole: "Decision maker" as CrmContact["decisionRole"], primary: false });
  const [interactionForm, setInteractionForm] = useState({ type: "Call" as CrmInteraction["type"], summary: "", outcome: "", nextAction: "", nextActionDate: "", contactId: "" });
  const [opportunityForm, setOpportunityForm] = useState({ name: "", stage: "Prospecting" as OpportunityStage, estimatedCases: "", expectedCloseDate: "", nextAction: "", nextActionDate: "" });

  if (!selected || !customer) return null;

  const contacts = crm.contacts
    .filter((contact) => contact.customerId === customer.id && (!contact.locationId || contact.locationId === selected.id))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  const interactions = crm.interactions.filter((item) => item.locationId === selected.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const opportunities = crm.opportunities.filter((item) => item.locationId === selected.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const responsibility = crm.responsibilityHistory.filter((item) => item.locationId === selected.id).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
  const canBuild = Boolean(currentUser && ["Administrator", "Sales Manager", "Sales Representative"].includes(currentUser.role));

  const addContactSubmit = (event: FormEvent) => {
    event.preventDefault();
    const id = addContact({ scope: contactForm.scope, customerId: customer.id, locationId: contactForm.scope === "Location" ? selected.id : undefined, name: contactForm.name.trim(), role: contactForm.role.trim(), email: contactForm.email.trim() || undefined, phone: contactForm.phone.trim() || undefined, decisionRole: contactForm.decisionRole, primary: contactForm.primary, active: true });
    if (!id) { setError("This contact could not be saved. Verify its customer/location scope and required fields."); return; }
    setContactOpen(false);
    setError("");
    setContactForm({ scope: "Location", name: "", role: "", email: "", phone: "", decisionRole: "Decision maker", primary: false });
  };

  const addInteractionSubmit = (event: FormEvent) => {
    event.preventDefault();
    const id = addInteraction({ locationId: selected.id, type: interactionForm.type, summary: interactionForm.summary.trim(), outcome: interactionForm.outcome.trim() || undefined, nextAction: interactionForm.nextAction.trim() || undefined, nextActionDate: interactionForm.nextActionDate || undefined, contactId: interactionForm.contactId || undefined });
    if (!id) { setError("This interaction could not be saved. A linked contact must belong to this customer/location, and a next action must include its date."); return; }
    setInteractionOpen(false);
    setError("");
    setInteractionForm({ type: "Call", summary: "", outcome: "", nextAction: "", nextActionDate: "", contactId: "" });
  };

  const addOpportunitySubmit = (event: FormEvent) => {
    event.preventDefault();
    const id = addOpportunity({ customerId: customer.id, locationId: selected.id, name: opportunityForm.name.trim(), stage: opportunityForm.stage, ownerId: selected.ownerId, estimatedCases: opportunityForm.estimatedCases ? Number(opportunityForm.estimatedCases) : undefined, expectedCloseDate: opportunityForm.expectedCloseDate || undefined, nextAction: opportunityForm.nextAction.trim(), nextActionDate: opportunityForm.nextActionDate, status: "Open", lossReason: undefined });
    if (!id) { setError("This opportunity could not be created. It must start open, use the account's canonical owner, and include a valid next action and date."); return; }
    setOpportunityOpen(false);
    setError("");
    setOpportunityForm({ name: "", stage: "Prospecting", estimatedCases: "", expectedCloseDate: "", nextAction: "", nextActionDate: "" });
  };

  const moveOpportunity = (opportunity: Opportunity, stage: OpportunityStage) => {
    const result = updateOpportunity(opportunity.id, { stage, status: "Open" });
    setError(result.ok ? "" : result.message ?? "Opportunity stage could not be changed.");
  };

  const markWon = (opportunity: Opportunity) => {
    const result = updateOpportunity(opportunity.id, { stage: "Won", status: "Won" });
    setError(result.ok ? "" : result.message ?? "Opportunity could not be marked won.");
  };

  const submitLost = (event: FormEvent) => {
    event.preventDefault();
    if (!lostOpportunityId) return;
    const result = updateOpportunity(lostOpportunityId, { stage: "Lost", status: "Lost", lossReason });
    if (!result.ok) { setError(result.message ?? "Opportunity could not be closed lost."); return; }
    setLostOpportunityId(null);
    setLossReason("");
    setError("");
  };

  return <div className="account-crm-details">
    {error && <div className="form-callout"><p role="alert">{error}</p></div>}
    <div className="company-grid company-grid--two">
      <Section title="Contacts" action={canBuild ? <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={() => { setError(""); setContactOpen(true); }}>Add contact</Button> : undefined}>
        <div className="company-request-list">{contacts.slice(0, 12).map((contact) => <article key={contact.id}><span><ContactRound size={17}/></span><div><small>{contact.scope}</small><strong>{contact.name}{contact.primary ? " · Primary" : ""}</strong><p>{contact.role} · {contact.decisionRole}{contact.email ? ` · ${contact.email}` : ""}{contact.phone ? ` · ${contact.phone}` : ""}</p></div><StatusPill tone={contact.active ? "success" : "neutral"}>{contact.active ? "Active" : "Inactive"}</StatusPill></article>)}{contacts.length === 0 && <div className="review-empty"><ContactRound size={23}/><p>No contacts recorded.</p></div>}</div>
      </Section>
      <Section title="Responsibility history">
        <div className="hcm-audit-list">{responsibility.slice(0, 12).map((entry) => { const from = data.users.find((item) => item.id === entry.fromUserId); const to = data.users.find((item) => item.id === entry.toUserId); const actor = data.users.find((item) => item.id === entry.changedBy); return <article key={entry.id}><span><UserRoundCheck size={16}/></span><div><strong>{from?.name ?? "Unassigned"} → {to?.name ?? "Unknown"}</strong><p>{entry.reason} · changed by {actor?.name ?? "System"}</p><small>{formatDate(entry.effectiveAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</small></div>{entry.acceptedAt && <StatusPill tone="success">Accepted</StatusPill>}</article>; })}{responsibility.length === 0 && <div className="review-empty"><UserRoundCheck size={23}/><p>No responsibility changes recorded.</p></div>}</div>
      </Section>
    </div>

    <div className="company-grid company-grid--two">
      <Section title="Interaction history" action={canBuild ? <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={() => { setError(""); setInteractionOpen(true); }}>Log interaction</Button> : undefined}>
        <div className="mini-timeline">{interactions.slice(0, 12).map((item) => <article key={item.id}><i/><div><strong>{item.type}: {item.summary}</strong><p>{item.outcome || "No outcome note"}{item.nextAction ? ` Next: ${item.nextAction}${item.nextActionDate ? ` on ${item.nextActionDate}` : ""}.` : ""}</p><small>{data.users.find((user) => user.id === item.userId)?.name ?? "User"} · {formatDate(item.occurredAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div></article>)}{interactions.length === 0 && <div className="review-empty"><MessageSquareText size={23}/><p>No interactions recorded.</p></div>}</div>
      </Section>
      <Section title="Opportunities" action={canBuild ? <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={() => { setError(""); setOpportunityOpen(true); }}>New opportunity</Button> : undefined}>
        <div className="company-request-list">{opportunities.slice(0, 12).map((opportunity) => { const owner = data.users.find((user) => user.id === opportunity.ownerId); return <article key={opportunity.id}><span><Target size={17}/></span><div><small>{opportunity.stage}{opportunity.expectedCloseDate ? ` · expected ${formatDate(opportunity.expectedCloseDate, { month: "short", day: "numeric" })}` : ""}</small><strong>{opportunity.name}</strong><p>{opportunity.estimatedCases ? `${opportunity.estimatedCases} estimated cases · ` : ""}{opportunity.status === "Lost" ? `Lost: ${opportunity.lossReason ?? "reason missing"}` : `Next: ${opportunity.nextAction} · ${opportunity.nextActionDate}`} · Owner: {owner?.name ?? "Unknown"}</p></div><StatusPill tone={opportunityTone(opportunity.status)}>{opportunity.status}</StatusPill>{opportunity.status === "Open" && <div className="request-actions"><select value={opportunity.stage} onChange={(event) => moveOpportunity(opportunity, event.target.value as OpportunityStage)}>{openOpportunityStages.map((stage) => <option key={stage}>{stage}</option>)}</select><Button size="sm" onClick={() => markWon(opportunity)}>Mark won</Button><Button size="sm" variant="danger" onClick={() => { setLossReason(""); setError(""); setLostOpportunityId(opportunity.id); }}>Close lost</Button></div>}</article>; })}{opportunities.length === 0 && <div className="review-empty"><Target size={23}/><p>No opportunities recorded.</p></div>}</div>
      </Section>
    </div>

    <Modal open={contactOpen} title="Add contact" onClose={() => setContactOpen(false)} footer={<><Button variant="ghost" onClick={() => setContactOpen(false)}>Cancel</Button><Button type="submit" form="crm-contact-form">Add contact</Button></>}><form id="crm-contact-form" className="form-grid" onSubmit={addContactSubmit}><Field label="Scope"><select value={contactForm.scope} onChange={(event) => setContactForm({ ...contactForm, scope: event.target.value as CrmContact["scope"] })}><option>Location</option><option>Customer</option></select></Field><Field label="Name"><input required value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })}/></Field><Field label="Role / title"><input required value={contactForm.role} onChange={(event) => setContactForm({ ...contactForm, role: event.target.value })}/></Field><Field label="Decision role"><select value={contactForm.decisionRole} onChange={(event) => setContactForm({ ...contactForm, decisionRole: event.target.value as CrmContact["decisionRole"] })}><option>Decision maker</option><option>Influencer</option><option>Billing</option><option>Operations</option><option>Other</option></select></Field><Field label="Email"><input type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })}/></Field><Field label="Phone"><input value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })}/></Field><Field label="Primary contact"><select value={contactForm.primary ? "yes" : "no"} onChange={(event) => setContactForm({ ...contactForm, primary: event.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select></Field>{error && <p className="form-error field--full" role="alert">{error}</p>}</form></Modal>

    <Modal open={interactionOpen} title="Log interaction" onClose={() => setInteractionOpen(false)} footer={<><Button variant="ghost" onClick={() => setInteractionOpen(false)}>Cancel</Button><Button type="submit" form="crm-interaction-form">Save interaction</Button></>}><form id="crm-interaction-form" className="form-grid" onSubmit={addInteractionSubmit}><Field label="Type"><select value={interactionForm.type} onChange={(event) => setInteractionForm({ ...interactionForm, type: event.target.value as CrmInteraction["type"] })}><option>Call</option><option>Email</option><option>Text</option><option>Visit</option><option>Sample</option><option>Note</option></select></Field><Field label="Contact"><select value={interactionForm.contactId} onChange={(event) => setInteractionForm({ ...interactionForm, contactId: event.target.value })}><option value="">Not linked</option>{contacts.filter((contact) => contact.active).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></Field><Field label="Summary" className="field--full"><input required value={interactionForm.summary} onChange={(event) => setInteractionForm({ ...interactionForm, summary: event.target.value })}/></Field><Field label="Outcome" className="field--full"><input value={interactionForm.outcome} onChange={(event) => setInteractionForm({ ...interactionForm, outcome: event.target.value })}/></Field><Field label="Next action"><input value={interactionForm.nextAction} onChange={(event) => setInteractionForm({ ...interactionForm, nextAction: event.target.value })}/></Field><Field label="Next-action date"><input type="date" value={interactionForm.nextActionDate} onChange={(event) => setInteractionForm({ ...interactionForm, nextActionDate: event.target.value })}/></Field>{error && <p className="form-error field--full" role="alert">{error}</p>}</form></Modal>

    <Modal open={opportunityOpen} title="New opportunity" description="New opportunities start open and inherit the account's current owner." onClose={() => setOpportunityOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpportunityOpen(false)}>Cancel</Button><Button type="submit" form="crm-opportunity-form">Create opportunity</Button></>}><form id="crm-opportunity-form" className="form-grid" onSubmit={addOpportunitySubmit}><Field label="Opportunity name" className="field--full"><input required value={opportunityForm.name} onChange={(event) => setOpportunityForm({ ...opportunityForm, name: event.target.value })}/></Field><Field label="Stage"><select value={opportunityForm.stage} onChange={(event) => setOpportunityForm({ ...opportunityForm, stage: event.target.value as OpportunityStage })}>{openOpportunityStages.map((stage) => <option key={stage}>{stage}</option>)}</select></Field><Field label="Estimated cases"><input type="number" min="0" value={opportunityForm.estimatedCases} onChange={(event) => setOpportunityForm({ ...opportunityForm, estimatedCases: event.target.value })}/></Field><Field label="Expected close"><input type="date" value={opportunityForm.expectedCloseDate} onChange={(event) => setOpportunityForm({ ...opportunityForm, expectedCloseDate: event.target.value })}/></Field><Field label="Next action"><input required value={opportunityForm.nextAction} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextAction: event.target.value })}/></Field><Field label="Next-action date"><input required type="date" value={opportunityForm.nextActionDate} onChange={(event) => setOpportunityForm({ ...opportunityForm, nextActionDate: event.target.value })}/></Field>{error && <p className="form-error field--full" role="alert">{error}</p>}</form></Modal>

    <Modal open={Boolean(lostOpportunityId)} title="Close opportunity lost" description="Record why the opportunity was lost. The reason becomes part of the CRM history." onClose={() => setLostOpportunityId(null)} footer={<><Button variant="ghost" onClick={() => setLostOpportunityId(null)}>Cancel</Button><Button type="submit" form="crm-lost-form" variant="danger">Close lost</Button></>}><form id="crm-lost-form" className="form-grid" onSubmit={submitLost}><Field label="Loss reason" className="field--full"><textarea rows={4} required value={lossReason} onChange={(event) => setLossReason(event.target.value)} placeholder="Example: Buyer declined the opening order after commercial review."/></Field>{error && <p className="form-error field--full" role="alert">{error}</p>}</form></Modal>
  </div>;
}
