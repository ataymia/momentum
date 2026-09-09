import { paymentSettlementDate, type CommerceState } from "./commerce-engine";
import type { FinanceState } from "./finance-engine";
import type { InventoryLedgerState } from "./inventory-ledger";
import type { PayRun, PayrollState } from "./payroll-engine";

export const ACCOUNTING_STORAGE_KEY="momentum-accounting-v1";
export type AccountingBasis="Not configured"|"Cash"|"Accrual";
export type InventoryValuation="Not configured"|"FIFO"|"Weighted average";
export type AccountType="Asset"|"Liability"|"Equity"|"Revenue"|"Expense";
export type LedgerAccount={id:string;code:string;name:string;type:AccountType;active:boolean;systemRole?:"Cash"|"Accounts receivable"|"Sales revenue"|"Refunds / returns"|"Inventory"|"COGS"|"Payroll expense"|"Payroll liability"|"Expense payable"};
export type SourceEventType="Invoice issued"|"Payment cleared"|"Payment reversed"|"Credit applied"|"Refund settled"|"Inventory receipt"|"Inventory delivered"|"Inventory adjustment"|"Payroll released"|"Expense paid";
export type AccountingRule={id:string;eventType:SourceEventType;debitAccountId:string;creditAccountId:string;effectiveDate:string;active:boolean;memoTemplate:string};
export type JournalLine={id:string;accountId:string;debit:number;credit:number;memo?:string};
export type JournalEntry={id:string;number:string;date:string;memo:string;status:"Draft"|"Posted"|"Voided";sourceType:SourceEventType|"Manual";sourceId:string;lines:JournalLine[];createdAt:string;createdBy:string;postedAt?:string;postedBy?:string;voidedAt?:string;voidedBy?:string;voidReason?:string};
export type Reconciliation={id:string;accountId:string;periodEnd:string;statementEndingBalance:number;ledgerEndingBalance:number;difference:number;status:"Open"|"Reconciled";createdAt:string;createdBy:string;reconciledAt?:string;reconciledBy?:string;note?:string};
export type AccountingSettings={basis:AccountingBasis;inventoryValuation:InventoryValuation;fiscalYearStartMonth:number};
export type AccountingState={version:1;settings:AccountingSettings;accounts:LedgerAccount[];rules:AccountingRule[];journals:JournalEntry[];reconciliations:Reconciliation[]};
export type AccountingSourceEvent={id:string;type:SourceEventType;date:string;amount?:number;description:string;sourceId:string;blockedReason?:string};
export type PayrollJournalTotals={grossWages:number;employerTaxes:number;employeeTaxes:number;benefitDeductions:number;otherPostTaxDeductions:number;netPay:number;totalExpense:number;totalLiability:number};

const now=()=>new Date().toISOString();
const date=(value:string)=>value.slice(0,10);
const finiteNonNegative=(value:number)=>Number.isFinite(value)&&value>=0;
export function createAccountingSeed():AccountingState{return{version:1,settings:{basis:"Not configured",inventoryValuation:"Not configured",fiscalYearStartMonth:1},accounts:[
  {id:"acct-cash",code:"1000",name:"Cash / clearing",type:"Asset",active:true,systemRole:"Cash"},
  {id:"acct-ar",code:"1100",name:"Accounts receivable",type:"Asset",active:true,systemRole:"Accounts receivable"},
  {id:"acct-inventory",code:"1200",name:"Inventory",type:"Asset",active:true,systemRole:"Inventory"},
  {id:"acct-sales",code:"4000",name:"Sales revenue",type:"Revenue",active:true,systemRole:"Sales revenue"},
  {id:"acct-returns",code:"4050",name:"Returns / credits",type:"Revenue",active:true,systemRole:"Refunds / returns"},
  {id:"acct-cogs",code:"5000",name:"Cost of goods sold",type:"Expense",active:true,systemRole:"COGS"},
  {id:"acct-payroll",code:"6100",name:"Payroll expense",type:"Expense",active:true,systemRole:"Payroll expense"},
  {id:"acct-payroll-liability",code:"2100",name:"Payroll liabilities",type:"Liability",active:true,systemRole:"Payroll liability"},
  {id:"acct-expense-payable",code:"2200",name:"Employee reimbursement payable",type:"Liability",active:true,systemRole:"Expense payable"},
],rules:[],journals:[],reconciliations:[]};}
export function normalizeAccountingState(input:unknown):AccountingState{const seed=createAccountingSeed();if(!input||typeof input!=="object")return seed;const state=input as Partial<AccountingState>;return{version:1,settings:{...seed.settings,...state.settings},accounts:Array.isArray(state.accounts)&&state.accounts.length?state.accounts:seed.accounts,rules:Array.isArray(state.rules)?state.rules:[],journals:Array.isArray(state.journals)?state.journals:[],reconciliations:Array.isArray(state.reconciliations)?state.reconciliations:[]};}
export function journalBalanced(entry:JournalEntry){const debit=entry.lines.reduce((sum,line)=>sum+line.debit,0);const credit=entry.lines.reduce((sum,line)=>sum+line.credit,0);return Math.abs(debit-credit)<0.005&&debit>0;}
export function accountBalance(state:AccountingState,accountId:string,through?:string){const account=state.accounts.find((item)=>item.id===accountId);if(!account)return 0;const lines=state.journals.filter((entry)=>entry.status==="Posted"&&(!through||entry.date<=through)).flatMap((entry)=>entry.lines.filter((line)=>line.accountId===accountId));const debit=lines.reduce((sum,line)=>sum+line.debit,0);const credit=lines.reduce((sum,line)=>sum+line.credit,0);return["Asset","Expense"].includes(account.type)?debit-credit:credit-debit;}
export function trialBalance(state:AccountingState,through?:string){return state.accounts.filter((account)=>account.active).map((account)=>({account,balance:accountBalance(state,account.id,through)}));}

