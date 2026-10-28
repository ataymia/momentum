"use client";
import {useEffect,useState} from "react";
import {getFirestoreDocument,listFirestoreCollection} from "../../lib/firebase-firestore-rest";
import {firebaseFunctionUrl} from "../../lib/firebase-functions";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {registerLiveTestSkus} from "../../lib/product-catalog";
import {Button,Field,Modal} from "../ui";

type QaProduct={id:string;description:string;shortName:string;casePack:number;active:boolean;testOnly:boolean;environment:string};
type QaStock={skuId:string;onHand:number;reserved:number};
const nonce=()=>("qa-live-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,12));

export function LiveQaSkuManager({open,onClose}:{open:boolean;onClose:()=>void}){
 const {currentUser}=useWorkspace();
 const firebase=useFirebaseSessionOptional();
 const [products,setProducts]=useState<QaProduct[]>([]);
 const [selected,setSelected]=useState("");
 const [description,setDescription]=useState("QA Live Test Product");
 const [shortName,setShortName]=useState("QA Test");
 const [casePack,setCasePack]=useState(24);
 const [cases,setCases]=useState(20);
 const [stock,setStock]=useState<QaStock|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const load=async()=>{
  if(!open||currentUser?.role!=="Administrator")return;
  try{
   const records=(await listFirestoreCollection<QaProduct>("liveTestProducts"))
    .filter(item=>item.testOnly&&item.environment==="production"&&item.active);
   setProducts(records);
   registerLiveTestSkus(records);
   setSelected(old=>records.some(x=>x.id===old)?old:records[0]?.id??"");
  }catch{setError("Live QA catalog unavailable. Verify access and Firestore rules.")}
 };
 useEffect(()=>{if(!open)return;void load();},[open]);
 useEffect(()=>{
  if(!open||!selected)return;
  let active=true;
  getFirestoreDocument<QaStock>("liveTestInventory/"+selected)
   .then(next=>{if(active)setStock(next);})
   .catch(()=>{if(active)setError("Could not read virtual QA cases.")});
  return()=>{active=false};
 },[selected,open]);
 const submit=async(action:"createSku"|"receive")=>{
  if(busy)return;
  setError("");setMessage("");
  const token=firebase?.session?.idToken;
  if(!token){setError("An active Administrator session is required.");return;}
  const skuId=action==="createSku"?nonce():selected;
  if(action==="createSku"&&(!description.trim()||!shortName.trim()||!Number.isInteger(casePack)||casePack<1)){
   setError("Enter a test-only product name, short label and case pack.");return;
  }
  if(action==="receive"&&(!Number.isInteger(cases)||cases<1||cases>10000)){
   setError("Virtual cases must be 1 to 10,000.");return;
  }
  setBusy(true);
  try{
   const response=await fetch(firebaseFunctionUrl("liveTestProductWorkflow"),{
    method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
    body:JSON.stringify({action,skuId,requestId:nonce(),
     ...(action==="createSku"?{description:description.trim(),shortName:shortName.trim(),casePack,testOnly:true}:
      {cases})}),
   });
   const result=await response.json().catch(()=>null) as {ok?:boolean;onHand?:number;message?:string}|null;
   if(!response.ok||!result?.ok)throw Error(result?.message||"QA action was not confirmed.");
   if(action==="createSku"){await load();setSelected(skuId);setMessage("Live QA SKU added to the production order selector. No real stock was received.");}
   else{setStock(old=>old?{...old,onHand:result.onHand??old.onHand}:old);
    setMessage("Virtual QA cases added. Physical warehouse inventory is unchanged.");}
  }catch(e){setError(e instanceof Error?e.message:"Live QA action failed.");}
  finally{setBusy(false);}
 };
 if(currentUser?.role!=="Administrator")return null;
 return <Modal open={open} title="Live QA products and virtual cases"
  description="Use these products in the regular Orders workflow. These SKUs are test-only, priced at $0, and never enter physical inventory, receivables or commissions."
  wide onClose={()=>{if(!busy)onClose()}}
  footer={<Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button>}>
   <div className="form-grid">
    <div className="field--full"><strong>Create live internal test SKU</strong></div>
    <Field label="Product name"><input maxLength={120} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
    <Field label="Short label"><input maxLength={48} value={shortName} onChange={e=>setShortName(e.target.value)}/></Field>
    <Field label="Units per case"><input type="number" min="1" max="1000" value={casePack} onChange={e=>setCasePack(Number(e.target.value))}/></Field>
    <Button type="button" disabled={busy} onClick={()=>void submit("createSku")}>Create live QA SKU</Button>
    <div className="field--full"><strong>Virtual stock only</strong></div>
    <Field label="Test product"><select value={selected} onChange={e=>setSelected(e.target.value)}>
      {products.map(product=><option key={product.id} value={product.id}>{product.description} (QA only)</option>)}
    </select></Field>
    <Field label="Virtual cases to add"><input type="number" min="1" max="10000" value={cases} onChange={e=>setCases(Number(e.target.value))}/></Field>
    <div className="field--full"><p>Virtual on-hand: {stock?.onHand??"Not loaded"} cases. Reserved: {stock?.reserved??0} cases.</p></div>
    <Button type="button" disabled={busy||!selected} onClick={()=>void submit("receive")}>Add virtual test cases</Button>
    {error&&<p className="form-error field--full" role="alert">{error}</p>}
    {message&&<p className="form-notice field--full" role="status">{message}</p>}
   </div>
 </Modal>;
}
