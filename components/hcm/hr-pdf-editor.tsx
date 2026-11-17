"use client";
import {useEffect,useRef,useState,type FormEvent,type PointerEvent} from "react";
import {inspectHrPdf,fillHrPdf,updateHrPdfDraft,hasHrPdfChanges,type PdfInfo,type PdfOverlay,type HrPdfFields,type PdfDetectedField} from "../../lib/hr-pdf-editor-engine";

type Props={source:File;disabled?:boolean;onPrepared?:(file:File)=>void;onInvalidated?:()=>void};
/** Client-only PDF editing. No values or drawn marks are sent to third parties. */
export function HrPdfEditor({source,disabled=false,onPrepared,onInvalidated}:Props){
 const [info,setInfo]=useState<PdfInfo|null>(null);
 const [readySource,setReadySource]=useState<File|null>(null);
 const [sourceUrl,setSourceUrl]=useState("");
 const [values,setValues]=useState<HrPdfFields>({});
 const [overlays,setOverlays]=useState<PdfOverlay[]>([]);
 const [kind,setKind]=useState<PdfOverlay["kind"]>("Signature");
 const [page,setPage]=useState("1"),[x,setX]=useState("60"),[y,setY]=useState("90");
 const [width,setWidth]=useState("180"),[height,setHeight]=useState("38");
 const [manualText,setManualText]=useState("");
 const [drawn,setDrawn]=useState(false);
 const [flatten,setFlatten]=useState(true);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [generated,setGenerated]=useState<File|null>(null);
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const drawing=useRef(false),hasInk=useRef(false);
 const generation=useRef(0);
 const saving=useRef(false);
 useEffect(()=>{
  let live=true;
  generation.current+=1;saving.current=false;hasInk.current=false;drawing.current=false;
  const url=URL.createObjectURL(source);
  void Promise.resolve().then(()=>{
   if(!live)return;
   setSourceUrl(url);setInfo(null);setReadySource(null);setValues({});setOverlays([]);setGenerated(null);setMessage("");
   setBusy(false);setManualText("");setDrawn(false);setPage("1");
   canvas.current?.getContext("2d")?.clearRect(0,0,320,100);
  });
  void source.arrayBuffer().then(buffer=>inspectHrPdf(buffer)).then(result=>{
   if(live){setInfo(result);setReadySource(source);}
  }).catch(error=>{if(live)setMessage(error instanceof Error?error.message:"Unable to read PDF.");});
  return()=>{live=false;generation.current+=1;saving.current=false;URL.revokeObjectURL(url);};
 },[source]);
 const invalidate=()=>{generation.current+=1;setGenerated(null);onInvalidated?.();};
 const updateValue=(field:PdfDetectedField,value:string|boolean|undefined)=>{
  setValues(current=>updateHrPdfDraft(current,field,value));invalidate();
 };
 const draw=(event:PointerEvent<HTMLCanvasElement>)=>{
  const element=canvas.current,ctx=element?.getContext("2d");
  if(!element||!ctx)return;
  const rect=element.getBoundingClientRect();
  const pos={x:(event.clientX-rect.left)*(element.width/rect.width),
   y:(event.clientY-rect.top)*(element.height/rect.height)};
  if(event.type==="pointerdown"){
   drawing.current=true;
   element.setPointerCapture(event.pointerId);
   ctx.strokeStyle="#15243e";ctx.lineWidth=2.4;ctx.lineCap="round";ctx.lineJoin="round";
   ctx.beginPath();ctx.moveTo(pos.x,pos.y);
  }else if(event.type==="pointermove"&&drawing.current){
   ctx.lineTo(pos.x,pos.y);ctx.stroke();hasInk.current=true;
  }else if(event.type==="pointerup"||event.type==="pointercancel"){
   drawing.current=false;
   if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);
  }
 };
 const addOverlay=()=>{
  if(!info||readySource!==source||saving.current||disabled)return;
  const n={page:Number(page),x:Number(x),y:Number(y),width:Number(width),height:Number(height)};
  if(!Number.isSafeInteger(n.page)||n.page<1||n.page>info.pages.length||
   ![n.x,n.y,n.width,n.height].every(Number.isFinite)||
   n.x<0||n.y<0||n.width<5||n.height<5||
   n.x+n.width>info.pages[n.page-1].width||n.y+n.height>info.pages[n.page-1].height){
   setMessage("Coordinates must fit the selected PDF page.");return;
  }
  if(drawn&&(!hasInk.current||!canvas.current)){setMessage("Draw a mark in the signature box first.");return;}
  if(!drawn&&!manualText.trim()){setMessage("Enter the text or draw a signature.");return;}
  if(drawn&&!["Signature","Initials"].includes(kind)){
   setMessage("Drawn marks are available for signatures and initials.");return;
  }
  setOverlays(current=>[...current,{...n,kind,
   ...(drawn?{pngDataUrl:canvas.current!.toDataURL("image/png")}:{text:manualText.trim()})}]);
  invalidate();setMessage("");setManualText("");
  const ctx=canvas.current?.getContext("2d");ctx?.clearRect(0,0,320,100);
  hasInk.current=false;
 };
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(saving.current||disabled||!info||readySource!==source)return;
  if(!hasHrPdfChanges(values,overlays)){
   setMessage("Change a form field or add a visible mark before creating a completed PDF.");return;
  }
  invalidate();
  const attempt=generation.current;
  saving.current=true;setBusy(true);setMessage("");
  try{
   const completed=await fillHrPdf(new Uint8Array(await source.arrayBuffer()),
    values,overlays,flatten);
   if(generation.current!==attempt)return;
   const copy=new Uint8Array(completed.byteLength);copy.set(completed);
   const title=source.name.replace(/\.pdf$/i,"").replace(/[^A-Za-z0-9_-]/g,"-").slice(0,90);
   const file=new File([copy.buffer],title+"-completed.pdf",{type:"application/pdf"});
   setGenerated(file);onPrepared?.(file);
   setMessage("Completed PDF created. Inspect the output before HR submission. Drawn marks do not independently verify identity or consent.");
  }catch(error){if(generation.current===attempt)setMessage(error instanceof Error?error.message:"PDF could not be saved.");}
  finally{if(generation.current===attempt){saving.current=false;setBusy(false);}}
 };
 const download=()=>{
  if(!generated)return;
  const url=URL.createObjectURL(generated);
  const a=document.createElement("a");a.href=url;a.download=generated.name;
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 return <section className="prototype-panel" aria-label="Edit uploaded PDF">
  <h3>PDF editor</h3>
  <p className="prototype-note">Editing {source.name}. Existing fillable fields are detected automatically. Use page coordinates for scanned or non-fillable forms.</p>
  {message&&<p role="status">{message}</p>}
  {!info||readySource!==source?<p role="status">Reading PDF fields…</p>:<>
   <p className="prototype-small">{info.pages.length} page{info.pages.length===1?"":"s"} · {info.fields.length} detected form fields</p>
   {sourceUrl&&<iframe title="Original PDF preview" src={sourceUrl} style={{width:"100%",height:380,border:"1px solid #cbd5e1"}}/>}
   <form onSubmit={event=>void save(event)}>
    <fieldset disabled={busy||disabled} style={{border:0,padding:0,margin:0,minWidth:0}}>
    {info.fields.length>0&&<div>
     <h4>Detected fillable fields</h4>
     <div className="prototype-controls">
      {info.fields.map(field=><label key={field.name}>
       {field.name} <small>({field.suggestedKind} · {field.suggestedRole})</small>
       {field.type==="Checkbox"?
        <input type="checkbox" checked={(values[field.name]??field.initialValue)===true}
          onChange={event=>updateValue(field,event.target.checked)}/>:
        (field.type==="Dropdown"||field.type==="Radio"||field.type==="List")?
        <select value={typeof values[field.name]==="string"?String(values[field.name]):""}
          onChange={event=>updateValue(field,event.target.value||undefined)}>
         <option value="">Keep original{field.selectedValues?.length?" ("+field.selectedValues.join(", ")+")":field.initialValue?" ("+String(field.initialValue)+")":""}</option>
         {field.options.map(value=><option key={value}>{value}</option>)}
        </select>:field.type==="Text"?
        <input value={String(values[field.name]??field.initialValue??"")}
          onChange={event=>updateValue(field,event.target.value)}
          placeholder={field.suggestedKind}/>:<span>Position manually if needed</span>}
      </label>)}
     </div>
    </div>}
    <h4>Place a field or drawn mark</h4>
    <p className="prototype-note">PDF coordinates are points from the bottom-left of each page. Check the rendered output before archiving.</p>
    <div className="prototype-controls">
     <label>Kind<select value={kind} onChange={e=>setKind(e.target.value as PdfOverlay["kind"])}>
      <option>Text</option><option>Date</option><option>Initials</option><option>Signature</option>
     </select></label>
     <label>Page<select value={page} onChange={e=>setPage(e.target.value)}>
      {info.pages.map(p=><option value={p.page} key={p.page}>{p.page} · {p.width.toFixed(0)}×{p.height.toFixed(0)} pt</option>)}
     </select></label>
     <label>X <input type="number" value={x} onChange={e=>setX(e.target.value)}/></label>
     <label>Y <input type="number" value={y} onChange={e=>setY(e.target.value)}/></label>
     <label>Width <input type="number" value={width} onChange={e=>setWidth(e.target.value)}/></label>
     <label>Height <input type="number" value={height} onChange={e=>setHeight(e.target.value)}/></label>
    </div>
    <label><input type="checkbox" checked={drawn} onChange={e=>{hasInk.current=false;drawing.current=false;setDrawn(e.target.checked);}}/> Draw initials or signature instead of typing</label>
    {drawn?<div>
     <canvas ref={canvas} width={320} height={100} onPointerDown={draw}
      onPointerMove={draw} onPointerUp={draw} onPointerCancel={draw}
      style={{touchAction:"none",width:320,maxWidth:"100%",height:100,border:"1px solid #94a3b8",background:"#fff"}}/>
     <button type="button" onClick={()=>{canvas.current?.getContext("2d")?.clearRect(0,0,320,100);hasInk.current=false;}}>Clear drawing</button>
    </div>:<label>Visible text <input value={manualText} onChange={e=>setManualText(e.target.value)} placeholder="Type the value to place"/></label>}
    <button type="button" onClick={addOverlay}>Add to PDF</button>
    {overlays.length>0&&<div><h4>Placed entries</h4>
     {overlays.map((overlay,index)=><p key={index}>{index+1}. {overlay.kind} · page {overlay.page} · ({overlay.x}, {overlay.y})
      <button type="button" onClick={()=>{setOverlays(list=>list.filter((_,i)=>i!==index));invalidate();}}>Remove</button></p>)}
    </div>}
    <p><label><input type="checkbox" checked={flatten} onChange={e=>{setFlatten(e.target.checked);invalidate();}}/> Flatten filled form fields into output</label></p>
    <button type="submit" disabled={busy||disabled||!hasHrPdfChanges(values,overlays)}>{busy?"Creating PDF…":"Create completed PDF"}</button>
    </fieldset>
   </form>
   {generated&&<button type="button" onClick={download}>Download {generated.name}</button>}
  </>}
 </section>;
}
