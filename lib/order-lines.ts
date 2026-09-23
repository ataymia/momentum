import { canonicalProductDescription, skuForProductName } from "./product-catalog";
import type { InventoryLot, Order, OrderLine } from "./types";

const validPositiveInteger=(value:unknown)=>Number.isInteger(value)&&Number(value)>0;
const validMoney=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>0;
export const productKey=(value:string)=>canonicalProductDescription(value).trim().toLowerCase();
export const productsEquivalent=(left:string,right:string)=>productKey(left)===productKey(right);
export const canonicalOrderProduct=(value:string)=>canonicalProductDescription(value);

export function normalizeStoredOrderLines(value:unknown):OrderLine[]|undefined{
  if(!Array.isArray(value))return undefined;
  const seen=new Set<string>();const lines:OrderLine[]=[];
  for(const raw of value){
    if(!raw||typeof raw!=="object")continue;
    const item=raw as Partial<OrderLine>;const product=typeof item.product==="string"?canonicalOrderProduct(item.product):"";
    if(!item.id||seen.has(item.id)||!product||!validPositiveInteger(item.cases)||!validMoney(item.pricePerCase))continue;
    const amount=Number(item.cases)*Number(item.pricePerCase);
    if(!Number.isFinite(item.amount)||Math.abs(Number(item.amount)-amount)>0.01)continue;
    seen.add(item.id);lines.push({id:item.id,product,cases:Number(item.cases),pricePerCase:Number(item.pricePerCase),amount,inventoryAvailableAtOrder:typeof item.inventoryAvailableAtOrder==="number"&&Number.isFinite(item.inventoryAvailableAtOrder)&&item.inventoryAvailableAtOrder>=0?item.inventoryAvailableAtOrder:undefined,sourcePlacementId:typeof item.sourcePlacementId==="string"&&item.sourcePlacementId.trim()?item.sourcePlacementId.trim():undefined,lowStockApprovalRequired:item.lowStockApprovalRequired===true||undefined});
  }
  return lines.length?lines:undefined;
}

export function orderLinesFor(order:Order):OrderLine[]{
  const stored=normalizeStoredOrderLines(order.lines);if(stored?.length)return stored;
  return [{id:`${order.id}-line-1`,product:canonicalOrderProduct(order.product??"Golden Eagle"),cases:order.cases,pricePerCase:order.pricePerCase,amount:order.amount,inventoryAvailableAtOrder:order.inventoryAvailableAtOrder,sourcePlacementId:order.sourcePlacementId,lowStockApprovalRequired:order.lowStockApprovalRequired}];
}
export function orderAcceptsProduct(order:Order,product:string){return orderLinesFor(order).some((line)=>productsEquivalent(line.product,product));}
export function orderCasesForProduct(order:Order,product:string){return orderLinesFor(order).filter((line)=>productsEquivalent(line.product,product)).reduce((sum,line)=>sum+line.cases,0);}
export function orderProductLabel(order:Order){const lines=orderLinesFor(order);return lines.length===1?lines[0].product:`${lines.length} products`;}
export function matchingInventoryLots(lots:InventoryLot[],product:string){return lots.filter((lot)=>productsEquivalent(lot.product,product));}
export function catalogSkuKnown(value:string){return Boolean(skuForProductName(value));}
