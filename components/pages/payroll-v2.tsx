"use client";

import { BadgeDollarSign, Calculator, Check, FileText, Landmark, LockKeyhole, Play, RefreshCcw, ShieldCheck, WalletCards, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { activeCompensation, benefitDeductionPerPayPeriod } from "../../lib/hcm-engine";
import { useHcm } from "../../lib/hcm-context";
import { activePayrollEmployee, activeWithholding, type PayFrequency, type PayrollEmployee } from "../../lib/payroll-engine";
import { usePayroll } from "../../lib/payroll-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = () => today().slice(0, 7);
const runTone = (status: string) => status === "Released" ? "success" as const : status === "Approved" ? "gold" as const : status === "Voided" ? "danger" as const : "info" as const;

export function PayrollPage() {
  const { data, currentUser, navigate } = useWorkspace();
  const { hcm } = useHcm();
  const { payroll, savePayGroup, savePayrollEmployee, saveWithholding, saveEmployerTaxRule, buildRegularRun, buildBonusRun, setRunStatus, voidAndReissue, settleDisbursement, updateLiability, resetPayroll } = usePayroll();
  const admin = currentUser?.role === "Administrator";
  const [tab, setTab] = useState<"self" | "processing" | "tax" | "setup">("self");
  const [notice, setNotice] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [bonusMonth, setBonusMonth] = useState(monthKey());
  const [bonusPayDate, setBonusPayDate] = useState(today());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(data.users.find((user) => user.role !== "Customer")?.id ?? "");
  const [payGroupId, setPayGroupId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PayrollEmployee["paymentMethod"]>("ACH");
  const [paymentTokenLabel, setPaymentTokenLabel] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [federalPercent, setFederalPercent] = useState("");
  const [statePercent, setStatePercent] = useState("");
  const [localPercent, setLocalPercent] = useState("");
  const [additionalWithholding, setAdditionalWithholding] = useState("");
  const [postTaxDeduction, setPostTaxDeduction] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupFrequency, setGroupFrequency] = useState<PayFrequency>("Biweekly");
  const [overtimeThreshold, setOvertimeThreshold] = useState("40");
  const [taxRuleName, setTaxRuleName] = useState("");
  const [taxRulePercent, setTaxRulePercent] = useState("");
  const [taxRuleEffective, setTaxRuleEffective] = useState(today());

  const myPayrollEmployee = currentUser ? activePayrollEmployee(payroll, currentUser.id) : undefined;
  const myTax = currentUser ? activeWithholding(payroll, currentUser.id) : undefined;
  const myComp = currentUser ? activeCompensation(hcm, currentUser.id) : undefined;
  const myRuns = payroll.runs.filter((run) => run.status !== "Voided" && run.lines.some((line) => line.employeeId === currentUser?.id));
  const latestMyRun = myRuns[0];
  const latestMyLine = latestMyRun?.lines.find((line) => line.employeeId === currentUser?.id);
  const releasedMyLines = payroll.runs.filter((run) => run.status === "Released").flatMap((run) => run.lines.filter((line) => line.employeeId === currentUser?.id));
  const ytdGross = releasedMyLines.reduce((sum, line) => sum + line.grossPay, 0);
  const ytdTaxes = releasedMyLines.reduce((sum, line) => sum + line.employeeTaxes, 0);
  const ytdBenefits = releasedMyLines.reduce((sum, line) => sum + line.benefitDeduction, 0);
  const ytdNet = releasedMyLines.reduce((sum, line) => sum + line.netPay, 0);

  const loadEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const employee = payroll.employees.find((item) => item.userId === employeeId);
    const tax = activeWithholding(payroll, employeeId);
    setPayGroupId(employee?.payGroupId ?? "");
    setPaymentMethod(employee?.paymentMethod ?? "ACH");
    setPaymentTokenLabel(employee?.paymentTokenLabel ?? "");
    setFederalPercent(String(tax?.federalPercent ?? ""));
    setStatePercent(String(tax?.statePercent ?? ""));
    setLocalPercent(String(tax?.localPercent ?? ""));
    setAdditionalWithholding(String(tax?.additionalWithholding ?? ""));
    setPostTaxDeduction(String(tax?.postTaxDeduction ?? ""));
    setEffectiveDate(tax?.effectiveDate ?? today());
  };

  const createGroup = (event: FormEvent) => {
    event.preventDefault();
    if (!admin || !groupName.trim()) return;
    savePayGroup({ name: groupName.trim(), frequency: groupFrequency, overtimeThresholdHours: Number(overtimeThreshold || 40), active: true });
    setGroupName("");
    setNotice("Pay group created");
  };
  const saveEmployee = (event: FormEvent) => {
    event.preventDefault();
    if (!admin || !selectedEmployeeId || !payGroupId) return;
    savePayrollEmployee({ userId: selectedEmployeeId, payGroupId, paymentMethod, paymentTokenLabel: paymentTokenLabel.trim(), active: true });
    setNotice("Payroll employee setup saved");
  };
  const saveTax = (event: FormEvent) => {
    event.preventDefault();
    if (!admin || !selectedEmployeeId) return;
    saveWithholding({ userId: selectedEmployeeId, effectiveDate, federalPercent: Number(federalPercent || 0), statePercent: Number(statePercent || 0), localPercent: Number(localPercent || 0), additionalWithholding: Number(additionalWithholding || 0), postTaxDeduction: Number(postTaxDeduction || 0) });
    setNotice("Withholding profile saved");
  };
  const saveEmployerTax = (event: FormEvent) => {
    event.preventDefault();
    if (!admin || !taxRuleName.trim()) return;
    saveEmployerTaxRule({ name: taxRuleName.trim(), percent: Number(taxRulePercent || 0), effectiveDate: taxRuleEffective, active: true });
    setTaxRuleName("");
    setTaxRulePercent("");
    setNotice("Employer tax rule added");
  };
  const buildRegular = () => {
    const id = buildRegularRun(periodStart, periodEnd, payDate);
    setNotice(id ? "Regular payroll draft built" : "No eligible configured timecards for this period");
  };
  const buildBonus = () => {
    const id = buildBonusRun(bonusMonth, bonusPayDate);
    setNotice(id ? "Monthly bonus payroll draft built" : "No unpaid eligible bonuses or employee setup is incomplete");
  };

  return <div className="page page--payroll">
    <PageHeader eyebrow="Workforce compensation" title="Payroll" description="Native payroll consumes effective HR compensation, approved time, monthly earned bonuses, active benefit elections, configured withholding, and payment instructions." actions={<div className="request-actions">{notice && <StatusPill tone="success">{notice}</StatusPill>}<StatusPill tone="gold">Native payroll</StatusPill>{admin && <Button size="sm" variant="ghost" icon={<RefreshCcw size={14}/>} onClick={() => { resetPayroll(); setNotice("Payroll demo reset"); }}>Reset payroll demo</Button>}</div>} />
    <div className="company-tabs"><button className={tab === "self" ? "is-active" : ""} onClick={() => setTab("self")}>My pay</button>{admin && <button className={tab === "processing" ? "is-active" : ""} onClick={() => setTab("processing")}>Pay runs</button>}{admin && <button className={tab === "tax" ? "is-active" : ""} onClick={() => setTab("tax")}>Taxes & disbursement</button>}{admin && <button className={tab === "setup" ? "is-active" : ""} onClick={() => setTab("setup")}>Payroll setup</button>}</div>

    {tab === "self" && <><div className="company-grid company-grid--two"><Section title="Payroll profile" description="Pay rate comes from the effective compensation record in Human Resources"><div className="payroll-profile"><div><span><BadgeDollarSign size={20}/></span><div><small>Effective pay basis</small><strong>{myComp ? `${myComp.basis} · ${formatMoney(myComp.rate)}` : "Not configured in HR"}</strong></div></div><div><span><Calculator size={20}/></span><div><small>Withholding setup</small><strong>{myTax ? `${myTax.federalPercent}% federal · ${myTax.statePercent}% state · ${myTax.localPercent}% local` : "Not configured"}</strong></div></div><div><span><WalletCards size={20}/></span><div><small>Payment instruction</small><strong>{myPayrollEmployee ? `${myPayrollEmployee.paymentMethod} · ${myPayrollEmployee.paymentTokenLabel || "masked destination not loaded"}` : "Not configured"}</strong></div></div></div></Section><Section title="Latest pay statement" description="Every amount drills into source hours, earnings, benefits, withholding, and deductions">{latestMyLine ? <div className="pay-statement"><div><span>Regular pay</span><strong>{formatMoney(latestMyLine.regularPay)}</strong></div><div><span>Overtime pay</span><strong>{formatMoney(latestMyLine.overtimePay)}</strong></div><div><span>Bonus earnings</span><strong>{formatMoney(latestMyLine.bonusPay)}</strong></div><div><span>Gross pay</span><strong>{formatMoney(latestMyLine.grossPay)}</strong></div><div><span>Benefit deduction</span><strong>-{formatMoney(latestMyLine.benefitDeduction)}</strong></div><div><span>Employee taxes</span><strong>-{formatMoney(latestMyLine.employeeTaxes)}</strong></div><div><span>Other post-tax deduction</span><strong>-{formatMoney(latestMyLine.postTaxDeduction)}</strong></div><div className="pay-statement__net"><span>Net pay</span><strong>{formatMoney(latestMyLine.netPay)}</strong></div><div><span>Pay date</span><strong>{latestMyRun ? formatDate(latestMyRun.payDate) : "—"}</strong></div></div> : <div className="review-empty"><FileText size={24}/><h3>No pay statement yet</h3><p>A statement appears after an authorized payroll run includes this employee.</p></div>}</Section></div><Section title="Year-to-date pay" description="YTD totals include released payroll only"><div className="hcm-metrics payroll-ytd"><article><span>Gross</span><strong>{formatMoney(ytdGross)}</strong><small>Released payroll</small></article><article><span>Employee taxes</span><strong>{formatMoney(ytdTaxes)}</strong><small>Withheld</small></article><article><span>Benefit deductions</span><strong>{formatMoney(ytdBenefits)}</strong><small>Enrollment-linked</small></article><article><span>Net pay</span><strong>{formatMoney(ytdNet)}</strong><small>Released</small></article></div></Section></>}

    {tab === "processing" && admin && <><div className="company-grid company-grid--two"><Section title="Regular payroll draft" description="Consumes approved timecards once"><div className="form-grid"><Field label="Period start"><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end"><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field><Field label="Pay date"><input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} /></Field><Button icon={<Play size={15}/>} onClick={buildRegular}>Build regular draft</Button></div></Section><Section title="Monthly bonus payroll" description="Sales-account bonuses are paid monthly and consumed once"><div className="form-grid"><Field label="Bonus month"><input type="month" value={bonusMonth} onChange={(event) => setBonusMonth(event.target.value)} /></Field><Field label="Pay date"><input type="date" value={bonusPayDate} onChange={(event) => setBonusPayDate(event.target.value)} /></Field><Button variant="gold" icon={<BadgeDollarSign size={15}/>} onClick={buildBonus}>Build monthly bonus draft</Button></div></Section></div><Section title="Pay-run register" description="Draft → approved → released. Released runs are corrected only through void and controlled reissue."><div className="campaign-register">{payroll.runs.map((run) => <article key={run.id}><div className="campaign-register__head"><div><small>{run.kind} · {formatDate(run.periodStart,{month:"short",day:"numeric"})} – {formatDate(run.periodEnd,{month:"short",day:"numeric",year:"numeric"})} · pay {formatDate(run.payDate,{month:"short",day:"numeric"})}</small><strong>{run.id}</strong><p>{run.lines.length} employee line{run.lines.length === 1 ? "" : "s"} · gross {formatMoney(run.lines.reduce((sum,line)=>sum+line.grossPay,0))} · net {formatMoney(run.lines.reduce((sum,line)=>sum+line.netPay,0))}{run.reissueOf ? ` · reissue of ${run.reissueOf}` : ""}</p></div><StatusPill tone={runTone(run.status)}>{run.status}</StatusPill></div><div className="finance-order-list"><div className="payroll-line-row payroll-line-row--head"><span>Employee</span><span>Reg hrs</span><span>OT hrs</span><span>Gross</span><span>Benefits</span><span>Taxes</span><span>Net</span></div>{run.lines.map((line) => <div className="payroll-line-row" key={line.employeeId}><span>{data.users.find((user)=>user.id===line.employeeId)?.name}</span><span>{line.regularHours.toFixed(2)}</span><span>{line.overtimeHours.toFixed(2)}</span><span>{formatMoney(line.grossPay)}</span><span>{formatMoney(line.benefitDeduction)}</span><span>{formatMoney(line.employeeTaxes)}</span><span><strong>{formatMoney(line.netPay)}</strong></span></div>)}</div><div className="request-actions payroll-run-actions">{run.status === "Draft" && <Button size="sm" icon={<Check size={14}/>} onClick={() => setRunStatus(run.id,"Approved")}>Approve payroll</Button>}{run.status === "Approved" && <Button size="sm" variant="gold" icon={<WalletCards size={14}/>} onClick={() => setRunStatus(run.id,"Released")}>Release payroll</Button>}{run.status === "Released" && <Button size="sm" variant="danger" icon={<X size={14}/>} onClick={() => { const reason=window.prompt("Reason for void and reissue"); if(reason) voidAndReissue(run.id,reason); }}>Void & reissue</Button>}</div></article>)}{payroll.runs.length === 0 && <div className="review-empty"><p>No payroll runs built.</p></div>}</div></Section></>}

    {tab === "tax" && admin && <div className="company-grid company-grid--two"><Section title="Tax liability ledger" description="Release creates liabilities. Deposit/payment remains a separate reconciliation step."><div className="tax-ledger">{payroll.liabilities.map((liability) => <article key={liability.id}><div><small>{liability.type} · {liability.payRunId}</small><strong>{formatMoney(liability.amount)}</strong></div><StatusPill tone={liability.status === "Paid" ? "success" : liability.status === "Reversed" ? "danger" : "warning"}>{liability.status}</StatusPill>{liability.status === "Accrued" && <Button size="sm" onClick={() => updateLiability(liability.id,"Scheduled")}>Schedule</Button>}{liability.status === "Scheduled" && <Button size="sm" variant="gold" onClick={() => updateLiability(liability.id,"Paid")}>Mark paid</Button>}</article>)}{payroll.liabilities.length === 0 && <div className="review-empty"><p>No tax liabilities posted.</p></div>}</div></Section><Section title="Disbursement register" description="Momentum owns the instruction and settlement history; the selected rail moves the money."><div className="tax-ledger">{payroll.disbursements.map((item) => <article key={item.id}><div><small>{data.users.find((user)=>user.id===item.userId)?.name} · {item.method} · {item.payRunId}</small><strong>{formatMoney(item.amount)}</strong><p>{item.tokenLabel || "No masked destination"}</p></div><StatusPill tone={item.status === "Settled" ? "success" : item.status === "Voided" || item.status === "Failed" ? "danger" : "warning"}>{item.status}</StatusPill>{item.status === "Released" && <Button size="sm" onClick={() => settleDisbursement(item.id)}>Reconcile settled</Button>}</article>)}{payroll.disbursements.length === 0 && <div className="review-empty"><p>No payment instructions released.</p></div>}</div></Section></div>}

    {tab === "setup" && admin && <><div className="company-grid company-grid--two"><Section title="Pay groups" description="Pay frequency and overtime threshold are explicit company inputs"><form className="form-grid" onSubmit={createGroup}><Field label="Group name"><input required value={groupName} onChange={(event)=>setGroupName(event.target.value)} /></Field><Field label="Frequency"><select value={groupFrequency} onChange={(event)=>setGroupFrequency(event.target.value as PayFrequency)}><option>Weekly</option><option>Biweekly</option><option>Semimonthly</option><option>Monthly</option></select></Field><Field label="Overtime threshold hours"><input type="number" min="0" step="0.25" value={overtimeThreshold} onChange={(event)=>setOvertimeThreshold(event.target.value)} /></Field><Button type="submit">Create pay group</Button></form><div className="asset-register">{payroll.payGroups.map((group)=><article key={group.id}><span><BadgeDollarSign size={18}/></span><div><strong>{group.name}</strong><p>{group.frequency} · OT after {group.overtimeThresholdHours} hrs</p></div><StatusPill tone={group.active?"success":"neutral"}>{group.active?"Active":"Inactive"}</StatusPill></article>)}</div></Section><Section title="Employer tax rules" description="Rates and effective dates are configured from authoritative company/jurisdiction inputs"><form className="form-grid" onSubmit={saveEmployerTax}><Field label="Tax / liability name"><input required value={taxRuleName} onChange={(event)=>setTaxRuleName(event.target.value)} /></Field><Field label="Percent of taxable wages"><input type="number" min="0" step="0.001" required value={taxRulePercent} onChange={(event)=>setTaxRulePercent(event.target.value)} /></Field><Field label="Effective date"><input type="date" required value={taxRuleEffective} onChange={(event)=>setTaxRuleEffective(event.target.value)} /></Field><Button type="submit">Add employer rule</Button></form><div className="asset-register">{payroll.employerTaxRules.map((rule)=><article key={rule.id}><span><Landmark size={18}/></span><div><strong>{rule.name}</strong><p>{rule.percent}% · effective {rule.effectiveDate}</p></div><StatusPill tone={rule.active?"success":"neutral"}>{rule.active?"Active":"Inactive"}</StatusPill></article>)}</div></Section></div><Section title="Employee payroll setup" description="Compensation rate stays in Human Resources. Payroll stores pay group, withholding, and payment destination metadata."><Field label="Employee"><select value={selectedEmployeeId} onChange={(event)=>loadEmployee(event.target.value)}>{data.users.filter((user)=>user.role!=="Customer").map((user)=><option value={user.id} key={user.id}>{user.name}</option>)}</select></Field><div className="payroll-setup-status"><div><span>HR compensation</span><strong>{activeCompensation(hcm,selectedEmployeeId)?`${activeCompensation(hcm,selectedEmployeeId)?.basis} · ${formatMoney(activeCompensation(hcm,selectedEmployeeId)?.rate??0)}`:"Missing"}</strong>{!activeCompensation(hcm,selectedEmployeeId)&&<Button size="sm" variant="ghost" onClick={()=>navigate("people")}>Open Human Resources</Button>}</div><div><span>Benefit deduction / regular pay</span><strong>{formatMoney(benefitDeductionPerPayPeriod(hcm,selectedEmployeeId))}</strong></div></div><div className="company-grid company-grid--two payroll-setup-grid"><form className="form-grid" onSubmit={saveEmployee}><Field label="Pay group"><select required value={payGroupId} onChange={(event)=>setPayGroupId(event.target.value)}><option value="">Select pay group</option>{payroll.payGroups.filter((group)=>group.active).map((group)=><option key={group.id} value={group.id}>{group.name}</option>)}</select></Field><Field label="Payment method"><select value={paymentMethod} onChange={(event)=>setPaymentMethod(event.target.value as PayrollEmployee["paymentMethod"])}><option>ACH</option><option>Check</option><option>Manual</option></select></Field><Field label="Payment token / masked label"><input value={paymentTokenLabel} onChange={(event)=>setPaymentTokenLabel(event.target.value)} placeholder="Token or masked destination only" /></Field><Button type="submit" icon={<WalletCards size={15}/>}>Save payroll setup</Button></form><form className="form-grid" onSubmit={saveTax}><Field label="Effective date"><input type="date" required value={effectiveDate} onChange={(event)=>setEffectiveDate(event.target.value)} /></Field><Field label="Federal withholding %"><input type="number" min="0" step="0.001" value={federalPercent} onChange={(event)=>setFederalPercent(event.target.value)} /></Field><Field label="State withholding %"><input type="number" min="0" step="0.001" value={statePercent} onChange={(event)=>setStatePercent(event.target.value)} /></Field><Field label="Local withholding %"><input type="number" min="0" step="0.001" value={localPercent} onChange={(event)=>setLocalPercent(event.target.value)} /></Field><Field label="Additional withholding"><input type="number" min="0" step="0.01" value={additionalWithholding} onChange={(event)=>setAdditionalWithholding(event.target.value)} /></Field><Field label="Other post-tax deduction"><input type="number" min="0" step="0.01" value={postTaxDeduction} onChange={(event)=>setPostTaxDeduction(event.target.value)} /></Field><Button type="submit" icon={<LockKeyhole size={15}/>}>Save withholding profile</Button></form></div></Section><div className="payroll-control-alert"><ShieldCheck size={20}/><div><strong>Official tax tables and filing endpoints are production data dependencies, not substitute payroll products.</strong><p>Momentum owns the payroll workflow, calculations, approvals, statements, liabilities, disbursement instructions, corrections, and audit trail. Verified tax rules populate the native engine.</p></div></div></>}
  </div>;
}