export function payrollJournalTotals(run:PayRun):PayrollJournalTotals|null{
  if(run.status!=="Released"||!run.lines.length)return null;
  const grossWages=run.lines.reduce((sum,line)=>sum+line.grossPay,0);
  const employerTaxes=run.lines.reduce((sum,line)=>sum+line.employerTaxes,0);
  const employeeTaxes=run.lines.reduce((sum,line)=>sum+line.employeeTaxes,0);
  const benefitDeductions=run.lines.reduce((sum,line)=>sum+line.benefitDeduction,0);
  const otherPostTaxDeductions=run.lines.reduce((sum,line)=>sum+line.postTaxDeduction,0);
  const netPay=run.lines.reduce((sum,line)=>sum+line.netPay,0);
  const values=[grossWages,employerTaxes,employeeTaxes,benefitDeductions,otherPostTaxDeductions,netPay];
  if(!values.every(finiteNonNegative))return null;
  const totalExpense=grossWages+employerTaxes;
  const totalLiability=employeeTaxes+employerTaxes+benefitDeductions+otherPostTaxDeductions;
  if(Math.abs(totalExpense-(netPay+totalLiability))>=0.005)return null;
  return{grossWages,employerTaxes,employeeTaxes,benefitDeductions,otherPostTaxDeductions,netPay,totalExpense,totalLiability};
}

export function buildPayrollJournal(state:AccountingState,run:PayRun,actorId:string):JournalEntry|null{
  const totals=payrollJournalTotals(run);if(!totals||!actorId)return null;
  const expense=state.accounts.find((account)=>account.active&&account.systemRole==="Payroll expense");
  const liability=state.accounts.find((account)=>account.active&&account.systemRole==="Payroll liability");
  const cash=state.accounts.find((account)=>account.active&&account.systemRole==="Cash");
  if(!expense||!liability||!cash||new Set([expense.id,liability.id,cash.id]).size!==3)return null;
  const number=`JE-${String(state.journals.length+1).padStart(5,"0")}`;
  const lines:JournalLine[]=[{id:`line-${number}-expense`,accountId:expense.id,debit:totals.totalExpense,credit:0,memo:`Gross wages ${totals.grossWages.toFixed(2)} + employer payroll taxes ${totals.employerTaxes.toFixed(2)}`}];
  if(totals.netPay>0)lines.push({id:`line-${number}-net`,accountId:cash.id,debit:0,credit:totals.netPay,memo:"Net pay released to payment clearing"});
  if(totals.employeeTaxes>0)lines.push({id:`line-${number}-employee-tax`,accountId:liability.id,debit:0,credit:totals.employeeTaxes,memo:"Employee tax withholdings payable"});
  if(totals.employerTaxes>0)lines.push({id:`line-${number}-employer-tax`,accountId:liability.id,debit:0,credit:totals.employerTaxes,memo:"Employer payroll taxes payable"});
  if(totals.benefitDeductions>0)lines.push({id:`line-${number}-benefits`,accountId:liability.id,debit:0,credit:totals.benefitDeductions,memo:"Employee benefit deductions payable"});
  if(totals.otherPostTaxDeductions>0)lines.push({id:`line-${number}-other`,accountId:liability.id,debit:0,credit:totals.otherPostTaxDeductions,memo:"Other employee deductions payable"});
  const entry:JournalEntry={id:`journal-payroll-${run.id}`,number,date:date(run.releasedAt??run.payDate),memo:`${run.kind} payroll released · ${run.id}`,status:"Draft",sourceType:"Payroll released",sourceId:run.id,lines,createdAt:now(),createdBy:actorId};
  return journalBalanced(entry)?entry:null;
}

