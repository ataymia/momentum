"use client";
import {useEffect,useState} from "react";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {getFirestoreDocument,listFirestoreCollection} from "../../lib/firebase-firestore-rest";
import {registerLiveTestSkus} from "../../lib/product-catalog";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {Button,Field,Modal} from "../ui";

type QAProduct={id:string;description:string;shortName:string;casePack:number;active:boolean;testOnly:boolean};
type QAStock={onHand:number;reserved:number};
const requestId=()=>"qa-live-"+(typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36)+Math.random().toString(36).slice(2));

export function LiveQAProductManager({open,onClose}:{open:boolean;onClose:()=>void}){
 const {currentUser,scope}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const [products,setProducts]=useState<QAProduct[]>([]);
 const [selected,setSelected]=useState("");
 const [name,setName]=useState("QA Test Product - Do Not Sell");
 const [shortName,setShortName]=useState("QA Test");
 const [casePack,setCasePack]=useState(24);
 const [cases,setCases]=useState(10);
 const [stock,setStock]=useState<QAStock>({onHand:0,reserved:0});
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const orders=scope.orders.filter(order=>order.testOnly===true&&order.testSkuId===selected);
 const load=async()=>{
   if(currentUser?.role!=="Administrator")return;
   const records=await listFirestoreCollection<QAProduct>("liveTestProducts",100);
   const valid=records.filter(p=>p.testOnly===true&&p.active===true);
   setProducts(valid);registerLiveTestSkus(valid);
   setSelected(old=>valid.some(p=>p.id===old)?old:valid[0]?.id??"");
 };
 useEffect(()=>{if(!open||currentUser?.role!=="Administrator")return;
   let active=true;listFirestoreCollection<QAProduct>("liveTestProducts",100).then(rows=>{
    if(!active)return;const valid=rows.filter(p=>p.testOnly===true&&p.active===true);
    setProducts(valid);registerLiveTestSkus(valid);setSelected(old=>valid.some(p=>p.id===old)?old:valid[0]?.id??"");
   }).catch(()=>{if(active)setError("Could not load QA products.")});
   return()=>{active=false};
 },[open,currentUser?.role]);
 useEffect(()=>{if(!open||!selected)return;let active=true;
   getFirestoreDocument<QAStock>("liveTestInventory/"+selected).then(v=>{
     if(active)setStock({onHand:v?.onHand??0,reserved:v?.reserved??0});
   }).catch(()=>{if(active)setError("Could not read virtual QA stock.")});
   return()=>{active=false};
 },[open,selected]);
 const execute=async(payload:Record<string,unknown>)=>{
  const token=firebase?.session?.idToken;
  if(!token)throw Error("Active Administrator session required.");
  const response=await fetch(firebaseFunctionUrl("liveTestProductWorkflow"),{
   method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
   body:JSON.stringify({...payload,requestId:requestId()}),
  });
  const json=await response.json().catch(()=>null) as {ok?:boolean;message?:string;status?:string}|null;
  if(!response.ok||json?.ok!==true)throw Error(json?.message||"QA action was not confirmed.");
  return json;
 };
 const create=async()=>{
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{
   const skuId=requestId();
   await execute({action:"createSku",skuId,testOnly:true,description:name.trim(),shortName:shortName.trim(),casePack});
   await load();setSelected(skuId);setNotice("Internal QA SKU created. It is not sellable inventory.");
  }catch(e){setError(e instanceof Error?e.message:"Could not create QA SKU.")}
  finally{setBusy(false)}
 };
 const act=async(action:"receive"|"advance",orderId?:string)=>{
  if(busy||!selected)return;setBusy(true);setError("");setNotice("");
  try{
   const result=await execute({action,skuId:selected,...(action==="receive"?{cases}:{orderId})});
   if(action==="receive")setNotice("Virtual cases recorded. Real warehouse stock is unchanged.");
   else setNotice("QA order progressed to "+result.status+". Customer billing and live inventory were not touched.");
   const next=await getFirestoreDocument<QAStock>("liveTestInventory/"+selected);
   setStock({onHand:next?.onHand??0,reserved:next?.reserved??0});
  }catch(e){setError(e instanceof Error?e.message:"QA action failed.")}
  finally{setBusy(false)}
 };
 if(currentUser?.role!=="Administrator")return null;
 return <Modal open={open} onClose={()=>{if(!busy)onClose()}} wide title="Live pipeline QA products"
 description="Create test-only SKUs in the production catalog, place $0 orders through Orders, and progress them with virtual QA cases. No real stock, customer emails, payment or commission."
 footer={<Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button>}>
 <div className="form-grid">
  <Field label="QA SKU name"><input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></Field>
  <Field label="Short name"><input value={shortName} maxLength={48} onChange={e=>setShortName(e.target.value)}/></Field>
  <Field label="Units per virtual case"><input type="number" min="1" max="1000" value={casePack} onChange={e=>setCasePack(Number(e.target.value))}/></Field>
  <div className="field--full"><Button disabled={busy||name.trim().length<3||shortName.trim().length<2} onClick={()=>void create()}>Create live QA SKU ($0)</Button></div>
  <Field label="Internal QA product"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose QA SKU</option>{products.map(p=><option key={p.id} value={p.id}>{p.description}</option>)}</select></Field>
  {selected&&<>
    <div className="field--full form-callout"><p><strong>Virtual stock: {stock.onHand} cases</strong> · Reserved: {stock.reserved} · Available: {stock.onHand-stock.reserved}. These are not physical Golden Eagle cases.</p></div>
    <Field label="Add virtual cases"><input type="number" min="1" max="10000" value={cases} onChange={e=>setCases(Number(e.target.value))}/></Field>
    <div className="field--full"><Button disabled={busy||!Number.isInteger(cases)||cases<1} variant="secondary" onClick={()=>void act("receive")}>Add virtual QA cases</Button></div>
    <div className="field--full"><strong>Test orders in normal Orders workflow</strong>
      <p>Create a new order in Orders, select this QA product, submit it for approval, then return here to advance its virtual fulfillment.</p>
      {orders.map(order=><div className="form-callout" key={order.id}><p>{order.number} · {order.cases} virtual cases · {order.status} · $0</p>
        {["Approved","Allocated","Out for delivery"].includes(order.status)&&
         <Button disabled={busy} size="sm" onClick={()=>void act("advance",order.id)}>
           {order.status==="Approved"?"Allocate virtual cases":order.status==="Allocated"?"Mark virtual out for delivery":"Confirm virtual delivery"}
         </Button>}
      </div>)}
    </div>
  </>}
  {error&&<p className="form-error field--full" role="alert">{error}</p>}
  {notice&&<p className="form-notice field--full" role="status">{notice}</p>}
 </div></Modal>;
}
