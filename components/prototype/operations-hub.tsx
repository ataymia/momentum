"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { canVisitRoute, routeEntry, routeLabel } from "../../lib/navigation-route-registry";
import { navigateToRoute, useNavigationRoute } from "../../lib/navigation-store";
import { GOLDEN_EAGLE_SKUS, skuForProductName } from "../../lib/product-catalog";
import {evaluateSalesRepAccountBonuses,type BonusMilestoneStatus} from "../../lib/bonus-engine";
import {accountBonusProgress,type BonusProgressSort,type BonusProgressDirection} from "../../lib/bonus-progress";
import {acquisitionBonusHeldAccountIds} from "../../lib/acquisition-bonus-consolidation";
import { useWorkspace } from "../../lib/workspace-context";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {momentumStorage} from "../../lib/persistence";
import { TerritoryPanel } from "../crm/territory-panel";
import {SalesUserPicker} from "../crm/sales-user-picker";
import {CrmLeadCreator} from "./crm-lead-create";
import {CrmAccountHealth} from "./crm-account-health";
import {CrmAccountSetup} from "./crm-account-setup";
import {CrmAccountMap} from "./crm-account-map";
import {CrmQuickVisit} from "./crm-quick-visit";
import {CrmCommissionOnlyReview} from "./crm-commission-only-review";
import { AdminEmployeeProfiles } from "../hcm/admin-employee-profiles";
import { EmployeeDirectory } from "../hcm/employee-directory";
import { PeopleExperience } from "./hr-payroll-experiences";
import {PayrollWorkflowExperience} from "./payroll-workflow-experience";
import {HrOnboardingExperience} from "./hr-onboarding-experience";
import {InvoicePrintCenter} from "../finance/invoice-print-center";
import {downloadCsv} from "../../lib/browser-export";
import {accountExportColumns,accountExportRows,contactExportColumns,contactExportRows,authorizedCustomerOrders,authorizedCustomerOrder,customerDeliveryColumns,customerDeliveryExportRows,filterCustomerDeliveries} from "../../lib/saturday-scoped-workflows";
import {invoiceBalance,computedInvoiceStatus} from "../../lib/commerce-engine";
import {projectCustomerFinance,customerPaymentColumns,customerStatementColumns} from "../../lib/customer-finance-registers";
import {useCommerce} from "../../lib/commerce-context";
import {MarketingWorkspaceExperience} from "./marketing-workspace-experience";
import {MarketingPage as LegacyMarketingPage} from "../pages/marketing";
import {HrPersonnelDirectory,HrPersonnelRecord} from "./hr-personnel-experience";
import {HrTimeOffExperience} from "./hr-time-off-experience";
import {HrNewHireExperience} from "./hr-new-hire-experience";
import {NewHireProvisioning} from "../hcm/new-hire-provisioning";
import {PayrollPage as LegacyPayrollPage} from "../pages/payroll";
import { AccountConsolidationReview } from "./account-consolidation-review";
import { OrdersDirectory, OrderDetail, InvoiceDirectory, InvoiceDetail, PaymentsDirectory, PaymentDetail } from "./commerce-experience";
import { InventoryDirectory, InventoryLotDetail, InventoryLedgerDirectory, InventoryAdjustmentDirectory } from "./inventory-experience";
import {PackagesDirectory,ShipmentsDirectory,ShipmentDetail,DeliveryOperationsDirectory} from "./fulfillment-experience";
import {OrderEditor,OrderApprovalDirectory} from "./order-actions";
import {ActionCenterExperience} from "./action-center-experience";
import {WorkspaceHome} from "./workspace-home";
import {SalesReturnsDirectory,SalesReturnDetail,CreditNotesDirectory,CreditNoteDetail} from "./returns-credits-experience";
import {WorkExceptionsExperience,CompletedWorkExperience} from "./work-review-experience";
import {DealsDirectory,DealEditor} from "./crm-deals-experience";
import {CrmContactsDirectory,CrmContactEditor} from "./crm-contacts-experience";
import {useCrm} from "../../lib/crm-context";
import type { Order } from "../../lib/types";

function Empty({ children }: { children: ReactNode }) {
  return <div className="prototype-empty">{children}</div>;
}
function OpenLink({ to, children }: {to: string;children: ReactNode}) {
  return <button type="button" className="prototype-link" onClick={() => navigateToRoute(to)}>{children}<ExternalLink size={13}/></button>;
}
function Heading({title,description,back}:{title:string;description:string;back?:string}){
  return <header className="prototype-heading">
    {back&&<button type="button" className="prototype-back" onClick={()=>navigateToRoute(back)}><ArrowLeft size={15}/> Back to list</button>}
    <h1>{title}</h1><p>{description}</p>
  </header>;
}
function Tabs({items,current,base}:{items:{key:string;label:string}[];current:string;base:string}){
  return <nav className="prototype-tabs" aria-label="Record sections">{items.map(item=>
    <button key={item.key} type="button" aria-current={current===item.key?"page":undefined} className={current===item.key?"is-active":""} onClick={()=>navigateToRoute(base+(item.key==="overview"?"":"/"+item.key))}>{item.label}</button>
  )}</nav>;
}
const CUSTOMER_TABS=[{key:"overview",label:"Overview"},{key:"comments",label:"Comments"},{key:"transactions",label:"Transactions"},{key:"mails",label:"Mails"},{key:"statements",label:"Statements"},{key:"locations",label:"Locations"}];
const ITEM_TABS=[{key:"overview",label:"Overview"},{key:"transactions",label:"Transactions"},{key:"stock",label:"Stock Locations"},{key:"history",label:"History"}];
const safeTab=(value:string|undefined,allowed:{key:string}[])=>(allowed.some(tab=>tab.key===value)?value:"overview")??"overview";

