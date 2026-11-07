"use client";

import {useEffect,useMemo,useState,useSyncExternalStore,type FormEvent} from "react";
import {ArrowLeft,ArrowUpDown,Search,ShieldCheck} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {momentumStorage} from "../../lib/persistence";
import {navigateToRoute} from "../../lib/navigation-store";
import {GOLDEN_EAGLE_SKUS,skuById} from "../../lib/product-catalog";
import {
  PURCHASING_DEMO_KEY,applyPurchaseAction,billDueCents,billedCases,emptyPurchasingState,
  normalizePurchasingDemoState,poStatus,receivedCases,threeWayMatch,
  type PurchaseAction,type PurchaseActor,type PurchasingState,
} from "../../lib/purchasing-review";

type Section="vendors"|"expenses"|"orders"|"receipts"|"bills"|"payments"|"credits";
type Row={id:string;date:string;values:Record<string,string|number>;status:string};
type Column={key:string;label:string};
const sectionTitles:Record<Section,string>={
  vendors:"Vendors",expenses:"Expenses",orders:"Purchase Orders",receipts:"Purchase Receipts",
  bills:"Supplier Bills",payments:"Payments Made",credits:"Vendor Credits",
};
const sections=new Set(Object.keys(sectionTitles));
const subscribeBrowser=()=>()=>{};
const clientSnapshot=()=>true;
const serverSnapshot=()=>false;
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n/100);
const date=(v?:string)=>v?v.slice(0,10):"Not recorded";
const cents=(s:string)=>Math.round(Number(s)*100);
const field=(fd:FormData,key:string)=>String(fd.get(key)??"").trim();
const positive=(s:string)=>Number(s);
const monetaryColumns=new Set(["cost","total","variance","due"]);
const defaultDate=()=>new Date().toISOString().slice(0,10);
const vendorName=(s:PurchasingState,id:string)=>s.vendors.find(v=>v.id===id)?.name??"Unknown vendor";
const poName=(s:PurchasingState,id:string)=>s.orders.find(p=>p.id===id)?.id??"Unknown order";

