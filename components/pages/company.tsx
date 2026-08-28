"use client";

import {
  BadgeDollarSign,
  BookOpenCheck,
  CalendarClock,
  Check,
  FileArchive,
  FileUp,
  Megaphone,
  PackageCheck,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { evaluateSalesRepAccountBonuses, SALES_REP_ACCOUNT_BONUS_RULE } from "../../lib/bonus-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

type HubTab = "overview" | "compensation" | "requests" | "resources";
type RequestKind = "Time off" | "Expense reimbursement" | "Marketing materials" | "Ad spend";
type RequestStatus = "Submitted" | "Approved" | "Returned";
type CompanyRequest = {
  id: string;
  kind: RequestKind;
  requesterId: string;
  submittedAt: string;
  summary: string;
  detail: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
  receiptName?: string;
  route: string;
  status: RequestStatus;
};

const REQUEST_KEY = "momentum-company-workflows-v1";
const routeFor = (kind: RequestKind) => {
  if (kind === "Time off") return "Direct manager review";
  if (kind === "Expense reimbursement") return "Direct manager → finance / administrator handoff";
  if (kind === "Marketing materials") return "Marketing owner → requester fulfillment";
  return "Marketing owner + budget owner approval";
};
const toneForRequest = (status: RequestStatus) => status === "Approved" ? "success" as const : status === "Returned" ? "danger" as const : "warning" as const;

export function CompanyPage() {
  const { data, scope, currentUser, navigate } = useWorkspace();
  const [tab, setTab] = useState<HubTab>("overview");
  const [kind, setKind] = useState<RequestKind>("Time off");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [requests, setRequests] = useState<CompanyRequest[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(REQUEST_KEY) ?? "[]") as CompanyRequest[]; } catch { return []; }
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(REQUEST_KEY, JSON.stringify(requests));
  }, [requests]);

  const accessibleAccountIds = useMemo(() => new Set(scope.accounts.map((account) => account.id)), [scope.accounts]);
  const bonusSignals = useMemo(() => evaluateSalesRepAccountBonuses(data).filter((signal) => accessibleAccountIds.has(signal.accountId)), [accessibleAccountIds, data]);
  const eligibleSignals = bonusSignals.filter((signal) => signal.status === "Eligibility detected");
  const myRequests = requests.filter((request) => request.requesterId === currentUser?.id);
  const reviewRequests = requests.filter((request) => request.requesterId !== currentUser?.id && request.status === "Submitted" && canReviewRequest(request));

  function canReviewRequest(request: CompanyRequest) {
    if (!currentUser) return false;
    if (currentUser.role === "Administrator") return true;
    if (currentUser.role !== "Sales Manager") return false;
    if (request.kind === "Marketing materials" || request.kind === "Ad spend") return false;
    const requester = data.users.find((user) => user.id === request.requesterId);
    return requester?.managerId === currentUser.id || requester?.team === currentUser.team;
  }

  const decideRequest = (id: string, status: "Approved" | "Returned") => {
    setRequests((current) => current.map((request) => request.id === id && canReviewRequest(request) ? { ...request, status } : request));
  };

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !summary.trim() || !detail.trim()) return;
    const numericAmount = amount ? Number(amount) : undefined;
    if ((kind === "Expense reimbursement" || kind === "Ad spend") && (!numericAmount || numericAmount <= 0)) return;
    if (kind === "Time off" && (!startDate || !endDate)) return;
    const request: CompanyRequest = {
      id: `company-request-${Date.now()}`,
      kind,
      requesterId: currentUser.id,
      submittedAt: new Date().toISOString(),
      summary: summary.trim(),
      detail: detail.trim(),
      amount: numericAmount,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      receiptName: receiptName || undefined,
      route: routeFor(kind),
      status: "Submitted",
    };
    setRequests((current) => [request, ...current]);
    setSummary(""); setDetail(""); setAmount(""); setStartDate(""); setEndDate(""); setReceiptName("");
  };

  const moduleCoverage = [
    ["Sales & CRM", "Live in demo", "Accounts, contacts, notes, orders, follow-ups, retail execution"],
    ["Inventory & fulfillment", "Live in demo", "Lots, holds, availability, fulfillment states and delivery controls"],
    ["Time & attendance", "Live in demo", "Clocking, meals, weekly timecards and manager review"],
    ["Compensation signals", "New", "Account bonus milestones calculated from source orders; payroll release remains controlled"],
    ["Time off", "New", "Employee request and manager decision path; balance/accrual integration still required"],
    ["Expenses", "New", "Receipt-aware reimbursement request path; accounting/payment integration still required"],
    ["Marketing operations", "New", "Material and ad-spend request intake; budget owner and marketing owner still need assignment"],
    ["Documents & training", "Designed", "Employee document vault, benefits references, policy library and training assignments"],
    ["Payroll & benefits", "Integrate, do not clone", "Use an HCM/payroll provider as the compliance and payment system of record"],
  ];

  return <div className="page page--company">
    <PageHeader eyebrow="Cross-functional operating system" title="Company hub" description="One place for employee self-service, reimbursement and marketing requests, compensation signals, documents, training, and the controls that connect departments." actions={<StatusPill tone="gold">Connected-workflow expansion</StatusPill>} />

    <div className="company-tabs">
      {(["overview","compensation","requests","resources"] as HubTab[]).map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item === "overview" ? "Coverage" : item === "compensation" ? "Compensation" : item === "requests" ? "Requests" : "Documents & training"}</button>)}
    </div>

    {tab === "overview" && <>
      <div className="company-principle"><Sparkles size={21}/><div><strong>The platform should act on records, not make people remember the next step.</strong><p>Orders should create bonus signals, submitted expenses should create review work, approved requests should create downstream handoffs, and every transition should preserve who did what and why.</p></div></div>
      <Section title="Business coverage map" description="What the operating system owns, what is being added, and what should remain integrated with a specialist provider" className="company-coverage">
        {moduleCoverage.map(([name,status,detail]) => <article key={name}><div><strong>{name}</strong><p>{detail}</p></div><StatusPill tone={status === "Live in demo" ? "success" : status === "New" ? "gold" : status === "Integrate, do not clone" ? "warning" : "info"} dot={false}>{status}</StatusPill></article>)}
      </Section>
      <div className="company-grid company-grid--two">
        <Section title="Automation spine" description="Shared triggers every department should use"><div className="company-list">{[
          [PackageCheck,"Record changes","Order paid, placement updated, timecard submitted, request approved"],
          [ShieldCheck,"Rule evaluates","Eligibility, authority, budget, timing and required evidence are checked"],
          [Megaphone,"Work routes","The correct owner gets a task or notification instead of relying on memory"],
          [FileArchive,"Evidence stays attached","Source record, approver, decision, timestamp and reason remain auditable"],
        ].map(([Icon,title,copy]) => { const ItemIcon = Icon as typeof PackageCheck; return <div key={title as string}><span><ItemIcon size={18}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div></div>; })}</div></Section>
        <Section title="Decisions still needed" description="These are intentionally not hard-coded"><div className="company-list company-list--questions">{[
          "Exactly which order state makes each sales bonus earned: ordered, approved, delivered, paid, or another definition.",
          "Who owns Finance/reimbursement approval and who owns Marketing request fulfillment and ad-spend approval.",
          "PTO bank size, accrual/front-load method, carryover rules, manager hierarchy, blackout rules and payroll provider.",
          "Medical/dental eligibility, waiting period, employer contribution and the controlling plan documents.",
          "Which employment and training documents are final enough to publish to employee portals.",
        ].map((question) => <div key={question}><span><CalendarClock size={17}/></span><div><p>{question}</p></div></div>)}</div></Section>
      </div>
    </>}

    {tab === "compensation" && <>
      <div className="company-rule-banner"><BadgeDollarSign size={22}/><div><strong>Sales rep account bonus tracker</strong><p>Confirmed structure from the current owner clarification: $25 for an opening order of at least 10 cases, then $25 when the account reaches 40 cumulative cases within 90 days. The platform treats this as an eligibility detector, not an instruction to pay.</p></div></div>
      <div className="company-rule-facts"><div><span>Opening threshold</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.openingOrderCases} cases</strong><small>{formatMoney(SALES_REP_ACCOUNT_BONUS_RULE.openingBonusAmount)} signal</small></div><div><span>Sustained threshold</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.sustainedAccountCases} cumulative</strong><small>{formatMoney(SALES_REP_ACCOUNT_BONUS_RULE.sustainedBonusAmount)} signal</small></div><div><span>Window</span><strong>{SALES_REP_ACCOUNT_BONUS_RULE.windowDays} days</strong><small>From current demo proxy start</small></div><div><span>Eligible signals</span><strong>{eligibleSignals.length}</strong><small>In your record scope</small></div></div>
      <Section title="Account milestone ledger" description={SALES_REP_ACCOUNT_BONUS_RULE.countingBasisLabel} className="bonus-ledger">
        {bonusSignals.map((signal) => {
          const account = data.accounts.find((item) => item.id === signal.accountId); const rep = data.users.find((item) => item.id === signal.repId);
          const progress = Math.min(100, Math.round((signal.observedCases / signal.thresholdCases) * 100));
          return <article key={signal.id}><div className="bonus-ledger__head"><div><small>{signal.milestone}</small><strong>{account?.name}</strong><p>{rep?.name} · {signal.observedCases}/{signal.thresholdCases} cases</p></div><StatusPill tone={signal.status === "Eligibility detected" ? "success" : signal.status === "Window expired" ? "danger" : "info"}>{signal.status}</StatusPill></div><div className="bonus-progress"><i style={{width:`${progress}%`}}/></div><div className="bonus-ledger__foot"><span>Potential amount {formatMoney(signal.amount)}</span><span>{signal.windowEnd ? `Window through ${formatDate(signal.windowEnd,{month:"short",day:"numeric",year:"numeric"})}` : "Window not started"}</span><span>{signal.evidenceOrderIds.length} source order{signal.evidenceOrderIds.length === 1 ? "" : "s"}</span></div><p className="bonus-rule-note">{signal.ruleNote}</p></article>;
        })}
        {bonusSignals.length === 0 && <div className="review-empty"><BadgeDollarSign size={25}/><h3>No sales-rep bonus records in your scope</h3><p>The engine only evaluates accounts owned by a Sales Representative.</p></div>}
      </Section>
    </>}

    {tab === "requests" && <div className="company-grid company-grid--requests">
      <Section title="Submit company request" description="One intake pattern for PTO, reimbursements, marketing materials and ad spend" className="company-request-form">
        <form onSubmit={submitRequest} className="form-grid">
          <Field label="Request type"><select value={kind} onChange={(event) => setKind(event.target.value as RequestKind)}><option>Time off</option><option>Expense reimbursement</option><option>Marketing materials</option><option>Ad spend</option></select></Field>
          <Field label="Routing"><input value={routeFor(kind)} readOnly /></Field>
          <Field label="Short summary" className="field--full"><input required maxLength={90} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={kind === "Time off" ? "Vacation / personal time" : kind === "Expense reimbursement" ? "Warehouse supplies" : kind === "Marketing materials" ? "Retailer sell sheet request" : "Local campaign spend request"}/></Field>
          {kind === "Time off" && <><Field label="Start date"><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)}/></Field><Field label="End date"><input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)}/></Field></>}
          {(kind === "Expense reimbursement" || kind === "Ad spend") && <Field label="Amount"><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)}/></Field>}
          {kind === "Expense reimbursement" && <Field label="Receipt"><label className="receipt-upload"><FileUp size={17}/><span>{receiptName || "Choose receipt file"}</span><input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}/></label></Field>}
          <Field label="Business reason / details" className="field--full"><textarea required maxLength={500} rows={5} value={detail} onChange={(event) => setDetail(event.target.value)} /></Field>
          <div className="form-callout"><ShieldCheck size={17}/><p>This demo stores request metadata locally. Receipt file bytes, payroll balances, accounting payouts and ad-platform spend require secured integrations before production.</p></div>
          <Button type="submit" icon={kind === "Expense reimbursement" ? <Receipt size={16}/> : kind === "Time off" ? <CalendarClock size={16}/> : <Megaphone size={16}/>}>Submit request</Button>
        </form>
      </Section>
      <div className="company-request-stack">
        <Section title="My requests" description="Your submitted cross-functional work"><div className="company-request-list">{myRequests.map((request) => <article key={request.id}><div><small>{request.kind}</small><strong>{request.summary}</strong><p>{request.amount ? `${formatMoney(request.amount)} · ` : ""}{request.startDate ? `${formatDate(request.startDate,{month:"short",day:"numeric"})}–${formatDate(request.endDate ?? request.startDate,{month:"short",day:"numeric"})} · ` : ""}{request.route}</p></div><StatusPill tone={toneForRequest(request.status)}>{request.status}</StatusPill></article>)}{myRequests.length === 0 && <div className="review-empty"><p>No company requests submitted yet.</p></div>}</div></Section>
        {(currentUser?.role === "Administrator" || currentUser?.role === "Sales Manager") && <Section title="Review queue" description="Only requests inside your authority appear here"><div className="company-request-list">{reviewRequests.map((request) => { const requester = data.users.find((user) => user.id === request.requesterId); return <article key={request.id}><div><small>{request.kind} · {requester?.name}</small><strong>{request.summary}</strong><p>{request.detail}</p>{request.receiptName && <em><Receipt size={13}/> {request.receiptName}</em>}</div><div className="company-request-actions"><Button size="sm" variant="secondary" icon={<RotateCcw size={14}/>} onClick={() => decideRequest(request.id,"Returned")}>Return</Button><Button size="sm" icon={<Check size={14}/>} onClick={() => decideRequest(request.id,"Approved")}>Approve</Button></div></article>; })}{reviewRequests.length === 0 && <div className="review-empty"><p>No submitted requests are waiting inside your authority.</p></div>}</div></Section>}
      </div>
    </div>}

    {tab === "resources" && <>
      <div className="company-grid company-grid--two">
        <Section title="Employee document vault" description="Every employee should be able to return to the controlling document, not hunt through email"><div className="resource-list">{[
          [FileArchive,"Employment agreement","Employee-specific signed copy","Awaiting live file storage"],
          [WalletCards,"Benefits summary","Eligibility, plans and employee/employer contribution summary","Terms not yet configured"],
          [BookOpenCheck,"Policies & handbook","Time off, expenses, conduct, safety and department procedures","Publish after policy approval"],
          [FileArchive,"Compensation plan","Role-specific commission, bonus and scorecard documents","Version-controlled copy required"],
        ].map(([Icon,title,copy,status]) => { const ItemIcon = Icon as typeof FileArchive; return <article key={title as string}><span><ItemIcon size={19}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div><StatusPill tone="warning" dot={false}>{status as string}</StatusPill></article>; })}</div></Section>
        <Section title="Training & certification" description="Assignments should follow role, due date, completion evidence and version"><div className="resource-list">{[
          [BookOpenCheck,"Role onboarding","Job-specific process, systems and success measures"],
          [PackageCheck,"Product & field execution","Approved product facts, placement standards and order workflow"],
          [ShieldCheck,"Safety, data & compliance","Required operational and information-security training"],
          [Megaphone,"Department playbooks","Sales, operations, marketing and manager training by role"],
        ].map(([Icon,title,copy]) => { const ItemIcon = Icon as typeof BookOpenCheck; return <article key={title as string}><span><ItemIcon size={19}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div><StatusPill tone="info" dot={false}>Assignment framework</StatusPill></article>; })}</div></Section>
      </div>
      <div className="company-integration-note"><ShieldCheck size={20}/><div><strong>Payroll, tax, direct deposit and benefit elections should not be rebuilt inside Momentum.</strong><p>The cleaner architecture is one employee experience with integrated systems of record: Momentum owns operational work and evidence; the selected HCM/payroll provider owns regulated payroll/benefit administration. The employee portal can surface both without creating two conflicting truths.</p></div><Button variant="secondary" size="sm" onClick={() => navigate("settings")}>Integration boundaries</Button></div>
    </>}
  </div>;
}
