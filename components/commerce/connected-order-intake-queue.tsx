"use client";
import {useEffect,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {listConnectedOrderIntakes,type OrderIntakeRecord} from "../../lib/firebase-order-intake";

/** Read-only Administrator work queue. Not a substitute for a binding order approval. */
export function ConnectedOrderIntakeQueue(){
 const firebase=useFirebaseSessionOptional();
 const session=firebase?.session;
 const [records,setRecords]=useState<OrderIntakeRecord[]>([]);
 const [feedback,setFeedback]=useState("");
 const [loading,setLoading]=useState(false);
 const [loaded,setLoaded]=useState(false);
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
 return <section className="prototype-panel" aria-label="Connected nonbinding order-intake queue">
  <h2>Commercial intake awaiting review</h2>
  <p className="prototype-note">Source-verified requests, not sales orders. No invoice, payment, reservation or commission follows from this queue. Verify customer terms, authorized prices, stock and delivery readiness before manually advancing a request through the separate approved order workflow.</p>
  <button type="button" disabled={loading||!session} onClick={()=>void fetchQueue()}>{loading?"Refreshing…":"Refresh source intake"}</button>
  {feedback&&<p role="status" className="prototype-note">{feedback}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
   <th>Request</th><th>Customer account</th><th>Requested by</th><th>Cases</th><th>Received</th><th>Stage</th>
  </tr></thead><tbody>
   {records.map(row=><tr key={row.id}>
    <td><strong>{row.id}</strong>{row.note&&<small className="prototype-description">{row.note}</small>}</td>
    <td>{row.accountId}</td><td>{row.requestedByUid}</td>
    <td>{row.lines.map(line=>line.cases+" × "+line.description).join(" · ")}</td>
    <td>{row.createdAt.slice(0,16).replace("T"," ")+" UTC"}</td>
    <td>{row.status}</td>
   </tr>)}
  </tbody></table></div>
  {loaded&&records.length===0&&<p className="prototype-empty">No entries in the latest-request window.</p>}
  <p className="prototype-note">The approval controls below apply to canonical priced orders only, never these nonbinding requests.</p>
 </section>;
}
