"use client";

import { useEffect } from "react";
import { recordRuntimeError } from "../lib/runtime-diagnostics";

export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{recordRuntimeError(error,"next-global-error");},[error]);
  return <html><body style={{margin:0,fontFamily:"Arial, sans-serif",background:"#f5f7fb",color:"#172033"}}><main style={{maxWidth:760,margin:"10vh auto",padding:"0 24px"}}><section style={{padding:30,borderRadius:18,background:"#fff",border:"1px solid #d9dee8",boxShadow:"0 12px 40px rgba(15,23,42,.08)"}}><p style={{margin:"0 0 8px",fontSize:12,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"#667085"}}>Momentum recovery</p><h1 style={{margin:"0 0 12px",fontSize:28}}>Momentum hit an unexpected client error.</h1><p style={{lineHeight:1.6,color:"#475467"}}>Reload the workspace or retry the failed render. A local diagnostic has been saved so the underlying exception can be traced instead of disappearing behind the generic error screen.</p><div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:20}}><button type="button" onClick={reset} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #cfd5df",background:"#fff",fontWeight:700,cursor:"pointer"}}>Retry</button><button type="button" onClick={()=>window.location.reload()} style={{padding:"10px 14px",borderRadius:10,border:0,background:"#132a57",color:"#fff",fontWeight:700,cursor:"pointer"}}>Reload Momentum</button></div></section></main></body></html>;
}
