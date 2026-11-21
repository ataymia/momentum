"use client";
import {useEffect,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {listMyConnectedOrderIntakes,type OrderIntakeStage} from "../../lib/firebase-order-intake";

type Row={id:string;status:OrderIntakeStage;createdAt:string;totalCases:number;declineReason?:string};
const statusLabel=(status:OrderIntakeStage)=>status==="Approved"?"Approved for order preparation":
 status==="Declined"?"Declined":"Awaiting commercial review";

/** Source-backed in-app return path, available to the person who submitted the request. */
export function MyConnectedOrderIntakes(){
 const session=useFirebaseSessionOptional()?.session;
 const [rows,setRows]=useState<Row[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const refresh=async()=>{
  if(!session)return;
  setLoading(true);setError("");
  try{setRows(await listMyConnectedOrderIntakes(session));setLoaded(true);}
  catch(e){setError(e instanceof Error?e.message:"Your requests could not be verified.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{
  if(!session)return;
  let active=true;
  void listMyConnectedOrderIntakes(session).then(records=>{
   if(active){setRows(records);setLoaded(true);}
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Request status unavailable.");});
  return()=>{active=false;};
 },[session]);
 if(!session)return null;
 return <section className="prototype-panel" aria-label="My submitted order requests">
  <h3>My submitted requests</h3>
  <p className="prototype-note">The most recent 30 requests and their current company decisions. A decline reason appears here after review; this is an in-app status update, not an email.</p>
  <button type="button" disabled={loading} onClick={()=>void refresh()}>{loading?"Checking…":"Refresh my requests"}</button>
  {error&&<p role="status">{error}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
   <th>Request</th><th>Cases</th><th>Date</th><th>Status / response</th>
  </tr></thead><tbody>
   {rows.map(row=><tr key={row.id}><td>{row.id}</td><td>{row.totalCases}</td>
    <td>{row.createdAt.slice(0,10)}</td><td><strong>{statusLabel(row.status)}</strong>
     {row.status==="Declined"&&<small className="prototype-description">Reason: {row.declineReason||"Contact the reviewer for details."}</small>}
    </td></tr>)}
  </tbody></table></div>
  {loaded&&!rows.length&&<p className="prototype-note">You have not submitted any order requests yet.</p>}
 </section>;
}
