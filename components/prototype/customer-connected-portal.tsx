"use client";
import {useEffect,useState} from "react";
import {Search,RefreshCw,ArrowUpDown} from "lucide-react";
import {currentFirebaseSession} from "../../lib/firebase-auth-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {downloadCsv} from "../../lib/browser-export";
import type {CustomerFinanceSnapshot} from "../../functions/src/customer-commerce-projection";

type Section="orders"|"invoices"|"account"|"deliveries";
type ViewState={kind:"loading"|"ready"|"error";data:CustomerFinanceSnapshot|null;message:string};
type Payload=Partial<CustomerFinanceSnapshot>&{ok?:boolean;error?:string};
const cash=(amount:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount);
export function CustomerConnectedPortal({section}:{section:Section}){
 const [view,setView]=useState<ViewState>({kind:"loading",data:null,message:""});
 const [version,setVersion]=useState(0);
 const [query,setQuery]=useState(""),[location,setLocation]=useState("all");
 const [sort,setSort]=useState<"number"|"date"|"status"|"amount">("date"),[asc,setAsc]=useState(false);
 useEffect(()=>{
  let mounted=true;
  const load=async()=>{
   try{
    const session=await currentFirebaseSession();
    if(!session)throw new Error("Sign in to access your business records.");
    const response=await fetch(firebaseFunctionUrl("customerCommerceSnapshot"),{
      method:"GET",headers:{authorization:"Bearer "+session.idToken},cache:"no-store",
    });
    const payload=await response.json().catch(()=>null) as Payload|null;
    if(!response.ok||payload?.ok!==true)throw new Error(payload?.error||"Customer records are unavailable.");
    if(!Array.isArray(payload.accounts)||!Array.isArray(payload.orders)||!Array.isArray(payload.statements)||!Array.isArray(payload.payments))
      throw new Error("The server response could not be verified.");
    if(mounted)setView({kind:"ready",data:{
      accounts:payload.accounts,orders:payload.orders,statements:payload.statements,payments:payload.payments,truncated:payload.truncated===true,
    },message:""});
   }catch(e){if(mounted)setView({kind:"error",data:null,message:e instanceof Error?e.message:"Customer records are unavailable."});}
  };
  void load();return()=>{mounted=false;};
 },[version]);
 const title={orders:"My Orders",invoices:"My Invoices",account:"My Account",deliveries:"My Deliveries"}[section];
 const records=view.data?(section==="invoices"?view.data.statements:view.data.orders):[];
 const rows=records.filter(item=>(location==="all"||item.accountId===location)&&
  (query.trim()===""||[item.id,item.status,("invoice" in item?item.invoice:item.number)].join(" ").toLowerCase().includes(query.trim().toLowerCase())))
  .sort((a,b)=>{
    const value=(r:typeof records[number]):number|string=>{
      if(sort==="number")return "invoice" in r?r.invoice:r.number;
      if(sort==="date")return "date" in r?r.date:r.placedAt;
      if(sort==="amount")return "amount" in r?r.amount:r.cases;
      return r.status;
    };
    const x=value(a),y=value(b);
    const n=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));
    return (asc?1:-1)*(n||a.id.localeCompare(b.id));
  });
 const setSortColumn=(key:typeof sort)=>{if(sort===key)setAsc(x=>!x);else{setSort(key);setAsc(true);}};
 const heading=(key:typeof sort,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>setSortColumn(key)}>{label}<ArrowUpDown size={14}/></button>;
 return <div><header className="prototype-heading"><h1>{title}</h1><p>Authenticated business-location records, read only. Source status is not independent proof of payment or signed delivery.</p></header>
   <section className="prototype-panel">
     <button type="button" onClick={()=>{setView({kind:"loading",data:null,message:""});setVersion(v=>v+1);}}><RefreshCw size={14}/> Refresh records</button>
     {view.kind==="loading"&&<p role="status">Loading authorized records…</p>}
     {view.kind==="error"&&<p role="alert">{view.message}</p>}
     {view.kind==="ready"&&view.data&&<>
       {section==="account"?<>
        <h2>Authorized retail locations</h2>
        {view.data.accounts.map(account=><dl key={account.id} className="prototype-facts">
         <div><dt>Business</dt><dd>{account.name}</dd></div><div><dt>Location</dt><dd>{account.location}</dd></div>
         <div><dt>Street address</dt><dd>{account.streetAddress||"Not recorded"}</dd></div>
         <div><dt>Contact</dt><dd>{account.contactName||"Not recorded"}</dd></div>
         <div><dt>Contact email</dt><dd>{account.email||"Not recorded"}</dd></div>
         <div><dt>Phone</dt><dd>{account.phone||"Not recorded"}</dd></div>
        </dl>)}
        {!view.data.accounts.length&&<div className="prototype-empty">No approved retail location is assigned.</div>}
        <p className="prototype-note">Tax status, payment terms, legal identity and account assignments require a verified administrative update. Editing is disabled here.</p>
       </>:<>
        <div className="prototype-commerce-filters">
         <label className="prototype-search"><Search size={16}/><input aria-label="Search portal records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search number or status"/></label>
         <label>Business location<select aria-label="Select authorized location" value={location} onChange={e=>setLocation(e.target.value)}><option value="all">All my locations</option>{view.data.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
        </div>
        <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-"+section+".csv",rows,section==="invoices"?["invoice","date","status","amount","cleared","pending","credits","balance","due"]:["number","placedAt","status","cases"])}>Export visible records (CSV)</button>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>{heading("number",section==="invoices"?"Invoice":"Order")}</th><th>{heading("date","Date")}</th><th>{heading("status","Status")}</th><th>{heading("amount",section==="invoices"?"Amount":"Cases")}</th>{section==="invoices"&&<th>Balance</th>}</tr></thead>
         <tbody>{rows.map(row=><tr key={row.id}>
          <td>{"invoice" in row?row.invoice:row.number}</td>
          <td>{"date" in row?row.date:row.placedAt}</td><td>{row.status}</td>
          <td>{"invoice" in row?cash(row.amount):row.cases}</td>
          {section==="invoices"&&<td>{"balance" in row?cash(row.balance):""}</td>}
         </tr>)}</tbody></table></div>
        {!rows.length&&<div className="prototype-empty">No authorized records matched.</div>}
        {section==="invoices"&&<p className="prototype-note">Official PDF access and hosted payment links require server-verified document authorization and an approved payment provider.</p>}
        {section==="deliveries"&&<p className="prototype-note">Only recorded order states are shown here, not a verified route ETA, recipient signature, or proof of delivery.</p>}
       </>}
       {view.data.truncated&&<p role="status" className="prototype-note">This register is partial because some duplicate or excess records were excluded. Ask billing for a complete reviewed register.</p>}
     </>}
   </section></div>;
}
