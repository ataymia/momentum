"use client";
/** Connected customer finance must come exclusively from a trusted server-side, tenant-scoped read. */
import {useEffect,useState} from "react";
import {Search,ArrowUpDown,RefreshCw} from "lucide-react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {downloadCsv} from "../../lib/browser-export";
import type {CustomerFinanceSnapshot} from "../../functions/src/customer-commerce-projection";

type FinanceResponse=CustomerFinanceSnapshot&{ok:true};
type State={status:"loading"|"ready"|"error";finance:CustomerFinanceSnapshot|null;error:string};
const currency=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const date=(value:string)=>value||"Not recorded";
export function CustomerConnectedFinance({section}:{section:"payments"|"statements"}){
 const [state,setState]=useState<State>({status:"loading",finance:null,error:""});
 const [reload,setReload]=useState(0);
 const [search,setSearch]=useState(""),[account,setAccount]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [sort,setSort]=useState<"invoice"|"date"|"amount"|"status"|"balance">("date"),[asc,setAsc]=useState(false);
 useEffect(()=>{
   let active=true;

   const load=async()=>{
     try{
       const session=await currentFirebaseSession();
       if(!session)throw new Error("Your session has expired. Sign in again.");
       const response=await fetch(firebaseFunctionUrl("customerCommerceSnapshot"),{
         method:"GET",headers:{authorization:"Bearer "+session.idToken,accept:"application/json"},
         cache:"no-store",
       });
       const body=await response.json().catch(()=>null) as Partial<FinanceResponse>&{error?:string}|null;
       if(!response.ok||body?.ok!==true)throw new Error(body?.error||"Customer finance service is unavailable.");
       if(!Array.isArray(body.accounts)||!Array.isArray(body.payments)||!Array.isArray(body.statements))
         throw new Error("Customer finance service returned an invalid response.");
       if(!active)return;
       setState({status:"ready",finance:{
         accounts:body.accounts,statements:body.statements,payments:body.payments,
         truncated:body.truncated===true,
       },error:""});
     }catch(error){
       if(active)setState({status:"error",finance:null,error:error instanceof Error?error.message:"Unable to read customer records."});
     }
   };
   void load();
   return()=>{active=false;};
 },[reload]);
 const finance=state.finance;
 const source=finance?(section==="payments"?finance.payments:finance.statements):[];
 const filtered=source.filter(row=>{
   const inLocation=account==="all"||row.accountId===account;
   const inDates=(!from||row.date>=from)&&(!to||row.date<=to);
   const inSearch=[row.invoice,row.status,row.id].join(" ").toLowerCase().includes(search.trim().toLowerCase());
   return inLocation&&inDates&&inSearch;
 }).sort((a,b)=>{
   const item=(r:typeof source[number]):number|string=>{
     if(sort==="amount")return r.amount;
     if(sort==="balance")return "balance" in r?r.balance:0;
     return r[sort];
   };
   const x=item(a),y=item(b);
   const comparison=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));
   return (asc?1:-1)*(comparison||a.id.localeCompare(b.id));
 });
 const toggle=(key:typeof sort)=>{if(sort===key)setAsc(v=>!v);else{setSort(key);setAsc(true);}};
 const heading=(key:typeof sort,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>toggle(key)}>{label}<ArrowUpDown size={14}/></button>;
 const columns=section==="payments"?["invoice","date","amount","method","status","settled"]:["invoice","date","amount","cleared","pending","credits","balance","status","due"];
 return <div>
   <header className="prototype-heading"><h1>{section==="payments"?"My Payments":"My Statements"}</h1><p>Read-only account-specific finance records obtained from the authenticated customer service. Payments and refunds are recorded events, not independently confirmed bank deposits.</p></header>
   <section className="prototype-panel">
     <button type="button" onClick={()=>{setState({status:"loading",finance:null,error:""});setReload(v=>v+1);}}><RefreshCw size={14}/> Refresh records</button>
     {state.status==="loading"&&<p role="status">Loading authorized finance records…</p>}
     {state.status==="error"&&<p role="alert">{state.error}</p>}
     {state.status==="ready"&&finance&&<>
       <div className="prototype-metrics"><div><small>Visible entries</small><strong>{filtered.length}</strong></div><div><small>Authorized locations</small><strong>{finance.accounts.length}</strong></div></div>
       <div className="prototype-commerce-filters">
         <label className="prototype-search"><Search size={16}/><input aria-label="Search customer finance records" placeholder="Invoice, status or record" value={search} onChange={e=>setSearch(e.target.value)}/></label>
         <label>Business location<select aria-label="Customer location filter" value={account} onChange={e=>setAccount(e.target.value)}><option value="all">All my authorized locations</option>{finance.accounts.map(a=><option value={a.id} key={a.id}>{a.name} · {a.location}</option>)}</select></label>
         <label>From<input type="date" aria-label="Finance date from" value={from} onChange={e=>setFrom(e.target.value)}/></label>
         <label>Through<input type="date" aria-label="Finance date through" value={to} onChange={e=>setTo(e.target.value)}/></label>
       </div>
       <button type="button" disabled={!filtered.length} onClick={()=>downloadCsv(section==="payments"?"momentum-payments.csv":"momentum-statements.csv",filtered,columns)}>Export visible records (CSV)</button>
       <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
         <th>{heading("invoice","Invoice")}</th><th>{heading("date","Recorded date")}</th><th>{heading("amount","Amount")}</th>
         {section==="payments"?<><th>Method</th><th>{heading("status","Status")}</th><th>Settlement recorded</th></>:
         <><th>Recorded cleared net</th><th>Pending</th><th>Credits</th><th>{heading("balance","Balance")}</th><th>{heading("status","Status")}</th><th>Due</th></>}
       </tr></thead><tbody>{section==="payments"?filtered.map(row=>{
         if(!("method" in row))return null;
         return <tr key={row.id}><td>{row.invoice}</td><td>{date(row.date)}</td><td>{currency(row.amount)}</td><td>{row.method}</td><td>{row.status}</td><td>{date(row.settled)}</td></tr>;
       }):filtered.map(row=>{
         if(!("balance" in row))return null;
         return <tr key={row.id}><td>{row.invoice}</td><td>{date(row.date)}</td><td>{currency(row.amount)}</td><td>{currency(row.cleared)}</td><td>{currency(row.pending)}</td><td>{currency(row.credits)}</td><td>{currency(row.balance)}</td><td>{row.status}</td><td>{date(row.due)}</td></tr>;
       })}</tbody></table></div>
       {filtered.length===0&&<div className="prototype-empty">No authorized records match these filters.</div>}
       {finance.truncated&&<p role="status" className="prototype-note">Some records were excluded because of ambiguous invoices or the server response limit. Request a reviewed statement for complete history.</p>}
       <p className="prototype-note">A source-ledger status is not proof of processor settlement. Payments, statements and CSV files in this view are informational, not customer-authorized charges or official reconciled bank statements.</p>
     </>}
   </section>
 </div>;
}
