"use client";
import {useEffect,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {navigateToRoute} from "../../lib/navigation-store";
import {listConnectedOrderIntakes,getConnectedOrderIntake,prepareConnectedApprovedIntake,type OrderIntakeRecord} from "../../lib/firebase-order-intake";
import {momentumStorage} from "../../lib/persistence";
import {COMMERCIAL_KEY} from "../../lib/workspace-context";
import {COMMERCE_STORAGE_KEY} from "../../lib/commerce-engine";

/** Approved source requests remain visible in Sales Orders even if a draft cannot yet be priced. */
export function ApprovedIntakeOrders(){
 const firebase=useFirebaseSessionOptional();
 const {currentUser,scope}=useWorkspace();
 const session=firebase?.session;
 const enabled=currentUser?.role==="Administrator"&&firebase?.status==="ready"&&Boolean(session);
 const [records,setRecords]=useState<OrderIntakeRecord[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const [details,setDetails]=useState("");
 const [manual,setManual]=useState({pricePerCase:"",terms:"COD",priceEvidence:""});
 useEffect(()=>{
  if(!enabled||!session)return;
  let active=true;
  void listConnectedOrderIntakes(session).then(page=>{
   if(active){setRecords(page.records);setNextCursor(page.nextCursor);setLoaded(true);}
  }).catch(e=>{if(active)setNotice(e instanceof Error?e.message:"Approved intake records could not be loaded.");});
  return()=>{active=false;};
 },[enabled,session]);
 if(!enabled)return null;
 const approved=records.filter(r=>r.status==="Approved");
 const accountName=(r:OrderIntakeRecord)=>scope.accounts.find(a=>a.id===r.accountId)?.name||r.accountName||"Customer account unavailable";
 const reload=async()=>{
  if(!session||busy)return;
  setBusy("reload");setNotice("");
  try{const page=await listConnectedOrderIntakes(session);setRecords(page.records);setNextCursor(page.nextCursor);setLoaded(true);}
  catch(e){setNotice(e instanceof Error?e.message:"Approved requests could not be refreshed.");}
  finally{setBusy("");}
 };
 const older=async()=>{
  if(!session||busy||!nextCursor)return;
  setBusy("older");
  try{
   const page=await listConnectedOrderIntakes(session,nextCursor);
   setRecords(rows=>{const seen=new Set(rows.map(r=>r.id));return[...rows,...page.records.filter(r=>!seen.has(r.id))];});
   setNextCursor(page.nextCursor);
  }catch(e){setNotice(e instanceof Error?e.message:"Older approvals could not be loaded.");}
  finally{setBusy("");}
 };
 const prepare=async(intakeId:string,withManual:boolean)=>{
  if(!session||busy)return;
  let pricing:Parameters<typeof prepareConnectedApprovedIntake>[2];
  if(withManual){
   const price=Number(manual.pricePerCase);
   if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(Math.round(price*100))||
      Math.abs(price*100-Math.round(price*100))>0.0001||manual.priceEvidence.trim().length<10){
    setNotice("Enter an authorized price in dollars per case and evidence of approval (at least 10 characters).");
    return;
   }
   pricing={pricePerCase:price,terms:manual.terms as NonNullable<Parameters<typeof prepareConnectedApprovedIntake>[2]>["terms"],
    priceEvidence:manual.priceEvidence.trim()};
  }
  setBusy(intakeId);setNotice("");
  try{
   const result=await prepareConnectedApprovedIntake(session,intakeId,pricing);
   const confirmed=await getConnectedOrderIntake(session,intakeId);
   setRecords(rows=>rows.map(r=>r.id===intakeId?confirmed:r));
   if(result.status==="Prepared"){
    if(confirmed.orderId!==result.orderId||confirmed.invoiceId!==result.invoiceId)
     throw new Error("Order preparation receipt saved; references have not finished loading. Refresh before retrying.");
    const sync=await momentumStorage.refreshKeys([COMMERCIAL_KEY,COMMERCE_STORAGE_KEY]);
    setNotice(sync.ok?"Sales order and internal draft invoice created. Check Orders and Finance → Invoices. No customer invoice was sent.":
     "Order and invoice were saved, but local refresh is unconfirmed. Reload the platform and check Orders before retrying.");
    setDetails("");
   }else{setDetails(intakeId);setNotice(result.message);}
  }catch(e){setNotice(e instanceof Error?e.message:"Preparation not confirmed. Reconcile before retrying.");}
  finally{setBusy("");}
 };
 return <section className="prototype-panel" aria-label="Approved requests and linked sales orders">
  <h2>Approved requests · order preparation</h2>
  <p className="prototype-note">An approved request stays here until its real sales order and draft invoice are linked. Only a verified account price and payment terms can create financial documents. No stock is allocated or customer invoice issued at this step.</p>
  <button type="button" disabled={Boolean(busy)} onClick={()=>void reload()}>Refresh approved requests</button>
  {notice&&<p role="status">{notice}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
   <th>Request</th><th>Customer</th><th>Cases</th><th>Order status</th><th>Next action</th>
  </tr></thead><tbody>
   {approved.map(r=><tr key={r.id}><td>{r.id}</td><td>{accountName(r)}</td><td>{r.totalCases}</td>
    <td>{r.orderId&&r.invoiceId?"Order "+r.orderId+" · invoice draft "+r.invoiceId:"Approved · awaiting order and invoice"}</td>
    <td>{r.orderId&&r.invoiceId?<div className="prototype-controls"><button type="button" onClick={()=>navigateToRoute("/sales/orders/"+encodeURIComponent(r.orderId!))}>Open sales order</button><button type="button" onClick={()=>navigateToRoute("/sales/invoices/"+encodeURIComponent(r.invoiceId!))}>Open invoice draft</button></div>:
     <button type="button" disabled={Boolean(busy)} onClick={()=>void prepare(r.id,false)}>
      {busy===r.id?"Checking…":"Create linked order & draft invoice"}
     </button>}
     {!r.orderId&&<button type="button" disabled={Boolean(busy)} aria-expanded={details===r.id}
      onClick={()=>{setDetails(v=>v===r.id?"":r.id);setManual({pricePerCase:"",terms:"COD",priceEvidence:""});}}>Confirm pricing</button>}
     {details===r.id&&!r.orderId&&<div className="prototype-controls">
      <label>Authorized price per case ($)
       <input aria-label={"Approved case price "+r.id} type="number" min="0.01" step="0.01"
        value={manual.pricePerCase} onChange={e=>setManual(v=>({...v,pricePerCase:e.target.value}))}/>
      </label>
      <label>Customer payment terms<select aria-label={"Approved payment terms "+r.id}
       value={manual.terms} onChange={e=>setManual(v=>({...v,terms:e.target.value}))}>
       {["COD","Prepaid","Net 7","Net 15","Net 30","Custom"].map(t=><option key={t}>{t}</option>)}
      </select></label>
      <label>Price authorization / source
       <textarea aria-label={"Pricing evidence "+r.id} maxLength={240} value={manual.priceEvidence}
        onChange={e=>setManual(v=>({...v,priceEvidence:e.target.value}))}
        placeholder="Record the agreed price approval and its source, not a guess."/>
      </label>
      <button type="button" disabled={Boolean(busy)||!manual.pricePerCase||manual.priceEvidence.trim().length<10}
       onClick={()=>void prepare(r.id,true)}>Prepare order and draft invoice</button>
     </div>}
    </td>
   </tr>)}
  </tbody></table></div>
  {loaded&&approved.length===0&&<p className="prototype-note">No approved requests in the loaded records. Previously prepared orders remain in the order register.</p>}
  {nextCursor&&<button type="button" disabled={Boolean(busy)} onClick={()=>void older()}>Load older approved requests</button>}
 </section>;
}