type AccountsSortField="name"|"location"|"contactName"|"stage"|"postalCode"|"ownerId"|"nextActionDate";
function AccountsDirectory({leadMode=false}:{leadMode?:boolean}){
  const {scope,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<AccountsSortField>("name");
  const [ascending,setAscending]=useState(true);
  const [repFilter,setRepFilter]=useState("all");
  const [stageFilter,setStageFilter]=useState("all");
  const [fromDate,setFromDate]=useState("");
  const [throughDate,setThroughDate]=useState("");
  const [leadView,setLeadView]=useState<"pipeline"|"table"|"followups">("pipeline");
  const [followupAsOf,setFollowupAsOf]=useState(()=>new Date().toLocaleDateString("en-CA"));
  const [followupBucket,setFollowupBucket]=useState<"all"|"overdue"|"today"|"upcoming"|"unscheduled">("all");
  const names=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const records=useMemo(()=>scope.accounts
    .filter(a=>!leadMode||["Prospect","Qualified","Sampled"].includes(a.stage))
    .filter(a=>repFilter==="all"||a.ownerId===repFilter)
    .filter(a=>stageFilter==="all"||a.stage===stageFilter)
    .filter(a=>(!fromDate||a.nextActionDate>=fromDate)&&(!throughDate||a.nextActionDate<=throughDate))
    .filter(a=>[a.name,a.location,a.contactName,a.postalCode,a.email,names.get(a.ownerId)].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a,b)=>{
      const value=(loc:typeof a)=>sort==="ownerId"?names.get(loc.ownerId)??"":String(loc[sort]??"");
      return (ascending?1:-1)*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
    }),[scope.accounts,leadMode,repFilter,stageFilter,fromDate,throughDate,query,sort,ascending,names]);
  const selectSort=(field:AccountsSortField)=>{if(sort===field)setAscending(v=>!v);else{setSort(field);setAscending(true);}};
  const header=(field:AccountsSortField,label:string)=><button type="button" aria-label={"Sort by "+label} aria-sort={sort===field?(ascending?"ascending":"descending"):undefined} onClick={()=>selectSort(field)}>{label} <ArrowUpDown size={14}/></button>;
  const repIds=[...new Set(scope.accounts.map(a=>a.ownerId).filter(Boolean))].sort((a,b)=>(names.get(a)??"").localeCompare(names.get(b)??""));
  const stages=[...new Set(scope.accounts.map(a=>a.stage))].sort();
  return <div><Heading title={leadMode?"Leads":"Accounts & Customers"} description="Searchable, filtered and sortable business locations. Open any record for its linked customer profile."/>
  {leadMode&&<CrmLeadCreator/>}
  <section className="prototype-panel">
    <div className="prototype-controls">
      <label className="prototype-search"><Search size={16}/><input aria-label="Search businesses" placeholder="Business, location, contact, ZIP, rep" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <label>Representative <select aria-label="Filter accounts by representative" value={repFilter} onChange={e=>setRepFilter(e.target.value)}>
        <option value="all">All visible representatives</option>{repIds.map(id=><option key={id} value={id}>{names.get(id)??id}</option>)}</select></label>
      <label>Stage <select aria-label="Filter account stage" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}>
        <option value="all">All stages</option>{stages.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label>Next action from <input type="date" aria-label="Next action from date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
      <label>Through <input type="date" aria-label="Next action through date" value={throughDate} onChange={e=>setThroughDate(e.target.value)}/></label>
      <button type="button" disabled={!records.length} onClick={()=>downloadCsv(leadMode?"momentum-visible-leads.csv":"momentum-visible-accounts.csv",accountExportRows(records,names),accountExportColumns)}>Download filtered {leadMode?"leads":"accounts"} CSV</button>
    </div>
    {leadMode&&<nav className="prototype-controls" aria-label="Lead views">
      <button type="button" aria-pressed={leadView==="pipeline"} onClick={()=>setLeadView("pipeline")}>Pipeline</button>
      <button type="button" aria-pressed={leadView==="table"} onClick={()=>setLeadView("table")}>All leads</button>
      <button type="button" aria-pressed={leadView==="followups"} onClick={()=>setLeadView("followups")}>Follow-up queue</button>
    </nav>}
    {leadMode&&leadView==="pipeline"&&<div className="prototype-columns" aria-label="Lead pipeline">
      {(["Prospect","Qualified","Sampled"] as const).map(stage=><section className="prototype-panel" key={stage}>
        <h2>{stage} <small>({records.filter(a=>a.stage===stage).length})</small></h2>
        {records.filter(a=>a.stage===stage).map(a=><div className="prototype-activity" key={a.id}>
          <strong><OpenLink to={"/crm/leads/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></strong>
          <span>{a.location} · {names.get(a.ownerId)??"Unassigned"}</span>
          <span>{a.contactName?<OpenLink to={"/crm/contacts/"+encodeURIComponent(a.id)}>{a.contactName}</OpenLink>:"Contact not recorded"}</span>
          <span>Next action: {a.nextActionDate||"Not scheduled"}</span>
        </div>)}
        {!records.some(a=>a.stage===stage)&&<Empty>No visible leads at this stage.</Empty>}
      </section>)}
    </div>}
    {leadMode&&leadView==="followups"&&<section className="prototype-panel">
      <h2>Follow-up work queue</h2>
      <div className="prototype-controls">
        <label>Review date <input type="date" aria-label="Review follow-ups as of" value={followupAsOf} onChange={e=>setFollowupAsOf(e.target.value)}/></label>
        <label>Priority <select aria-label="Follow-up priority" value={followupBucket} onChange={e=>setFollowupBucket(e.target.value as typeof followupBucket)}>
          <option value="all">All follow-ups</option><option value="overdue">Overdue</option><option value="today">Due on review date</option><option value="upcoming">Upcoming</option><option value="unscheduled">Needs scheduling</option>
        </select></label>
        <button type="button" onClick={()=>{setFollowupBucket("all");setFollowupAsOf(new Date().toLocaleDateString("en-CA"));}}>Reset follow-up view</button>
      </div>
      <div className="prototype-controls" aria-label="Follow-up counts">
        {(["overdue","today","upcoming","unscheduled"] as const).map(bucket=>{
          const count=records.filter(a=>!a.nextActionDate?bucket==="unscheduled":a.nextActionDate<followupAsOf?bucket==="overdue":a.nextActionDate===followupAsOf?bucket==="today":bucket==="upcoming").length;
          return <button type="button" key={bucket} aria-pressed={followupBucket===bucket} onClick={()=>setFollowupBucket(bucket)}>{bucket==="today"?"Due today":bucket==="unscheduled"?"Needs scheduling":bucket==="overdue"?"Overdue":"Upcoming"} ({count})</button>;
        })}
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Business</th><th>Stage</th><th>Contact</th><th>Assigned rep</th><th>Next action</th><th>Account</th></tr></thead><tbody>
      {[...records].filter(a=>{
        const bucket=!a.nextActionDate?"unscheduled":a.nextActionDate<followupAsOf?"overdue":a.nextActionDate===followupAsOf?"today":"upcoming";
        return followupBucket==="all"||bucket===followupBucket;
      }).sort((a,b)=>(a.nextActionDate||"9999").localeCompare(b.nextActionDate||"9999")||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(a=><tr key={a.id}>
        <td><OpenLink to={"/crm/leads/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.stage}</td>
        <td>{a.contactName?<OpenLink to={"/crm/contacts/"+encodeURIComponent(a.id)}>{a.contactName}</OpenLink>:"Not recorded"}</td>
        <td>{names.get(a.ownerId)??"Unassigned"}</td><td>{a.nextActionDate||"Not scheduled"}</td>
        <td><OpenLink to={"/crm/leads/"+encodeURIComponent(a.id)}>Open lead</OpenLink><LeadFollowupScheduler accountId={a.id} defaultDate={a.nextActionDate}/></td>
      </tr>)}</tbody></table></div>
      {!records.length&&<Empty>No accessible leads match the current search and date filters.</Empty>}
      {records.length>0&&!records.some(a=>{
        const bucket=!a.nextActionDate?"unscheduled":a.nextActionDate<followupAsOf?"overdue":a.nextActionDate===followupAsOf?"today":"upcoming";
        return followupBucket==="all"||bucket===followupBucket;
      })&&<Empty>No follow-ups in this priority group. Try another priority or reset the date filters.</Empty>}
    </section>}
    {(!leadMode||leadView==="table")&&<>
    <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
      <th>{header("name","Business")}</th><th>{header("location","Location")}</th><th>{header("contactName","Contact")}</th><th>{header("stage","Stage")}</th><th>{header("postalCode","ZIP")}</th><th>{header("ownerId","Assigned rep")}</th><th>{header("nextActionDate","Next action")}</th>
    </tr></thead><tbody>{records.map(a=><tr key={a.id}>
      <td><OpenLink to={(leadMode?"/crm/leads/":"/sales/customers/")+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.location}</td><td>{a.contactName||"Unrecorded"}</td><td>{a.stage}</td><td>{a.postalCode||"Unrecorded"}</td><td>{names.get(a.ownerId)??"Unassigned"}</td><td>{a.nextActionDate||"None"}</td>
    </tr>)}</tbody></table></div>{!records.length&&<Empty>No matching business records.</Empty>}
    </>}
    <p className="prototype-note">{records.length} matching records. Sorting and filters affect your view only, not account ownership or history.</p>
  </section></div>;
}

function LeadRecord({id}:{id:string}){
  const {scope,data,currentUser,transferAccountResponsibility,qualifyLead}=useWorkspace();
  const {isDemo}=useRuntimeMode();
  const account=scope.accounts.find(a=>a.id===id&&["Prospect","Qualified","Sampled"].includes(a.stage));
  const [qualificationReason,setQualificationReason]=useState("");
  const [qualificationFeedback,setQualificationFeedback]=useState("");
  const [newOwner,setNewOwner]=useState("");
  const [handoffReason,setHandoffReason]=useState("");
  const [handoffFeedback,setHandoffFeedback]=useState("");
  const canQualify=isDemo&&momentumStorage.mode()==="local"&&!!currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role);
  const canHandoff=isDemo&&momentumStorage.mode()==="local"&&!!currentUser&&["Administrator","Sales Manager"].includes(currentUser.role);
  const eligibleReps=data.users.filter(u=>u.role==="Sales Representative"&&u.employmentStatus!=="Separated"&&u.id!==account?.ownerId);
  const handoff=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!canHandoff||!account||!eligibleReps.some(u=>u.id===newOwner)||handoffReason.trim().length<3){setHandoffFeedback("Choose an eligible representative and provide a reason of at least three characters.");return;}
    const accepted=transferAccountResponsibility(account.id,newOwner,handoffReason.trim());
    if(!accepted){setHandoffFeedback("Assignment rejected. Verify your role, representative eligibility, territory and account access.");return;}
    setHandoffFeedback("Responsibility updated in this demonstration workspace. Historical order credit is unchanged.");
    setNewOwner("");setHandoffReason("");
  };
  const [activityQuery,setActivityQuery]=useState("");
  const [orderQuery,setOrderQuery]=useState("");
  if(!account)return <div><Heading title="Lead unavailable" description="No accessible lead record matched this link." back="/crm/leads"/><Empty>Lead not found, no longer in the lead pipeline, or outside your authorized workspace.</Empty></div>;
  const rep=data.users.find(u=>u.id===account.ownerId);
  const activities=scope.activities.filter(a=>a.accountId===id&&[a.title,a.detail].join(" ").toLowerCase().includes(activityQuery.trim().toLowerCase()))
    .sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
  const orders=scope.orders.filter(o=>o.accountId===id&&!o.testOnly&&[o.number,o.status].join(" ").toLowerCase().includes(orderQuery.trim().toLowerCase()))
    .sort((a,b)=>b.placedAt.localeCompare(a.placedAt)||a.id.localeCompare(b.id));
  return <div><Heading title={account.name} description="Lead qualification and follow-up record" back="/crm/leads"/>
    <div className="prototype-metrics"><div><small>Pipeline stage</small><strong>{account.stage}</strong></div><div><small>Next action</small><strong>{account.nextActionDate||"Not scheduled"}</strong></div><div><small>Assigned representative</small><strong>{rep?.name||"Unassigned"}</strong></div></div>
    <div className="prototype-columns"><section className="prototype-panel"><h2>Business and contact</h2>
      <dl className="prototype-facts"><div><dt>Location</dt><dd>{account.location}</dd></div><div><dt>ZIP</dt><dd>{account.postalCode||"Not recorded"}</dd></div><div><dt>Contact</dt><dd>{account.contactName||"Not recorded"}</dd></div><div><dt>Email</dt><dd>{account.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{account.phone||"Not recorded"}</dd></div></dl>
      <div className="prototype-controls"><OpenLink to={"/sales/customers/"+encodeURIComponent(id)}>Customer account</OpenLink>{account.contactName&&<OpenLink to={"/crm/contacts/"+encodeURIComponent(id)}>Contact detail</OpenLink>}</div>
      <div className="prototype-controls"><OpenLink to="/crm/deals">Sales opportunities</OpenLink><OpenLink to="/crm/deals/new">Create a deal</OpenLink></div>

      {canQualify&&<form className="prototype-panel" aria-label="Update lead qualification" onSubmit={event=>{
        event.preventDefault();
        const target=account.stage==="Prospect"?"Qualified":account.stage==="Qualified"?"Sampled":"Qualified";
        const result=qualifyLead(account.id,target,qualificationReason);
        setQualificationFeedback(result.ok?"Lead stage updated in the isolated CRM demonstration workspace.":(result.message??"Qualification rejected."));
        if(result.ok)setQualificationReason("");
      }}>
        <h3>Qualify lead</h3>
        <label>Next stage <select aria-label="Next lead qualification stage" value={account.stage==="Prospect"?"Qualified":account.stage==="Qualified"?"Sampled":"Qualified"} disabled>
          {account.stage==="Prospect"?<option value="Qualified">Qualified</option>:account.stage==="Qualified"?<option value="Sampled">Sampled</option>:<option value="Qualified">Qualified (manager correction only)</option>}
        </select></label>
        <label>Qualification reason <textarea required minLength={5} maxLength={500} value={qualificationReason} onChange={event=>setQualificationReason(event.target.value)} placeholder="Evidence supporting this stage change"/></label>
        <button type="submit" disabled={qualificationReason.trim().length<5}>Save stage</button>
        {qualificationFeedback&&<p role="status">{qualificationFeedback}</p>}
      </form>}

      <p className="prototype-note">Lead stage is sourced from the existing account record. Stage editing remains disabled pending audited server authorization.</p>
      {canHandoff&&<form className="prototype-panel" aria-label="Transfer lead responsibility" onSubmit={handoff}>
        <h3>Reassign lead</h3>
        <div className="prototype-controls"><SalesUserPicker label="New lead representative" users={eligibleReps} value={newOwner} onChange={id=>{setNewOwner(id);setHandoffFeedback("");}} allowUnassigned={false}/></div>
        <label>Reason for reassignment <textarea required minLength={3} maxLength={500} value={handoffReason} onChange={e=>setHandoffReason(e.target.value)} /></label>
        <button type="submit" disabled={!newOwner||handoffReason.trim().length<3}>Transfer responsibility</button>
        {handoffFeedback&&<p role="status">{handoffFeedback}</p>}
        <p className="prototype-note">Manager-only demonstration action. The existing authority engine validates eligibility and records the handoff in account activity. This does not alter historical sales credit.</p>
      </form>}
    </section><section className="prototype-panel"><h2>Next visit</h2><p>Schedule a visit using the existing territory, role and calendar conflict checks.</p><LeadFollowupScheduler accountId={id} defaultDate={account.nextActionDate}/></section></div>
    <section className="prototype-panel"><h2>Activity history</h2><label className="prototype-search">Search activities <input aria-label="Search lead activity" value={activityQuery} onChange={e=>setActivityQuery(e.target.value)}/></label>
      {activities.map(a=><div className="prototype-activity" key={a.id}><strong>{a.title}</strong><span>{a.at.slice(0,10)} · {a.detail}</span></div>)}
      {!activities.length&&<Empty>No matching recorded activity.</Empty>}</section>
    <section className="prototype-panel"><h2>Related orders</h2><label className="prototype-search">Search orders <input aria-label="Search lead orders" value={orderQuery} onChange={e=>setOrderQuery(e.target.value)}/></label>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Cases</th></tr></thead><tbody>
      {orders.map(o=><tr key={o.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{o.placedAt.slice(0,10)}</td><td>{o.status}</td><td>{o.cases}</td></tr>)}
      </tbody></table></div>{!orders.length&&<Empty>No matching recorded orders.</Empty>}</section>
  </div>;
}

function LeadFollowupScheduler({accountId,defaultDate}:{accountId:string;defaultDate:string}){
  const {scope,currentUser,createAppointment}=useWorkspace();
  const {isDemo}=useRuntimeMode();
  const [open,setOpen]=useState(false);
  const [date,setDate]=useState(defaultDate||"");
  const [time,setTime]=useState("09:00");
  const [objective,setObjective]=useState("");
  const [kind,setKind]=useState<"First visit"|"Revisit"|"Sample drop">("Revisit");
  const [feedback,setFeedback]=useState("");
  const account=scope.accounts.find(a=>a.id===accountId);
  const canSchedule=isDemo&&!!currentUser&&["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role)&&!!account;
  if(!canSchedule)return <span className="prototype-small">Scheduling unavailable</span>;
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T12:00:00"))||date<new Date().toLocaleDateString("en-CA")||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)||objective.trim().length<5){
      setFeedback("Choose a valid future date, time and objective of at least five characters.");return;
    }
    const id=createAppointment({accountId,date,startTime:time,duration:30,type:kind,objective:objective.trim(),priority:"Normal"});
    if(!id){setFeedback("Scheduling was rejected. Check representative permissions, territory and calendar conflicts.");return;}
    setFeedback("Follow-up scheduled in this demonstration workspace.");
    setOpen(false);
    setObjective("");
  };
  return <div>
    <button type="button" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setFeedback("");}}>Schedule visit</button>
    {open&&<form onSubmit={submit} className="prototype-panel" aria-label="Schedule lead follow-up">
      <label>Date <input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Time <input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
      <label>Visit type <select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option>First visit</option><option>Revisit</option><option>Sample drop</option></select></label>
      <label>Objective <input required minLength={5} maxLength={240} value={objective} onChange={e=>setObjective(e.target.value)} placeholder="Reason for visit"/></label>
      <button type="submit">Save visit</button><button type="button" onClick={()=>setOpen(false)}>Cancel</button>
    </form>}
    {feedback&&<p role="status" className="prototype-note">{feedback}</p>}
  </div>;
}

