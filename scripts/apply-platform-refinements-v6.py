from pathlib import Path
import runpy

ROOT=Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT/"scripts"/"apply-platform-refinements-v5.py"),run_name="__main__")

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text();count=text.count(old)
    if count!=1:raise SystemExit(f"V6 PATCH FAILED {path}: {count} matches for {old[:140]!r}")
    p.write_text(text.replace(old,new,1));print(f"v6 patched {path}")

def append_once(path,marker,addition):
    p=ROOT/path;text=p.read_text()
    if marker in text:return
    p.write_text(text.rstrip()+"\n\n"+addition.rstrip()+"\n");print(f"v6 patched {path}")

# Keep the operations tools lint-clean.
replace_once("components/pages/operations-tools.tsx",'import { BookOpen, Clock3, MapPin, PackageSearch, Plus, Store, UserCheck } from "lucide-react";','import { BookOpen, Clock3, MapPin, PackageSearch, Store, UserCheck } from "lucide-react";')
replace_once("components/pages/operations-tools.tsx",'import { FormEvent, useMemo, useState } from "react";','import { FormEvent, useState } from "react";')

# Avoid effect-driven form state in the directory. The form is keyed to the selected employee and reads
# submitted values directly, so switching employees cannot carry Mia/Flo/another employee's phone/title across.
replace_once("components/hcm/employee-directory.tsx",'import { useEffect, useMemo, useState } from "react";','import { useMemo, useState } from "react";')
replace_once("components/hcm/employee-directory.tsx",'''  const [editPhone,setEditPhone]=useState("");const [editTitle,setEditTitle]=useState("");const [editMessage,setEditMessage]=useState("");''','''  const [editMessage,setEditMessage]=useState("");''')
replace_once("components/hcm/employee-directory.tsx",'''  const selected = employees.find((user) => user.id === selectedId) ?? employees[0];
  useEffect(()=>{if(!selected)return;setEditPhone(selected.phone??"");setEditTitle(selected.title);setEditMessage("");},[selected?.id,selected?.phone,selected?.title]);
  if (!currentUser || !selected) return null;''','''  const selected = employees.find((user) => user.id === selectedId) ?? employees[0];
  if (!currentUser || !selected) return null;''')
old='''{currentUser.role==="Administrator"&&firebase&&<Section title="Edit directory profile" description="Updates the shared employee directory, not payroll or private HR."><div className="form-grid"><Field label="Title"><input value={editTitle} placeholder={selected.title} onChange={e=>setEditTitle(e.target.value)}/></Field><Field label="Work phone"><input value={editPhone} placeholder={selected.phone??"602-555-0000"} onChange={e=>setEditPhone(e.target.value)}/></Field><div className="field--full"><Button size="sm" onClick={async()=>{const result=await firebase.updateUserAccess(selected.id,{title:editTitle.trim()||selected.title,phone:editPhone.trim()});setEditMessage(result.ok?"Directory profile updated.":result.message??"Update failed.")}}>Save directory profile</Button>{editMessage&&<p>{editMessage}</p>}</div></div></Section>}'''
new='''{currentUser.role==="Administrator"&&firebase&&<Section title="Edit directory profile" description="Updates the shared employee directory, not payroll or private HR."><form key={selected.id} className="form-grid" onSubmit={async(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const result=await firebase.updateUserAccess(selected.id,{title:String(form.get("title")||selected.title).trim()||selected.title,phone:String(form.get("phone")||"").trim()});setEditMessage(result.ok?"Directory profile updated.":result.message??"Update failed.")}}><Field label="Title"><input name="title" defaultValue={selected.title}/></Field><Field label="Work phone"><input name="phone" defaultValue={selected.phone??""} placeholder="602-555-0000"/></Field><div className="field--full"><Button type="submit" size="sm">Save directory profile</Button>{editMessage&&<p>{editMessage}</p>}</div></form></Section>}'''
replace_once("components/hcm/employee-directory.tsx",old,new)

