"use client";

/**
 * Role-aware, source-backed landing workspace.
 * These are operational summaries, NOT accounting KPIs, revenue recognition,
 * incentive eligibility, or consumer sell-through measures.
 */
import {useState} from "react";
import {Activity,ArrowRight,Boxes,CalendarDays,ClipboardCheck,PackageCheck,ShoppingCart,TrendingUp} from "lucide-react";
import {buildActionNotices,type ActionNotice} from "../../lib/action-center-policy-v2";
import {canAccessPage} from "../../lib/access";
import {addCalendarDays,arizonaDateKey} from "../../lib/date-time";
import {eligibleHomeOrders,orderedCasesByChannel,orderedCasesByProduct,warehouseCasesByProduct,visibleReceiptMovements,recordedBusinessDay} from "../../lib/workspace-home-metrics";
import {useAccounting} from "../../lib/accounting-context";
import {useDelivery} from "../../lib/delivery-context";
import {useFinance} from "../../lib/finance-context";
import {useHcm} from "../../lib/hcm-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {useMarketing} from "../../lib/marketing-context";
import {usePerformance} from "../../lib/performance-context";
import {skuForProductName} from "../../lib/product-catalog";
import {canVisitRoute} from "../../lib/navigation-route-registry";
import {navigateToRoute} from "../../lib/navigation-store";
import {useWorkspace} from "../../lib/workspace-context";
import {MeetingHomePanel} from "./workspace-meetings-experience";
import type {WorkspaceUser} from "../../lib/types";

type HomeTab="overview"|"getting-started"|"updates";
type Period="month"|"30d";
const num=(n:number)=>new Intl.NumberFormat("en-US").format(n);
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const safeDay=recordedBusinessDay;
const limit=(str:string,max=70)=>str.length>max?str.slice(0,max-1)+"…":str;

function Nav({to,children,subtle=false}:{to:string;children:React.ReactNode;subtle?:boolean}){
  return <button type="button" className={subtle?"momentum-home-link":"momentum-home-action"}
    onClick={()=>navigateToRoute(to)}>{children}<ArrowRight size={14}/></button>;
}
function Empty({children}:{children:React.ReactNode}){
  return <div className="momentum-home-empty">{children}</div>;
}
function Panel({title,description,children,to,className="",icon:Icon}:{title:string;description?:string;children:React.ReactNode;to?:string;className?:string;icon?:typeof Activity}){
  return <section className={"momentum-home-panel "+className}>
    <header className="momentum-home-panel-head"><div>{Icon&&<Icon size={17}/>}<h2>{title}</h2></div>{to&&<Nav to={to} subtle>View all</Nav>}</header>
    {description&&<p className="momentum-home-panel-context">{description}</p>}
    {children}
  </section>;
}
function MiniRow({name,detail,value,to}:{name:string;detail?:string;value?:string|number;to?:string}){
  return <div className="momentum-home-minirow">
    <div><strong>{limit(name)}</strong>{detail&&<small>{detail}</small>}</div>
    <div>{value!==undefined&&<span className="momentum-home-mini-value">{value}</span>}
      {to&&<Nav to={to} subtle>Open</Nav>}</div>
  </div>;
}
function BarRow({name,value,max,detail}:{name:string;value:number;max:number;detail?:string}){
  return <div className="momentum-home-barrow"><div><strong>{name}</strong><span>{num(value)} cases</span></div>
    <div className="momentum-home-bar-track" role="img" aria-label={name+": "+num(value)+" cases"}><i style={{width:(max>0?Math.max(0,Math.min(100,value/max*100)):0)+"%"}}/></div>
    {detail&&<small>{detail}</small>}
  </div>;
}

