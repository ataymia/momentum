"use client";

import { MapPinned, Pencil, Plus, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { canManageUser } from "../../lib/access";
import { accountTerritoryState, normalizePostalCode, territoryAccounts, territoryForPostalCode } from "../../lib/territory-engine";
import type { SalesTerritory, TerritoryStatus } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Field, Modal, Section, StatusPill } from "../ui";

const blank={name:"",ownerId:"",postalCodes:"",status:"Draft" as TerritoryStatus,notes:""};
const tone=(status:TerritoryStatus)=>status==="Active"?"success" as const:status==="Suspended"?"warning" as const:"neutral" as const;

export function TerritoryPanel(){
  const {data,scope,currentUser,saveTerritory}=useWorkspace();
  const [open,setOpen]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [form,setForm]=useState(blank);
  const [message,setMessage]=useState("");
  if(!currentUser||!["Administrator","Sales Manager","Sales Representative"].includes(currentUser.role))return null;

  const manager=currentUser.role==="Administrator"||currentUser.role==="Sales Manager";
  const reps=data.users.filter((user)=>user.role==="Sales Representative"&&(currentUser.role==="Administrator"||canManageUser(data,currentUser,user.id,true)));
  const visibleTerritories=(data.territories??[]).filter((territory)=>currentUser.role==="Administrator"||territory.ownerId===currentUser.id||(currentUser.role==="Sales Manager"&&(territory.createdBy===currentUser.id||Boolean(territory.ownerId&&canManageUser(data,currentUser,territory.ownerId,true)))));
  const active=visibleTerritories.filter((territory)=>territory.status==="Active");
  const unresolved=scope.accounts.filter((account)=>accountTerritoryState(data,account)!=="Owned");
  const missingZip=unresolved.filter((account)=>!normalizePostalCode(account.postalCode)).length;
  const uncovered=unresolved.filter((account)=>normalizePostalCode(account.postalCode)&&!territoryForPostalCode(data,account.postalCode)).length;

  const beginCreate=()=>{setEditingId(null);setForm({...blank,ownerId:reps[0]?.id??""});setMessage("");setOpen(true)};
  const beginEdit=(territory:SalesTerritory)=>{setEditingId(territory.id);setForm({name:territory.name,ownerId:territory.ownerId??"",postalCodes:territory.postalCodes.join(", "),status:territory.status,notes:territory.notes??""});setMessage("");setOpen(true)};
  const submit=(event:FormEvent)=>{event.preventDefault();const postalCodes=form.postalCodes.split(/[\s,;]+/).map((value)=>value.trim()).filter(Boolean);const result=saveTerritory({id:editingId??undefined,name:form.name,ownerId:form.ownerId||undefined,postalCodes,status:form.status,notes:form.notes});if(!result.ok){setMessage(result.message??"Territory could not be saved.");return}setOpen(false);setMessage("")};

  return <>
    <div className="company-rule-facts">
      <div><span>Active territories</span><strong>{active.length}</strong></div>
      <div><span>Accounts needing coverage</span><strong>{unresolved.length}</strong><small>{missingZip} missing ZIP · {uncovered} outside active coverage</small></div>
      <div><span>Boundary rule</span><strong>No shared ZIPs</strong><small>Active territories cannot overlap</small></div>
      <div><span>Account ownership</span><strong>Inherited</strong><small>Active ZIP determines responsible rep</small></div>
    </div>
    <Section title="Sales territories" description="Active ZIP coverage cannot overlap. Accounts inherit the sales representative assigned to their ZIP." action={manager?<Button size="sm" variant="gold" icon={<Plus size={15}/>} onClick={beginCreate}>New territory</Button>:undefined}>
      <div className="company-request-list">
        {visibleTerritories.map((territory)=>{const owner=data.users.find((user)=>user.id===territory.ownerId);const accounts=territoryAccounts(data,territory.id);return <article key={territory.id}>
          <div><small>{territory.postalCodes.length?territory.postalCodes.join(", "):"No ZIP coverage yet"}</small><strong>{territory.name}</strong><p>{owner?.name??"Unassigned"} · {accounts.length} account{accounts.length===1?"":"s"}</p></div>
          <StatusPill tone={tone(territory.status)}>{territory.status}</StatusPill>
          {manager&&<Button size="sm" variant="ghost" icon={<Pencil size={14}/>} onClick={()=>beginEdit(territory)}>Edit</Button>}
        </article>})}
        {visibleTerritories.length===0&&<div className="review-empty"><MapPinned size={24}/><p>{manager?"No sales territories have been configured yet.":"No territory is assigned to you yet."}</p></div>}
      </div>
      {unresolved.length>0&&manager?<div className="payroll-control-alert"><ShieldCheck size={18}/><div><strong>{unresolved.length} account{unresolved.length===1?"":"s"} need territory resolution</strong><p>Add a valid ZIP or activate coverage before routing those accounts to a sales representative.</p></div></div>:null}
    </Section>

    <Modal open={open} title={editingId?"Edit territory":"Create territory"} description="Draft territories may be planned freely. Active territories must have one sales representative, at least one ZIP, and no overlap with another active territory." onClose={()=>setOpen(false)} footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="territory-form">Save territory</Button></>}>
      <form id="territory-form" className="form-grid" onSubmit={submit}>
        {message&&<div className="form-callout field--full"><p>{message}</p></div>}
        <Field label="Territory name"><input required value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Phoenix North"/></Field>
        <Field label="Sales representative"><select value={form.ownerId} onChange={(event)=>setForm({...form,ownerId:event.target.value})}><option value="">Unassigned</option>{reps.map((user)=><option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
        <Field label="Status"><select value={form.status} onChange={(event)=>setForm({...form,status:event.target.value as TerritoryStatus})}><option>Draft</option><option>Active</option><option>Suspended</option></select></Field>
        <Field label="ZIP coverage" className="field--full" hint="Separate ZIP codes with commas or spaces. ZIP+4 is normalized to the first five digits."><textarea rows={4} value={form.postalCodes} onChange={(event)=>setForm({...form,postalCodes:event.target.value})} placeholder="85016, 85018, 85028"/></Field>
        <Field label="Internal note" className="field--full"><textarea rows={3} value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})}/></Field>
      </form>
    </Modal>
  </>;
}
