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
  ["What do the notifications mean?", "Notifications point you back to the record that changed or needs attention. In-app alerts work in the demo. Email and SMS delivery are prepared for integration but are not connected yet."],
  ["Can I delete or reset live company records?", "No. Demo data can be reset by an administrator. Production mode does not expose a reset button. Corrections should preserve history rather than erase it."],
];

export function HelpPage() {
  const { currentUser, navigate } = useWorkspace();
  if (!currentUser) return null;
  const guide = roleGuides[currentUser.role];
  const leadership = currentUser.role === "Administrator";
  const quickLinks: Array<{ label: string; page: PageKey }> = [
    { label: "Home", page: "home" },
    { label: "My Work", page: "work" },
    { label: "CRM & Sales", page: "accounts" },
    { label: "Dispatch", page: "dispatch" },
    { label: "Orders", page: "orders" },
    { label: "Human Resources", page: "people" },
    { label: "Reports", page: "reports" },
    { label: "Administration", page: "settings" },
  ].filter((item) => canAccessPage(currentUser, item.page));

  return <div className="page page--help">
    <PageHeader
      eyebrow="Help & training"
      title="How to use Momentum"
      description={leadership ? "A practical reference for the parts of the platform you may need to explain, review, or troubleshoot." : "A practical guide to your role, the screens you use most, and the rules that keep records clean."}
      actions={<StatusPill tone="info">Role: {currentUser.title}</StatusPill>}
    />

    {!leadership && guide && <div className="company-grid company-grid--two">
      <Section title={`Your role: ${guide.heading}`} description={guide.summary}>
        <div className="company-request-list">{guide.priorities.map((item, index) => <article key={item}><span><ClipboardCheck size={17}/></span><div><small>Step {index + 1}</small><strong>{item}</strong></div></article>)}</div>
      </Section>
      <Section title="What to keep in mind" description="These rules prevent most avoidable workflow problems.">
        <div className="company-request-list">{guide.guardrails.map((item) => <article key={item}><span><ShieldCheck size={17}/></span><div><strong>{item}</strong></div></article>)}</div>
      </Section>
    </div>}

    <Section title="Platform basics" description="The same habits apply across most roles.">
      <div className="company-rule-facts">
        <div><span>Start</span><strong>Home</strong><small>Current work, goals, updates, and exceptions</small></div>
        <div><span>Act</span><strong>My Work</strong><small>Items waiting on you or your team</small></div>
        <div><span>Find</span><strong><Search size={16}/> Search</strong><small>Command K / Control K searches your permitted records</small></div>
        <div><span>Verify</span><strong>History</strong><small>Use the record history before guessing who changed something</small></div>
      </div>
    </Section>

    <div className="company-grid company-grid--two">
      <Section title="Quick links" description="Open the areas available to your role.">
        <div className="request-actions">{quickLinks.map((item) => <Button key={item.page} size="sm" variant="secondary" onClick={() => navigate(item.page)}>{item.label}</Button>)}</div>
      </Section>
      <Section title="Training library" description="Platform training is separate from department job training.">
        <div className="company-request-list">
          <article><span><BookOpenCheck size={18}/></span><div><strong>Finding records and understanding access</strong><p>Use global search, role-based navigation, and record history without working around permissions.</p></div></article>
          <article><span><BookOpenCheck size={18}/></span><div><strong>Customer, location, and job structure</strong><p>Keep the parent business separate from the specific site where the appointment, order, placement, or delivery occurred.</p></div></article>
          <article><span><BookOpenCheck size={18}/></span><div><strong>Approvals and corrections</strong><p>Review the source record, make the decision, and preserve the correction trail instead of deleting history.</p></div></article>
          <article><span><BookOpenCheck size={18}/></span><div><strong>Department training</strong><p>Job-specific playbooks, policies, product training, and required acknowledgments are maintained as assigned employee training records.</p></div></article>
        </div>
      </Section>
    </div>

    <Section title="Frequently asked questions" description="Short answers for the questions most likely to come up when an administrator is not available.">
      <div className="company-request-list">{faq.map(([question, answer]) => <article key={question}><span><CircleHelp size={18}/></span><div><strong>{question}</strong><p>{answer}</p></div></article>)}</div>
    </Section>
  </div>;
}
