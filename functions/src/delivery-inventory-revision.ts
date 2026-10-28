import type {CorrectionLine} from "./delivery-correction-policy";

type Row=Record<string,unknown>;
export type InventoryCorrectionRow={
  lotId:string;product:string;quantity:number;
  fromNodeId:string;toNodeId:string;evidenceReference:string;
};
export type CorrectionMovement={
  lotId:string;product:string;quantity:number;
  type:"Return"|"Delivery";fromNodeId:string;toNodeId:string;
};
export type InventoryPlan={ok:true;movements:CorrectionMovement[]}|{ok:false;message:string};
const valid=(value:string)=>Boolean(value.trim());
const net=(rows:CorrectionLine[])=>{
  const totals=new Map<string,number>();
  for(const item of rows)totals.set(item.product,(totals.get(item.product)||0)+item.cases);
  return totals;
};
const orderLotCustody=(movements:Row[],orderId:string,nodeId:string,lotId:string)=>
  movements.filter(m=>m.lotId===lotId&&m.relatedOrderId===orderId)
    .reduce((qty,m)=>{
      const amount=typeof m.quantity==="number"&&Number.isFinite(m.quantity)?m.quantity:0;
      return qty+(m.toNodeId===nodeId?amount:0)-(m.fromNodeId===nodeId?amount:0);
    },0);
const stock=(movements:Row[],nodeId:string,lotId:string)=>
  movements.filter(m=>m.lotId===lotId).reduce((qty,m)=>{
    const value=typeof m.quantity==="number"?m.quantity:0;
    return qty+(m.toNodeId===nodeId?value:0)-(m.fromNodeId===nodeId?value:0);
  },0);

/** Reconcile physical returned or newly delivered cases by SKU and lot.
 * Decreases go to quality hold, never straight to sellable stock.
 * A caller must additionally verify proof of actual physical custody.
 */
export function planDeliveredInventoryCorrection(input:{
  accountId:string;orderId:string;original:CorrectionLine[];proposed:CorrectionLine[];
  adjustments:InventoryCorrectionRow[];
  lots:Row[];nodes:Row[];movements:Row[];reservations:Row[];
}):InventoryPlan{
  const customerNode="node-account-"+input.accountId;
  const holdNode="node-quality-hold";
  if(!input.nodes.some(n=>n.id===customerNode))
    return{ok:false,message:"Customer custody node missing."};
  const before=net(input.original),after=net(input.proposed);
  const products=new Set([...before.keys(),...after.keys()]);
  const expected=new Map([...products].map(p=>[p,(after.get(p)||0)-(before.get(p)||0)]));
  const tally=new Map<string,number>();
  const prepared:CorrectionMovement[]=[];
  const balances=new Map<string,number>();
  const orderBalances=new Map<string,number>();
  if(input.adjustments.length>60)
    return{ok:false,message:"Too many inventory corrections."};
  for(const adjustment of input.adjustments){
    const delta=expected.get(adjustment.product);
    if(!delta||!Number.isInteger(adjustment.quantity)||adjustment.quantity<=0||
      !valid(adjustment.lotId)||adjustment.evidenceReference.trim().length<8)
      return{ok:false,message:"Match exact SKU/lot quantities to physical evidence."};
    const lot=input.lots.find(l=>l.id===adjustment.lotId&&l.product===adjustment.product);
    if(!lot)return{ok:false,message:"Inventory lot does not match the corrected SKU."};
    const decrease=delta<0;
    if(!decrease&&["Quality hold","Damaged","Expired","Disposed"].includes(String(lot.status||"")))
      return{ok:false,message:"Restricted inventory cannot be used for additional delivery."};
    const type:CorrectionMovement["type"]=decrease?"Return":"Delivery";
    if(decrease&&(adjustment.fromNodeId!==customerNode||adjustment.toNodeId!==holdNode))
      return{ok:false,message:"Removed deliveries must be returned from customer custody to quality hold."};
    if(!decrease&&(adjustment.toNodeId!==customerNode||!["Warehouse","Employee custody","Vehicle"].includes(String(input.nodes.find(n=>n.id===adjustment.fromNodeId)?.type||""))))
      return{ok:false,message:"Additional deliveries must come from a verified company custody node."};
    if(!input.nodes.some(n=>n.id===adjustment.toNodeId))
      return{ok:false,message:"Correction inventory destination does not exist."};
    if(decrease&&input.nodes.find(n=>n.id===holdNode)?.type!=="Quality hold")
      return{ok:false,message:"Quality hold destination is not a verified hold location."};
    if(!decrease&&input.nodes.find(n=>n.id===customerNode)?.type!=="Customer")
      return{ok:false,message:"The destination must be the customer's recorded custody."};
    const k=adjustment.fromNodeId+"|"+adjustment.lotId;
    const available=balances.has(k)?balances.get(k)!:stock(input.movements,adjustment.fromNodeId,adjustment.lotId);
    const sourceType=String(input.nodes.find(n=>n.id===adjustment.fromNodeId)?.type||"");
    const reservedOther=sourceType==="Warehouse"?
      input.reservations.filter(r=>r.status==="Active"&&r.lotId===adjustment.lotId&&
        r.orderId!==input.orderId).reduce((q,r)=>q+
        (typeof r.quantity==="number"?r.quantity:0),0):0;
    if(available-reservedOther<adjustment.quantity)
      return{ok:false,message:"Insufficient unreserved physical lot custody for correction."};
    // A customer may hold multiple orders' cases of the same lot. A correction
    // must never return a different order's units or another driver's custody.
    if(decrease||sourceType!=="Warehouse"){
      const orderKey=k+"|"+input.orderId;
      const attributable=orderBalances.has(orderKey)?orderBalances.get(orderKey)!:
        orderLotCustody(input.movements,input.orderId,adjustment.fromNodeId,adjustment.lotId);
      if(attributable<adjustment.quantity)
        return{ok:false,message:"Exact order-linked lot custody is missing for this correction."};
      orderBalances.set(orderKey,attributable-adjustment.quantity);
    }
    balances.set(k,available-adjustment.quantity);
    tally.set(adjustment.product,(tally.get(adjustment.product)||0)+adjustment.quantity);
    prepared.push({...adjustment,type});
  }
  for(const [product,delta] of expected){
    if((tally.get(product)||0)!==Math.abs(delta))
      return{ok:false,message:"SKU adjustment totals do not match the order's before/after quantities."};
  }
  return{ok:true,movements:prepared};
}