function PurchasingForm({section,state,run,role}:{section:Section;state:PurchasingState;run:(a:PurchaseAction)=>boolean;role:string}){
  const isAdmin=role==="Administrator";const canPrepare=isAdmin||role==="Operations";
  const canReceive=canPrepare||role==="Warehouse";
  const canCreate=(section==="receipts"?canReceive:["orders","expenses","bills","credits"].includes(section)?canPrepare:isAdmin);
  const [open,setOpen]=useState(false);
  const [selection,setSelection]=useState("");
  if(!canCreate)return null;
  const orders=state.orders.filter(p=>p.approvedAt&&!p.cancelledAt);
  const bills=state.bills.filter(b=>b.approvedAt);
  const supplierOptions=state.vendors.filter(v=>v.active);
  const submit=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    let action:PurchaseAction;
    switch(section){
      case "vendors":action={kind:"vendor.add",name:field(fd,"name"),contact:field(fd,"contact")};break;
      case "orders":action={kind:"po.create",vendorId:field(fd,"vendor"),sku:field(fd,"sku"),cases:positive(field(fd,"cases")),unitCostCents:cents(field(fd,"unitCost")),warehouse:field(fd,"warehouse"),expectedDate:field(fd,"expectedDate")};break;
      case "receipts":action={kind:"receipt.record",poId:field(fd,"order"),cases:positive(field(fd,"cases")),lotCode:field(fd,"lot"),bestBy:field(fd,"bestBy"),warehouse:field(fd,"warehouse")};break;
      case "bills":action={kind:"bill.record",poId:field(fd,"order"),invoiceNumber:field(fd,"invoice"),cases:positive(field(fd,"cases")),amountCents:cents(field(fd,"amount"))};break;
      case "payments":action={kind:"payment.record",billId:field(fd,"bill"),reference:field(fd,"reference"),amountCents:cents(field(fd,"amount"))};break;
      case "credits":action={kind:"credit.record",billId:field(fd,"bill"),reference:field(fd,"reference"),reason:field(fd,"reason"),amountCents:cents(field(fd,"amount"))};break;
      case "expenses":action={kind:"expense.record",vendorId:field(fd,"vendor")||undefined,description:field(fd,"description"),amountCents:cents(field(fd,"amount"))};break;
    }
    if(run(action)){
      e.currentTarget.reset();setSelection("");
    }
  };
  const poOptions=orders.filter(p=>section==="receipts"?receivedCases(state,p.id)<p.cases:true);
  const purchaseOptions=poOptions;
  return <section className="prototype-panel">
    <button type="button" className="prototype-link" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?"Close entry form":"Prepare "+sectionTitles[section].toLowerCase().replace(/s$/,"")}</button>
    {open&&<form className="prototype-purchasing-form" onSubmit={submit}>
      {section==="vendors"&&<><label>Vendor name<input name="name" required maxLength={160}/></label><label>Contact / reference<input name="contact" maxLength={160}/></label></>}
      {section==="orders"&&<>
        <label>Registered vendor<select name="vendor" required defaultValue=""><option value="">Select vendor</option>{supplierOptions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Verified product SKU<select name="sku" required defaultValue=""><option value="">Select SKU</option>{GOLDEN_EAGLE_SKUS.filter(x=>x.active&&!x.testOnly).map(x=><option key={x.id} value={x.id}>{x.shortName} ({x.casePack}/case)</option>)}</select></label>
        <label>Cases<input name="cases" type="number" required min={1} step={1}/></label>
        <label>Quoted cost per case (USD)<input name="unitCost" type="number" required min="0.01" step="0.01"/></label>
        <label>Receiving warehouse<input name="warehouse" required placeholder="Enter approved physical location"/></label>
        <label>Expected date<input name="expectedDate" type="date" defaultValue={defaultDate()} required/></label>
      </>}
      {section==="receipts"&&<>
        <label>Approved PO<select name="order" required value={selection} onChange={e=>setSelection(e.target.value)}><option value="">Select approved order</option>{poOptions.map(p=><option key={p.id} value={p.id}>{p.id} · {p.sku} · {p.cases-receivedCases(state,p.id)} cases remaining</option>)}</select></label>
        <label>Received cases<input name="cases" type="number" min={1} step={1} required/></label>
        <label>Physical lot / batch code<input name="lot" required/></label>
        <label>Best-by date<input name="bestBy" type="date" required/></label>
        <label>Warehouse location<input name="warehouse" required value={orders.find(p=>p.id===selection)?.warehouse??""} readOnly/></label>
      </>}
      {section==="bills"&&<>
        <label>Approved PO<select name="order" required defaultValue=""><option value="">Select approved order</option>{purchaseOptions.map(p=><option key={p.id} value={p.id}>{p.id} · {p.cases-billedCases(state,p.id)} unbilled cases</option>)}</select></label>
        <label>Vendor invoice reference<input name="invoice" required/></label>
        <label>Billed cases<input name="cases" type="number" min={1} step={1} required/></label>
        <label>Invoice total (USD)<input name="amount" type="number" min="0.01" step="0.01" required/></label>
      </>}
      {(section==="payments"||section==="credits")&&<>
        <label>Approved bill<select name="bill" required defaultValue=""><option value="">Select bill</option>{bills.filter(b=>billDueCents(state,b)>0).map(b=><option key={b.id} value={b.id}>{b.invoiceNumber} · {money(billDueCents(state,b))} unpaid</option>)}</select></label>
        <label>{section==="payments"?"Bank/provider reference":"Vendor credit reference"}<input name="reference" required/></label>
        {section==="credits"&&<label>Credit reason<input name="reason" required/></label>}
        <label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required/></label>
      </>}
      {section==="expenses"&&<>
        <label>Vendor (optional)<select name="vendor" defaultValue=""><option value="">No vendor linked</option>{supplierOptions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Expense purpose<input name="description" required/></label>
        <label>Amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required/></label>
      </>}
      <div className="prototype-purchasing-actions"><button type="submit">Record in local demo</button><small>Not a live purchase, stock receipt or money transfer.</small></div>
    </form>}
  </section>;
}

const columns:Record<Section,Column[]>={
  vendors:[{key:"name",label:"Vendor"},{key:"contact",label:"Contact"},{key:"created",label:"Created"}],
  orders:[{key:"vendor",label:"Vendor"},{key:"sku",label:"SKU"},{key:"cases",label:"Ordered cases"},{key:"received",label:"Received"},{key:"cost",label:"PO total"},{key:"status",label:"Status"}],
  receipts:[{key:"po",label:"PO"},{key:"cases",label:"Cases"},{key:"lot",label:"Lot code"},{key:"bestBy",label:"Best by"},{key:"warehouse",label:"Location"},{key:"status",label:"Ledger posting"}],
  bills:[{key:"invoice",label:"Invoice"},{key:"po",label:"PO"},{key:"cases",label:"Billed cases"},{key:"total",label:"Total"},{key:"variance",label:"Price variance"},{key:"status",label:"Match / approval"},{key:"due",label:"Unpaid"}],
  payments:[{key:"bill",label:"Bill"},{key:"reference",label:"Reference"},{key:"total",label:"Recorded"},{key:"status",label:"External settlement"}],
  credits:[{key:"bill",label:"Bill"},{key:"reference",label:"Reference"},{key:"reason",label:"Reason"},{key:"total",label:"Credit"},{key:"status",label:"Review"}],
  expenses:[{key:"description",label:"Description"},{key:"vendor",label:"Vendor"},{key:"total",label:"Amount"},{key:"status",label:"Review"}],
};
function buildRows(s:PurchasingState,section:Section):Row[]{
  switch(section){
    case "vendors":return s.vendors.map(v=>({id:v.id,date:date(v.createdAt),status:v.active?"Active":"Inactive",values:{name:v.name,contact:v.contact||"Not provided",created:date(v.createdAt)}}));
    case "orders":return s.orders.map(p=>({id:p.id,date:date(p.createdAt),status:poStatus(s,p),values:{vendor:vendorName(s,p.vendorId),sku:skuById(p.sku)?.shortName??p.sku,cases:p.cases,received:receivedCases(s,p.id),cost:p.cases*p.unitCostCents,status:poStatus(s,p)}}));
    case "receipts":return s.receipts.map(r=>({id:r.id,date:date(r.recordedAt),status:"Not posted",values:{po:poName(s,r.poId),cases:r.cases,lot:r.lotCode,bestBy:r.bestBy,warehouse:r.warehouse,status:"Pending inventory posting"}}));
    case "bills":return s.bills.map(b=>{const m=threeWayMatch(s,b);const st=b.approvedAt?"Approved":m.matched?"Matched · review needed":"Mismatch / awaiting receipt";return {id:b.id,date:date(b.recordedAt),status:st,values:{invoice:b.invoiceNumber,po:poName(s,b.poId),cases:b.cases,total:b.amountCents,variance:m.varianceCents,status:st,due:billDueCents(s,b)}};});
    case "payments":return s.payments.map(p=>({id:p.id,date:date(p.recordedAt),status:"Unverified",values:{bill:s.bills.find(b=>b.id===p.billId)?.invoiceNumber??p.billId,reference:p.reference,total:p.amountCents,status:"Local note only"}}));
    case "credits":return s.credits.map(c=>({id:c.id,date:date(c.recordedAt),status:c.approvedAt?"Reviewed":"Pending review",values:{bill:s.bills.find(b=>b.id===c.billId)?.invoiceNumber??c.billId,reference:c.reference,reason:c.reason,total:c.amountCents,status:c.approvedAt?"Reviewed":"Pending review"}}));
    case "expenses":return s.expenses.map(e=>({id:e.id,date:date(e.recordedAt),status:e.approvedAt?"Approved":"Awaiting approval",values:{description:e.description,vendor:e.vendorId?vendorName(s,e.vendorId):"Not linked",total:e.amountCents,status:e.approvedAt?"Approved":"Awaiting approval"}}));
  }
}
function RowAction({section,id,state,role,actorId,run}:{section:Section;id:string;state:PurchasingState;role:string;actorId:string;run:(a:PurchaseAction)=>boolean}){
  const admin=role==="Administrator";
  if(section==="orders"){
    const po=state.orders.find(p=>p.id===id)!;if(!po.submittedAt&&!po.cancelledAt&&["Administrator","Operations"].includes(role))return <button type="button" onClick={()=>run({kind:"po.submit",id})}>Submit</button>;
    if(admin&&po.submittedAt&&!po.approvedAt&&!po.cancelledAt&&po.createdBy!==actorId)return <button type="button" onClick={()=>run({kind:"po.approve",id})}>Approve PO</button>;
    return <span>{po.createdBy===actorId&&!po.approvedAt?"Independent reviewer required":"Review only"}</span>;
  }
  if(section==="bills"){
    const b=state.bills.find(b=>b.id===id)!;
    if(admin&&!b.approvedAt&&b.recordedBy!==actorId&&threeWayMatch(state,b).matched)return <button type="button" onClick={()=>run({kind:"bill.approve",id})}>Approve match</button>;
  }
  if(section==="credits"){
    const c=state.credits.find(c=>c.id===id)!;
    if(admin&&!c.approvedAt&&c.recordedBy!==actorId)return <button type="button" onClick={()=>run({kind:"credit.approve",id})}>Review credit</button>;
  }
  if(section==="expenses"){
    const e=state.expenses.find(e=>e.id===id)!;
    if(admin&&!e.approvedAt&&e.recordedBy!==actorId)return <button type="button" onClick={()=>run({kind:"expense.approve",id})}>Approve</button>;
  }
  return <span>Review only</span>;
}

/** Record details are a read-only local review, not externally verified A/P evidence. */
function PurchasingRecordDetail({section,id,state}:{section:Section;id:string;state:PurchasingState}){
  const facts:{label:string;value:string}[]=[];
  const related:{id:string;type:string;detail:string}[]=[];
  if(section==="vendors"){
    const v=state.vendors.find(x=>x.id===id);if(!v)return <p className="prototype-empty">Vendor record not found in this local review.</p>;
    facts.push({label:"Vendor",value:v.name},{label:"Contact",value:v.contact||"Not supplied"},{label:"Registered",value:v.createdAt},{label:"Entered by",value:v.createdBy},{label:"Status",value:v.active?"Active":"Inactive"});
    state.orders.filter(x=>x.vendorId===id).forEach(p=>related.push({id:p.id,type:"Purchase order",detail:poStatus(state,p)+" · "+p.cases+" cases"}));
  }else if(section==="orders"){
    const p=state.orders.find(x=>x.id===id);if(!p)return <p className="prototype-empty">Purchase order not found in this local review.</p>;
    facts.push({label:"Vendor",value:vendorName(state,p.vendorId)},{label:"Product",value:skuById(p.sku)?.description??p.sku},{label:"Ordered cases",value:String(p.cases)},{label:"Quoted cost per case",value:money(p.unitCostCents)},{label:"Order total",value:money(p.unitCostCents*p.cases)},{label:"Receiving warehouse",value:p.warehouse},{label:"Expected date",value:p.expectedDate},{label:"Stage",value:poStatus(state,p)},{label:"Created by",value:p.createdBy},{label:"Submitted",value:p.submittedAt??"Not submitted"},{label:"Approved by",value:p.approvedBy??"Not approved"});
    state.receipts.filter(x=>x.poId===id).forEach(r=>related.push({id:r.id,type:"Physical receipt note",detail:r.cases+" cases · "+r.lotCode+" · inventory NOT posted"}));
    state.bills.filter(x=>x.poId===id).forEach(b=>related.push({id:b.id,type:"Supplier invoice",detail:b.invoiceNumber+" · "+money(b.amountCents)+" · "+(b.approvedAt?"Review approved":"Pending review")}));
  }else if(section==="receipts"){
    const r=state.receipts.find(x=>x.id===id);if(!r)return <p className="prototype-empty">Receipt record not found.</p>;
    facts.push({label:"Approved PO",value:poName(state,r.poId)},{label:"Cases physically reported",value:String(r.cases)},{label:"Lot code",value:r.lotCode},{label:"Best-by date",value:r.bestBy},{label:"Warehouse",value:r.warehouse},{label:"Recorded by",value:r.recordedBy},{label:"Recorded at",value:r.recordedAt},{label:"Inventory posting",value:"Not posted to stock"});
  }else if(section==="bills"){
    const b=state.bills.find(x=>x.id===id);if(!b)return <p className="prototype-empty">Supplier bill record not found.</p>;
    const match=threeWayMatch(state,b);
    facts.push({label:"Supplier invoice",value:b.invoiceNumber},{label:"Purchase order",value:poName(state,b.poId)},{label:"Vendor",value:match.po?vendorName(state,match.po.vendorId):"Not linked"},{label:"Billed cases",value:String(b.cases)},{label:"Recorded received cases",value:String(match.received)},{label:"Supplier invoice total",value:money(b.amountCents)},{label:"PO-price variance",value:money(match.varianceCents)},{label:"Three-way match",value:match.matched?"Matched for independent review":"Not matched"},{label:"Independent approval",value:b.approvedAt?b.approvedBy+" · "+b.approvedAt:"Not approved"},{label:"Remaining review payable",value:money(billDueCents(state,b))},{label:"Recorded by",value:b.recordedBy});
    state.payments.filter(x=>x.billId===id).forEach(p=>related.push({id:p.id,type:"Unverified payment reference",detail:p.reference+" · "+money(p.amountCents)+" · not bank-confirmed"}));
    state.credits.filter(x=>x.billId===id).forEach(c=>related.push({id:c.id,type:"Vendor credit review",detail:c.reference+" · "+money(c.amountCents)+" · "+(c.approvedAt?"Reviewed locally":"Pending review")}));
  }else if(section==="payments"){
    const p=state.payments.find(x=>x.id===id);if(!p)return <p className="prototype-empty">Payment reference not found.</p>;
    facts.push({label:"Bill",value:p.billId},{label:"Reference",value:p.reference},{label:"Amount recorded",value:money(p.amountCents)},{label:"Entered by",value:p.recordedBy},{label:"Recorded at",value:p.recordedAt},{label:"External settlement",value:"NOT VERIFIED · no money moved by this review"});
  }else if(section==="credits"){
    const c=state.credits.find(x=>x.id===id);if(!c)return <p className="prototype-empty">Credit request not found.</p>;
    facts.push({label:"Bill",value:c.billId},{label:"Supplier credit reference",value:c.reference},{label:"Reason",value:c.reason},{label:"Requested credit",value:money(c.amountCents)},{label:"Recorded by",value:c.recordedBy},{label:"Reviewed by",value:c.approvedBy??"Pending"},{label:"External supplier/GL proof",value:"Not verified"});
  }else{
    const e=state.expenses.find(x=>x.id===id);if(!e)return <p className="prototype-empty">Expense request not found.</p>;
    facts.push({label:"Expense",value:e.description},{label:"Vendor",value:e.vendorId?vendorName(state,e.vendorId):"Not linked"},{label:"Amount",value:money(e.amountCents)},{label:"Recorded by",value:e.recordedBy},{label:"Recorded at",value:e.recordedAt},{label:"Independent reviewer",value:e.approvedBy??"Pending"});
  }
  const history=state.audit.filter(event=>event.recordId===id).slice().sort((a,b)=>b.at.localeCompare(a.at));
  return <section className="prototype-panel"><h2>Record evidence</h2>
    <dl className="prototype-facts">{facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
    {related.length>0&&<><h3>Related purchasing records</h3><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Record</th><th>Type</th><th>Evidence</th></tr></thead><tbody>{related.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.type}</td><td>{row.detail}</td></tr>)}</tbody></table></div></>}
    <h3>Review activity</h3><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>When</th><th>Actor</th><th>Recorded step</th><th>Control note</th></tr></thead><tbody>{history.map(event=><tr key={event.id}><td>{event.at}</td><td>{event.actorId}</td><td>{event.action}</td><td>{event.detail||"Local review event"}</td></tr>)}</tbody></table></div>
    {!history.length&&<p className="prototype-empty">No matching review event in this local session.</p>}
    <p className="prototype-note">These details are editable local demonstration evidence. They are NOT a supplier accounting ledger, production audit, verified warehouse receipt or proof of settlement.</p>
  </section>;
}

