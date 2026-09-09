"use client";

import { Download, FileDown, FileUp, ShieldCheck, Upload, XCircle } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { appendAudit } from "../../lib/hcm-engine";
import { parseAccountImport, parseAppointmentImport, parseCsv, parseInventoryImport, parseOrderImport, parseShiftImport, rowsToCsv, type CsvRow } from "../../lib/csv-data-exchange";
import { useHcm } from "../../lib/hcm-context";
import type { InventoryLot } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Section, StatusPill } from "../ui";

type DatasetKey = "accounts"|"inventory"|"appointments"|"orders"|"placements"|"employees"|"shifts"|"timeEntries"|"timecards";
type DatasetDefinition={key:DatasetKey;label:string;description:string;importMode:"create"|"update"|"existing"|"blocked";template:string[]};
const datasets:DatasetDefinition[]=[
  {key:"accounts",label:"Customer locations / accounts",description:"Bulk-create CRM locations through the same account creation rules used by the interface.",importMode:"create",template:["name","location","channel","contactName","contactRole","phone","email","customerName","locationName","streetAddress"]},
  {key:"inventory",label:"Inventory lots",description:"Bulk-create lot master records. Custody receipts are then normalized into the inventory ledger.",importMode:"create",template:["lotCode","product","receivedAt","bestBy","onHand","reserved","status","location","holdReason"]},
  {key:"appointments",label:"Appointments",description:"Bulk-create scheduled work. Account and assignee IDs must already exist.",importMode:"create",template:["accountId","ownerId","date","startTime","duration","type","priority","arrivalWindow","objective","tags"]},
  {key:"orders",label:"Orders",description:"Bulk-create orders through Momentum pricing and approval logic. This does not import fake payment settlement.",importMode:"create",template:["accountId","cases","pricePerCase","product"]},
  {key:"placements",label:"Placement observations",description:"Bulk-update existing placement observations by placement ID. Unknown IDs are rejected rather than silently creating records.",importMode:"existing",template:["id","observedStock","facings","cold","shelfPrice"]},
  {key:"employees",label:"Employee employment profiles",description:"Bulk-update existing employee HR profile fields. User identities must already exist and are never created by CSV.",importMode:"existing",template:["userId","jobTitle","department","location","managerId","classification","payGroup","standardWeeklyHours","status"]},
  {key:"shifts",label:"Employee shifts",description:"Bulk-create scheduled shifts for existing employee IDs.",importMode:"create",template:["userId","date","startTime","endTime","role","location","status","note"]},
  {key:"timeEntries",label:"Time entries",description:"Exportable for payroll and audit. Raw CSV import is blocked because punches must be created or corrected through timekeeping controls.",importMode:"blocked",template:[]},
  {key:"timecards",label:"Timecards",description:"Exportable for payroll review. Raw CSV import is blocked because submission and approval history must remain auditable.",importMode:"blocked",template:[]},
];
const download=(content:string,name:string)=>{const blob=new Blob([content],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);};
const booleanValue=(value:string)=>["true","1","yes","y"].includes(value.trim().toLowerCase());

