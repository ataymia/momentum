"use client";

import {useState} from "react";
import {ArrowLeft,ArrowUpDown,Search} from "lucide-react";
import {ACCOUNT_PRICING_TIERS} from "../../lib/account-health";
import {arizonaDateKey} from "../../lib/date-time";
import {navigateToRoute} from "../../lib/navigation-store";
import {assessRetailPriceBook,RETAIL_PRICE_BOOK,RETAIL_PROGRAM_POLICY} from "../../lib/retail-price-book";
import {useWorkspace} from "../../lib/workspace-context";

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
type Row=typeof RETAIL_PRICE_BOOK[number];
const range=(row:Row)=>row.maxCases===null?row.minCases+"+":row.minCases+"–"+row.maxCases;

export function PriceBooksDirectory(){
  const [query,setQuery]=useState(""),[sort,setSort]=useState<"name"|"volume"|"price">("volume"),[asc,setAsc]=useState(true);
  const rows=[...RETAIL_PRICE_BOOK].filter(r=>[r.label,r.tier,r.pricePerCase].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const value=(row:Row)=>sort==="name"?row.label:sort==="price"?row.pricePerCase:row.minCases;
    const x=value(a),y=value(b);
    const comparison=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));
    return (asc?1:-1)*comparison;
  });
  const change=(field:typeof sort)=>{if(sort===field)setAsc(v=>!v);else{setSort(field);setAsc(true);}};
  return <div>
    <header className="prototype-heading"><h1>Price Books</h1><p>Retailer wholesale pricing and volume qualifications. Read-only policy reference; this screen never changes orders, invoice values or account pricing.</p></header>
    <div className="prototype-metrics">
      <div><small>Case pack</small><strong>{RETAIL_PROGRAM_POLICY.casePack} cans</strong></div>
      <div><small>Minimum opening</small><strong>{RETAIL_PROGRAM_POLICY.openingMinCases} cases</strong></div>
      <div><small>Launch-period pricing</small><strong>{RETAIL_PROGRAM_POLICY.introDays} days</strong></div>
    </div>
    <section className="prototype-panel"><h2>Retail price books</h2>
      <div className="prototype-commerce-filters"><label className="prototype-search"><Search size={16}/><input aria-label="Search price books" placeholder="Search pricing level" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th><button type="button" aria-label="Sort price book names" onClick={()=>change("name")}>Book <ArrowUpDown size={14}/></button></th>
        <th><button type="button" aria-label="Sort case volume" onClick={()=>change("volume")}>Avg. cases / month <ArrowUpDown size={14}/></button></th>
        <th><button type="button" aria-label="Sort wholesale price" onClick={()=>change("price")}>Price / case <ArrowUpDown size={14}/></button></th>
        <th>Per can</th>
      </tr></thead><tbody>{rows.map(r=><tr key={r.id}>
        <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/commerce/price-books/"+r.id)}>{r.label}</button></td>
        <td>{range(r)}</td><td>{money(r.pricePerCase)}</td><td>{money(r.pricePerCase/RETAIL_PROGRAM_POLICY.casePack)}</td>
      </tr>)}</tbody></table></div>
    </section>
    <section className="prototype-panel"><h2>Introductory and quarterly review rules</h2>
      <p>Qualified new locations start at $24 per case for the first 60 days, with a 10-case opening order. Buying at least 20 total cases during launch retains that level through the next full calendar quarter. Subsequent levels depend on average monthly purchases in the prior calendar quarter.</p>
      <p>Review dates: March 31, June 30, September 30, December 31. Account-specific approved price overrides, return credits, freight, taxes and payment terms remain separate.</p>
      <p className="prototype-note">Retailer pricing uses a 60-day introduction followed by completed-calendar-quarter reviews. The separate 90-day sales-bonus window never governs retail prices. This page remains read-only, and account overrides require their own authorization.</p>
    </section>
  </div>;
}
export function PriceBookDetail({id}:{id:string}){
  const {scope}=useWorkspace();
  const book=RETAIL_PRICE_BOOK.find(r=>r.id===id);
  const [accountId,setAccountId]=useState("");
  if(!book)return <div className="prototype-empty">Price book not found.</div>;
  const account=scope.accounts.find(a=>a.id===accountId);
  const preview=account?assessRetailPriceBook(account.id,scope.orders,arizonaDateKey()):null;
  return <div>
    <header className="prototype-heading"><button type="button" className="prototype-back" onClick={()=>navigateToRoute("/commerce/price-books")}><ArrowLeft size={15}/> Back to Price Books</button><h1>{book.label}</h1><p>Qualification evidence and comparison against the account&apos;s recorded pricing fields. Read only.</p></header>
    <div className="prototype-metrics"><div><small>Price / case</small><strong>{money(book.pricePerCase)}</strong></div><div><small>Per can</small><strong>{money(book.pricePerCase/24)}</strong></div><div><small>Price tier</small><strong>{book.tier}</strong></div></div>
    <section className="prototype-panel"><h2>Qualification</h2><p>{range(book)} cases per month over the completed calendar quarter. The price applies to the following quarter unless a documented launch exception or authorized customer-specific program controls.</p></section>
    <section className="prototype-panel"><h2>Location price preview</h2><label>Authorized customer location <select aria-label="Account to assess" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Select customer location</option>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
    {preview&&<dl className="prototype-facts">
      <div><dt>Calculated program status</dt><dd>{preview.status}</dd></div>
      <div><dt>Calculated policy tier</dt><dd>{preview.tier??"Not established"}</dd></div>
      <div><dt>Reference case price</dt><dd>{preview.pricePerCase===null?"Not established":money(preview.pricePerCase)}</dd></div>
      <div><dt>Volume basis</dt><dd>{preview.basis}</dd></div>
      <div><dt>Qualifying paid cases</dt><dd>{preview.paidCases}</dd></div>
      <div><dt>Average monthly cases</dt><dd>{preview.averageMonthlyCases===null?"Not established":preview.averageMonthlyCases.toFixed(2)}</dd></div>
      <div><dt>Next review</dt><dd>{preview.nextReview??"Not scheduled"}</dd></div>
      <div><dt>Evidence order count</dt><dd>{preview.evidenceOrderIds.length}</dd></div>
      <div><dt>Recorded account tier</dt><dd>{account?.pricingTier?ACCOUNT_PRICING_TIERS[account.pricingTier].label:"Not configured"}</dd></div>
      <div><dt>Recorded special program</dt><dd>{account?.programPricingStatus??"Not recorded"}</dd></div>
    </dl>}
    <p className="prototype-note">Evidence uses orders with Paid status, excludes cancelled/test entries, and never counts uncollected orders. Stored account tier and special programs are displayed for comparison, not overwritten. Connected order pricing on this branch uses the same retailer time rules, while this screen remains read-only.</p>
    </section>
  </div>;
}
