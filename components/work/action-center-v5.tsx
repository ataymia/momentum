"use client";

import { AlertTriangle, BadgeDollarSign, BookOpenCheck, Boxes, CalendarClock, ClipboardCheck, FileText, GraduationCap, Megaphone, Receipt, ShieldCheck, UsersRound } from "lucide-react";
import { buildActionNotices, type ActionUrgency } from "../../lib/action-center-policy-v2";
import { useAccounting } from "../../lib/accounting-context";
import { useFinance } from "../../lib/finance-context";
import { useHcm } from "../../lib/hcm-context";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { useMarketing } from "../../lib/marketing-context";
import { usePerformance } from "../../lib/performance-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Section, StatusPill } from "../ui";

const urgencyTone=(urgency:ActionUrgency)=>urgency==="Blocking"?"danger" as const:urgency==="Due"?"warning" as const:urgency==="Review"?"info" as const:"neutral" as const;
const iconFor=(category:string)=>category==="Approvals"?ClipboardCheck:category==="Performance"?FileText:category==="Human Resources"?UsersRound:category==="Finance"?Receipt:category==="Marketing"?Megaphone:category==="Accounting"?BookOpenCheck:category==="Dispatch"?CalendarClock:category==="Inventory"?Boxes:category==="Timekeeping"?GraduationCap:AlertTriangle;

export function ActionCenter(){
  const {data,scope,currentUser,navigate}=useWorkspace();
  const {hcm}=useHcm();
  const {performance}=usePerformance();
  const {finance}=useFinance();
  const {state:marketing}=useMarketing();
  const {accounting,events}=useAccounting();
  const {ledger}=useInventoryLedger();
  if(!currentUser||currentUser.role==="Customer")return null;

  const actions=buildActionNotices({data,scope,currentUser,hcm,performance,finance,marketing,accounting,accountingEvents:events,ledger});
  const groups=[...new Set(actions.map(item=>item.category))];
  const open=(item:(typeof actions)[number])=>{
    if(item.focus)window.sessionStorage.setItem("momentum-focus-record",item.focus);
    if(item.peopleTab)window.sessionStorage.setItem("momentum-people-tab",item.peopleTab);
    if(item.weeklyWeekStart)window.sessionStorage.setItem("momentum-weekly-report-week",item.weeklyWeekStart);
    if(item.page)navigate(item.page);
  };

  return <Section title="Action center" action={<StatusPill tone={actions.some(item=>item.urgency==="Blocking")?"danger":actions.length?"warning":"success"}>{actions.length} open</StatusPill>}>
    <div className="action-center-v3">
      {groups.map(category=>{
        const items=actions.filter(item=>item.category===category);
        return <section key={category}><header><strong>{category}</strong><span>{items.length}</span></header><div>
          {items.map(item=>{const Icon=iconFor(item.category);return <article key={item.id}><span className={`action-center-v3__icon is-${item.urgency.toLowerCase()}`}><Icon size={17}/></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><StatusPill tone={urgencyTone(item.urgency)}>{item.urgency}</StatusPill>{item.page?<Button size="sm" variant="secondary" onClick={()=>open(item)}>Open</Button>:<small>Management notification only</small>}</article>;})}
        </div></section>;
      })}
      {actions.length===0&&<div className="review-empty"><ShieldCheck size={25}/><h3>No open actions</h3></div>}
    </div>
  </Section>;
}
