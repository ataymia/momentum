"use client";

import { BookOpenCheck, CircleHelp, ClipboardCheck, Search, ShieldCheck } from "lucide-react";
import { canAccessPage } from "../../lib/access";
import type { PageKey, Role } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, PageHeader, Section, StatusPill } from "../ui";

type RoleGuide = {
  heading: string;
  summary: string;
  priorities: string[];
  guardrails: string[];
};

const roleGuides: Partial<Record<Role, RoleGuide>> = {
  Administrator: {
    heading: "Administrator",
    summary: "Keep the company workspace accurate, resolve blocked workflows, maintain access, and use the source record before making an override.",
    priorities: [
      "Start with My Work and Human Resources for anything waiting on a company decision.",
      "Use Administration for access, integrations, audit tools, and system controls.",
      "Use department pages to correct the source record instead of patching symptoms somewhere else.",
      "Use Audit trail when you need to confirm who changed a record and what changed.",
    ],
    guardrails: [
      "Use overrides only when the normal workflow cannot reasonably be completed.",
      "Do not erase operational history to make a record look cleaner.",
      "Keep role access narrow. Give people the tools their job requires, not broad Administrator access.",
    ],
  },
  "Sales Manager": {
    heading: "Sales Manager",
    summary: "Manage the sales team, keep field work moving, review submitted work, and make sure account follow-up is happening on time.",
    priorities: [
      "Start with My Work for approvals, returned items, and team exceptions.",
      "Use CRM & Sales to review locations, ownership, notes, next actions, and order activity.",
      "Use Dispatch to assign and monitor scheduled field work.",
      "Use Performance & reports to review team output and submitted reports.",
    ],
    guardrails: [
      "Open the source record before approving or returning work.",
      "A manager cannot approve their own submission.",
      "Team access does not include company administration, inventory control, or executive financial controls.",
    ],
  },
  "Sales Representative": {
    heading: "Sales Representative",
    summary: "Work assigned locations, document every customer touch, keep next actions current, complete appointments, and submit accurate orders and field records.",
    priorities: [
      "Check Home and My Work at the start of the day.",
      "Use Dispatch for assigned appointments and complete the visit closeout before moving on.",
      "Keep CRM notes, contacts, next actions, and location details current.",
      "Use Orders for new orders and order status within your assigned accounts.",
    ],
    guardrails: [
      "You only see sales records in your scope.",
      "Do not create a duplicate location. Search first and update the existing record when it already exists.",
      "A completed visit needs an outcome, a useful note, and the next action when follow-up is required.",
    ],
  },
  "Brand Ambassador": {
    heading: "Brand Ambassador",
    summary: "Use Momentum as your event and training home. Your schedule only contains work Momentum has actually assigned to you.",
    priorities: [
      "Check My schedule for your upcoming event date, time, address, and instructions.",
      "Open assigned training before the event when a module is required.",
      "Use the event details in Momentum as the source of truth for where and when to report.",
    ],
    guardrails: [
      "There is no open-job marketplace in Momentum. Your page shows assigned work only.",
      "Customer records, orders, payroll administration, and employee records are intentionally outside Brand Ambassador access.",
    ],
  },
  Operations: {
    heading: "Operations",
    summary: "Move approved orders through fulfillment, protect inventory accuracy, document custody changes, handle delivery work, and resolve inventory exceptions with a record behind every movement.",
    priorities: [
      "Start with My Work and the Dispatch board for delivery or operations work that needs attention.",
      "Use Orders & billing for fulfillment status and handoffs.",
      "Use Inventory & fulfillment for lots, holds, reservations, movements, and physical counts.",
      "Use the employee self-service areas available to you for your own workforce records.",
    ],
    guardrails: [
      "Do not mark an order paid because it was delivered. Payment settlement is a separate event.",
      "Inventory should not move without a recorded source, destination, quantity, reason, and actor.",
      "Sales notes and unrelated sales execution stay outside Operations scope.",
    ],
  },
  Warehouse: {
    heading: "Warehouse",
    summary: "Keep physical inventory and fulfillment records aligned with what actually moved through the warehouse.",
    priorities: [
      "Use Inventory & fulfillment for lot, reservation, movement, and count records.",
      "Use Orders to see the fulfillment work that is ready for warehouse action.",
      "Complete your own workforce records through the employee areas available to you.",
    ],
    guardrails: [
      "Do not move inventory without a recorded movement.",
      "Do not change customer sales records to solve a warehouse exception.",
    ],
  },
  Customer: {
    heading: "Customer / Retail Partner",
    summary: "Use the portal to review the linked business account, place orders, and follow order status without access to internal company records.",
    priorities: [
      "Use Account overview for the current relationship and recent order status.",
      "Use My account for the business information Momentum has linked to your portal.",
      "Use My orders to place an order or review order history.",
    ],
    guardrails: [
      "The portal only shows records linked to your business.",
      "Internal notes, employee information, payroll, accounting, inventory controls, and company reports are not customer-visible.",
    ],
  },
};

