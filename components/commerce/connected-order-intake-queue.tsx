"use client";
import {Fragment,useEffect,useRef,useState} from "react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {useWorkspace} from "../../lib/workspace-context";
import {listConnectedOrderIntakes,getConnectedOrderIntake,decideConnectedOrderIntake,type OrderIntakeStage,type OrderIntakeRecord} from "../../lib/firebase-order-intake";

const final=(stage:OrderIntakeStage)=>stage==="Approved"||stage==="Declined";
const stageLabel=(stage:OrderIntakeStage)=>final(stage)?stage:"Commercial review";

/** One source-backed approval queue. Opening Review reveals the request and exactly two decisions. */
export function ConnectedOrderIntakeQueue(){
 const firebase=useFirebaseSessionOptional();
 const {scope,data}=useWorkspace();
 const session=firebase?.session;
 const [records,setRecords]=useState<OrderIntakeRecord[]>([]);
 const [feedback,setFeedback]=useState("");
 const [loading,setLoading]=useState(false);
 const [loadingOlder,setLoadingOlder]=useState(false);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [pageCount,setPageCount]=useState(0);
 const [loaded,setLoaded]=useState(false);
 const [selectedId,setSelectedId]=useState("");
 const [declining,setDeclining]=useState(false);
 const [reason,setReason]=useState("");
 const [saving,setSaving]=useState(false);
 const [filter,setFilter]=useState<"pending"|"all">("pending");
 const pending=useRef<{fingerprint:string;requestId:string}|null>(null);
 const selected=records.find(item=>item.id===selectedId);
 const visible=records.filter(row=>filter==="all"||!final(row.status));
 const requester=(row:OrderIntakeRecord)=>firebase?.directory.find(u=>u.id===row.requestedByUid)?.name
  ||data.users.find(u=>u.id===row.requestedByUid)?.name||row.requestedByName||"Requester name unavailable";
 const account=(row:OrderIntakeRecord)=>scope.accounts.find(a=>a.id===row.accountId)?.name
  ||row.accountName||"Account name unavailable";
 const reviewedBy=(row:OrderIntakeRecord)=>firebase?.directory.find(u=>u.id===row.reviewedBy)?.name
  ||data.users.find(u=>u.id===row.reviewedBy)?.name||"Authorized reviewer";
 const choose=(row:OrderIntakeRecord)=>{
  setSelectedId(current=>current===row.id?"":row.id);
  setDeclining(false);setReason("");pending.current=null;setFeedback("");
 };
 const fetchQueue=async()=>{
  if(!session||saving)return;
  setLoading(true);
  try{
   const result=await listConnectedOrderIntakes(session);
   setRecords(result.records);setLoaded(true);setNextCursor(result.nextCursor);setPageCount(1);
   setFeedback("Approval queue refreshed from company records.");
  }catch(error){
   setFeedback(error instanceof Error?error.message:"Cannot load company approval requests.");
  }finally{setLoading(false);}
 };
 useEffect(()=>{
  if(!session)return;
  let active=true;
  void listConnectedOrderIntakes(session).then(result=>{
   if(active){setRecords(result.records);setLoaded(true);setNextCursor(result.nextCursor);setPageCount(1);}
  }).catch(error=>{
   if(active)setFeedback(error instanceof Error?error.message:"Approval requests could not be loaded.");
  });
  return()=>{active=false;};
 },[session]);
 const loadOlder=async()=>{
  if(!session||!nextCursor||loading||loadingOlder||saving)return;
  setLoadingOlder(true);
  try{
   const page=await listConnectedOrderIntakes(session,nextCursor);
   setRecords(current=>{const seen=new Set(current.map(row=>row.id));return[...current,...page.records.filter(row=>!seen.has(row.id))];});
   setNextCursor(page.nextCursor);setPageCount(count=>count+1);
  }catch(error){setFeedback(error instanceof Error?error.message:"Older requests could not be verified.");}
  finally{setLoadingOlder(false);}
 };
 const decide=async(status:"Approved"|"Declined")=>{
  if(!session||!selected||saving||final(selected.status))return;
  const clean=status==="Declined"?reason.trim():"";
  if(status==="Declined"&&(clean.length<10||clean.length>1000)){
   setFeedback("Enter a decline reason of 10–1000 characters so the requester knows what happened.");return;
  }
  const draft={intakeId:selected.id,expectedStatus:selected.status,
   expectedRevision:selected.reviewRevision??0,nextStatus:status,reason:clean};
  const fingerprint=JSON.stringify(draft);
  if(!pending.current||pending.current.fingerprint!==fingerprint)
   pending.current={fingerprint,requestId:crypto.randomUUID().replaceAll("-","")};
  setSaving(true);setFeedback("");
  try{
   const receipt=await decideConnectedOrderIntake(session,draft,pending.current.requestId);
   const readback=await getConnectedOrderIntake(session,selected.id);
   if(readback.status!==status||readback.reviewRevision!==receipt.reviewRevision)
    throw new Error("The decision was saved but verification is incomplete. Refresh before acting again.");
   setRecords(current=>current.map(row=>row.id===selected.id?readback:row));
   setFeedback(status==="Approved"
    ?"Commercial review approved and saved. The request is ready for priced order preparation; no inventory, invoice or payment has been posted."
    :"Declined and saved. The reason is available in the requester's in-app request history; no external email was sent.");
   setSelectedId("");setReason("");setDeclining(false);pending.current=null;
  }catch(error){
   setFeedback(error instanceof Error?error.message:"Decision unconfirmed. Refresh company records before retrying.");
  }finally{setSaving(false);}
 };
 return <section className="prototype-panel" aria-label="Connected commercial order approval queue">
  <h2>Commercial orders awaiting approval</h2>
  <p className="prototype-note">Select Review to see the request. Approve with one click, or Decline and enter a reason. Commercial approval does not bypass separate verified pricing, inventory or payment controls.</p>
  <div className="prototype-controls">
   <button type="button" disabled={loading||loadingOlder||saving||!session} onClick={()=>void fetchQueue()}>{loading?"Refreshing…":"Refresh approvals"}</button>
   <label>Show <select aria-label="Show commercial approval requests" value={filter} onChange={e=>setFilter(e.target.value as "pending"|"all")}>
    <option value="pending">Awaiting review</option><option value="all">All requests</option>
   </select></label>
  </div>
  {feedback&&<p role="status" className="prototype-note">{feedback}</p>}
  <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr>
   <th>Request</th><th>Customer account</th><th>Requested by</th><th>Cases</th><th>Submitted</th><th>Stage</th><th>Action</th>
  </tr></thead><tbody>
   {visible.map(row=><Fragment key={row.id}>
    <tr>
     <td><strong>{row.id}</strong></td>
     <td title={row.accountId}>{account(row)}</td>
     <td title={row.requestedByUid}>{requester(row)}</td>
     <td>{row.totalCases.toLocaleString("en-US")}</td>
     <td>{row.createdAt.slice(0,16).replace("T"," ")+" UTC"}</td>
     <td>{stageLabel(row.status)}</td>
     <td><button type="button" aria-expanded={selectedId===row.id} disabled={saving} onClick={()=>choose(row)}>{selectedId===row.id?"Close":"Review"}</button></td>
    </tr>
    {selectedId===row.id&&<tr><td colSpan={7}>
     <section className="prototype-panel" aria-label={"Review request "+row.id}>
      <h3>Review order request</h3>
      <dl className="prototype-facts">
       <div><dt>Customer account</dt><dd>{account(row)}</dd></div>
       <div><dt>Requested by</dt><dd>{requester(row)}</dd></div>
       <div><dt>Requested cases</dt><dd>{row.totalCases}</dd></div>
       <div><dt>Status</dt><dd>{stageLabel(row.status)}</dd></div>
      </dl>
      <div className="prototype-table-scroll"><table className="prototype-table"><thead><tr><th>Product</th><th>Cases</th></tr></thead><tbody>
       {row.lines.map(line=><tr key={line.skuId}><td>{line.description}</td><td>{line.cases}</td></tr>)}
      </tbody></table></div>
      {row.note&&<p><strong>Request notes:</strong> {row.note}</p>}
      {final(row.status)?<p className="prototype-note">
       {row.status==="Approved"?"Approved for order preparation":"Declined"+(row.reviewReason?": "+row.reviewReason:"")}
       {row.reviewedAt?" · "+row.reviewedAt.slice(0,16).replace("T"," ")+" UTC · "+reviewedBy(row):""}
      </p>:<div className="prototype-controls">
       <button type="button" disabled={saving} onClick={()=>void decide("Approved")}>{saving?"Saving…":"Approve"}</button>
       <button type="button" disabled={saving} onClick={()=>{setDeclining(value=>!value);setReason("");pending.current=null;}}>Decline</button>
       {declining&&<div className="prototype-approval-return">
        <label>Reason for decline <textarea aria-label="Decline order reason" required minLength={10} maxLength={1000}
         disabled={saving} value={reason} onChange={e=>{setReason(e.target.value);pending.current=null;}}
         placeholder="Explain why this request cannot proceed. The requester will see this reason in Momentum."/>
        </label>
        <button type="button" disabled={saving||reason.trim().length<10} onClick={()=>void decide("Declined")}>Confirm decline</button>
        <button type="button" disabled={saving} onClick={()=>{setDeclining(false);setReason("");}}>Cancel</button>
       </div>}
      </div>}
     </section>
    </td></tr>}
   </Fragment>)}
  </tbody></table></div>
  {loaded&&visible.length===0&&<p className="prototype-empty">No requests match this view.</p>}
  {loaded&&<div className="prototype-controls">
   <span className="prototype-note">{records.length} source requests loaded across {pageCount} page(s).</span>
   {nextCursor&&<button type="button" disabled={loading||loadingOlder||saving||!session} onClick={()=>void loadOlder()}>{loadingOlder?"Loading…":"Load older source requests"}</button>}
  </div>}
 </section>;
}