export function DataExchangeCenter(){
  const workspace=useWorkspace();const{data,currentUser,createAccount,createAppointment,createOrder,updatePlacement,correctTimeEntry,importInventoryLots}=workspace;void correctTimeEntry;
  const{hcm,setHcm}=useHcm();
  const[selected,setSelected]=useState<DatasetKey>("accounts");const[fileName,setFileName]=useState("");const[rawRows,setRawRows]=useState<CsvRow[]>([]);const[parseErrors,setParseErrors]=useState<string[]>([]);const[notice,setNotice]=useState("");const inputRef=useRef<HTMLInputElement|null>(null);
  const definition=datasets.find((item)=>item.key===selected)!;
  const exportRows=useMemo(()=>{
    if(selected==="accounts")return data.accounts as unknown as Record<string,unknown>[];
    if(selected==="inventory")return data.inventory as unknown as Record<string,unknown>[];
    if(selected==="appointments")return data.appointments as unknown as Record<string,unknown>[];
    if(selected==="orders")return data.orders as unknown as Record<string,unknown>[];
    if(selected==="placements")return data.placements as unknown as Record<string,unknown>[];
    if(selected==="employees")return hcm.employees as unknown as Record<string,unknown>[];
    if(selected==="shifts")return hcm.shifts as unknown as Record<string,unknown>[];
    if(selected==="timeEntries")return data.timeEntries as unknown as Record<string,unknown>[];
    return data.timecards as unknown as Record<string,unknown>[];
  },[data,hcm.employees,hcm.shifts,selected]);
  if(currentUser?.role!=="Administrator")return null;

  const resetUpload=()=>{setFileName("");setRawRows([]);setParseErrors([]);if(inputRef.current)inputRef.current.value="";};
  const selectDataset=(key:DatasetKey)=>{setSelected(key);setNotice("");resetUpload();};
  const exportCsv=()=>download(rowsToCsv(exportRows),`momentum-${selected}-export.csv`);
  const templateCsv=()=>{if(!definition.template.length)return;download(`${definition.template.map((header)=>`"${header}"`).join(",")}\n`, `momentum-${selected}-import-template.csv`);};
  const loadFile=async(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(!file)return;setNotice("");setFileName(file.name);const result=parseCsv(await file.text());setRawRows(result.rows);setParseErrors(result.errors);};

  const commitImport=()=>{
    setNotice("");const errors=[...parseErrors];let imported=0;
    if(definition.importMode==="blocked"){setNotice("This ledger does not allow raw CSV writes. Use its controlled workflow so approvals and audit history remain intact.");return;}
    if(!rawRows.length){setNotice("Choose a CSV file with at least one data row first.");return;}
    if(selected==="accounts"){
      const parsed=parseAccountImport(rawRows);errors.push(...parsed.errors);if(!errors.length)for(const record of parsed.records)if(createAccount(record))imported+=1;
    } else if(selected==="inventory"){
      const parsed=parseInventoryImport(rawRows);errors.push(...parsed.errors);if(!errors.length)imported=importInventoryLots(parsed.records as InventoryLot[]);
    } else if(selected==="appointments"){
      const parsed=parseAppointmentImport(rawRows);errors.push(...parsed.errors);if(!errors.length){for(const record of parsed.records){if(!data.accounts.some((account)=>account.id===record.accountId)){errors.push(`Unknown accountId ${record.accountId}.`);continue;}if(record.ownerId&&!data.users.some((user)=>user.id===record.ownerId&&user.role!=="Customer")){errors.push(`Unknown or invalid ownerId ${record.ownerId}.`);continue;}if(createAppointment(record))imported+=1;}}
    } else if(selected==="orders"){
      const parsed=parseOrderImport(rawRows);errors.push(...parsed.errors);if(!errors.length){for(const record of parsed.records){if(!data.accounts.some((account)=>account.id===record.accountId)){errors.push(`Unknown accountId ${record.accountId}.`);continue;}if(createOrder(record))imported+=1;}}
    } else if(selected==="placements"){
      const seen=new Set<string>();for(const [index,row] of rawRows.entries()){const rowNumber=index+2;const placement=data.placements.find((item)=>item.id===row.id);if(!row.id||!placement){errors.push(`Row ${rowNumber}: placement id must match an existing record.`);continue;}if(seen.has(row.id)){errors.push(`Row ${rowNumber}: duplicate placement id ${row.id}.`);continue;}seen.add(row.id);const stock=Number(row.observedStock),facings=Number(row.facings),price=Number(row.shelfPrice);if(!Number.isFinite(stock)||stock<0||!Number.isFinite(facings)||facings<0||!Number.isFinite(price)||price<0){errors.push(`Row ${rowNumber}: observedStock, facings, and shelfPrice must be non-negative numbers.`);continue;}updatePlacement(row.id,stock,facings,booleanValue(row.cold),price);imported+=1;}
    } else if(selected==="employees"){
      const allowedStatuses=new Set(["Prehire","Active","Leave","Separated"]);const allowedClassifications=new Set(["Hourly","Salary","Contractor","Not configured"]);const updates=new Map<string,CsvRow>();for(const[index,row]of rawRows.entries()){const rowNumber=index+2;if(!row.userId||!data.users.some((user)=>user.id===row.userId&&user.role!=="Customer")){errors.push(`Row ${rowNumber}: userId must match an existing employee.`);continue;}if(updates.has(row.userId)){errors.push(`Row ${rowNumber}: duplicate userId ${row.userId}.`);continue;}if(row.status&&!allowedStatuses.has(row.status)){errors.push(`Row ${rowNumber}: employment status is invalid.`);continue;}if(row.classification&&!allowedClassifications.has(row.classification)){errors.push(`Row ${rowNumber}: classification is invalid.`);continue;}if(row.standardWeeklyHours&&(!Number.isFinite(Number(row.standardWeeklyHours))||Number(row.standardWeeklyHours)<0)){errors.push(`Row ${rowNumber}: standardWeeklyHours is invalid.`);continue;}if(row.managerId&&!data.users.some((user)=>user.id===row.managerId)){errors.push(`Row ${rowNumber}: managerId does not match an existing user.`);continue;}updates.set(row.userId,row);}if(!errors.length){const at=new Date().toISOString();setHcm((state)=>{const next={...state,employees:state.employees.map((record)=>{const row=updates.get(record.userId);if(!row)return record;return{...record,jobTitle:row.jobTitle||record.jobTitle,department:row.department||record.department,location:row.location||record.location,managerId:row.managerId||undefined,classification:(row.classification||record.classification) as typeof record.classification,payGroup:row.payGroup||record.payGroup,standardWeeklyHours:row.standardWeeklyHours?Number(row.standardWeeklyHours):record.standardWeeklyHours,status:(row.status||record.status) as typeof record.status,updatedAt:at};})};return appendAudit(next,{actorId:currentUser.id,action:"Employee profiles bulk imported",entityType:"EmploymentRecord",entityId:`bulk-${Date.now()}`,reason:`${updates.size} existing employee profiles updated from CSV.`});});imported=updates.size;}
    } else if(selected==="shifts"){
      const parsed=parseShiftImport(rawRows);errors.push(...parsed.errors);if(!errors.length){const valid=parsed.records.filter((record,index)=>{if(!record.userId||!data.users.some((user)=>user.id===record.userId&&user.role!=="Customer")){errors.push(`Row ${index+2}: userId must match an existing employee.`);return false;}return true;});if(!errors.length){const at=new Date().toISOString();const rows=valid.map((record,index)=>({...record,id:`shift-import-${Date.now()}-${index}`,createdBy:currentUser.id,createdAt:at}));setHcm((state)=>appendAudit({...state,shifts:[...rows,...state.shifts]}, {actorId:currentUser.id,action:"Shifts bulk imported",entityType:"Shift",entityId:`bulk-${Date.now()}`,reason:`${rows.length} shifts created from CSV.`}));imported=rows.length;}}
    }
    if(errors.length){setParseErrors([...new Set(errors)]);setNotice("Import stopped before committing because validation found errors. Fix the CSV and try again.");return;}
    setNotice(`${imported} ${definition.label.toLowerCase()} record${imported===1?"":"s"} imported through controlled source workflows.`);resetUpload();
  };

  return <Section title="Bulk data exchange" description="Export operational lists to CSV and import large batches through validation and source-record controls. Raw writes to approval-sensitive ledgers stay blocked." className="data-exchange-center" action={<StatusPill tone="info">Administrator</StatusPill>}>
    <div className="data-exchange-grid"><aside>{datasets.map((item)=><button key={item.key} className={selected===item.key?"is-active":""} onClick={()=>selectDataset(item.key)}><span>{item.label}</span><small>{item.importMode==="blocked"?"Export only":item.importMode==="existing"?"Import existing records":"Import + export"}</small></button>)}</aside><div className="data-exchange-main"><div className="data-exchange-title"><div><strong>{definition.label}</strong><p>{definition.description}</p></div><StatusPill tone={definition.importMode==="blocked"?"warning":"success"}>{exportRows.length} records</StatusPill></div><div className="data-exchange-actions"><Button variant="secondary" icon={<Download size={15}/>} onClick={exportCsv}>Export CSV</Button>{definition.template.length>0&&<Button variant="ghost" icon={<FileDown size={15}/>} onClick={templateCsv}>Download import template</Button>}</div>{definition.importMode!=="blocked"?<div className="data-import-box"><label><FileUp size={22}/><span><strong>{fileName||"Choose CSV to validate"}</strong><small>No records are written until validation passes and you confirm import.</small></span><input ref={inputRef} type="file" accept=".csv,text/csv" onChange={loadFile}/></label>{rawRows.length>0&&<div className="data-import-summary"><span>{rawRows.length} data rows loaded</span><span>{parseErrors.length} validation signal{parseErrors.length===1?"":"s"}</span></div>}{parseErrors.length>0&&<div className="data-import-errors"><XCircle size={17}/><div>{parseErrors.slice(0,10).map((error)=><p key={error}>{error}</p>)}{parseErrors.length>10&&<p>+ {parseErrors.length-10} more errors</p>}</div></div>}<div className="data-import-controls"><Button variant="ghost" onClick={resetUpload} disabled={!fileName}>Clear file</Button><Button icon={<Upload size={15}/>} onClick={commitImport} disabled={!rawRows.length||parseErrors.length>0}>Validate & import</Button></div></div>:<div className="data-import-blocked"><ShieldCheck size={20}/><div><strong>Controlled ledger</strong><p>CSV export is available, but import is intentionally routed through the module workflow rather than allowing a spreadsheet to bypass approvals, correction history, or audit evidence.</p></div></div>}{notice&&<div className="data-exchange-notice"><ShieldCheck size={16}/><p>{notice}</p></div>}</div></div>
  </Section>;
}
