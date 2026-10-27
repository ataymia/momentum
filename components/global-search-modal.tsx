"use client";

import {useState} from "react";
import {Building2,CalendarDays,UsersRound,Boxes,CircleDollarSign,ShoppingCart,Search,Command,ChevronRight} from "lucide-react";
import {canAccessPage} from "../lib/access";
import {useCommerce} from "../lib/commerce-context";
import {useCrm} from "../lib/crm-context";
import type {PageKey} from "../lib/types";
import {useWorkspace} from "../lib/workspace-context";
import {Modal} from "./ui";

type SearchResult = { id: string; type: string; title: string; detail: string; page: PageKey; focus?: string; icon: "location" | "order" | "person" | "calendar" | "invoice" | "inventory" };

/** Search subscribes to CRM and commerce only while the dialog is actually open. */
export function GlobalSearchModal({onClose}:{onClose:()=>void}){
  const {data,scope,currentUser,navigate}=useWorkspace();
  const {crm}=useCrm();
  const {commerce}=useCommerce();
  const [query,setQuery]=useState("");
  if(!currentUser)return null;
  const customerMode=currentUser.role==="Customer";
  const normalized = query.trim().toLowerCase(); const searchResults: SearchResult[] = [];
  if (normalized) {
    const accountIds = new Set(scope.accounts.map((account) => account.id));
    for (const account of scope.accounts.filter((account) => [account.name, account.locationName, account.location, account.streetAddress, account.contactName, account.phone, account.email, account.channel].join(" ").toLowerCase().includes(normalized)).slice(0, 6)) searchResults.push({ id: `account-${account.id}`, type: "Location", title: account.locationName ?? account.name, detail: `${account.location} · ${account.stage}`, page: "accounts", focus: account.id, icon: "location" });
    for (const contact of crm.contacts.filter((contact) => !contact.locationId || accountIds.has(contact.locationId)).filter((contact) => [contact.name, contact.role, contact.email, contact.phone, contact.decisionRole].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `contact-${contact.id}`, type: "Contact", title: contact.name, detail: `${contact.role}${contact.phone ? ` · ${contact.phone}` : ""}`, page: "accounts", focus: contact.locationId, icon: "person" });
    for (const order of scope.orders.filter((order) => { const account = scope.accounts.find((item) => item.id === order.accountId); const placedBy=data.users.find((user)=>user.id===order.ownerId); return `${order.number} ${account?.name ?? ""} ${account?.locationName ?? ""} ${placedBy?.name??order.ownerId}`.toLowerCase().includes(normalized); }).slice(0, 5)) { const placedBy=data.users.find((user)=>user.id===order.ownerId); searchResults.push({ id: `order-${order.id}`, type: "Order", title: order.number, detail: `${order.cases} cases · ${order.status} · Placed by ${placedBy?.name??order.ownerId}`, page: "orders", focus: order.id, icon: "order" }); }
    for (const appointment of scope.appointments.filter((item) => { const account = scope.accounts.find((account) => account.id === item.accountId); return [item.type, item.objective, item.date, item.startTime, item.location, account?.name].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) searchResults.push({ id: `appointment-${appointment.id}`, type: "Appointment", title: appointment.type, detail: `${appointment.date} ${appointment.startTime} · ${appointment.status}`, page: "dispatch", focus: appointment.id, icon: "calendar" });
    for (const invoice of commerce.invoices.filter((invoice) => scope.orders.some((order) => order.id === invoice.orderId)).filter((invoice) => { const order = scope.orders.find((item) => item.id === invoice.orderId); const account = scope.accounts.find((item) => item.id === invoice.accountId); const placedBy=data.users.find((user)=>user.id===order?.ownerId); return [invoice.number, order?.number, account?.name, invoice.status, placedBy?.name].join(" ").toLowerCase().includes(normalized); }).slice(0, 5)) { const order=scope.orders.find((item)=>item.id===invoice.orderId); const placedBy=data.users.find((user)=>user.id===order?.ownerId); searchResults.push({ id: `invoice-${invoice.id}`, type: "Invoice", title: invoice.number, detail: `${invoice.status} · ${invoice.total.toFixed(2)} · Placed by ${placedBy?.name??order?.ownerId??"Not recorded"}`, page: "orderCash", focus: invoice.orderId, icon: "invoice" }); }
    if (canAccessPage(currentUser, "people")) for (const user of scope.users.filter((user) => [user.name, user.email, user.title, user.role, user.team].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `user-${user.id}`, type: "Person", title: user.name, detail: `${user.title} · ${user.email}`, page: "employees", focus: user.id, icon: "person" });
    if (canAccessPage(currentUser, "inventory")) for (const lot of scope.inventory.filter((lot) => [lot.lotCode, lot.product, lot.location, lot.status].join(" ").toLowerCase().includes(normalized)).slice(0, 5)) searchResults.push({ id: `lot-${lot.id}`, type: "Inventory lot", title: lot.lotCode, detail: `${lot.product} · ${lot.status}`, page: "inventory", focus: lot.id, icon: "inventory" });
  }
  const visibleSearchResults = searchResults.slice(0, 24);

  const openResult=(page:PageKey,focus?:string)=>{
    if(focus)sessionStorage.setItem("momentum-focus-record",focus);
    navigate(page);
    onClose();
  };
  const resultIcon = (result: SearchResult) => result.icon === "location" ? <Building2 size={18}/> : result.icon === "calendar" ? <CalendarDays size={18}/> : result.icon === "person" ? <UsersRound size={18}/> : result.icon === "inventory" ? <Boxes size={18}/> : result.icon === "invoice" ? <CircleDollarSign size={18}/> : <ShoppingCart size={18}/>;

  return <Modal open={true} title="Search Momentum" description={customerMode ? "Find your linked account, location, or order." : "Search customers, locations, contacts, phone numbers, email, appointments, orders, invoices, people, and inventory within your scope."} onClose={onClose} wide><div className="command-search"><Search size={20}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={customerMode ? "Search location or order…" : "Search records…"}/><kbd>ESC</kbd></div><div className="command-results">{!query && <div className="command-empty"><Command size={28}/><p>Start typing to search records you can access.</p></div>}{query && visibleSearchResults.length === 0 && <div className="command-empty"><p>No matching records in your scope.</p></div>}{visibleSearchResults.map((result) => <button key={result.id} onClick={() => openResult(result.page, result.focus)}><span className="command-result__icon">{resultIcon(result)}</span><div><strong>{result.title}</strong><small>{result.detail}</small></div><span>{result.type}</span><ChevronRight size={16}/></button>)}</div></Modal>;
}
