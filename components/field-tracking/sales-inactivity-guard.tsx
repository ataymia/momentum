"use client";

import {useCallback,useEffect,useState,type ReactNode} from "react";
import {AlertTriangle,Clock3,LogIn,RefreshCw} from "lucide-react";
import {useFirebaseSessionOptional} from "../../lib/firebase-session-context";
import {momentumStorage} from "../../lib/persistence";
import {salesInactivityRequest,type InactivityNotice} from "../../lib/sales-inactivity-client";
import {useWorkspace} from "../../lib/workspace-context";

type Phase="checking"|"ready"|"unavailable";
const panel:React.CSSProperties={position:"fixed",inset:0,zIndex:9999,background:"rgba(5,18,42,.86)",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"};
const card:React.CSSProperties={width:"min(550px,100%)",background:"#fff",color:"#14253e",padding:"32px",borderRadius:"18px",boxShadow:"0 20px 65px rgba(0,0,0,.3)",fontFamily:"Inter,Segoe UI,Arial,sans-serif"};
const button:React.CSSProperties={background:"#0d3181",color:"#fff",border:0,borderRadius:9,padding:"13px 20px",fontSize:17,fontWeight:700,cursor:"pointer"};
const altButton:React.CSSProperties={...button,background:"#e8eff8",color:"#122c59"};
const readableTime=(value?:string)=>value?new Date(value).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:"America/Phoenix"}):"unknown time";

export function SalesInactivityGuard({children}:{children:ReactNode}){
  const firebase=useFirebaseSessionOptional();
  const {currentUser}=useWorkspace();
  const active=Boolean(firebase?.session&&currentUser?.role==="Sales Representative"&&firebase.access?.accountState==="Active");
  const [phase,setPhase]=useState<Phase>("checking");
  const [notice,setNotice]=useState<InactivityNotice|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const refresh=useCallback(async()=>{
    if(!active||!firebase?.session)return;
    try{
      const result=await salesInactivityRequest(firebase.session,"read");
      setNotice(result.pending?result.notice??null:null);
      setError("");
      setPhase("ready");
    }catch(e){
      setError(e instanceof Error?e.message:"Unable to check shift status.");
      setPhase("unavailable");
    }
  },[active,firebase?.session]);
  useEffect(()=>{
    if(!active)return;
    void refresh();
    const interval=window.setInterval(()=>void refresh(),20_000);
    const onReturn=()=>{if(!document.hidden)void refresh();};
    document.addEventListener("visibilitychange",onReturn);
    window.addEventListener("focus",onReturn);
    return()=>{window.clearInterval(interval);document.removeEventListener("visibilitychange",onReturn);window.removeEventListener("focus",onReturn);};
  },[active,refresh]);
  const act=async(action:"acknowledge"|"clockIn")=>{
    if(!firebase?.session||busy)return;
    setBusy(true);setError("");
    try{
      await salesInactivityRequest(firebase.session,action);
      if(action==="clockIn"){
        const sync=await momentumStorage.refreshKeys(["momentum-demo-workspace-v5"]);
        if(!sync.ok)setError("Clock-in recorded, but your timecard has not refreshed yet. Refresh the page before clocking again.");
      }
      setNotice(null);setPhase("ready");
    }catch(e){setError(e instanceof Error?e.message:"Unable to update clock status. Please retry.");}
    finally{setBusy(false);}
  };
  if(!active)return <>{children}</>;
  if(phase==="checking"){
    return <div style={panel} role="status"><div style={card}><Clock3 size={30}/><h2 style={{fontSize:25,margin:"12px 0"}}>Checking your clock status</h2><p style={{fontSize:17}}>Confirming your current shift before opening Momentum.</p></div></div>;
  }
  if(notice){
    return <div style={panel} role="alertdialog" aria-modal="true" aria-labelledby="inactivity-heading"><div style={card}>
      <AlertTriangle size={38} color="#ae6d00"/>
      <h1 id="inactivity-heading" style={{fontSize:28,lineHeight:1.22,margin:"16px 0"}}>You have been clocked out due to inactivity.</h1>
      <p style={{fontSize:18,lineHeight:1.5}}>Your shift was automatically closed at <strong>{readableTime(notice.clockOutAt)} Arizona time</strong> because there were no qualifying CRM actions or new sign-ins for at least 60 minutes.</p>
      <p style={{fontSize:16,lineHeight:1.5}}>You are currently off the clock. To resume work, clock in again. You can also remain clocked out.</p>
      {error&&<p role="alert" style={{color:"#a61622",fontSize:15}}>{error}</p>}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:20}}>
        <button type="button" disabled={busy} style={button} onClick={()=>void act("clockIn")}><LogIn size={18} style={{verticalAlign:"middle",marginRight:7}}/>Clock back in</button>
        <button type="button" disabled={busy} style={altButton} onClick={()=>void act("acknowledge")}>Stay clocked out</button>
      </div>
      <p style={{fontSize:13,color:"#58677d",marginTop:20}}>If you worked during this period, report the missing activity and any time correction to your manager.</p>
    </div></div>;
  }
  if(phase==="unavailable"){
    return <><div role="alert" style={{padding:"12px 18px",background:"#fff1d6",fontSize:16,color:"#523b00",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <AlertTriangle size={20}/> Clock status could not be verified. {error} <button type="button" style={{...button,padding:"8px 12px",fontSize:15}} onClick={()=>void refresh()}><RefreshCw size={16} style={{verticalAlign:"middle"}}/> Retry</button>
    </div>{children}</>;
  }
  return <>{children}</>;
}
