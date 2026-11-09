"use client";
import {useState} from "react";
import {ArrowUpRight,Search,ShieldCheck,Store} from "lucide-react";
import {useWorkspace} from "../../lib/workspace-context";
import {useCommerce} from "../../lib/commerce-context";
import {navigateToRoute} from "../../lib/navigation-store";

/**
 * Internal customer portal readiness overview. Never impersonates a customer
 * or represents source records as proof that a customer logged in or paid.
 */
export function CustomerPortalAdminOverview(){
 const {scope,currentUser}=useWorkspace();
 const {commerce}=useCommerce();
 const [query,setQuery]=useState("");
 const accessible=new Set(scope.accounts.map(location=>location.id));
 const accounts=scope.accounts;
 const invoices=commerce.invoices.filter(invoice=>accessible.has(invoice.accountId));
 const orders=scope.orders.filter(order=>accessible.has(order.accountId));
 const rows=accounts.filter(location=>
   [location.name,location.locationName,location.location,location.customerId,location.contactName].filter(Boolean)
     .join(" ").toLowerCase().includes(query.toLowerCase().trim())
 ).sort((left,right)=>left.name.localeCompare(right.name,undefined,{numeric:true}));
 if(!currentUser||currentUser.role==="Customer")return <div className="prototype-empty">Internal account oversight requires employee access.</div>;
 return <div className="prototype-domain prototype-domain--commerce momentum-portal-oversight">
  <header className="prototype-heading"><div>
    <span className="page-header__eyebrow">Commerce / Customer access</span>
    <h1>Customer portal oversight</h1>
    <p>Internal review of the locations and transaction records that would support a customer-facing portal. Portal authentication and actual customer visibility must be tested under the customer identity, not through impersonation.</p>
  </div></header>
  <div className="prototype-metrics">
   <div><small>Accessible locations</small><strong>{accounts.length}</strong></div>
   <div><small>Recorded sales orders</small><strong>{orders.length}</strong></div>
   <div><small>Linked invoice records</small><strong>{invoices.length}</strong></div>
  </div>
  <section className="prototype-panel">
   <h2>Customer locations and record links</h2>
   <div className="prototype-controls">
    <label className="prototype-search"><Search size={16}/><input type="search" aria-label="Search portal location records" placeholder="Search business, location or customer ID" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   </div>
   <div className="prototype-table-scroll"><table className="prototype-table">
    <thead><tr><th>Customer location</th><th>Customer identity link</th><th>Sales orders</th><th>Invoices</th><th>Account record</th></tr></thead>
    <tbody>{rows.map(location=>{
     const orderCount=orders.filter(order=>order.accountId===location.id).length;
     const invoiceCount=invoices.filter(invoice=>invoice.accountId===location.id).length;
     return <tr key={location.id}>
      <td><strong>{location.locationName??location.name}</strong><span className="prototype-description">{location.location||"Location not recorded"}</span></td>
      <td>{location.customerId?<span>{location.customerId}</span>:<span>Not linked to customer identity</span>}</td>
      <td>{orderCount}</td><td>{invoiceCount}</td>
      <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/customers/"+encodeURIComponent(location.id))}>Review account <ArrowUpRight size={14}/></button></td>
     </tr>;
    })}</tbody></table></div>
   {!rows.length&&<div className="prototype-empty">No authorized locations match this search.</div>}
  </section>
  <section className="prototype-panel">
   <h2><ShieldCheck size={18}/> Customer portal control boundaries</h2>
   <div className="prototype-columns">
    <p>Customer-facing orders, invoices, payments, deliveries, documents and account details live on separate <strong>customer-only routes</strong>. Open the portal only through a genuinely authorized customer sign-in.</p>
    <p>These counts describe records accessible to the current employee. They are <strong>not</strong> confirmed customer-visible records, a payment processor reconciliation, a customer invitation, or evidence of successful customer activation.</p>
   </div>
   <p className="prototype-note"><Store size={15}/> Do not mark a customer portal as verified until a role-scoped customer test confirms exactly which records they can see, including denial of cross-customer access.</p>
  </section>
 </div>;
}
