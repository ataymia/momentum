"use client";

import { Clock3, Store } from "lucide-react";
import { accountHealthSnapshot } from "../../lib/account-health";
import { useWorkspace } from "../../lib/workspace-context";
import { Section, StatusPill, formatDate, formatMoney } from "../ui";

const healthTone=(days?:number)=>days==null?"neutral" as const:days>=60?"danger" as const:days>=30?"warning" as const:"success" as const;

export function AccountHealthHome(){
  const{data,scope,currentUser,navigate}=useWorkspace();
  if(!currentUser||!["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role))return null;
  const rows=scope.accounts.map((account)=>({account,snapshot:accountHealthSnapshot(data,account)})).sort((a,b)=>(b.snapshot.daysSinceLastOrder??9999)-(a.snapshot.daysSinceLastOrder??9999)).slice(0,8);
  return <div className="account-health-home"><Section title="Account health"><div className="account-health-table"><div className="account-health-row account-health-row--head"><span>Account</span><span>Last order</span><span>Days</span><span>3-mo avg</span><span>Price</span><span>Review</span></div>{rows.map(({account,snapshot})=><button className="account-health-row" key={account.id} onClick={()=>{window.sessionStorage.setItem("momentum-focus-record",account.id);navigate("accounts");}}><span><Store size={14}/><span><strong>{account.locationName??account.name}</strong><small>{account.location}</small></span></span><span>{snapshot.lastOrderDate?formatDate(snapshot.lastOrderDate,{month:"short",day:"numeric"}):"None"}</span><span><StatusPill tone={healthTone(snapshot.daysSinceLastOrder)}>{snapshot.daysSinceLastOrder==null?"—":`${snapshot.daysSinceLastOrder}d`}</StatusPill></span><span>{snapshot.rolling3MonthMonthlyAverage} cs/mo</span><span>{account.pricingTier?`${account.pricingTier} · ${snapshot.pricePerCase?formatMoney(snapshot.pricePerCase):"—"}`:"Unassigned"}</span><span>{snapshot.categoryReviewDate?<><Clock3 size={13}/> {formatDate(snapshot.categoryReviewDate,{month:"short",day:"numeric"})}</>:"Not set"}</span></button>)}</div></Section></div>;
}
