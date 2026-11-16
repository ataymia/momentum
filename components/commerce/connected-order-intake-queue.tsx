"use client";
import {useEffect,useRef,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {listConnectedOrderIntakes,decideConnectedOrderIntake,type OrderIntakeStage,type OrderIntakeRecord} from "../../lib/firebase-order-intake";

/** Read-only Administrator work queue. Not a substitute for a binding order approval. */
export function ConnectedOrderIntakeQueue(){
 const firebase=useFirebaseSessionOptional();
 const session=firebase?.session;
 const [records,setRecords]=useState<OrderIntakeRecord[]>([]);
 const [feedback,setFeedback]=useState("");
 const [loading,setLoading]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [selectedId,setSelectedId]=useState("");
 const [target,setTarget]=useState<OrderIntakeStage>("Needs clarification");
 const [reason,setReason]=useState("");
 const [saving,setSaving]=useState(false);
 const pending=useRef<{fingerprint:string;requestId:string}|null>(null);
 const selected=records.find(item=>item.id===selectedId);
 const nextStages=(stage:OrderIntakeStage):OrderIntakeStage[]=>stage==="Declined"?[]:
  (["Needs commercial review","Needs clarification","Pricing and inventory verification","Declined"] as OrderIntakeStage[]).filter(item=>item!==stage);
 const choose=(row:OrderIntakeRecord)=>{
  setSelectedId(row.id);setTarget(nextStages(row.status)[0]??"Declined");
  setReason("");pending.current=null;
 };
 const fetchQueue=async()=>{
  if(!session)return;
  setLoading(true);
  try{
   const result=await listConnectedOrderIntakes(session);
   setRecords(result.records);setLoaded(true);
   setFeedback("Showing up to "+result.limit+" most recent requests. Older intakes may exist.");
  }catch(error){
   setLoaded(false);
   setFeedback(error instanceof Error?error.message:
    "Could not verify the source queue. Do not assume that no requests exist.");
  }finally{setLoading(false);}
 };
 useEffect(()=>{
  if(!session)return;
  let active=true;
  const run=async()=>{
   try{
    const result=await listConnectedOrderIntakes(session);
    if(active){
     setRecords(result.records);setLoaded(true);
     setFeedback("Showing up to "+result.limit+" most recent requests. Older intakes may exist.");
    }
   }catch(error){
    if(active){setLoaded(false);setFeedback(error instanceof Error?error.message:"Source queue unavailable.");}
   }
  };
  void run();
  return()=>{active=false;};
 },[session]);
 const decide=async()=>{
  if(!session||!selected||saving)return;
  const clean=reason.trim();
  if(clean.length<10||clean.length>1000){
   setFeedback("Enter 10-1000 characters explaining the next step and evidence needed.");return;
  }
  const draft={intakeId:selected.id,expectedStatus:selected.status,nextStatus:target,reason:clean};
  const fingerprint=JSON.stringify(draft);
  const id=pending.current?.fingerprint===fingerprint?
   pending.current.requestId:crypto.randomUUID().replaceAll("-","");
  pending.current={fingerprint,requestId:id};
  setSaving(true);setFeedback("");
  try{
   await decideConnectedOrderIntake(session,draft,id);
   const latest=await listConnectedOrderIntakes(session);
   setRecords(latest.records);setLoaded(true);
   const readback=latest.records.find(item=>item.id===selected.id);
   if(!readback||readback.status!==target)
    throw new Error("The decision receipt was saved, but the current source stage was not confirmed.");
   setFeedback("Source-confirmed review: "+target+". No sale, cash, inventory or commission was posted.");
   setSelectedId("");setReason("");pending.current=null;
  }catch(error){
   setFeedback(error instanceof Error?error.message:"Review could not be confirmed. Refresh source.");
  }finally{setSaving(false);}
 };
 return <section className="prototype-panel" aria-label="Connected nonbinding order-intake queue">
  <h2>Commercial intake awaiting review</h2>
  <p className="prototype-note">Source-verified requests, not sales orders. No invoice, payment, reservation or commission follows from this queue. Verify customer terms, authorized prices, stock and delivery readiness before manually advancing a request through the separate approved order workflow.</p>
  <button type="button" disabled={loading||!session} onClick={()=>void fetchQueue()}>{loading?"Refreshing…":"Refresh source intake"}</button>
  {feedback&&<p role="status" className="prototype-note">{feedback}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
   <th>Request</th><th>Customer account</th><th>Requested by</th><th>Cases</th><th>Received</th><th>Stage</th><th>Review</th>
  </tr></thead><tbody>
   {records.map(row=><tr key={row.id}>
    <td><strong>{row.id}</strong>{row.note&&<small className="prototype-description">{row.note}</small>}</td>
    <td>{row.accountId}</td><td>{row.requestedByUid}</td>
    <td>{row.lines.map(line=>line.cases+" × "+line.description).join(" · ")}</td>
    <td>{row.createdAt.slice(0,16).replace("T"," ")+" UTC"}</td>
    <td>{row.status}{row.reviewedAt&&<small className="prototype-description">
     Reviewed {row.reviewedAt.slice(0,16).replace("T"," ")} UTC by {row.reviewedBy}. {row.reviewReason}
    </small>}</td>
    <td><button type="button" disabled={saving||row.status==="Declined"||!session}
     onClick={()=>choose(row)}>{row.status==="Declined"?"Closed":"Review"}</button></td>
   </tr>)}
  </tbody></table></div>
  {loaded&&records.length===0&&<p className="prototype-empty">No entries in the latest-request window.</p>}
  {selected&&selected.status!=="Declined"&&<form className="prototype-controls" onSubmit={event=>{event.preventDefault();void decide();}}>
   <strong>Review {selected.id}</strong>
   <label>Next stage <select value={target} disabled={saving} onChange={event=>{setTarget(event.target.value as OrderIntakeStage);pending.current=null;}}>
    {nextStages(selected.status).map(stage=><option key={stage}>{stage}</option>)}
   </select></label>
   <label>Decision reason and missing evidence <textarea aria-label="Intake review reason" required
    minLength={10} maxLength={1000} value={reason} disabled={saving}
    onChange={event=>{setReason(event.target.value);pending.current=null;}}/></label>
   <button type="submit" disabled={saving||reason.trim().length<10}>{saving?"Saving source review…":"Save nonbinding review"}</button>
   <button type="button" disabled={saving} onClick={()=>{setSelectedId("");pending.current=null;}}>Cancel</button>
  </form>}
  <p className="prototype-note">Reviewing a request never approves a price, creates an invoice, allocates inventory, charges a customer or earns a commission. A separate validated canonical order is required before any such action.</p>
 </section>;
}
