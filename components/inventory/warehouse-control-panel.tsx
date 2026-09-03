"use client";

import { AlertTriangle, Download, PackageSearch, ShieldAlert, Warehouse } from "lucide-react";
import { holdNodeId, inventoryProductStatuses, LOW_STOCK_MANAGER_APPROVAL_THRESHOLD_CASES, nodeLotBalance, reservedQuantity, warehouseAvailable, WAREHOUSE_REORDER_THRESHOLD_CASES, warehouseNodeId } from "../../lib/inventory-ledger";
import { useInventoryLedger } from "../../lib/inventory-ledger-context";
import { useWorkspace } from "../../lib/workspace-context";
import { Button, Section, StatusPill } from "../ui";

function downloadCsv(filename:string,rows:string[][]){
  const csv=rows.map((row)=>row.map((value)=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}

export function WarehouseControlPanel(){
  const { data,currentUser }=useWorkspace();
  const { ledger }=useInventoryLedger();
  if(!currentUser||!["Administrator","Operations","Warehouse"].includes(currentUser.role))return null;
  const statuses=inventoryProductStatuses(ledger,data);
  const urgent=statuses.filter((item)=>item.requiresManagerApproval);
  const reorder=statuses.filter((item)=>item.reorderNeeded);
  const companyNodeTypes=new Set(["Warehouse","Bin","Vehicle","Employee custody","Quality hold"]);
  const exportInventory=()=>downloadCsv(`momentum-inventory-${new Date().toISOString().slice(0,10)}.csv`,[
    ["Product","Lot","Company custody","Warehouse custody","Quality hold","Reserved","Warehouse available","Status","Best by"],
    ...data.inventory.map((lot)=>{
      const companyCustody=ledger.nodes.filter((node)=>companyNodeTypes.has(node.type)).reduce((sum,node)=>sum+nodeLotBalance(ledger,node.id,lot.id),0);
      return [lot.product,lot.lotCode,String(companyCustody),String(nodeLotBalance(ledger,warehouseNodeId,lot.id)),String(nodeLotBalance(ledger,holdNodeId,lot.id)),String(reservedQuantity(ledger,lot.id)),String(lot.status==="Quality hold"?0:warehouseAvailable(ledger,lot.id)),lot.status,lot.bestBy];
    }),
  ]);
  return <div className="warehouse-control-panel">
    <Section title="Warehouse stock controls" action={<Button size="sm" variant="secondary" icon={<Download size={14}/>} onClick={exportInventory}>Export inventory</Button>}>
      <div className="warehouse-thresholds"><div><ShieldAlert size={18}/><span>Manager approval threshold</span><strong>&lt; {LOW_STOCK_MANAGER_APPROVAL_THRESHOLD_CASES} available cases</strong></div><div><PackageSearch size={18}/><span>Reorder threshold</span><strong>&lt; {WAREHOUSE_REORDER_THRESHOLD_CASES} available cases</strong></div><div><Warehouse size={18}/><span>Quantity source</span><strong>Custody ledger</strong></div></div>
      <div className="warehouse-product-grid">{statuses.map((item)=><article key={item.product} className={item.requiresManagerApproval?"is-critical":item.reorderNeeded?"is-reorder":""}><div><strong>{item.product}</strong><span>{item.available} available sellable cases</span></div><div className="request-actions">{item.requiresManagerApproval&&<StatusPill tone="danger">Manager approval to sell</StatusPill>}{item.reorderNeeded&&<StatusPill tone="warning">Reorder</StatusPill>}{!item.reorderNeeded&&<StatusPill tone="success">Stock OK</StatusPill>}</div></article>)}</div>
      {(urgent.length>0||reorder.length>0)&&<div className="warehouse-alert-summary"><AlertTriangle size={18}/><div><strong>{reorder.length} product{reorder.length===1?"":"s"} below reorder level</strong><span>{urgent.length} also below the sales approval threshold.</span></div></div>}
    </Section>
  </div>;
}
