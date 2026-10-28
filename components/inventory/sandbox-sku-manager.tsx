"use client";
import {useEffect,useState} from "react";
import {validateCustomSku,type CustomSku} from "../../lib/custom-sku-policy";
import {getFirestoreDocument,listFirestoreCollection,setFirestoreDocument} from "../../lib/firebase-firestore-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {Button,Field,Modal} from "../ui";

type TestOrder={id:string;skuId:string;cases:number;status:string;createdAt:string};
type TestStock={skuId:string;onHand:number;updatedAt:string};
const id=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const requestId=()=>("qa-"+id().replace(/[^A-Za-z0-9_-]/g,"").slice(0,66));

export function SandboxSkuManager({open,onClose}:{open:boolean;onClose:()=>void}){
  const {currentUser}=useWorkspace();
  const firebase=useFirebaseSessionOptional();
  const [skus,setSkus]=useState<CustomSku[]>([]);
  const [orders,setOrders]=useState<TestOrder[]>([]);
  const [selected,setSelected]=useState("");
  const [stock,setStock]=useState(0);
  const [name,setName]=useState("");
  const [shortName,setShortName]=useState("");
  const [casePack,setCasePack]=useState(24);
  const [stockCases,setStockCases]=useState(10);
  const [orderCases,setOrderCases]=useState(1);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const load=async()=>{
    if(!open||currentUser?.role!=="Administrator")return;
    setBusy(true);setError("");
    try{
      const records=await listFirestoreCollection<CustomSku>("sandboxProducts");
      const next=records.filter(r=>r.environment==="sandbox"&&r.active);
      setSkus(next);
      if(!selected&&next[0])setSelected(next[0].id);
      const history=await listFirestoreCollection<TestOrder>("sandboxOrders");
      setOrders(history.filter(o=>o.id&&o.skuId).slice(-100).reverse());
    }catch{setError("Sandbox records could not load. Verify Administrator access and Firestore rules.");}
    finally{setBusy(false);}
  };
  useEffect(()=>{if(!open)return;const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[open]);
  useEffect(()=>{
    let active=true;
    if(!open||!selected)return;
    getFirestoreDocument<TestStock>("sandboxInventory/"+selected).then(value=>{
      if(active)setStock(value?.onHand??0);
    }).catch(()=>{if(active)setError("Unable to load simulated stock.")});
    return()=>{active=false};
  },[selected,open]);

  const createSku=async()=>{
    if(busy||!currentUser)return;
    setError("");setNotice("");
    const check=validateCustomSku({description:name,shortName,casePack,environment:"sandbox"},skus);
    if(!check.ok){setError(check.message);return;}
    setBusy(true);
    try{
      const skuId="qa-"+id().replace(/[^A-Za-z0-9_-]/g,"").slice(0,66);
      const product:CustomSku={...check.draft,id:skuId,active:true,
        createdBy:currentUser.id,createdAt:new Date().toISOString()};
      await setFirestoreDocument("sandboxProducts/"+skuId,{...product});
      setSkus(old=>[...old,product]);setSelected(skuId);setName("");setShortName("");
      setStock(0);setNotice("Test SKU created in isolated sandbox catalog.");
    }catch{setError("Test SKU was not created. Check the signed-in role and connection.");}
    finally{setBusy(false);}
  };
  const action=async(command:"receive"|"place"|"deliver",orderId?:string)=>{
    if(busy||!selected)return;
    setError("");setNotice("");
    const token=firebase?.session?.idToken;
    if(!token){setError("Sign in as an active Administrator to use the sandbox.");return;}
    setBusy(true);
    try{
      const payload={action:command,skuId:selected,requestId:requestId(),
        cases:command==="receive"?stockCases:orderCases,
        ...(orderId?{orderId}:{})};
      const response=await fetch(firebaseFunctionUrl("sandboxWorkflow"),{
        method:"POST",
        headers:{"content-type":"application/json",authorization:"Bearer "+token},
        body:JSON.stringify(payload),
      });
      const result=await response.json().catch(()=>null) as
        {ok?:boolean;message?:string;onHand?:number;orderId?:string}|null;
      if(!response.ok||result?.ok!==true)throw new Error(result?.message||"Sandbox request failed.");
      if(typeof result.onHand==="number")setStock(result.onHand);
      setNotice(command==="receive"?"Simulated stock updated.":
        command==="place"?"Sandbox test order placed.":"Sandbox test delivery completed. Simulated invoice only, no email.");
      const history=await listFirestoreCollection<TestOrder>("sandboxOrders");
      setOrders(history.filter(o=>o.id&&o.skuId).slice(-100).reverse());
    }catch(e){setError(e instanceof Error?e.message:"Test action was not completed.");}
    finally{setBusy(false);}
  };
  if(currentUser?.role!=="Administrator")return null;
  const currentSku=skus.find(sku=>sku.id===selected);
  return <Modal open={open} title="Sandbox SKU and order testing"
    description="Test products, quantities, orders and invoices stay separate from real inventory and customers. No real invoice emails or commissions."
    onClose={()=>{if(!busy)onClose()}} wide
    footer={<Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button>}>
    <div className="form-grid">
      <div className="field--full"><strong>Create a test product</strong></div>
      <Field label="Test product name"><input required maxLength={120} value={name}
        onChange={event=>setName(event.target.value)} placeholder="QA Widget Prototype"/></Field>
      <Field label="Short label"><input maxLength={48} value={shortName}
        onChange={event=>setShortName(event.target.value)} placeholder="QA Widget"/></Field>
      <Field label="Units per case"><input type="number" min="1" max="1000" step="1"
        value={casePack} onChange={event=>setCasePack(Number(event.target.value))}/></Field>
      <div className="field--full"><Button disabled={busy} onClick={()=>void createSku()}>Add test SKU</Button></div>
      <Field label="Sandbox test SKU"><select value={selected} onChange={event=>setSelected(event.target.value)}>
        <option value="">Select test product</option>
        {skus.map(sku=><option value={sku.id} key={sku.id}>{sku.description} ({sku.casePack}/case)</option>)}
      </select></Field>
      {currentSku&&<>
        <div className="field--full"><strong>Simulated stock: {stock} cases</strong></div>
        <Field label="Add simulated cases"><input type="number" min="1" max="10000" step="1"
          value={stockCases} onChange={event=>setStockCases(Number(event.target.value))}/></Field>
        <div className="field--full"><Button disabled={busy} variant="secondary" onClick={()=>void action("receive")}>Add test stock</Button></div>
        <Field label="Test order cases"><input type="number" min="1" max="10000" step="1"
          value={orderCases} onChange={event=>setOrderCases(Number(event.target.value))}/></Field>
        <div className="field--full"><Button disabled={busy} variant="secondary" onClick={()=>void action("place")}>Place sandbox order</Button></div>
        <div className="field--full"><strong>Sandbox orders</strong>
          {orders.filter(o=>o.skuId===selected).map(order=><div key={order.id} className="form-callout">
            <p>{order.id} · {order.cases} cases · {order.status}</p>
            {order.status==="Placed"&&<Button disabled={busy} size="sm" onClick={()=>void action("deliver",order.id)}>Simulate delivery</Button>}
          </div>)}
        </div>
      </>}
      {error&&<p className="form-error field--full" role="alert">{error}</p>}
      {notice&&<p className="form-notice field--full" role="status">{notice}</p>}
    </div>
  </Modal>;
}