export function PurchasingExperience({section,id}:{section:string;id?:string}){
  const runtime=useRuntimeMode();const {currentUser}=useWorkspace();
  const firebaseSession=useFirebaseSessionOptional();
  const isClient=useSyncExternalStore(subscribeBrowser,clientSnapshot,serverSnapshot);
  const demo=runtime.isDemo&&momentumStorage.mode()==="local"&&!firebaseSession;
  const selected=sections.has(section)?section as Section:"vendors";
  if(!currentUser)return <p className="prototype-empty">Sign in to view purchasing.</p>;
  if(!demo)return <div><header className="prototype-heading"><h1>{sectionTitles[selected]}</h1><p>Purchasing is not yet connected to verified vendor, payable or warehouse receipt records.</p></header><section className="prototype-panel"><h2>Production connection blocked</h2><p>There is no approved purchasing backend or inventory-posting authorization for this new module. No vendor invoices, inventory receipts, payments or credits will be invented from retail orders.</p><p className="prototype-note">An isolated local demo is available only in demo mode, without a Firebase session and with local storage. Its records never represent live company liabilities.</p></section></div>;
  if(!isClient)return <p className="prototype-note" role="status">Loading isolated purchasing demonstration…</p>;
  return <LocalPurchasingExperience section={section} id={id}/>;
}

