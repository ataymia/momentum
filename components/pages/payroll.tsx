"use client";

import { BadgeDollarSign, Calculator, Check, CircleDollarSign, FileText, LockKeyhole, Play, ShieldCheck, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { evaluateSalesRepAccountBonuses } from "../../lib/bonus-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney, hoursBetween } from "../ui";

type PayrollConfig = { employeeId:string; payType:"Hourly"|"Salary per pay period"; rate:number; taxPercent:number; deductionPercent:number; flatDeduction:number };
type PayLine = { employeeId:string; regularHours:number; regularPay:number; bonusPay:number; bonusEarningIds:string[]; grossPay:number; taxWithholding:number; deductions:number; netPay:number };
type PayRun = { id:string; createdAt:string; periodStart:string; periodEnd:string; status:"Draft"|"Approved"|"Released"|"Voided"; timecardIds:string[]; lines:PayLine[] };
type PayrollState = { configs:PayrollConfig[]; runs:PayRun[] };
const KEY = "momentum-payroll-v2";
const seed: PayrollState = { configs:[], runs:[] };
const load = (): PayrollState => { if (typeof window === "undefined") return seed; try { return JSON.parse(window.localStorage.getItem(KEY) ?? JSON.stringify(seed)) as PayrollState; } catch { return seed; } };

export function PayrollPage() {
  const { data, currentUser } = useWorkspace();
  const [tab,setTab] = useState<"self"|"processing"|"setup">("self");
  const [state,setState] = useState<PayrollState>(load);
  const [selectedEmployeeId,setSelectedEmployeeId] = useState(currentUser?.id ?? "");
  const [payType,setPayType] = useState<PayrollConfig["payType"]>("Hourly");
  const [rate,setRate] = useState(""); const [taxPercent,setTaxPercent] = useState(""); const [deductionPercent,setDeductionPercent] = useState(""); const [flatDeduction,setFlatDeduction] = useState("");
  const admin = currentUser?.role === "Administrator";
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(KEY,JSON.stringify(state)); },[state]);

  const activeRuns = state.runs.filter((run) => run.status !== "Voided");
  const processedTimecardIds = useMemo(() => new Set(activeRuns.flatMap((run) => run.timecardIds ?? [])), [activeRuns]);
  const processedEarningIds = useMemo(() => new Set(activeRuns.flatMap((run) => run.lines.flatMap((line) => line.bonusEarningIds ?? []))), [activeRuns]);
  const myConfig = state.configs.find((item) => item.employeeId === currentUser?.id);
  const myRuns = activeRuns.filter((run) => run.lines.some((line) => line.employeeId === currentUser?.id));
  const latestMyLine = myRuns[0]?.lines.find((line) => line.employeeId === currentUser?.id);
  const earnedBonuses = useMemo(() => evaluateSalesRepAccountBonuses(data).filter((signal) => signal.status === "Earned"),[data]);
  const unprocessedBonuses = earnedBonuses.filter((signal) => !processedEarningIds.has(signal.id));
  const unprocessedCards = data.timecards.filter((card) => (card.status === "Payroll ready" || card.status === "Manager approved") && !processedTimecardIds.has(card.id));

  const saveConfig = (event:FormEvent) => {
    event.preventDefault(); if (!admin || !selectedEmployeeId || Number(rate) < 0) return;
    const next:PayrollConfig = { employeeId:selectedEmployeeId, payType, rate:Number(rate), taxPercent:Number(taxPercent || 0), deductionPercent:Number(deductionPercent || 0), flatDeduction:Number(flatDeduction || 0) };
    setState((current) => ({ ...current, configs:[next,...current.configs.filter((item) => item.employeeId !== selectedEmployeeId)] }));
  };
  const calculateLine = (employeeId:string, periodStart:string, periodEnd:string):PayLine | null => {
    const config = state.configs.find((item) => item.employeeId === employeeId); if (!config) return null;
    const entries = data.timeEntries.filter((entry) => entry.userId === employeeId && entry.date >= periodStart && entry.date <= periodEnd);
    const hours = entries.reduce((sum,entry) => sum + hoursBetween(entry.clockIn,entry.clockOut,entry.breakMinutes),0);
    const regularPay = config.payType === "Hourly" ? hours * config.rate : config.rate;
    const employeeBonuses = unprocessedBonuses.filter((signal) => signal.repId === employeeId);
    const bonusPay = employeeBonuses.reduce((sum,signal) => sum + signal.amount,0);
    const grossPay = regularPay + bonusPay;
    const taxWithholding = grossPay * (config.taxPercent / 100);
    const deductions = grossPay * (config.deductionPercent / 100) + config.flatDeduction;
    return { employeeId,regularHours:hours,regularPay,bonusPay,bonusEarningIds:employeeBonuses.map((signal) => signal.id),grossPay,taxWithholding,deductions,netPay:Math.max(0,grossPay-taxWithholding-deductions) };
  };
  const buildDraft = () => {
    if (!admin || unprocessedCards.length === 0) return;
    const periodStart = unprocessedCards.map((card) => card.weekStart).sort()[0];
    const periodEnd = unprocessedCards.map((card) => card.weekEnd).sort().at(-1)!;
    const employeeIds = [...new Set(unprocessedCards.map((card) => card.userId))];
    const lines = employeeIds.map((id) => calculateLine(id,periodStart,periodEnd)).filter((line): line is PayLine => Boolean(line));
    if (lines.length === 0) return;
    const timecardIds = unprocessedCards.filter((card) => lines.some((line) => line.employeeId === card.userId)).map((card) => card.id);
    setState((current) => ({ ...current,runs:[{ id:`pay-${Date.now()}`,createdAt:new Date().toISOString(),periodStart,periodEnd,status:"Draft",timecardIds,lines },...current.runs] }));
  };
  const setRunStatus = (id:string,status:"Approved"|"Released"|"Voided") => {
    if (!admin) return;
    setState((current) => ({ ...current,runs:current.runs.map((run) => {
      if (run.id !== id) return run;
      if (status === "Approved" && run.status !== "Draft") return run;
      if (status === "Released" && run.status !== "Approved") return run;
      if (status === "Voided" && run.status === "Released") return run;
      return { ...run,status };
    }) }));
  };

  return <div className="page page--payroll"><PageHeader eyebrow="Workforce compensation" title="Payroll" description="Momentum calculates earnings from approved source records, preserves every pay-line component, and creates the payment-release instruction without surrendering the payroll workflow to another platform." actions={<StatusPill tone="gold">Native payroll engine</StatusPill>}/>
    <div className="company-tabs"><button className={tab === "self" ? "is-active" : ""} onClick={() => setTab("self")}>My pay</button>{admin && <button className={tab === "processing" ? "is-active" : ""} onClick={() => setTab("processing")}>Pay runs</button>}{admin && <button className={tab === "setup" ? "is-active" : ""} onClick={() => setTab("setup")}>Payroll setup</button>}</div>
    {tab === "self" && <div className="company-grid company-grid--two"><Section title="Payroll profile" description="The employee can see the pay basis and current configuration that affects their statement"><div className="payroll-profile"><div><span><BadgeDollarSign size={20}/></span><div><small>Pay basis</small><strong>{myConfig ? `${myConfig.payType} · ${formatMoney(myConfig.rate)}` : "Not configured"}</strong></div></div><div><span><Calculator size={20}/></span><div><small>Withholding setup</small><strong>{myConfig ? `${myConfig.taxPercent}% tax · ${myConfig.deductionPercent}% + ${formatMoney(myConfig.flatDeduction)} deductions` : "Not configured"}</strong></div></div><div><span><WalletCards size={20}/></span><div><small>Payment method</small><strong>Payment rail not connected</strong></div></div></div></Section><Section title="Latest statement" description="Every net-pay number drills into hours, earnings, bonuses, withholding and deductions">{latestMyLine ? <div className="pay-statement"><div><span>Regular pay</span><strong>{formatMoney(latestMyLine.regularPay)}</strong></div><div><span>Bonus earnings</span><strong>{formatMoney(latestMyLine.bonusPay)}</strong></div><div><span>Gross pay</span><strong>{formatMoney(latestMyLine.grossPay)}</strong></div><div><span>Tax withholding</span><strong>-{formatMoney(latestMyLine.taxWithholding)}</strong></div><div><span>Deductions</span><strong>-{formatMoney(latestMyLine.deductions)}</strong></div><div className="pay-statement__net"><span>Net pay</span><strong>{formatMoney(latestMyLine.netPay)}</strong></div></div> : <div className="review-empty"><FileText size={24}/><h3>No pay statement yet</h3><p>A statement appears after an authorized payroll run includes this employee.</p></div>}</Section></div>}

    {tab === "processing" && admin && <><div className="payroll-control-alert"><ShieldCheck size={20}/><div><strong>Payroll is built from approved records, not manual memory.</strong><p>Timecards feed regular pay. Earned sales bonuses feed variable pay once. Previously included timecards and bonus earning IDs are blocked from a second active pay run.</p></div><Button icon={<Play size={15}/>} onClick={buildDraft} disabled={unprocessedCards.length === 0}>Build draft run</Button></div><div className="company-rule-facts"><div><span>Ready timecards</span><strong>{unprocessedCards.length}</strong><small>Not in another active run</small></div><div><span>Unprocessed bonuses</span><strong>{unprocessedBonuses.length}</strong><small>Earned source events</small></div><div><span>Draft / approved runs</span><strong>{activeRuns.filter((run) => run.status !== "Released").length}</strong><small>Awaiting completion</small></div><div><span>Released runs</span><strong>{activeRuns.filter((run) => run.status === "Released").length}</strong><small>Payment instruction issued</small></div></div><Section title="Pay-run register" description="Draft → approved → released; voiding before release frees the underlying timecards and earnings for a corrected run"><div className="campaign-register">{state.runs.map((run) => <article key={run.id}><div className="campaign-register__head"><div><small>{formatDate(run.periodStart,{month:"short",day:"numeric"})} – {formatDate(run.periodEnd,{month:"short",day:"numeric",year:"numeric"})}</small><strong>{run.id}</strong><p>{run.lines.length} employee line{run.lines.length === 1 ? "" : "s"} · gross {formatMoney(run.lines.reduce((sum,line) => sum + line.grossPay,0))} · net {formatMoney(run.lines.reduce((sum,line) => sum + line.netPay,0))}</p></div><StatusPill tone={run.status === "Released" ? "success" : run.status === "Approved" ? "gold" : run.status === "Voided" ? "danger" : "info"}>{run.status}</StatusPill></div><div className="finance-order-list"><div className="finance-order-row finance-order-row--head"><span>Employee</span><span>Hours</span><span>Regular</span><span>Bonus</span><span>Net</span></div>{run.lines.map((line) => { const employee=data.users.find((user) => user.id === line.employeeId); return <div className="finance-order-row" key={line.employeeId}><span>{employee?.name}</span><span>{line.regularHours.toFixed(2)}</span><span>{formatMoney(line.regularPay)}</span><span>{formatMoney(line.bonusPay)}{line.bonusEarningIds?.length ? ` (${line.bonusEarningIds.length})` : ""}</span><span><strong>{formatMoney(line.netPay)}</strong></span></div>; })}</div><div className="request-actions">{run.status === "Draft" && <><Button size="sm" variant="secondary" icon={<X size={14}/>} onClick={() => setRunStatus(run.id,"Voided")}>Void draft</Button><Button size="sm" icon={<Check size={14}/>} onClick={() => setRunStatus(run.id,"Approved")}>Approve payroll</Button></>}{run.status === "Approved" && <><Button size="sm" variant="secondary" icon={<X size={14}/>} onClick={() => setRunStatus(run.id,"Voided")}>Void before release</Button><Button size="sm" variant="gold" icon={<WalletCards size={14}/>} onClick={() => setRunStatus(run.id,"Released")}>Release payment instruction</Button></>}</div></article>)}{state.runs.length === 0 && <div className="review-empty"><p>No payroll runs have been built.</p></div>}</div></Section></>}

    {tab === "setup" && admin && <div className="company-grid company-grid--two"><Section title="Employee payroll configuration" description="Rates and deduction rules are effective inputs to the native calculation engine"><form className="form-grid" onSubmit={saveConfig}><Field label="Employee"><select value={selectedEmployeeId} onChange={(event) => { const id=event.target.value; setSelectedEmployeeId(id); const cfg=state.configs.find((item)=>item.employeeId===id); if(cfg){setPayType(cfg.payType);setRate(String(cfg.rate));setTaxPercent(String(cfg.taxPercent));setDeductionPercent(String(cfg.deductionPercent));setFlatDeduction(String(cfg.flatDeduction));} }}><option value="">Select employee</option>{data.users.filter((user)=>user.role!=="Customer").map((user)=><option value={user.id} key={user.id}>{user.name}</option>)}</select></Field><Field label="Pay type"><select value={payType} onChange={(event)=>setPayType(event.target.value as PayrollConfig["payType"])}><option>Hourly</option><option>Salary per pay period</option></select></Field><Field label={payType === "Hourly" ? "Hourly rate" : "Salary per pay period"}><input type="number" min="0" step="0.01" required value={rate} onChange={(event)=>setRate(event.target.value)}/></Field><Field label="Tax withholding %"><input type="number" min="0" step="0.01" value={taxPercent} onChange={(event)=>setTaxPercent(event.target.value)}/></Field><Field label="Other deduction %"><input type="number" min="0" step="0.01" value={deductionPercent} onChange={(event)=>setDeductionPercent(event.target.value)}/></Field><Field label="Flat deduction"><input type="number" min="0" step="0.01" value={flatDeduction} onChange={(event)=>setFlatDeduction(event.target.value)}/></Field><Button type="submit" icon={<LockKeyhole size={15}/>}>Save payroll rule</Button></form></Section><Section title="Native payroll build path" description="What still gets added before live payroll"><div className="company-list">{[[CircleDollarSign,"Earnings rules","Hourly, salary, overtime, commissions, bonuses, reimbursements and other earning codes"],[Calculator,"Tax engine","Federal, state and local withholding tables, employer taxes, filing periods and jurisdiction rules"],[WalletCards,"Payment instructions","Direct deposit / check / ACH release files and settlement reconciliation"],[FileText,"Statements & filings","Pay stubs, payroll register, tax liabilities, quarter/year forms and audit exports"]].map(([Icon,title,copy])=>{const I=Icon as typeof CircleDollarSign;return <div key={title as string}><span><I size={18}/></span><div><strong>{title as string}</strong><p>{copy as string}</p></div></div>;})}</div></Section></div>}
  </div>;
}