function CustomerRecord({id,section}:{id:string;section:string}){
  const {scope,data,currentUser}=useWorkspace();
  const {commerce}=useCommerce();
  const runtime=useRuntimeMode();
  const [statementSearch,setStatementSearch]=useState("");
  const [statementFrom,setStatementFrom]=useState("");
  const [statementThrough,setStatementThrough]=useState("");
  const [statementAscending,setStatementAscending]=useState(false);
  const loc=scope.accounts.find(a=>a.id===id);
  if(!loc)return <Empty>Customer not found or not accessible to your account.</Empty>;
  // Only group by explicitly stored parent ID; never use name matching as evidence of shared ownership.
  const parent=loc.customerId ? (data.customers??[]).find(c=>c.id===loc.customerId) : undefined;
  const locations=loc.customerId ? scope.accounts.filter(a=>a.customerId===loc.customerId) : [loc];
  const ids=new Set(locations.map(a=>a.id));
  const orders=scope.orders.filter(o=>ids.has(o.accountId)&&!o.testOnly).sort((a,b)=>b.placedAt.localeCompare(a.placedAt));
  const activities=scope.activities.filter(a=>a.accountId&&ids.has(a.accountId)).sort((a,b)=>b.at.localeCompare(a.at));
  const path="/sales/customers/"+encodeURIComponent(id),tab=safeTab(section,CUSTOMER_TABS);
  const label=parent?.name??loc.name;
  // Only local demo can project the full browser Commerce register.
  // Connected employee/customer sessions must receive server-scoped finance data.
  const finance=runtime.isDemo&&momentumStorage.mode()==="local"&&currentUser?.role!=="Customer"
    ?projectCustomerFinance(commerce,orders,ids,new Map(locations.map(a=>[a.id,a.locationName??a.name])))
    :null;
  const statementRows=(finance?.statement??[])
    .filter(row=>(!statementFrom||row.date>=statementFrom)&&(!statementThrough||row.date<=statementThrough))
    .filter(row=>[row.location,row.reference,row.type,row.status].join(" ").toLowerCase().includes(statementSearch.trim().toLowerCase()))
    .sort((a,b)=>(statementAscending?1:-1)*(a.date.localeCompare(b.date)||a.reference.localeCompare(b.reference)||a.type.localeCompare(b.type)));
  return <div><Heading title={label} description="Linked customer locations, activity and source-backed records" back="/sales/customers"/>
    <Tabs base={path} items={CUSTOMER_TABS} current={tab}/>
    {tab==="overview"&&<div className="prototype-columns"><section className="prototype-panel"><h2>Contact & billing details</h2>
      <dl className="prototype-facts"><div><dt>Primary contact</dt><dd>{loc.contactName||"Not recorded"}</dd></div><div><dt>Email</dt><dd>{loc.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{loc.phone||"Not recorded"}</dd></div>
      <div><dt>Billing address / location</dt><dd>{loc.streetAddress??""} {loc.location} {loc.postalCode??""}</dd></div>
      <div><dt>Terms</dt><dd>{parent?.paymentTerms??"Not recorded"}</dd></div><div><dt>Account owner</dt><dd>{data.users.find(u=>u.id===loc.ownerId)?.name??"Unassigned"}</dd></div>
      </dl></section><section className="prototype-panel"><h2>Account activity</h2>
      <div className="prototype-tiles"><div><small>Accessible locations</small><strong>{locations.length}</strong></div><div><small>Sales orders on record</small><strong>{orders.length}</strong></div></div>
      <h3>Recent activity</h3>{activities.slice(0,8).map(a=><p className="prototype-activity" key={a.id}><strong>{a.title}</strong><span>{a.at.slice(0,10)} • {a.detail}</span></p>)}
      {activities.length===0&&<Empty>No recorded activity.</Empty>}</section></div>}
    {tab==="comments"&&<section className="prototype-panel"><h2>Comments and notes</h2><p className="prototype-note">Existing account notes are displayed below. A dedicated audited internal comment thread requires its own write permissions.</p>
      {locations.map(a=><div key={a.id} className="prototype-activity"><strong>{a.locationName??a.name}</strong><span>{a.notes||"No recorded notes"}</span></div>)}</section>}
    {tab==="transactions"&&<section className="prototype-panel"><h2>Sales transactions</h2><table className="prototype-table"><thead><tr><th>Order</th><th>Location</th><th>Date</th><th>Cases</th><th>State</th><th>Payment</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{locations.find(a=>a.id===o.accountId)?.locationName??locations.find(a=>a.id===o.accountId)?.location??"Unknown"}</td><td>{o.placedAt}</td><td>{o.cases}</td><td>{o.status}</td><td>{o.paymentStatus}</td></tr>)}</tbody></table>{!orders.length&&<Empty>No recorded sales orders.</Empty>}</section>}
    {tab==="mails"&&<section className="prototype-panel"><h2>Customer mail history</h2><Empty>No verified customer-linked outbound or inbound email history is available in this prototype. Gmail remains the company inbox, and the event-mail system requires approved server integration before it can populate this tab.</Empty></section>}
    {tab==="statements"&&<section className="prototype-panel"><h2>Customer statement</h2>
      {!finance?<Empty>Statements require server-authorized invoice and payment access in connected mode. No amount is estimated from order totals.</Empty>:<>
        <p className="prototype-note">Demo financial projection from this customer&apos;s accessible delivered orders, registered invoices, cleared allocated payments, applied credits and settled refunds. Opening balances and unreconciled adjustments are not included. Not an approved financial statement.</p>
        <div className="prototype-metrics"><div><small>Invoices with verified order links</small><strong>{finance.invoices.length}</strong></div><div><small>Registered invoice balance</small><strong>{finance.openBalance.toLocaleString("en-US",{style:"currency",currency:"USD"})}</strong></div></div>
        <div className="prototype-controls">
          <label>Search statement <input type="search" aria-label="Search customer statement" value={statementSearch} onChange={e=>setStatementSearch(e.target.value)}/></label>
          <label>From <input type="date" aria-label="Statement from date" value={statementFrom} onChange={e=>setStatementFrom(e.target.value)}/></label>
          <label>To <input type="date" aria-label="Statement through date" value={statementThrough} onChange={e=>setStatementThrough(e.target.value)}/></label>
          <button type="button" onClick={()=>setStatementAscending(v=>!v)}>Date {statementAscending?"ascending":"descending"}</button>
          <button type="button" disabled={!statementRows.length} onClick={()=>downloadCsv("momentum-customer-statement-"+loc.id+".csv",statementRows,customerStatementColumns)}>Save filtered statement CSV</button>
        </div>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>Reference</th><th>Transaction</th><th>Status</th><th>Debit</th><th>Credit</th></tr></thead>
          <tbody>{statementRows.map((row,i)=><tr key={row.reference+"-"+row.date+"-"+row.type+"-"+i}><td>{row.date}</td><td>{row.location}</td><td>{row.reference}</td><td>{row.type}</td><td>{row.status}</td><td>{row.debit?row.debit.toFixed(2):"—"}</td><td>{row.credit?row.credit.toFixed(2):"—"}</td></tr>)}</tbody>
        </table></div>
        {!statementRows.length&&<Empty>No verified financial events match this statement filter.</Empty>}
      </>}
    </section>}
    {tab==="locations"&&<section className="prototype-panel"><h2>Related locations</h2><p className="prototype-note">Only explicitly linked customer IDs are grouped. Same-name records are not merged automatically.</p>
      <table className="prototype-table"><thead><tr><th>Location</th><th>ZIP</th><th>Assigned representative</th><th>Account ID</th></tr></thead><tbody>{locations.map(a=><tr key={a.id}><td>{a.locationName??a.name}</td><td>{a.postalCode??"Unknown"}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td className="prototype-small">{a.id}</td></tr>)}</tbody></table></section>}
  </div>;
}
function matchingLines(order:Order,skuId:string){
  if(order.lines?.length)return order.lines.filter(l=>skuForProductName(l.product)?.id===skuId).map(l=>({cases:l.cases,product:l.product}));
  if(order.testSkuId===skuId||(!order.testSkuId&&order.product&&skuForProductName(order.product)?.id===skuId))return [{cases:order.cases,product:order.product??""}];
  return [];
}
function ProductDirectory(){
  const [query,setQuery]=useState(""); const [asc,setAsc]=useState(true);
  const skus=GOLDEN_EAGLE_SKUS.filter(s=>[s.shortName,s.description,s.id].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(asc?1:-1)*a.shortName.localeCompare(b.shortName));
  return <div><Heading title="Items" description="Product master with connected records, stock locations and transaction history."/>
    <section className="prototype-panel"><div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search items" placeholder="Search item or SKU" value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" onClick={()=>setAsc(!asc)}><ArrowUpDown size={15}/> Name {asc?"A–Z":"Z–A"}</button></div>
      <table className="prototype-table"><thead><tr><th>Item</th><th>SKU</th><th>Case pack</th><th>Status</th></tr></thead><tbody>{skus.map(s=><tr key={s.id}><td><OpenLink to={"/items/"+encodeURIComponent(s.id)}>{s.shortName}</OpenLink><small className="prototype-description">{s.description}</small></td><td>{s.id}</td><td>{s.casePack}</td><td>{s.active?"Active":"Inactive"}</td></tr>)}</tbody></table>
    </section></div>;
}
function ProductRecord({skuId,section}:{skuId:string;section:string}){
  const {scope}=useWorkspace();const sku=GOLDEN_EAGLE_SKUS.find(s=>s.id===skuId);
  if(!sku)return <Empty>Item not found, or it is unavailable.</Empty>;
  const matched=scope.orders.filter(o=>!o.testOnly&&!["Cancelled","Draft"].includes(o.status)).map(o=>({order:o,lines:matchingLines(o,sku.id)})).filter(x=>x.lines.length>0).sort((a,b)=>b.order.placedAt.localeCompare(a.order.placedAt));
  const lots=scope.inventory.filter(l=>skuForProductName(l.product)?.id===sku.id);
  const delivered=matched.filter(x=>["Delivered","Paid"].includes(x.order.status));
  const units=delivered.reduce((n,x)=>n+x.lines.reduce((m,l)=>m+l.cases,0),0);
  const base="/items/"+encodeURIComponent(sku.id),tab=safeTab(section,ITEM_TABS);
  return <div><Heading title={sku.shortName} description={sku.description} back="/items"/><Tabs items={ITEM_TABS} current={tab} base={base}/>
    {tab==="overview"&&<><div className="prototype-metrics"><div><small>Case pack</small><strong>{sku.casePack}</strong></div><div><small>Orders containing item</small><strong>{matched.length}</strong></div><div><small>Cases on delivered/paid orders</small><strong>{units}</strong></div></div>
      <section className="prototype-panel"><h2>Item master</h2><dl className="prototype-facts"><div><dt>SKU</dt><dd>{sku.id}</dd></div><div><dt>Case barcode</dt><dd>{sku.caseBarcode??"Pending verified barcode"}</dd></div><div><dt>Active</dt><dd>{sku.active?"Yes":"No"}</dd></div></dl><p className="prototype-note">Delivered-order counts are not proof of end-consumer sell-through. Historical PO metadata is not current inventory.</p></section></>}
    {tab==="transactions"&&<section className="prototype-panel"><h2>Orders containing this item</h2><table className="prototype-table"><thead><tr><th>Sales order</th><th>Where placed</th><th>Date</th><th>Cases</th><th>Order status</th></tr></thead><tbody>{matched.map(({order,lines})=><tr key={order.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></td><td>{scope.accounts.find(a=>a.id===order.accountId)?.name??"Restricted location"}</td><td>{order.placedAt}</td><td>{lines.reduce((n,l)=>n+l.cases,0)}</td><td>{order.status}</td></tr>)}</tbody></table>{!matched.length&&<Empty>No linked item-level order lines found in your accessible records. Legacy orders without product identity are intentionally not attributed to a SKU.</Empty>}</section>}
    {tab==="stock"&&<section className="prototype-panel"><h2>Verified inventory lot records</h2><table className="prototype-table"><thead><tr><th>Warehouse / Bin</th><th>Lot</th><th>On hand</th><th>Available</th><th>Best by</th></tr></thead><tbody>{lots.map(l=><tr key={l.id}><td>{l.location}</td><td>{l.lotCode}</td><td>{l.onHand}</td><td>{l.available}</td><td>{l.bestBy}</td></tr>)}</tbody></table>{!lots.length&&<Empty>No accessible, SKU-matched inventory lot records. Historical supplier quantities do not populate inventory.</Empty>}</section>}
    {tab==="history"&&<section className="prototype-panel"><h2>Item activity</h2><p className="prototype-note">This prototype shows order and lot links, not a full audit history. The existing audit ledger should provide authoritative changes and actors in the completed experience.</p>
      {matched.slice(0,30).map(({order})=><p className="prototype-activity" key={order.id}><strong>{order.placedAt} • {order.number}</strong><span>{order.status} • {scope.accounts.find(a=>a.id===order.accountId)?.name??"Restricted location"}</span></p>)}
      {!matched.length&&<Empty>No linked order activity.</Empty>}</section>}
  </div>;
}
function CalendarPreview({meetingsOnly}:{meetingsOnly:boolean}){
  const {scope,data}=useWorkspace();
  const upcoming=scope.appointments.filter(a=>a.date>=new Date().toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  return <div><Heading title={meetingsOnly?"Meetings":"Shared calendar"} description="Field appointments currently recorded by Momentum; staff meeting invitations are a separate planned workflow."/>
    <section className="prototype-panel"><h2>Upcoming authorized field appointments</h2><table className="prototype-table"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Assigned to</th><th>Business</th></tr></thead><tbody>{upcoming.map(a=><tr key={a.id}><td>{a.date}</td><td>{a.startTime}</td><td>{a.type}</td><td>{data.users.find(u=>u.id===a.ownerId)?.name??"Unassigned"}</td><td>{scope.accounts.find(ac=>ac.id===a.accountId)?.name??"Restricted"}</td></tr>)}</tbody></table>{!upcoming.length&&<Empty>No upcoming field appointments visible to your role.</Empty>}</section>
    <section className="prototype-panel"><h2>Staff meetings: next phase</h2><p>Authorized organizers will schedule a meeting, select attendees, check conflicts, send invitations, add it to each attendee calendar, and display a reminder on Home. This is not an active scheduler yet.</p></section>
  </div>;
}
function IncentivePreview(){
  const {scope,data}=useWorkspace();
  const [query,setQuery]=useState("");
  const [repFilter,setRepFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [sort,setSort]=useState<BonusProgressSort>("remaining");
  const [direction,setDirection]=useState<BonusProgressDirection>("asc");
  const names=useMemo(()=>new Map(data.users.map(u=>[u.id,u.name])),[data.users]);
  const accounts=useMemo(()=>new Map(scope.accounts.map(a=>[a.id,a])),[scope.accounts]);
  const allowedIds=useMemo(()=>new Set(scope.accounts.map(a=>a.id)),[scope.accounts]);
  // Calculate per PHYSICAL location, never aggregate unrelated store orders into
  // a single 40-case milestone merely because the stores share a billing parent.
  const signals=useMemo(()=>evaluateSalesRepAccountBonuses(data)
    .filter(signal=>allowedIds.has(signal.accountId)),[data,allowedIds]);
  const held=useMemo(()=>acquisitionBonusHeldAccountIds(data),[data]);
  const rows=useMemo(()=>accountBonusProgress(signals,{
    repId:repFilter,
    status:statusFilter==="all"?undefined:statusFilter as BonusMilestoneStatus,
    accountSearch:query,sort,direction,
    accountNames:new Map(scope.accounts.map(a=>[a.id,a.locationName??a.name])),
    repNames:names,
  }),[signals,repFilter,statusFilter,query,sort,direction,scope.accounts,names]);
  const reps=[...new Set(signals.map(s=>s.repId))].sort((a,b)=>(names.get(a)??a).localeCompare(names.get(b)??b));
  const header=(label:string,key:BonusProgressSort)=><button type="button" aria-label={"Sort incentives by "+label}
    onClick={()=>{if(sort===key)setDirection(v=>v==="asc"?"desc":"asc");else{setSort(key);setDirection("asc");}}}>{label} <ArrowUpDown size={14}/></button>;
  return <div><Heading title="Sales incentives" description="Separate 10-case opening and 40-case sustained milestones per physical customer location, with continuous settled-case progress toward 40."/>
    <section className="prototype-panel" aria-label="Acquisition bonus progress">
      <p className="prototype-note">Tracking only, not payroll authorization. A 10-case opening qualifies for the first approved milestone after verified settlement. The 40-case milestone includes the opening cases and additional qualifying paid cases inside the 90-day window. There is no 20-case bonus.</p>
      <div className="prototype-controls">
        <label>Find account <input type="search" aria-label="Search incentive account" placeholder="Location or business name" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label>Credited representative <select aria-label="Filter incentives by historically credited representative" value={repFilter} onChange={e=>setRepFilter(e.target.value)}><option value="all">All accessible reps</option>{reps.map(id=><option value={id} key={id}>{names.get(id)??id}</option>)}</select></label>
        <label>Milestone status <select aria-label="Filter incentive milestone status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>{(["Not started","Awaiting payment","Tracking","Earned","Window expired","Not qualified"] as BonusMilestoneStatus[]).map(status=><option key={status} value={status}>{status}</option>)}
        </select></label>
        <label>Sort <select aria-label="Sort incentive records" value={sort} onChange={e=>setSort(e.target.value as BonusProgressSort)}><option value="remaining">Cases remaining</option><option value="cases">Settled cases</option><option value="account">Account</option><option value="representative">Historical representative</option><option value="deadline">Window deadline</option></select></label>
        <button type="button" onClick={()=>setDirection(v=>v==="asc"?"desc":"asc")}>Order: {direction==="asc"?"ascending":"descending"}</button>
      </div>
      <p role="status" className="prototype-note">{rows.length} matching store location{rows.length===1?"":"s"}, each with independent bonus evidence and historical attribution.</p>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
        <th>{header("Account","account")}</th><th>{header("Credited rep","representative")}</th><th>{header("Paid cases","cases")}</th><th>{header("Remaining","remaining")}</th><th>Progress to 40</th><th>Opening / sustained</th><th>{header("Deadline","deadline")}</th><th>Record</th>
      </tr></thead><tbody>{rows.map(row=>{
        const account=accounts.get(row.accountId);
        const blocked=held.has(row.accountId);
        return <tr key={row.accountId}>
          <td>{account?.locationName??account?.name??row.accountId}<small className="prototype-description">{account?.streetAddress??account?.location??"Address unrecorded"}</small></td>
          <td>{names.get(row.repId)??"Unverified"}</td><td>{row.settledCases}</td><td>{row.remainingCases}</td>
          <td><div role="progressbar" aria-label={"40-case paid progress for "+(account?.name??row.accountId)} aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.min(40,row.settledCases)} className="prototype-progress"><div style={{width:row.percent+"%"}}/></div><small>{row.settledCases}/40 paid cases</small></td>
          <td>{row.opening.status} / {row.sustained.status}{blocked&&<small className="prototype-description" role="alert">Payout hold: duplicate acquisition evidence needs administrator review</small>}</td>
          <td>{row.windowEnd??"Not started"}</td><td><OpenLink to={"/sales/customers/"+encodeURIComponent(row.accountId)}>Open account</OpenLink></td>
        </tr>;
      })}</tbody></table></div>
      {!rows.length&&<Empty>No incentive records match those filters.</Empty>}
      <p className="prototype-note">Account identity, historical representative credit, plan eligibility, genuine cleared funds, prior payouts and possible consolidation duplicates must be reviewed before issuing pay. The display cannot approve or create a payment.</p>
    </section>
  </div>;
}
type ContactSortField="contactName"|"name"|"contactRole"|"email"|"phone"|"location"|"stage";
function ContactsDirectory(){
  const {scope}=useWorkspace();const [query,setQuery]=useState("");
  const [sort,setSort]=useState<ContactSortField>("contactName");
  const [ascending,setAscending]=useState(true);
  const [stageFilter,setStageFilter]=useState("all");
  const [roleFilter,setRoleFilter]=useState("all");
  const stages=[...new Set(scope.accounts.filter(a=>a.contactName).map(a=>a.stage))].sort();
  const roles=[...new Set(scope.accounts.filter(a=>a.contactName&&a.contactRole).map(a=>a.contactRole))].sort();
  const rows=useMemo(()=>scope.accounts.filter(a=>a.contactName&&(stageFilter==="all"||a.stage===stageFilter)&&(roleFilter==="all"||a.contactRole===roleFilter)&&[a.contactName,a.name,a.email,a.phone,a.contactRole,a.location,a.stage].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const value=(a:typeof b)=>String(a[sort]??"");
    return (ascending?1:-1)*(value(a).localeCompare(value(b),undefined,{numeric:true})||a.id.localeCompare(b.id));
  }),[scope.accounts,query,sort,ascending,stageFilter,roleFilter]);
  const header=(key:ContactSortField,label:string)=><button type="button" aria-label={"Sort by "+label} onClick={()=>{if(sort===key)setAscending(v=>!v);else{setSort(key);setAscending(true);}}}>{label}<ArrowUpDown size={14}/></button>;
  return <div><Heading title="Contacts" description="All recorded decision-makers linked to your accessible customer locations."/>
    <section className="prototype-panel">
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contacts" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Contact, business, email, phone, role"/></label><label>Stage <select aria-label="Filter contacts by stage" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">All stages</option>{stages.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Role <select aria-label="Filter contacts by role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">All roles</option>{roles.map(v=><option key={v} value={v}>{v}</option>)}</select></label><button type="button" disabled={!rows.length} onClick={()=>downloadCsv("momentum-visible-contacts.csv",contactExportRows(rows),contactExportColumns)}>Download filtered contacts CSV</button></div>
      <div className="prototype-table-scroll"><table className="prototype-table">
        <thead><tr><th>{header("contactName","Contact")}</th><th>{header("name","Business")}</th><th>{header("contactRole","Role")}</th><th>{header("email","Email")}</th><th>{header("phone","Phone")}</th><th>{header("location","Location")}</th><th>{header("stage","Stage")}</th></tr></thead>
        <tbody>{rows.map(a=><tr key={a.id}><td><OpenLink to={"/crm/contacts/"+encodeURIComponent(a.id)}>{a.contactName}</OpenLink></td><td><OpenLink to={"/sales/customers/"+encodeURIComponent(a.id)}>{a.name}</OpenLink></td><td>{a.contactRole||"Not recorded"}</td><td>{a.email||"Not recorded"}</td><td>{a.phone||"Not recorded"}</td><td>{a.location}</td><td>{a.stage}</td></tr>)}</tbody>
      </table></div>
      {!rows.length&&<Empty>No matching contacts.</Empty>}
      <p className="prototype-note">{rows.length} contact-location associations. Distinct standalone contact IDs and deduplication are planned.</p>
    </section></div>;
}

/** Contact records currently inherit the canonical location ID. Never invent an
 * independent person ID or infer that matching names are the same person. */

/** Retain old account-ID contact deep links while independent contact IDs get real records. */
function ContactRoute({id}:{id:string}){
  const {crm}=useCrm();
  return crm.contacts.some(contact=>contact.id===id)?<CrmContactEditor key={id} id={id}/>:<ContactRecord id={id}/>;
}

function ContactRecord({id}:{id:string}){
  const {scope,data}=useWorkspace();
  const account=scope.accounts.find(a=>a.id===id);
  const [orderQuery,setOrderQuery]=useState("");
  const [orderStatus,setOrderStatus]=useState("all");
  const [activityQuery,setActivityQuery]=useState("");
  const [activityFrom,setActivityFrom]=useState("");
  const [activityThrough,setActivityThrough]=useState("");
  if(!account||!account.contactName)return <div><Heading title="Contact unavailable" description="This contact is missing or outside your authorized workspace." back="/crm/contacts"/><Empty>No accessible contact record.</Empty></div>;
  const assigned=data.users.find(u=>u.id===account.ownerId);
  const allOrders=scope.orders.filter(o=>!o.testOnly&&o.accountId===account.id);
  const orderStatuses=[...new Set(allOrders.map(o=>o.status))].sort();
  const orders=allOrders.filter(o=>(orderStatus==="all"||o.status===orderStatus)&&
    [o.number,o.status].join(" ").toLowerCase().includes(orderQuery.trim().toLowerCase()))
    .sort((a,b)=>b.placedAt.localeCompare(a.placedAt)||a.id.localeCompare(b.id));
  const activities=scope.activities.filter(a=>a.accountId===account.id)
    .filter(a=>(!activityFrom||a.at.slice(0,10)>=activityFrom)&&(!activityThrough||a.at.slice(0,10)<=activityThrough))
    .filter(a=>[a.title,a.detail].join(" ").toLowerCase().includes(activityQuery.trim().toLowerCase()))
    .sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
  return <div><Heading title={account.contactName} description="Contact and linked business location" back="/crm/contacts"/>
    <section className="prototype-panel"><h2>Contact information</h2>
      <dl className="prototype-facts">
        <div><dt>Role</dt><dd>{account.contactRole||"Not recorded"}</dd></div>
        <div><dt>Email</dt><dd>{account.email||"Not recorded"}</dd></div>
        <div><dt>Phone</dt><dd>{account.phone||"Not recorded"}</dd></div>
        <div><dt>Business</dt><dd><OpenLink to={"/sales/customers/"+encodeURIComponent(account.id)}>{account.name}</OpenLink></dd></div>
        <div><dt>Location</dt><dd>{account.location}</dd></div>
        <div><dt>Assigned representative</dt><dd>{assigned?.name||"Unassigned"}</dd></div>
        <div><dt>Stage</dt><dd>{account.stage}</dd></div>
        <div><dt>Next action</dt><dd>{account.nextActionDate||"Not scheduled"}</dd></div>
      </dl>
      <p className="prototype-note">This is the contact associated with location record {account.id}. A separate contact identity and editing workflow have not yet been approved.</p>
    </section>
    <section className="prototype-panel"><h2>Related sales orders</h2>
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contact orders" value={orderQuery} onChange={e=>setOrderQuery(e.target.value)} placeholder="Order number or status"/></label><label>Order status <select aria-label="Filter contact orders by status" value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}><option value="all">All statuses</option>{orderStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label></div>
      {orders.length?<div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Status</th><th>Cases</th></tr></thead><tbody>
        {orders.map(order=><tr key={order.id}><td><OpenLink to={"/sales/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></td><td>{order.placedAt.slice(0,10)}</td><td>{order.status}</td><td>{order.cases}</td></tr>)}
      </tbody></table></div>:<Empty>No related orders visible for this location.</Empty>}
    </section>
    <section className="prototype-panel"><h2>Recorded account activity</h2>
      <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search contact activity" value={activityQuery} onChange={e=>setActivityQuery(e.target.value)} placeholder="Activity title or details"/></label><label>From <input type="date" aria-label="Contact activity from date" value={activityFrom} max={activityThrough||undefined} onChange={e=>setActivityFrom(e.target.value)}/></label><label>Through <input type="date" aria-label="Contact activity through date" value={activityThrough} min={activityFrom||undefined} onChange={e=>setActivityThrough(e.target.value)}/></label><button type="button" onClick={()=>{setActivityQuery("");setActivityFrom("");setActivityThrough("");}}>Clear activity filters</button></div>
      {activities.length?activities.map(activity=><div className="prototype-activity" key={activity.id}><strong>{activity.title}</strong><span>{activity.at.slice(0,10)} • {activity.detail}</span></div>):<Empty>No recorded activities for this location.</Empty>}
      <p className="prototype-note">Activities are sourced from this authorized location only. No new contact identity or activity is created.</p>
    </section>
  </div>;
}

/** A separate customer-facing surface with account-scoped records, not staff-wide ledgers. */
function CustomerPortalContent({section}:{section:string}){
  const {scope,currentUser}=useWorkspace();const {commerce}=useCommerce();const runtime=useRuntimeMode();
  const [invoiceQuery,setInvoiceQuery]=useState("");
  const [invoiceStatus,setInvoiceStatus]=useState("all");
  const [invoiceSort,setInvoiceSort]=useState<"issued-desc"|"issued-asc"|"due-asc"|"balance-desc">("issued-desc");
  const [deliveryQuery,setDeliveryQuery]=useState("");const [deliveryStatus,setDeliveryStatus]=useState("all");
  const [deliveryAccount,setDeliveryAccount]=useState("all");const [deliveryFrom,setDeliveryFrom]=useState("");
  const [deliveryThrough,setDeliveryThrough]=useState("");const [deliverySort,setDeliverySort]=useState<"newest"|"oldest"|"order"|"cases">("newest");
  if(currentUser?.role!=="Customer") return <Empty>Customer access only.</Empty>;
  const current=scope.accounts[0];
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const orders=authorizedCustomerOrders(scope.orders,accountIds);
  if(section==="invoices"&&(!runtime.isDemo||momentumStorage.mode()!=="local"))return <div><Heading title="My Invoices" description="Account-specific invoice access requires verification."/><section className="prototype-panel"><p>This customer invoice screen is enabled in the isolated demo only. Connected invoices need an account-scoped server read before release.</p></section></div>;
  if(section==="invoices"){
    // Only source-matched, fulfilled customer orders may expose printable
    // invoice documents. Scope comes from the authenticated customer's
    // account IDs, not untrusted URL or request parameters.
    const fulfilled=new Map(orders.filter(o=>
      accountIds.has(o.accountId)&&["Delivered","Paid"].includes(o.status))
      .map(o=>[o.id,o]));
    const ids=commerce.invoices.filter(invoice=>{
      const order=fulfilled.get(invoice.orderId);
      return invoice.status!=="Void"&&Boolean(order&&order.accountId===invoice.accountId&&
        accountIds.has(invoice.accountId));
    }).map(invoice=>invoice.id);
    const register=commerce.invoices.filter(invoice=>ids.includes(invoice.id)).map(invoice=>({
      invoiceNumber:invoice.number,orderNumber:fulfilled.get(invoice.orderId)?.number??"",
      recordedAt:invoice.issuedAt,dueDate:invoice.dueDate,terms:invoice.terms,
      total:invoice.total,balance:invoiceBalance(commerce,invoice),
      status:computedInvoiceStatus(commerce,invoice),
    }));
    const visibleInvoices=commerce.invoices.filter(invoice=>ids.includes(invoice.id)).filter(invoice=>{
      const query=invoiceQuery.trim().toLocaleLowerCase();
      const status=computedInvoiceStatus(commerce,invoice);
      return (invoiceStatus==="all"||status===invoiceStatus)&&(!query||
        invoice.number.toLocaleLowerCase().includes(query)||
        (fulfilled.get(invoice.orderId)?.number??"").toLocaleLowerCase().includes(query));
    }).sort((a,b)=>{
      if(invoiceSort==="balance-desc")return invoiceBalance(commerce,b)-invoiceBalance(commerce,a)||a.number.localeCompare(b.number);
      const aDate=invoiceSort==="due-asc"?(a.dueDate??"9999-12-31"):a.issuedAt;
      const bDate=invoiceSort==="due-asc"?(b.dueDate??"9999-12-31"):b.issuedAt;
      return (invoiceSort==="issued-desc"?bDate.localeCompare(aDate):aDate.localeCompare(bDate))||a.number.localeCompare(b.number);
    });
    const visibleIds=visibleInvoices.map(invoice=>invoice.id);
    const visibleRegister=register.filter(row=>visibleInvoices.some(invoice=>invoice.number===row.invoiceNumber));
    const invoiceStatuses=[...new Set(commerce.invoices.filter(invoice=>ids.includes(invoice.id)).map(invoice=>computedInvoiceStatus(commerce,invoice)))].sort();
    return <div><Heading title="My Invoices" description="Recorded documents for delivered orders linked to your authorized business account."/>
      <section className="prototype-panel">
       <p className="prototype-note">Only invoices tied to your authorized customer locations and orders recorded Delivered or Paid are shown. A recorded invoice is not proof of a separately emailed invoice or settled payment.</p>
       <div className="prototype-controls"><label className="prototype-search"><Search size={16}/><input aria-label="Search my invoices" value={invoiceQuery} onChange={event=>setInvoiceQuery(event.target.value)} placeholder="Invoice or order number"/></label><label>Status <select aria-label="Filter invoice status" value={invoiceStatus} onChange={event=>setInvoiceStatus(event.target.value)}><option value="all">All statuses</option>{invoiceStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label><label>Sort <select aria-label="Sort my invoices" value={invoiceSort} onChange={event=>setInvoiceSort(event.target.value as "issued-desc"|"issued-asc"|"due-asc"|"balance-desc")}><option value="issued-desc">Newest issued</option><option value="issued-asc">Oldest issued</option><option value="due-asc">Due date</option><option value="balance-desc">Highest balance</option></select></label></div>
       <button type="button" disabled={!visibleRegister.length} onClick={()=>
         downloadCsv("momentum-my-invoices.csv",visibleRegister,
          ["invoiceNumber","orderNumber","recordedAt","dueDate","terms","total","balance","status"])}>
          Download my invoice register (CSV)
       </button>
       <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Invoice</th><th>Order</th><th>Issued</th><th>Due</th><th>Status</th><th>Balance</th></tr></thead><tbody>{visibleInvoices.map(invoice=><tr key={invoice.id}><td><OpenLink to={"/portal/invoices/"+encodeURIComponent(invoice.id)}>{invoice.number}</OpenLink></td><td><OpenLink to={"/portal/orders/"+encodeURIComponent(invoice.orderId)}>{fulfilled.get(invoice.orderId)?.number??"Order"}</OpenLink></td><td>{invoice.issuedAt.slice(0,10)}</td><td>{invoice.dueDate?.slice(0,10)??"Not recorded"}</td><td>{computedInvoiceStatus(commerce,invoice)}</td><td>{invoiceBalance(commerce,invoice).toFixed(2)}</td></tr>)}</tbody></table></div>
       <InvoicePrintCenter allowedInvoiceIds={visibleIds} allowedOrderIds={[...new Set(visibleInvoices.map(invoice=>invoice.orderId))]}
         title="My printable invoices" description="Open an invoice or print one or all authorized documents. Your browser also supports Save as PDF."/>
       {!ids.length&&<Empty>No customer invoices currently meet the delivery and account verification criteria.</Empty>}
       {ids.length&&!visibleIds.length&&<Empty>No invoices match the selected search or status filter.</Empty>}
      </section></div>;
  }
  if(section==="products"){
    return <div><Heading title="Products" description="Browse the Golden Eagle wholesale catalog."/>
      <section className="prototype-panel"><div className="prototype-product-grid">{GOLDEN_EAGLE_SKUS.filter(s=>s.active).map(item=>
        <div key={item.id} className="prototype-product-card"><strong>{item.shortName}</strong><p>{item.description}</p><small>{item.casePack} cans per case</small></div>)}</div>
      <p className="prototype-note">A verified customer price book, availability check and live checkout will be connected before ordering from this catalog is enabled. To create an order, use My Orders.</p>
      <OpenLink to="/portal/orders">My Orders</OpenLink></section></div>;
  }
  if(section==="account"){
    return <div><Heading title="My Account" description="Details available to your authenticated customer identity."/>
      <section className="prototype-panel"><h2>Account information</h2>{current?
      <dl className="prototype-facts"><div><dt>Business name</dt><dd>{current.name}</dd></div><div><dt>Contact name</dt><dd>{current.contactName||"Not recorded"}</dd></div>
      <div><dt>Contact email</dt><dd>{current.email||"Not recorded"}</dd></div><div><dt>Phone</dt><dd>{current.phone||"Not recorded"}</dd></div>
      <div><dt>Location</dt><dd>{current.streetAddress??""} {current.location}</dd></div></dl>:<Empty>No authorized business account is linked.</Empty>}
      <p className="prototype-note">Any future self-service edits must verify account ownership and protect tax, payment terms and legal identity fields.</p></section></div>;
  }
  if(section==="deliveries"){
    const filtered=filterCustomerDeliveries(orders,{query:deliveryQuery,status:deliveryStatus,accountId:deliveryAccount,fromDate:deliveryFrom,throughDate:deliveryThrough,sort:deliverySort});
    const statuses=[...new Set(orders.map(o=>o.status))].sort();
    return <div><Heading title="My Deliveries" description="Account-scoped fulfillment history, with downloadable registers and individual order details."/>
      <section className="prototype-panel">
        <div className="prototype-controls">
          <label className="prototype-search"><Search size={16}/><input aria-label="Search my deliveries" value={deliveryQuery} onChange={e=>setDeliveryQuery(e.target.value)} placeholder="Order number or status"/></label>
          <label>Fulfillment <select aria-label="Filter my delivery status" value={deliveryStatus} onChange={e=>setDeliveryStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <label>Location <select aria-label="Filter my delivery location" value={deliveryAccount} onChange={e=>setDeliveryAccount(e.target.value)}><option value="all">All my locations</option>{scope.accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}</option>)}</select></label>
          <label>From <input aria-label="Deliveries from date" type="date" value={deliveryFrom} max={deliveryThrough||undefined} onChange={e=>setDeliveryFrom(e.target.value)}/></label>
          <label>Through <input aria-label="Deliveries through date" type="date" value={deliveryThrough} min={deliveryFrom||undefined} onChange={e=>setDeliveryThrough(e.target.value)}/></label>
          <label>Sort <select aria-label="Sort my deliveries" value={deliverySort} onChange={e=>setDeliverySort(e.target.value as "newest"|"oldest"|"order"|"cases")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="order">Order number</option><option value="cases">Most cases</option></select></label>
          <button type="button" onClick={()=>{setDeliveryQuery("");setDeliveryStatus("all");setDeliveryAccount("all");setDeliveryFrom("");setDeliveryThrough("");setDeliverySort("newest");}}>Clear filters</button>
          <button type="button" disabled={!filtered.length} onClick={()=>downloadCsv("momentum-my-deliveries.csv",customerDeliveryExportRows(filtered),customerDeliveryColumns)}>Download filtered deliveries CSV</button>
        </div>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Placed</th><th>Fulfillment</th><th>Cases</th><th>Payment state</th></tr></thead><tbody>{filtered.map(o=>
          <tr key={o.id}><td><OpenLink to={"/portal/deliveries/"+encodeURIComponent(o.id)}>{o.number}</OpenLink></td><td>{o.placedAt.slice(0,10)}</td><td>{o.status}</td><td>{o.cases}</td><td>{o.paymentStatus}</td></tr>)}</tbody></table></div>
        {!filtered.length&&<Empty>No matching deliveries for your authorized accounts.</Empty>}
        <p className="prototype-note">These are recorded order states, not verified driver GPS, ETA, proof of delivery, or cleared funds. Downloads contain only accessible account orders.</p>
      </section></div>;
  }
  if(section==="payments"||section==="statements"){
    if(!runtime.isDemo||momentumStorage.mode()!=="local")return <div><Heading title={section==="payments"?"My Payments":"Account Statements"} description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel"><Empty>Authenticated server-scoped financial records are not available yet. No payment or balance information is shown.</Empty></section></div>;
    const locationNames=new Map(scope.accounts.map(a=>[a.id,a.name]));
    const finance=projectCustomerFinance(commerce,orders,accountIds,locationNames);
    if(section==="payments")return <div><Heading title="My Payments" description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel">
      <div className="prototype-controls"><button type="button" disabled={!finance.payments.length} onClick={()=>downloadCsv("momentum-my-payments.csv",finance.payments,customerPaymentColumns)}>Download payments CSV</button></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>Reference</th><th>Method</th><th>Status</th><th>Amount</th></tr></thead><tbody>{finance.payments.map((p,i)=><tr key={p.reference+"-"+i}><td>{p.date}</td><td>{p.location}</td><td>{p.reference}</td><td>{p.method}</td><td>{p.status}</td><td>{p.amount.toFixed(2)}</td></tr>)}</tbody></table></div>
      {!finance.payments.length&&<Empty>No cleared, allocated payments for your delivered orders.</Empty>}
      <p className="prototype-note">Local demonstration only. Payment requests and checkout remain disabled.</p>
    </section></div>;
    return <div><Heading title="Account Statements" description="Customer account financial records. Verified account access is required for connected data."/><section className="prototype-panel">
      <div className="prototype-controls"><button type="button" disabled={!finance.statement.length} onClick={()=>downloadCsv("momentum-my-statement.csv",finance.statement,customerStatementColumns)}>Download statement CSV</button></div>
      <div className="prototype-metrics"><div><small>Recorded open invoice balance</small><strong>{finance.openBalance.toFixed(2)}</strong></div></div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Date</th><th>Location</th><th>Reference</th><th>Type</th><th>Status</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{finance.statement.map((row,i)=><tr key={row.reference+"-"+row.type+"-"+i}><td>{row.date}</td><td>{row.location}</td><td>{row.reference}</td><td>{row.type}</td><td>{row.status}</td><td>{row.debit.toFixed(2)}</td><td>{row.credit.toFixed(2)}</td></tr>)}</tbody></table></div>
      {!finance.statement.length&&<Empty>No qualifying issued invoices or reconciled activity for your delivered orders.</Empty>}
      <p className="prototype-note">Local demonstration only. This register is not a bank statement or verified production settlement.</p>
    </section></div>;
  }
  const descriptions:Record<string,{title:string,body:string}>={
    invoices:{title:"My Invoices",body:"Invoice balances and PDFs will be sourced from issued, delivery-verified invoices. The review prototype does not invent financial balances."},
    payments:{title:"Payments",body:"Hosted invoice payment links and secure customer-portal payments will appear after payment-provider approval, webhook verification and reconciliation. No payment processor is active in this view."},
    statements:{title:"Account Statements",body:"Statements will combine issued invoices, cleared payments, credits and refunds from the accounting ledger. No statement is fabricated from sales orders."},
    documents:{title:"My Documents",body:"Signed documents, verified tax forms and shared account files will be shown only to authorized customer contacts after document access policy is finished."},
  };
  const v=descriptions[section];
  if(!v)return <Empty>Customer portal page not found.</Empty>;
  return <div><Heading title={v.title} description="Customer self-service • prototype"/><section className="prototype-panel"><h2>{v.title}</h2><Empty>{v.body}</Empty></section></div>;
}

/** Customer invoice detail is deliberately demo-only until server-scoped invoice reads exist. */
function CustomerInvoiceRecord({id}:{id:string}){
  const {scope,currentUser}=useWorkspace();
  const {commerce}=useCommerce();
  const runtime=useRuntimeMode();
  if(currentUser?.role!=="Customer")return <Empty>Customer access only.</Empty>;
  if(!runtime.isDemo||momentumStorage.mode()!=="local")return <Empty>Customer invoice details require an authenticated account-scoped server read. No connected financial records are exposed.</Empty>;
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const orders=authorizedCustomerOrders(scope.orders,accountIds);
  const invoice=commerce.invoices.find(i=>i.id===id&&i.status!=="Void"&&accountIds.has(i.accountId));
  const order=invoice&&orders.find(o=>o.id===invoice.orderId&&o.accountId===invoice.accountId&&["Delivered","Paid"].includes(o.status));
  if(!invoice||!order)return <Empty>Invoice not found or not authorized for your business account.</Empty>;
  const balance=invoiceBalance(commerce,invoice);
  return <div><Heading title={"Invoice "+invoice.number} description="Issued invoice for an authorized delivered order" back="/portal/invoices"/>
    <div className="prototype-metrics"><div><small>Invoice state</small><strong>{computedInvoiceStatus(commerce,invoice)}</strong></div><div><small>Recorded total</small><strong>{invoice.total.toFixed(2)}</strong></div><div><small>Recorded balance</small><strong>{balance.toFixed(2)}</strong></div></div>
    <section className="prototype-panel"><h2>Invoice information</h2><dl className="prototype-facts">
      <div><dt>Issued</dt><dd>{invoice.issuedAt.slice(0,10)}</dd></div>
      <div><dt>Due</dt><dd>{invoice.dueDate?.slice(0,10)??"Not recorded"}</dd></div>
      <div><dt>Terms</dt><dd>{invoice.terms||"Not recorded"}</dd></div>
      <div><dt>Order</dt><dd><OpenLink to={"/portal/orders/"+encodeURIComponent(order.id)}>{order.number}</OpenLink></dd></div>
    </dl><InvoicePrintCenter allowedInvoiceIds={[invoice.id]} allowedOrderIds={[order.id]} title="Invoice document" description="Print or save the authorized invoice as PDF."/>
    <p className="prototype-note">Local demonstration only. An issued invoice and its recorded balance do not prove payment settlement. Online payment is not enabled.</p></section>
  </div>;
}

/** Customer-only detail: no staff approvals, audit history or private rep fields. */
function CustomerOrderRecord({id,section}:{id:string;section:"orders"|"deliveries"}){
  const {scope,currentUser}=useWorkspace();
  if(currentUser?.role!=="Customer")return <Empty>Customer access only.</Empty>;
  const accountIds=new Set(scope.accounts.map(a=>a.id));
  const order=authorizedCustomerOrder(scope.orders,accountIds,id);
  if(!order)return <Empty>Order not found or not authorized for your business account.</Empty>;
  const account=scope.accounts.find(a=>a.id===order.accountId);
  const lines=order.lines??(order.product?[{id:order.id,product:order.product,cases:order.cases}]:[]);
  return <div><Heading title={"Order "+order.number} description="My account order and delivery status" back={section==="orders"?"/portal/orders":"/portal/deliveries"}/>
    <div className="prototype-metrics"><div><small>Fulfillment</small><strong>{order.status}</strong></div><div><small>Cases</small><strong>{order.cases}</strong></div><div><small>Payment state</small><strong>{order.paymentStatus}</strong></div></div>
    <section className="prototype-panel"><h2>Order information</h2><dl className="prototype-facts">
      <div><dt>Business location</dt><dd>{account?.name??"Authorized account"} · {account?.location??""}</dd></div>
      <div><dt>Placed</dt><dd>{order.placedAt.slice(0,10)}</dd></div>
      <div><dt>Current order status</dt><dd>{order.status}</dd></div>
      <div><dt>Payment state</dt><dd>{order.paymentStatus}</dd></div>
    </dl>
    <OpenLink to="/portal/invoices">View invoices for my account</OpenLink>
        <button type="button" onClick={()=>downloadCsv("momentum-my-delivery-"+order.number+".csv",customerDeliveryExportRows([order]),customerDeliveryColumns)}>Download this order status (CSV)</button>
    <p className="prototype-note">Recorded order status is not live GPS, an estimated arrival, a signed proof of delivery, or payment settlement evidence.</p></section>
    <section className="prototype-panel"><h2>Ordered products</h2><div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Product</th><th>Cases</th></tr></thead><tbody>{lines.map(line=><tr key={line.id}><td>{line.product}</td><td>{line.cases}</td></tr>)}</tbody></table></div>
    {!lines.length&&<Empty>No verified product breakdown is available for this order.</Empty>}</section>
  </div>;
}

function TerritoryMapPreview(){
  return <div><Heading title="Territories & Map" description="Existing ZIP assignments and geographic controls retained."/>
    <section className="prototype-panel"><h2>Territory management</h2><TerritoryPanel/>
    <p className="prototype-note">Map overlay, geocoded ZIP boundaries and routing require verified mapping data/provider. Do not mistake a ZIP listing for a plotted geographic boundary.</p>
    <OpenLink to="/crm/account-map">Account map</OpenLink></section></div>;
}

export function PrototypeOperationsHub(){
  const path=useNavigationRoute();const {currentUser}=useWorkspace();
  const runtime=useRuntimeMode();const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local";
  if(!canVisitRoute(currentUser,path))return <Empty>You do not have permission to view this module.</Empty>;
  const segments=path.split("/").filter(Boolean);
  if(path==="/")return <WorkspaceHome/>;
  if(segments[0]==="portal"&&segments[1]==="invoices"&&segments.length===3)return <CustomerInvoiceRecord id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="portal"&&["orders","deliveries"].includes(segments[1])&&segments.length===3)return <CustomerOrderRecord id={decodeURIComponent(segments[2])} section={segments[1] as "orders"|"deliveries"}/>;
  if(segments[0]==="portal"&&segments[1])return <CustomerPortalContent section={segments[1]}/>;
  if(path==="/people")return <PeopleExperience/>;
  if(path==="/marketing")return <MarketingWorkspaceExperience/>;
  if(path==="/marketing/workflow")return currentUser?.role==="Administrator"&&writeEnabled?<LegacyMarketingPage/>:<Empty>Marketing write administration is available in isolated local demo only. The redesign provides source-linked read and export access.</Empty>;
  if(path==="/people/payroll")return <PayrollWorkflowExperience/>;
  if(path==="/people/payroll/workflow")return writeEnabled?<LegacyPayrollPage/>:<Empty>Read-only redesign prototype. Payroll processing is available only in isolated local demo mode until production controls are approved.</Empty>;
  if(path==="/people/onboarding/workflow")return writeEnabled?<NewHireProvisioning view="queue"/>:<Empty>Read-only redesign prototype. Full onboarding administration is available only in isolated local demo mode until authorized release.</Empty>;
  if(path==="/people/new-hire")return <HrNewHireExperience/>;
  if(path==="/people/onboarding")return <HrOnboardingExperience/>;
  if(path==="/people/leave")return <HrTimeOffExperience/>;
  if(path==="/admin/accounts")return <AccountConsolidationReview/>;
  if(path==="/admin/employee-profiles")return <HrPersonnelDirectory/>;
  if(path==="/admin/employee-profiles/workflow")return writeEnabled?<div><Heading title="Secure personnel editor" description="Existing audited editing controls retained during redesign." back="/admin/employee-profiles"/><AdminEmployeeProfiles/></div>:<Empty>Read-only redesign prototype. Personnel editing is disabled against connected records.</Empty>;
  if(segments[0]==="admin"&&segments[1]==="employee-profiles"&&segments[2])return <HrPersonnelRecord id={decodeURIComponent(segments[2])} section={segments[3]}/>
  if(path==="/admin/employees")return <div><Heading title="Employee Directory" description="Administrator view of active staff."/><EmployeeDirectory/></div>;
  if(path==="/crm/territory-map")return <TerritoryMapPreview/>;
  if(path==="/crm/account-health")return <CrmAccountHealth/>;
  if(path==="/crm/account-setup")return <CrmAccountSetup/>;
  if(path==="/crm/account-map")return <CrmAccountMap/>;
  if(path==="/crm/quick-visit")return <CrmQuickVisit/>;
  if(segments[0]==="sales"&&segments[1]==="customers"&&segments[2])return <CustomerRecord id={decodeURIComponent(segments[2])} section={segments[3]??"overview"}/>;
  if(segments[0]==="items"&&segments[1])return <ProductRecord skuId={decodeURIComponent(segments[1])} section={segments[2]??"overview"}/>;
  if(path==="/work/approvals")return <OrderApprovalDirectory/>;
  if(path==="/work/actions")return <ActionCenterExperience/>;
  if(path==="/work/exceptions")return <WorkExceptionsExperience/>;
  if(path==="/work/completed")return <CompletedWorkExperience/>;
  if(path==="/sales/orders/new")return <OrderEditor/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2]&&segments[3]==="edit")return <OrderEditor orderId={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="orders"&&segments[2])return currentUser?.role==="Customer"?<CustomerOrderRecord id={decodeURIComponent(segments[2])} section="orders"/>:<OrderDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="invoices"&&segments[2])return <InvoiceDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="payments"&&segments[2])return <PaymentDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="inventory"&&segments[1]==="lots"&&segments[2])return <InventoryLotDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="inventory"&&segments[1]==="shipments"&&segments[2])return <ShipmentDetail orderId={decodeURIComponent(segments[2])}/>;
  if(path==="/inventory/packages")return <PackagesDirectory/>;
  if(path==="/inventory/shipments")return <ShipmentsDirectory/>;
  if(path==="/operations/deliveries")return <DeliveryOperationsDirectory/>;
  if(path==="/inventory")return <InventoryDirectory/>;
  if(path==="/inventory/ledger")return <InventoryLedgerDirectory/>;
  if(path==="/inventory/adjustments")return <InventoryAdjustmentDirectory/>;
  if(segments[0]==="sales"&&segments[1]==="returns"&&segments[2])return <SalesReturnDetail id={decodeURIComponent(segments[2])}/>;
  if(segments[0]==="sales"&&segments[1]==="credit-notes"&&segments[2])return <CreditNoteDetail id={decodeURIComponent(segments[2])}/>;
  if(path==="/sales/returns")return <SalesReturnsDirectory/>;
  if(path==="/sales/credit-notes")return <CreditNotesDirectory/>;
  if(path==="/sales/orders")return <OrdersDirectory/>;
  if(path==="/sales/invoices")return <InvoiceDirectory/>;
  if(path==="/sales/payments")return <PaymentsDirectory/>;
  if(path==="/items")return <ProductDirectory/>;
  if(path==="/sales/customers")return <AccountsDirectory/>;
  if(segments[0]==="crm"&&segments[1]==="leads"&&segments[2])return <LeadRecord id={decodeURIComponent(segments[2])}/>;
  if(path==="/crm/leads")return <AccountsDirectory leadMode/>;
  if(path==="/crm/deals/new")return <DealEditor/>;
  if(segments[0]==="crm"&&segments[1]==="deals"&&segments[2])return <DealEditor id={decodeURIComponent(segments[2])}/>;
  if(path==="/crm/deals")return <DealsDirectory/>;
  if(path==="/crm/contacts/new")return <CrmContactEditor/>;
  if(segments[0]==="crm"&&segments[1]==="contacts"&&segments[2]){
    const id=decodeURIComponent(segments[2]);
    return <ContactRoute id={id}/>;
  }
  if(path==="/crm/contacts")return <CrmContactsDirectory/>;
  if(path==="/calendar"||path==="/calendar/meetings")return <CalendarPreview meetingsOnly={path.endsWith("/meetings")}/>;
  if(path==="/crm/incentives")return <IncentivePreview/>;
  if(path==="/crm/commission-only")return <CrmCommissionOnlyReview/>;
  const item=routeEntry(path);
  return <div><Heading title={routeLabel(path)} description="Planned module • navigation prototype only"/><section className="prototype-panel">
    <h2>{item?.label??"Module"} workflow</h2>
    <p>This section is mapped in the navigation but has not been implemented as a live workflow. It will be connected to the existing Momentum record and permission model after operations sign-off.</p>
    <p className="prototype-note">No orders, payments, emails, payroll records or inventory are created from this screen.</p>
  </section></div>;
}
