"use client";

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  GitBranch,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, Section, StatusPill } from "../ui";

const register = [
  { domain: "Company", item: "Legal operating entity and Golden Eagle–Momentum relationship", owner: "Flo", status: "Unverified", priority: "Blocking" },
  { domain: "Rights", item: "Arizona distribution rights, territory, exclusivity, and restrictions", owner: "Flo / counsel", status: "Unverified", priority: "Blocking" },
  { domain: "Product", item: "Sellable SKU, formula, label, UPC, case/pallet/container quantities", owner: "Product owner", status: "Unverified", priority: "Blocking" },
  { domain: "Economics", item: "True landed cost and cost-to-serve by channel", owner: "Finance", status: "Working estimate", priority: "Blocking" },
  { domain: "Commercial", item: "Approved price books, terms, returns, rebates, and trade spend", owner: "Flo", status: "Proposed", priority: "High" },
  { domain: "Import", item: "Importer of record, FSVP importer, supplier, broker, and warehouse", owner: "Operations / counsel", status: "Unverified", priority: "Blocking" },
  { domain: "People", item: "Reporting authority, worker classifications, payroll calendar, and provider", owner: "Flo / HR", status: "Open", priority: "High" },
  { domain: "Technology", item: "Long-term product, technical, security, and admin ownership", owner: "Flo / Mia", status: "Open", priority: "High" },
];

const decisions = [
  { decision: "Web-first provider-neutral platform", state: "Selected direction", owner: "Mia / Flo", effect: "Architecture" },
  { decision: "Release 1 includes CRM, jobs, schedule, dispatch, and field closeout", state: "Working decision", owner: "Mia", effect: "Scope" },
  { decision: "Minimal weekly timekeeping moves into Release 1C", state: "Working decision", owner: "Mia", effect: "Scope" },
  { decision: "Event-based GPS for MVP", state: "Recommended", owner: "Flo", effect: "Policy" },
  { decision: "Provider-hosted payments; no raw card data", state: "Recommended", owner: "Flo / Finance", effect: "Risk" },
];

export function KnowledgePage() {
  const [tab, setTab] = useState<"register" | "decisions" | "architecture">("register");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return register.filter((item) => !normalized || `${item.domain} ${item.item} ${item.owner}`.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="page page--knowledge">
      <PageHeader
        eyebrow="Governance & source of truth"
        title="Knowledge & controls"
        description="Facts, assumptions, decisions, policies, and process ownership stay visibly different."
        actions={<StatusPill tone="warning">8 foundational unknowns</StatusPill>}
      />

      <div className="knowledge-tabs">
        <button className={tab === "register" ? "is-active" : ""} onClick={() => setTab("register")}><BookOpen size={17} /> Fact register</button>
        <button className={tab === "decisions" ? "is-active" : ""} onClick={() => setTab("decisions")}><FileCheck2 size={17} /> Decision log</button>
        <button className={tab === "architecture" ? "is-active" : ""} onClick={() => setTab("architecture")}><GitBranch size={17} /> Operating architecture</button>
      </div>

      {tab === "register" && (
        <Section title="Foundational discovery register" description="Unknowns stay visible until evidence changes their status" className="fact-register">
          <label className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search facts, owners, or domains…" /></label>
          <div className="fact-table fact-table--head"><span>Domain</span><span>Required fact</span><span>Owner</span><span>Evidence state</span><span>Priority</span></div>
          {filtered.map((item) => (
            <div className="fact-table" key={item.item}><span><strong>{item.domain}</strong></span><span>{item.item}</span><span><UserRound size={14} /> {item.owner}</span><span><StatusPill tone={item.status === "Unverified" ? "danger" : "warning"} dot={false}>{item.status}</StatusPill></span><span><StatusPill tone={item.priority === "Blocking" ? "danger" : "warning"}>{item.priority}</StatusPill></span></div>
          ))}
          <div className="register-rule"><ShieldCheck size={18} /><div><strong>Control rule</strong><p>A polished plan never upgrades an assumption into a confirmed company fact.</p></div></div>
        </Section>
      )}

      {tab === "decisions" && (
        <Section title="Decision log" description="Working decisions remain reversible until the named owner confirms them" className="decision-log">
          {decisions.map((item, index) => (
            <article key={item.decision}><span>{String(index + 1).padStart(2, "0")}</span><div><StatusPill tone={item.state === "Selected direction" ? "success" : item.state === "Recommended" ? "gold" : "info"} dot={false}>{item.state}</StatusPill><h3>{item.decision}</h3><p>Decision owner: {item.owner}</p></div><strong>{item.effect}</strong><ChevronRight size={17} /></article>
          ))}
          <div className="decision-log__note"><AlertTriangle size={17} /><p>None of these decisions approves actual product claims, binding prices, compensation terms, legal policies, or external commitments.</p></div>
        </Section>
      )}

      {tab === "architecture" && (
        <>
          <Section title="Foundational record chain" description="Each record has its own owner, status, permissions, and audit history" className="architecture-chain-panel">
            <div className="architecture-chain">
              {["Account", "Location", "Opportunity", "Job", "Appointment"].map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong>{index < 4 && <ChevronRight size={18} />}</div>)}
            </div>
          </Section>
          <Section title="Commercial record chain" description="A later event never overwrites the meaning of an earlier one" className="architecture-chain-panel">
            <div className="architecture-chain architecture-chain--wrap">
              {["Opportunity", "Quote", "Approval", "Order", "Delivery", "Placement", "Observation", "Reorder"].map((item, index) => <div key={item}><span>{index + 1}</span><strong>{item}</strong>{index < 7 && <ChevronRight size={18} />}</div>)}
            </div>
          </Section>
          <div className="architecture-principles">
            <div><span><LockKeyhole size={19} /></span><div><strong>Least privilege</strong><p>Roles and record scope are enforced server-side—not hidden with CSS.</p></div></div>
            <div><span><GitBranch size={19} /></span><div><strong>Immutable history</strong><p>Transfers, corrections, approvals, and closes append events instead of erasing truth.</p></div></div>
            <div><span><CheckCircle2 size={19} /></span><div><strong>Provider boundaries</strong><p>Payments, payroll, accounting, identity, messaging, and e-signature stay replaceable.</p></div></div>
          </div>
        </>
      )}
    </div>
  );
}
