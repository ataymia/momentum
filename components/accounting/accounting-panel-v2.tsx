"use client";

import { BookOpenCheck, Check, FileClock, Landmark, Plus, RefreshCcw, Scale, ShieldAlert, WalletCards } from "lucide-react";
import { FormEvent, useState } from "react";
import { AccountingBasis, InventoryValuation, LedgerAccount, SourceEventType, accountBalance, journalBalanced, ruleForEvent, trialBalance, unprocessedSourceEvents } from "../../lib/accounting-engine";
import { useAccounting } from "../../lib/accounting-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill, formatMoney } from "../ui";

const sourceTypes: SourceEventType[] = ["Invoice issued", "Payment cleared", "Credit applied", "Refund settled", "Inventory receipt", "Inventory delivered", "Inventory adjustment", "Payroll released", "Expense paid"];
const journalTone = (status: string) => status === "Posted" ? "success" as const : status === "Voided" ? "danger" as const : "warning" as const;

export function AccountingPanel() {
  const { currentUser } = useWorkspace();
  const { accounting, events, setSettings, addAccount, addRule, toggleRule, runAutomation, postJournal, voidJournal, addManualJournal, createReconciliation, reconcile } = useAccounting();
  const [tab, setTab] = useState<"inbox" | "journals" | "coa" | "reconcile">("inbox");
  const [notice, setNotice] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [reconOpen, setReconOpen] = useState(false);
  const [rule, setRule] = useState({ eventType: "Payment cleared" as SourceEventType, debitAccountId: "acct-cash", creditAccountId: "acct-ar", effectiveDate: new Date().toISOString().slice(0, 10), memoTemplate: "{description}" });
  const [account, setAccount] = useState({ code: "", name: "", type: "Expense" as LedgerAccount["type"] });
  const [manual, setManual] = useState({ date: new Date().toISOString().slice(0, 10), memo: "", debitAccountId: "", creditAccountId: "", amount: "" });
  const [recon, setRecon] = useState({ accountId: "acct-cash", periodEnd: new Date().toISOString().slice(0, 10), statementEndingBalance: "" });

  if (currentUser?.role !== "Administrator") return null;

  const pending = unprocessedSourceEvents(accounting, events);
  const blocked = pending.filter((event) => event.blockedReason || !ruleForEvent(accounting, event));
  const automatable = pending.filter((event) => event.amount && !event.blockedReason && ruleForEvent(accounting, event));
  const posted = accounting.journals.filter((entry) => entry.status === "Posted");
  const trial = trialBalance(accounting);
  const debits = posted.flatMap((entry) => entry.lines).reduce((sum, line) => sum + line.debit, 0);
  const credits = posted.flatMap((entry) => entry.lines).reduce((sum, line) => sum + line.credit, 0);

  const saveRule = (event: FormEvent) => {
    event.preventDefault();
    addRule({ ...rule, active: true });
    setRuleOpen(false);
    setNotice("Accounting rule added");
  };
  const saveAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!account.code.trim() || !account.name.trim()) return;
    addAccount({ code: account.code.trim(), name: account.name.trim(), type: account.type, active: true });
    setAccountOpen(false);
    setAccount({ code: "", name: "", type: "Expense" });
  };
  const saveJournal = (event: FormEvent) => {
    event.preventDefault();
    const id = addManualJournal({ ...manual, amount: Number(manual.amount) });
    if (!id) return;
    setJournalOpen(false);
    setManual((current) => ({ ...current, memo: "", amount: "" }));
  };
  const saveReconciliation = (event: FormEvent) => {
    event.preventDefault();
    const id = createReconciliation(recon.accountId, recon.periodEnd, Number(recon.statementEndingBalance));
    if (!id) return;
    setReconOpen(false);
    setRecon((current) => ({ ...current, statementEndingBalance: "" }));
  };
  const run = () => {
    const count = runAutomation();
    setNotice(`${count} journal ${count === 1 ? "draft" : "drafts"} generated`);
  };

  return (
    <div className="page accounting-depth-panel">
      <Section title="Native accounting ledger" description="Operational source events become accounting work only through approved, effective-dated rules. Policy-dependent inventory amounts remain blocked until valuation and cost rules are configured." action={notice ? <StatusPill tone="success">{notice}</StatusPill> : undefined}>
        <div className="company-rule-facts"><div><span>Accounting basis</span><strong>{accounting.settings.basis}</strong><small>Configure before treating reports as financial statements</small></div><div><span>Inventory valuation</span><strong>{accounting.settings.inventoryValuation}</strong><small>COGS remains blocked while not configured</small></div><div><span>Unprocessed events</span><strong>{pending.length}</strong><small>{automatable.length} automatable · {blocked.length} blocked</small></div><div><span>Posted journal balance</span><strong>{Math.abs(debits - credits) < 0.005 ? "Balanced" : "Investigate"}</strong><small>{formatMoney(debits)} debit · {formatMoney(credits)} credit</small></div></div>
        <div className="account-detail__actions"><label className="reassign-field"><span>Basis</span><select value={accounting.settings.basis} onChange={(event) => setSettings(event.target.value as AccountingBasis, accounting.settings.inventoryValuation)}><option>Not configured</option><option>Cash</option><option>Accrual</option></select></label><label className="reassign-field"><span>Inventory valuation</span><select value={accounting.settings.inventoryValuation} onChange={(event) => setSettings(accounting.settings.basis, event.target.value as InventoryValuation)}><option>Not configured</option><option>FIFO</option><option>Weighted average</option></select></label><Button size="sm" icon={<RefreshCcw size={14} />} onClick={run}>Run configured automation</Button></div>
      </Section>

      <div className="company-tabs"><button className={tab === "inbox" ? "is-active" : ""} onClick={() => setTab("inbox")}>Source-event inbox <i>{pending.length}</i></button><button className={tab === "journals" ? "is-active" : ""} onClick={() => setTab("journals")}>Journal ledger</button><button className={tab === "coa" ? "is-active" : ""} onClick={() => setTab("coa")}>Chart & rules</button><button className={tab === "reconcile" ? "is-active" : ""} onClick={() => setTab("reconcile")}>Reconciliation</button></div>

      {tab === "inbox" && <Section title="Accounting source-event inbox" description="Each source event shows whether accounting can automate it or whether an approved policy is missing">
        <div className="company-request-list">
          {pending.map((entry) => {
            const configured = ruleForEvent(accounting, entry);
            const reason = entry.blockedReason ?? (!configured ? "No active accounting rule for this event type." : undefined);
            return <article key={entry.id}><span>{reason ? <ShieldAlert size={17} /> : <FileClock size={17} />}</span><div><small>{entry.type} · {entry.date}</small><strong>{entry.description}{entry.amount ? ` · ${formatMoney(entry.amount)}` : ""}</strong><p>{reason ?? `Rule: ${configured?.memoTemplate}`}</p></div><StatusPill tone={reason ? "warning" : "success"}>{reason ? "Needs policy" : "Ready"}</StatusPill></article>;
          })}
          {pending.length === 0 && <div className="review-empty"><Check size={23} /><h3>Source-event inbox is clear</h3><p>Every eligible source event has a journal record or there are no new events.</p></div>}
        </div>
      </Section>}

      {tab === "journals" && <Section title="Journal ledger" description="Drafts must balance before posting. Posted entries are corrected by void/replacement, never silent edits." action={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setJournalOpen(true)}>Manual journal</Button>}>
        <div className="company-request-list">
          {accounting.journals.map((entry) => <article key={entry.id}><span><BookOpenCheck size={17} /></span><div><small>{entry.number} · {entry.date} · {entry.sourceType}</small><strong>{entry.memo}</strong><p>{entry.lines.map((line) => { const ledgerAccount = accounting.accounts.find((item) => item.id === line.accountId); return `${ledgerAccount?.code ?? "?"} ${ledgerAccount?.name ?? "Unknown"}: ${line.debit ? `${formatMoney(line.debit)} Dr` : `${formatMoney(line.credit)} Cr`}`; }).join(" · ")}</p></div><StatusPill tone={journalTone(entry.status)}>{entry.status}</StatusPill>{entry.status === "Draft" && <Button size="sm" onClick={() => postJournal(entry.id)} disabled={!journalBalanced(entry)}>Post</Button>}{entry.status === "Posted" && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Reason for voiding this posted journal"); if (reason) voidJournal(entry.id, reason); }}>Void</Button>}</article>)}
          {accounting.journals.length === 0 && <div className="review-empty"><BookOpenCheck size={23} /><p>No journals yet.</p></div>}
        </div>
      </Section>}

      {tab === "coa" && <div className="company-grid company-grid--two">
        <Section title="Chart of accounts" description="Starter accounts are structural until company accounting policy is approved" action={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAccountOpen(true)}>Add account</Button>}>
          <div className="company-request-list">{[...accounting.accounts].sort((a, b) => a.code.localeCompare(b.code)).map((entry) => <article key={entry.id}><span><Landmark size={17} /></span><div><small>{entry.code} · {entry.type}</small><strong>{entry.name}</strong><p>Posted balance {formatMoney(accountBalance(accounting, entry.id))}{entry.systemRole ? ` · role ${entry.systemRole}` : ""}</p></div><StatusPill tone={entry.active ? "success" : "neutral"}>{entry.active ? "Active" : "Inactive"}</StatusPill></article>)}</div>
        </Section>
        <Section title="Effective-dated accounting rules" description="Rules translate eligible source events into balanced journal drafts" action={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setRuleOpen(true)}>Add rule</Button>}>
          <div className="company-request-list">{accounting.rules.map((entry) => { const debit = accounting.accounts.find((item) => item.id === entry.debitAccountId); const credit = accounting.accounts.find((item) => item.id === entry.creditAccountId); return <article key={entry.id}><span><Scale size={17} /></span><div><small>{entry.eventType} · effective {entry.effectiveDate}</small><strong>{debit?.code} {debit?.name} → {credit?.code} {credit?.name}</strong><p>{entry.memoTemplate}</p></div><button className="request-state-button" onClick={() => toggleRule(entry.id, !entry.active)}><StatusPill tone={entry.active ? "success" : "neutral"}>{entry.active ? "Active" : "Inactive"}</StatusPill></button></article>; })}{accounting.rules.length === 0 && <div className="review-empty"><Scale size={23} /><h3>No automation rules configured</h3><p>Source events remain in the inbox until the company approves debit/credit mapping.</p></div>}</div>
        </Section>
      </div>}

      {tab === "reconcile" && <><Section title="Trial balance" description="Posted journals only"><div className="finance-order-list"><div className="finance-order-row finance-order-row--head"><span>Account</span><span>Type</span><span>Balance</span><span>Status</span><span /></div>{trial.map(({ account: entry, balance }) => <div className="finance-order-row" key={entry.id}><span><strong>{entry.code} · {entry.name}</strong></span><span>{entry.type}</span><span>{formatMoney(balance)}</span><span><StatusPill tone="success">Posted</StatusPill></span><span /></div>)}</div></Section><Section title="Account reconciliation" description="Compare the external statement balance with posted Momentum ledger balance" action={<Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setReconOpen(true)}>New reconciliation</Button>}><div className="company-request-list">{accounting.reconciliations.map((entry) => { const ledgerAccount = accounting.accounts.find((item) => item.id === entry.accountId); return <article key={entry.id}><span><WalletCards size={17} /></span><div><small>{ledgerAccount?.code} {ledgerAccount?.name} · {entry.periodEnd}</small><strong>Statement {formatMoney(entry.statementEndingBalance)} · ledger {formatMoney(entry.ledgerEndingBalance)}</strong><p>Difference {formatMoney(entry.difference)}{entry.note ? ` · ${entry.note}` : ""}</p></div><StatusPill tone={entry.status === "Reconciled" ? "success" : "warning"}>{entry.status}</StatusPill>{entry.status === "Open" && Math.abs(entry.difference) < 0.005 && <Button size="sm" onClick={() => reconcile(entry.id, "Balances agree")}>Reconcile</Button>}</article>; })}</div></Section></>}

      <Modal open={ruleOpen} title="Add accounting rule" description="Rules only apply from their effective date forward." onClose={() => setRuleOpen(false)} footer={<><Button variant="ghost" onClick={() => setRuleOpen(false)}>Cancel</Button><Button type="submit" form="accounting-rule-form">Save rule</Button></>}><form id="accounting-rule-form" className="form-grid" onSubmit={saveRule}><Field label="Source event"><select value={rule.eventType} onChange={(event) => setRule({ ...rule, eventType: event.target.value as SourceEventType })}>{sourceTypes.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Effective date"><input type="date" required value={rule.effectiveDate} onChange={(event) => setRule({ ...rule, effectiveDate: event.target.value })} /></Field><Field label="Debit account"><select value={rule.debitAccountId} onChange={(event) => setRule({ ...rule, debitAccountId: event.target.value })}>{accounting.accounts.filter((item) => item.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></Field><Field label="Credit account"><select value={rule.creditAccountId} onChange={(event) => setRule({ ...rule, creditAccountId: event.target.value })}>{accounting.accounts.filter((item) => item.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></Field><Field label="Memo template" className="field--full"><input value={rule.memoTemplate} onChange={(event) => setRule({ ...rule, memoTemplate: event.target.value })} /></Field></form></Modal>
      <Modal open={accountOpen} title="Add ledger account" description="Add an account to the native chart." onClose={() => setAccountOpen(false)} footer={<><Button variant="ghost" onClick={() => setAccountOpen(false)}>Cancel</Button><Button type="submit" form="ledger-account-form">Add account</Button></>}><form id="ledger-account-form" className="form-grid" onSubmit={saveAccount}><Field label="Code"><input required value={account.code} onChange={(event) => setAccount({ ...account, code: event.target.value })} /></Field><Field label="Name"><input required value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} /></Field><Field label="Type"><select value={account.type} onChange={(event) => setAccount({ ...account, type: event.target.value as LedgerAccount["type"] })}><option>Asset</option><option>Liability</option><option>Equity</option><option>Revenue</option><option>Expense</option></select></Field></form></Modal>
      <Modal open={journalOpen} title="Manual journal draft" description="Manual journals still require a balanced debit and credit." onClose={() => setJournalOpen(false)} footer={<><Button variant="ghost" onClick={() => setJournalOpen(false)}>Cancel</Button><Button type="submit" form="manual-journal-form">Create draft</Button></>}><form id="manual-journal-form" className="form-grid" onSubmit={saveJournal}><Field label="Date"><input type="date" required value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} /></Field><Field label="Amount"><input type="number" min="0.01" step="0.01" required value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} /></Field><Field label="Debit"><select required value={manual.debitAccountId} onChange={(event) => setManual({ ...manual, debitAccountId: event.target.value })}><option value="">Select account</option>{accounting.accounts.filter((item) => item.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></Field><Field label="Credit"><select required value={manual.creditAccountId} onChange={(event) => setManual({ ...manual, creditAccountId: event.target.value })}><option value="">Select account</option>{accounting.accounts.filter((item) => item.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></Field><Field label="Memo" className="field--full"><textarea required rows={3} value={manual.memo} onChange={(event) => setManual({ ...manual, memo: event.target.value })} /></Field></form></Modal>
      <Modal open={reconOpen} title="Start account reconciliation" description="Record an external statement ending balance and compare it to the posted ledger." onClose={() => setReconOpen(false)} footer={<><Button variant="ghost" onClick={() => setReconOpen(false)}>Cancel</Button><Button type="submit" form="reconciliation-form">Create</Button></>}><form id="reconciliation-form" className="form-grid" onSubmit={saveReconciliation}><Field label="Account"><select value={recon.accountId} onChange={(event) => setRecon({ ...recon, accountId: event.target.value })}>{accounting.accounts.filter((item) => item.active).map((entry) => <option key={entry.id} value={entry.id}>{entry.code} · {entry.name}</option>)}</select></Field><Field label="Period end"><input type="date" value={recon.periodEnd} onChange={(event) => setRecon({ ...recon, periodEnd: event.target.value })} /></Field><Field label="Statement ending balance"><input type="number" step="0.01" required value={recon.statementEndingBalance} onChange={(event) => setRecon({ ...recon, statementEndingBalance: event.target.value })} /></Field></form></Modal>
    </div>
  );
}