# Canonicalize live inventory product names while preserving lot identity/counts. Historical PO quantities are
# never used. Existing shorthand records become the approved case SKU names during normal hydration.
replace_once("lib/workspace-normalization.ts",'import { normalizeUsername } from "./username";','import { normalizeUsername } from "./username";\nimport { canonicalProductDescription } from "./product-catalog";')
replace_once("lib/workspace-normalization.ts",'''product: text(value.product), receivedAt:''','''product: canonicalProductDescription(text(value.product)), receivedAt:''')
replace_once("lib/commercial-state.ts",'import { normalizeStoredOrderLines } from "./order-lines";','import { normalizeStoredOrderLines } from "./order-lines";\nimport { canonicalProductDescription } from "./product-catalog";')
replace_once("lib/commercial-state.ts",'''return [{ id, lotCode, product: text(raw.product), receivedAt:''','''return [{ id, lotCode, product: canonicalProductDescription(text(raw.product)), receivedAt:''')

# Multi-SKU inventory evidence must survive reload. Legacy aliases are equivalent to canonical SKU names.
replace_once("lib/inventory-ledger.ts",'''if(!lot||movement.product!==lot.product)return false;''','''if(!lot||!productsEquivalent(movement.product,lot.product))return false;''')
replace_once("lib/inventory-ledger.ts",'''if(!order||!lot||order.product&&order.product!==lot.product||!positiveFiniteQuantity(reservation.quantity)||reservation.quantity>order.cases||!reservationStatuses.has(reservation.status)||!reservation.createdBy||!validTimestamp(reservation.createdAt))continue;''','''if(!order||!lot||!orderAcceptsProduct(order,lot.product)||!positiveFiniteQuantity(reservation.quantity)||reservation.quantity>order.cases||!reservationStatuses.has(reservation.status)||!reservation.createdBy||!validTimestamp(reservation.createdAt))continue;''')

# When the source record itself names the worker, use that fact for audit attribution. Never infer an unrelated
# logged-in viewer. We only treat userId as actor on record types where userId is explicitly the worker/author.
replace_once("lib/audit-engine.ts",'''  const payload = after?.payload ?? before?.payload;
  if (!payload) return undefined;''','''  const snapshot=after??before;const payload = snapshot?.payload;
  if (!payload||!snapshot) return undefined;
  if ((snapshot.module==="CRM"&&snapshot.collection==="interactions")||(snapshot.module==="Workspace"&&snapshot.collection==="activities")) { const worker=text(payload.userId); if(worker)return worker; }''')

# Regression: a multi-SKU reservation is valid after ledger normalization and aliases remain SKU-equivalent.
append_once("tests/platform-workflows-v3.test.ts","multi-SKU reservations survive inventory ledger normalization",'''import { createInventoryLedgerSeed, normalizeInventoryLedger, warehouseNodeId } from "../lib/inventory-ledger";

test("multi-SKU reservations survive inventory ledger normalization",()=>{
  const original="0.25L (8.4oz) Golden Eagle Energy Drink (24pack)";const sugar="0.25L (8.4oz) Golden Eagle SugarFree (24pack)";
  const data:WorkspaceData={users:[{id:"u",name:"User",firstName:"User",email:"u@test.local",initials:"U",title:"Admin",role:"Administrator",team:"Leadership",accent:"#000"}],customers:[],accounts:[],activities:[],appointments:[],orders:[multi],placements:[],inventory:[{id:"lot-o",lotCode:"O",product:original,receivedAt:"2026-09-01",bestBy:"2027-09-01",onHand:100,reserved:0,available:100,status:"Available",location:"Warehouse"},{id:"lot-s",lotCode:"S",product:sugar,receivedAt:"2026-09-01",bestBy:"2027-09-01",onHand:100,reserved:0,available:100,status:"Available",location:"Warehouse"}],approvals:[],timeEntries:[],timecards:[],notifications:[],bulletins:[],territories:[]};
  const seed=createInventoryLedgerSeed(data);const state={...seed,reservations:[{id:"r1",orderId:"o",lotId:"lot-o",quantity:12,status:"Active" as const,createdAt:"2026-09-23T10:00:00.000Z",createdBy:"u"},{id:"r2",orderId:"o",lotId:"lot-s",quantity:5,status:"Active" as const,createdAt:"2026-09-23T10:00:00.000Z",createdBy:"u"}]};
  const normalized=normalizeInventoryLedger(state,data);assert.equal(normalized.reservations.length,2);assert.equal(normalized.nodes.some((node)=>node.id===warehouseNodeId),true);
});''')

print("PASS: platform refinements v6 applied")
