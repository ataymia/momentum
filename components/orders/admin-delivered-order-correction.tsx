"use client";

import {useEffect,useMemo,useState} from "react";
import {useWorkspace} from "../../lib/workspace-context";
import {useInventoryLedger} from "../../lib/inventory-ledger-context";
import {useCommerce} from "../../lib/commerce-context";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {listFirestoreCollection} from "../../lib/firebase-firestore-rest";
import {orderLinesFor,productsEquivalent} from "../../lib/order-lines";
import {businessAddressLabel} from "../../lib/account-address";
import type {Order} from "../../lib/types";
import {Button,Field,Modal,formatMoney} from "../ui";

type InventoryAdjustment={
  id:string;product:string;lotId:string;quantity:number;
  fromNodeId:string;toNodeId:string;evidenceReference:string;
};
type RequestRecord={
  id:string;orderId:string;requesterUid:string;state:string;closureReason?:string;
  reason:string;createdAt:string;originalAmount:number;proposedAmount:number;
  quantityChanged:boolean;financialReviewRequired:boolean;inventoryReviewRequired:boolean;
  originalInvoiceNumber:string;proposedBillToAddress:string;
  proposedLines:Array<{product:string;cases:number;pricePerCase:number}>;
  originalLines:Array<{product:string;cases:number;pricePerCase:number}>;
  originalBillToAddress:string;
  evidenceReference:string;
  inventoryAdjustments:InventoryAdjustment[];
};
type Props={order:Order|null;onClose:()=>void;onSaved:()=>void};
const uuid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);

