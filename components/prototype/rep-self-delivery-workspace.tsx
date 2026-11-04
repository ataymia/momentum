"use client";

/**
 * Purpose-built mobile-first salesperson delivery workspace. Orders are a
 * candidate list, never a grant of custody. Every action and readback uses
 * the existing authenticated, atomic server self-delivery workflow.
 */
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCircle2,ClipboardCheck,Cloud,CloudOff,PackageCheck,RefreshCcw,Search,ShieldCheck,Truck} from "lucide-react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {momentumStorage} from "../../lib/persistence";
import {COMMERCIAL_KEY,useWorkspace} from "../../lib/workspace-context";
import {repDeliveryRequest} from "../../lib/rep-delivery-workspace-client";
import {canExecuteRepDeliveryReviewMutation,repDeliveryCandidate,repDeliveryNextStep,repDeliveryProofRecorded,repDeliveryStepLabel,repDeliverySteps,type RepDeliveryAction,type RepDeliveryReceipt} from "../../lib/rep-delivery-workspace-policy";
import type {DeliverySignaturePoint} from "../../lib/delivery-engine";
import {navigateToRoute} from "../../lib/navigation-store";
import type {Order} from "../../lib/types";
import {DeliverySignaturePad} from "../delivery/signature-pad";

const base="/crm/self-delivery";
const day=(s?:string)=>s?.slice(0,10)||"Not recorded";
const steps=repDeliverySteps.map(step=>({id:step,label:repDeliveryStepLabel[step]}));
const visibleStages=["Approved","Allocated","Out for delivery","Delivered","Paid"] as const;
function OrderStatus({order}:{order:Order}){
  return <span className="rep-delivery-order-status">{order.status}</span>;
}
function RepHeader({subtitle}:{subtitle:string}){
  return <header className="rep-delivery-heading">
    <div className="rep-delivery-eyebrow"><Truck size={16}/> MOMENTUM FIELD DELIVERY</div>
    <h1>My self-deliveries</h1><p>{subtitle}</p>
  </header>;
}
function RepDirectory(){
  const {scope,currentUser}=useWorkspace();
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const candidates=useMemo(()=>currentUser?.role==="Sales Representative"?
    scope.orders.filter(order=>repDeliveryCandidate(order,currentUser.id))
      .sort((a,b)=>b.placedAt.localeCompare(a.placedAt)||a.id.localeCompare(b.id)):[],
  [scope.orders,currentUser]);
  const accounts=new Map(scope.accounts.map(a=>[a.id,a]));
  const rows=candidates.filter(order=>filter==="all"||order.status===filter)
    .filter(order=>[order.number,order.status,accounts.get(order.accountId)?.name,order.cases].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="rep-delivery-page">
    <RepHeader subtitle="Claim, prepare and deliver an approved order using your own verified field workflow. Sales ownership alone does not authorize delivery."/>
    <div className="rep-delivery-summary">
      <article><small>Visible eligible orders</small><strong>{candidates.length}</strong></article>
      <article><small>Approved, not yet out</small><strong>{candidates.filter(o=>o.status==="Approved").length}</strong></article>
      <article><small>Out for delivery</small><strong>{candidates.filter(o=>o.status==="Out for delivery").length}</strong></article>
    </div>
    <section className="rep-delivery-panel">
      <div className="rep-delivery-panel-head"><h2>Order assignments to review</h2><span>Server eligibility verified after opening</span></div>
      <div className="rep-delivery-toolbar"><label className="rep-delivery-search"><Search size={17}/><input aria-label="Search my delivery orders" placeholder="Order number or customer" value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <label>Order stage<select aria-label="Filter my delivery orders" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">All stages</option>{visibleStages.map(x=><option key={x}>{x}</option>)}</select></label></div>
      <div className="rep-delivery-order-list">
        {rows.map(order=><button type="button" className="rep-delivery-order-card" key={order.id} onClick={()=>navigateToRoute(base+"/"+encodeURIComponent(order.id))}>
          <span className="rep-delivery-order-icon"><PackageCheck size={22}/></span>
          <span className="rep-delivery-order-info"><strong>{order.number}</strong><small>{accounts.get(order.accountId)?.name??"Account record unavailable"}</small>
            <span>{order.cases} cases · Placed {day(order.placedAt)}</span></span>
          <span className="rep-delivery-order-side"><OrderStatus order={order}/><ArrowRight size={17}/></span>
        </button>)}
      </div>
      {!rows.length&&<p className="rep-delivery-empty">No orders match these filters. Only approved or later-stage orders owned by you appear here. Reassignment or server authorization may still restrict an order.</p>}
    </section>
    <p className="rep-delivery-footnote"><ShieldCheck size={15}/> No order, inventory or delivery ledger writes occur when browsing. Each action requires independent authorization and confirmation from Momentum&apos;s server.</p>
  </div>;
}

function RepDetail({order}:{order:Order}){
  const {scope,currentUser}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const idToken=firebase?.session?.idToken;
  const reviewMutationsEnabled=canExecuteRepDeliveryReviewMutation({
    enabled:process.env.NEXT_PUBLIC_REP_DELIVERY_REVIEW_MUTATIONS==="true",
    currentProjectId:firebase?.projectId,
    approvedStagingProjectId:process.env.NEXT_PUBLIC_REP_DELIVERY_STAGING_PROJECT_ID,
    persistenceMode:momentumStorage.mode(),
  });
  const [serverState,setServerState]=useState<{token:string;receipt:RepDeliveryReceipt}|null>(null);
  const [checkedToken,setCheckedToken]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [refreshing,setRefreshing]=useState(false);
  const checking=Boolean(idToken&&checkedToken!==idToken)||refreshing;
  const record=idToken&&serverState?.token===idToken?serverState.receipt:null;
  const errorText=idToken?error:"Sign in with your employee account to verify this delivery.";
  const [accepted,setAccepted]=useState(false);
  const [recipientName,setRecipientName]=useState("");
  const [strokes,setStrokes]=useState<DeliverySignaturePoint[][]>([]);
  const account=scope.accounts.find(a=>a.id===order.accountId);
  const step=repDeliveryNextStep(record,order.id);
  const completed=repDeliveryProofRecorded(record,order.id);
  const hasSignature=recipientName.trim().length>0&&strokes.some(stroke=>stroke.length>=2);
  const ready=Boolean(reviewMutationsEnabled&&step&&accepted&&!busy&&!checking&&idToken&&
    currentUser?.role==="Sales Representative"&&order.ownerId===currentUser.id&&
    (step!=="complete"||hasSignature));
  const stepIndex=step?repDeliverySteps.indexOf(step):completed?repDeliverySteps.length:0;
  const getState=async(token:string,signal?:AbortSignal)=>
    repDeliveryRequest(token,order.id,"status",undefined,signal);

  useEffect(()=>{
    if(!idToken)return;
    const controller=new AbortController();
    let active=true;
    void repDeliveryRequest(idToken,order.id,"status",undefined,controller.signal)
      .then(receipt=>{
        if(!active)return;
        setServerState({token:idToken,receipt});setCheckedToken(idToken);
        setAccepted(false);setError("");setNotice("");
      })
      .catch(e=>{
        if(!active||controller.signal.aborted)return;
        setServerState(null);setCheckedToken(idToken);setAccepted(false);
        setError(e instanceof Error?e.message:"Server verification is unavailable.");
      });
    return()=>{active=false;controller.abort();};
  },[order.id,idToken]);

  const refresh=async()=>{
    if(!idToken||busy)return;
    setRefreshing(true);setError("");setNotice("");setAccepted(false);
    try{setServerState({token:idToken,receipt:await getState(idToken)});setCheckedToken(idToken);}
    catch(e){setServerState(null);setCheckedToken(idToken);setError(e instanceof Error?e.message:"Unable to refresh verified state.");}
    finally{setRefreshing(false);}
  };
  const advance=async()=>{
    if(!reviewMutationsEnabled||!ready||!step||!idToken)return;
    const action:RepDeliveryAction=step;
    const signature=action==="complete"?{strokes,recipientName:recipientName.trim()}:undefined;
    setBusy(true);setError("");setNotice("");
    try{
      const ack=await repDeliveryRequest(idToken,order.id,action,signature);
      const fresh=await getState(idToken);
      if(fresh.taskStatus!==ack.taskStatus||fresh.orderStatus!==ack.orderStatus)throw new Error(
        "The saved order and newly-read delivery state disagree. Stop and ask Operations to reconcile.",
      );
      setServerState({token:idToken,receipt:fresh});setCheckedToken(idToken);setAccepted(false);
      if(action==="complete"){setStrokes([]);setRecipientName("");}
      setNotice((ack.replayed?"This step was already recorded. ":"")+"Cloud-verified delivery state updated. Check the next action before continuing.");
      void momentumStorage.refreshKeys([COMMERCIAL_KEY]).catch(()=>undefined);
    }catch(e){
      setError((e instanceof Error?e.message:"Cloud verification failed.")+
        " Check the latest state before repeating this step. Do not duplicate a custody action.");
      setAccepted(false);
      try{setServerState({token:idToken,receipt:await getState(idToken)});setCheckedToken(idToken);}catch{setServerState(null);setCheckedToken(idToken);}
    }finally{setBusy(false);}
  };
  return <div className="rep-delivery-page">
    <button className="rep-delivery-back" type="button" onClick={()=>navigateToRoute(base)}><ArrowLeft size={16}/> All my deliveries</button>
    <RepHeader subtitle="Verify the server state, confirm physical custody, and complete delivery only after a recipient signature."/>
    <section className="rep-delivery-panel rep-delivery-detail-header">
      <div><small>ORDER</small><h2>{order.number}</h2><p>{account?.name??"Customer record unavailable"} · {order.cases} cases</p></div>
      <div className="rep-delivery-cloud"><span><Cloud size={15}/>{record?.cloudConfirmed?"Cloud verified":checking?"Checking cloud":"Not verified"}</span>
        <button type="button" disabled={busy||checking||!idToken} onClick={()=>void refresh()}><RefreshCcw size={15}/> Refresh status</button></div>
    </section>
    <section className="rep-delivery-panel">
      <div className="rep-delivery-panel-head"><h2>Delivery progress</h2><span>Recorded stages, not an estimated arrival</span></div>
      <div className="rep-delivery-progress">
        {steps.map((s,index)=><div key={s.id} className={"rep-delivery-step "+(completed||index<stepIndex?"is-done":index===stepIndex&&step?"is-current":"")}>
          <span>{completed||index<stepIndex?<CheckCircle2 size={17}/>:index+1}</span><small>{s.label}</small>
        </div>)}
      </div>
      <div className="rep-delivery-current">
        <div><small>Server order status</small><strong>{record?.orderStatus??"Not verified"}</strong></div>
        <div><small>Server delivery task</small><strong>{record?.taskStatus??"Not verified"}</strong></div>
      </div>
      {checking&&<p role="status" className="rep-delivery-alert"><Cloud size={16}/> Checking existing delivery task and inventory posting with the server.</p>}
      {errorText&&<p role="alert" className="rep-delivery-alert is-error"><CloudOff size={16}/>{errorText}</p>}
      {notice&&<p role="status" className="rep-delivery-alert is-success"><CheckCircle2 size={16}/>{notice}</p>}
    </section>
    {step&&record?.cloudConfirmed===true&&<section className="rep-delivery-panel rep-delivery-action-panel">
      <div className="rep-delivery-panel-head"><h2>Next confirmed action</h2><span>One action at a time</span></div>
      <div className="rep-delivery-next"><span className="rep-delivery-next-icon"><ClipboardCheck size={23}/></span>
        <div><strong>{repDeliveryStepLabel[step]}</strong><p>{step==="claim"?"Claim this authorized approved order for your own delivery task.":
          step==="pack"?"Request a full-SKU reservation. If all sellable cases are not available, the server will reject the pack.":
          step==="load"?"Physically check all cases before transferring them into your employee custody.":
          step==="depart"?"Confirm the full load is in your custody before marking the order out for delivery.":
          "Capture the authorized recipient's handwritten signature and printed name before posting delivery."}</p></div></div>
      {step==="complete"&&<div className="rep-delivery-signature">
        <label>Recipient signature <span>Required</span></label>
        <DeliverySignaturePad strokes={strokes} onChange={setStrokes}/>
        <label htmlFor="rep-delivery-recipient">Recipient printed name <span>Required</span></label>
        <input id="rep-delivery-recipient" autoComplete="off" maxLength={120} value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Name of the person receiving the cases"/>
      </div>}
      {!reviewMutationsEnabled&&<p className="rep-delivery-alert">Review-only in this environment: shipment actions require separate, explicitly approved non-production staging configuration. Do not use production Firebase credentials to test this redesigned workflow.</p>}
      <label className="rep-delivery-confirm"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy||checking||!reviewMutationsEnabled}/>
        {step==="claim"?"I have confirmed this order is the one I intend to deliver":
         step==="pack"?"I understand that the full order and all SKUs must be reserved before loading":
         step==="load"?"I have physically verified the full case count and accept custody":
         step==="depart"?"I have verified that all cases are on my vehicle and I am beginning delivery":
         "The recipient signed this delivery and the entered name matches the person accepting the cases"}
      </label>
      <button type="button" className="rep-delivery-primary" disabled={!ready} onClick={()=>void advance()}>
        {busy?"Verifying cloud transaction…":repDeliveryStepLabel[step]}<ArrowRight size={16}/>
      </button>
      <p className="rep-delivery-action-note">Server authorization, inventory lots, period locks, recipient proof and state transitions are checked independently. Never repeat an uncertain action without refreshing the cloud state.</p>
    </section>}
    {completed&&<section className="rep-delivery-panel rep-delivery-complete">
      <CheckCircle2 size={28}/><div><h2>Delivery recorded and verified</h2><p>The server confirms the signed task and recorded inventory posting. Invoice delivery and payment settlement are separate workflows.</p></div>
    </section>}
    {!completed&&!step&&!checking&&!errorText&&<section className="rep-delivery-panel"><p className="rep-delivery-empty">No authorized next step is available from the server&apos;s current order and delivery states. Refresh or ask Operations to review the record. Do not move stock based on a local status.</p></section>}
    <section className="rep-delivery-panel rep-delivery-support">
      <h2>Delivery exception or reconciliation needed?</h2>
      <p>Pause the delivery transition if cases, custody, customer confirmation or the cloud record do not match. Capture the issue and contact Operations. This page does not override a lock, record a cash payment, or manufacture delivery proof.</p>
      <div><button type="button" onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(order.id))}>View original order<ArrowRight size={14}/></button>
        <button type="button" onClick={()=>navigateToRoute("/work/actions")}>My Action Center<ArrowRight size={14}/></button></div>
    </section>
    <p className="rep-delivery-footnote"><ShieldCheck size={15}/> This interface uses the existing verified self-delivery server. No browser write to the inventory, order or delivery arrays is performed.</p>
  </div>;
}
export function RepSelfDeliveryWorkspace({orderId}:{orderId?:string}){
  const {scope,currentUser}=useWorkspace();
  if(currentUser?.role!=="Sales Representative")return <div className="prototype-empty">Only authorized Sales Representatives have a self-delivery workspace.</div>;
  if(!orderId)return <RepDirectory/>;
  const order=scope.orders.find(candidate=>candidate.id===orderId&&repDeliveryCandidate(candidate,currentUser.id));
  if(!order)return <div className="rep-delivery-page"><button className="rep-delivery-back" type="button" onClick={()=>navigateToRoute(base)}><ArrowLeft size={16}/> All my deliveries</button><p className="rep-delivery-empty">This order is not eligible or not visible in your assigned account scope.</p></div>;
  return <RepDetail key={order.id} order={order}/>;
}
