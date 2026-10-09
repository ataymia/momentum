"use client";

import { Store, UserCheck, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { canClaimUnassignedProspect } from "../../lib/access";
import { useCrm } from "../../lib/crm-context";
import { GOLDEN_EAGLE_SKUS } from "../../lib/product-catalog";
import {
  matchQuickVisitAccount,
  normalizeQuickVisitSamples,
  quickVisitBusinessLabel,
  quickVisitLocationId,
  quickVisitSuggestions,
  type QuickVisitSampleRow,
} from "../../lib/quick-visit";
import { personalVisitHistory, prospectRatingColor, weeklySalesManagementSummary, weeklyVisitSummary } from "../../lib/sales-field-engine";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, PageHeader, Section, StatusPill, formatDate, formatMoney } from "../ui";

type SampleEditorRow=QuickVisitSampleRow&{id:string};
const newSampleRow=():SampleEditorRow=>({id:`sample-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,product:"",quantity:1});

export function QuickVisitPage(){
  const{data,scope,currentUser,claimUnassignedProspect}=useWorkspace();
  const{crm,addInteraction}=useCrm();
  const[business,setBusiness]=useState("");
  const[accountId,setAccountId]=useState("");
  const[rating,setRating]=useState(5);
  const[unsuccessful,setUnsuccessful]=useState(false);
  const[note,setNote]=useState("Visited business location");
  const[samples,setSamples]=useState<SampleEditorRow[]>([newSampleRow()]);
  const[message,setMessage]=useState("");
  const[visitLimit,setVisitLimit]=useState(25);
  if(!currentUser)return null;

  const exactMatch=scope.accounts.find((account)=>account.id===accountId)??matchQuickVisitAccount(scope.accounts,business);
  const suggestions=business.trim()&&!exactMatch?quickVisitSuggestions(scope.accounts,business):[];
  const chooseBusiness=(account:(typeof scope.accounts)[number])=>{setBusiness(quickVisitBusinessLabel(account));setAccountId(account.id);setMessage("");};
  const changeBusiness=(value:string)=>{setBusiness(value);const match=matchQuickVisitAccount(scope.accounts,value);setAccountId(match?.id??"");setMessage("");};
  const updateSample=(id:string,patch:Partial<QuickVisitSampleRow>)=>setSamples((rows)=>rows.map((row)=>row.id===id?{...row,...patch}:row));
  const removeSample=(id:string)=>setSamples((rows)=>rows.length===1?[newSampleRow()]:rows.filter((row)=>row.id!==id));

  const submit=(event:FormEvent)=>{
    event.preventDefault();
    const businessName=business.trim();
    if(!businessName){setMessage("Enter the business you physically visited.");return;}
    const linked=scope.accounts.find((account)=>account.id===accountId)??matchQuickVisitAccount(scope.accounts,businessName);
    const locationId=linked?.id??quickVisitLocationId(businessName);
    const summary=note.trim()||"Physical business visit";
    const visitId=addInteraction({
      locationId,
      type:"Visit",
      summary:linked?summary:`${summary} · ${businessName}`,
      physicalVisit:true,
      prospectRating:rating,
      visitUnsuccessful:unsuccessful,
      quickVisitBusinessName:businessName,
    });
    if(!visitId){setMessage("Visit was not saved. Review the business and fields before leaving this screen.");return;}

    const sampleRows=normalizeQuickVisitSamples(samples);
    let sampleFailures=0;
    for(const sample of sampleRows){
      const sampleId=addInteraction({
        locationId,
        type:"Sample",
        summary:`Sample given: ${sample.quantity} can${sample.quantity===1?"":"s"} · ${sample.product}${linked?"":` · ${businessName}`}`,
        sampleProduct:sample.product,
        sampleQuantity:sample.quantity,
        sampleInventoryLinked:false,
        sampleUnit:"can",
        quickVisitBusinessName:businessName,
      });
      if(!sampleId)sampleFailures++;
    }
    const totalCans=sampleRows.reduce((sum,row)=>sum+row.quantity,0);
    setMessage(sampleFailures
      ?`Visit saved, but ${sampleFailures} sample line${sampleFailures===1?"":"s"} did not save. Do not leave this screen until the sample log is corrected.`
      :`Visit saved${linked?" and matched to the existing business":" without creating an account or prospect"}.${totalCans?` ${totalCans} sample can${totalCans===1?"":"s"} logged across ${sampleRows.length} product${sampleRows.length===1?"":"s"}.`:""} This physical stop counts toward the weekly visit total.`);
    setSamples([newSampleRow()]);
    setNote("Visited business location");
    setUnsuccessful(false);
    setRating(5);
  };

  const summaries=data.users.filter((user)=>user.role==="Sales Representative").map((user)=>({user,summary:weeklySalesManagementSummary(data,crm.interactions,user.id)}));
  const myVisits=personalVisitHistory(crm.interactions,currentUser.id);
  const myWeek=weeklyVisitSummary(crm.interactions,currentUser.id);
  const myVisitLabel=(visit:(typeof myVisits)[number])=>{
    const linked=scope.accounts.find((item)=>item.id===visit.locationId);
    const freehand=(visit as typeof visit&{quickVisitBusinessName?:string}).quickVisitBusinessName;
    return linked?.locationName??linked?.name??freehand??visit.summary.split(" · ").at(-1)??"Business visit";
  };

  return <div className="page">
    <PageHeader eyebrow="CRM & sales" title="Quick Visit" description="Log the physical stop first. Match an existing business when one appears, or type a new business without creating an account or prospect."/>
    <Section title="Log physical visit" description="A physical stop counts as a visit even when you are turned away or never reach a decision-maker.">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Business visited" className="field--full">
          <input value={business} onChange={(event)=>changeBusiness(event.target.value)} placeholder="Start typing a business name..." autoComplete="off"/>
          {exactMatch?<small>Matched existing record: {quickVisitBusinessLabel(exactMatch)}{!exactMatch.ownerId?" · Unassigned":""}. Existing history will be reused.</small>:business.trim()?<small>Freehand visit. Saving this will not create an account or prospect.</small>:<small>Type freely. Existing Momentum businesses will appear as suggestions while you type.</small>}
          {suggestions.length>0&&<div style={{display:"grid",gap:6,marginTop:8}} aria-label="Matching businesses">
            {suggestions.map((account)=><button key={account.id} type="button" onClick={()=>chooseBusiness(account)} style={{textAlign:"left",padding:"9px 11px",border:"1px solid var(--border)",borderRadius:10,background:"var(--surface, #fff)",cursor:"pointer"}}>
              <strong>{account.locationName??account.name}</strong><span style={{display:"block",fontSize:12,opacity:.72}}>{account.streetAddress??account.location}{!account.ownerId?" · Unassigned":""}</span>
            </button>)}
          </div>}
        </Field>
        <Field label="Prospect score 1–10">
          <input type="number" min="1" max="10" step="1" value={rating} onChange={(event)=>setRating(Number(event.target.value))}/>
          <span style={{display:"inline-block",width:"100%",height:8,borderRadius:99,background:prospectRatingColor(rating)}}/>
        </Field>
        <Field label="Unsuccessful visit">
          <select value={unsuccessful?"yes":"no"} onChange={(event)=>setUnsuccessful(event.target.value==="yes")}><option value="no">No</option><option value="yes">Yes</option></select>
        </Field>
        <Field label="Visit note" className="field--full"><input value={note} onChange={(event)=>setNote(event.target.value)}/></Field>

        <div className="field--full" style={{display:"grid",gap:10}}>
          <div><strong>Samples given</strong><p style={{margin:"4px 0 0",fontSize:13,opacity:.72}}>Optional. Log each Golden Eagle product and the number of cans used. This records field usage only and does not deduct sellable inventory because sampling stock is already staged separately.</p></div>
          {samples.map((row,index)=><div key={row.id} style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(90px,1fr) auto",gap:8,alignItems:"end"}}>
            <Field label={`Sample ${index+1}`}><select value={row.product} onChange={(event)=>updateSample(row.id,{product:event.target.value})}><option value="">No sample</option>{GOLDEN_EAGLE_SKUS.map((sku)=><option key={sku.id} value={sku.description}>{sku.shortName}</option>)}</select></Field>
            <Field label="Cans"><input type="number" min="1" step="1" value={row.quantity} disabled={!row.product} onChange={(event)=>updateSample(row.id,{quantity:Number(event.target.value)})}/></Field>
            <button type="button" aria-label={`Remove sample ${index+1}`} onClick={()=>removeSample(row.id)} style={{height:40,width:40,border:"1px solid var(--border)",borderRadius:10,background:"transparent",cursor:"pointer"}}><X size={16}/></button>
          </div>)}
          <div><Button type="button" variant="secondary" size="sm" onClick={()=>setSamples((rows)=>[...rows,newSampleRow()])}>Add another sample</Button></div>
        </div>

        {message&&<p className="form-notice field--full">{message}</p>}
        <div className="field--full" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Button type="submit">Save visit</Button>
          {exactMatch&&canClaimUnassignedProspect(currentUser,exactMatch)&&<Button type="button" variant="secondary" icon={<UserCheck size={15}/>} onClick={()=>{if(claimUnassignedProspect(exactMatch.id))setMessage("Prospect claimed. Existing history was retained.")}}>Claim this unassigned prospect</Button>}
        </div>
      </form>
    </Section>
    <Section title="My visits" action={<StatusPill tone="neutral">{myWeek.completed} this week · {myVisits.length} total</StatusPill>}>
      <div className="company-request-list">
        {myVisits.slice(0,visitLimit).map((visit)=><article key={visit.id}>
          <span><Store size={17}/></span>
          <div>
            <strong>{myVisitLabel(visit)}</strong>
            <small>{formatDate(visit.occurredAt,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</small>
            <p>{visit.summary}</p>
          </div>
          <StatusPill tone={visit.visitUnsuccessful?"warning":"neutral"}>{visit.visitUnsuccessful?"Unsuccessful":`Score ${visit.prospectRating??"—"}/10`}</StatusPill>
        </article>)}
        {myVisits.length===0&&<div className="review-empty"><p>No visits recorded yet.</p></div>}
      </div>
      {visitLimit<myVisits.length&&<Button type="button" size="sm" variant="secondary" onClick={()=>setVisitLimit((limit)=>limit+25)}>Show more visits</Button>}
    </Section>
    {["Administrator","Sales Manager"].includes(currentUser.role)&&<Section title="Weekly sales management" description="Actual CRM, order and account records only. Visit target: 75–80 per full week. Freehand Quick Visits count because the rep physically visited the business.">
      <div className="company-request-list">{summaries.map(({user,summary})=><article key={user.id}><span><Store size={17}/></span><div><strong>{user.name}</strong><p>{summary.visits} visits · {summary.orders} orders / {summary.orderCases} cases / {formatMoney(summary.orderValue)} · {summary.reorders} reorders · {summary.newAccounts} new accounts · {summary.promisingProspects} promising prospects · {summary.followUpsDue} follow-ups due · {summary.blockers} blockers</p></div><StatusPill tone={summary.visits>=75?"success":summary.visits>=50?"warning":"neutral"}>{summary.visits}/75</StatusPill></article>)}</div>
    </Section>}
  </div>;
}