const faq = [
  ["Where should I start?", "Start on Home. It shows the work, updates, and exceptions that apply to your role. If something needs a decision or follow-up, My Work is the next place to check."],
  ["How do I find a record quickly?", "Use Search records in the left menu or press Command K on Mac / Control K on Windows. Search results are limited to records you are allowed to see."],
  ["Why can’t I see a page someone else can see?", "Access is role-based. The menu only shows areas that are relevant to your job and authority. If you believe access is wrong, ask your manager or an administrator instead of working around it."],
  ["What is the difference between a customer and a location?", "The customer is the parent business relationship. A location is the specific store, office, franchise, or site where work happens. Orders, appointments, responsibility, and sales activity can belong to one location without assigning the entire customer relationship to that person."],
  ["How do approvals work?", "Open the underlying order, timecard, request, or other source record first. Approve only after the record is complete. Return it when a correction is needed. The history keeps the decision and actor."],
  ["Where can I see what changed?", "Managers and administrators can use the audit/history views for detailed changes. Other users see the operational changes that matter to their own work, such as a reschedule, status change, or returned item."],
  ["What do notifications mean?", "Notifications describe the business change in plain language and point you toward the record that changed or needs attention."],
  ["Can I delete or reset live company records?", "No. Production corrections should preserve history instead of erasing it. Administrators have specific recovery and override controls for workflows that become blocked."],
] as const;

const platformBasics = [
  { label: "Start", title: "Home", detail: "Your current work, updates, goals, and exceptions." },
  { label: "Act", title: "My Work", detail: "Approvals, exceptions, and items waiting on you." },
  { label: "Find", title: "Search", detail: "Command K / Control K searches the records in your scope.", icon: true },
  { label: "Verify", title: "History", detail: "Check the audit trail before guessing who changed something." },
];

export function HelpPage() {
  const { currentUser, navigate } = useWorkspace();
  if (!currentUser) return null;
  const guide = roleGuides[currentUser.role];
  const allQuickLinks: Array<{ label: string; page: PageKey }> = [
    { label: "Home", page: "home" },
    { label: "My Work", page: "work" },
    { label: "CRM & Sales", page: "accounts" },
    { label: "Dispatch", page: "dispatch" },
    { label: "Orders", page: "orders" },
    { label: "Human Resources", page: "people" },
    { label: "Brand Ambassadors", page: "brandAmbassadors" },
    { label: "Reports", page: "reports" },
    { label: "Administration", page: "settings" },
  ];
  const quickLinks = allQuickLinks.filter((item) => canAccessPage(currentUser, item.page));

  return <div className="page page--help">
    <PageHeader
      eyebrow="Help & training"
      title="How to use Momentum"
      description="A role-aware guide to the screens you use, the records you control, and the quickest path when you need help."
      actions={<StatusPill tone="info">{currentUser.title}</StatusPill>}
    />

    {guide && <section className="help-role-grid" aria-label={`${guide.heading} guide`}>
      <article className="help-role-card help-role-card--primary">
        <header><ClipboardCheck size={20}/><div><span>Your workflow</span><h2>{guide.heading}</h2></div></header>
        <p>{guide.summary}</p>
        <ol>{guide.priorities.map((item) => <li key={item}><span aria-hidden="true"/><p>{item}</p></li>)}</ol>
      </article>
      <article className="help-role-card help-role-card--guardrails">
        <header><ShieldCheck size={20}/><div><span>Guardrails</span><h2>Keep records clean</h2></div></header>
        <ul>{guide.guardrails.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
    </section>}

    <Section title="Platform basics" description="Four habits keep most Momentum workflows simple." className="help-section">
      <div className="help-basics-grid">{platformBasics.map((item) => <article key={item.label}>
        <span>{item.label}</span>
        <strong>{item.icon && <Search size={16}/>} {item.title}</strong>
        <p>{item.detail}</p>
      </article>)}</div>
    </Section>

    <Section title="Quick links" description="Jump directly to the parts of Momentum available to your role." className="help-section help-quick-links-section">
      <div className="help-quick-links">{quickLinks.map((item) => <Button key={item.page} size="sm" variant="secondary" onClick={() => navigate(item.page)}>{item.label}</Button>)}</div>
    </Section>

    <div className="help-lower-grid">
      <Section title="Training library" description="Platform orientation and assigned job training serve different purposes." className="help-section">
        <div className="help-training-list">
          <article><BookOpenCheck size={18}/><div><strong>Finding records and understanding access</strong><p>Use global search, role-based navigation, and record history without working around permissions.</p></div></article>
          <article><BookOpenCheck size={18}/><div><strong>Customer, location, and job structure</strong><p>Keep the parent business separate from the specific site where the appointment, order, placement, or delivery occurred.</p></div></article>
          <article><BookOpenCheck size={18}/><div><strong>Approvals and corrections</strong><p>Review the source record, make the decision, and preserve the correction trail instead of deleting history.</p></div></article>
          <article><BookOpenCheck size={18}/><div><strong>Assigned department training</strong><p>Role-specific playbooks, product training, videos, documents, and required materials appear in your assigned training.</p></div></article>
        </div>
      </Section>

      <Section title="Frequently asked questions" description="Open only the answer you need." className="help-section">
        <div className="help-faq-list">{faq.map(([question, answer]) => <details key={question}>
          <summary><CircleHelp size={17}/><span>{question}</span></summary>
          <p>{answer}</p>
        </details>)}</div>
      </Section>
    </div>
  </div>;
}
