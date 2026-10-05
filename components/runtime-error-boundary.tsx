"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordRuntimeError } from "../lib/runtime-diagnostics";

type Props={children:ReactNode;scope:string;onRecover?:()=>void};
type State={error:Error|null;diagnosticId?:string};

export class RuntimeErrorBoundary extends Component<Props,State>{
  state:State={error:null};

  static getDerivedStateFromError(error:Error):State{return{error};}

  componentDidCatch(error:Error,info:ErrorInfo){
    const diagnosticId=recordRuntimeError(error,this.props.scope,info.componentStack??undefined);
    this.setState({diagnosticId});
  }

  componentDidUpdate(previous:Props){
    if(previous.scope!==this.props.scope&&this.state.error)this.setState({error:null,diagnosticId:undefined});
  }

  private recover=()=>{
    this.setState({error:null,diagnosticId:undefined});
    this.props.onRecover?.();
  };

  render(){
    if(!this.state.error)return this.props.children;
    return <div role="alert" style={{maxWidth:760,margin:"48px auto",padding:28,border:"1px solid #d7dce4",borderRadius:18,background:"#fff",boxShadow:"0 12px 40px rgba(15,23,42,.08)"}}>
      <p style={{margin:"0 0 8px",fontSize:12,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"#667085"}}>Momentum recovery</p>
      <h2 style={{margin:"0 0 10px",fontSize:24}}>This section hit a runtime error.</h2>
      <p style={{margin:"0 0 18px",lineHeight:1.55,color:"#475467"}}>The rest of Momentum is still available. Return to the dashboard or reload the app. A local diagnostic was saved so the failure can be traced without taking down the whole workspace.</p>
      {this.state.diagnosticId&&<p style={{margin:"0 0 18px",fontSize:12,color:"#667085"}}>Diagnostic: {this.state.diagnosticId}</p>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="button" onClick={this.recover} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #cfd5df",background:"#fff",fontWeight:700,cursor:"pointer"}}>Return to dashboard</button><button type="button" onClick={()=>window.location.reload()} style={{padding:"10px 14px",borderRadius:10,border:0,background:"#132a57",color:"#fff",fontWeight:700,cursor:"pointer"}}>Reload Momentum</button></div>
    </div>;
  }
}
