"use client";

import {useMemo,useState} from "react";
import {accountHealthSnapshot} from "../../lib/account-health";
import {downloadCsv} from "../../lib/browser-export";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";

type HealthSort="account"|"rep"|"lastOrder"|"lastPaid"|"settledCases"|"nextAction"|"reviewDate";
const columns=["account","city","representative","lastPlacedOrder","lastSettledPayment","settledCases90Days","settledOrderCount","nextAction","pricingReview"] as const;
const today=()=>new Date();

export function CrmAccountHealth(){
  const {scope,data,currentUser}=useWorkspace();
  const [query,setQuery]=useState("");
  const [rep,setRep]=useState("all");
  const [reviewDue,setReviewDue]=useState(false);
  const [sort,setSort]=useState<HealthSort>("lastPaid");
  const [ascending,setAscending]=useState(true);
  const names=useMemo(()=>new Map(data.users.map(user=>[user.id,user.name])),[data.users]);
  const rows=useMemo(()=>scope.accounts.map(account=>({account,health:accountHealthSnapshot(data,account,today())}))
    .filter(({account})=>rep==="all"||account.ownerId===rep)
    .filter(({health})=>!reviewDue||health.categoryReviewDue)
    .filter(({account})=>[account.name,account.location,account.postalCode,names.get(account.ownerId)].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>{
      const field=(row:typeof a)=>{
        if(sort==="rep")return names.get(row.account.ownerId)??"Unassigned";
        if(sort==="lastOrder")return row.health.lastOrderDate??"";
        if(sort==="lastPaid")return row.health.lastPaidOrderDate??"";
        if(sort==="settledCases")return row.health.rolling90PaidCases;
        if(sort==="nextAction")return row.account.nextActionDate??"";
        if(sort==="reviewDate")return row.health.categoryReviewDate??"";
        return row.account.name;
      };
      const x=field(a),y=field(b);
      const n=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});
      return (ascending?1:-1)*(n||a.account.id.localeCompare(b.account.id));
    }),[scope.accounts,data,rep,reviewDue,query,sort,ascending,names]);
  if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Employee account-health access is required.</div>;
  const repIds=[...new Set(scope.accounts.map(a=>a.ownerId).filter(Boolean))];
  const header=(key:HealthSort,label:string)=><th aria-sort={sort===key?(ascending?"ascending":"descending"):"none"}><button type="button" aria-label={"Sort account health by "+label}
    onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}</button></th>;
  const exported=rows.map(({account,health})=>({
    account:account.name,city:account.location,representative:names.get(account.ownerId)??"Unassigned",
    lastPlacedOrder:health.lastOrderDate??"",lastSettledPayment:health.lastPaidOrderDate??"",
    settledCases90Days:health.rolling90PaidCases,settledOrderCount:health.rolling90PaidOrderCount,
    nextAction:account.nextActionDate??"",pricingReview:health.categoryReviewDate??"",
  }));
  return <main className="prototype-workspace">
    <header className="prototype-heading"><h1>Account health</h1>
      <p>Actual order and settlement evidence for authorized store locations. Identify follow-ups and review pricing dates without treating invoice status as collected revenue.</p>
    </header>
    <section className="prototype-panel" aria-label="Account health review">
      <div className="prototype-controls">
        <label>Find account <input type="search" aria-label="Find account health record" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Store, city, ZIP or assigned rep"/></label>
        <label>Assigned rep <select aria-label="Filter health by representative" value={rep} onChange={e=>setRep(e.target.value)}><option value="all">All accessible reps</option>{repIds.map(id=><option value={id} key={id}>{names.get(id)??id}</option>)}</select></label>
        <label><input type="checkbox" checked={reviewDue} onChange={e=>setReviewDue(e.target.checked)}/> Pricing review due</label>
        <label>Order <select aria-label="Sort account health" value={sort} onChange={e=>setSort(e.target.value as HealthSort)}><option value="lastPaid">Last settlement</option><option value="lastOrder">Last order</option><option value="rep">Assigned representative</option><option value="settledCases">90-day settled cases</option><option value="nextAction">Next action</option><option value="reviewDate">Pricing review date</option><option value="account">Account name</option></select></label>
        <button type="button" onClick={()=>setAscending(v=>!v)}>{ascending?"Ascending":"Descending"}</button>
        <button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-account-health.csv",exported,columns)}>Save scoped health CSV</button>
      </div>
      <p className="prototype-note">{rows.length} accessible locations match. A missing settlement date is displayed as unverified, never inferred from order placement or a Paid flag.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>{header("account","Location")}{header("rep","Assigned rep")}{header("lastOrder","Last order")}{header("lastPaid","Last verified settlement")}{header("settledCases","90-day paid cases")}{header("nextAction","Next action")}{header("reviewDate","Pricing review")}<th>Open record</th></tr></thead>
        <tbody>{rows.map(({account,health})=><tr key={account.id}>
          <td>{account.name}<small className="prototype-description">{account.location} · {account.postalCode||"ZIP unknown"}</small></td>
          <td>{names.get(account.ownerId)??"Unassigned"}</td>
          <td>{health.lastOrderDate??"None"}</td>
          <td>{health.lastPaidOrderDate??"Unverified"}</td>
          <td>{health.rolling90PaidCases} cases / {health.rolling90PaidOrderCount} paid orders</td>
          <td>{account.nextActionDate||"No follow-up"}</td>
          <td>{health.categoryReviewDate??"Not scheduled"}{health.categoryReviewDue?" · Due":""}</td>
          <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(account.id))}>Open account</button>{["Prospect","Qualified","Sampled"].includes(account.stage)&&<button type="button" className="prototype-link" onClick={()=>navigateToRoute("/crm/leads/"+encodeURIComponent(account.id))}>Follow up lead</button>}</td>
        </tr>)}</tbody></table></div>
      {!rows.length&&<div className="prototype-empty">No account health records match the selected scope or filters.</div>}
    </section>
  </main>;
}