export function AdminDeliveredOrderCorrection({order,onClose,onSaved}:Props){
  const {currentUser,data,scope}=useWorkspace();
  const {commerce}=useCommerce();
  const {ledger}=useInventoryLedger();
  const firebase=useFirebaseSessionOptional();
  const [cases,setCases]=useState<number[]>([]);
  const [billToAddress,setBillToAddress]=useState("");
  const [reason,setReason]=useState("");
  const [evidenceReference,setEvidenceReference]=useState("");
  const [adjustments,setAdjustments]=useState<InventoryAdjustment[]>([]);
  const [requests,setRequests]=useState<RequestRecord[]>([]);
  const [reviewRequestId,setReviewRequestId]=useState("");
  const [approvalNote,setApprovalNote]=useState("");
  const [reviewConfirmed,setReviewConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const originalLines=useMemo(()=>order?orderLinesFor(order):[],[order]);
  const activeInvoice=order?commerce.invoices.find(i=>i.orderId===order.id&&i.status!=="Void"):undefined;
  const account=order?scope.accounts.find(a=>a.id===order.accountId):undefined;
  const proposedTotal=originalLines.reduce((sum,line,i)=>sum+(cases[i]??line.cases)*line.pricePerCase,0);
  const deltas=originalLines.map((line,i)=>({product:line.product,
    delta:(cases[i]??line.cases)-line.cases})).filter(row=>row.delta!==0);
  const hasFinancialActivity=Boolean(activeInvoice&&(
    commerce.allocations.some(a=>a.invoiceId===activeInvoice.id)||
    commerce.credits.some(c=>c.invoiceId===activeInvoice.id&&c.status!=="Void")
  ));
  const customerNode=order?"node-account-"+order.accountId:"";
  const holdNode="node-quality-hold";
  const nodes=ledger.nodes.filter(n=>["Warehouse","Employee custody","Vehicle"].includes(n.type));
  const inventoryLots=scope.inventory;

  useEffect(()=>{
    if(!order)return;
    const timer=window.setTimeout(()=>{
      setCases(orderLinesFor(order).map(line=>line.cases));
      setBillToAddress(activeInvoice?.billToAddressSnapshot||(account?businessAddressLabel(account):""));
      setReason("");setEvidenceReference("");setAdjustments([]);
      setError("");setNotice("");
    },0);
    return()=>window.clearTimeout(timer);
  },[order?.id,activeInvoice?.id]);

  const reloadRequests=async()=>{
    if(!order||currentUser?.role!=="Administrator")return;
    setLoading(true);
    try{
      const all=await listFirestoreCollection<RequestRecord>("deliveryCorrectionRequests");
      setRequests(all.filter(item=>item.orderId===order.id&&["Submitted","Applied","Rejected","Withdrawn"].includes(item.state))
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20));
    }catch{setError("Correction history could not load. Verify Administrator access.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(!order)return;const timer=window.setTimeout(()=>void reloadRequests(),0);return()=>window.clearTimeout(timer);},[order?.id]);

  const addAdjustment=(product:string,delta:number)=>{
    const candidates=inventoryLots.filter(l=>productsEquivalent(l.product,product));
    const first=candidates[0];
    const defaultSource=delta<0?customerNode:"node-warehouse-main";
    setAdjustments(old=>[...old,{
      id:uuid(),product,lotId:first?.id??"",quantity:Math.abs(delta),
      fromNodeId:defaultSource,toNodeId:delta<0?holdNode:customerNode,
      evidenceReference:"",
    }]);
  };
  const changeAdjustment=(id:string,patch:Partial<InventoryAdjustment>)=>
    setAdjustments(rows=>rows.map(item=>item.id===id?{...item,...patch}:item));
  const call=async(functionName:string,payload:Record<string,unknown>)=>{
    const token=firebase?.session?.idToken;
    if(!token)throw new Error("Sign in again before editing orders.");
    const response=await fetch(firebaseFunctionUrl(functionName),{
      method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
      body:JSON.stringify(payload),
    });
    const result=await response.json().catch(()=>null) as
      {ok?:boolean;message?:string;requestId?:string;state?:string}|null;
    if(!response.ok||result?.ok!==true)throw new Error(result?.message||"The correction was not saved.");
    return result;
  };
  const submit=async()=>{
    if(!order||busy)return;
    setError("");setNotice("");
    if(!reason.trim()||reason.trim().length<12||evidenceReference.trim().length<6){
      setError("Enter the correction reason and source evidence reference.");return;
    }
    if(deltas.length&&adjustments.length===0){
      setError("Add the exact inventory lot and custody adjustment for each changed SKU.");return;
    }
    if(deltas.length&&adjustments.some(a=>!a.lotId||!a.evidenceReference.trim())){
      setError("Each inventory adjustment requires a lot and physical proof reference.");return;
    }
    setBusy(true);
    try{
      const result=await call("submitDeliveredOrderCorrection",{
        orderId:order.id,requestId:"correction-"+uuid().replace(/[^A-Za-z0-9_-]/g,"").slice(0,50),
        reason:reason.trim(),evidenceReference:evidenceReference.trim(),
        billToAddress:billToAddress.trim(),
        lines:originalLines.map((line,i)=>({product:line.product,cases:cases[i]??line.cases})),
        inventoryAdjustments:adjustments.map(({id,...a})=>a),
      });
      setNotice("Correction "+result.requestId+" submitted for another Administrator to approve.");
      await reloadRequests();
    }catch(err){setError(err instanceof Error?err.message:"Correction was not submitted.");}
    finally{setBusy(false);}
  };
  const approve=async(request:RequestRecord)=>{
    if(!order||busy)return;
    if(reviewRequestId!==request.id||!reviewConfirmed||approvalNote.trim().length<8){
      setError("Review the before/after changes and confirm the physical evidence with an approval note.");return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      await call("approveDeliveredOrderCorrection",{requestId:request.id,orderId:order.id,
        reviewConfirmed:true,approvalNote:approvalNote.trim()});
      setNotice("Amended invoice and order correction committed. Email reissue will be queued.");
      await reloadRequests();onSaved();
    }catch(err){setError(err instanceof Error?err.message:"Correction was not approved.");}
    finally{setBusy(false);}
  };
  const closeRequest=async(request:RequestRecord,decision:"Reject"|"Withdraw")=>{
    if(!order||busy)return;
    if(approvalNote.trim().length<8){
      setError("Enter a reason of at least eight characters before closing this request.");return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      const result=await call("closeDeliveredOrderCorrection",{
        requestId:request.id,orderId:order.id,decision,reason:approvalNote.trim(),
      });
      setNotice("Correction "+request.id+" "+(result.state==="Rejected"?"rejected":"withdrawn")+
        ". No inventory, payments, or invoices were changed.");
      setReviewRequestId("");setApprovalNote("");setReviewConfirmed(false);
      await reloadRequests();
    }catch(err){setError(err instanceof Error?err.message:"Correction remains pending.");}
    finally{setBusy(false);}
  };
  if(currentUser?.role!=="Administrator")return null;
  return <Modal open={Boolean(order)} title={"Correct delivered order · "+(order?.number??"")}
    description="Original delivery proof remains unchanged. Another Administrator must approve before inventory, order totals and the amended invoice change."
    wide onClose={()=>{if(!busy)onClose()}}
    footer={<>
      <Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button>
      <Button disabled={busy||!order||!firebase?.session?.idToken} onClick={()=>void submit()}>{busy?"Saving…":"Submit correction"}</Button>
    </>}>
    <div className="form-grid">
      <div className="field--full"><strong>Order quantities</strong><p>Changing quantities requires physical inventory evidence. Prices remain unchanged.</p></div>
      {originalLines.map((line,i)=><div className="field--full form-grid" key={line.id}>
        <Field label={"Product "+(i+1)}><input disabled value={line.product}/></Field>
        <Field label="Original cases"><input disabled value={line.cases}/></Field>
        <Field label="Corrected cases"><input type="number" min="1" step="1" value={cases[i]??line.cases}
          onChange={e=>setCases(old=>old.map((q,j)=>i===j?Number(e.target.value):q))}/></Field>
        <Field label="Original unit price"><input disabled value={formatMoney(line.pricePerCase)}/></Field>
      </div>)}
      <div className="field--full">Revised total: <strong>{formatMoney(proposedTotal)}</strong></div>
      <Field label="Invoice billing address" className="field--full"><textarea rows={2} maxLength={500} required
        value={billToAddress} onChange={e=>setBillToAddress(e.target.value)}/></Field>
      <Field label="Reason for correction" className="field--full"><textarea rows={2} maxLength={800} required
        value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      <Field label="Delivery or document proof reference" className="field--full"><input required
        value={evidenceReference} onChange={e=>setEvidenceReference(e.target.value)} placeholder="Signed receipt or verification reference"/></Field>
      {hasFinancialActivity&&<p role="alert" className="form-error field--full">Payments or credits exist. Finance must reconcile before this correction can be approved.</p>}
      {deltas.map(change=><div key={change.product} className="field--full">
        <strong>{change.product}: {Math.abs(change.delta)} case{Math.abs(change.delta)===1?"":"s"} {change.delta<0?"returned to quality hold":"added from company custody"}</strong>
        <Button size="sm" type="button" variant="secondary" onClick={()=>addAdjustment(change.product,change.delta)}>Add lot adjustment</Button>
        {adjustments.filter(a=>a.product===change.product).map(a=><div className="form-grid" key={a.id}>
          <Field label="Exact lot"><select value={a.lotId} onChange={e=>changeAdjustment(a.id,{lotId:e.target.value})}>
            <option value="">Choose lot</option>{inventoryLots.filter(l=>productsEquivalent(l.product,a.product))
              .map(l=><option value={l.id} key={l.id}>{l.lotCode}</option>)}</select></Field>
          <Field label="Cases"><input type="number" min="1" step="1" value={a.quantity}
            onChange={e=>changeAdjustment(a.id,{quantity:Number(e.target.value)})}/></Field>
          <Field label="Physical stock source"><select disabled={change.delta<0} value={a.fromNodeId}
            onChange={e=>changeAdjustment(a.id,{fromNodeId:e.target.value})}>
            {change.delta<0?<option value={customerNode}>Customer custody</option>:
            nodes.map(node=><option value={node.id} key={node.id}>{node.name}</option>)}</select></Field>
          <Field label="Evidence for this lot"><input value={a.evidenceReference}
            onChange={e=>changeAdjustment(a.id,{evidenceReference:e.target.value})}
            placeholder="Lot count / signed return reference"/></Field>
          <Button size="sm" variant="ghost" type="button" onClick={()=>setAdjustments(old=>old.filter(row=>row.id!==a.id))}>Remove lot row</Button>
        </div>)}
      </div>)}
      <div className="field--full">
        <strong>Approval queue</strong>
        <Button size="sm" variant="secondary" type="button" disabled={loading} onClick={()=>void reloadRequests()}>{loading?"Loading…":"Refresh requests"}</Button>
        {requests.map(request=><div className="form-callout" key={request.id}>
          <p><strong>{request.state}:</strong> {request.reason} · {formatMoney(request.originalAmount)} to {formatMoney(request.proposedAmount)}</p>
          <p>{request.originalInvoiceNumber} · {request.createdAt}</p>
          {request.state==="Submitted"&&<>
            <Button size="sm" variant="secondary" type="button"
              onClick={()=>{
                setReviewRequestId(reviewRequestId===request.id?"":request.id);
                setApprovalNote("");setReviewConfirmed(false);
              }}>{reviewRequestId===request.id?"Hide review":"Review / manage correction"}</Button>
            {reviewRequestId===request.id&&<div className="form-grid">
              <div className="field--full"><strong>SKU and case comparison</strong>
                {request.originalLines.map((line,i)=><p key={i}>
                  {line.product}: {line.cases} → {request.proposedLines[i]?.cases??"?"} cases · {formatMoney(line.pricePerCase)} per case
                </p>)}
              </div>
              <div className="field--full"><strong>Billing address</strong>
                <p>Before: {request.originalBillToAddress}</p>
                <p>After: {request.proposedBillToAddress}</p>
              </div>
              <div className="field--full"><strong>Source evidence:</strong> {request.evidenceReference}
                {request.inventoryAdjustments?.map((a,i)=><p key={i}>
                  {a.quantity} {a.product}, lot {a.lotId}: {a.fromNodeId} → {a.toNodeId}
                  · {a.evidenceReference}
                </p>)}
              </div>
              <label className="field--full"><input type="checkbox"
                checked={reviewConfirmed} onChange={e=>setReviewConfirmed(e.target.checked)}/>
                I reviewed the original records and the physical custody evidence
              </label>
              <Field label="Approval / reconciliation note" className="field--full">
                <textarea rows={2} maxLength={800} value={approvalNote} onChange={e=>setApprovalNote(e.target.value)}/>
              </Field>
              <Button size="sm" type="button"
                disabled={busy||request.requesterUid===currentUser?.id||
                  request.financialReviewRequired||!reviewConfirmed||approvalNote.trim().length<8}
                onClick={()=>void approve(request)}>
                {request.requesterUid===currentUser?.id?"Another administrator required":"Approve and amend invoice"}
              </Button>
              <Button size="sm" type="button" variant="secondary"
                disabled={busy||approvalNote.trim().length<8}
                onClick={()=>void closeRequest(request,
                  request.requesterUid===currentUser?.id?"Withdraw":"Reject")}>
                {request.requesterUid===currentUser?.id?"Withdraw my request":"Reject correction"}
              </Button>
            </div>}
          </>}
        </div>)}
      </div>
      {error&&<p className="form-error field--full" role="alert">{error}</p>}
      {notice&&<p className="form-notice field--full" role="status">{notice}</p>}
    </div>
  </Modal>;
}
