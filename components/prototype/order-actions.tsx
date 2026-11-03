"use client";

/**
 * Prototype Commerce order operations.
 *
 * New UI delegates to the canonical Workspace and Inventory engines. It does
 * not reproduce business rules, change commission calculations or bypass order
 * approval. Mutating controls run only in local demo mode until staging/production
 * readiness receives explicit operational authorization.
 */
import {useMemo,useState,type FormEvent} from "react";
import {ArrowLeft,CheckCircle2,Plus,Search,ShieldCheck,Trash2} from "lucide-react";
import {canCreateOrder,canReviewApproval} from "../../lib/access";
import {hasCompleteDeliveryAddress,deliveryAddressLabel} from "../../lib/account-address";
import {approvalForOrder} from "../../lib/order-approval-engine";
import {evaluatePartnerPricing} from "../../lib/pricing-engine";
import {GOLDEN_EAGLE_SKUS} from "../../lib/product-catalog";
import {productInventoryStatus} from "../../lib/inventory-ledger";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {momentumStorage} from "../../lib/persistence";
import {useRuntimeMode} from "../../lib/runtime-mode";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";
import type {Approval,Order} from "../../lib/types";

type LineDraft={key:number;product:string;cases:string};
const catalog=GOLDEN_EAGLE_SKUS.filter(sku=>sku.active&&!sku.testOnly);
const formatMoney=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
const valueDate=(raw:string|undefined)=>raw?.slice(0,10)??"Not recorded";
const newLine=(key:number,product=catalog[0]?.description??""):LineDraft=>({key,product,cases:""});
const canEditCurrentOrder=(actorRole:string|undefined,actorId:string|undefined,order:Order|undefined)=>{
  if(!order||!actorId||!["Draft","Awaiting approval","Approved"].includes(order.status))return false;
  if(actorRole==="Administrator")return true;
  return ["Sales Representative","Sales Manager"].includes(actorRole??"")&&order.ownerId===actorId;
};
function Notes({children}:{children:React.ReactNode}){
  return <p className="prototype-note">{children}</p>;
}
function Back({to}:{to:string}){
  return <button type="button" className="prototype-back" onClick={()=>navigateToRoute(to)}><ArrowLeft size={16}/> Back</button>;
}
function DemoGuard({isDemo}:{isDemo:boolean}){
  return <div className="prototype-guard" role="note"><ShieldCheck size={18}/>
    <p>{isDemo&&momentumStorage.mode()==="local"?"Local-only demo: actions change demonstration records on this device, not production commerce records.":"Read-only prototype: order mutations and approvals require local demo mode with no connected persistence backend. They cannot change a connected company database while the redesign is under review."}</p>
  </div>;
}
export function OrderEditor({orderId}:{orderId?:string}){
  const {data,scope,currentUser,createOrder,editOrder}=useWorkspace();
  const {ledger,releaseOrderReservationsForEdit}=useInventoryLedger();
  const runtime=useRuntimeMode();
  const order=orderId?scope.orders.find(o=>o.id===orderId&&!o.testOnly):undefined;
  const [accountId,setAccountId]=useState(order?.accountId??"");
  const [accountSearch,setAccountSearch]=useState("");
  const [counter,setCounter]=useState((order?.lines?.length??1)+1);
  const [draft,setDraft]=useState<LineDraft[]>(order?.lines?.length?order.lines.map((line,index)=>({key:index+1,product:line.product,cases:String(line.cases)})):[newLine(1)]);
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState("");
  const existing=Boolean(orderId);
  const canUse=Boolean(currentUser&&currentUser.role!=="Customer"&&canCreateOrder(currentUser));
  const canEdit=existing&&canEditCurrentOrder(currentUser?.role,currentUser?.id,order);
  const selected=scope.accounts.find(a=>a.id===(order?.accountId??accountId));
  const options=scope.accounts.filter(a=>[a.name,a.location,a.streetAddress,a.postalCode].join(" ").toLowerCase().includes(accountSearch.toLowerCase()))
    .sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location));
  const pricing=selected?evaluatePartnerPricing(data,selected.id):undefined;
  const unitPrice=existing?order?.pricePerCase:pricing?.currentPricePerCase;
  const summaries=draft.map(row=>({
    ...row,casesCount:Number(row.cases),
    stock:productInventoryStatus(ledger,data,row.product).available,
  }));
  const readyRows=summaries.length>0&&summaries.every(line=>Number.isSafeInteger(line.casesCount)&&line.casesCount>0&&Boolean(catalog.find(p=>p.description===line.product)));
  const totalCases=readyRows?summaries.reduce((sum,line)=>sum+line.casesCount,0):0;
  const priceValid=typeof unitPrice==="number"&&Number.isFinite(unitPrice)&&unitPrice>0;
  const valid=Boolean(selected&&hasCompleteDeliveryAddress(selected)&&readyRows&&priceValid);
  const writeEnabled=runtime.isDemo&&momentumStorage.mode()==="local"&&canUse&&(!existing||canEdit);
  const reference=existing?"/sales/orders/"+encodeURIComponent(orderId!):"/sales/orders";
  if(!canUse)return <div className="prototype-empty">Order creation is not available to your role. Customer checkout remains in the customer portal.</div>;
  if(existing&&!order)return <div className="prototype-empty">Order not found or outside your authorized scope.</div>;
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(working)return;
    if(!writeEnabled){setMessage("This prototype cannot change live orders. Enable local demo mode in a local development environment for safe review.");return;}
    if(!valid||!selected){setMessage("Choose an eligible customer with a complete delivery address, valid pricing and whole-number case quantities.");return;}
    // The engine reevaluates pricing, territory, order eligibility and inventory
    // risk independently. The UI is not an authorization boundary.
    const lines=summaries.map(line=>({product:line.product,cases:line.casesCount,inventoryAvailableAtOrder:line.stock}));
    setWorking(true);setMessage("");
    try{
      let id=order?.id;
      if(order){
        // Never detach physical reservations if stock has already moved.
        if(order.status==="Approved"&&!releaseOrderReservationsForEdit(order.id)){setMessage("Existing reservations or custody evidence prevent this edit. Use the authorized operations workflow.");return;}
        const result=editOrder(order.id,{accountId:order.accountId,lines});
        if(!result.ok){setMessage(result.message??"Order edit rejected by the order engine.");return;}
      }else{
        id=createOrder({accountId:selected.id,lines})??undefined;
        if(!id){setMessage("Order engine rejected the request. Check account permissions, territory, pricing and SKU quantities.");return;}
      }
      const saved=await momentumStorage.flushAndConfirm("momentum-commercial-controls-v1");
      if(!saved.ok){setMessage("The request is queued locally but not confirmed by cloud persistence. Do not resubmit. "+(saved.message??""));return;}
      navigateToRoute("/sales/orders/"+encodeURIComponent(id!));
    }catch(error){
      setMessage("The change could not be confirmed. Inspect sync status before attempting again.");
      void error;
    }finally{setWorking(false);}
  };
  return <div className="prototype-order-editor">
    <header className="prototype-heading"><Back to={reference}/><h1>{existing?"Edit "+order!.number:"New Sales Order"}</h1>
      <p>Customer and verified delivery location, catalog items, case quantities, pricing basis and approval review.</p></header>
    <DemoGuard isDemo={runtime.isDemo}/>
    <form className="prototype-order-form" onSubmit={e=>void save(e)}>
      <section className="prototype-panel"><h2>1. Customer and delivery location</h2>
        {existing?<p><strong>{selected?.name}</strong> · {selected?.location}</p>:<>
        <label className="prototype-search"><Search size={15}/><input aria-label="Search customer locations" placeholder="Filter accounts by business or ZIP" value={accountSearch} onChange={e=>setAccountSearch(e.target.value)}/></label>
        <label className="prototype-form-field">Customer location<select aria-label="Order customer location" value={accountId} onChange={e=>{setAccountId(e.target.value);setMessage("");}}><option value="">Select an accessible account</option>{options.map(a=><option key={a.id} value={a.id}>{a.name} · {a.location}{a.postalCode?" · "+a.postalCode:""}</option>)}</select></label></>}
        <dl className="prototype-facts"><div><dt>Delivery address</dt><dd>{selected?deliveryAddressLabel(selected)||"Incomplete":"Select a location"}</dd></div>
        <div><dt>Address validation</dt><dd>{selected?(hasCompleteDeliveryAddress(selected)?"Complete":"Missing street, city/market, or five-digit ZIP"):"Account required"}</dd></div></dl>
        {selected&&!hasCompleteDeliveryAddress(selected)&&<Notes>Complete the customer delivery address before an order can be submitted. The editor will not guess missing information.</Notes>}
      </section>
      <section className="prototype-panel"><h2>2. Items and quantities</h2>
        <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Catalog item</th><th>Case quantity</th><th>Available warehouse cases</th><th>Line value</th><th/></tr></thead>
          <tbody>{summaries.map(line=><tr key={line.key}>
            <td><select aria-label={"Product for line "+line.key} value={line.product} onChange={e=>setDraft(rows=>rows.map(row=>row.key===line.key?{...row,product:e.target.value}:row))}>{catalog.map(item=><option key={item.id} value={item.description}>{item.shortName} · {item.casePack} cans/case</option>)}</select></td>
            <td><input type="number" min="1" step="1" aria-label={"Cases for line "+line.key} value={line.cases} onChange={e=>setDraft(rows=>rows.map(row=>row.key===line.key?{...row,cases:e.target.value}:row))}/></td>
            <td>{line.stock}</td>
            <td>{Number.isSafeInteger(line.casesCount)&&line.casesCount>0&&priceValid?formatMoney(line.casesCount*unitPrice!):"Pending valid quantity"}</td>
            <td><button type="button" disabled={draft.length<=1} aria-label={"Remove line "+line.key} onClick={()=>setDraft(rows=>rows.filter(row=>row.key!==line.key))}><Trash2 size={15}/></button></td>
          </tr>)}</tbody>
        </table></div>
        <button type="button" className="prototype-secondary-action" onClick={()=>{setDraft(rows=>[...rows,newLine(counter)]);setCounter(n=>n+1)}}><Plus size={15}/> Add product</button>
        <Notes>Inventory availability is advisory at order entry. The existing approval, reservation and custody engine validates every later fulfillment step.</Notes>
      </section>
      <section className="prototype-panel"><h2>3. Review and authorization</h2>
        <dl className="prototype-facts">
          <div><dt>Case pricing</dt><dd>{priceValid?formatMoney(unitPrice!):"Not configured"}</dd></div>
          <div><dt>Pricing source</dt><dd>{existing?order!.priceBasis:pricing?.status??"Select a customer"}</dd></div>
          <div><dt>Cases</dt><dd>{readyRows?totalCases:"Complete quantities"}</dd></div>
          <div><dt>Order value (not revenue collected)</dt><dd>{readyRows&&priceValid?formatMoney(totalCases*unitPrice!):"Not available"}</dd></div>
          <div><dt>Submission status</dt><dd>{existing?(order!.status==="Approved"&&currentUser?.role==="Administrator"?"Administrator amendment is reviewed separately":"May return to approval queue"):"Pending Administrator approval"}</dd></div>
        </dl>
        <Notes>Price is determined by the existing approved pricing engine; operators cannot type over it here. The prototype does not send invoices or payment links.</Notes>
        {message&&<p role="alert" className="prototype-order-error">{message}</p>}
        <div className="prototype-form-actions"><button type="button" onClick={()=>navigateToRoute(reference)}>Cancel</button>
        <button type="submit" disabled={working||!valid||!writeEnabled}>{working?"Saving…":existing?"Save and resubmit":"Submit for approval"}</button></div>
      </section>
    </form>
  </div>;
}
const accessibleOrder=(approval:Approval,orders:readonly Order[])=>orders.find(o=>o.id===approval.recordId&&!o.testOnly);
export function OrderApprovalDirectory(){
  const {data,scope,currentUser,decideApproval}=useWorkspace();
  const runtime=useRuntimeMode();
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState<"Pending"|"Approved"|"Returned"|"All">("Pending");
  const [sort,setSort]=useState<"oldest"|"newest">("oldest");
  const [inFlight,setInFlight]=useState("");
  const [returningId,setReturningId]=useState("");
  const [returnReason,setReturnReason]=useState("");
  const [notice,setNotice]=useState("");
  const records=useMemo(()=>scope.approvals
    .filter(a=>a.type==="Order"||a.type==="Low stock sale")
    .map(a=>({approval:a,order:accessibleOrder(a,scope.orders)}))
    .filter((r):r is {approval:Approval;order:Order}=>Boolean(r.order))
    .filter(r=>status==="All"||r.approval.status===status)
    .filter(r=>[r.approval.title,r.order.number,r.order.accountId,scope.accounts.find(a=>a.id===r.order.accountId)?.name].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>(sort==="newest"?-1:1)*(a.approval.submittedAt.localeCompare(b.approval.submittedAt)||a.approval.id.localeCompare(b.approval.id)))
  ,[scope.approvals,scope.orders,scope.accounts,status,sort,search]);
  const pending=scope.approvals.filter(a=>a.status==="Pending"&&["Order","Low stock sale"].includes(a.type)).length;
  const otherApprovals=scope.approvals.filter(a=>!["Order","Low stock sale"].includes(a.type))
    .filter(a=>status==="All"||a.status===status)
    .filter(a=>[a.title,a.type,a.requestedBy,a.detail].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>(sort==="newest"?-1:1)*a.submittedAt.localeCompare(b.submittedAt));
  const canDecide=(approval:Approval)=>Boolean(currentUser&&canReviewApproval(data,currentUser,approval)&&runtime.isDemo&&momentumStorage.mode()==="local"&&approval.status==="Pending");
  const decide=async(approval:Approval,decision:"Approved"|"Returned",reason?:string)=>{
    if(!canDecide(approval)||inFlight)return;
    if(decision==="Returned"&&(!reason||reason.trim().length<3)){setNotice("Enter a meaningful return reason before sending the request back.");return;}
    setInFlight(approval.id);setNotice("");
    try{
      const previous=scope.approvals.find(a=>a.id===approval.id)?.status;
      if(previous!=="Pending"){setNotice("This approval is no longer pending. Refresh the record.");return;}
      // The canonical engine validates the Administrator and preserves the reason in audit history.
      decideApproval(approval.id,decision,reason);
      const result=await momentumStorage.flushAndConfirm("momentum-commercial-controls-v1");
      if(!result.ok){setNotice("Decision is queued locally, not confirmed remotely. Do not repeat it. "+(result.message??""));return;}
      setReturningId("");setReturnReason("");
      setNotice("Approval operation checked. Confirm its updated status in the record.");
    }catch{setNotice("Could not verify the decision. Inspect sync status before trying again.");}
    finally{setInFlight("");}
  };
  return <div>
    <header className="prototype-heading"><h1>Approvals</h1><p>Order decisions, team requests, priority and status history. Order approval remains Administrator-governed.</p></header>
    <DemoGuard isDemo={runtime.isDemo}/>
    <div className="prototype-metrics"><div><small>Open order approval requests</small><strong>{pending}</strong></div><div><small>Matching approvals</small><strong>{records.length}</strong></div><div><small>Authority</small><strong>{currentUser?.role==="Administrator"?"Administrator":"View only"}</strong></div></div>
    <section className="prototype-panel"><h2>Sales order approvals</h2>
      <div className="prototype-commerce-filters">
        <label className="prototype-search"><Search size={15}/><input aria-label="Search order approvals" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Order, customer or request"/></label>
        <label>Status<select aria-label="Filter order approval status" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option>Pending</option><option>Approved</option><option>Returned</option><option>All</option></select></label>
        <label>Submitted<select aria-label="Sort order approval date" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      </div>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Order</th><th>Customer</th><th>Submitted</th><th>Priority</th><th>Approval</th><th>Action</th></tr></thead><tbody>{records.map(({approval,order})=>{
        const account=scope.accounts.find(a=>a.id===order.accountId);
        return <tr key={approval.id}>
          <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(order.id))}>{order.number}</button><small className="prototype-description">{order.cases} cases · {formatMoney(order.amount)}</small></td>
          <td>{account?.name??"Account restricted"}</td>
          <td>{valueDate(approval.submittedAt)}</td>
          <td>{approval.priority}</td><td>{approval.status}</td>
          <td>{approval.status==="Pending"&&canDecide(approval)?
            returningId===approval.id?<div className="prototype-approval-return">
              <label>Return reason<textarea aria-label={"Reason for returning "+order.number} value={returnReason} onChange={e=>setReturnReason(e.target.value)} rows={3} placeholder="Describe the corrections needed before approval"/></label>
              <div className="prototype-approval-actions">
                <button type="button" disabled={Boolean(inFlight)||returnReason.trim().length<3} onClick={()=>void decide(approval,"Returned",returnReason)}>Confirm return</button>
                <button type="button" disabled={Boolean(inFlight)} onClick={()=>{setReturningId("");setReturnReason("");}}>Cancel</button>
              </div>
            </div>:
            <div className="prototype-approval-actions"><button type="button" disabled={Boolean(inFlight)} onClick={()=>void decide(approval,"Approved")}><CheckCircle2 size={14}/> Approve</button>
              <button type="button" disabled={Boolean(inFlight)} onClick={()=>{setReturningId(approval.id);setReturnReason("");}}>Return</button>
            </div>:
            <span>{approval.status==="Pending"?"Awaiting authorized reviewer":"Reviewed"}</span>}</td>
        </tr>;
      })}</tbody></table></div>
      {!records.length&&<p className="prototype-empty">No matching order approval requests.</p>}
      {notice&&<p role="status" className="prototype-note">{notice}</p>}
      <Notes>Only Administrator users can approve actual orders. A Sales Manager's access to other approval types does not authorize sales-order approval. No delivery can advance merely because this page displays a request.</Notes>
    </section>
    <section className="prototype-panel"><h2>Other workflow approvals</h2>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Request</th><th>Type</th><th>Requester</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {otherApprovals.map(approval=><tr key={approval.id}><td>{approval.title}<small className="prototype-description">{approval.detail}</small></td>
          <td>{approval.type}</td><td>{approval.requestedBy}</td><td>{valueDate(approval.submittedAt)}</td><td>{approval.status}</td>
          <td><button type="button" className="prototype-link" onClick={()=>navigateToRoute("/work/workflow")}>Open existing approval controls</button></td>
        </tr>)}
      </tbody></table></div>
      {!otherApprovals.length&&<p className="prototype-empty">No other requests match this status and search.</p>}
      <Notes>Non-order approvals remain in the original authorized workflow until their new specialized decision screens have equivalent validation and audit controls.</Notes>
    </section>
  </div>;
}
export function OrderApprovalSummary({order}:{order:Order}){
  const {data,scope,currentUser}=useWorkspace();
  const approval=approvalForOrder(scope.approvals,order.id);
  if(!approval)return <p className="prototype-note">No canonical approval record found. Fulfillment remains subject to the existing approval rules.</p>;
  return <div className="prototype-work-list"><span>{approval.type} · {approval.status} · {valueDate(approval.submittedAt)}</span>
    {approval.status==="Pending"&&currentUser&&canReviewApproval(data,currentUser,approval)?
      <button type="button" className="prototype-link" onClick={()=>navigateToRoute("/work/approvals")}>Open approval queue</button>:
      approval.status==="Returned"?<span>{approval.returnReason??"Correction required"}</span>:<span>Reviewed under existing controls</span>}
  </div>;
}