export function sourceEvents(commerce:CommerceState,inventory:InventoryLedgerState,payroll?:PayrollState,finance?:FinanceState):AccountingSourceEvent[]{const events:AccountingSourceEvent[]=[];
  for(const invoice of commerce.invoices.filter((item)=>item.status!=="Void"))events.push({id:`invoice:${invoice.id}`,type:"Invoice issued",date:date(invoice.issuedAt),amount:invoice.total,description:`Invoice ${invoice.number}`,sourceId:invoice.id});
  for(const payment of commerce.payments.filter((item)=>item.status==="Cleared"))events.push({id:`payment:${payment.id}`,type:"Payment cleared",date:paymentSettlementDate(payment)??date(payment.receivedAt),amount:payment.amount,description:`Cleared ${payment.method} payment`,sourceId:payment.id});
  for(const payment of commerce.payments.filter((item)=>item.status==="Reversed"))events.push({id:`payment-reversal:${payment.id}`,type:"Payment reversed",date:date(payment.reversedAt??payment.receivedAt),amount:payment.amount,description:`Reversed ${payment.method} payment`,sourceId:payment.id,blockedReason:"Payment reversal accounting requires approved treatment and linkage to the original posted payment journal before posting."});
  for(const credit of commerce.credits.filter((item)=>item.status==="Applied")){const invoice=commerce.invoices.find((item)=>item.id===credit.invoiceId);events.push({id:`credit:${credit.id}`,type:"Credit applied",date:date(credit.appliedAt??credit.approvedAt??credit.createdAt),amount:credit.amount,description:`Credit applied to ${invoice?.number??credit.invoiceId}`,sourceId:credit.id});}
  for(const refund of commerce.refunds.filter((item)=>item.status==="Settled"))events.push({id:`refund:${refund.id}`,type:"Refund settled",date:date(refund.settledAt??refund.createdAt),amount:refund.amount,description:"Customer refund settled",sourceId:refund.id});
  for(const movement of inventory.movements){if(movement.type==="Receipt")events.push({id:`movement:${movement.id}`,type:"Inventory receipt",date:date(movement.at),description:`${movement.quantity} case receipt · ${movement.product}`,sourceId:movement.id,blockedReason:"Inventory dollar value requires the approved valuation method and unit cost."});else if(movement.type==="Delivery")events.push({id:`movement:${movement.id}`,type:"Inventory delivered",date:date(movement.at),description:`${movement.quantity} case delivery · ${movement.product}`,sourceId:movement.id,blockedReason:"COGS requires the approved inventory valuation method and cost record."});else if(["Adjustment","Damage","Shrink","Disposal"].includes(movement.type))events.push({id:`movement:${movement.id}`,type:"Inventory adjustment",date:date(movement.at),description:`${movement.type} · ${movement.quantity} cases · ${movement.product}`,sourceId:movement.id,blockedReason:"Inventory adjustment value requires the approved valuation method and cost record."});}
  for(const run of payroll?.runs.filter((item)=>item.status==="Released")??[]){const totals=payrollJournalTotals(run);events.push({id:`payroll:${run.id}`,type:"Payroll released",date:date(run.releasedAt??run.payDate),amount:totals?.totalExpense,description:totals?`${run.kind} payroll · wages plus employer tax ${totals.totalExpense.toFixed(2)}`:`${run.kind} payroll · accounting totals do not reconcile`,sourceId:run.id,blockedReason:totals?undefined:"Released payroll totals do not balance to net pay and payroll liabilities."});}
  for(const expense of finance?.expenses.filter((item)=>item.status==="Paid")??[])events.push({id:`expense:${expense.id}`,type:"Expense paid",date:date(expense.paidAt??expense.submittedAt),amount:expense.amount,description:`${expense.category} · ${expense.merchant}`,sourceId:expense.id,blockedReason:"Expense accounting requires an approved category-to-ledger mapping before automatic posting."});
  return events.sort((a,b)=>b.date.localeCompare(a.date));}
export function unprocessedSourceEvents(state:AccountingState,events:AccountingSourceEvent[]){const processed=new Set(state.journals.filter((entry)=>entry.status!=="Voided").map((entry)=>`${entry.sourceType}:${entry.sourceId}`));return events.filter((event)=>!processed.has(`${event.type}:${event.sourceId}`));}
export function ruleForEvent(state:AccountingState,event:AccountingSourceEvent){return state.rules.filter((rule)=>rule.active&&rule.eventType===event.type&&rule.effectiveDate<=event.date).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate))[0];}
export function buildJournalFromEvent(state:AccountingState,event:AccountingSourceEvent,actorId:string):JournalEntry|null{if(event.type==="Payroll released"||!event.amount||event.amount<=0||event.blockedReason)return null;const rule=ruleForEvent(state,event);if(!rule||rule.debitAccountId===rule.creditAccountId)return null;const number=`JE-${String(state.journals.length+1).padStart(5,"0")}`;return{id:`journal-${event.id.replace(/[^a-z0-9]/gi,"-")}`,number,date:event.date,memo:rule.memoTemplate.replace("{description}",event.description),status:"Draft",sourceType:event.type,sourceId:event.sourceId,lines:[{id:`line-${number}-d`,accountId:rule.debitAccountId,debit:event.amount,credit:0},{id:`line-${number}-c`,accountId:rule.creditAccountId,debit:0,credit:event.amount}],createdAt:now(),createdBy:actorId};}