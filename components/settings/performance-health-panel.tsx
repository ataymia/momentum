"use client";

import {useEffect,useState} from "react";
import {PERFORMANCE_DIAGNOSTICS_FLAG,PERFORMANCE_DIAGNOSTICS_KEY,
  type PerformanceTimingSample} from "../../lib/performance-diagnostics";
import {useWorkspace} from "../../lib/workspace-context";
import {Button,Section} from "../ui";

type Group={name:string;count:number;p50:number;p95:number;max:number};
const report=(rows:PerformanceTimingSample[]):Group[]=>{
  const groups=new Map<string,number[]>();
  for(const sample of rows){
    if(!Number.isFinite(sample.durationMs))continue;
    const nums=groups.get(sample.operation)??[];
    nums.push(sample.durationMs);
    groups.set(sample.operation,nums);
  }
  return [...groups].map(([name,values])=>{
    const sorted=values.sort((a,b)=>a-b);
    return{name,count:sorted.length,
      p50:sorted[Math.ceil(sorted.length*.5)-1]??0,
      p95:sorted[Math.ceil(sorted.length*.95)-1]??0,
      max:sorted[sorted.length-1]??0};
  }).sort((a,b)=>b.p95-a.p95);
};
const readSamples=():PerformanceTimingSample[]=>{
  try{
    const rows=JSON.parse(localStorage.getItem(PERFORMANCE_DIAGNOSTICS_KEY)??"[]") as unknown;
    return Array.isArray(rows)?rows.filter((x):x is PerformanceTimingSample=>
      Boolean(x&&typeof x==="object"&&typeof x.operation==="string"&&typeof x.durationMs==="number")):[];
  }catch{return[];}
};

/** Browser-only, opt-in measurements. Never exports customer records or credentials. */
export function PerformanceHealthPanel(){
  const {currentUser}=useWorkspace();
  const [enabled,setEnabled]=useState(false);
  const [samples,setSamples]=useState<PerformanceTimingSample[]>([]);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const handle=window.setTimeout(()=>{
      setEnabled(localStorage.getItem(PERFORMANCE_DIAGNOSTICS_FLAG)==="on");
      setSamples(readSamples());
    },0);
    return()=>window.clearTimeout(handle);
  },[]);
  if(currentUser?.role!=="Administrator")return null;
  const refresh=()=>{setSamples(readSamples());setMessage("Latest local timings loaded.");};
  const toggle=()=>{
    const next=!enabled;
    try{
      localStorage.setItem(PERFORMANCE_DIAGNOSTICS_FLAG,next?"on":"off");
      setEnabled(next);setMessage(next?"Timing capture enabled on this browser. Navigate the slow screens, then refresh this panel.":"Timing capture disabled.");
    }catch{setMessage("Browser storage is blocked; timing capture cannot be enabled.");}
  };
  const clear=()=>{
    try{localStorage.removeItem(PERFORMANCE_DIAGNOSTICS_KEY);setSamples([]);setMessage("Local timing samples cleared.");}
    catch{setMessage("Could not clear stored timing samples.");}
  };
  const copy=async()=>{
    const data={generatedAt:new Date().toISOString(),count:samples.length,
      measurements:report(samples),samples:samples.map(({at,operation,durationMs,count,page})=>({at,operation,durationMs,count,page}))};
    try{await navigator.clipboard.writeText(JSON.stringify(data,null,2));
      setMessage("Anonymous timing report copied. No invoices, customer details or credentials included.");}
    catch{setMessage("Clipboard unavailable. Use the displayed summary.");}
  };
  return <Section title="Performance and sync diagnostics"
    description="P0 latency investigation: locally timed browser navigation, cloud reads, writes and journal saves. Capture is off unless you enable it.">
    <div className="request-actions">
      <Button size="sm" onClick={toggle}>{enabled?"Stop timing capture":"Start timing capture"}</Button>
      <Button size="sm" variant="secondary" onClick={refresh}>Refresh timings</Button>
      <Button size="sm" variant="secondary" onClick={()=>void copy()} disabled={!samples.length}>Copy timing report</Button>
      <Button size="sm" variant="ghost" onClick={clear} disabled={!samples.length}>Clear timings</Button>
    </div>
    <p>{enabled?"Capturing on this device. Repeat the slow invoice/order/navigation clicks.":"Capture disabled."} {samples.length} samples held locally (last 200).</p>
    {message&&<p role="status">{message}</p>}
    <div style={{overflowX:"auto",maxWidth:"100%"}}>
      <table><thead><tr><th>Measured operation</th><th>Samples</th><th>Median</th><th>95th percentile</th><th>Slowest</th></tr></thead>
        <tbody>{report(samples).map(row=><tr key={row.name}><td>{row.name}</td><td>{row.count}</td>
          <td>{Math.round(row.p50)} ms</td><td>{Math.round(row.p95)} ms</td><td>{Math.round(row.max)} ms</td></tr>)}</tbody></table>
    </div>
    <p>Interpretation: slow navigation with fast Firestore commits points toward rendering; slow commit/batch reads point toward the network/cloud; slow write-build or storage-journal points toward local processing. Timing does not expose record content.</p>
  </Section>;
}