function LocalPurchasingExperience({section,id}:{section:string;id?:string}){
  const selected=sections.has(section)?section as Section:"vendors";
  const {currentUser}=useWorkspace();
  const [state,setState]=useState<PurchasingState>(()=>{
    try{const raw=momentumStorage.getItem(PURCHASING_DEMO_KEY);return normalizePurchasingDemoState(raw?JSON.parse(raw):null);}
    catch{return emptyPurchasingState();}
  });
  const [notice,setNotice]=useState("");
  const [search,setSearch]=useState("");const [status,setStatus]=useState("all");
  const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const [sort,setSort]=useState("date");const [descending,setDescending]=useState(true);
  useEffect(()=>{momentumStorage.setItem(PURCHASING_DEMO_KEY,JSON.stringify(state));},[state]);
  const actor:PurchaseActor={id:currentUser?.id??"",role:currentUser?.role==="Administrator"||currentUser?.role==="Operations"||currentUser?.role==="Warehouse"?currentUser.role:"Other"};
  const run=(action:PurchaseAction):boolean=>{
    if(!currentUser)return false;
    const result=applyPurchaseAction(state,actor,action,new Date().toISOString());
    setNotice(result.message);
    if(result.ok)setState(result.state);
    return result.ok;
  };
  const records=useMemo(()=>buildRows(state,selected),[state,selected]);
  const statuses=[...new Set(records.map(x=>x.status))].sort();
  const filtered=records.filter(row=>(!id||row.id===id)&&(status==="all"||row.status===status)&&(!from||row.date>=from)&&(!to||row.date<=to)
    &&[row.id,...Object.entries(row.values).map(([key,value])=>monetaryColumns.has(key)?money(Number(value)):String(value))].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{const va=sort==="date"?a.date:sort==="id"?a.id:a.values[sort]??"";const vb=sort==="date"?b.date:sort==="id"?b.id:b.values[sort]??"";const cmp=typeof va==="number"&&typeof vb==="number"?va-vb:String(va).localeCompare(String(vb),undefined,{numeric:true});return (descending?-1:1)*cmp||a.id.localeCompare(b.id);});
  if(!currentUser)return <p className="prototype-empty">Sign in to view purchasing.</p>;
  return <div>
    <header className="prototype-heading">{id&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute("/purchases/"+selected)}><ArrowLeft size={15}/> Back to {sectionTitles[selected]}</button>}
      <h1>{sectionTitles[selected]}{id?" · "+id:""}</h1><p>Purchasing work queue with draft approvals, physical receipt evidence and three-way bill checks.</p></header>
    <section className="prototype-panel"><p className="prototype-note"><ShieldCheck size={15}/> Isolated local demonstration. Do not enter real vendor or financial information. Purchase orders are not sent to vendors, receipts do not increase sellable stock, payment references do not reduce verified payables, and browser records are not a financial ledger.</p>
    <p>Operating sequence: registered vendor → prepared PO → independent approval → physical receipt → invoice-to-PO/receipt match → independent bill approval → payment reference and vendor credit review.</p></section>
    <PurchasingForm key={selected} section={selected} state={state} role={currentUser.role} run={run}/>
    {notice&&<p className="prototype-note" role="status">{notice}</p>}
    {id&&<PurchasingRecordDetail section={selected} id={id} state={state}/>}
    <div className="prototype-metrics"><div><small>Records in module</small><strong>{records.length}</strong></div><div><small>Matching filters</small><strong>{filtered.length}</strong></div><div><small>Audit events</small><strong>{state.audit.length}</strong></div></div>
    <section className="prototype-panel">
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={15}/><input aria-label="Search purchasing records" placeholder="Search records" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label>Status<select aria-label="Purchasing status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All</option>{statuses.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
        <label>Through<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th><button type="button" onClick={()=>{setDescending(sort==="date"?!descending:true);setSort("date");}}>Recorded <ArrowUpDown size={13}/></button></th>
        <th><button type="button" onClick={()=>{setDescending(sort==="id"?!descending:false);setSort("id");}}>ID <ArrowUpDown size={13}/></button></th>
        {columns[selected].map(col=><th key={col.key}><button type="button" onClick={()=>{setDescending(sort===col.key?!descending:false);setSort(col.key);}}>{col.label} <ArrowUpDown size={13}/></button></th>)}
        {["orders","bills","credits","expenses"].includes(selected)&&<th>Control</th>}
      </tr></thead><tbody>{filtered.map(row=><tr key={row.id}>
        <td>{row.date}</td><td><button className="prototype-link" type="button" onClick={()=>navigateToRoute("/purchases/"+selected+"/"+encodeURIComponent(row.id))}>{row.id}</button></td>
        {columns[selected].map(col=><td key={col.key}>{monetaryColumns.has(col.key)?money(Number(row.values[col.key]??0)):String(row.values[col.key]??"")}</td>)}
        {["orders","bills","expenses"].includes(selected)&&<td><RowAction section={selected} id={row.id} state={state} run={run} role={currentUser.role} actorId={currentUser.id}/></td>}
      </tr>)}</tbody></table></div>
      {!filtered.length&&<p className="prototype-empty">No real purchasing records in this local review. Create a demo record to test the workflow.</p>}
    </section>
    {currentUser.role==="Administrator"&&<section className="prototype-panel"><h2>Append-only review activity</h2>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Time</th><th>Actor ID</th><th>Change</th><th>Record ID</th><th>Control note</th></tr></thead><tbody>{state.audit.slice(-20).reverse().map(e=><tr key={e.id}><td>{e.at}</td><td>{e.actorId}</td><td>{e.action}</td><td>{e.recordId}</td><td>{e.detail||"Recorded"}</td></tr>)}</tbody></table></div>
      <p className="prototype-note">Local audit history is editable by the browser owner and is not production-grade or tamper-proof.</p>
    </section>}
  </div>;
}