function CustomerLanding({user}:{user:WorkspaceUser}){
  const {scope}=useWorkspace();
  const orders=scope.orders.filter(o=>!o.testOnly);
  const latest=[...orders].sort((a,b)=>b.placedAt.localeCompare(a.placedAt)).slice(0,5);
  return <div className="momentum-home">
    <header className="momentum-home-hero"><span className="momentum-home-eyebrow">MOMENTUM CUSTOMER PORTAL</span><h1>Welcome back, {user.firstName}</h1><p>Review your own orders and account records. Payment settlement and order placement remain controlled by the customer portal.</p>
      <div className="momentum-home-shortcuts">{[["My orders","/portal/orders"],["Invoices","/portal/invoices"],["My account","/portal/account"]].map(([label,to])=><Nav key={to} to={to}>{label}</Nav>)}</div>
    </header>
    <div className="momentum-home-metrics"><div><small>Accessible account locations</small><strong>{scope.accounts.length}</strong></div><div><small>Recorded orders</small><strong>{orders.length}</strong></div></div>
    <Panel title="Recent orders" icon={ShoppingCart} to="/portal/orders" description="Your recorded order history, not confirmed fulfillment or payment settlement">
      {latest.map(o=><MiniRow key={o.id} name={o.number} detail={safeDay(o.placedAt)??"Date unrecorded"} value={o.status} to="/portal/orders"/>)}
      {!latest.length&&<Empty>No recorded orders yet.</Empty>}
    </Panel>
  </div>;
}
export function WorkspaceHome(){
  const {data,scope,currentUser}=useWorkspace();
  const {hcm}=useHcm();
  const {performance}=usePerformance();
  const {state:delivery}=useDelivery();
  const {finance}=useFinance();
  const {state:marketing}=useMarketing();
  const {accounting,events}=useAccounting();
  const {ledger}=useInventoryLedger();
  const [tab,setTab]=useState<HomeTab>("overview");
  const [period,setPeriod]=useState<Period>("month");
  if(!currentUser)return <Empty>Sign in to view the workspace.</Empty>;
  if(currentUser.role==="Customer")return <CustomerLanding user={currentUser}/>;
  const today=arizonaDateKey();
  const start=period==="month"?today.slice(0,7)+"-01":addCalendarDays(today,-29);
  const orderAccess=canAccessPage(currentUser,"orders");
  const inventoryAccess=canAccessPage(currentUser,"inventory");
  const accountAccess=canAccessPage(currentUser,"accounts");
  const orders=orderAccess?eligibleHomeOrders(scope.orders,start,today):[];
  const accounts=new Map(scope.accounts.map(a=>[a.id,a]));
  const actions=buildActionNotices({data,scope,currentUser,hcm,performance,finance,marketing,accounting,accountingEvents:events,ledger,delivery});
  const actionable=actions.filter(a=>a.page).slice(0,7);
  const activityRows=[...scope.activities].filter(a=>safeDay(a.at)).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,7);
  const items=orderedCasesByProduct(orders).slice(0,5);
  const channels=orderedCasesByChannel(orders,scope.accounts).slice(0,6);
  const maxChannel=Math.max(0,...channels.map(x=>x[1]));
  const allStocks=inventoryAccess?warehouseCasesByProduct(ledger,scope.inventory):[];
  const stocks=allStocks.slice(0,5);
  const stockTotal=allStocks.reduce((sum,[,casesCount])=>sum+casesCount,0);
  const receipts=inventoryAccess?visibleReceiptMovements(ledger,scope.inventory,start,today).slice(0,6):[];
  const statusCounts=new Map<string,number>();
  for(const order of orders)statusCounts.set(order.status,(statusCounts.get(order.status)??0)+1);
  const statuses=[...statusCounts].sort((a,b)=>b[1]-a[1]);
  const portalLinks:[string,string][]=[["Action Center","/work/actions"],["Calendar","/calendar"],["Meeting invitations","/calendar/invitations"]];
  if(orderAccess)portalLinks.unshift(["Sales Orders","/sales/orders"]);
  if(accountAccess)portalLinks.push(["Customers","/sales/customers"]);
  if(inventoryAccess)portalLinks.push(["Inventory","/inventory"]);
  if(canVisitRoute(currentUser,"/people"))portalLinks.push(["People","/people"]);
  if(canVisitRoute(currentUser,"/marketing"))portalLinks.push(["Marketing","/marketing"]);
  const openAction=(item:ActionNotice)=>{
    if(!item.page)return;
    const path=item.category==="Timecards"?"/people/attendance":item.category==="Approvals"?"/work/approvals":item.page==="orders"&&item.focus&&scope.orders.some(o=>o.id===item.focus)?"/sales/orders/"+encodeURIComponent(item.focus):item.page==="accounts"&&item.focus&&scope.accounts.some(a=>a.id===item.focus)?"/sales/customers/"+encodeURIComponent(item.focus):"/work/actions";
    if(typeof window!=="undefined"){
      if(item.focus)window.sessionStorage.setItem("momentum-focus-record",item.focus);
      if(item.peopleTab)window.sessionStorage.setItem("momentum-people-tab",item.peopleTab);
    }
    navigateToRoute(path);
  };
  return <div className="momentum-home">
    <header className="momentum-home-hero">
      <span className="momentum-home-eyebrow">MOMENTUM OPERATIONS · PERSONAL WORKSPACE</span>
      <h1>Welcome back, {currentUser.firstName}</h1>
      <p>{currentUser.role} · Your assigned data and operational work at a glance. All figures are drawn from existing workspace records.</p>
      <div className="momentum-home-shortcuts">{portalLinks.filter(([,path])=>canVisitRoute(currentUser,path)).slice(0,6).map(([label,path])=><Nav key={path} to={path}>{label}</Nav>)}</div>
    </header>
    <nav className="momentum-home-tabs" aria-label="Home sections">
      {([["overview","Overview"],["getting-started","Quick access"],["updates","Recent updates"]] as const).map(([key,label])=>
        <button type="button" key={key} className={tab===key?"is-current":""} aria-current={tab===key?"page":undefined} onClick={()=>setTab(key)}>{label}</button>)}
    </nav>
    {tab==="getting-started"&&<section className="momentum-home-panel"><h2>Open your tools</h2>
      <p className="momentum-home-panel-context">Jump directly to a record-based workflow. Access depends on your assigned role.</p>
      <div className="momentum-home-access-grid">{portalLinks.filter(([,path])=>canVisitRoute(currentUser,path)).map(([label,path])=>
        <button type="button" key={path} onClick={()=>navigateToRoute(path)}><strong>{label}</strong><ArrowRight size={16}/></button>)}</div>
    </section>}
    {tab==="updates"&&<Panel title="Recent recorded activity" description="Most recent visible account activity. The timestamp comes from each original record." icon={Activity}>
      {activityRows.map(a=><MiniRow key={a.id} name={a.title} detail={(safeDay(a.at)??"Date missing")+" · "+(accounts.get(a.accountId??"")?.name??"Workspace record")} value={a.type}
        to={a.accountId&&accounts.has(a.accountId)?"/sales/customers/"+encodeURIComponent(a.accountId):undefined}/>)}
      {!activityRows.length&&<Empty>There are no visible activity records yet.</Empty>}
    </Panel>}
    {tab==="overview"&&<>
      <div className="momentum-home-controls"><div><strong>Operational overview</strong><small>Based on accessible records, not a financial close</small></div>
        <label>Reporting window<select aria-label="Home reporting window" value={period} onChange={e=>setPeriod(e.target.value as Period)}>
          <option value="month">This calendar month (AZ)</option><option value="30d">Last 30 days (AZ)</option></select></label></div>
      <div className="momentum-home-metrics">
        <div><ShoppingCart size={17}/><small>Recorded non-cancelled orders</small><strong>{orderAccess?num(orders.length):"Restricted"}</strong></div>
        <div><TrendingUp size={17}/><small>Cases ordered, not sold through</small><strong>{orderAccess?num(orders.reduce((sum,o)=>sum+o.cases,0)):"Restricted"}</strong></div>
        <div><ClipboardCheck size={17}/><small>Open action notices</small><strong>{num(actions.length)}</strong></div>
        {inventoryAccess&&<div><Boxes size={17}/><small>Warehouse cases available</small><strong>{num(stockTotal)}</strong></div>}
      </div>
      <div className="momentum-home-grid">
        <MeetingHomePanel/>
        {orderAccess&&<Panel title="Most ordered items" description="Case quantities on non-cancelled, non-draft orders placed within the selected period. Not consumer sell-through." className="momentum-home-panel--sales" to="/items" icon={ShoppingCart}>
          {items.map(([product,cases])=><MiniRow key={product} name={product} value={num(cases)+" cases"}
            to={skuForProductName(product)?"/items/"+encodeURIComponent(skuForProductName(product)!.id):undefined}/>)}
          {!items.length&&<Empty>No eligible order lines were recorded in this period.</Empty>}
        </Panel>}
        <Panel title="Pending actions" description="Open tasks and approvals from the existing action policy, irrespective of notification read status." className="momentum-home-panel--actions" to="/work/actions" icon={ClipboardCheck}>
          {actionable.map(a=><button className="momentum-home-actionrow" type="button" key={a.id} onClick={()=>openAction(a)}>
            <span><strong>{limit(a.title)}</strong><small>{a.category}</small></span><em>{a.urgency}</em><ArrowRight size={15}/>
          </button>)}
          {!actionable.length&&<Empty>No linked open actions in your current workspace.</Empty>}
        </Panel>
        {inventoryAccess&&<Panel title="Available warehouse stock" description="Sellable cases by product, from recorded custody balances minus active reservations. Quality holds excluded." className="momentum-home-panel--stock" to="/inventory" icon={Boxes}>
          {stocks.map(([name,available])=><MiniRow key={name} name={name} value={num(available)+" cases"}/>)}
          {!stocks.length&&<Empty>No inventory lots are visible for this account.</Empty>}
        </Panel>}
        {orderAccess&&<Panel title="Ordered cases by channel" description="Case totals on eligible orders grouped by the linked account's recorded sales channel." className="momentum-home-panel--channels" icon={TrendingUp}>
          {channels.map(([name,cases])=><BarRow key={name} name={name} value={cases} max={maxChannel}/>)}
          {!channels.length&&<Empty>No linked channel activity in the selected period.</Empty>}
        </Panel>}
        {orderAccess&&<Panel title="Sales order summary" description="Count of eligible order records by current workflow status; not invoiced or collected revenue." className="momentum-home-panel--summary" to="/sales/orders" icon={ShoppingCart}>
          <div className="momentum-home-order-summary">{statuses.map(([status,count])=>
            <div key={status}><strong>{num(count)}</strong><span>{status}</span></div>)}</div>
          {!statuses.length&&<Empty>No recorded orders in the selected period.</Empty>}
          {orders.length>0&&<p className="momentum-home-panel-context">Total recorded order value: {money(orders.reduce((sum,o)=>sum+o.amount,0))}. This is not cash received.</p>}
        </Panel>}
        {inventoryAccess&&<Panel title="Recent warehouse receipts" description="Recorded inventory receipt movements, not confirmed supplier invoices or paid purchases." className="momentum-home-panel--receipts" to="/inventory/ledger" icon={PackageCheck}>
          {receipts.map(m=><MiniRow key={m.id} name={m.product} detail={(safeDay(m.at)??"Date missing")+" · "+m.reason} value={num(m.quantity)+" cases"}/>)}
          {!receipts.length&&<Empty>No receipt movements were recorded in this period.</Empty>}
        </Panel>}
        <Panel title="Recent activity" description="Visible account activities, with their recorded dates." className="momentum-home-panel--updates" icon={CalendarDays}>
          {activityRows.slice(0,5).map(a=><MiniRow key={a.id} name={a.title} detail={(safeDay(a.at)??"Date missing")+" · "+(accounts.get(a.accountId??"")?.name??"Workspace record")} value={a.type}/>)}
          {!activityRows.length&&<Empty>No recent activity records are visible.</Empty>}
        </Panel>
      </div>
      <p className="momentum-home-source-note">Source definitions: order totals exclude test, cancelled and draft records; case totals are order-entry quantities only; warehouse availability uses custody movements and active reservations; open work comes from the existing action policy. Data scope follows your signed-in role. No supplier-spend or consumer-sale figures are inferred.</p>
    </>}
  </div>;
}
